import { IkFrame } from '../IkFrame';
import { KakunouTabs } from './KakunouTabs';

// 請求書・勤務表の格納（10-25 shoya「格納ページも作らないと 既存にあるよ勤務表と請求書の格納」）。
//   今の請求書作成（/seikyu-make.html）の「格納」タブをそのまま出す＝データ・判定（誰が格納ずみか）は今の画面のまま
//   10-28 shoya「請求書 勤怠表の格納の中に 見積書格納するタブもつくって」＝上にタブ（請求書・勤務表／見積書）。見積書は ver2 で作った（MitsumoriStore.tsx）
export default async function KakunouPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const tab = (await searchParams).tab === 'mitsumori' ? 'mitsumori' : 'seikyu';
  return <KakunouTabs initial={tab} frame={<IkFrame src="/ik/seikyu-make.html?v2pane=store" title="請求書・勤務表の格納" height="calc(100vh - 58px - 46px)" />} />;
}
