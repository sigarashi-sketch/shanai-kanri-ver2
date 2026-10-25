// 社員（人事）から今の社内システムに書く1件の形と、その確かめ（画面とサーバの両方から読む・純粋な関数だけ）。
//   ・行き先（今のシステムのどの口か）は app/api/live/staff/write/route.ts が kind ごとに決め打ちする。画面は kind と値しか送れない
//   ・値の形はここで確かめる（日付は YYYY-MM-DD か空・選ぶものは決まった中から・文字は長さを切る）
//   ・今のシステムの口と同じ名前・同じ値（legacy の roster.html / taiou-modal.js / dashboard.html の呼び方の写し）
export const OVERRIDE_CHOICES = [
  { v: '', label: '自動で判定' }, { v: 'kadou', label: '稼働中' }, { v: 'yotei', label: '入場予定' },
  { v: 'zaiseki', label: '在籍（現場外）' }, { v: 'taiki', label: '待機' }, { v: 'kyushoku', label: '休職・産休' }, { v: 'taisha', label: '退社' },
] as const;
export const TAIOU_KINDS = ['電話', 'LINE', '面談', 'フォロー面談', '定期面談', 'その他'] as const;
export const TAIOU_INTERVIEW = ['フォロー面談', '定期面談'] as const;
export const TAIOU_FIELDS = [
  { key: 'genba_kenen', label: '現場懸念点' }, { key: 'kongo_ganbaru', label: 'これから頑張りたいこと' }, { key: 'hyouka_ima', label: '現状評価されていること' },
] as const;
export const BENKYOU_UNITS = ['週', '月', '日'] as const;
/** 営業リストの印（setEngineerStatusByName）で ver2 から押せるもの */
export const FLAG_KEYS = ['辞退', 'ぽあ', '参画決定'] as const;

export type StatusPatch = { taisha?: boolean; taishaBi?: string; taiki?: boolean; override?: string; taikiYotei?: string; taishaYotei?: string };
export type TaiouFields = Partial<Record<'genba_kenen' | 'kongo_ganbaru' | 'hyouka_ima' | 'benkyou_note' | 'benkyou_unit', string>> & { benkyou_hours?: number };
export type StaffWrite =
  | { kind: 'status'; name: string; patch: StatusPatch }
  | { kind: 'eki'; name: string; field: 'home_eki' | 'site_eki'; value: string }
  | { kind: 'nyusha'; name: string; field: 'nyusha_bi' | 'shokai_end' | 'taijou_bi'; value: string }
  | { kind: 'sales'; name: string; field: 'sai_assign' | 'sankaku_kettei'; value: boolean }
  | { kind: 'sales'; name: string; field: 'nyuujou_bi'; value: string }
  | { kind: 'tantou'; name: string; value: string }
  | { kind: 'flag'; name: string; statusKey: (typeof FLAG_KEYS)[number]; value: boolean }
  | { kind: 'taiou'; name: string; taiouKind: (typeof TAIOU_KINDS)[number]; body: string; fields: TaiouFields }
  | { kind: 'linegroup'; name: string; groupId: string };

const isDate = (v: unknown) => v === '' || (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)));
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : null);
const oneOf = <T extends string>(v: unknown, xs: readonly T[]): v is T => typeof v === 'string' && (xs as readonly string[]).includes(v);

