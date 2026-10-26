import { NextResponse } from 'next/server';
import { ikeFetch, ikeToken } from '@/lib/ike';
import { ikeWrite, sameSite } from '@/lib/ike-write';

// 保留（あとで決める）の画面の読み口・書き口（10-25 shoya「いけドンにあったのは全部いれて」）。
//   ・name ごとに今の社内システムの行き先をここで決め打ち（画面から行き先は選べない）。値は1つずつ形を確かめてから渡す
//   ・読む（GET）は今のシステムの GET のうち DB を読むだけのもの。freee を呼ぶ口（ping / sync）は通さない
//     例外：アクセス元IP（access-log）は開くと今のシステムが IP の組織名の控え（ip_org_cache）を書く＝今の画面を開いたときと同じ
//   ・書く（POST）は lib/ike-write.ts の ikeWrite だけ。権限は今のシステムが判定（403 ならそのまま返す＝画面は何も出さない）
//   ・鍵は持たない（アイパスの中身は今のシステムが復号して返すのを、そのまま画面に渡すだけ。控えもしない）

type Q = URLSearchParams;
const YM = /^\d{4}-\d{2}$/, YMD = /^\d{4}-\d{2}-\d{2}$/, DIGITS = /^\d{1,20}$/, UUID = /^[0-9a-f-]{36}$/i;
const enc = encodeURIComponent;
const txt = (v: unknown, max = 200) => String(v ?? '').trim().slice(0, max);
const opt = (sp: Q, k: string, re: RegExp) => { const v = sp.get(k) || ''; return v && re.test(v) ? `&${k}=${enc(v)}` : ''; };
const like = (sp: Q, k: string) => { const v = txt(sp.get(k), 60); return v ? `&${k}=${enc(v)}` : ''; };

const READS: Record<string, (sp: Q) => string | null> = {
  // 経理ツール
  'freee-list': (sp) => YM.test(sp.get('ym') || '') ? `/api/freee-invoices?action=list&ym=${sp.get('ym')}${opt(sp, 'company_id', DIGITS)}` : null,
  'freee-summary': (sp) => YM.test(sp.get('ym') || '') ? `/api/freee-invoices?action=summary&ym=${sp.get('ym')}${opt(sp, 'company_id', DIGITS)}` : null,
  'freee-lines': (sp) => DIGITS.test(sp.get('company_id') || '') && DIGITS.test(sp.get('invoice_id') || '') ? `/api/freee-invoices?action=lines&company_id=${sp.get('company_id')}&invoice_id=${sp.get('invoice_id')}` : null,
  'freee-partners': (sp) => `/api/freee-invoices?action=partners${opt(sp, 'company_id', DIGITS)}`,
  'keiyaku-options': () => '/api/keiyaku-houkoku?action=options',
  'keiyaku-people': (sp) => `/api/keiyaku-houkoku?action=people&q=${enc(txt(sp.get('q'), 40))}`,
  // 契約報告の MNM 登録（読むだけ：状態・会社/事業部・取引先の検索。MNM_DRY_RUN は今のシステムの環境変数が決める）
  'keiyaku-mnm-status': (sp) => `/api/keiyaku-houkoku?action=mnm-status&name=${enc(txt(sp.get('name'), 60))}`,
  'keiyaku-mnm-masters': () => '/api/keiyaku-houkoku?action=mnm-masters',
  'keiyaku-mnm-partners': (sp) => `/api/keiyaku-houkoku?action=mnm-partners&keyword=${enc(txt(sp.get('keyword'), 60))}`,
  'arari-people': (sp) => `/api/arari-sim?action=people&q=${enc(txt(sp.get('q'), 40))}`,
  'arari-history': () => '/api/arari-sim?action=history',
  // たまげたポン（管理は今のページ権限 bikkura-admin、承認は承認者だけ＝今のシステムが判定）
  'bikkura-approvals': () => '/api/bikkura?action=approvals',
  'bikkura-dashboard': (sp) => `/api/bikkura?action=dashboard${opt(sp, 'from', YMD)}${opt(sp, 'to', YMD)}${opt(sp, 'mode', /^(std|manual)$/)}${like(sp, 'role')}`,
  'bikkura-draws': () => '/api/bikkura?action=admin_draws',
  'bikkura-settings': (sp) => `/api/bikkura?action=settings${like(sp, 'role')}`,
  'bikkura-users': () => '/api/bikkura?action=users',
  // 貸付・アイパス（今のシステムの特別な判定 requireKashitsuke / requireIppass）
  kashitsuke: (sp) => `/api/kashitsuke${sp.get('deleted') === '1' ? '?deleted=1' : ''}`,
  ippass: (sp) => `/api/ippass${sp.get('deleted') === '1' ? '?deleted=1' : ''}`,
  // 管理
  'page-access': () => '/api/page-access?action=matrix',
  'ops-log': (sp) => `/api/ops-log?action=list${opt(sp, 'date', YMD)}${like(sp, 'actor')}${like(sp, 'act')}${like(sp, 'target')}${sp.get('ng') === '1' ? '&ng=1' : ''}`,
  'access-log': (sp) => { const d = Math.max(1, Math.min(365, Number(sp.get('days')) || 30)); return `/api/access-log?days=${d}`; },
  'cp-tree': () => '/api/custom-pages?action=tree',
  'cp-page': (sp) => UUID.test(sp.get('id') || '') ? `/api/custom-pages?action=page&id=${sp.get('id')}` : null,
  // 共有の相手（編集できる人だけ今のシステムが返す）・共有先に選べる社内の人
  'cp-shares': (sp) => UUID.test(sp.get('id') || '') ? `/api/custom-pages?action=shares&type=${sp.get('type') === 'folder' ? 'folder' : 'page'}&id=${sp.get('id')}` : null,
  'cp-users': () => '/api/custom-pages?action=users',
  calendar: () => '/api/chat?action=calendarSettings',
  'settings-history': () => '/api/settings?action=history&limit=200',
  // 設定センターの初期表示（区分の権限・項目・今の値・承認待ち）。開くと今のシステムが期限切れの承認待ちを取り下げる＝今の画面を開いたときと同じ
  'settings-center': () => '/api/settings?action=center',
};

