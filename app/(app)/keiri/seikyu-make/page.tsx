import { IkFrame } from '../IkFrame';

// 請求書作成（作成・格納）。今の /seikyu-make.html をそのまま出す（app/ik）
export default function SeikyuMakePage() {
  return <IkFrame src="/ik/seikyu-make.html" title="請求書作成" />;
}
