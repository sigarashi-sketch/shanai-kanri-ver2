import 'server-only';
import { db, ike, onIkeikeDb } from './db';
import { getRosterDataFromDb } from './ike/roster_read';
import { ikeJson } from './ikeike';
import { normName } from './name';
import { candidateStatus, stageKey } from './stages';
import { liverNorms } from './livers';
import { answeredTargets, isSurveyTarget, surveyMonthOf } from './survey';
import { bousanKeys } from './bousan';
import { photoUrls } from './photos';

// 従業員名簿の1行（いけどん本番の名簿＋採用版の部活を重ねたもの）。
//   key: 'n:<正規化氏名>'（従業員）/ 'p:<people.id>'（採用版だけに居る候補者）
export interface Member {
  key: string; kind: 'employee' | 'candidate';
  name: string; kana: string; status: string;
  // 候補者だけ: stage＝採用版で持つステージ（people.stage そのまま・詳細の選択肢はこちら）。
  //   画面に出す status は、ステージが「営業中」の間は いけどんのプロパーリストの状態に合わせる（candidateStatus）
  stage?: string; properStatus?: string;
  recruitTantou: string; salesTantou: string; company: string;
  nyusha: string; siteEki: string; homeEki: string;
  community: string; clubs: string[];
  start: string; end: string; tanka: string; lineGroup: string; provisional: boolean;
  gender: string; age: string; address: string; shikaku: string; caseSummary: string;
  // 採用LINE（それゆけ未経験につないだ後）の受信状況。lineIn＝その人から最後に届いた日時（''＝まだ届いていない）
  //   「LINEを1通送ってください」のお願いに誰が応えたかを名簿で見るため（2026-10-01）。紐付いていないLINEは誰のものか分からないので数えない
  lineIn: string; lineLinked: boolean;
  // 月次アンケート（いちばん新しい月分）にまだ答えていない 稼働中・待機 の人。チャットでオレンジに強調する（2026-10-02 shoya）
  surveyTodo?: boolean;
  // コミュニティのリーダーか（いけどんの roster_teams.leader_norm_name）。自動のタグ「リーダー」になる（lib/tags.ts）。状態は問わない（稼働中も待機も）
  leader?: boolean;
  // 手で付けたタグの名前（0016 tags / member_tags）。自動で付くタグと合わせた一覧は lib/tags.ts の tagsOf
  tags: string[];
  // ぼうさん＝接触禁止の印（それゆけ未経験だけ・手で付ける。lib/bousan.ts）。付いている人には リマインド・アンケートの文章・配信を送らない
  bousan?: boolean;
  // 顔写真の署名URL（いけどんと共通の roster_avatars・lib/photos.ts）。無ければ 頭文字の丸
  photo?: string;
}

// いけどんのプロパーリスト(sales_roster)に居て、まだ従業員名簿にも候補者にも居ない人（承諾直後・営業中など）。
//   チャットの紐付け先に使う。key は従業員と同じ 'n:<正規化氏名>'＝あとで名簿に載ってもつながりはそのまま。
//   from='ledger' … プロパーリストにも居ないが、稼働管理情報一覧（roster_entries）に名前がある人（未経験リスト外の社員・過去月だけに居る人）。
//     いけどんの名簿は「営業リストに居る人」しか載せないので、ここで拾わないと LINE の紐付け先に出てこない（2026-10-01 上村さんの件）
export interface ProperLite { key: string; name: string; kana: string; status: string; from: 'proper' | 'ledger' }
interface SalesRow { name: string | null; normalized_name?: string | null; applicant_id?: string | null; poa: boolean | null; jitai: boolean | null; sankaku_kettei: boolean | null; kadou_chu: boolean | null; eigyo_teishi: boolean | null; sai_assign: boolean | null }
// プロパーリストの1行の状態（2026-10-05 shoya）。
//   ・poa 列の呼び名は「営業止め」（旧称 ぽあ。いけどん側で最近この名前に変わった）＝営業中ではない
//   ・営業停止（eigyo_teishi）は 営業中として出してよい
//   ・再アサインが立っていれば 辞退・営業止め でも営業中に戻る（いけどん _sales.isExcluded と同じ）
function properStatus(s: SalesRow): string {
  if (!s.sai_assign) {
    if (s.jitai) return '辞退';
    if (s.poa) return '営業止め';
  }
  if (s.kadou_chu) return '稼働中';
  return s.sankaku_kettei && !s.sai_assign ? '参画決定' : '営業中';
}
// 同じ氏名で行が複数あるとき（辞退のあと再承諾など）は、生きている行の状態を出す
const PROPER_RANK: Record<string, number> = { 稼働中: 5, 参画決定: 4, 営業中: 3, 辞退: 1, 営業止め: 1 };

