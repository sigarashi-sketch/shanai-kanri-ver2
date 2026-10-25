// ホーム人事（/home/jinji）の型と見本。要員の動きを Instagram 風のフィード＋ストーリーで見る。
//   見本の名前は架空（lib/sample.ts の PEOPLE と同じ人＋足した架空の人）。日付は開いた時刻から逆算して作る。
//   本物（ログイン中）は app/api/live/home-jinji が今の社内システムから同じ形で返す（lib/live/home-jinji.ts）。

export type FeedType = 'shoudaku' | 'sankaku' | 'debut' | 'mendan' | 'teiki' | 'jitai' | 'taisha' | 'reassign' | 'line' | 'memo';
export type FeedPerson = { name: string; sales?: string };
export type FeedDetail = { k: string; v: string };
export type FeedPost = { id: string; type: FeedType; at: string; people: FeedPerson[]; text: string; sub: string; details?: FeedDetail[] };
export type HomeJinjiData = {
  posts: FeedPost[];
  scope: 'all' | 'mine';      // mine＝営業：自分が担当営業の人だけ
  me: string;                  // 絞り込みに使った自分の名前（営業のとき）
  missing: FeedType[];         // 本物で読めない種類（見本のまま）
  warnings: string[];
};

export const TYPE_LABEL: Record<FeedType, string> = {
  shoudaku: '承諾', sankaku: '参画決定', debut: '現場デビュー', mendan: '現場面談', teiki: '定期面談',
  jitai: '辞退', taisha: '退社', reassign: '再アサイン', line: 'LINE', memo: 'メモ',
};
// 同じ日に同じ種類が GROUP_MIN 件以上なら1つの投稿にまとめる（お手本と同じ）
export const GROUP_MIN = 4;
export const GROUP_TEXT: Record<FeedType, string> = {
  shoudaku: '承諾。プロパーリストに入りました', sankaku: '参画決定。現場が決まりました', debut: '現場デビュー。今日から入場です',
  mendan: '現場面談がありました', teiki: '定期面談がありました', jitai: '辞退', taisha: '退社', reassign: '再アサイン。次の現場を探します',
  line: '採用LINEを友だち追加しました', memo: 'メモ',
};

export const jstDay = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString().slice(0, 10);

type Raw = { id: string; type: FeedType; at: string; who: FeedPerson; text: string; sub: string; details?: FeedDetail[] };
/** 1件ずつの出来事 → 投稿。同日同種が多いものはまとめる（メモ・定期面談は中身が違うのでまとめない）。新しい順 */
export function toPosts(raw: Raw[]): FeedPost[] {
  const buckets = new Map<string, Raw[]>();
  raw.forEach((r) => { const k = r.type === 'memo' || r.type === 'teiki' ? r.id : r.type + '|' + jstDay(r.at); buckets.set(k, [...(buckets.get(k) || []), r]); });
  const posts: FeedPost[] = [];
  buckets.forEach((rs, k) => {
    if (rs.length < GROUP_MIN) { rs.forEach((r) => posts.push({ id: r.id, type: r.type, at: r.at, people: [r.who], text: r.text, sub: r.sub, ...(r.details?.length ? { details: r.details } : {}) })); return; }
    const seen = new Set<string>(); const people = rs.map((r) => r.who).filter((p) => !seen.has(p.name) && !!seen.add(p.name));
    posts.push({ id: 'g:' + k, type: rs[0].type, at: rs.reduce((a, r) => (r.at > a ? r.at : a), rs[0].at), people, text: GROUP_TEXT[rs[0].type], sub: '' });
  });
  return posts.sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 120);
}

// ---- 見本（架空） ----
const S = (name: string, sales: string): FeedPerson => ({ name, sales });
export function samplePosts(now = Date.now()): FeedPost[] {
  const ago = (h: number) => new Date(now - h * 3600e3).toISOString();
  const today9 = (() => { const d = jstDay(new Date(now).toISOString()); return `${d}T09:00:00+09:00`; })();
  const raw: Raw[] = [
    { id: 's1', type: 'debut', at: today9, who: S('加藤 葵', '田中'), text: '現場デビュー。今日から入場です', sub: '採用担当 田中' },
    { id: 's2', type: 'mendan', at: ago(2), who: S('中村 優', '田中'), text: '現場面談：Web系の運用保守', sub: '営業 田中' },
    { id: 's3', type: 'shoudaku', at: ago(5), who: S('青木 陽', ''), text: '承諾。プロパーリストに入りました', sub: '採用担当 中村' },
    { id: 's4', type: 'teiki', at: ago(7), who: S('山田 太郎', '小林'), text: '定期面談：現場にも慣れてきた様子', sub: '記入 中村',
      details: [{ k: 'これから頑張りたいこと', v: '資格の勉強を続ける' }, { k: '勉強時間', v: '5時間／週' }] },
    { id: 's5', type: 'sankaku', at: ago(20), who: S('森 さくら', '小林'), text: '参画決定。現場が決まりました', sub: '営業 小林' },
    { id: 's6', type: 'shoudaku', at: ago(26), who: S('石井 蓮', ''), text: '承諾。プロパーリストに入りました', sub: '採用担当 田中' },
    ...['松本 湊', '井上 結', '木村 颯', '林 芽依', '清水 樹'].map((n, i) => ({ id: 'sd' + i, type: 'debut' as FeedType, at: ago(49), who: S(n, i % 2 ? '小林' : '田中'), text: '現場デビュー。今日から入場です', sub: '' })),
    { id: 's7', type: 'jitai', at: ago(52), who: S('池田 翼', ''), text: '辞退', sub: '' },
    { id: 's8', type: 'reassign', at: ago(70), who: S('伊藤 誠', '小林'), text: '再アサイン。次の現場を探します', sub: '' },
    { id: 's9', type: 'taisha', at: ago(96), who: S('橋本 光', '田中'), text: '退社', sub: '' },
    { id: 's10', type: 'line', at: ago(100), who: S('岡田 凛', ''), text: '採用LINEを友だち追加しました', sub: '' },
    { id: 's11', type: 'memo', at: ago(120), who: S('鈴木 一郎', '小林'), text: '電話：次の更新の希望を確認', sub: '記入 中村' },
    { id: 's12', type: 'sankaku', at: ago(140), who: S('渡辺 涼', '小林'), text: '参画決定。現場が決まりました', sub: '営業 小林' },
  ];
  return toPosts(raw);
}