async function relay(target: string): Promise<NextResponse> {
  try {
    const r = await ikeFetch(target, undefined, 30000);
    const j = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (r.status === 401) return NextResponse.json({ error: 'ログインが切れました。もう一度ログインしてください' }, { status: 401 });
    if (r.status === 403) return NextResponse.json({ error: 'forbidden', hint: typeof j.hint === 'string' ? j.hint : '' }, { status: 403 });
    return NextResponse.json(j, { status: r.status, headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return NextResponse.json({ error: `今の社内システムから読めませんでした（${(e as Error).message}）` }, { status: 502 });
  }
}

export async function GET(req: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  const build = READS[name];
  if (!build) return NextResponse.json({ error: 'この読み口は通していません' }, { status: 404 });
  if (!(await ikeToken())) return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
  const target = build(new URL(req.url).searchParams);
  if (!target) return NextResponse.json({ error: '指定が正しくありません' }, { status: 400 });
  return relay(target);
}

// ---- 書く ----------------------------------------------------------------------------
type B = Record<string, unknown>;
type W = { target: string; body: B } | { error: string };
const int = (v: unknown) => { const n = Number(v); return Number.isInteger(n) ? n : NaN; };
const bool = (v: unknown) => v === true;
const pickStr = (b: B, keys: string[], max = 2000): B => {
  const o: B = {};
  for (const k of keys) if (b[k] !== undefined && b[k] !== null) o[k] = txt(b[k], max);
  return o;
};
// 健康の情報らしい列は ver2 では出さない（カスタムページの結果から落とす）
const HEALTH = /健康|持病|通院|服薬|既往|病歴|病気|疾患|障害|障がい|メンタル|health|disease|medical/i;

const KASHI_ACTIONS = new Set(['add', 'update', 'delete', 'restore', 'schedule', 'rep-add', 'rep-update', 'rep-delete', 'pay', 'unpay']);
const IPPASS_ACTIONS = new Set(['reveal', 'add', 'update', 'delete', 'restore']);
const BIKKURA_NUM_KEYS = ['miles_per_draw', 'daily_mile_cap', 'manual_daily_cap', 'gold_rate', 'silver_rate', 'pity_after', 'pity_gold_rate', 'title_days',
  'weekly_gold_per_person', 'weekly_guarantee_draws', 'weekly_silver_per_person', 'weekly_silver_guarantee_draws', 'daily_silver_per_person', 'daily_draw_cap', 'hold_cap_draws'];

// 設定センターの値。保存先（storeKey）は今のシステムの決まった名前だけ、値は今のシステムがその保存先の形で確かめる
function settingsValue(b: B, action: 'preview' | 'item-save'): W {
  const storeKey = txt(b.storeKey, 40);
  if (!/^[a-z][a-z0-9_]{1,39}$/.test(storeKey)) return { error: '設定の指定が正しくありません' };
  if (b.value === undefined || JSON.stringify(b.value).length > 100_000) return { error: '値が正しくありません' };
  const body: B = { storeKey, value: b.value };
  if (action === 'item-save') body.expectedUpdatedAt = txt(b.expectedUpdatedAt, 40);
  return { target: `/api/settings?action=${action}`, body };
}

const WRITES: Record<string, (b: B) => W> = {
  'freee-map': (b) => {
    const company_id = txt(b.company_id, 20), partner_id = b.partner_id == null || b.partner_id === '' ? null : txt(b.partner_id, 20);
    if (!DIGITS.test(company_id) || (partner_id !== null && !DIGITS.test(partner_id))) return { error: '事業所・取引先の指定が正しくありません' };
    return { target: '/api/freee-invoices?action=map_upsert', body: { company_id, partner_id, joi_name: txt(b.joi_name, 120), partner_display_name: b.partner_display_name == null ? null : txt(b.partner_display_name, 255) } };
  },
  'keiyaku-build': (b) => {
    if (!txt(b.name, 60)) return { error: '要員を選んでください' };
    return { target: '/api/keiyaku-houkoku?action=build', body: { name: txt(b.name, 60), kind: txt(b.kind, 20), koyou: txt(b.koyou, 20), shienhi: bool(b.shienhi), text: String(b.text ?? '').slice(0, 20000) } };
  },
  // MNM に ① 案件確定 ② 稼働追加 を送る・送り直す（今の keiyaku-houkoku の mnm-confirm / mnm-assign / mnm-resend）。
  //   ★試し送りか本番かは今のシステムの MNM_DRY_RUN（'false' のときだけ本番）。ここからは変えない・dry_run を渡さない
  'keiyaku-mnm': (b) => {
    const op = txt(b.op, 10);
    if (op === 'resend') { const id = txt(b.submission_id, 80); return /^[\w-]{1,80}$/.test(id) ? { target: '/api/keiyaku-houkoku?action=mnm-resend', body: { submission_id: id } } : { error: '送信IDが正しくありません' }; }
    const name = txt(b.name, 60), houkoku = txt(b.houkoku, 40);
    if (!name || !houkoku) return { error: '要員と報告区分がありません' };
    const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as B) : {});
    const strs = (o: B, max = 1000) => Object.fromEntries(Object.entries(o).filter(([, v]) => v == null || ['string', 'number', 'boolean'].includes(typeof v)).slice(0, 40).map(([k, v]) => [k.slice(0, 60), typeof v === 'string' ? v.slice(0, max) : v]));
    if (op === 'confirm') return { target: '/api/keiyaku-houkoku?action=mnm-confirm', body: { name, houkoku, onboarding: strs(obj(b.onboarding)) } };
    if (op === 'assign') {
      const fields = (Array.isArray(b.fields) ? b.fields : []).slice(0, 80).map((f) => ({ key: txt(obj(f).key, 60), value: String(obj(f).value ?? '').slice(0, 4000) })).filter((f) => f.key);
      const e = obj(b.extra);
      const partner = (v: unknown) => { const o = obj(v); return o.id == null ? null : { id: o.id, name: txt(o.name, 200) }; };
      const extra = { ...strs(e), client_partner: partner(e.client_partner), support_partner: partner(e.support_partner) };
      return { target: '/api/keiyaku-houkoku?action=mnm-assign', body: { name, houkoku, fields, extra } };
    }
    return { error: '操作の指定が違います' };
  },
  // カスタムページ（10-26）。作る・名前を変える・消す・並べ替え・共有。権限は今のシステムが見る（編集できる人・作った人/super_admin）
  'cp-folder': (b) => {
    const op = txt(b.op, 10), id = txt(b.id, 40);
    if (id && !UUID.test(id)) return { error: 'メニューが見つかりません' };
    if (op === 'delete') return id ? { target: '/api/custom-pages?action=folderDelete', body: { id } } : { error: 'メニューが見つかりません' };
    if (op !== 'save') return { error: '操作の指定が違います' };
    const title = txt(b.title, 80); if (!title) return { error: '名前を入れてください' };
    return { target: '/api/custom-pages?action=folderSave', body: { id, title, icon: txt(b.icon, 8), color: /^#[0-9a-fA-F]{6}$/.test(txt(b.color, 7)) ? txt(b.color, 7) : '' } };
  },
  'cp-page': (b) => {
    const op = txt(b.op, 10), id = txt(b.id, 40), folderId = txt(b.folderId, 40);
    if ((id && !UUID.test(id)) || (folderId && !UUID.test(folderId))) return { error: 'ページが見つかりません' };
    if (op === 'delete') return id ? { target: '/api/custom-pages?action=pageDelete', body: { id } } : { error: 'ページが見つかりません' };
    if (op !== 'save') return { error: '操作の指定が違います' };
    if (!id && !folderId) return { error: '親メニューを選んでください' };
    const title = txt(b.title, 120); if (!title) return { error: '名前を入れてください' };
    const doc = b.doc && typeof b.doc === 'object' && !Array.isArray(b.doc) ? b.doc : { blocks: [] };
    if (JSON.stringify(doc).length > 400_000) return { error: 'ページが大きすぎます' };
    const exp = txt(b.expectedUpdatedAt, 40);
    return { target: '/api/custom-pages?action=pageSave', body: { id, folderId, title, icon: txt(b.icon, 8), doc, ...(exp ? { expectedUpdatedAt: exp } : {}) } };
  },
  'cp-reorder': (b) => {
    const ids = (Array.isArray(b.ids) ? b.ids : []).map((v) => txt(v, 40));
    if (!ids.length || ids.length > 500 || !ids.every((v) => UUID.test(v))) return { error: '並べ替えの指定が違います' };
    return { target: '/api/custom-pages?action=reorder', body: { type: b.type === 'folder' ? 'folder' : 'page', ids } };
  },
  'cp-shares': (b) => {
    const id = txt(b.id, 40); if (!UUID.test(id)) return { error: '見つかりません' };
    const shares = (Array.isArray(b.shares) ? b.shares : []).slice(0, 300).map((v) => { const o = (v && typeof v === 'object' ? v : {}) as B; return { email: txt(o.email, 120).toLowerCase(), canEdit: bool(o.canEdit) }; })
      .filter((x) => x.email === '*' || /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/.test(x.email));
    return { target: '/api/custom-pages?action=sharesSet', body: { type: b.type === 'folder' ? 'folder' : 'page', id, shares } };
  },
  'arari-parse': (b) => ({ target: '/api/arari-sim?action=parse', body: { text: String(b.text ?? '').slice(0, 8000) } }),
  'arari-calc': (b) => {
    const ids = (Array.isArray(b.ids) ? b.ids : []).map((v) => txt(v, 40)).filter((v) => /^[\w-]{1,40}$/.test(v));
    if (!ids.length || ids.length > 15) return { error: '要員は1〜15名で選んでください' };
    const sales = b.sales === '' || b.sales == null ? null : Number(b.sales);
    if (sales !== null && !Number.isFinite(sales)) return { error: '売上は数字で入れてください' };
    return { target: '/api/arari-sim?action=calc', body: { text: String(b.text ?? '').slice(0, 8000), station: txt(b.station, 40), sales, ids } };
  },
  'bikkura-decide': (b) => {
    const id = int(b.id); if (!(id > 0)) return { error: '申請が見つかりません' };
    const approve = bool(b.approve), miles = int(b.miles);
    if (approve && !(miles >= 0 && miles <= 100)) return { error: 'マイルは0〜100の整数で' };
    return { target: '/api/bikkura?action=decide', body: { id, approve, miles: approve ? miles : null, reason: txt(b.reason, 200) } };
  },
  'bikkura-settings': (b) => {
    const s = (b.settings && typeof b.settings === 'object' ? b.settings : {}) as B;
    const settings: B = {};
    for (const k of BIKKURA_NUM_KEYS) { const n = Number(s[k]); if (s[k] === undefined || !Number.isFinite(n)) return { error: `「${k}」が数字ではありません` }; settings[k] = n; }
    if (s.kind_miles && typeof s.kind_miles === 'object') settings.kind_miles = s.kind_miles;
    return { target: '/api/bikkura?action=settings', body: { role: txt(b.role, 20), settings } };
  },
  'bikkura-fulfill': (b) => { const id = int(b.id); return id > 0 ? { target: '/api/bikkura?action=fulfill', body: { id } } : { error: '行が見つかりません' }; },
  'bikkura-grant': (b) => {
    const email = txt(b.email, 120).toLowerCase();
    if (!/^[^@\s]+@[^@\s]+$/.test(email)) return { error: '人が選ばれていません' };
    const body: B = { email };
    if (b.on !== undefined) body.on = bool(b.on);
    if (b.approver !== undefined) body.approver = bool(b.approver);
    if (b.jimu_role !== undefined) body.jimu_role = txt(b.jimu_role, 20);
    return { target: '/api/bikkura?action=grant', body };
  },
  kashitsuke: (b) => {
    const action = txt(b.action, 20);
    // 貼り付けの取り込み（今の action=import）。dry=true は読むだけ（下見）、false で取り込む（10-26）
    if (action === 'import') {
      const year = int(b.year);
      if (!(year >= 2020 && year <= 2100)) return { error: '年が正しくありません' };
      const text = String(b.text ?? '').slice(0, 200000);
      if (!text.trim()) return { error: '貼り付けた中身がありません' };
      return { target: '/api/kashitsuke', body: { action, text, year, rollYear: bool(b.rollYear), pastPaid: bool(b.pastPaid), dry: b.dry !== false } };
    }
    if (!KASHI_ACTIONS.has(action)) return { error: 'この操作は通していません' };
    const body: B = { action, ...pickStr(b, ['id', 'repId', 'kind', 'company', 'name', 'amount', 'contract', 'contract_url', 'lent_on', 'due_on', 'transfer', 'uriage_memo', 'status', 'memo', 'method', 'paid_on', 'paid_amount', 'firstDue', 'count', 'monthly', 'lastAmount']) };
    if (b.carry !== undefined) body.carry = bool(b.carry);
    if (b.replace !== undefined) body.replace = bool(b.replace);
    return { target: '/api/kashitsuke', body };
  },
  ippass: (b) => {
    const action = txt(b.action, 20);
    if (!IPPASS_ACTIONS.has(action)) return { error: 'この操作は通していません' };
    return { target: '/api/ippass', body: { action, ...pickStr(b, ['id', 'category', 'title', 'login_id', 'password', 'url', 'memo']) } };
  },
  'page-access-set': (b) => {
    const role = txt(b.role, 40), key = txt(b.key, 60);
    if (!/^[\w@-]+$/.test(role) || !/^[\w@-]+$/.test(key)) return { error: 'ロール・ページの指定が正しくありません' };
    return { target: '/api/page-access?action=set', body: { role, key, visible: b.visible === null ? null : bool(b.visible) } };
  },
  // 任意のロールを足す・名前を変える・消す（今の /api/page-access・super_admin だけ＝今のシステムが判定・10-26）
  'page-access-role': (b) => {
    const op = txt(b.op, 20), label = txt(b.label, 30).replace(/\s+/g, ' '), role = txt(b.role, 40), base = txt(b.base, 40);
    if (op === 'create') {
      if (!label) return { error: 'ロールの名前を入れてください' };
      if (!['admin', 'executive', 'sales_admin', 'staff_recruit'].includes(base)) return { error: '土台のロールを選んでください' };
      return { target: '/api/page-access?action=createRole', body: { label, base } };
    }
    if (!/^custom_[0-9a-f]{8}$/.test(role)) return { error: '足したロールだけ変えられます' };
    if (op === 'rename') return label ? { target: '/api/page-access?action=renameRole', body: { role, label } } : { error: 'ロールの名前を入れてください' };
    if (op === 'delete') return { target: '/api/page-access?action=deleteRole', body: { role } };
    return { error: '操作の指定が違います' };
  },
  // 設定センターの変更（今の /api/settings。区分×ロールの権限・承認つきかどうかは今のシステムが決める・10-26）
  //   preview … 保存する前の「何が変わる・影響」（書かない）／ save … 保存（承認つきの区分なら承認の依頼になる）
  //   pending … 承認待ちを承認・取り下げ／ revert … 変更履歴から元に戻す
  'settings-preview': (b) => settingsValue(b, 'preview'),
  'settings-save': (b) => settingsValue(b, 'item-save'),
  'settings-pending': (b) => {
    const id = int(b.id), op = txt(b.op, 10);
    if (!(id > 0)) return { error: '承認待ちが見つかりません' };
    if (op !== 'approve' && op !== 'withdraw') return { error: '操作の指定が違います' };
    return { target: `/api/settings?action=pending-${op}`, body: { id } };
  },
  'settings-revert': (b) => { const auditId = int(b.auditId); return auditId > 0 ? { target: '/api/settings?action=revert', body: { auditId } } : { error: '履歴が見つかりません' }; },
  'access-log-label': (b) => {
    const ip = txt(b.ip, 60);
    if (!/^[0-9a-f:.]+$/i.test(ip)) return { error: 'IP の形が正しくありません' };
    return { target: '/api/access-log', body: { ip, label: txt(b.label, 60) } };
  },
  'calendar-save': (b) => {
    const c = (b.calendar && typeof b.calendar === 'object' ? b.calendar : {}) as B;
    const organizers = (Array.isArray(c.organizers) ? c.organizers : []).slice(0, 30).map((o) => ({ label: txt((o as B).label, 60), calendarId: txt((o as B).calendarId, 120) })).filter((o) => o.calendarId);
    const guests = (Array.isArray(c.guests) ? c.guests : []).slice(0, 50).map((g) => txt(g, 120)).filter(Boolean);
    return { target: '/api/chat?action=saveCalendarSettings', body: { calendar: { organizerId: txt(c.organizerId, 120), organizers, guests, sendInvites: c.sendInvites !== false } } };
  },
};

export async function POST(req: Request, ctx: { params: Promise<{ name: string }> }) {
  const { name } = await ctx.params;
  const b = (await req.json().catch(() => ({}))) as B;
  // カスタムページの表を出す（書かない。保存ずみのブロックだけ・今のシステムが共有を判定）。健康の列は落とす
  if (name === 'cp-query') {
    if (!sameSite(req)) return NextResponse.json({ error: 'この画面の外からは呼べません' }, { status: 403 });
    if (!(await ikeToken())) return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
    const pageId = txt(b.pageId, 40), blockId = txt(b.blockId, 80);
    if (!UUID.test(pageId) || !blockId) return NextResponse.json({ error: 'ページ・ブロックの指定が正しくありません' }, { status: 400 });
    try {
      const r = await ikeFetch('/api/custom-pages?action=query', { method: 'POST', body: JSON.stringify({ pageId, blockId, filterValues: b.filterValues && typeof b.filterValues === 'object' ? b.filterValues : {} }) }, 30000);
      const j = (await r.json().catch(() => ({}))) as { ok?: boolean; columns?: Array<{ name: string; label: string; kind: string }>; rows?: B[]; truncated?: boolean; error?: string; sensitive?: boolean };
      if (!r.ok || !j.ok) return NextResponse.json({ error: j.sensitive ? 'このブロックは要配慮の情報を使うので出しません' : j.error || `読めませんでした（${r.status}）` }, { status: r.ok ? 200 : r.status });
      const cols = (j.columns || []).filter((c) => !HEALTH.test(`${c.name} ${c.label}`));
      const keep = new Set(cols.map((c) => c.name));
      const rows = (j.rows || []).map((row) => Object.fromEntries(Object.entries(row).filter(([k]) => keep.has(k))));
      return NextResponse.json({ ok: true, columns: cols, rows, truncated: !!j.truncated, dropped: (j.columns || []).length - cols.length });
    } catch (e) {
      return NextResponse.json({ error: `今の社内システムから読めませんでした（${(e as Error).message}）` }, { status: 502 });
    }
  }
  const build = WRITES[name];
  if (!build) return NextResponse.json({ error: 'この書き口は通していません' }, { status: 404 });
  const w = build(b);
  if ('error' in w) return NextResponse.json({ error: w.error }, { status: 400 });
  return ikeWrite(req, w.target, w.body, { timeoutMs: name === 'arari-calc' || name === 'keiyaku-build' || name === 'keiyaku-mnm' ? 58000 : 30000 });
}
export const maxDuration = 60;
