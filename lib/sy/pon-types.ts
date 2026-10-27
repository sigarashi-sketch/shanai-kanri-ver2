// たまげたポン（マイルを貯めて ガラポンをまわす）を それゆけ未経験 のマネージャーにも（2026-10-07 shoya）。画面とサーバの両方から読む型と決まり。
//   仕組み・景品・抽選は いけどんのたまげたポンそのもの（いけどん RUNBOOK_たまげたポン_20260912.md）。それゆけ が足しているのは3つ:
//   ① それゆけ での操作を 操作ログに残す（lib/audit.ts。'soreyuke:<口>:<操作>'）→ 種別ごとのマイルで数わる
//   ② 本人の画面 /pon（いけどんの /bikkura.html を枠の中にそのまま出す）
//   ③ 設定の画面 /pon/settings（admin 以上。許可する人・操作ごとのマイル・マネージャーの設定）
export const PON_PAGE = '/pon';
export const PON_ROLE = 'マネージャー';              // 事務の役割（いけどん profiles.jimu_role・0223）
export const PON_SETTINGS_KEY = 'bikkura:' + PON_ROLE;   // 役割の設定（いけどん app_settings。丸ごと1式）
export const PON_ACT_PREFIX = 'soreyuke:';
export interface PonKind { id: number; act_pattern: string; kind: string; std_minutes: number; miles: number; dedupe_per_target_day: boolean; note: string; active: boolean; uncapped: boolean }
export interface PonUser { email: string; name: string; appRole: string; bikkura: boolean; since: string | null; jimuRole: string }
// 画面で変えられる設定。[最小, 最大, 整数か, super admin だけか]（範囲は いけどん api/_activity.ts LIMITS と同じ）
export const PON_FIELDS: { k: string; label: string; hint: string; lim: [number, number, boolean]; superOnly?: boolean }[] = [
  { k: 'miles_per_draw', label: '1回まわすのに必要なマイル', hint: '', lim: [1, 100, true] },
  { k: 'daily_mile_cap', label: '1日に貯まるマイルの上限', hint: '過去の日にも効きます（下げると残りが減ることがあります）', lim: [1, 500, true] },
  { k: 'daily_draw_cap', label: '1日にまわせる回数', hint: '0＝制限なし', lim: [0, 100, true] },
  { k: 'hold_cap_draws', label: '持っておけるのは何回分まで', hint: '0＝制限なし。いっぱいのときに貯まった分は消えます', lim: [0, 100, true] },
  { k: 'daily_silver_per_person', label: '当たりは1人1日に何個まで', hint: '0＝制限なし', lim: [0, 20, true], superOnly: true },
  { k: 'silver_rate', label: '当たりの率', hint: '0〜1（0.13＝13%）', lim: [0, 1, false], superOnly: true },
];
// 操作の呼び名（いけどん public/act-labels.js と同じ言い方）
export const PON_ACT_LABEL: Record<string, string> = {
  'soreyuke:chat:send': 'チャットで送信', 'soreyuke:chat:ball': 'チャットを対応済みにする', 'soreyuke:broadcast:send': '配信を送信',
  'soreyuke:memo:mendan': '面談の記録（定期・フォロー・リーダー）', 'soreyuke:memo:*': 'メモ・電話・LINE の記録', 'soreyuke:link:*': 'LINE と名簿の紐付け',
  'soreyuke:tag:*': 'タグを付ける・外す', 'soreyuke:club:*': '部活の設定', 'soreyuke:people:*': '候補者の登録・担当やステージの変更',
};
