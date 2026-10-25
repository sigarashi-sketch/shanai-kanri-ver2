// スキルシート作成（人事管理）の形。今の社内システムの /api/basic-info・/api/skillsheet が返す形をそのまま使う
//   （本物につないだら中身だけ差し替わる。画面は形を変えない）。
export type SsRow = {
  name: string;
  normalizedName?: string; // 今のシステムの正規化した氏名（一覧の行の見分けに使う）
  gender: string;
  birth: string;
  prefecture: string;
  tantou: string;        // 採用担当
  eki: string;           // 最寄駅
  inRoster: boolean;     // 営業リストにいる
  ambiguous?: boolean;   // 営業リストに同名が複数＝担当/スキシは出さない・生成できない
  rosterId?: string;     // 営業リストに一意にいるときだけ（スキシの保存先）
  sukishi?: string;      // スキルシートのURL（無ければ空）
  pdf_url?: string; pdf_anon_url?: string; xlsx_url?: string; xlsx_anon_url?: string;
};
export type SsStats = { shown: number; inRoster: number; hasSukishi: number; noSukishi: number; hasBirth: number };
export type SsFacet = { v: string; n: number };
export type SsList = {
  ok?: boolean; rows: SsRow[]; total: number; grandTotal: number; offset: number;
  stats: SsStats; facets: { gender: SsFacet[]; pref: SsFacet[]; tantou: SsFacet[] };
  syncedAt?: string | null; rosterError?: string; error?: string; source?: 'live' | 'sample';
};
export type SsQuery = { q: string; gender: string; pref: string; tantou: string; sukishi: '' | 'yes' | 'no'; roster: '' | 'yes' | 'no'; sort: 'desc' | 'asc'; limit: number; offset: number };

// ★健康状況・連絡先・住所・生年月日・緊急連絡先は載せない（サーバの detailOf で落とす・10-25）
export type SsDetail = {
  ok?: boolean; error?: string;
  sheet?: Record<string, string>;
  work?: { company?: string; from?: string; to?: string; emp_type?: string; job_category?: string; description?: string }[];
  analysis?: { label: string; value: string }[];
  submittedAt?: string; durationSec?: number; sheetError?: string; formError?: string;
};

// 生成・PDF・Excel の答え（今の /api/skillsheet と同じ。LINEボットとも共有している形なので変えない）
export type SsResult = {
  ok?: boolean; error?: string; needsConfirm?: boolean; existing?: string;
  url?: string; anonymized?: boolean; anonymizeError?: string; warning?: string;
  pdfUrl?: string; pdfAnonUrl?: string; pdfError?: string;
  xlsxUrl?: string; xlsxAnonUrl?: string; xlsxError?: string;
};
