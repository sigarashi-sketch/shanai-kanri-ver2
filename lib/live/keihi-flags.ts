// 交通費の申請に添える「勤怠の印」（2026-10-25 shoya「交通費申請は打刻漏れ シフト表未提出 欠勤報告などあれば示して欲しい」）。
//   申請の人 × 申請の月（keihi_claims.ym）に、次のものがあれば印にする。判定は今の社内システムが出しているものをそのまま使い、ここで条件を書き足さない。
//     ・打刻漏れ   … GET /api/attendance-board?action=habits（直近30日・今日を含まない・DB だけ＝freee は呼ばない）
//                    miss＝出勤する日なのに最終的な勤怠に出勤が入っていない／fixed＝打刻を忘れて後から直した
//                    ★夜勤・待機中の人は今のシステムが数えていない。30日より前の日は見えない
//     ・シフト未提出 … GET /api/shift-calendar?action=list&month= ＋ GET /api/kintai-today?stale=1（勤務区分）→ shiftMissingOf と同じ
//                    勤務区分がシフト・夜勤で、その月に1日も入れていない＝未提出／入れたが提出していない＝下書き
//     ・欠勤の報告 … GET /api/roster?op=kekkin&action=list&month=（LINE の欠勤連絡＋手で足した欠勤・1人1日1行）
//     ・遅刻・早退 … GET /api/roster?op=roumu&action=contacts&month=（勤怠連絡 kintai_contacts の AI の見分け＝欠勤管理と同じ・10-27 足した）
//                    late＝遅刻の連絡／early＝早退・早めの退勤の連絡。★本文は使わない（日付と種類だけ）。欠勤は上の欠勤の報告で出すのでここでは数えない
//     ・勤務表とのずれ … GET /api/roster?op=shime&action=board（勤怠の締め：勤務表 × freee のキャッシュ）
//   ★理由・メモ（健康のことが入る）・時間は返さない。日付と種類だけ
import { normName } from './eigyo-common';
import type { KeihiClaim } from './keihi';

export type FlagKind = 'dakoku' | 'shift' | 'kekkin' | 'chikoku' | 'zure';
export type FlagTone = 'bad' | 'warn' | 'caution' | 'info';
export type KeihiFlag = { kind: FlagKind; tone: FlagTone; label: string; lines: string[]; note?: string };
/** 人（normName）→ 月（YYYY-MM）→ 印 */
export type KeihiFlagsByPerson = Record<string, Record<string, KeihiFlag[]>>;
export type KeihiFlagsResp = {
  ok: boolean; error?: string; months: string[]; people: KeihiFlagsByPerson;
  /** 読めた口（読めなかった口の印は「無い」ではなく「確かめられていない」） */
  read: Record<FlagKind, boolean>;
  habitsFrom?: string; habitsTo?: string;
};

export const FLAG_NAME: Record<FlagKind, string> = { dakoku: '打刻漏れ', shift: 'シフト表', kekkin: '欠勤の報告', chikoku: '遅刻・早退の連絡', zure: '勤務表とのずれ' };

const DOW = ['日', '月', '火', '水', '木', '金', '土'];
export const dayJa = (d: string) => { const t = new Date(d + 'T00:00:00Z'); return `${t.getUTCMonth() + 1}/${t.getUTCDate()}（${DOW[t.getUTCDay()]}）`; };
const mOf = (ym: string) => `${Number(ym.slice(5, 7))}月`;

// ---- 今の社内システムの形（要るところだけ） ----
export type IkeHabits = { ok: boolean; from?: string; to?: string; habits?: Record<string, { miss: number; fixed: number; dates: { d: string; k: 'miss' | 'fixed' }[] }>; error?: string };
export type IkeShiftListLite = { ok: boolean; rows?: { name: string; submittedAt: string | null; work?: number }[] };
export type IkeTodayLite = { ok: boolean; rows?: { name: string; kubun?: string }[] };
export type IkeKekkinLite = { ok: boolean; rows?: { date: string; nn?: string; name: string; contact?: boolean; manual?: boolean }[] };
export type IkeContactsLite = { ok: boolean; rows?: { date: string; nn?: string; name: string; kind: string; source?: string }[] };
export type IkeShimeLite = { ok: boolean; rows?: { key: string; name: string; cells: Record<string, { status: string; diffDays?: number; diffMins?: number | null }> }[] };

