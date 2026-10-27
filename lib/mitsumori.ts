// 見積書（経理管理・10-27 shoya「経理管理に見積書つくるタブ・請求書作成と同じような実装でいい」）。
//   ・見た目は請求書作成（今の seikyu-make.html）の雛形と同じ A4（freee の請求書の位置・大きさ）。題と「入金期日・振込先」の欄を見積書の形に替えた
//   ・置き場は saiyou.settings の key='v2_mitsumori:<id>'（1枚1行・app/api/live/mitsumori）。消す＝deletedAt を入れるだけ
//   ・金額は 行＝数量×単価（円未満切り捨て）、消費税＝税抜合計×10% を1回だけ切り捨て（請求書作成・freee と同じ）

export type MLine = { head?: boolean; d: string; q: number | null; u: string; p: number | null };
export type MIssuer = { formal: string; regNo: string; email: string; address: string; dept: string; tel: string };
export type MDoc = {
  id: string;
  number: string;
  date: string;        // 見積日 YYYY-MM-DD
  to: string;          // 宛先
  honor: '御中' | '様';
  subject: string;
  validUntil: string;  // 有効期限（文で持つ＝「発行日より30日」も書ける）
  delivery: string;    // 納期・作業期間
  payTerms: string;    // 支払条件
  place: string;       // 作業場所
  remark: string;
  lines: MLine[];
  issuer: MIssuer;
  issuerId: string;    // 今のシステムの発行元（m:名前 / c:id）。空＝手で入れた
  createdBy?: string;
  createdAt?: string;
  updatedBy?: string;
  updatedAt?: string;
  deletedAt?: string;
};

export const KEY_PREFIX = 'v2_mitsumori:';
export const TAX_RATE = 0.1;
export const HONORS = ['御中', '様'] as const;
export const DEFAULT_REMARK = '本見積書の有効期限内にご発注くださいますようお願いいたします。';

export const lineAmount = (l: MLine) => (l.head || l.q == null || l.p == null ? null : Math.floor(l.q * l.p));
export function totals(lines: MLine[]) {
  const subtotal = lines.reduce((a, l) => a + (lineAmount(l) || 0), 0);
  const tax = Math.floor(subtotal * TAX_RATE);
  return { subtotal, tax, total: subtotal + tax };
}

const pad = (n: number) => String(n).padStart(2, '0');
export const todayYmd = () => { const d = new Date(Date.now() + 9 * 3600_000); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
export const ymdJa = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s.slice(0, 4)}年${Number(s.slice(5, 7))}月${Number(s.slice(8))}日` : s);

/** 次の見積番号の案（EST-年月-連番）。同じ月の保存ずみで いちばん大きい番号の次 */
export function nextNumber(saved: Pick<MDoc, 'number'>[], date = todayYmd()): string {
  const head = `EST-${date.slice(0, 4)}${date.slice(5, 7)}-`;
  const max = saved.reduce((m, d) => (d.number.startsWith(head) ? Math.max(m, Number(d.number.slice(head.length)) || 0) : m), 0);
  return head + String(max + 1).padStart(3, '0');
}

export function blankDoc(saved: Pick<MDoc, 'number'>[] = []): MDoc {
  const date = todayYmd();
  return {
    id: '', number: nextNumber(saved, date), date, to: '', honor: '御中', subject: '',
    validUntil: '発行日より30日', delivery: '', payTerms: '月末締め翌月末払い', place: '', remark: DEFAULT_REMARK,
    lines: [{ d: '', q: 1, u: '人月', p: null }],
    issuer: { formal: '', regNo: '', email: '', address: '', dept: '管理部', tel: '' }, issuerId: '',
  };
}

// ── サーバで受け取るときの形の確かめ（画面から来た値をそのまま信じない） ──
const str = (v: unknown, max: number) => String(v ?? '').slice(0, max);
const num = (v: unknown) => (v === null || v === '' || v === undefined ? null : Number.isFinite(Number(v)) ? Number(v) : null);
export function cleanDoc(raw: unknown): Omit<MDoc, 'id' | 'createdBy' | 'createdAt' | 'updatedBy' | 'updatedAt' | 'deletedAt'> | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const lines = Array.isArray(r.lines) ? r.lines.slice(0, 200).map((x) => {
    const l = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>;
    return l.head ? { head: true, d: str(l.d, 200), q: null, u: '', p: null } : { d: str(l.d, 200), q: num(l.q), u: str(l.u, 20), p: num(l.p) };
  }) : [];
  const is = (r.issuer && typeof r.issuer === 'object' ? r.issuer : {}) as Record<string, unknown>;
  return {
    number: str(r.number, 40), date: str(r.date, 10), to: str(r.to, 120), honor: r.honor === '様' ? '様' : '御中', subject: str(r.subject, 200),
    validUntil: str(r.validUntil, 60), delivery: str(r.delivery, 120), payTerms: str(r.payTerms, 120), place: str(r.place, 120), remark: str(r.remark, 1000),
    lines,
    issuer: { formal: str(is.formal, 120), regNo: str(is.regNo, 40), email: str(is.email, 120), address: str(is.address, 300), dept: str(is.dept, 60), tel: str(is.tel, 40) },
    issuerId: str(r.issuerId, 120),
  };
}
