// 要員リスト：今の社内システムの3つの口 → この画面の形。
//   ・プロパー  … /api/roster?action=getEngineerRows&area=main（今の proper.html と同じ・関西要員は今と同じく本体から外れる）
//   ・営業共有リスト … /api/partner-list?action=list（今の partner-list.html と同じ。営業中の人だけ・出す列は今の API が決める）
//   ・ライバーリスト … /api/livers（今の livers.html と同じ。全体管理者だけ＝見られるかどうかは今の API が決める）
//   ・「担当」は営業リストの担当＝採用担当（担当営業ではない）。額面は今のプロパーリストに出ている値
import type { Proper } from '../sample';
import { cellsOf, properStatus, type EngineerRows } from './eigyo-common';

export type LiveProper = Proper & { recruiter: string; gakumen: string; sukishiUrl: string; pdfUrl: string; summary: string; flag: string };

export function liveProperRows(d: EngineerRows | null): LiveProper[] {
  if (!d) return [];
  const out: LiveProper[] = [];
  for (const r of d.rows) {
    const c = cellsOf(d, r);
    const st = properStatus(r, c);
    if (st === '止め・辞退') continue;   // 営業止め・辞退の人は出さない（今のリストでは灰色の行）
    const ini = /(?:^|\n)\s*氏\s*名\s*[：:]\s*([^\s(（\n]+)/.exec(c.summary)?.[1] ?? '';
    const age = /(\d{2})\s*歳/.exec(c.summary)?.[1];
    out.push({
      id: r.row, name: r.name, station: c.eki || '—', status: st, sales: '—', want: c.kibou_shokushu || '—', price: c.gakumen || '—',
      recruiter: c.tantou || '—', gakumen: c.gakumen, sukishiUrl: /^https?:/.test(c.sukishi) ? c.sukishi : '', pdfUrl: r.pdfAnonUrl || r.pdfUrl || '',
      summary: c.summary, flag: r.beforeSales ? '営業開始前' : on2(c.eigyo_teishi) ? '営業停止' : on2(c.sai_assign) ? '再アサイン' : '',
      sukishi: {
        state: c.sukishi ? '作成済み' : ini ? '未作成' : '要確認', initial: ini, age: age ? `${age}歳` : '—',
        skills: c.zenshoku.slice(0, 80) || '—', start: c.shoudaku_nyusha_bi || c.kadou || '—', history: [],
        ...(c.sukishi || ini ? {} : { warn: 'サマリに「氏名：イニシャル」が無いので、客先に出す名前が決まっていません' }),
      },
    });
  }
  return out;
}
const on2 = (v: string) => v === 'true';

// 営業共有リストの1行（今の PartnerRow のうち画面で使うものだけ）
export type PartnerRow = { id: string; name: string; initial: string; eki: string; kadou: string; kanouBi: string; kibou: string; heikou: string; tags: string[] };
export type PartnerList = { ok: boolean; people: PartnerRow[]; total: number; error?: string };

// ライバーリストの1行（今の liver_list の列）
export type LiverRow = { id: string; name: string; tantou: string | null; shoudaku_bi: string | null; nyusha_bi: string | null; eki: string | null; status: string | null; memo: string | null; source: string | null };
export type LiverList = { ok: boolean; rows: LiverRow[]; inProper: string[]; error?: string };
