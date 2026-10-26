import { ikeWrite } from '@/lib/ike-write';
import { CATS } from '@/lib/live/map';
import { bad, isId, isYmd, str } from '@/lib/live/horyu-guard';

// 案件の抽出・修正（保留）の書き込み。今の cases-map.html と同じ /api/cases-map の POST だけ。
//   op ごとに行き先は決め打ち（画面からパスは渡させない）。本文はここで決めた欄だけに作り直して渡す
//   ・extract … 案件文 → 各欄（AI。保存はしない）
//   ・create  … 登録（担当は今のシステムがログインした人から取る。登録すると #未経験-案件共有 に1本流れる＝今と同じ）
//   ・update  … 修正（担当は変えない） ・fill（充足／充足予約） ・close（終了） ・unreserve（予約を外す） ・reopen（再掲載）
const MODES = ['公共交通機関', '自動車', 'バイク', '自転車', '徒歩'];
const PATH: Record<string, string> = {
  extract: '/api/cases-map?action=extract', create: '/api/cases-map?action=create', update: '/api/cases-map?action=update',
  fill: '/api/cases-map?action=fill', close: '/api/cases-map?action=close', unreserve: '/api/cases-map?action=unreserve', reopen: '/api/cases-map?action=reopen',
};

function fields(b: Record<string, unknown>) {
  const category = str(b.category, 20);
  return {
    title: str(b.title, 80), company: str(b.company, 80), category: (CATS as readonly string[]).includes(category) ? category : 'その他',
    station: str(b.station, 40), access: str(b.access, 120), address: str(b.address, 160), area: str(b.area, 80),
    pinnable: b.pinnable !== false, summary: str(b.summary, 600), case_text: str(b.case_text, 8000),
    pay: str(b.pay, 80), hours: str(b.hours, 80), holiday: str(b.holiday, 80), start_text: str(b.start_text, 80), require_text: str(b.require_text, 300),
    commute_modes: (Array.isArray(b.commute_modes) ? b.commute_modes : []).map((x) => String(x)).filter((x) => MODES.includes(x)),
  };
}

export async function POST(req: Request) {
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const op = String(b.op || '');
  const path = PATH[op];
  if (!path) return bad('この操作はできません');
  if (op === 'extract') {
    const text = str(b.text, 8000);
    if (text.length < 10) return bad('案件文が短すぎます');
    return ikeWrite(req, path, { text }, { timeoutMs: 60000 });
  }
  if (op === 'create') {
    const f = fields(b);
    if (!f.title) return bad('案件名は必須です');
    if (f.pinnable && !f.station) return bad('最寄駅は必須です（駅が無い案件はエリア指定にしてください）');
    if (!f.pinnable && !f.area) return bad('エリア指定の案件はエリア名が必須です');
    return ikeWrite(req, path, f);
  }
  if (!isId(b.id)) return bad('案件の id がありません');
  const id = String(b.id);
  if (op === 'update') {
    const f = fields(b);
    if (!f.title) return bad('案件名は必須です');
    return ikeWrite(req, path, { id, ...f });
  }
  if (op === 'fill') {
    const kind = b.kind === 'reserve' ? 'reserve' : 'now';
    if (kind === 'reserve' && !isYmd(b.date)) return bad('充足予定日が正しくありません');
    return ikeWrite(req, path, { id, kind, date: kind === 'reserve' ? String(b.date) : undefined, note: str(b.note, 200) });
  }
  if (op === 'close') return ikeWrite(req, path, { id, note: str(b.note, 200) });
  return ikeWrite(req, path, { id });
}
