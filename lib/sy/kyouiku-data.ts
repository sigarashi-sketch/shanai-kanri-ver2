import 'server-only';
import { db } from './db';
import { QUESTS, WORLDS, worldOffset } from './kyouiku-lessons';
import { stepCount } from './kyouiku-judge';
import { INTAKE, displayName, loadDesign, loadIntakes, loadTyping, loadTypingExam, trialNames, type DesignRow } from './kyouiku';
import { examState, loadExam, type ExamRow } from './kyouiku-exam';
import { designSummary } from './design';
import { mosSummary, type MosRow } from './mos';
import { loadMos } from './mos/store';
import { examBest, gradeLabel, typingSummary, type TypingRow } from './kyouiku-typing';
import { loadDecks, loadSheets, sheetUrl } from './kyouiku-sheet';
import { checkAdmin, loadCheck, type CheckRow } from './kyouiku-check-judge';
import { listStaff } from './staff';
import { ccnaMembers } from './ccna/store';
import { LEC_PREFIX, lecSummary } from './ccna/lecture';
import type { KyouikuData, Learner } from './kyouiku-data-types';

// 教育データ: 受講ページを開いた人（アンケート・答え合わせ・スプシのどれかの記録がある人）ごとの進み具合を組み立てる。
//   2026-10-02 shoya「教育データもほしい。名前と Gmail を紐づけて、名前の横にワールドごとの進捗率を出し、manager が進捗管理できるように」
//   もとは saiyou.kyouiku_progress（正解も不正解も1行ずつ）と kyouiku_sheets（Google アドレス・スプシ）
interface Row { subject_key: string; name: string; quest: string; step: number; ok: boolean; created_at: string }

async function loadAllRows(): Promise<Row[]> {
  const out: Row[] = [];
  try {
    for (let from = 0; from < 60000; from += 1000) {   // 1回1,000行までなので、めくって全部読む
      const { data, error } = await db().from('kyouiku_progress').select('subject_key,name,quest,step,ok,created_at').order('id', { ascending: true }).range(from, from + 999);
      if (error || !data?.length) break;
      out.push(...(data as Row[]));
      if (data.length < 1000) break;
    }
  } catch { /* 表が無いときは空 */ }
  return out;
}

