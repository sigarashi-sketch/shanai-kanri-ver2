import { NextResponse } from 'next/server';
import { ikeFetch, ikeToken } from '@/lib/ike';
import { matchGroupName, normName, type EngineerRows } from '@/lib/live/eigyo-common';
import { mikeikenSetOf, onlyMikeiken } from '@/lib/live/mikeiken';
import { parseDateIso } from '@/lib/live/staff';
import type { IkeJimuLite, IkeNyushaOverlay } from '@/lib/live/nyusha';
import type { IkeShoudakuList, SaiyouSignal, SaiyouSignalsLive } from '@/lib/live/saiyou';

// 採用（承諾者・面談）の「辞退しそうな兆し」の材料（本物）。lib/live/saiyou.ts の liveSignalLines を参照。
//   ★材料は4つだけ（2026-10-25 shoya）。面談メモの言葉・ML の点数は使わない
//     ① 本人の返信が止まっている日数 … GET /api/chat?action=contacts の last_in_at（紐付けずみの 1:1 で、紐付けた氏名がこの人）
//                                        と GET /api/chat?action=groups の lastInAt（グループ名にこの人の名前が入っている＝今の chat.html と同じ当て方）
//                                        の新しい方から何日。同じ名前の LINE 相手が複数いたら新しい方（兆しを出しすぎない側）
//     ② フォロー面談の日程変更の回数 … 今のシステムに承諾者のフォロー面談の記録が無い（interviews は案件の面談、hearing_bookings は承諾前の初回ヒアリング、
//                                        フォロー面談・定期面談は入場後の対応記録だけで、日程を変えた履歴も残らない）＝出せないので使わない
//     ③ 基本情報フォームが未回答     … GET /api/basic-info?action=names（回答ずみの氏名の一覧）に名前が無い
//     ④ 入社日が決まっていない       … GET /api/roster?op=nyusha&action=list（名簿の入社日）→無ければ GET /api/roster?op=jimu&action=list の入社日
//   ★読むだけ。どれも今のシステム側で SELECT しかしない GET（roster?op=nyusha は action=save が GET でも書くので list 以外は呼ばない）
//   ★返すのは 日数・はい/いいえ・入社日だけ。トーク本文・メール・健康の情報は返さない（読んだ返りからも持ち出さない）
//   ★未経験の人だけ（今のプロパーリストに入っている人）。プロパーリストが読めなければ人の行は返さない
//   ★人の当て方は名前（normName）。承諾者の一覧に ID が無いので、同姓同名は区別できない（画面は「同姓同名」の印を出す）
class AuthGone extends Error {}

async function getJson<T>(path: string): Promise<T> {
  const r = await ikeFetch(path);
  if (r.status === 401) throw new AuthGone();
  if (!r.ok) throw new Error(`${path.split('?')[0]}（${r.status}）`);
  return (await r.json()) as T;
}
const soft = <T,>(p: Promise<T>) => p.catch((e) => { if (e instanceof AuthGone) throw e; return null; });

type IkeContacts = { contacts?: { link_status?: string | null; linked_name?: string | null; linked_normalized_name?: string | null; last_in_at?: string | null }[]; error?: string };
type IkeGroups = { groups?: { name?: string | null; lastInAt?: string | null }[]; error?: string };
type IkeFormNames = { success?: boolean; names?: string[] | null };

const DAY = 86400000;