interface IkeRow {
  name: string; kana?: string; rep?: string; shozoku?: string; shozokuKadou?: string; start?: string; end?: string;
  tanka?: string; lineGroup?: string; provisional?: boolean; nyusha?: string; siteEki?: string; homeEki?: string;
  caseSummary?: string; info?: Record<string, string>;
}
interface StatusRow { normalized_name: string; taisha?: boolean; taiki?: boolean; status_override?: string | null }

// 状態の判定（いけどん roster-cols.js rosterStatus の簡易版。退場・再アサインの細かい判定は持たない）
const OVERRIDE_LABEL: Record<string, string> = { taisha: '退社', taiki: '待機', kadou: '稼働中', yotei: '入社予定', zaiseki: '在籍' };
function statusOf(r: IkeRow, s?: StatusRow): string {
  if (s?.taisha) return '退社';
  if (s?.status_override && OVERRIDE_LABEL[s.status_override]) return OVERRIDE_LABEL[s.status_override];
  if (s?.taiki) return '待機';
  if (r.provisional) return '入社予定';
  return '稼働中';
}

// 月次アンケートの直近の回答（いけどん public.monthly_survey_responses。何月分かは lib/survey.ts の区切りで決める）
async function surveyRecent(): Promise<{ name: string; submitted_at: string }[]> {
  const { data, error } = await ike().from('monthly_survey_responses').select('name, submitted_at').gte('submitted_at', new Date(Date.now() - 62 * 86400e3).toISOString()).limit(5000);
  if (error) throw new Error(error.message);
  return (data || []) as { name: string; submitted_at: string }[];
}

