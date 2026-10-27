import 'server-only';
import { effectivePerms } from './access';
import { cached, userKey } from './cache';
import { isKanawest } from './kubun';
import { matchGroupName, normName, type EngineerRows, type ProgressData, type ProgressReply } from './live/eigyo-common';

// かな西エリア（10-26 shoya「神奈川西エリアは神奈川要員だけみれるように・ロール振られた人はね」「神奈川要員チェックの人」）。
//   ・神奈川要員＝今のシステムのプロパーリストの「神奈川要員」チェックが付いている人（稼働中もふくむ＝行の kanagawa の印と同じ）
//   ・絞るのは かな西エリアが付いた人のとき いつも（ほかの区分を持っていても・10-27）
//   ・ver2 から今のシステムを読む口は全部 lib/ike.ts の ikeFetch を通る。そこで ① 下の READS にある読み口だけ通し ② 中身を神奈川要員だけに絞る。
//     READS に無い読み口・書き込みは全部断る（知らない形の中身は絞れないので出さない）
//   ★今のシステムを読めない・名簿が読めないときは何も出さない（人を見せる側に倒さない）

export type Scope = 'all' | 'kanagawa';
type Raw = (path: string) => Promise<{ ok: boolean; status: number; data: unknown }>;

/** いまの人が、この呼び出しで神奈川要員に絞られるか＝かな西エリアが付いていれば いつも（10-27 shoya「全部見れるようにしたけど神奈川要員だけにしてね」） */
export async function scopeOf(token: string, loadPerms: () => Promise<ReturnType<typeof effectivePerms> | null>): Promise<Scope> {
  const { v: k } = await cached(`${userKey(token)}|kperms`, 30_000, loadPerms);
  return k && isKanawest(k) ? 'kanagawa' : 'all';
}

/** 神奈川要員の名前（名寄せした形）と、グループ名を当てるための全員の名前。読めなければ null */
async function kanagawaSet(token: string, raw: Raw): Promise<{ k: Set<string>; all: string[] } | null> {
  const { v } = await cached(`${userKey(token)}|kanagawa-set`, 60_000, async () => {
    const r = await raw('/api/roster?action=getEngineerRows&area=main');
    const d = r.data as EngineerRows | null;
    if (!r.ok || !d || !Array.isArray(d.rows)) return null;
    const col = d.columns?.find((c) => c.col === 'kanagawa');
    const k = new Set<string>(), all = new Set<string>();
    for (const row of d.rows) {
      const n = normName(row.name);
      if (!n) continue;
      all.add(n);
      if (row.kanagawa || (col && row.cells?.[col.idx] === true)) k.add(n);
    }
    return { k: [...k], all: [...all] };
  }, { keep: (x) => !!x });
  return v ? { k: new Set(v.k), all: v.all } : null;
}

const NG = { status: 403, data: { ok: false, success: false, error: 'かな西エリアでは神奈川要員の人のことしか見られません' } };

