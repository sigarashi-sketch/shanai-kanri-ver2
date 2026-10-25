import { NextResponse } from 'next/server';
import { ikeWrite } from '@/lib/ike-write';

// 面談可能日の承認の保存の口（今の /availability.html と同じ）。
//   op=approve → /api/availability?action=approve（営業リストの面談可能日に反映・メモ/前職は書き換えない）
//   op=clear   → /api/availability?action=clear  （1人ぶんの反映を取り消す）
//   ★誰が承認したかは今のシステムがログインの人から付ける（ここからは渡さない）
// eslint-disable-next-line no-control-regex
const CTRL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g;
const txt = (v: unknown, max: number) => String(v ?? '').replace(CTRL, '').slice(0, max);
const bad = (error: string) => NextResponse.json({ error }, { status: 400 });

export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b || typeof b !== 'object') return bad('中身がありません');
  const op = String(b.op || '');

  if (op === 'approve') {
    const raw = Array.isArray(b.items) ? (b.items as Record<string, unknown>[]) : [];
    if (!raw.length || raw.length > 300) return bad('承認する人がいません');
    const items = raw.map((it) => ({
      normalizedName: txt(it?.normalizedName, 100).trim(),
      name: txt(it?.name, 100).trim(),
      displayName: txt(it?.displayName, 100).trim(),
      groupId: txt(it?.groupId, 100).trim(),
      groupName: txt(it?.groupName, 200).trim(),
      body: txt(it?.body, 2000),
      srcTsMs: Number(it?.srcTsMs) || 0,
    })).filter((it) => it.normalizedName && it.body.trim());
    if (!items.length) return bad('反映する内容が空です');
    return ikeWrite(req, '/api/availability?action=approve', { items });
  }

  if (op === 'clear') {
    const normalizedName = txt(b.normalizedName, 100).trim();
    if (!normalizedName) return bad('どの人か分かりません');
    if (b.confirmed !== true) return bad('取り消しは確かめてから押してください');
    return ikeWrite(req, '/api/availability?action=clear', { normalizedName });
  }

  return bad('この操作はできません');
}