export async function loadMembers(): Promise<{ members: Member[]; proper: ProperLite[]; month: string; warnings: string[] }> {
  const warnings: string[] = [];
  const soft = <T,>(p: Promise<T>, what: string, fb: T) => p.catch((e) => { warnings.push(`${what}: ${(e as Error).message}`); return fb; });
  const [roster, status, overlay, teams, nyusha, eki, clubs, people, sales, livers, ledger, lineUsers, lineIns, survey, tagRows, bousan, photos] = await Promise.all([
    onIkeikeDb() ? fromDb.roster() : ikeJson<{ rows?: IkeRow[]; selected?: { name?: string } }>('/api/proxy?action=getRosterData', { timeoutMs: 55000 }),
    soft(onIkeikeDb() ? fromDb.status() : ikeJson<StatusRow[]>('/api/proxy?action=getRosterStatus'), '退社/待機', [] as StatusRow[]),
    soft(onIkeikeDb() ? fromDb.tantou() : ikeJson<{ overlay?: Record<string, { tantou?: string }> }>('/api/roster?op=extra&action=salesOverlay'), '採用担当', { overlay: {} }),
    soft(onIkeikeDb() ? fromDb.teams() : ikeJson<{ teams?: { name: string; leader_norm_name?: string | null; members: { norm_name: string }[] }[] }>('/api/teams?action=list'), 'コミュニティ', { teams: [] }),
    soft(onIkeikeDb() ? fromDb.nyusha() : ikeJson<{ overlay?: Record<string, { nyushaBi?: string }> }>('/api/roster?op=nyusha&action=list'), '入社日', { overlay: {} }),
    soft(onIkeikeDb() ? fromDb.eki() : ikeJson<{ overlay?: Record<string, { siteEki?: string; homeEki?: string }> }>('/api/roster?op=eki&action=list'), '最寄駅', { overlay: {} }),
    db().from('member_clubs').select('subject_key, clubs(name)'),
    db().from('people').select('*').order('created_at', { ascending: false }),
    soft(onIkeikeDb() ? all<SalesRow>('sales_roster', 'name, normalized_name, applicant_id, poa, jitai, sankaku_kettei, kadou_chu, eigyo_teishi, sai_assign') : Promise.resolve([] as SalesRow[]), 'プロパーリスト', [] as SalesRow[]),
    liverNorms(),   // ライバーは対象外（名簿・候補者・紐付け先のどれにも出さない）
    soft(onIkeikeDb() ? all<{ name: string | null; year_month: string | null }>('roster_entries', 'name, year_month') : Promise.resolve([]), '稼働管理情報一覧', [] as { name: string | null; year_month: string | null }[]),
    db().from('line_users').select('user_id, subject_key').neq('subject_key', '').limit(5000),
    db().from('line_messages').select('user_id, created_at').eq('direction', 'in').neq('type', 'event').order('created_at', { ascending: false }).limit(10000),
    soft(onIkeikeDb() ? surveyRecent() : Promise.resolve(null), '月次アンケート', null),
    soft(memberTagRows(), 'タグ', [] as TagRow[]),
    soft(bousanKeys(), 'ぼうさん', new Set<string>()),
    soft(photoUrls(), '顔写真', new Map<string, string>()),
  ]);
  // LINE: 紐付いた人ごとに「最後に届いた日時」
  const lastInOf = new Map<string, string>();
  ((lineIns.data || []) as { user_id: string; created_at: string }[]).forEach((m) => { if (!lastInOf.has(m.user_id)) lastInOf.set(m.user_id, m.created_at); });
  const lineOf = new Map<string, { lineIn: string; lineLinked: boolean }>();
  ((lineUsers.data || []) as { user_id: string; subject_key: string }[]).forEach((u) => {
    const cur = lineOf.get(u.subject_key); const at = lastInOf.get(u.user_id) || '';
    lineOf.set(u.subject_key, { lineLinked: true, lineIn: cur && cur.lineIn > at ? cur.lineIn : at });
  });
  const NO_LINE = { lineIn: '', lineLinked: false };
  const stMap = new Map((Array.isArray(status) ? status : []).map((s) => [s.normalized_name, s]));
  const teamOf = new Map<string, string>();
  (teams.teams || []).forEach((t) => t.members.forEach((m) => teamOf.set(m.norm_name, t.name)));
  // リーダー＝コミュニティに 登録された リーダー。登録が 取れない ときは「コミュニティ名＝本人の 氏名」で 見分ける（コミュニティは リーダーの 名前で 呼ぶ）
  const leaders = new Set<string>();
  (teams.teams || []).forEach((t) => { const l = t.leader_norm_name || (t.members.some((m) => m.norm_name === normName(t.name)) ? normName(t.name) : ''); if (l) leaders.add(l); });
  const clubsOf = new Map<string, string[]>();
  ((clubs.data || []) as unknown as { subject_key: string; clubs: { name: string } | null }[]).forEach((c) => {
    if (!c.clubs) return;
    clubsOf.set(c.subject_key, [...(clubsOf.get(c.subject_key) || []), c.clubs.name]);
  });

  const tagsByKey = new Map<string, string[]>();
  tagRows.forEach((t) => { if (t.tags) tagsByKey.set(t.subject_key, [...(tagsByKey.get(t.subject_key) || []), t.tags.name]); });

  const seen = new Set<string>();
  const members: Member[] = [];
  for (const r of roster.rows || []) {
    const nn = normName(r.name);
    if (!nn || seen.has(nn) || livers.has(nn)) continue;   // 同姓同名はいけどん側でも1行に畳まれている
    seen.add(nn);
    const key = 'n:' + nn;
    const info = r.info || {};
    const ek = eki.overlay?.[nn];
    members.push({
      key, kind: 'employee', name: r.name, kana: r.kana || '', status: statusOf(r, stMap.get(nn)),
      recruitTantou: overlay.overlay?.[nn]?.tantou || '', salesTantou: r.rep || '',
      company: r.shozokuKadou || r.shozoku || '',
      nyusha: nyusha.overlay?.[nn]?.nyushaBi || r.nyusha || '',
      siteEki: ek?.siteEki || r.siteEki || '', homeEki: ek?.homeEki || r.homeEki || '',
      community: teamOf.get(nn) || '', clubs: clubsOf.get(key) || [], leader: leaders.has(nn),
      start: r.start || '', end: r.end || '', tanka: r.tanka || '', lineGroup: r.lineGroup || '', provisional: !!r.provisional,
      gender: info.gender || '', age: info.age || '', address: info.address || '', shikaku: info.shikaku || '', caseSummary: r.caseSummary || '',
      ...(lineOf.get(key) || NO_LINE), tags: tagsByKey.get(key) || [], bousan: bousan.has(key), photo: photos.get(nn),
    });
  }
  // 入社予定（仮行＝台帳にまだ 行が 無い人）のうち、ミンミカで「案件確定」になっていて 入社日を 過ぎた 人は 稼働中 と 出す（2026-10-09 shoya）。
  //   案件確定で ない人・入社日が 分からない人・まだ 先の人は 入社予定の まま。手で「入社予定」に した人（status_override=yotei）も 触らない。
  //   入社日は ミンミカの 入社日（members.joined_at）→ 無ければ 名簿の 入社日（手入力 → 営業リストの 参画日）
  const yotei = members.filter((m) => m.provisional && m.status === '入社予定' && stMap.get(m.key.slice(2))?.status_override !== 'yotei');
  if (yotei.length && onIkeikeDb()) {
    const appOf = new Map<string, string[]>();
    for (const s of sales) {
      const nn = String(s.normalized_name || '').trim() || normName(String(s.name || '')); const a = String(s.applicant_id || '').trim();
      if (nn && a) appOf.set(nn, [...(appOf.get(nn) || []), a]);
    }
    const mnm = await soft(mnmConfirmed(yotei.flatMap((m) => appOf.get(m.key.slice(2)) || [])), 'ミンミカの案件確定', new Map<string, MnmJoin>());
    const today = jstDate(new Date().toISOString());
    for (const m of yotei) {
      const hit = (appOf.get(m.key.slice(2)) || []).map((a) => mnm.get(a)).find((x) => x?.confirmed);
      if (!hit) continue;
      const day = hit.joined || (/^\d{4}-\d{2}-\d{2}/.test(m.nyusha) ? m.nyusha.slice(0, 10) : '');
      if (!m.nyusha && hit.joined) m.nyusha = hit.joined;
      if (day && day <= today) m.status = '稼働中';
    }
  }
  // 月次アンケート: いちばん新しい月分に答えていない 稼働中・待機 に印（読めなかったときは誰にも付けない）
  if (survey && survey.length) {
    const latest = survey.map((r) => surveyMonthOf(r.submitted_at)).sort().pop();
    const targets = members.filter(isSurveyTarget);
    const done = answeredTargets(survey.filter((r) => surveyMonthOf(r.submitted_at) === latest).map((r) => normName(r.name)), targets.map((m) => m.key.slice(2)));
    targets.forEach((m) => { m.surveyTodo = !done.has(m.key.slice(2)); });
  }
  // 候補者がいけどんの名簿に載ったら従業員へ切り替える（LINE・過去トーク・メモ・部活のつながりも引き継ぐ）
  const candidates = ((people.data || []) as Record<string, string>[]).filter((p) => !p.promoted_to && !livers.has(normName(p.name)));
  const promoted = new Set<string>();
  for (const p of candidates) {
    const nn = normName(p.name);
    if (nn && seen.has(nn)) { await promote(p.id, p.name, nn); promoted.add(p.id); }
  }
  // プロパーリストの氏名ごとの状態（候補者の表示と、下の「プロパーリストだけの人」の両方で使う）
  const salesOf = new Map<string, { name: string; status: string }>();
  for (const s of sales) {
    const name = String(s.name || '').trim(); const nn = normName(name);
    if (!nn) continue;
    const st = properStatus(s); const cur = salesOf.get(nn);
    if (!cur || (PROPER_RANK[st] || 0) > (PROPER_RANK[cur.status] || 0)) salesOf.set(nn, { name, status: st });
  }
  for (const p of candidates.filter((x) => !promoted.has(x.id))) {
    const key = 'p:' + p.id; const stage = stageKey(p.stage); const ps = salesOf.get(normName(p.name))?.status || '';
    members.push({
      key, kind: 'candidate', name: p.name, kana: p.kana, status: candidateStatus(stage, ps), stage, properStatus: ps,
      recruitTantou: p.recruit_tantou, salesTantou: p.sales_tantou, company: p.company,
      nyusha: p.nyusha, siteEki: '', homeEki: p.station, community: '', clubs: clubsOf.get(key) || [],
      start: '', end: '', tanka: '', lineGroup: '', provisional: false,
      gender: p.gender, age: '', address: p.address, shikaku: p.shikaku, caseSummary: '',
      ...(lineOf.get(key) || NO_LINE), tags: tagsByKey.get(key) || [], bousan: bousan.has(key), photo: photos.get(normName(p.name)),
    });
  }
  // プロパーリストの人（名簿・候補者に同じ氏名が居れば そちらが正＝出さない）。同姓同名は名簿と同じく1人に畳む。
  const taken = new Set([...seen, ...members.filter((m) => m.kind === 'candidate').map((m) => normName(m.name))]);
  const properOf = new Map<string, ProperLite>();
  for (const [nn, v] of salesOf) {
    if (taken.has(nn) || livers.has(nn)) continue;
    properOf.set(nn, { key: 'n:' + nn, name: v.name, kana: '', status: v.status, from: 'proper' });
  }
  // 稼働管理情報一覧にだけ居る人（どの月でも）。最新月に居れば「稼働中」、過去月だけなら「過去在籍」
  const latestYm = ledger.reduce((a, r) => (String(r.year_month || '') > a ? String(r.year_month) : a), '');
  for (const r of ledger) {
    const name = String(r.name || '').trim(); const nn = normName(name);
    if (!nn || name === '要員名' || taken.has(nn) || livers.has(nn)) continue;
    const cur = properOf.get(nn);
    if (cur && cur.from === 'proper') continue;
    const now = String(r.year_month || '') === latestYm;
    if (!cur || now) properOf.set(nn, { key: 'n:' + nn, name, kana: '', status: now ? '稼働中' : '過去在籍', from: 'ledger' });
  }
  return { members, proper: [...properOf.values()], month: roster.selected?.name || '', warnings };
}

