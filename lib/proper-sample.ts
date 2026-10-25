// プロパーリストの見本（ログインしていないとき）。今の getEngineerRows と同じ形にして、本物と同じ道で表を描く。
//   名前は見本（lib/sample.ts の PROPERS と同じ人）＋営業止め・辞退の見本2人。本物の人・単価は入れない
import { PROPERS } from './sample';
import type { EngineerRows } from './live/eigyo-common';
import { LEGACY_COLUMNS, type ScoreRes } from './live/proper-cols';

type Extra = Partial<Record<string, string | boolean>>;
const EXTRA: Record<string, Extra> = {
  s0441: { tantou: '佐藤', kadou: '即日', tsuukin: '60分', shozoku: '—', shift: '可能', yakin: '要検討', shucchou: 'NG', genba_made: '', memo: '面談10/22。夜勤は月数回なら可', sentouryoku: '3', zokusei: '20代・飲食出身', heikou_suu: '2', shoudaku_bi: '2026/10/01', hearing_booking: '2026/10/03 10:00', shoudaku_nyusha_bi: '即日' },
  s0455: { tantou: '佐藤', kadou: '11月', tsuukin: '45分', shift: '可能', yakin: '不可', shucchou: '可能', sentouryoku: '4', zokusei: '20代・販売出身', heikou_suu: '1', nyuujou_bi: '2026/11/01', sankaku_bi: '2026/10/20', shoudaku_bi: '2026/09/20', sankaku_kettei: true, shoudaku_nyusha_bi: '2026/11/01' },
  s0470: { tantou: '鈴木', kadou: '即日', tsuukin: '90分', shift: '不可', yakin: '不可', shucchou: '不可', sentouryoku: '', zokusei: '20代・物流出身', heikou_suu: '0', shoudaku_bi: '2026/10/10', eigyo_teishi: true, memo: '' },
  s0472: { tantou: '鈴木', kadou: '即日', tsuukin: '60分', shift: '要検討', yakin: '可能', shucchou: '要検討', sentouryoku: '2', zokusei: '20代・コルセン出身', heikou_suu: '3', shoudaku_bi: '2026/10/05', needs_review: true, kanagawa: true },
  s0388: { tantou: '佐藤', kadou: '稼働中', shozoku: '—', sentouryoku: '5', zokusei: '20代・家電販売出身', nyuujou_bi: '2024/10/01', sankaku_bi: '2024/09/15', shoudaku_bi: '2024/08/20', kadou_chu: true },
};
const STOPPED = [
  { id: 'sx01', name: '見本 止める', station: '川口', want: 'ヘルプデスク', e: { tantou: '鈴木', poa: true, memo: '連絡がつかない', shoudaku_bi: '2026/09/01' } as Extra },
  { id: 'sx02', name: '見本 辞退', station: '船橋', want: '事務', e: { tantou: '佐藤', jitai: true, memo: '他社に決定', shoudaku_bi: '2026/08/20' } as Extra },
];

function cellsFrom(base: Record<string, string | boolean>): (string | boolean)[] {
  return LEGACY_COLUMNS.map((c) => (c.type === 'bool' ? base[c.field] === true : String(base[c.field] ?? '')));
}

export function sampleEngineerRows(): EngineerRows {
  const rows: EngineerRows['rows'] = [];
  for (const p of PROPERS) {
    const e = EXTRA[p.id] ?? {};
    const base: Record<string, string | boolean> = {
      name: p.name, eki: p.station, gakumen: p.price, kibou_shokushu: p.want,
      sukishi: p.sukishi.state === '作成済み' ? 'https://example.com/sample-sheet' : '',
      summary: `氏名：${p.sukishi.initial || '（未設定）'}\n年齢：${p.sukishi.age}\n資格：${p.sukishi.skills}`,
      zenshoku: p.sukishi.history.map((h) => h.text).join(' / '),
      ...(e as Record<string, string | boolean>),
    };
    const stopped = base.poa === true || base.jitai === true || base.sankaku_kettei === true || base.kadou_chu === true || base.eigyo_teishi === true;
    rows.push({ row: p.id, name: p.name, active: !stopped, needsReview: base.needs_review === true, kanagawa: base.kanagawa === true, cells: cellsFrom(base), beforeSales: p.id === 's0470', dropout: false });
  }
  for (const s of STOPPED) {
    const base: Record<string, string | boolean> = { name: s.name, eki: s.station, kibou_shokushu: s.want, ...(s.e as Record<string, string | boolean>) };
    rows.push({ row: s.id, name: s.name, active: false, cells: cellsFrom(base), dropout: s.id === 'sx01' });
  }
  return { columns: LEGACY_COLUMNS.map((c, idx) => ({ idx, col: c.field, label: c.label, type: c.type })), rows, total: rows.length };
}

export const SAMPLE_SCORES: ScoreRes = {
  ok: true,
  rows: [
    { id: 's0441', skill: 62, skillRule: 58, sento: 3, skillThin: false, skillParts: [{ label: '職歴', points: 22, max: 30, note: '飲食（店長）2年' }, { label: '資格', points: 20, max: 25, note: 'CCNA・LPIC-1' }, { label: 'PC', points: 10, max: 15, note: 'Excel・Linux' }, { label: '現場経験', points: 0, max: 15, note: 'まだなし' }], join: 48.2, decline: 18.5, poa: 33.3, days: 24, cases: { sends: 6, ok: 3, ng: 1, undecided: 2, declineWords: 0, condWords: 1, reschedWords: 0 }, resp: { outs: 9, replied: 8, rate: 89, medianHours: 1.5 }, joinWhy: [{ label: '案件にOKを返している', v: 0.62 }, { label: '返信が早い', v: 0.31 }], declineWhy: [{ label: '承諾から3週間以上', v: 0.22 }] },
    { id: 's0470', skill: 38, skillRule: 38, sento: null, skillThin: false, skillParts: [{ label: '職歴', points: 7, max: 30, note: '物流倉庫' }, { label: '資格', points: 20, max: 25, note: '基本情報技術者' }, { label: 'PC', points: 5, max: 15, note: '記載少なめ' }, { label: '現場経験', points: 0, max: 15, note: 'まだなし' }], join: 21.4, decline: 41.0, poa: 37.6, days: 15, cases: { sends: 2, ok: 0, ng: 2, undecided: 0, declineWords: 1, condWords: 2, reschedWords: 0 }, resp: { outs: 5, replied: 2, rate: 40, medianHours: 20 }, joinWhy: [{ label: '案件にNGが続いている', v: -0.48 }], declineWhy: [{ label: '「見送ります」の発言', v: 0.55 }, { label: '返信が遅い', v: 0.3 }] },
    { id: 's0472', skill: 21, skillRule: 21, sento: 2, skillThin: true, skillParts: [{ label: '職歴', points: 0, max: 30, note: 'フォーム未提出' }, { label: '資格', points: 8, max: 25, note: 'MOS' }, { label: 'PC', points: 0, max: 15, note: '—' }, { label: '現場経験', points: 0, max: 15, note: 'まだなし' }], join: 33.0, decline: 30.1, poa: 36.9, days: 20, cases: null, resp: null, joinWhy: [], declineWhy: [] },
  ],
  meta: { trained: 412, samples: 3100, withT1: 380, counts: { join: 190, decline: 120, poa: 102 }, base: { join: 34.0, decline: 30.0, poa: 36.0 }, cvAuc: { join: 0.74, decline: 0.71, joinLate: 0.72, declineLate: 0.69 }, features: 60, generatedAt: '2026-10-25T00:00:00Z', trainFrom: '2026-03-01' },
};
