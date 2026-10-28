// いけどんのプロパーリスト（sales_roster）の状態のチェックを、それゆけの「情報」に見るだけで出す（2026-10-10 shoya「営業止めからドロップまで反映・編集できないように」）。
//   並びは いけどんのプロパーリストの列と同じ（営業止め → 辞退 → 参画決定 → 稼働中 → 再アサイン → 営業停止）。書き込む口は作らない
//   サーバは lib/proper-flags.ts、画面は components/MemberProper.tsx
export const PROPER_FLAGS = [
  ['poa', '営業止め'], ['jitai', '辞退'], ['sankaku_kettei', '参画決定'],
  ['kadou_chu', '稼働中'], ['sai_assign', '再アサイン'], ['eigyo_teishi', '提案禁止'],
] as const;
export type ProperFlagKey = (typeof PROPER_FLAGS)[number][0];

export interface ProperRow {
  flags: Record<ProperFlagKey, boolean>;
  tantou: string; shoudaku: string; kanou: string; sankaku: string; nyuujou: string;
}
