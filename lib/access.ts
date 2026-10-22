// 入れる人の決まり（ver2 でロールは作り直すが、これだけは変えない・2026-10-22 shoya）
//   ・未経験事業部の内勤 … このアプリ（全画面）を使える
//   ・それ以外の人       … 営業共有リストだけ（/shared）
//   内勤の中の細かい権限（分類ごとに 見る／直す／承認）は壁打ち中。いまは全部見られる。

export type Viewer = {
  name: string;
  division: '未経験事業部' | 'その他';
  kind: '内勤' | '営業' | 'その他';
  superAdmin?: boolean;
};

export function canUseApp(v: Viewer): boolean {
  return v.superAdmin === true || (v.division === '未経験事業部' && v.kind === '内勤');
}

// 手元で動かすあいだの「いまの人」。本番前のログイン（いけどんの Supabase Auth を借りる）をつなぐまでの仮置き。
//   上のバーの切り替えで cookie v2_viewer を入れ替えて、両方の見え方を確かめる。
export const DEV_VIEWERS: Record<string, Viewer> = {
  naikin: { name: '五十嵐（内勤）', division: '未経験事業部', kind: '内勤', superAdmin: true },
  eigyo: { name: '小林（営業）', division: 'その他', kind: '営業' },
};
export const VIEWER_COOKIE = 'v2_viewer';
