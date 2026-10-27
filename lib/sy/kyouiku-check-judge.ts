import 'server-only';
import { db, likePrefix } from './db';
import { CHECK_PREFIX, CHECK_QS, CHECK_SUBJECTS, DONT_KNOW, typingScore, type CheckPart, type CheckReview, type CheckState, type CheckSubject, type CheckTag, type KnowledgeSubject } from './kyouiku-check';

// スキルチェック（lib/kyouiku-check.ts）の 正解・採点・記録。★ここはサーバだけ（正解を画面に渡さない）
//   ANSWERS = 正解の選択肢の番号（0〜3）。SHORT = 内勤の画面に出す 問題の短い名前（答えが透けるので 受講ページには渡さない）
const ANSWERS: Record<string, number> = {
  o1: 1, o2: 2, o3: 3, o4: 2, o5: 1, o6: 0, o7: 0, o8: 2, o9: 2, o10: 3,
  i1: 0, i2: 2, i3: 1, i4: 3, i5: 1, i6: 2, i7: 0, i8: 1, i9: 3, i10: 2,
  m1: 1, m2: 1, m3: 1, m4: 0, m5: 1, m6: 1, m7: 2, m8: 2, m9: 2, m10: 2,
};
const SHORT: Record<string, string> = {
  o1: '掛け算の式', o2: 'BCC', o3: 'PDF で送る', o4: '絶対参照のコピー', o5: 'IF の入れ子', o6: 'SUMIF', o7: 'ウィンドウ枠の固定', o8: 'VLOOKUP の列番号', o9: '#N/A の原因', o10: 'ピボットテーブル',
  i1: 'フィッシング', i2: 'OS とは', i3: '2要素認証', i4: 'KB・MB・GB・TB', i5: 'CSV', i6: 'https', i7: 'ランサムウェア', i8: 'DNS', i9: 'VPN', i10: 'ソーシャルエンジニアリング',
  m1: '遅刻・欠勤の連絡', m2: '身内に敬称をつけない', m3: '入館証の紛失', m4: '承知いたしました', m5: '貸与PCにソフトを入れない', m6: 'ミスの報告', m7: '契約に関わる話は自社へ', m8: 'SNS に書かない', m9: 'つらい時は自社に相談', m10: '資料を持ち出さない',
};
// 解説（ビジネスマナーだけ。答え合わせの画面に出す）。★文は Claude が書いた
const WHY: Record<string, string> = {
  m1: '遅刻や欠勤は、分かった時点で 始業の前に連絡します。連絡先は 自社の担当者と常駐先の両方で、決められた方法を使います。個人あてのメッセージや 後からの連絡では、連絡したことになりません。',
  m2: '社外の人に話す時、自分の会社の人は「身内」です。「さん」「様」や「いらっしゃる」「来られる」は付けず、「弊社の佐藤が うかがいます」と へりくだった言い方にします。',
  m3: '入館証は 常駐先の安全に関わる借り物です。悪用される前に止めてもらう必要があるので、すぐに 常駐先と自社の両方へ報告します。人の入館証で一緒に入るのは ルール違反です。',
  m4: '「承知いたしました」が いちばん丁寧です。「了解です」は お客様や目上の人には軽く聞こえます。「ご苦労さまです」は 目上の人が目下の人にかける言葉です。',
  m5: '借りているパソコンは 常駐先のものです。許可のないソフトは ウイルスや情報もれ、ライセンス違反の原因になります。ほかの人が使っていても、後で消すつもりでも、まず担当者に確かめます。',
  m6: 'ミスは 早く伝えるほど 小さく収まります。黙って直すと、影響がどこまで出たかを誰も確かめられず、後で分かった時に信用を失います。現場の担当者に事実を伝え、自社にも共有します。',
  m7: '仕事の内容・残業・期間は、会社と会社の契約で決まっています。自分の判断で 引き受けても 断っても いけません。その場では決めず、自社の担当者に伝えて 会社どうしで調整してもらいます。',
  m8: '会社名を出さなくても、内容や 写真の写り込みから 特定されることがあります。秘密を守る約束は、その現場を離れた後も続きます。仕事の内容や 画面・室内の写真は 投稿しません。',
  m9: '一人で抱えこまず、早めに自社の担当者へ相談します。仕事の内容や環境を調整するのは 自社の役目です。常駐先に直接「辞めたい」と伝えたり、連絡なしで休んだりすると、契約の問題になります。',
  m10: '自分のメール・USB メモリ・自分のクラウドは、どれも「持ち出し」で、情報もれの原因になります。パスワードを付けても同じです。終わらないこと自体を 担当者に相談します。',
};