/** 画面から来た JSON を確かめて StaffWrite にする。だめなら理由の文 */
export function parseStaffWrite(b: unknown): StaffWrite | string {
  if (!b || typeof b !== 'object') return '送る中身がありません';
  const o = b as Record<string, unknown>;
  const name = str(o.name, 60);
  if (!name) return '氏名がありません';
  switch (o.kind) {
    case 'status': {
      const p = (o.patch && typeof o.patch === 'object' ? o.patch : {}) as Record<string, unknown>;
      const out: StatusPatch = {};
      if ('taisha' in p) { if (typeof p.taisha !== 'boolean') return '退社の値が違います'; out.taisha = p.taisha; }
      if ('taiki' in p) { if (typeof p.taiki !== 'boolean') return '待機の値が違います'; out.taiki = p.taiki; }
      if ('taishaBi' in p) { if (!isDate(p.taishaBi)) return '退社日が日付ではありません'; out.taishaBi = p.taishaBi as string; }
      if ('taikiYotei' in p) { if (!isDate(p.taikiYotei)) return '待機の予約日が日付ではありません'; out.taikiYotei = p.taikiYotei as string; }
      if ('taishaYotei' in p) { if (!isDate(p.taishaYotei)) return '退社の予約日が日付ではありません'; out.taishaYotei = p.taishaYotei as string; }
      if ('override' in p) { if (!oneOf(p.override, ['', 'kadou', 'yotei', 'zaiseki', 'kyushoku', 'taiki'])) return '状態の値が違います'; out.override = p.override; }
      if (!Object.keys(out).length) return '変える項目がありません';
      return { kind: 'status', name, patch: out };
    }
    case 'eki': {
      if (!oneOf(o.field, ['home_eki', 'site_eki'] as const)) return '項目が違います';
      const v = str(o.value, 40); if (v == null) return '駅名が違います';
      return { kind: 'eki', name, field: o.field, value: v };
    }
    case 'nyusha': {
      if (!oneOf(o.field, ['nyusha_bi', 'shokai_end', 'taijou_bi'] as const)) return '項目が違います';
      if (!isDate(o.value)) return '日付ではありません';
      return { kind: 'nyusha', name, field: o.field, value: o.value as string };
    }
    case 'sales': {
      if (o.field === 'nyuujou_bi') { if (!isDate(o.value)) return '入場日が日付ではありません'; return { kind: 'sales', name, field: 'nyuujou_bi', value: o.value as string }; }
      if (!oneOf(o.field, ['sai_assign', 'sankaku_kettei'] as const)) return '項目が違います';
      if (typeof o.value !== 'boolean') return '値が違います';
      return { kind: 'sales', name, field: o.field, value: o.value };
    }
    case 'tantou': {
      const v = str(o.value, 40); if (v == null) return '採用担当が違います';
      return { kind: 'tantou', name, value: v };
    }
    case 'flag': {
      if (!oneOf(o.statusKey, FLAG_KEYS)) return '印の種類が違います';
      if (typeof o.value !== 'boolean') return '値が違います';
      return { kind: 'flag', name, statusKey: o.statusKey, value: o.value };
    }
    case 'taiou': {
      if (!oneOf(o.taiouKind, TAIOU_KINDS)) return '区分が違います';
      const body = str(o.body, 4000) ?? '';
      const f = (o.fields && typeof o.fields === 'object' ? o.fields : {}) as Record<string, unknown>;
      const fields: TaiouFields = {};
      if ((TAIOU_INTERVIEW as readonly string[]).includes(o.taiouKind)) {
        for (const { key } of TAIOU_FIELDS) { const v = str(f[key], 2000); if (v) fields[key] = v; }
        const h = Number(f.benkyou_hours);
        if (f.benkyou_hours !== '' && f.benkyou_hours != null && Number.isFinite(h) && h >= 0 && h <= 1000) {
          fields.benkyou_hours = Math.round(h * 10) / 10;
          fields.benkyou_unit = oneOf(f.benkyou_unit, BENKYOU_UNITS) ? f.benkyou_unit : '週';
        }
        const note = str(f.benkyou_note, 200); if (note) fields.benkyou_note = note;
      }
      if (!body && !Object.keys(fields).length) return '対応内容を書いてください';
      return { kind: 'taiou', name, taiouKind: o.taiouKind, body, fields };
    }
    case 'linegroup': {
      const g = str(o.groupId, 80); if (g == null || !/^[A-Za-z0-9_-]*$/.test(g)) return 'グループが違います';
      return { kind: 'linegroup', name, groupId: g };
    }
    default: return '書く種類が違います';
  }
}

/** ルール欠勤の回数 → 対応の段（今の名簿 roster-cols.js RULE_PHASES の写し） */
export const RULE_PHASES = [
  null,
  { mark: '①', label: '営業面談', tone: 'caution' },
  { mark: '②', label: '来社面談', tone: 'warn' },
  { mark: '③', label: '書面注意・改善計画書', tone: 'bad' },
  { mark: '④', label: 'けん責を検討', tone: 'bad' },
] as const;
export const rulePhaseOf = (n: number) => RULE_PHASES[Math.min(Math.max(n, 0), RULE_PHASES.length - 1)];
