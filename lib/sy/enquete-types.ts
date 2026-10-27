// 自前のアンケートフォーム（2026-10-08 shoya「アンケートフォームを作成して 回答URLも生成できるやつ・使用感は Googleフォームと同じ」）。
//   作る＝/enquete（内勤・ログインあり）／答える＝/f/<id>（ログイン不要）。表は saiyou.enq_forms / enq_responses（supabase/0018）
//   ★「イベント出欠」（/events・lib/forms*.ts）は Googleフォームの回答シートを読むだけの別もの
//   ★答えるページには「それゆけ未経験」を出さない（/m・/k と同じ決まり）。URL のホストも /m と同じ saiyou-app.vercel.app
export const ENQ_PAGE = '/enquete';
export const ENQ_HOST = 'https://saiyou-app.vercel.app';
export const answerUrl = (id: string, origin = ENQ_HOST) => `${origin}/f/${id}`;

export type QType = 'short' | 'long' | 'radio' | 'checkbox' | 'select' | 'scale' | 'date' | 'time';
// 並びと呼び名は Googleフォームの「質問の種類」と同じ
export const Q_TYPES: [QType, string][] = [
  ['short', '記述式'], ['long', '段落'], ['radio', 'ラジオボタン'], ['checkbox', 'チェックボックス'],
  ['select', 'プルダウン'], ['scale', '均等目盛'], ['date', '日付'], ['time', '時刻'],
];
export const hasOptions = (t: QType) => t === 'radio' || t === 'checkbox' || t === 'select';
export interface Question {
  id: string; type: QType; title: string; help: string; required: boolean;
  options: string[]; other: boolean;                              // 選択式（other＝「その他」の自由記入。プルダウンには無い）
  min: number; max: number; minLabel: string; maxLabel: string;   // 均等目盛
}
export interface FormSettings { design: Design; confirm: string; again: boolean }
export interface EnqForm {
  id: string; title: string; description: string; questions: Question[]; settings: FormSettings; accepting: boolean;
  created_by: string; created_at: string; updated_at: string; count?: number;
}
export type Answer = string | string[];
export interface EnqResponse { id: string; answers: Record<string, Answer>; created_at: string }

// 答えるページのデザイン（2026-10-09 shoya「Googleフォームすぎる」→ 見本10個を見て「設定の段階で選べるように」）。
//   見た目は app/globals.css の `.enq[data-design=…]`。flow＝出し方（list 全問を1ページ／step 1問ずつ／chat 会話）
//   swatch＝設定の見本に使う色（地・主役・カード）。足すときは ここに1行＋globals.css に1かたまり
export type Design = 'ig' | 'chat' | 'step' | 'term' | 'pop' | 'soft' | 'note' | 'ios' | 'dark' | 'tile';
export const DESIGNS: { key: Design; label: string; sub: string; flow: 'list' | 'step' | 'chat'; swatch: [string, string, string] }[] = [
  { key: 'ig', label: 'シンプル', sub: '白＋細い線＋青', flow: 'list', swatch: ['#fafafa', '#0095f6', '#ffffff'] },
  { key: 'chat', label: 'チャット風', sub: '会話で1問ずつ', flow: 'chat', swatch: ['#8cabd9', '#8de055', '#ffffff'] },
  { key: 'step', label: '1問ずつ大きく', sub: '白黒・進み具合の線', flow: 'step', swatch: ['#ffffff', '#111111', '#ffffff'] },
  { key: 'term', label: 'ターミナル風', sub: '黒地に緑の文字', flow: 'list', swatch: ['#0c0f0d', '#4ade80', '#161b18'] },
  { key: 'pop', label: 'ポップ', sub: '太い線・ずらした影', flow: 'list', swatch: ['#ffe14d', '#ff6b9d', '#ffffff'] },
  { key: 'soft', label: 'やわらか', sub: '淡いグラデーション', flow: 'list', swatch: ['linear-gradient(160deg,#ffd6e8,#d9e4ff 55%,#d3f5ee)', '#8b7bff', '#ffffff'] },
  { key: 'note', label: 'ノート', sub: '罫線の紙', flow: 'list', swatch: ['#fffdf5', '#e0442e', '#fffdf5'] },
  { key: 'ios', label: '設定アプリ風', sub: '灰色の地・白い行', flow: 'list', swatch: ['#f2f2f7', '#007aff', '#ffffff'] },
  { key: 'dark', label: 'ダーク', sub: '黒地に蛍光1色', flow: 'list', swatch: ['#101014', '#b4ff39', '#1b1b22'] },
  { key: 'tile', label: '大きいタイル', sub: '押しやすい四角・暖色', flow: 'list', swatch: ['#fff7ef', '#ff7a3d', '#ffffff'] },
];
export const designOf = (key: unknown) => DESIGNS.find((d) => d.key === key) || DESIGNS[0];
export const DEFAULT_CONFIRM = '回答を記録しました。';
export const DEFAULT_SETTINGS: FormSettings = { design: 'ig', confirm: DEFAULT_CONFIRM, again: true };
export const LIMITS = { questions: 100, options: 50, title: 300, text: 5000, short: 500 };

