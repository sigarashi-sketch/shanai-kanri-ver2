// 面談のリマインド（2026-10-09 shoya「3日前以上に予約されたら 3日前→1日前→当日／前日に予約されたら 当日／当日に予約されたら なにもしない」）。
//   対象は 公式LINE のメニューから予約した 定期面談・リーダー面談（/m/mendan）。画面とサーバの両方から読む（lib/mendan-remind.ts は server-only）
//   ★いつ送るか: 3日前・1日前・当日 の それぞれの日の「送る時刻」。1日前・当日の分は **その日が 予約した日より後のときだけ**送る
//     （前日に予約した人に 1日前の分・当日に予約した人に 当日の分 は出さない）。
//     **3日前の分だけは ちょうど3日前に予約した人にも送る**（同日 shoya「3日前ちょうどでも送る」）。ただし その日の送る時刻を過ぎてから予約した人には出さない
//     （予約の確認のすぐあとに もう1通届くことになるため。shoya「その場合だけ出さない」）
//       3日以上前に予約 → 3日前・1日前・当日／2日前に予約 → 1日前・当日／前日に予約 → 当日／当日に予約 → なし
//   ★日付は 日本時間で数える。保存先は saiyou.settings key='mendan_remind'

export const STEP_KEYS = ['d3', 'd1', 'd0'] as const;
export type StepKey = (typeof STEP_KEYS)[number];
export const STEP_DAYS: Record<StepKey, number> = { d3: 3, d1: 1, d0: 0 };
export const STEP_NAME: Record<StepKey, string> = { d3: '3日前', d1: '1日前', d0: '当日' };
export interface RemindStep { on: boolean; hm: string; text: string }
export interface MendanRemindSettings { on: boolean; steps: Record<StepKey, RemindStep> }

// 文章に書ける差し込み（送るときに置き換える）。{Meet} は 参加用のURLが無い予定では 行ごと消える
export const REMIND_VARS: [string, string][] = [['{名前}', '本人の名前'], ['{種類}', '定期面談／リーダー面談'], ['{日時}', '10月14日(水) 10:00〜10:30'], ['{担当}', '面談の担当'], ['{Meet}', '参加用のURL（案内の1行つき）']];
export const REMIND_TEXT_MAX = 1000;
const TAIL = '\n\n日時: {日時}\n担当: {担当}';
const CHANGE = '\n\n変更・キャンセルは このトークで ご連絡ください。';
export const DEFAULT_REMIND: MendanRemindSettings = {
  on: false,   // 最初は止めてある（画面で オンにしてから送り始める）
  steps: {
    d3: { on: true, hm: '18:00', text: `{名前}さん\n\n{種類}の3日前になりましたので ご連絡です。${TAIL}${CHANGE}` },
    d1: { on: true, hm: '18:00', text: `{名前}さん\n\n明日は {種類}です。よろしくお願いします。${TAIL}{Meet}${CHANGE}` },
    d0: { on: true, hm: '08:30', text: `{名前}さん\n\n本日は {種類}です。お時間になりましたら ご参加ください。${TAIL}{Meet}` },
  },
};

const HM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
export function cleanRemind(v: unknown): MendanRemindSettings {
  const o = (v || {}) as Partial<MendanRemindSettings>; const d = DEFAULT_REMIND;
  const steps = {} as Record<StepKey, RemindStep>;
  STEP_KEYS.forEach((k) => {
    const s = (o.steps?.[k] || {}) as Partial<RemindStep>;
    const text = String(s.text ?? '').replace(/\r\n/g, '\n').trim().slice(0, REMIND_TEXT_MAX);
    steps[k] = { on: s.on === undefined ? d.steps[k].on : s.on === true, hm: HM_RE.test(String(s.hm || '')) ? String(s.hm) : d.steps[k].hm, text: text || d.steps[k].text };
  });
  return { on: o.on === true, steps };
}

// ---- 日付と時刻（日本時間） ----------------------------------------------------
const JST = 9 * 3600_000;
const DAY = 86400_000;
const dayNo = (ms: number) => Math.floor((ms + JST) / DAY);                      // 日本時間の日付の通し番号
const atJst = (day: number, hm: string) => day * DAY - JST + (Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3))) * 60_000;
const WD = ['日', '月', '火', '水', '木', '金', '土'];
const p2 = (n: number) => String(n).padStart(2, '0');
export function whenText(startIso: string, endIso: string): string {
  const s = new Date(Date.parse(startIso) + JST), e = new Date(Date.parse(endIso) + JST);
  const end = Number.isFinite(e.getTime()) ? `〜${p2(e.getUTCHours())}:${p2(e.getUTCMinutes())}` : '';
  return `${s.getUTCMonth() + 1}月${s.getUTCDate()}日(${WD[s.getUTCDay()]}) ${p2(s.getUTCHours())}:${p2(s.getUTCMinutes())}${end}`;
}
export function stampText(ms: number): string {
  const d = new Date(ms + JST);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}(${WD[d.getUTCDay()]}) ${p2(d.getUTCHours())}:${p2(d.getUTCMinutes())}`;
}

// 1件の予約について、3つのリマインドが それぞれ どうなるか。
//   state: off＝設定で止めている／skip＝予約が その日以降（3日前の分は その日より後）だったので出さない／wait＝これから／due＝いま送る／missed＝送る日を過ぎた（止めていた・あとからオンにした）
//   当日の分は 面談の1時間前までに出す（送る時刻が それより遅い設定でも）。3日前・1日前は その日のうちだけ送る（遅れて翌日に出さない）
export type PlanState = 'off' | 'skip' | 'wait' | 'due' | 'missed';
export interface StepPlan { key: StepKey; at: number; state: PlanState }
export function planOf(bookedAtMs: number, startMs: number, nowMs: number, s: MendanRemindSettings): StepPlan[] {
  const startDay = dayNo(startMs), bookedDay = dayNo(bookedAtMs);
  return STEP_KEYS.map((key) => {
    const day = startDay - STEP_DAYS[key];
    let at = atJst(day, s.steps[key].hm);
    if (key === 'd0') at = Math.max(Math.min(at, startMs - 3600_000), atJst(day, '00:00'));
    const end = key === 'd0' ? startMs : atJst(day + 1, '00:00');
    const state: PlanState = !s.on || !s.steps[key].on ? 'off' : (key === 'd3' ? day < bookedDay || (day === bookedDay && bookedAtMs >= at) : day <= bookedDay) ? 'skip' : nowMs < at ? 'wait' : nowMs < end ? 'due' : 'missed';
    return { key, at, state };
  });
}

// 文章の差し込み。{Meet} は URL があれば 案内の1行つきで、無ければ 消す
export function fillRemind(text: string, v: { name: string; kind: string; when: string; host: string; meetUrl: string }): string {
  const meet = v.meetUrl ? `\n\n▼ 当日はこちらから参加してください（Google Meet）\n${v.meetUrl}` : '';
  return text.replaceAll('{Meet}', meet).replaceAll('{名前}', v.name).replaceAll('{種類}', v.kind).replaceAll('{日時}', v.when).replaceAll('{担当}', v.host)
    .replace(/\n{3,}/g, '\n\n').trim();
}

// 画面に出す1件（これからの予約と、リマインドの予定）
export interface RemindRow { id: string; name: string; kind: string; host: string; when: string; start: string; bookedAt: string; linked: boolean; bousan?: boolean; steps: { key: StepKey; at: string; state: PlanState | 'sent' }[] }
