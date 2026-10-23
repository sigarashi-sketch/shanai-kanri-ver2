// 変更の予約：今の社内システムの形 → この画面の型。
//   今のシステムにある予約は従業員名簿の「待機の予約」「退社の予約」だけ（roster_status.taiki_yotei_bi / taisha_yotei_bi）。
//   読むのは GET /api/proxy?action=getRosterStatus。適用されると日付が空に戻る＝ここに出るのは「これから」の予約だけ。
//   ・待機の予約：その日の朝6:00に待機が入る ／ 退社の予約：日報の退職日。翌朝6:00に退社が入る
import type { Yoyaku } from '@/lib/yoyaku-sample';

export type IkeRosterStatus = {
  normalized_name: string; name: string;
  taisha: boolean; taisha_bi: string; taiki: boolean;
  taiki_yotei_bi: string; taisha_yotei_bi: string;
  status_override: '' | 'kadou' | 'yotei' | 'zaiseki' | 'kyushoku' | 'taiki';
};

const OVERRIDE: Record<string, string> = { kadou: '稼働中', yotei: '入場前', zaiseki: '在籍', kyushoku: '休職', taiki: '待機' };
const nowState = (r: IkeRosterStatus) => (r.taisha ? '退社' : r.taiki ? '待機' : OVERRIDE[r.status_override] || '今の状態');

export function yoyakuFromRosterStatus(list: IkeRosterStatus[] | null): Yoyaku[] {
  const out: Yoyaku[] = [];
  for (const r of Array.isArray(list) ? list : []) {
    const name = r.name || r.normalized_name;
    if (r.taiki_yotei_bi) out.push({ id: `taiki:${r.normalized_name}`, date: r.taiki_yotei_bi, personId: '', person: name, field: '状態', from: nowState(r), to: '待機', by: '—', state: '予約中', note: '従業員名簿の待機の予約（この日の朝6:00に待機が入る）' });
    if (r.taisha_yotei_bi) out.push({ id: `taisha:${r.normalized_name}`, date: r.taisha_yotei_bi, personId: '', person: name, field: '状態', from: nowState(r), to: '退社', by: '—', state: '予約中', note: '退職日の予約（翌朝6:00に退社が入る）' });
  }
  return out;
}
