import { SyFxHost } from '@/components/sy/compat';

// 人財管理（10-27 shoya「それゆけ未経験も移管しちゃおう ページは人財管理ってメニューで」）。
//   それゆけ未経験にしかなかった画面を ver2 に移したもの。画面のコードは components/sy（それゆけの写しを ver2 の部品で）、
//   処理も ver2 の中（app/api/sy/s＝それゆけ app/api/s の写し・lib/sy）。それゆけのサーバは呼ばない。データ（saiyou スキーマ）・権限・保存の決まりはそれゆけと同じ。
//   ver2 にもうあった画面（コミュニティ・離職率・資格手当・採用・bdsh）は 人事管理からこの分類へ移しただけ
export default function JinzaiLayout({ children }: { children: React.ReactNode }) {
  return <div className="pb-12"><SyFxHost />{children}</div>;
}
