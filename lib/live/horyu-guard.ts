// 保留（/horyu）の書き込みルートで使う小さな確かめ（本文の形を決めた形だけ通す）。純粋な関数だけ
export const str = (v: unknown, max = 200) => String(v ?? '').trim().slice(0, max);
export const isYm = (v: unknown) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(v ?? ''));
export const isYmd = (v: unknown) => /^\d{4}-\d{2}-\d{2}$/.test(String(v ?? ''));
/** 行の id（uuid や数字）。記号は - と _ だけ */
export const isId = (v: unknown) => /^[A-Za-z0-9_-]{1,64}$/.test(String(v ?? ''));
/** 客先向けリンクの鍵（今のシステムは base64url の32文字） */
export const isClientKey = (v: unknown) => /^[A-Za-z0-9_-]{16,128}$/.test(String(v ?? ''));
export const bad = (error: string, status = 400) => Response.json({ error }, { status });
