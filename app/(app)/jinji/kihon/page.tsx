import { redirect } from 'next/navigation';

// 旧「基本情報」はスキルシート作成になった（10-23 shoya）。前のリンクから来ても迷わないように飛ばす。
export default function KihonMoved() { redirect('/jinji/skillsheet'); }