/** かな西エリアで通す読み口と、中身の絞り方。返り値 null＝断る */
type Ctx = { k: Set<string>; all: string[]; inK: (name: unknown) => boolean; groupInK: (groupName: unknown) => boolean };
const READS: { test: (api: string, sp: URLSearchParams) => boolean; filter: (data: unknown, sp: URLSearchParams, c: Ctx) => unknown | null }[] = [
  // 要員リスト
  { test: (a, sp) => a === 'roster' && sp.get('action') === 'getEngineerRows' && !sp.get('op'),
    filter: (d, _sp, c) => { const x = d as EngineerRows; if (!Array.isArray(x?.rows)) return null; const rows = x.rows.filter((r) => c.k.has(normName(r.name))); return { ...x, rows, total: rows.length }; } },
  // 面談管理
  { test: (a, sp) => a === 'proxy' && sp.get('action') === 'getInterviews',
    filter: (d, _sp, c) => (Array.isArray(d) ? d.filter((r) => c.inK((r as { name?: string }).name)) : null) },
  // 案件進捗（送った先が神奈川要員の送信だけ・その送信がある案件だけ）
  { test: (a, sp) => a === 'proxy' && sp.get('action') === 'getProgressData',
    filter: (d, _sp, c) => {
      const x = d as ProgressData;
      if (!x || typeof x !== 'object') return null;
      const ids = new Set<string>();
      const sends = (x.sends ?? []).map((s) => {
        const keep = (s.groupNames ?? []).map((n, i) => [n, s.groupIds?.[i]] as const).filter(([n]) => c.groupInK(n) || c.inK(n));
        keep.forEach(([, id]) => id && ids.add(id));
        return { ...s, groupNames: keep.map(([n]) => n), groupIds: keep.map(([, id]) => id ?? '') };
      }).filter((s) => s.groupNames.length);
      const nos = new Set(sends.map((s) => s.caseNo));
      const keepKey = (key: string) => nos.has(key.split(String.fromCharCode(31))[0]) && ids.has(key.split(String.fromCharCode(31))[1] ?? '');
      return {
        ...x, sends, cases: (x.cases ?? []).filter((cs) => nos.has(cs.kNo)),
        activity: Object.fromEntries(Object.entries(x.activity ?? {}).filter(([, v]) => c.inK(v?.name))),
        slackForwarded: Object.fromEntries(Object.entries(x.slackForwarded ?? {}).filter(([key]) => keepKey(key))),
        caseLabels: Object.fromEntries(Object.entries(x.caseLabels ?? {}).filter(([no]) => nos.has(no))),
      };
    } },
  { test: (a, sp) => a === 'proxy' && sp.get('action') === 'getProgressReplies',
    filter: (d, _sp, c) => (Array.isArray(d) ? (d as ProgressReply[]).filter((r) => c.groupInK(r.groupName) || c.inK(r.name)) : null) },
  { test: (a, sp) => a === 'proxy' && sp.get('action') === 'getReplies',
    filter: (d, _sp, c) => (Array.isArray(d) ? d.filter((r) => c.groupInK((r as { groupName?: string }).groupName)) : null) },
  { test: (a, sp) => a === 'proxy' && sp.get('action') === 'getGroupNames',
    filter: (d, _sp, c) => (Array.isArray(d) ? d.filter((r) => c.groupInK((r as { name?: string }).name)) : null) },
  // 要員リストの列（フォーム回答の名前・通勤エリア）
  { test: (a, sp) => a === 'basic-info' && sp.get('action') === 'names',
    filter: (d, _sp, c) => { const x = d as { names?: unknown }; return Array.isArray(x?.names) ? { ...x, names: x.names.filter((n) => c.inK(n)) } : null; } },
  { test: (a, sp) => a === 'commute-area' && sp.get('action') === 'list',
    filter: (d, _sp, c) => { const x = d as { rows?: { key?: string }[] }; return Array.isArray(x?.rows) ? { ...x, rows: x.rows.filter((r) => c.inK(r.key)) } : null; } },
  { test: (a, sp) => a === 'commute-area' && !sp.get('action') && !!sp.get('name'),
    filter: (d, sp, c) => (c.inK(sp.get('name')) ? d : null) },
  // チャット（あおい）。1:1 は紐付けた氏名、グループは名前に入っている人で決める
  { test: (a, sp) => a === 'chat' && sp.get('action') === 'contacts',
    filter: (d, _sp, c) => { const x = d as { contacts?: { linked_normalized_name?: string; linked_name?: string }[] }; return Array.isArray(x?.contacts) ? { ...x, contacts: x.contacts.filter((ct) => c.inK(ct.linked_normalized_name || ct.linked_name)) } : null; } },
  { test: (a, sp) => a === 'chat' && sp.get('action') === 'groups',
    filter: (d, _sp, c) => { const x = d as { groups?: { name?: string }[] }; return Array.isArray(x?.groups) ? { ...x, groups: x.groups.filter((g) => c.groupInK(g.name)) } : null; } },
  { test: (a, sp) => a === 'chat' && sp.get('action') === 'thread',
    filter: (d, _sp, c) => { const ct = (d as { contact?: { linked_normalized_name?: string; linked_name?: string } | null })?.contact; return ct && c.inK(ct.linked_normalized_name || ct.linked_name) ? d : null; } },
  { test: (a, sp) => a === 'chat' && sp.get('action') === 'groupThread',
    filter: (d, _sp, c) => { const g = (d as { group?: { name?: string } | null })?.group; return g && c.groupInK(g.name) ? d : null; } },
];

/**
 * かな西エリアで今のシステムを読む（lib/ike.ts の ikeFetch から呼ぶ）。
 *   method が GET でない・READS に無い読み口・形が違う・名簿が読めない → 断る（403）
 */
export async function kanawestRead(path: string, method: string, token: string, raw: Raw): Promise<{ status: number; data: unknown }> {
  if (method !== 'GET') return NG;
  const u = new URL(path, 'http://x');
  const api = u.pathname.replace(/^\/api\//, '');
  const rule = READS.find((r) => r.test(api, u.searchParams));
  if (!rule) return NG;
  const set = await kanagawaSet(token, raw);
  if (!set) return { status: 503, data: { ok: false, error: '神奈川要員の名簿を読めなかったので出していません' } };
  const inK = (n: unknown) => { const x = normName(n); return !!x && set.k.has(x); };
  const groupInK = (g: unknown) => { const m = typeof g === 'string' ? matchGroupName(g, set.all) : null; return !!m && set.k.has(m); };
  const r = await raw(path);
  if (!r.ok) return { status: r.status, data: r.data };
  const out = rule.filter(r.data, u.searchParams, { k: set.k, all: set.all, inK, groupInK });
  return out === null ? NG : { status: 200, data: out };
}
