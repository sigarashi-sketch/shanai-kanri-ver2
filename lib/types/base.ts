// 基盤（ホーム・部品）で使う型と小さな道具（10-26 見本ファイル lib/*-sample.ts から移した。データの定数は持たない）
import type { ModuleKey } from '../theme';

/** 名簿の状態（状態の札 <Pill> の型） */
export type Status = '稼働中' | '待機' | '入場予定' | '休職・産休' | '退社';

/** アラートの段階（注意→警告→上限） */
export type Level = 'ok' | 'caution' | 'warn' | 'danger';

/** ホームの「対応が要るもの」「あなたが承認する分」の1行 */
export type Todo = { module: ModuleKey; text: string; n: string; tone: 'bad' | 'warn' | 'plain'; href: string };

/** ホーム人事のフィードの種類（FeedScene の絵） */
export type FeedType = 'shoudaku' | 'sankaku' | 'debut' | 'mendan' | 'teiki' | 'jitai' | 'taisha' | 'reassign' | 'line' | 'memo';

/** 変更の予約の項目ごとの持ち主の分類と「一緒に変わるもの」（ホームの予約の表で使う分だけ） */
export const YOYAKU_FIELD: Record<string, { module: ModuleKey; with: string[] }> = {
  現場: { module: 'roumu', with: ['勤務表の様式', '請求先', '通勤の経路', '36協定の事業所'] },
  単価: { module: 'eigyo', with: ['請求の単価', '想定粗利'] },
  住所: { module: 'jinji', with: ['通勤・定期の見直し', '社員ページの住所'] },
  通勤: { module: 'keiri', with: ['交通費（定期代）', '通勤の経路'] },
  状態: { module: 'jinji', with: ['勤怠の対象', '営業共有リスト', '社保の手続き（労務担当へ）'] },
  転籍: { module: 'jinji', with: ['名簿の所属会社', '勤怠の紐付け（転籍日で割る）', '社保・雇用保険の切り替え（労務担当へ）'] },
};

const WD = ['日', '月', '火', '水', '木', '金', '土'];
/** 2026-10-26 → 10/26（月） */
export const fmtDate = (iso: string) => { const d = new Date(iso + 'T00:00:00'); return `${d.getMonth() + 1}/${d.getDate()}（${WD[d.getDay()]}）`; };
