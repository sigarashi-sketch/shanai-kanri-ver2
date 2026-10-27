import 'server-only';
import { ike, onIkeikeDb } from './db';
import type { CurrentUser } from './auth';

// それゆけ未経験での操作を いけどんの操作ログ（public.op_audit_log）に残す。たまげたポンのマイルと工数の元になる
//   （いけどん sql/0223・種別は bikkura_task_kinds の 'soreyuke:*'。マイルは /pon-settings で変えられる）。
//   action は 'soreyuke:<口>:<操作>'。target は「同じ相手は1日1件に丸める」ときの相手（LINE の userId・名簿の key など）。
//   ★保存が成功したあとにだけ呼ぶ。ここが失敗しても元の操作は成功のまま（ログが1行欠けるだけ）。
//   ★読み取りでは呼ばない（画面を開くたびに行が増える）。画面が勝手にやる処理（自動の紐付け）でも呼ばない
export async function audit(u: CurrentUser, action: string, target = '', detail: Record<string, unknown> = {}): Promise<void> {
  if (u.id === 'dev' || !onIkeikeDb() || !u.email) return;   // 手元の確認用ユーザーは残さない
  try {
    await ike().from('op_audit_log').insert({ actor: u.email.toLowerCase(), action: 'soreyuke:' + action, target: String(target).slice(0, 200), detail, ok: true, status: 200, ms: 0, source: 'soreyuke' });
  } catch { /* マイルが1件付かないだけ */ }
}