export const newId = () => Math.random().toString(36).slice(2, 10);
export function newQuestion(type: QType = 'radio'): Question {
  return { id: newId(), type, title: '', help: '', required: false, options: ['選択肢 1'], other: false, min: 1, max: 5, minLabel: '', maxLabel: '' };
}

const str = (v: unknown, max: number) => String(v ?? '').slice(0, max);
const int = (v: unknown, lo: number, hi: number, d: number) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
// 保存の前に形をそろえる（画面から来たものを そのまま信じない）
export function cleanQuestions(v: unknown): Question[] {
  const seen = new Set<string>();
  return (Array.isArray(v) ? v : []).slice(0, LIMITS.questions).map((x) => {
    const o = (x || {}) as Partial<Question>;
    const type = (Q_TYPES.some(([t]) => t === o.type) ? o.type : 'short') as QType;
    let id = str(o.id, 20).replace(/[^A-Za-z0-9_-]/g, '') || newId();
    while (seen.has(id)) id = newId();
    seen.add(id);
    const options = (Array.isArray(o.options) ? o.options : []).slice(0, LIMITS.options).map((s) => str(s, LIMITS.short));
    return {
      id, type, title: str(o.title, LIMITS.title), help: str(o.help, LIMITS.short), required: !!o.required,
      options: hasOptions(type) && !options.length ? ['選択肢 1'] : options, other: !!o.other && type !== 'select',
      min: int(o.min, 0, 1, 1), max: int(o.max, 2, 10, 5), minLabel: str(o.minLabel, 50), maxLabel: str(o.maxLabel, 50),
    };
  });
}
export function cleanSettings(v: unknown): FormSettings {
  const o = (v || {}) as Partial<FormSettings>;
  return { design: designOf(o.design).key, confirm: str(o.confirm ?? DEFAULT_CONFIRM, LIMITS.short), again: o.again !== false };
}
// 答えるページに出す選択肢（空の行と だぶりは出さない）
export const optionsOf = (q: Question) => [...new Set(q.options.map((s) => s.trim()).filter(Boolean))];
export const scaleOf = (q: Question) => Array.from({ length: q.max - q.min + 1 }, (_, i) => String(q.min + i));

// 回答の確かめ。画面（送る前）とサーバ（保存の前）で同じものを使う。errors は 設問の id → 文
export function checkAnswers(questions: Question[], raw: Record<string, unknown>): { answers: Record<string, Answer>; errors: Record<string, string> } {
  const answers: Record<string, Answer> = {}; const errors: Record<string, string> = {};
  for (const q of questions) {
    const v = raw?.[q.id]; const opts = optionsOf(q);
    if (q.type === 'checkbox') {
      const xs = [...new Set((Array.isArray(v) ? v : []).map((s) => str(s, LIMITS.short).trim()).filter(Boolean))].slice(0, LIMITS.options + 1);
      if (xs.filter((s) => !opts.includes(s)).length > (q.other ? 1 : 0)) { errors[q.id] = '選択肢から選んでください'; continue; }
      if (xs.length) answers[q.id] = xs; else if (q.required) errors[q.id] = 'この質問は必須です';
      continue;
    }
    const s = str(Array.isArray(v) ? '' : v, q.type === 'long' ? LIMITS.text : LIMITS.short).trim();
    if (!s) { if (q.required) errors[q.id] = 'この質問は必須です'; continue; }
    if ((q.type === 'radio' && !q.other && !opts.includes(s)) || (q.type === 'select' && !opts.includes(s))) errors[q.id] = '選択肢から選んでください';
    else if (q.type === 'scale' && !scaleOf(q).includes(s)) errors[q.id] = '目盛から選んでください';
    else if (q.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(s)) errors[q.id] = '日付を入れてください';
    else if (q.type === 'time' && !/^\d{2}:\d{2}$/.test(s)) errors[q.id] = '時刻を入れてください';
    else answers[q.id] = s;
  }
  return { answers, errors };
}
export const answerText = (a: Answer | undefined) => (Array.isArray(a) ? a.join(', ') : a || '');
export const jst = (iso: string) => new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
