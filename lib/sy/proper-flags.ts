import 'server-only';
import { ike, onIkeikeDb } from './db';
import { normName } from './name';
import { PROPER_FLAGS, type ProperRow } from './proper-flags-types';
export type { ProperRow };

// 同じ氏名で行が複数あるとき（辞退のあと再承諾など）は 全部返す。新しい行が先
export async function properRows(name: string): Promise<ProperRow[]> {
  if (!onIkeikeDb()) return [];
  const nn = normName(name); const raw = name.trim();
  if (!nn) return [];
  const cols = 'name, normalized_name, tantou, shoudaku_bi, shoudaku_nyusha_bi, sankaku_bi, nyuujou_bi, updated_at, ' + PROPER_FLAGS.map(([k]) => k).join(', ');
  const { data, error } = await ike().from('sales_roster').select(cols)
    .or(`normalized_name.eq."${nn.replace(/"/g, '')}",name.eq."${raw.replace(/"/g, '')}"`)
    .order('updated_at', { ascending: false }).limit(10);
  if (error) throw new Error(error.message);
  const s = (v: unknown) => String(v ?? '').trim();
  return ((data || []) as unknown as Record<string, unknown>[])
    .filter((r) => normName(s(r.name)) === nn || s(r.normalized_name) === nn)
    .map((r) => ({
      flags: Object.fromEntries(PROPER_FLAGS.map(([k]) => [k, r[k] === true])) as ProperRow['flags'],
      tantou: s(r.tantou), shoudaku: s(r.shoudaku_bi), kanou: s(r.shoudaku_nyusha_bi), sankaku: s(r.sankaku_bi), nyuujou: s(r.nyuujou_bi),
    }));
}