const SHIFT_REQUIRED_KUBUN = ['シフト', '夜勤'];   // 今のシステムの isShiftSubmitRequired と同じ（lib/live/shift.ts と揃える）

function push(out: KeihiFlagsByPerson, key: string, ym: string, f: KeihiFlag) {
  if (!key) return;
  ((out[key] ||= {})[ym] ||= []).push(f);
}

/** 材料 → 人 × 月の印。keep は「出してよい人か」（未経験の人だけ） */
export function buildKeihiFlags(
  months: string[],
  src: {
    habits: IkeHabits | null;
    today: IkeTodayLite | null;
    shift: Record<string, IkeShiftListLite | null>;
    kekkin: Record<string, IkeKekkinLite | null>;
    contacts?: Record<string, IkeContactsLite | null>;
    shime: IkeShimeLite | null;
  },
  keep: (key: string) => boolean,
): KeihiFlagsByPerson {
  const out: KeihiFlagsByPerson = {};

  // 打刻漏れ（直近30日のうち、その月に入る日だけ）
  if (src.habits?.ok) {
    const from = src.habits.from || '';
    for (const [k0, h] of Object.entries(src.habits.habits || {})) {
      const key = normName(k0);
      if (!keep(key)) continue;
      for (const ym of months) {
        const ds = (h.dates || []).filter((x) => x.d.startsWith(ym)).sort((a, b) => a.d.localeCompare(b.d));
        if (!ds.length) continue;
        const miss = ds.filter((x) => x.k === 'miss'), fixed = ds.filter((x) => x.k === 'fixed');
        const partial = from && `${ym}-01` < from ? `${Number(from.slice(5, 7))}/${Number(from.slice(8, 10))} より前の日は見ていません（今のシステムは直近30日だけ数えます）` : undefined;
        if (miss.length) push(out, key, ym, { kind: 'dakoku', tone: 'bad', label: `打刻漏れ ${miss.length}日`, lines: miss.map((x) => `${dayJa(x.d)} 出勤の打刻なしのまま`), note: partial });
        if (fixed.length) push(out, key, ym, { kind: 'dakoku', tone: 'caution', label: `打刻を後から直した ${fixed.length}日`, lines: fixed.map((x) => `${dayJa(x.d)} 打ち忘れて後から直した`), note: partial });
      }
    }
  }

  // シフト表（勤務区分がシフト・夜勤の人だけ）
  if (src.today?.ok) {
    const need = new Map<string, string>();
    for (const r of src.today.rows || []) if (SHIFT_REQUIRED_KUBUN.includes(r.kubun || '')) need.set(normName(r.name), r.kubun || '');
    for (const ym of months) {
      const l = src.shift[ym];
      if (!l?.ok) continue;
      const have = new Map<string, { submittedAt: string | null }>();
      for (const r of l.rows || []) have.set(normName(r.name), r);
      for (const [key, kubun] of need) {
        if (!keep(key)) continue;
        const h = have.get(key);
        if (!h) push(out, key, ym, { kind: 'shift', tone: 'bad', label: `${mOf(ym)}分 シフト表 未提出`, lines: [`${mOf(ym)}のシフトを1日も入れていません（勤務区分 ${kubun}）`] });
        else if (!h.submittedAt) push(out, key, ym, { kind: 'shift', tone: 'warn', label: `${mOf(ym)}分 シフト表 下書きのまま`, lines: [`${mOf(ym)}のシフトは入れかけで、提出していません（勤務区分 ${kubun}）`] });
      }
    }
  }

  // 欠勤の報告（理由・メモは出さない）
  for (const ym of months) {
    const k = src.kekkin[ym];
    if (!k?.ok) continue;
    const by = new Map<string, { date: string; how: string }[]>();
    for (const r of k.rows || []) {
      const key = normName(r.nn || r.name);
      if (!keep(key)) continue;
      by.set(key, [...(by.get(key) || []), { date: r.date, how: r.contact ? 'LINE で欠勤の連絡' : '欠勤管理に手で追加' }]);
    }
    for (const [key, xs] of by) {
      xs.sort((a, b) => a.date.localeCompare(b.date));
      push(out, key, ym, { kind: 'kekkin', tone: 'warn', label: `欠勤 ${xs.length}日`, lines: xs.map((x) => `${dayJa(x.date)} ${x.how}`) });
    }
  }

  // 遅刻・早退の連絡（勤怠連絡の AI の見分けをそのまま。本文・理由は出さない・同じ人の同じ日・同じ種類は1つ）
  for (const ym of months) {
    const k = src.contacts?.[ym];
    if (!k?.ok) continue;
    const by = new Map<string, Map<string, string>>();
    for (const r of k.rows || []) {
      if (r.kind !== 'late' && r.kind !== 'early') continue;
      const key = normName(r.nn || r.name);
      if (!key || !keep(key) || !r.date?.startsWith(ym)) continue;
      const m = by.get(key) || new Map<string, string>();
      m.set(`${r.date}|${r.kind}`, `${dayJa(r.date)} ${r.kind === 'late' ? '遅刻' : '早退・早めの退勤'}の連絡（${r.source === '1:1' ? '1:1' : 'グループ'}）`);
      by.set(key, m);
    }
    for (const [key, m] of by) {
      const xs = [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
      const late = xs.filter(([k2]) => k2.endsWith('|late')).length, early = xs.length - late;
      push(out, key, ym, { kind: 'chikoku', tone: 'info', label: [late ? `遅刻 ${late}回` : '', early ? `早退 ${early}回` : ''].filter(Boolean).join('・'), lines: xs.map(([, l]) => l), note: 'LINE の連絡を AI が見分けたものです（欠勤管理と同じ）。打刻の時間とは突き合わせていません' });
    }
  }

  // 勤務表とのずれ（勤怠の締めの判定をそのまま）
  if (src.shime?.ok) {
    for (const r of src.shime.rows || []) {
      const key = normName(r.name);
      if (!keep(key)) continue;
      for (const ym of months) {
        const c = r.cells?.[ym];
        if (!c) continue;
        if (c.status === 'diff') push(out, key, ym, { kind: 'zure', tone: 'caution', label: `勤務表とずれ ${c.diffDays || 0}日`, lines: [`現場の勤務表と freee の打刻が ${c.diffDays || 0}日ぶん合っていません`], note: '日ごとの中身は勤怠の締めの画面で見られます' });
        else if (c.status === 'no_freee') push(out, key, ym, { kind: 'zure', tone: 'bad', label: '勤務表はあるのに打刻なし', lines: [`${mOf(ym)}は現場の勤務表が届いているのに、freee の打刻が1日もありません`], note: '日ごとの中身は勤怠の締めの画面で見られます' });
      }
    }
  }
  return out;
}

/** 1件の申請に出す印。通勤（日ごと）で申請した日が「打刻なし」「欠勤」の日と重なったら、いちばん上に出す */
export function flagsForClaim(resp: Pick<KeihiFlagsResp, 'people'> | null, c: Pick<KeihiClaim, 'linked_name' | 'ym' | 'items'>): KeihiFlag[] {
  const fs = resp?.people?.[normName(c.linked_name)]?.[c.ym] || [];
  if (!fs.length) return [];
  const used = new Set((c.items || []).filter((i) => i.kind === 'transit' && i.mode !== 'pass').map((i) => i.used_on));
  const hit = new Set<string>();
  for (const f of fs) if ((f.kind === 'dakoku' && f.tone === 'bad') || f.kind === 'kekkin') for (const l of f.lines) { const d = [...used].find((u) => l.startsWith(dayJa(u))); if (d) hit.add(d); }
  const overlap: KeihiFlag[] = hit.size ? [{ kind: 'zure', tone: 'bad', label: `申請した日が打刻なし・欠勤 ${hit.size}日`, lines: [...hit].sort().map((d) => `${dayJa(d)} に交通費の申請あり`), note: '通勤の申請は申請のときに打刻を照らしています。そのあと打刻が消された・欠勤に直された日かもしれません' }] : [];
  return [...overlap, ...fs];
}
