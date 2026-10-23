// 交通費・経費の見本データ（本物の名前・数字ではない）。
//   今のシステムの経費申請（電車・バス・定期・出張・稟議）の決まりはそのまま：
//   ・通勤（日ごと）は freee の出勤打刻が無い日は申請できない／定期は月の途中でも承認できる（月末に打刻の見回り）
//   ver2 で足すもの（セミナーで選んだ機能）：ICカードの利用履歴から選ぶだけで申請／よく使う経路の登録
import type { Check } from './kintai-sample';

export const ME = { personId: 's0410', name: '渡辺 涼', site: 'F社（横浜）', month: '10月', pass: null as null | { from: string; to: string } };

export type IcKind = '電車' | 'バス' | '買い物';
export type IcRow = { id: string; day: string; dow: string; time: string; kind: IcKind; from: string; to: string; fare: number };
// 出勤の打刻がある日（freee）。10/13 は打刻なし＝申請できない日
export const PUNCH_DAYS = ['10/1', '10/2', '10/3', '10/6', '10/7', '10/8', '10/9', '10/10', '10/14', '10/15', '10/16', '10/17', '10/20', '10/21', '10/22'];

export const IC_ROWS: IcRow[] = [
  { id: 'i1', day: '10/22', dow: '水', time: '8:21', kind: '電車', from: '横浜', to: '桜木町', fare: 136 },
  { id: 'i2', day: '10/22', dow: '水', time: '18:14', kind: '電車', from: '桜木町', to: '横浜', fare: 136 },
  { id: 'i3', day: '10/22', dow: '水', time: '12:40', kind: '買い物', from: 'コンビニ', to: '', fare: 498 },
  { id: 'i4', day: '10/21', dow: '火', time: '8:19', kind: '電車', from: '横浜', to: '桜木町', fare: 136 },
  { id: 'i5', day: '10/21', dow: '火', time: '13:05', kind: '電車', from: '桜木町', to: '新宿', fare: 580 },
  { id: 'i6', day: '10/21', dow: '火', time: '15:30', kind: '電車', from: '新宿', to: '横浜', fare: 580 },
  { id: 'i7', day: '10/20', dow: '月', time: '8:24', kind: '電車', from: '横浜', to: '桜木町', fare: 136 },
  { id: 'i8', day: '10/20', dow: '月', time: '18:30', kind: '電車', from: '桜木町', to: '横浜', fare: 136 },
  { id: 'i9', day: '10/20', dow: '月', time: '7:58', kind: 'バス', from: '六角橋', to: '横浜駅前', fare: 220 },
  { id: 'i10', day: '10/13', dow: '月', time: '10:10', kind: '電車', from: '横浜', to: '桜木町', fare: 136 },
  { id: 'i11', day: '10/13', dow: '月', time: '16:02', kind: '電車', from: '桜木町', to: '横浜', fare: 136 },
  { id: 'i12', day: '10/12', dow: '日', time: '14:00', kind: '電車', from: '横浜', to: '渋谷', fare: 290 },
];

export const PURPOSES = ['現場への通勤', '面談・面接（客先）', '研修', '本社に出社'];
export type Route = { id: string; label: string; from: string; to: string; fare: number; kind: IcKind; purpose: string };
export const ROUTES: Route[] = [
  { id: 'r1', label: '通勤（行き）', from: '横浜', to: '桜木町', fare: 136, kind: '電車', purpose: '現場への通勤' },
  { id: 'r2', label: '通勤（帰り）', from: '桜木町', to: '横浜', fare: 136, kind: '電車', purpose: '現場への通勤' },
];
export const ROUTE_LABELS = ['通勤（行き）', '通勤（帰り）', '自宅→最寄りバス', '本社へ', '研修会場へ'];

