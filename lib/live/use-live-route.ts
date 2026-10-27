'use client';

import { useLiveFetch } from '@/components/Live';

// useIke（components/Live.tsx）と同じ動きで、/api/live/<画面> を読む（今の API を複数まとめた口・GET だけ）。
//   ・401 + not_logged_in なら state='sample'（ログインが切れた。画面は何も出さず LiveBanner がログインの案内）
//   ・何も渡さなくても読み直す（リアルタイム更新・10-27）。pollMs で間隔を変える・0 で止める（見えていない・15分さわっていないあいだは止める＝usePoll）
export function useLiveRoute<T>(url: string | null, opts?: { pollMs?: number }) {
  return useLiveFetch<T>(url, opts);
}
