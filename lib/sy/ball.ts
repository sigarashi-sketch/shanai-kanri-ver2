// チャットの「相手ボール」判定（0010）。いけどん api/_ball.ts isBallOnThem と同じ規則。
//   相手ボール = 1:1トークが相手の発言で止まっている（こちらが返していない）状態。
//   「対応済み」で消せるが、そのあと相手がまた送ってきたら自動で再点灯する。
//   それゆけ未経験は最後が受信のとき last_message_at が「最後に受信した時刻」なので、列は ball_cleared_at だけで足りる。
export interface BallUser { followed: boolean; last_direction: string; last_message_at: string | null; ball_cleared_at?: string | null }

const ms = (v: string | null | undefined) => { const t = v ? Date.parse(v) : 0; return Number.isFinite(t) ? t : 0; };

export function ballOn(u: BallUser | null | undefined): boolean {
  if (!u || !u.followed) return false;   // ブロック中は返信できない＝対応しようがないので点けない
  if (u.last_direction !== 'in') return false;
  const lastIn = ms(u.last_message_at);
  return !!lastIn && lastIn > ms(u.ball_cleared_at);
}

// 待たせている日数（1日未満は 0）
export function waitDays(u: BallUser): number {
  return Math.max(0, Math.floor((Date.now() - ms(u.last_message_at)) / 86400e3));
}
