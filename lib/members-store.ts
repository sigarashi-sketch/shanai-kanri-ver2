import 'server-only';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { MEMBERS, type Member } from './access';
import { ikeFetchCached, ikeToken } from './ike';

// 手元で動かすあいだの名簿の置き場（data/members.json）。本番前は DB を触らない。
//   本物のログインと名簿をつないだら、ここを DB 読み書きに差し替える。
const FILE = path.join(process.cwd(), 'data', 'members.json');

//   Vercel の見本URLではファイルに書けないので、そのときはサーバーの手元（memo）にだけ持つ（再起動で見本に戻る）。
let memo: Member[] | null = null;

async function localMembers(): Promise<Member[]> {
  if (memo) return memo;
  try { return JSON.parse(await fs.readFile(FILE, 'utf8')) as Member[]; } catch { return MEMBERS; }
}

// ログイン中は、全員で共有している設定（今の社内システムの v2-settings の members）を重ねる（10-25）。
//   人は手元の名簿のまま。ロールと個別の段階だけ共有の分で上書きする。読めなければ手元のまま
async function withShared(base: Member[]): Promise<Member[]> {
  if (!(await ikeToken())) return base;
  try {
    const r = await ikeFetchCached<{ value?: { members?: unknown } | null }>('/api/assistant?action=v2-settings', 30_000, { timeoutMs: 8000 });
    const ms = r.ok ? r.data?.value?.members : null;
    if (!Array.isArray(ms)) return base;
    const byId = new Map((ms as Member[]).filter((m) => m && typeof m.id === 'string').map((m) => [m.id, m]));
    return base.map((m) => { const s = byId.get(m.id); return s ? { ...m, role: s.role in { owner: 1, manager: 1, viewer_all: 1, none: 1 } ? s.role : m.role, own: s.own && typeof s.own === 'object' ? s.own : m.own } : m; });
  } catch { return base; }
}

export async function loadMembers(): Promise<Member[]> {
  return withShared(await localMembers());
}

export async function saveMembers(ms: Member[]): Promise<void> {
  try {
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(ms, null, 2));
  } catch { memo = ms; }
}