// ---- 経理の確認 ----
export type ClaimKind = '通勤（日ごと）' | '定期' | 'バス' | '出張・面談';
export type Claim = {
  id: string; personId: string; person: string; site: string; kind: ClaimKind; month: string;
  amount: number; detail: string; source: 'ICカードから' | '手入力'; filedAt: string; checks: Check[];
};
export const CLAIMS: Claim[] = [
  { id: 'c1', personId: 's0302', person: '鈴木 一郎', site: 'D社（大手町）', kind: '通勤（日ごと）', month: '10月', amount: 9240, detail: '15日・往復 616円', source: '手入力', filedAt: '10/22 20:10',
    checks: [{ tone: 'bad', text: '10/21 は退勤の打刻が無い（打刻修正の申請が承認待ち）' }, { tone: 'warn', text: '手入力の運賃が経路の運賃より 1日 40円高い' }] },
  { id: 'c2', personId: 's0410', person: '渡辺 涼', site: 'F社（横浜）', kind: '通勤（日ごと）', month: '10月', amount: 4080, detail: '15日・往復 272円', source: 'ICカードから', filedAt: '10/22 19:02',
    checks: [{ tone: 'ok', text: 'ICカードの利用履歴どおり' }, { tone: 'ok', text: '申請した日は全部 出勤の打刻あり' }] },
  { id: 'c3', personId: 's0388', person: '伊藤 誠', site: 'C社（新宿）', kind: '定期', month: '11月', amount: 14800, detail: '中野→新宿 1か月（11/1〜11/30）', source: '手入力', filedAt: '10/21 9:30',
    checks: [{ tone: 'ok', text: '領収書あり・期間が申請月と重なる' }, { tone: 'warn', text: '11/30 に派遣契約が終わる（更新の意向が未確認）' }] },
  { id: 'c4', personId: 's0412', person: '山田 太郎', site: 'A社（品川）', kind: '定期', month: '11月', amount: 13200, detail: '川口→品川 1か月', source: '手入力', filedAt: '10/20 12:00',
    checks: [{ tone: 'bad', text: '10/26 から現場が B社（大崎）に変わる予約がある。経路が古い' }] },
  { id: 'c5', personId: 's0399', person: '高橋 健', site: 'G社（品川）', kind: 'バス', month: '10月', amount: 1760, detail: '8日・片道 220円（路線：東急バス 渋41）', source: '手入力', filedAt: '10/22 18:40',
    checks: [{ tone: 'ok', text: 'バスは誰でも申請できる（運賃は本人の手入力）' }, { tone: 'ok', text: '申請した日は全部 出勤の打刻あり' }] },
  { id: 'c6', personId: 's0470', person: '林 さくら', site: 'J社（池袋）', kind: '出張・面談', month: '10月', amount: 1160, detail: '10/17 池袋→大崎 往復（次の現場の面談）', source: 'ICカードから', filedAt: '10/18 8:15',
    checks: [{ tone: 'ok', text: 'ICカードの利用履歴どおり' }, { tone: 'ok', text: '案件進捗に 10/17 の面談あり' }] },
  { id: 'c7', personId: 's0455', person: '加藤 葵', site: 'E社（川崎）', kind: '通勤（日ごと）', month: '10月', amount: 3360, detail: '12日・往復 280円', source: 'ICカードから', filedAt: '10/22 21:00',
    checks: [{ tone: 'ok', text: 'ICカードの利用履歴どおり' }, { tone: 'ok', text: '申請した日は全部 出勤の打刻あり' }] },
  { id: 'c8', personId: 's0461', person: '佐藤 光', site: 'H社（渋谷）', kind: '通勤（日ごと）', month: '10月', amount: 6300, detail: '14日・往復 450円', source: '手入力', filedAt: '10/23 7:30',
    checks: [{ tone: 'warn', text: '10/23 は欠勤の連絡あり。今日の分は入っていない（問題なし）' }, { tone: 'ok', text: '申請した日は全部 出勤の打刻あり' }] },
  { id: 'c9', personId: 's0480', person: '森 拓海', site: 'K社（品川）', kind: '通勤（日ごと）', month: '10月', amount: 4800, detail: '15日・往復 320円', source: 'ICカードから', filedAt: '10/22 22:45',
    checks: [{ tone: 'ok', text: 'ICカードの利用履歴どおり' }, { tone: 'ok', text: '申請した日は全部 出勤の打刻あり' }] },
];
export const KEIHI_REJECT = ['出勤の打刻が無い日が入っている', '運賃が経路と合わない', '領収書が読めない・無い', '定期の期間が書かれていない', '現場が変わる（経路を直してほしい）'];
