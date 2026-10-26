import { NextResponse } from 'next/server';
import { ikeWrite } from '@/lib/ike-write';
import { MARK_CHOICES } from '@/lib/live/roumu-const';

// 労務の画面（/roumu/*）の書く口（10-26）。今の POST /api/roster?op=roumu&action=… にだけ書く（0370・_op_roumu.ts）。
//   mark          {kind,key,value,nn?,ym?,note?}   … 印を付ける／外す（value=''）。値は選択肢だけ（今のシステムも確かめる）
//   nudge         {kind,date,people:[{nn}]}        … 本人に促す（LINE）。今のシステムの設定が ON のときだけ送る（既定は送らない＝印だけ）
//   haken-save    {nn,name,conflictOn?,officeConflictOn?,docs?,intent?,note?} … 派遣契約の抵触日・書類・意向の提案
//   haken-confirm {nn,undo?}                       … 意向の確定（労務の権限＝今のシステムのページ権限 kintai-shime）
//   haken-ask     {nn,to,undo?}                    … 意向確認を頼んだ印（送らない）
//   shift-pattern-save {id?,name,short,start,end,tone,sort} ／ shift-pattern-remove {id} … シフトの呼び名
//   ★権限は今のシステムのページ権限で見る（kintai-today / kekkin / timesheet-arrival / kintai-shime / kb / shift-admin）
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const YM = /^\d{4}-\d{2}$/;
const HHMM = /^([01]?\d|2[0-3]):[0-5]\d$/;
const KEY = /^[0-9A-Za-z_\-:|.@　-鿿＀-￯]{1,160}$/;
const INTENTS = ['未確認', '派遣先と調整中', '更新', '終了'];
const TONES = ['ok', 'info', 'caution', 'warn', 'purple', 'mute'];
const str = (v: unknown, max: number) => String(v == null ? '' : v).trim().slice(0, max);
const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(b.action || '');
  const T = (a: string) => `/api/roster?op=roumu&action=${a}`;

  if (action === 'mark') {
    const kind = str(b.kind, 40) as keyof typeof MARK_CHOICES;
    const choices = MARK_CHOICES[kind] as readonly string[] | undefined;
    if (!choices) return bad('この印は付けられません');
    const key = str(b.key, 160), value = str(b.value, 80), ym = str(b.ym, 7);
    if (!KEY.test(key)) return bad('印の場所が違います');
    if (value && !choices.includes(value)) return bad('選択肢から選んでください');
    if (ym && !YM.test(ym)) return bad('月の形が違います');
    return ikeWrite(req, T('mark'), { kind, key, value, nn: str(b.nn, 80), ym, note: str(b.note, 500) });
  }
  if (action === 'nudge') {
    const kind = str(b.kind, 10), date = str(b.date, 10);
    if (!['punch', 'depcall', 'shift'].includes(kind)) return bad('この知らせは送れません');
    if (!DATE.test(date)) return bad('日付がありません');
    const people = (Array.isArray(b.people) ? b.people : []).slice(0, 30).map((p) => ({ nn: str((p as Record<string, unknown>)?.nn, 80) })).filter((p) => p.nn);
    if (!people.length) return bad('相手がいません');
    return ikeWrite(req, T('nudge'), { kind, date, people });
  }
  if (action === 'haken-save') {
    const nn = str(b.nn, 80);
    if (!nn) return bad('氏名がありません');
    const body: Record<string, unknown> = { nn, name: str(b.name, 80) };
    for (const k of ['conflictOn', 'officeConflictOn']) {
      if (b[k] === undefined) continue;
      const v = str(b[k], 10);
      if (v && !DATE.test(v)) return bad('日付の形が違います');
      body[k] = v;
    }
    if (b.docs !== undefined) {
      const d = (b.docs && typeof b.docs === 'object' ? b.docs : {}) as Record<string, unknown>;
      body.docs = { kobetsu: d.kobetsu === true, daicho: d.daicho === true, meiji: d.meiji === true };
    }
    if (b.intent !== undefined) { const it = str(b.intent, 20); if (!INTENTS.includes(it)) return bad('意向は選択肢から選んでください'); body.intent = it; }
    if (b.note !== undefined) body.note = str(b.note, 500);
    return ikeWrite(req, T('haken-save'), body);
  }
  if (action === 'haken-confirm' || action === 'haken-ask') {
    const nn = str(b.nn, 80);
    if (!nn) return bad('氏名がありません');
    const to = (Array.isArray(b.to) ? b.to : []).map((x) => str(x, 20)).filter(Boolean).slice(0, 6);
    return ikeWrite(req, T(action), { nn, undo: b.undo === true, ...(action === 'haken-ask' ? { to } : {}) });
  }
  if (action === 'shift-pattern-save') {
    const name = str(b.name, 12), short = str(b.short, 2), start = str(b.start, 5), end = str(b.end, 5), tone = str(b.tone, 10) || 'ok';
    if (!name || !short) return bad('名前と1文字の略を入れてください');
    if (!HHMM.test(start) || !HHMM.test(end)) return bad('時間は 9:00 の形で入れてください');
    if (!TONES.includes(tone)) return bad('色は選択肢から選んでください');
    const id = str(b.id, 36);
    if (id && !/^[0-9a-f-]{36}$/.test(id)) return bad('指定が違います');
    return ikeWrite(req, T('shift-pattern-save'), { id, name, short, start, end, tone, sort: Math.max(0, Math.min(99, Number(b.sort) || 0)) });
  }
  if (action === 'shift-pattern-remove') {
    const id = str(b.id, 36);
    if (!/^[0-9a-f-]{36}$/.test(id)) return bad('指定が違います');
    return ikeWrite(req, T('shift-pattern-remove'), { id });
  }
  return bad('この操作はできません');
}
