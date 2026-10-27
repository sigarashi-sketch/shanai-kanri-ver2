import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// 採用版のDB（Supabase: saiyou）。service_role でサーバからだけ触る。
// 2026-09-30〜 採用版のデータは いけどん本番DB（Supabase: ikeike）の saiyou スキーマに置く。
//   ・db()  … 採用版の表（saiyou スキーマ）。読み書きする
//   ・ike() … いけどん本体の表（public スキーマ）。★読むだけ。書くのは いけどんのAPI経由（採用担当の保存など）
//   旧・採用版専用DB（qnqwjncpkdgjnlmrbfbd）は 2026-09-30 に解約済み。IKEIKE_SERVICE_ROLE が無いと動かない。
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _db: SupabaseClient<any, any, any> | null = null;
let _ike: SupabaseClient | null = null;
// quest が ある文字列で始まる行を絞る時の LIKE の型（`.like('quest', likePrefix('_check:'))`）。'_' と '%' は LIKE の記号なので 打ち消す。
//   ★`.gte(prefix).lt(次の文字)` の範囲で絞ってはいけない: このDBの並び順（en_US.UTF-8）は 記号を飛ばして比べるので 1行も返らない（2026-10-09 スキルチェック・タイピングの記録が 画面に出ていなかった原因）
export const likePrefix = (p: string) => p.replace(/[\\%_]/g, '\\$&') + '%';
export const onIkeikeDb = () => !!process.env.IKEIKE_SERVICE_ROLE;
function ikeUrl() { return String(process.env.IKEIKE_SUPABASE_URL || 'https://pdoppvhuimcinyamtuvm.supabase.co'); }   // ver2：既定は今の社内システムと同じ（10-27）
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function db(): SupabaseClient<any, any, any> {
  if (_db) return _db;
  if (onIkeikeDb()) {
    _db = createClient(ikeUrl(), String(process.env.IKEIKE_SERVICE_ROLE), { auth: { persistSession: false }, db: { schema: 'saiyou' } });
  } else {
    const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE;
    if (!url || !key) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE が未設定です');
    _db = createClient(url, key, { auth: { persistSession: false } });
  }
  return _db!;
}
export function ike(): SupabaseClient {
  if (_ike) return _ike;
  if (!onIkeikeDb()) throw new Error('IKEIKE_SERVICE_ROLE が未設定です');
  _ike = createClient(ikeUrl(), String(process.env.IKEIKE_SERVICE_ROLE), { auth: { persistSession: false } });
  return _ike;
}

export interface Memo {
  id: string; subject_key: string; name: string; kind: string; label: string; body: string; fields: Record<string, string>;
  actor_email: string; actor_name: string; created_at: string;
}
