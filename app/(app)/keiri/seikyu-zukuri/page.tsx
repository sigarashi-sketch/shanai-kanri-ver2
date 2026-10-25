import { IkFrame } from '../IkFrame';

// 請求書づくり（現場マスタ・取引先マスタなど）。今の /seikyu.html をそのまま出す（app/ik）
export default function SeikyuZukuriPage() {
  return <IkFrame src="/ik/seikyu.html" title="請求書づくり" />;
}
