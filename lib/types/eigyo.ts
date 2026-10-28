// 営業の画面（案件・待機）の行の形。本物の行（lib/live/cases.ts・lib/live/taiki.ts）がこの形を作る。
//   ・ここには本物の名前・単価・顧客名を書かない（形とキー名だけ）

export type Shouryu = 'エンド直' | '元請けから' | '二次請けから' | '不明';   // 不明＝本物（今のシステムは商流を列で持っていない）
export type StockCase = {
  no: string; name: string; place: string; station: string; priceMin: number; priceMax: number;
  skills: string[]; shouryu: Shouryu; deadline: string; daysLeft: number; start: string; work: string;
};

export const TAIKI_STATES = ['案件を探す', '案件を送った', '面談調整中', '参画決定', 'いったん保留'] as const;
export type TaikiState = (typeof TAIKI_STATES)[number];
export type Taiki = {
  id: string; name: string; kind: '待機中' | 'もうすぐ待機';
  since?: string;       // 待機に入った日（待機中）
  contractEnd?: string; // 今の現場の契約終了日（もうすぐ待機）
  site?: string;
  station: string; want: string; skills: string[]; price: number; // 希望単価（万）。本物のリストには無い＝0
  sales: string; recruiter: string; state: TaikiState;
};

const DAY = 86400000;
export const daysBetween = (a: string, b: string) => Math.round((new Date(b).getTime() - new Date(a).getTime()) / DAY);
/** 待機中＝待機に入ってから何日目／もうすぐ待機＝契約終了まであと何日。日が無ければ -1 */
export const taikiDays = (t: Taiki, today: string) => (t.kind === '待機中' ? (t.since ? daysBetween(t.since, today) : -1) : t.contractEnd ? daysBetween(today, t.contractEnd) : -1);

// ---- 案件進捗 ----
//   1行＝「1つの案件を1人に送った」。送った経路を via で持つ（あおい／グループ直接／手動配信）
export type Via = 'あおい' | 'グループ直接' | '手動配信';
export type Decision = 'OK' | 'NG' | 'その他' | '未判断';   // その他＝今の📮判断の「その他」
export type Case = { no: string; name: string; place: string; price: string; body?: string };   // body＝案件の本文（配信ごとのカードで開く）
/** 引用リプライの引用元（found=false は引用元が残っていない） */
export type Quoted = { found?: boolean; text?: string; sender?: string };
export type ProgressRow = {
  id: string; caseNo: string; person: string; personId: string; group: string;
  via: Via; sentAt: string; sender: string;
  reply: string; replyAt?: string; decision: Decision; slack?: boolean;
  sentMs?: number; replyMs?: number;   // 送った・返信の時刻（配信ごとの「◯時間以内」「◯日経過」）
  quoted?: Quoted;                     // 最初の返信が引用リプライなら、その引用元
};
/** グループのやりとり（前後を見る用）。who='staff' は内勤、'person' は要員、'aoi' はあおい */
export type ChatMsg = { id: string; at: string; who: 'staff' | 'person' | 'aoi'; name: string; text: string; quoted?: Quoted };
export type Candidate = {
  id: string; personId: string; person: string; group: string;
  msgId: string;                 // 案件らしいと拾った発言（前後の中で光らせる）
  poster: string; postedAt: string;
  match: { caseNo: string; score: number } | null; // 案件ストックの本文と照らして一番近い案件。無ければ null
  hint?: string;                 // 拾った理由（画面に小さく出す）
  thread: ChatMsg[];
};

// ---- 要員（プロパー）・スキシ ----
export type Sukishi = {
  state: '作成済み' | '未作成' | '要確認';
  initial: string;
  age: string;
  skills: string;
  start: string;
  history: { period: string; text: string }[];
  warn?: string;
  updated?: string;
};
export type Proper = { id: string; name: string; station: string; status: '営業中' | '参画決定' | '待機' | '稼働中'; sales: string; want: string; price: string; sukishi: Sukishi };

// 面談可能日の承認（/api/availability?action=candidates の答え）
export type AvailCand = {
  normalizedName: string; name: string; displayName: string; groupId: string; groupName: string;
  body: string; srcTsMs: number; status: 'new' | 'updated' | 'same'; currentBody: string; rawText: string; savedBy: string;
};
export type AvailResp = { ok: boolean; tableReady: boolean; hint?: string; candidates: AvailCand[]; counts: { new: number; updated: number; same: number }; scannedReplies: number; days: number };
