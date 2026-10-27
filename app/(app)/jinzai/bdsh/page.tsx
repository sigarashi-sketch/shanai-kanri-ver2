import { redirect } from 'next/navigation';

// bdsh（10-26 shoya「人事管理にbdshもいれて」「それゆけで押した時と同じ感じでbdsh開ければいいよ」）。
//   中身はそれゆけ未経験の bdsh の内勤画面（受講データ・受講URLを渡す・解放・CCNA・キッティング）そのもの＝ver2 では作らない。
//   押すとそれゆけの /kyouiku へ移る（それゆけの左メニューの「bdsh」と同じ行き先）。見られるか・ログインはそれゆけ側の決まりのまま
//   枠（iframe）の中に出さないのは、別のサイトの中だとそれゆけのログインの cookie が送られず開けないため
const SOREYUKE_BDSH = 'https://soreyuke.vercel.app/kyouiku';
export default function BdshPage() {
  redirect(SOREYUKE_BDSH);
}
