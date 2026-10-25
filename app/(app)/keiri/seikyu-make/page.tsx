import { IkFrame } from '../IkFrame';

// 請求書作成（作成だけ）。今の /seikyu-make.html をそのまま出す（app/ik）。格納は /keiri/kakunou に分けた（10-25）
export default function SeikyuMakePage() {
  return <IkFrame src="/ik/seikyu-make.html?v2pane=make" title="請求書作成" />;
}
