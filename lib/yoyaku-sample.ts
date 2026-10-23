// 変更の予約（適用日つき）。見本データ（本物の名前・数字ではない）。
//   予約した日の朝6:00に切り替わり、「一緒に変わるもの」にも同じ日から反映する（セミナーで選んだ機能・10-22 shoya）。
//   待機・退社の予約は今のシステムにもある → ここに集めて1か所で見る。
import type { ModuleKey } from './theme';

export const TODAY = '2026-10-23';

export type Field = '現場' | '単価' | '住所' | '通勤' | '状態';
export type YState = '承認待ち' | '予約中' | '適用済み' | '取り消し';

// 項目ごとの決まり：どの分類の持ち物か・何が一緒に変わるか・承認が要るか
export const FIELD_RULES: Record<Field, { module: ModuleKey; with: string[]; approve?: boolean; options?: string[] }> = {
  現場: { module: 'roumu', with: ['勤務表の様式', '請求先', '通勤の経路', '36協定の事業所'] },
  単価: { module: 'eigyo', with: ['請求の単価', '想定粗利'], approve: true },
  住所: { module: 'jinji', with: ['通勤・定期の見直し', '社員ページの住所'] },
  通勤: { module: 'keiri', with: ['交通費（定期代）', '通勤の経路'], approve: true },
  状態: { module: 'jinji', with: ['勤怠の対象', '営業共有リスト', '社保の手続き（労務担当へ）'], options: ['待機', '退社', '休職', '産休', '育休'] },
};

export type Yoyaku = {
  id: string; date: string; personId: string; person: string; field: Field;
  from: string; to: string; by: string; state: YState; note?: string;
};

export const YOYAKU: Yoyaku[] = [
  { id: 'y1', date: '2026-10-26', personId: 's0412', person: '山田 太郎', field: '現場', from: 'A社（品川）', to: 'B社（大崎）', by: '小林', state: '予約中' },
  { id: 'y2', date: '2026-10-26', personId: 's0412', person: '山田 太郎', field: '通勤', from: '川口→品川 定期', to: '川口→大崎 定期', by: '小林', state: '承認待ち', note: '現場の予約に合わせて自動で作成' },
  { id: 'y3', date: '2026-10-28', personId: 's0410', person: '渡辺 涼', field: '住所', from: '横浜市', to: '川崎市', by: '本人申請', state: '予約中' },
  { id: 'y4', date: '2026-11-01', personId: 's0399', person: '高橋 健', field: '状態', from: '稼働中', to: '産休', by: '中村', state: '予約中' },
  { id: 'y5', date: '2026-11-01', personId: 's0302', person: '鈴木 一郎', field: '単価', from: '45万', to: '48万', by: '小林', state: '承認待ち' },
  { id: 'y6', date: '2026-11-30', personId: 's0388', person: '伊藤 誠', field: '状態', from: '稼働中', to: '待機', by: '田中', state: '予約中', note: '派遣契約の終わり（更新の意向が未確認）' },
  { id: 'y7', date: '2026-10-20', personId: 's0441', person: '中村 優', field: '現場', from: 'D社（大手町）', to: '待機', by: '田中', state: '適用済み' },
  { id: 'y8', date: '2026-10-15', personId: 's0455', person: '加藤 葵', field: '住所', from: '品川区', to: '川崎市', by: '本人申請', state: '適用済み' },
];

export const daysFrom = (iso: string) => Math.round((Date.parse(iso) - Date.parse(TODAY)) / 86400000);
const WD = ['日', '月', '火', '水', '木', '金', '土'];
export const fmtDate = (iso: string) => { const d = new Date(iso + 'T00:00:00'); return `${d.getMonth() + 1}/${d.getDate()}（${WD[d.getDay()]}）`; };
export const addDays = (iso: string, n: number) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
