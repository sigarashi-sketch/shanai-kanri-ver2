import { redirect } from 'next/navigation';

// 転籍台帳はページに出さない（10-25 shoya「裏で持っててさ従業員名簿にいれてほしい」）。
//   中身は社員一覧（名前の下に転籍予定／転籍済み）と変更の予約（項目＝転籍）に出す。古いリンク用
export default function TensekiMoved() {
  redirect('/jinji/yoyaku');
}
