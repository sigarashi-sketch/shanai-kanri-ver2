// 労務法務ナレッジ：今の社内システムの形 → この画面の型。
//   読むのは GET /api/kb?action=list（記事の一覧・本文なし）、?action=get&id=（1件の本文）、
//   ?action=testSearch&q=（よろづや bot と同じ検索。bot がその質問で拾う記事）。
//   ★今のシステムの分類は 労務／法務／社内制度／経費・精算／ポータル／その他。会社ごと（'共通'＝全社）の記事がある
//   ★「役に立った」は今のシステムの印（roumu_marks kind=kb-helpful）。「やってはいけない」は記事のタグ・題名から見分ける（kbDont・10-27）
export type IkeKbRow = { id: string; title: string; company: string; category: string; tags: string[]; source: string; published: boolean; updated_by?: string; updated_at?: string; length: number };
export type IkeKbList = { ok: boolean; error?: string; rows: IkeKbRow[]; total: number; companies: string[]; categories: string[]; counts: { all: number; published: number } };
export type IkeKbGet = { ok: boolean; error?: string; article?: { id: string; title: string; body: string; category: string; company: string; tags: string[]; source: string; published: boolean } };
export type IkeKbSearch = { ok: boolean; query: string; tokens: string[]; note: string; hits: { id: string; title: string; company: string; category: string; score: number; matched: string[] }[] };

/** 本文を段落ごとに（空行・改行で区切る）。見出し記号は落とす */
export function kbParas(body: string): string[] {
  return String(body || '').split(/\n+/).map((x) => x.replace(/^\s*(#+|[-*・])\s*/, '').trim()).filter(Boolean);
}

export function kbHit(r: IkeKbRow, words: string[]): boolean {
  const hay = `${r.title} ${r.tags.join(' ')} ${r.company}`;
  return words.every((w) => hay.includes(w));
}

// 「やってはいけない」記事か（10-27）。今のシステムに専用の印は無いので、タグか題名で見分ける：
//   タグに「やってはいけない」「禁止」「NG」を付けた記事／題名に 偽装請負・多重派遣・二重派遣・禁止 が入る記事
const DONT_TAGS = ['やってはいけない', '禁止', 'NG', 'ng'];
const DONT_WORDS = ['偽装請負', '多重派遣', '二重派遣', '禁止', 'やってはいけない'];
export function kbDont(r: Pick<IkeKbRow, 'title' | 'tags'>): boolean {
  return (r.tags || []).some((t) => DONT_TAGS.includes(String(t).trim())) || DONT_WORDS.some((w) => String(r.title || '').includes(w));
}