export async function GET() {
  if (!(await ikeToken())) return NextResponse.json({ error: 'not_logged_in' }, { status: 401 });
  try {
    const [list, eng, contacts, groups, form, ny, jimu] = await Promise.all([
      getJson<IkeShoudakuList>('/api/shoudaku-story?list=1&days=90'),
      getJson<EngineerRows>('/api/roster?action=getEngineerRows'),
      soft(getJson<IkeContacts>('/api/chat?action=contacts')),
      soft(getJson<IkeGroups>('/api/chat?action=groups')),
      soft(getJson<IkeFormNames>('/api/basic-info?action=names')),
      soft(getJson<{ success?: boolean; overlay?: IkeNyushaOverlay }>('/api/roster?op=nyusha&action=list')),
      soft(getJson<IkeJimuLite>('/api/roster?op=jimu&action=list')),
    ]);
    const warnings: string[] = [];
    const open = onlyMikeiken(mikeikenSetOf(eng), (list.people || []).filter((p) => p.outcome === 'open'), (p) => p.name || p.norm);

    // ① LINE の最後の受信（名前ごとに新しい方）
    const lastIn = new Map<string, number>();
    const put = (k: string, iso: string | null | undefined) => {
      const t = Date.parse(String(iso || ''));
      if (!k || !Number.isFinite(t)) return;
      if ((lastIn.get(k) ?? 0) < t) lastIn.set(k, t);
    };
    const contactsOk = !!contacts && Array.isArray(contacts.contacts) && !contacts.error;
    const groupsOk = !!groups && Array.isArray(groups.groups) && !groups.error;
    if (contactsOk) for (const c of contacts!.contacts!) if (c.link_status === 'linked') put(normName(c.linked_normalized_name || c.linked_name || ''), c.last_in_at);
    if (groupsOk) {
      // グループ名の当て方は今と同じ（いちばん長く一致した名前）。名前の候補はプロパーリストと承諾者の全員
      const norms = Array.from(new Set([...(eng.rows || []).map((r) => normName(r.name)), ...(list.people || []).map((p) => normName(p.name || p.norm))].filter(Boolean)));
      for (const g of groups!.groups!) { const k = matchGroupName(String(g.name || ''), norms); if (k) put(k, g.lastInAt); }
    }
    const line = contactsOk || groupsOk;
    if (!contactsOk) warnings.push('LINE の 1:1 の受信が読めませんでした（グループだけで数えています）');
    if (!groupsOk) warnings.push('LINE グループの受信が読めませんでした（1:1 だけで数えています）');

    // ③ 基本情報フォームの回答者
    const formOk = !!form?.success && Array.isArray(form.names);
    const answered = new Set((formOk ? form!.names! : []).map(normName).filter(Boolean));
    if (!formOk) warnings.push('基本情報フォームの回答者が読めませんでした');

    // ④ 入社日（名簿の入社日 → 事務ページの入社日）
    const overlay = ny?.success !== false && ny?.overlay ? ny.overlay : null;
    const jimuJoin = new Map<string, string>();
    for (const r of jimu?.rows || []) { const k = normName(r.name); const d = parseDateIso(r.nyusha); if (k && d && !jimuJoin.has(k)) jimuJoin.set(k, d); }
    const overlayJoin = new Map<string, string>();
    for (const [k0, v] of Object.entries(overlay || {})) { const k = normName(k0); const d = parseDateIso(v?.nyushaBi); if (k && d) overlayJoin.set(k, d); }
    const join = !!overlay;
    if (!join) warnings.push('入社日（名簿の入社日）が読めませんでした');

    const now = Date.now();
    const people: SaiyouSignal[] = open.map((p) => {
      const k = normName(p.name || p.norm);
      const t = lastIn.get(k);
      return {
        norm: p.norm,
        lastInDays: line && t ? Math.max(0, Math.floor((now - t) / DAY)) : null,
        formDone: formOk ? answered.has(k) : null,
        joinDate: overlayJoin.get(k) || jimuJoin.get(k) || null,
      };
    });
    const body: SaiyouSignalsLive = { people, sources: { line, form: formOk, join }, warnings, generatedAt: new Date().toISOString() };
    return NextResponse.json(body);
  } catch (e) {
    if (e instanceof AuthGone) return NextResponse.json({ error: 'ログインが切れました。もう一度ログインしてください' }, { status: 401 });
    return NextResponse.json({ error: `今の社内システムから読めませんでした（${(e as Error).message}）` }, { status: 502 });
  }
}
