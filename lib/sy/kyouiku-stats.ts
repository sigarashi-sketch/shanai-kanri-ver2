import 'server-only';
import { db } from './db';
import { COURSES } from './kyouiku-courses';
import { QUESTS } from './kyouiku-lessons';
import { CHECK_PREFIX, CHECK_SUBJECTS } from './kyouiku-check';
import { checkAdmin, loadCheck, type CheckRow } from './kyouiku-check-judge';
import { EV_PREFIX } from './kyouiku-events';
import type { StatsCheckSubject, StatsCourse, StatsData } from './kyouiku-stats-types';

// /kyouiku「集計」（2026-10-19 shoya「bdsh の集計 クリック率とか スキルチェックの結果とか ダッシュボードで見やすく」）
//   もとは saiyou.kyouiku_progress の全行（正解も不正解も・開いた／押した の _ev: も）。氏名は返さない（人数と キーだけ）
//   練習の記録 → コース: quest の頭で決める（下の courseOfQuest）。CCNA の図鑑あつめ・キッティングは 別の表なので 数えていない
//   内勤（u:〜）は 既定で外す（staff=true で入れる）
const QIDS = new Set(QUESTS.map((q) => q.id));
const PREFIX: [string, string][] = [
  [CHECK_PREFIX, 'check'], ['_jt:', 'jitsumu'], ['_oyo:', 'oyo'], ['_dojo:', 'dojo'], ['_mos', 'mos'], ['_typing', 'typing'],
  ['_design:', 'design'], ['_ip', 'ipass'], ['_ccnalec:', 'ccna'], ['_exam:excel', 'excel'],
];
export function courseOfQuest(q: string): string | null {
  if (!q.startsWith('_')) return QIDS.has(q) ? 'excel' : null;
  for (const [p, id] of PREFIX) if (q.startsWith(p)) return id;
  return null;   // _intake（最初のアンケート）・_ev: など
}

interface Row { subject_key: string; quest: string; created_at: string }
async function loadRows(): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; from < 300000; from += 1000) {   // 1回1,000行までなので めくって全部読む
    const { data, error } = await db().from('kyouiku_progress').select('subject_key,quest,created_at').order('id', { ascending: true }).range(from, from + 999);
    if (error) throw new Error(error.message);
    if (!data?.length) break;
    out.push(...(data as Row[]));
    if (data.length < 1000) break;
  }
  return out;
}

const jstDay = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString().slice(0, 10);
const avg = (xs: number[]) => (xs.length ? Math.round(xs.reduce((s, n) => s + n, 0) / xs.length) : null);
const isStaff = (k: string) => k.startsWith('u:');