const tagsOf = (qs: { tag: string }[], correct: boolean[]): CheckTag[] => {
  const out: CheckTag[] = [];
  qs.forEach((q, k) => { let t = out.find((x) => x.tag === q.tag); if (!t) { t = { tag: q.tag, ok: 0, total: 0 }; out.push(t); } t.total++; if (correct[k]) t.ok++; });
  return out;
};

// 4択の採点。answers = 問題の順に 0〜3（選んだ番号）か DONT_KNOW。全部の問題に答えていなければ null
export interface KnowledgeDetail { score: number; answers: number[]; correct: boolean[]; tags: CheckTag[]; self: boolean }
export function gradeKnowledge(subject: KnowledgeSubject, raw: unknown): Omit<KnowledgeDetail, 'self'> | null {
  const qs = CHECK_QS[subject];
  if (!Array.isArray(raw) || raw.length !== qs.length) return null;
  const answers = raw.map((v) => Number(v));
  if (answers.some((n) => !Number.isInteger(n) || n < 0 || n > DONT_KNOW)) return null;
  const correct = qs.map((q, k) => answers[k] === ANSWERS[q.id]);
  return { score: Math.round((correct.filter(Boolean).length / qs.length) * 100), answers, correct, tags: tagsOf(qs, correct) };
}

// タイピングの結果を整える。速さ・正確さ・点は ここで（サーバで）決め直す。最後まで打っていない回（キーが少なすぎる）は 受け付けない
export interface TypingDetail { score: number; kpm: number; accuracy: number; keys: number; miss: number; sec: number; self: boolean }
export const CHECK_MIN_KEYS = 250;   // 10文を いちばん短いつづりで打っても これより多い（tools/typing-exam-check.ts が確かめる）
export function cleanCheckTyping(raw: unknown): Omit<TypingDetail, 'self'> | null {
  const r = (raw || {}) as Record<string, unknown>;
  const n = (v: unknown, lo: number, hi: number) => { const x = Number(v); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : lo; };
  const keys = Math.round(n(r.keys, 0, 5000)); const miss = Math.round(n(r.miss, 0, 5000)); const sec = Math.round(n(r.ms, 0, 3600_000) / 100) / 10;
  if (keys < CHECK_MIN_KEYS || sec < 5) return null;
  const kpm = Math.min(1500, Math.round((keys * 60) / sec)); const accuracy = Math.round((keys / (keys + miss)) * 1000) / 1000;
  return { score: typingScore(kpm, accuracy), kpm, accuracy, keys, miss, sec };
}

// 記録（quest が '_check:' で始まる行・古い順）。subject を省くと全員ぶん
export interface CheckRow { subject_key: string; quest: string; detail: Partial<KnowledgeDetail & TypingDetail> | null; created_at: string }
export async function loadCheck(subject?: string): Promise<CheckRow[]> {
  try {
    let q = db().from('kyouiku_progress').select('subject_key,quest,detail,created_at').like('quest', likePrefix(CHECK_PREFIX)).order('id', { ascending: true }).limit(20000);
    if (subject) q = q.eq('subject_key', subject);
    const { data, error } = await q;
    return error ? [] : ((data || []) as CheckRow[]);
  } catch { return []; }
}

