import { redirect } from 'next/navigation';

// 申請の承認は経理管理へ移した（10-27 shoya「申請の承認は経理にうつしてほしい」）。前の行き先はこちらへ
export default function RoumuApprovalMoved() {
  redirect('/keiri/approval');
}