async function promote(id: string, name: string, nn: string) {
  const from = 'p:' + id, to = 'n:' + nn, at = new Date().toISOString();
  const d = db();
  await Promise.all([
    d.from('line_users').update({ subject_key: to, subject_name: name, updated_at: at }).eq('subject_key', from),
    d.from('line_legacy_chats').update({ subject_key: to, subject_name: name }).eq('subject_key', from),
    d.from('activities').update({ subject_key: to }).eq('subject_key', from),
  ]);
  const { data: mc } = await d.from('member_clubs').select('club_id').eq('subject_key', from);
  if (mc?.length) {
    await d.from('member_clubs').upsert(mc.map((c) => ({ subject_key: to, club_id: c.club_id, name })), { onConflict: 'subject_key,club_id', ignoreDuplicates: true });
    await d.from('member_clubs').delete().eq('subject_key', from);
  }
  const { data: mt } = await d.from('member_tags').select('tag_id').eq('subject_key', from);
  if (mt?.length) {
    await d.from('member_tags').upsert(mt.map((t) => ({ subject_key: to, tag_id: t.tag_id, name })), { onConflict: 'subject_key,tag_id', ignoreDuplicates: true });
    await d.from('member_tags').delete().eq('subject_key', from);
  }
  // ぼうさん（接触禁止）の印も 引き継ぐ。表が読めなくても 切り替え自体は進める
  const { data: bz } = await d.from('bousan').select('added_by, added_at').eq('subject_key', from).maybeSingle();
  if (bz) {
    await d.from('bousan').upsert({ subject_key: to, name, added_by: bz.added_by, added_at: bz.added_at }, { onConflict: 'subject_key', ignoreDuplicates: true });
    await d.from('bousan').delete().eq('subject_key', from);
  }
  await d.from('people').update({ promoted_to: to, promoted_at: at, updated_at: at }).eq('id', id);
  await d.from('activities').insert({ subject_key: to, person_id: id, name, kind: 'stage', body: 'いけどんの従業員名簿に載ったため、候補者から従業員に切り替え', actor_name: '自動' });
}

