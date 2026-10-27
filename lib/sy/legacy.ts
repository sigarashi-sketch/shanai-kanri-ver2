import 'server-only';
import { createHmac } from 'node:crypto';
import { db } from './db';

// 過去トーク取り込みの合言葉（日替わり）。chat.line.biz 上で動かす取り込みスクリプトに渡す。
export function legacyImportToken(day = new Date()): string {
  const d = new Date(day.getTime() + 9 * 3600e3).toISOString().slice(0, 10);   // JSTの日付
  return createHmac('sha256', String(process.env.SESSION_SECRET)).update('legacy-import:' + d).digest('base64url').slice(0, 32);
}

export async function matchLegacy() {
  const { data, error } = await db().rpc('saiyou_match_legacy');
  if (error) console.error('saiyou_match_legacy failed', error.message);
  return data;
}
