'use client';
import { use } from 'react';
import EnqueteEditor from '@/components/sy/enquete/EnqueteEditor';
import { SyLoad } from '@/components/sy/Load';
import type { EnqForm, EnqResponse } from '@/lib/sy/enquete-types';
// フォームの編集（質問／回答／設定）
export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <SyLoad<{ form: EnqForm; responses: EnqResponse[] }> path={`/api/sy/s/enquete/${encodeURIComponent(id)}`}>{(d) => <EnqueteEditor initial={d.form} initialResponses={d.responses} />}</SyLoad>;
}
