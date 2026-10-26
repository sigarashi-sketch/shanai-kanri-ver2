import { NextResponse } from 'next/server';
import { ikeToken } from '@/lib/ike';
import { ikeWrite } from '@/lib/ike-write';
import { SELECTABLE_BLOCK_IDS } from '@/lib/live/proper-cols';

// 通勤エリア（営業が直す分）を保存する口。書く先は今の POST /api/commute-area だけ（決め打ち）。
//   {name, any, blocks}＝営業の入力で上書き／{name, clear:true}＝営業の入力を消して本人の回答に戻す
//   本人の回答（フォーム）は今のシステムも書かない。同姓同名は今のシステムが断る（409）
export async function POST(req: Request) {
  if (!(await ikeToken())) return NextResponse.json({ ok: false, error: 'ログインしてください' }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { name?: unknown; any?: unknown; blocks?: unknown; clear?: unknown };
  const name = typeof b.name === 'string' ? b.name.trim() : '';
  if (!name || name.length > 60) return NextResponse.json({ ok: false, error: '氏名が違います' }, { status: 400 });
  if (b.clear === true) return ikeWrite(req, '/api/commute-area', { name, clear: true });
  if (typeof b.any !== 'boolean' || !Array.isArray(b.blocks) || b.blocks.length > 40 || !b.blocks.every((x) => typeof x === 'string' && SELECTABLE_BLOCK_IDS.has(x))) {
    return NextResponse.json({ ok: false, error: 'エリアの中身が違います' }, { status: 400 });
  }
  return ikeWrite(req, '/api/commute-area', { name, any: b.any, blocks: Array.from(new Set(b.blocks as string[])) });
}