let cache: { at: number; staff: boolean; data: StatsData } | null = null;
export async function buildStats(staff: boolean): Promise<StatsData> {
  if (cache && cache.staff === staff && Date.now() - cache.at < 60_000) return cache.data;
  const [all, checkAll] = await Promise.all([loadRows(), loadCheck()]);
  const rows = staff ? all : all.filter((r) => !isStaff(r.subject_key));
  const now = Date.now(); const ago = (iso: string) => (now - new Date(iso).getTime()) / 86400e3;

  // 直近30日（日本時間）
  const today = jstDay(new Date().toISOString());
  const noon = Date.parse(`${today}T12:00:00+09:00`);
  const dayList = Array.from({ length: 30 }, (_, k) => jstDay(new Date(noon - (29 - k) * 86400e3).toISOString()));
  const activeBy = new Map(dayList.map((d) => [d, new Set<string>()])); const openBy = new Map(dayList.map((d) => [d, new Set<string>()]));

  const seen = new Set<string>(); const act7 = new Set<string>();
  const users = new Map<string, Set<string>>(); const u7 = new Map<string, Set<string>>(); const u30 = new Map<string, Set<string>>();
  const clickers = new Map<string, Set<string>>(); const clicks = new Map<string, number>();
  const opened = new Set<string>(); const menu = new Set<string>(); const anyClick = new Set<string>(); const practicedAfter = new Set<string>();
  let since = '';
  const add = (m: Map<string, Set<string>>, id: string, k: string) => { const s = m.get(id); if (s) s.add(k); else m.set(id, new Set([k])); };

  for (const r of rows) {
    const k = r.subject_key; const d = jstDay(r.created_at); const a = ago(r.created_at);
    seen.add(k); if (a <= 7) act7.add(k);
    activeBy.get(d)?.add(k);
    if (r.quest.startsWith(EV_PREFIX)) {
      if (!since || d < since) since = d;
      const ev = r.quest.slice(EV_PREFIX.length);
      if (ev === 'open') { opened.add(k); openBy.get(d)?.add(k); }
      else if (ev === 'menu') menu.add(k);
      else if (ev.startsWith('c:')) { const id = ev.slice(2); add(clickers, id, k); clicks.set(id, (clicks.get(id) || 0) + 1); anyClick.add(k); }
      continue;
    }
    const c = courseOfQuest(r.quest); if (!c) continue;
    add(users, c, k); if (a <= 7) add(u7, c, k); if (a <= 30) add(u30, c, k);
    if (opened.has(k)) practicedAfter.add(k);   // 開いた記録の あとに 練習した人
  }

  const n = (m: Map<string, Set<string>>, id: string) => m.get(id)?.size || 0;
  const list = [{ id: 'check', name: 'スキルチェック' }, ...COURSES.filter((c) => c.ready).map((c) => ({ id: c.id, name: c.name }))];
  const courses: StatsCourse[] = list.map((c) => ({ id: c.id, name: c.name, users: n(users, c.id), active7: n(u7, c.id), active30: n(u30, c.id), clickers: n(clickers, c.id), clicks: clicks.get(c.id) || 0 }));

  // スキルチェック（人ごとに checkAdmin＝いちばん新しい回）
  const by = new Map<string, CheckRow[]>();
  for (const r of checkAll) { if (!staff && isStaff(r.subject_key)) continue; const a = by.get(r.subject_key); if (a) a.push(r); else by.set(r.subject_key, [r]); }
  const admins = [...by.values()].map((rs) => checkAdmin(rs)).filter((x): x is NonNullable<typeof x> => !!x);
  const subjects: StatsCheckSubject[] = CHECK_SUBJECTS.map((sb) => {
    const ps = admins.map((a) => a.parts[sb.id]).filter((p): p is NonNullable<typeof p> => !!p);
    const dist = [0, 0, 0, 0, 0]; for (const p of ps) dist[Math.min(4, Math.floor(p.last / 20))]++;
    const tagSum = new Map<string, { ok: number; total: number; n: number }>();
    const itemSum = new Map<string, { label: string; tag: string; ok: number; dk: number; n: number }>();
    for (const p of ps) {
      for (const t of p.tags) { const s = tagSum.get(t.tag) || { ok: 0, total: 0, n: 0 }; s.ok += t.ok; s.total += t.total; s.n++; tagSum.set(t.tag, s); }
      p.items.forEach((it, i) => { const key = `${i}`; const s = itemSum.get(key) || { label: it.label, tag: it.tag, ok: 0, dk: 0, n: 0 }; if (it.ok) s.ok++; if (it.dk) s.dk++; s.n++; itemSum.set(key, s); });
    }
    const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
    return {
      id: sb.id, name: sb.name, n: ps.length, avg: avg(ps.map((p) => p.last)), firstAvg: avg(ps.filter((p) => p.plays > 1).map((p) => p.first)), retakeAvg: avg(ps.filter((p) => p.plays > 1).map((p) => p.last)), retakers: ps.filter((p) => p.plays > 1).length,
      dist,
      tags: [...tagSum.entries()].map(([tag, s]) => ({ tag, rate: pct(s.ok, s.total), n: s.n })).sort((a, b) => a.rate - b.rate),
      items: [...itemSum.values()].map((s) => ({ label: s.label, tag: s.tag, rate: pct(s.ok, s.n), dk: pct(s.dk, s.n), n: s.n })).sort((a, b) => a.rate - b.rate),
      ...(sb.id === 'typing' ? { kpm: avg(ps.map((p) => p.kpm)) ?? 0, accuracy: avg(ps.map((p) => Math.round(p.accuracy * 100))) ?? 0 } : {}),
    };
  });
  const data: StatsData = {
    since, staff,
    seenKeys: [...seen], active7Keys: [...act7],
    days: dayList.map((d) => ({ d, active: activeBy.get(d)!.size, opened: openBy.get(d)!.size })),
    opened: opened.size, menu: menu.size, clickers: anyClick.size, practiced: practicedAfter.size,
    courses,
    check: { takers: admins.length, all4: admins.filter((a) => a.taken >= CHECK_SUBJECTS.length).length, avg: avg(admins.map((a) => a.avg).filter((v): v is number => v !== null)), subjects },
  };
  cache = { at: Date.now(), staff, data };
  return data;
}
