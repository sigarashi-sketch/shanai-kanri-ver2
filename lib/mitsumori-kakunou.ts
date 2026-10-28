// 見積書の格納（経理管理 /keiri/kakunou の「見積書」タブ・10-28 shoya「請求書 勤怠表の格納の中に 見積書格納するタブもつくって」）。
//   ・今のシステムに見積書の格納は無いので ver2 で作った（請求書・勤務表の格納＝今の画面は そのまま）
//   ・ファイルの実体は いけどん Storage の非公開バケット seikyu-stamped を prefix v2-mitsumori/ で間借り（10MB まで）
//   ・台帳は saiyou.settings の key='v2_mitsumori_kakunou:<id>'（1ファイル1行・app/api/live/mitsumori-kakunou）。消す＝deletedAt を入れるだけ（実体も残す）
export const KK_PREFIX = 'v2_mitsumori_kakunou:';
export const KK_BUCKET = 'seikyu-stamped';
export const KK_MAX_BYTES = 10 * 1024 * 1024;
/** 受け付ける拡張子 → Content-Type */
export const KK_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
};
export const KK_ACCEPT = Object.keys(KK_TYPES).map((x) => '.' + x).join(',');
export const extOf = (name: string) => (/\.([a-z0-9]+)$/i.exec(name)?.[1] || '').toLowerCase();

export type KkFile = {
  id: string;
  name: string;        // 元のファイル名
  path: string;        // Storage のパス（画面には出さない）
  size: number;
  ym: string;          // どの月の見積か（YYYY-MM・空でもよい）
  partner: string;     // 取引先
  number: string;      // 見積番号
  memo: string;
  uploadedBy: string;
  uploadedAt: string;
  updatedBy?: string;
  updatedAt?: string;
  deletedAt?: string;
};