export async function buildKyouikuData(): Promise<KyouikuData> {
  const [rows, intakes, sheets, staff, ccna, trial, typingRows, designRows, decks] = await Promise.all([loadAllRows(), loadIntakes(), loadSheets(), listStaff(), ccnaMembers(), trialNames().catch(() => new Set<string>()), loadTyping(), loadDesign(), loadDecks()]);
  const [examRows, tyExamRows, checkRows] = await Promise.all([loadExam(), loadTypingExam(), loadCheck()]);
  const checkBy = new Map<string, CheckRow[]>();
  for (const r of checkRows) { const a = checkBy.get(r.subject_key); if (a) a.push(r); else checkBy.set(r.subject_key, [r]); }
  const mosBy = new Map<string, MosRow[]>();
  for (const r of await loadMos()) { const a = mosBy.get(r.subject_key); if (a) a.push(r); else mosBy.set(r.subject_key, [r]); }
  const examBy = new Map<string, ExamRow[]>();
  for (const r of examRows) { const a = examBy.get(r.subject_key); if (a) a.push(r); else examBy.set(r.subject_key, [r]); }
  const tyExamBy = new Map<string, typeof tyExamRows>();
  for (const r of tyExamRows) { const a = tyExamBy.get(r.subject_key); if (a) a.push(r); else tyExamBy.set(r.subject_key, [r]); }
  const designBy = new Map<string, DesignRow[]>();
  for (const r of designRows) { const a = designBy.get(r.subject_key); if (a) a.push(r); else designBy.set(r.subject_key, [r]); }
  const deckOf = new Map(decks.filter((d) => d.sheet_id).map((d) => [d.subject_key, d.sheet_id]));
  const typingBy = new Map<string, TypingRow[]>();
  for (const r of typingRows) { const a = typingBy.get(r.subject_key); if (a) a.push(r); else typingBy.set(r.subject_key, [r]); }
  const staffName = new Map(staff.map((s) => [s.email, s.name]));
  const sheetOf = new Map(sheets.map((s) => [s.subject_key, s]));
  const totals = QUESTS.map((q) => stepCount(q));
  const qIndex = new Map(QUESTS.map((q, k) => [q.id, k]));

  const by = new Map<string, Row[]>();
  for (const r of rows) { const a = by.get(r.subject_key); if (a) a.push(r); else by.set(r.subject_key, [r]); }
  const keys = new Set<string>([...by.keys(), ...Object.keys(intakes), ...sheets.filter((s) => s.sheet_id || s.email).map((s) => s.subject_key), ...Object.entries(ccna).filter(([, on]) => on).map(([k]) => k), ...deckOf.keys()]);

  const learners: Learner[] = [...keys].map((key): Learner => {
    const rs = by.get(key) || [];
    const quests = QUESTS.map((q, k) => ({ id: q.id, done: 0, total: totals[k], attempts: 0, wrong: 0, clearedAt: '' }));
    const okSteps = QUESTS.map(() => new Set<number>());
    let attempts = 0, wrong = 0, name = '';
    for (const r of rs) {
      if (r.name) name = r.name;
      const k = qIndex.get(r.quest); if (k === undefined) continue;   // アンケート（_intake）など
      attempts++; quests[k].attempts++;
      if (!r.ok) { wrong++; quests[k].wrong++; continue; }
      if (r.step < totals[k]) okSteps[k].add(r.step);
      if (!quests[k].clearedAt && okSteps[k].size >= totals[k]) quests[k].clearedAt = r.created_at;
    }
    quests.forEach((q, k) => { q.done = Math.min(okSteps[k].size, q.total); });
    const worlds = WORLDS.map((w, wi) => { const off = worldOffset(wi); const qs = quests.slice(off, off + w.quests.length); return { done: qs.reduce((s, q) => s + q.done, 0), total: qs.reduce((s, q) => s + q.total, 0) }; });
    const intake = intakes[key]; const sh = sheetOf.get(key);
    const start = Math.max(0, QUESTS.findIndex((q) => q.id === intake?.start));
    // いま取り組んでいるクエスト: 始めた場所より先で、まだクリアしていない最初（無ければ手前の未クリア）
    const open = (k: number) => quests[k].done < quests[k].total;
    let cur = QUESTS.findIndex((_, k) => k >= start && open(k)); if (cur < 0) cur = QUESTS.findIndex((_, k) => open(k));
    const curW = cur < 0 ? null : WORLDS.find((w) => w.quests.some((q) => q.id === QUESTS[cur].id));
    const staffMail = key.startsWith('u:') ? key.slice(2) : '';
    const ex = examBy.has(key) ? examState(examBy.get(key)!, true) : null; const tb = examBest(tyExamBy.get(key) || []);
    return {
      key, kind: key.startsWith('u:') ? 'staff' : 'member',
      name: staffMail ? staffName.get(staffMail) || staffMail.split('@')[0] : displayName(key, name),
      trial: key.startsWith('n:') && trial.has(key.slice(2)),
      email: staffMail || sh?.email || '',
      level: intake?.level || '', startNo: intake ? (WORLDS.find((w) => w.quests.some((q) => q.id === intake.start))?.title.split('　')[0] || '') : '',
      worlds, done: quests.reduce((s, q) => s + q.done, 0), total: totals.reduce((s, n) => s + n, 0),
      cleared: quests.filter((q) => q.total > 0 && q.done >= q.total).length,
      current: cur < 0 ? null : { no: QUESTS[cur].no, title: QUESTS[cur].title, world: curW?.title.split('　')[0] || '' },
      attempts, wrong, firstAt: rs[0]?.created_at || '', lastAt: rs.at(-1)?.created_at || '',
      sheetUrl: sh?.sheet_id ? sheetUrl(sh.sheet_id) : '',
      quests, ccna: key in ccna ? { on: ccna[key] } : null, ccnaLec: rs.some((r) => r.quest.startsWith(LEC_PREFIX)) ? lecSummary(rs.filter((r) => r.quest.startsWith(LEC_PREFIX))) : null, typing: typingBy.has(key) ? typingSummary(typingBy.get(key)!) : null,
      mos: mosBy.has(key) ? mosSummary(mosBy.get(key)!) : null,
      design: designBy.has(key) || deckOf.has(key) ? { ...designSummary(designBy.get(key) || []), deckUrl: deckOf.has(key) ? `https://docs.google.com/presentation/d/${deckOf.get(key)}/edit` : '' } : null,
      tests: { excel: ex ? { passed: ex.passed, runs: ex.runs, bestMiss: ex.bestMiss } : null, typing: tb ? { label: gradeLabel(tb.grade), kpm: tb.kpm, accuracy: tb.accuracy, passed: tb.passed, plays: (tyExamBy.get(key) || []).length } : null },
      check: checkBy.has(key) ? checkAdmin(checkBy.get(key)!) : null,
      recent: rs.filter((r) => r.quest !== INTAKE && qIndex.has(r.quest)).slice(-15).reverse().map((r) => ({ no: QUESTS[qIndex.get(r.quest)!].no, step: r.step, ok: r.ok, at: r.created_at })),
    };
  }).sort((a, b) => b.lastAt.localeCompare(a.lastAt));

  return {
    worlds: WORLDS.map((w, wi) => { const off = worldOffset(wi); const [no, name] = w.title.split('　'); return { id: w.id, no, name, total: w.quests.reduce((s, _, k) => s + totals[off + k], 0), quests: w.quests.map((q, k) => ({ id: q.id, no: q.no, title: q.title, total: totals[off + k] })) }; }),
    learners, total: totals.reduce((s, n) => s + n, 0), questCount: QUESTS.length,
  };
}
