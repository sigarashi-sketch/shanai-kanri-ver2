import 'server-only';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { MEMBERS, type Member } from './access';

// 手元で動かすあいだの名簿の置き場（data/members.json）。本番前は DB を触らない。
//   本物のログインと名簿をつないだら、ここを DB 読み書きに差し替える。
const FILE = path.join(process.cwd(), 'data', 'members.json');

//   Vercel の見本URLではファイルに書けないので、そのときはサーバーの手元（memo）にだけ持つ（再起動で見本に戻る）。
let memo: Member[] | null = null;

export async function loadMembers(): Promise<Member[]> {
  if (memo) return memo;
  try { return JSON.parse(await fs.readFile(FILE, 'utf8')) as Member[]; } catch { return MEMBERS; }
}

export async function saveMembers(ms: Member[]): Promise<void> {
  try {
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    await fs.writeFile(FILE, JSON.stringify(ms, null, 2));
  } catch { memo = ms; }
}
