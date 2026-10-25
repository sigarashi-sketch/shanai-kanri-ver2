// 「未経験の人だけ」を出すための共通の道具（2026-10-25 shoya「全部未経験だけの情報いれてほしい・旧いけどんのプロパーリスト入る人正で」）。
//   ・未経験の正 … 今の社内システムのプロパーリスト（GET /api/roster?action=getEngineerRows）に名前がある人
//       営業止め・辞退の行も「プロパーリストに入っている」ので未経験として数える
//       ?area を付けずに読む＝全エリア（本体・かな西・関西）。?area=main だと関西の人が外れるので使わない
//   ・名前の照合は eigyo-common の normName（空白（半角・全角）を外す＋さん・様を外す＋異体字を寄せる＝今のシステムの normName と同じ）
//   ・同姓同名は区別できない（プロパーリストに同じ名前の人がいれば、別人でも通る）
//   ・ここは純粋な関数だけ（画面とサーバの両方から読む）
import { normName, type EngineerRows } from './eigyo-common';

export const MIKEIKEN_PATH = '/api/roster?action=getEngineerRows';
export const MIKEIKEN_NOTE = '未経験の人だけ（今のプロパーリストに入っている人）を出しています';

export type MikeikenSet = ReadonlySet<string>;

export const mikeikenKey = (name: unknown) => normName(name);

/** getEngineerRows の返り → 未経験の人の名前キーの集まり（営業止め・辞退の行も入れる） */
export function mikeikenSetOf(d: Pick<EngineerRows, 'rows'> | null | undefined): Set<string> {
  const s = new Set<string>();
  for (const r of d?.rows || []) { const k = mikeikenKey(r.name); if (k) s.add(k); }
  return s;
}

export const isMikeiken = (set: MikeikenSet, name: unknown) => { const k = mikeikenKey(name); return !!k && set.has(k); };

/** 人の行を未経験の人だけにする。name は行から氏名を取る関数（または列名） */
export function onlyMikeiken<T>(set: MikeikenSet, rows: readonly T[], name: ((r: T) => unknown) | keyof T): T[] {
  const get = typeof name === 'function' ? name : (r: T) => r[name];
  return rows.filter((r) => isMikeiken(set, get(r)));
}
