import { NextResponse } from 'next/server';
import { ikeToken } from '@/lib/ike';
import { ikeWrite } from '@/lib/ike-write';
import { EDITABLE_FIELDS, colOfField, fieldIdx } from '@/lib/live/proper-cols';

// プロパーリストのセル（チェック・文字）を保存する口（10-25 shoya「参画とか辞退ボタンとかもね」）。
//   ・書く先は今の POST /api/roster?action=saveEngineerRow だけ（決め打ち）。body は {row, cells:{idx:値}, kv:2}
//     参画決定ON → 稼働中ON・再アサインOFF・営業止めOFF・待機OFF、メモ入力 → 初回ヒアリング予約 などの連動は今のシステムがやる
//   ・画面からは {row, cells:{列名:値}} を受け、ここで列名 → idx に直す（idx のずれで別の列に書かないように）
//   ・直してよい列は EDITABLE_FIELDS だけ。チェック列は true/false だけ、文字列は 5,000 字まで
//   ・kv:2 は「稼働の月を勝手に今月へ直す古い画面ではない」印（今のシステムが来年の月を守るための目印）
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(req: Request) {
  if (!(await ikeToken())) return NextResponse.json({ ok: false, error: 'ログインしてください' }, { status: 401 });
  const b = (await req.json().catch(() => ({}))) as { row?: unknown; cells?: unknown };
  const row = typeof b.row === 'string' ? b.row : '';
  if (!UUID.test(row)) return NextResponse.json({ ok: false, error: '行が違います' }, { status: 400 });
  if (!b.cells || typeof b.cells !== 'object' || Array.isArray(b.cells)) return NextResponse.json({ ok: false, error: '直す中身がありません' }, { status: 400 });
  const entries = Object.entries(b.cells as Record<string, unknown>);
  if (!entries.length || entries.length > 12) return NextResponse.json({ ok: false, error: '直す列の数が違います' }, { status: 400 });
  const cells: Record<string, string> = {};
  for (const [field, val] of entries) {
    const col = colOfField(field);
    if (!col || !EDITABLE_FIELDS.has(field)) return NextResponse.json({ ok: false, error: `この列は直せません（${field}）` }, { status: 400 });
    if (col.type === 'bool') {
      if (typeof val !== 'boolean') return NextResponse.json({ ok: false, error: `${col.label} は ON/OFF だけです` }, { status: 400 });
      cells[String(fieldIdx(field))] = String(val);
    } else {
      if (typeof val !== 'string' || val.length > 5000) return NextResponse.json({ ok: false, error: `${col.label} の値が違います` }, { status: 400 });
      if (field === 'sentouryoku' && val !== '' && !/^[0-5]$/.test(val)) return NextResponse.json({ ok: false, error: '戦闘力は 0〜5 です' }, { status: 400 });
      cells[String(fieldIdx(field))] = val;
    }
  }
  return ikeWrite(req, '/api/roster?action=saveEngineerRow', { row, cells, kv: 2 });
}