// ---- いけどん本番DBから直接読む（IKEIKE_SERVICE_ROLE があるとき）。形は いけどんAPIの返り値に合わせる ----
// 手で付けたタグ（1000行を超えても全部読む）
interface TagRow { subject_key: string; tags: { name: string } | null }
async function memberTagRows(): Promise<TagRow[]> {
  const out: TagRow[] = [];
  for (let from = 0; from < 100000; from += 1000) {
    const { data, error } = await db().from('member_tags').select('subject_key, tags(name)').order('subject_key').order('tag_id').range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...((data || []) as unknown as TagRow[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}
async function all<T>(table: string, cols: string): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; from < 100000; from += 1000) {
    const { data, error } = await ike().from(table).select(cols).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    out.push(...((data || []) as T[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}
// ミンミカ（いけどんに 写してある mnm_* の表）で、応募者ごとに「いちばん新しい 営業ラウンドが 案件確定か」と 入社日を 引く。
//   つながり: sales_roster.applicant_id → mnm_applications → mnm_offers → mnm_members（data.offer_id）→ mnm_sales_rounds（member_id）
interface MnmJoin { confirmed: boolean; joined: string }
// 日時の文字列 → 日本時間の 日付（'YYYY-MM-DD'）。日付だけの値は そのまま
function jstDate(v: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const t = Date.parse(v);
  return Number.isFinite(t) ? new Date(t + 9 * 3600e3).toISOString().slice(0, 10) : '';
}
async function mnmConfirmed(applicantIds: string[]): Promise<Map<string, MnmJoin>> {
  const out = new Map<string, MnmJoin>();
  const ids = [...new Set(applicantIds)];
  if (!ids.length) return out;
  const pick = async <T,>(table: string, cols: string, col: string, vals: string[]): Promise<T[]> => {
    const rows: T[] = [];
    for (let i = 0; i < vals.length; i += 100) {
      const { data, error } = await ike().from(table).select(cols).in(col, vals.slice(i, i + 100)).is('mnm_deleted_at', null).limit(5000);
      if (error) throw new Error(`${table}: ${error.message}`);
      rows.push(...((data || []) as T[]));
    }
    return rows;
  };
  const apps = await pick<{ id: string; applicant_id: string }>('mnm_applications', 'id, applicant_id', 'applicant_id', ids);
  const offers = await pick<{ id: string; application_id: string }>('mnm_offers', 'id, application_id', 'application_id', apps.map((a) => String(a.id)));
  const mems = await pick<{ id: string; offer_id: string | null; joined: string | null }>('mnm_members', 'id, offer_id:data->>offer_id, joined:data->>joined_at', 'data->>offer_id', offers.map((o) => String(o.id)));
  const rounds = await pick<{ member_id: string; st: string | null; created: string | null }>('mnm_sales_rounds', 'member_id, st:data->>sales_status_code, created:data->>created_at', 'member_id', mems.map((m) => String(m.id)));
  const appOfOffer = new Map(offers.map((o) => [String(o.id), apps.find((a) => String(a.id) === String(o.application_id))?.applicant_id || '']));
  for (const m of mems) {
    const applicant = String(appOfOffer.get(String(m.offer_id || '')) || '');
    if (!applicant) continue;
    const last = rounds.filter((r) => String(r.member_id) === String(m.id)).sort((a, b) => String(a.created || '').localeCompare(String(b.created || ''))).pop();
    const v: MnmJoin = { confirmed: last?.st === 'project_confirmed', joined: m.joined ? jstDate(String(m.joined)) : '' };
    const cur = out.get(applicant);
    if (!cur || (v.confirmed && !cur.confirmed)) out.set(applicant, v);
  }
  return out;
}
const fromDb = {
  async roster() {
    const r = (await getRosterDataFromDb(ike(), undefined, Date.now())) as unknown as { rows?: IkeRow[]; selected?: { name?: string } };
    return r;
  },
  async status(): Promise<StatusRow[]> {
    return all<StatusRow>('roster_status', 'normalized_name, taisha, taiki, status_override');
  },
  async tantou() {
    const rows = await all<{ normalized_name: string; tantou: string | null }>('roster_tantou', 'normalized_name, tantou');
    return { overlay: Object.fromEntries(rows.map((r) => [r.normalized_name, { tantou: r.tantou || '' }])) };
  },
  async teams() {
    const [teams, members] = await Promise.all([
      all<{ id: string; name: string; leader_norm_name: string | null }>('roster_teams', 'id, name, leader_norm_name'),
      all<{ team_id: string; norm_name: string }>('roster_team_members', 'team_id, norm_name'),
    ]);
    return { teams: teams.map((t) => ({ name: t.name, leader_norm_name: t.leader_norm_name, members: members.filter((m) => m.team_id === t.id) })) };
  },
  async nyusha() {
    const rows = await all<{ normalized_name: string; nyusha_bi: string | null }>('roster_nyusha', 'normalized_name, nyusha_bi');
    return { overlay: Object.fromEntries(rows.map((r) => [r.normalized_name, { nyushaBi: r.nyusha_bi || '' }])) };
  },
  async eki() {
    const rows = await all<{ normalized_name: string; home_eki: string | null; site_eki: string | null }>('roster_eki', 'normalized_name, home_eki, site_eki');
    return { overlay: Object.fromEntries(rows.map((r) => [r.normalized_name, { homeEki: r.home_eki || '', siteEki: r.site_eki || '' }])) };
  },
};