const IDS = CHECK_SUBJECTS.map((s) => s.id);
const avgOf = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, n) => s + n, 0) / xs.length) : null);
const subjectOf = (quest: string) => { const id = quest.slice(CHECK_PREFIX.length) as CheckSubject; return IDS.includes(id) ? id : null; };

// 受講ページに返す まとめ（いちばん新しい回。どの問題が合っていたかは 入れない）。auto = 最初に案内を自動で出す人か（内勤のお試しには出さない）
export function checkState(rows: CheckRow[], auto: boolean): CheckState {
  const parts: CheckState['parts'] = { office: null, it: null, manner: null, typing: null };
  for (const r of rows) {
    const id = subjectOf(r.quest); const d = r.detail; if (!id || !d) continue;
    const p: CheckPart = { score: Number(d.score || 0), at: r.created_at };
    if (id === 'typing') { p.kpm = Number(d.kpm || 0); p.accuracy = Number(d.accuracy || 0); } else p.tags = Array.isArray(d.tags) ? d.tags : [];
    parts[id] = p;
  }
  const got = IDS.map((id) => parts[id]).filter((p): p is CheckPart => !!p);
  return { parts, taken: got.length, avg: avgOf(got.map((p) => p.score)), auto };
}

// 内勤の画面（/kyouiku 受講データ）に出す まとめ。科目ごとに 初回と最新・受けた回数・分野別・問題ごとの ○×（最新の回）
export interface CheckAdminPart { first: number; last: number; plays: number; firstAt: string; lastAt: string; tags: CheckTag[]; items: { label: string; tag: string; ok: boolean; dk: boolean }[]; kpm: number; accuracy: number }
export interface CheckAdmin { parts: Record<CheckSubject, CheckAdminPart | null>; taken: number; avg: number | null; firstAvg: number | null; self: boolean }
export function checkAdmin(rows: CheckRow[]): CheckAdmin | null {
  const parts: CheckAdmin['parts'] = { office: null, it: null, manner: null, typing: null };
  let self = false;
  for (const r of rows) {
    const id = subjectOf(r.quest); const d = r.detail; if (!id || !d) continue;
    if (d.self) self = true;
    const score = Number(d.score || 0);
    const cur = parts[id] || (parts[id] = { first: score, last: score, plays: 0, firstAt: r.created_at, lastAt: r.created_at, tags: [], items: [], kpm: 0, accuracy: 0 });
    cur.plays++; cur.last = score; cur.lastAt = r.created_at;
    if (id === 'typing') { cur.kpm = Number(d.kpm || 0); cur.accuracy = Number(d.accuracy || 0); }
    else {
      const qs = CHECK_QS[id]; const correct = Array.isArray(d.correct) ? d.correct : []; const answers = Array.isArray(d.answers) ? d.answers : [];
      cur.tags = Array.isArray(d.tags) ? d.tags : [];
      cur.items = qs.map((q, k) => ({ label: SHORT[q.id] || q.id, tag: q.tag, ok: !!correct[k], dk: answers[k] === DONT_KNOW }));
    }
  }
  const got = IDS.map((id) => parts[id]).filter((p): p is CheckAdminPart => !!p);
  if (!got.length) return null;
  return { parts, taken: got.length, avg: avgOf(got.map((p) => p.last)), firstAvg: avgOf(got.map((p) => p.first)), self };
}

// 答え合わせ（受講ページの結果から開く）。受け終えた 4択の科目だけ・いちばん新しい回。正解を返すのは ここだけ（まだ受けていない科目は 返さない）
export function checkReview(rows: CheckRow[]): CheckReview {
  const out: CheckReview = {};
  for (const r of rows) {
    const id = subjectOf(r.quest); const d = r.detail;
    if (!id || id === 'typing' || !d || !Array.isArray(d.answers)) continue;
    const answers = d.answers;
    out[id] = CHECK_QS[id].map((q, k) => ({ mine: Number(answers[k] ?? DONT_KNOW), right: ANSWERS[q.id], ok: answers[k] === ANSWERS[q.id], ...(WHY[q.id] ? { why: WHY[q.id] } : {}) }));
  }
  return out;
}
