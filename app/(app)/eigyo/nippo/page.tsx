import { IkFrame } from '../../keiri/IkFrame';

// 成約日報。今の /nippo.html をそのまま出す（app/ik・10-27 shoya「成約日報もとに戻して・デザインね」）。
//   読む・書くは今の画面と同じ口だけ通す（app/ik/api の nippo：GET init・due・masters・self／POST は本文の action が submit・fill・edit・edit-end・pref・reflect）。
//   前に ver2 で作り直した1問ずつの画面は git の履歴にある（lib/live/nippo-const・/api/live の日報の口は残してある）
export default function NippoPage() {
  return <IkFrame src="/ik/nippo.html" title="成約日報" />;
}
