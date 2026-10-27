// 粗利・LTV（/ltv と 名簿の詳細の「粗利・LTV」欄）の型。画面とサーバの両方から読む（lib/ltv.ts は server-only）
//   数字の出どころは いけどんの「想定賃金・粗利」＝月次PLスプシの「要員別（売上・粗利・LTV）」シートと同じ計算
//   （売上＝請求書があれば請求書・無ければ単価×勤怠、粗利＝売上−給与−社保−交通費）。LTV＝粗利の累計（実績）
export interface LtvMonth { sales: number; gross: number; billed?: boolean }
export interface LtvPerson { key: string; name: string; shozoku: string; nyusha: string; months: Record<string, LtvMonth>; sales: number; gross: number }
// label＝その月の数字の確かさ（合計に入った人の7割以上が請求書で確定＝請求書確定、未満＝勤怠仮確定）
export interface LtvBasis { n: number; billed: number; label: string }
export interface LtvData { at: string; months: string[]; people: LtvPerson[]; basis: Record<string, LtvBasis> }
export { LTV_PAGE } from './access-types';
export const yen = (n: number) => Math.round(n).toLocaleString('ja-JP');
export const ymLabel = (ym: string) => `${Number(ym.slice(5))}月`;
