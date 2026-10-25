import { IkFrame } from '../IkFrame';

// 請求書・勤務表の格納（10-25 shoya「格納ページも作らないと 既存にあるよ勤務表と請求書の格納」）。
//   今の請求書作成（/seikyu-make.html）の「格納」タブをそのまま出す＝データ・判定（誰が格納ずみか）は今の画面のまま
export default function KakunouPage() {
  return <IkFrame src="/ik/seikyu-make.html?v2pane=store" title="請求書・勤務表の格納" />;
}
