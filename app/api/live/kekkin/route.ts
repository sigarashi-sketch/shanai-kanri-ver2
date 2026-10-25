import { NextResponse } from 'next/server';
import { ikeWrite } from '@/lib/ike-write';
import { EVIDENCE_MAX_BYTES, EVIDENCE_TYPES, KEKKIN_NOTE_MAX } from '@/lib/live/kekkin';

// 欠勤管理（/roumu/kekkin）の書く口（10-25）。今の POST /api/roster?op=kekkin&action=… にだけ書く。
//   save     {date,name,reason?,note?}       … 理由・メモ（理由は今のシステムの選択肢だけ。今のシステムも確かめる）
//   uploadUrl {filename,contentType,size}    … エビデンスの上げ先（署名付きURL）を今のシステムにもらう。ファイルの中身は ver2 を通らない
//   attach   {date,name,path,filename}       … 上げ終わったファイルを行に付ける（実体があるかは今のシステムが Storage で確かめる）
//   detach   {id,path} ／ remove {id}         … 添付を外す（実体も消える）／行を消す（添付が残っている行は今のシステムが断る）
//   ★権限は今の社内システムのページ権限 kekkin。ログに名前・ファイル名を出さない
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/;
const PATH = /^kekkin\/\d{4}\/[0-9a-f-]{36}\.(jpg|jpeg|png|gif|webp|heic|pdf)$/;
const str = (v: unknown, max: number) => String(v == null ? '' : v).trim().slice(0, max);

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(b.action || '');
  const T = (a: string) => `/api/roster?op=kekkin&action=${a}`;

  if (action === 'save') {
    const date = str(b.date, 10), name = str(b.name, 80);
    if (!DATE.test(date) || !name) return NextResponse.json({ error: '日付と氏名がありません' }, { status: 400 });
    const body: Record<string, unknown> = { date, name };
    if (b.reason !== undefined) body.reason = str(b.reason, 40);
    if (b.note !== undefined) body.note = str(b.note, KEKKIN_NOTE_MAX);
    return ikeWrite(req, T('save'), body);
  }
  if (action === 'uploadUrl') {
    const size = Number(b.size);
    const type = str(b.contentType, 60).toLowerCase();
    const filename = str(b.filename, 120);
    if (!Number.isFinite(size) || size <= 0 || size > EVIDENCE_MAX_BYTES) return NextResponse.json({ error: `ファイルは ${EVIDENCE_MAX_BYTES / 1048576}MB までです` }, { status: 400 });
    const ext = (filename.split('.').pop() || '').toLowerCase();
    if (!EVIDENCE_TYPES.includes(type) && !['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'pdf'].includes(ext)) return NextResponse.json({ error: '画像か PDF だけ付けられます' }, { status: 400 });
    const res = await ikeWrite(req, T('uploadUrl'), { filename, contentType: type, size });
    if (!res.ok) return res;
    const j = (await res.json()) as { path?: string; signedUrl?: string };
    // 上げ先は Supabase の Storage だけ（今のシステムの答えでも、ほかの行き先なら画面に渡さない）
    let okHost = false;
    try { const u = new URL(String(j.signedUrl || '')); okHost = u.protocol === 'https:' && u.hostname.endsWith('.supabase.co'); } catch { okHost = false; }
    if (!okHost || !PATH.test(String(j.path || ''))) return NextResponse.json({ error: '上げ先を受け取れませんでした' }, { status: 502 });
    return NextResponse.json({ ok: true, path: j.path, signedUrl: j.signedUrl });
  }
  if (action === 'attach') {
    const date = str(b.date, 10), name = str(b.name, 80), path = str(b.path, 120);
    if (!DATE.test(date) || !name || !PATH.test(path)) return NextResponse.json({ error: '指定が違います' }, { status: 400 });
    return ikeWrite(req, T('attach'), { date, name, path, filename: str(b.filename, 120) });
  }
  if (action === 'detach') {
    const id = str(b.id, 36), path = str(b.path, 120);
    if (!UUID.test(id) || !PATH.test(path)) return NextResponse.json({ error: '指定が違います' }, { status: 400 });
    return ikeWrite(req, T('detach'), { id, path });
  }
  if (action === 'remove') {
    const id = str(b.id, 36);
    if (!UUID.test(id)) return NextResponse.json({ error: '指定が違います' }, { status: 400 });
    return ikeWrite(req, T('remove'), { id });
  }
  return NextResponse.json({ error: 'この操作はできません' }, { status: 400 });
}
