// タグ＝名簿の人に付く目印。2種類ある（2026-10-02 shoya「今後いっぱい増える・タグで絞って配信したい」「手で付けるタグも作って」）。
//   ・自動で付くタグ（例「アンケート未回答」）… 下の TAGS が唯一の一覧。足すときは1行足す。
//       on は Member だけを見て決める（足りない材料は lib/roster.ts の loadMembers で Member に載せる）
//   ・手で付けるタグ … DB（0016 tags / member_tags）。画面で作って付ける（components/TagEditor.tsx）。Member.tags に名前が入る
//   チャットのバッジ・絞り込みチップと、配信の「条件で絞る → タグ」は tagsOf / allTags を通して両方を同じに扱う。
//   名簿と紐付いていないLINEは誰か分からないのでタグは付かない
import type { Member } from '@/components/sy/compat';

export interface TagDef {
  key: string;
  label: string;
  tone: 'warn' | 'danger' | 'muted' | 'plain' | 'stop';   // バッジの色（components/ui.tsx TagBadge）。plain＝手で付けたタグ・stop＝ぼうさん（紫）
  row?: boolean;                        // チャットの一覧で行ごと色を付けて目立たせる
  on: (m: Member) => boolean;
}

// ぼうさん のタグの key（チャットの一覧は このタグの人を 紫で強調する＝要対応の赤とは 別の色）
export const BOUSAN_TAG = 'bousan';
export const TAGS: TagDef[] = [
  // ぼうさん＝接触禁止の印（それゆけ未経験だけ・手で付ける。名簿の詳細のチェック）。送らない決まりは lib/bousan.ts。2026-10-11 shoya
  { key: BOUSAN_TAG, label: 'ぼうさん', tone: 'stop', row: true, on: (m) => !!m.bousan },
  // 月次アンケート（いちばん新しい月分）にまだ答えていない 稼働中・待機 の人。決め方は lib/survey.ts
  //   チャットの一覧で 行ごとオレンジに塗るのは やめた（2026-10-13 shoya「オレンジ強調表示いらない」）。バッジと絞り込みは残す
  { key: 'survey', label: 'アンケート未回答', tone: 'warn', on: (m) => !!m.surveyTodo },
  // コミュニティのリーダー（状態は問わない。稼働中だけ・待機だけに したい ときは「状態・ステージ」と 組み合わせる）。2026-10-02 shoya「タグでリーダーだけ絞り込めるように」
  { key: 'leader', label: 'リーダー', tone: 'muted', on: (m) => !!m.leader },
];

// 手で付けたタグ（名前がそのまま目印。自動のタグと同じ名前は作れない＝app/api/s/tags）
const manual = (name: string): TagDef => ({ key: 'm:' + name, label: name, tone: 'plain', on: (m) => m.tags.includes(name) });
export const tagsOf = (m: Member | null | undefined): TagDef[] => (m ? [...TAGS.filter((t) => t.on(m)), ...m.tags.map(manual)] : []);
// 絞り込みに出すタグの一覧＝自動のタグ全部＋その人たちの誰かに付いている手動のタグ
export const allTags = (ms: Member[]): TagDef[] => [...TAGS, ...[...new Set(ms.flatMap((m) => m.tags))].sort((a, b) => a.localeCompare(b, 'ja')).map(manual)];
