// チャットのピン留め（0017）。ピンには種類があり（例「書類待ち」「アンケート回答待ち」）、種類は チャット画面で自分たちで作る。
//   1人に何種類でも付けられる。1つでも付いた相手は一覧の上に固まり、種類ごとに絞り込める
export interface PinKind { id: string; name: string; color: string }
// 種類の色の選択肢（DESIGN.md の色から）。先頭が既定
export const PIN_COLORS = ['#ed4956', '#e07a00', '#2e9e4f', '#0095f6', '#8134af'];
export const pinColor = (c: string) => (PIN_COLORS.includes(c) ? c : PIN_COLORS[0]);
