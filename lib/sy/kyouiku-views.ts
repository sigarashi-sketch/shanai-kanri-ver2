import 'server-only';
import { db } from './db';
import { displayName } from './kyouiku';
import { CHECK_THUMB, COURSES } from './kyouiku-courses';
import type { ViewsData, ViewsCourse } from './kyouiku-views-types';

// bdsh の クリック数の集計（/kyouiku「クリック数」タブ・API /api/s/kyouiku/views）。もとは saiyou.kyouiku_views（lib/kyouiku-view.ts が送る1行）
//   開いた回数＝行の数、人数＝subject_key の数。内勤（u:）は staff=false のとき外す
const EXTRA: Record<string, string> = { [CHECK_THUMB.id]: CHECK_THUMB.name, career: 'キャリアビジョン', opening: 'オープニング動画' };
const courseName = (id: string) => COURSES.find((c) => c.id === id)?.name || EXTRA[id] || id;

interface Row { subject_key: string; course: string; lesson: string; title: string; created_at: string }

export async function buildViews(days: number, staff: boolean): Promise<ViewsData> {
  const since = days > 0 ? new Date(Date.now() - days * 864e5).toISOString() : '';
  const rows: Row[] = [];
  for (let from = 0; from < 200000; from += 1000) {   // 1回に返る行は 1000まで
    let q = db().from('kyouiku_views').select('subject_key,course,lesson,title,created_at').order('id', { ascending: false }).range(from, from + 999);
    if (since) q = q.gte('created_at', since);
    if (!staff) q = q.not('subject_key', 'like', 'u:%');
    const { data, error } = await q;
    if (error) return { ok: false, error: /does not exist|schema cache/.test(error.message) ? 'まだ記録用の表がありません（supabase/0023_kyouiku_views.sql を流すと記録が始まります）' : error.message, courses: [], total: 0, people: 0, days };
    rows.push(...((data || []) as Row[]));
    if (!data || data.length < 1000) break;
  }
  const by = new Map<string, { opens: number; people: Set<string>; last: string; lessons: Map<string, { title: string; opens: number; people: Set<string>; last: string }>; who: Map<string, number> }>();
  for (const r of rows) {
    let c = by.get(r.course);
    if (!c) by.set(r.course, (c = { opens: 0, people: new Set(), last: '', lessons: new Map(), who: new Map() }));
    if (r.created_at > c.last) c.last = r.created_at;
    if (!r.lesson) { c.opens++; c.people.add(r.subject_key); c.who.set(r.subject_key, (c.who.get(r.subject_key) || 0) + 1); continue; }
    let l = c.lessons.get(r.lesson);
    if (!l) c.lessons.set(r.lesson, (l = { title: '', opens: 0, people: new Set(), last: '' }));
    l.opens++; l.people.add(r.subject_key);
    if (r.created_at > l.last) { l.last = r.created_at; if (r.title) l.title = r.title; }
    else if (!l.title && r.title) l.title = r.title;
  }
  const courses: ViewsCourse[] = [...by.entries()].map(([id, c]) => ({
    id, name: courseName(id), opens: c.opens, people: c.people.size, last: c.last,
    lessonOpens: [...c.lessons.values()].reduce((s, l) => s + l.opens, 0),
    lessons: [...c.lessons.entries()].map(([lid, l]) => ({ id: lid, title: l.title || lid, opens: l.opens, people: l.people.size, last: l.last })).sort((a, b) => b.opens - a.opens),
    who: [...c.who.entries()].map(([k, n]) => ({ name: displayName(k), opens: n })).sort((a, b) => b.opens - a.opens).slice(0, 50),
  })).sort((a, b) => b.opens + b.lessonOpens - (a.opens + a.lessonOpens));
  return { ok: true, courses, total: rows.length, people: new Set(rows.map((r) => r.subject_key)).size, days };
}
