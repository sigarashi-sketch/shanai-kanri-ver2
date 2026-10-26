'use client';

import Link from 'next/link';
import { Network } from 'lucide-react';
import { PageTitle } from '@/components/ui';

// 権限管理。
//   ★10-26 組織表が正：人ごとのロール・区分ごとの段階・組織の権限は「組織表」で付ける（ここで人ごとに付けるのはやめた）。
//     組織表で何も付いていない人だけ、前に共有の設定（members）に保存した段階／今のシステムのロールから決めた初めの値で動く（lib/members-store.ts）
//   「名前の小窓で見られるもの（ロールごと）」の表も 10-26 shoya「無くして 組織表ベースで」で消した（組織表のロール・部署/チームで付ける）
export function AccessEditor() {
  return (
    <main className="flex flex-col gap-4 px-6 pb-12 pt-[22px]">
      <PageTitle title="権限管理" sub="入れるのは未経験事業部の内勤だけ（それ以外は営業共有リストだけ）。内勤の中は区分ごとに 見ない／見る／直す／承認" />
      <section className="mo-fade-up flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-5 py-4">
        <Network size={18} className="text-muted" />
        <div className="text-body">
          <b>人ごとの権限は「組織表」で付けます</b>
          <div className="text-sm text-muted">ロール・区分ごとの段階・名前の小窓で見られるもの（チャット・要約・基本情報・単価額面）・部署やチームの権限は組織表が正です。組織表で何も付いていない人は、今のシステムのロールから決めた初めの値で動きます。</div>
        </div>
        <Link href="/settings/org" className="btn-secondary ml-auto">組織表を開く</Link>
      </section>
    </main>
  );
}
