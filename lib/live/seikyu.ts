// 請求書：今の社内システムの GET /api/seikyu?action=list&cache=1[&ym=YYYY-MM] の形 → この画面の「取引先ごと・人ごと」。
//   ★請求まわりは今の仕様を崩さない（メモリ feedback-v2-seikyu-spec-frozen）。段階・止まっている理由・金額・答え合わせは
//     今の API の答えをそのまま出すだけで、ver2 側では計算し直さない。並べ方（上位会社ごとにまとめる）だけここで決める
//   ★cache=1 を必ず付ける：付けないと今のシステムが全員ぶんを計算し直して結果を DB（seikyu_list_cache）に書くため。
//     cache=1 は前回の計算結果を読むだけ（今の請求書の画面が開かれるたびに作り直される）
export type SeikyuStage = 'waiting' | 'needs' | 'review' | 'check1' | 'confirmed' | 'issued' | 'sent';
export const SEIKYU_STAGES: SeikyuStage[] = ['waiting', 'needs', 'review', 'check1', 'confirmed', 'issued', 'sent'];
// 今の請求書の画面（seikyu.html）の呼び名のまま
export const SEIKYU_STAGE: Record<SeikyuStage, { label: string; hint: string; tone: string }> = {
  waiting: { label: '勤務表待ち', hint: 'ミンミカで時間が未入力・勤務表が未着・freee勤怠が月末まで無い', tone: 'info' },
  needs: { label: '要対応', hint: '単価・精算が読めない／宛先が無い', tone: 'bad' },
  review: { label: '確認待ち', hint: '下書きはできた。人の目で確認', tone: 'warn' },
  check1: { label: '第1確認OK', hint: '請求書作成で第1確認した。次は確定', tone: 'purple' },
  confirmed: { label: '確定', hint: 'freeeで請求書を作る', tone: 'ok' },
  issued: { label: '送付待ち', hint: 'ミンミカ・freeeに請求書あり（時間も入っている）', tone: 'caution' },
  sent: { label: '送付ずみ', hint: 'freeeから送付した', tone: 'mute' },
};
const HOURS_FROM: Record<string, string> = {
  freee: 'freee 勤怠', sheet: '勤務表', sheet_missing: '勤務表（まだ読んでいない）', table: '明細表', table_missing: '明細表（まだ）',
  kot: 'KOT', kot_missing: 'KOT（まだ）', manual: '手入力',
};
const CHECK_LABEL: Record<string, { label: string; tone: string }> = {
  match: { label: '1円まで一致', tone: 'ok' }, near: { label: 'ほぼ一致', tone: 'caution' }, diff: { label: '差あり', tone: 'bad' },
  dup: { label: '重なり', tone: 'warn' }, draft: { label: '作りかけ', tone: 'mute' },
};

type Chk = { diff: number; kind: string } | null;
export type SeikyuItemLive = {
  key: string; name: string; joi: string; shozoku: string; stage: SeikyuStage; reasons: string[];
  partner: string; site: string; genba?: string; subtotal: number; tax: number; total: number;
  workHours: number | null; hoursFrom: string; check: Chk; checkMnm: Chk; confirmed: { total: number; by: string; at: string } | null;
};
export type SeikyuListLive = {
  ok: boolean; cached?: boolean; ym: string; months?: string[]; builtAt?: string; today?: string;
  counts?: Record<SeikyuStage, number>;
  totals?: { people: number; draftTotal: number };
  items?: SeikyuItemLive[]; error?: string | { message?: string };
};

export type LivePerson = {
  key: string; name: string; stage: SeikyuStage; reason: string; more: number; hours: string; hoursFrom: string; subtotal: number; total: number;
  genba: string; mnm: LiveCheck | null; freee: LiveCheck | null; confirmedBy: string;
};
export type LiveCheck = { label: string; tone: string; diff: number; kind: string };
export type LiveClient = { id: string; name: string; site: string; people: LivePerson[]; stop: number; sent: number };
export type SeikyuLive = {
  ym: string; months: string[]; builtAt: string; noCache: boolean; people: number; draftTotal: number; stop: number;
  counts: Record<SeikyuStage, number>; clients: LiveClient[];
};

const chk = (c: Chk) => (c && CHECK_LABEL[c.kind] ? { ...CHECK_LABEL[c.kind], diff: c.diff, kind: c.kind } : null);
const isStop = (s: SeikyuStage) => s === 'waiting' || s === 'needs';

export function toSeikyu(j: SeikyuListLive | null): SeikyuLive | null {
  if (!j) return null;
  const counts = Object.fromEntries(SEIKYU_STAGES.map((s) => [s, j.counts?.[s] ?? 0])) as Record<SeikyuStage, number>;
  const base = { ym: j.ym, months: j.months || [], builtAt: j.builtAt || '', counts };
  if (!j.ok || !j.items) return { ...base, noCache: j.cached === false, people: 0, draftTotal: 0, stop: 0, clients: [] };
  const by = new Map<string, LiveClient>();
  for (const i of j.items) {
    const name = i.joi || '（上位会社が決まらない）';
    let c = by.get(name);
    if (!c) { c = { id: `co-${by.size}`, name, site: i.site || '', people: [], stop: 0, sent: 0 }; by.set(name, c); }
    c.people.push({
      key: i.key, name: i.name, stage: i.stage, reason: i.reasons?.[0] || '', more: Math.max(0, (i.reasons?.length || 0) - 1),
      hours: i.workHours == null ? '—' : `${i.workHours}h`, hoursFrom: HOURS_FROM[i.hoursFrom] || i.hoursFrom || '', subtotal: i.subtotal, total: i.total, genba: i.genba || '',
      mnm: chk(i.checkMnm), freee: chk(i.check), confirmedBy: i.confirmed ? `${i.confirmed.by} ${i.confirmed.at.slice(5, 10).replace('-', '/')}` : '',
    });
    if (isStop(i.stage)) c.stop++;
    if (i.stage === 'sent') c.sent++;
  }
  for (const c of by.values()) c.people.sort((a, b) => SEIKYU_STAGES.indexOf(a.stage) - SEIKYU_STAGES.indexOf(b.stage));
  const clients = [...by.values()].sort((a, b) => b.stop - a.stop || (b.people.length - b.sent) - (a.people.length - a.sent) || a.name.localeCompare(b.name, 'ja'));
  return {
    ...base, noCache: false, people: j.totals?.people ?? j.items.length, draftTotal: j.totals?.draftTotal ?? 0,
    stop: counts.waiting + counts.needs, clients,
  };
}
