'use client';

import { useState } from 'react';
import { FileSpreadsheet, FileText } from 'lucide-react';
import { needText, usePerms } from '@/components/Perms';
import { useMotivation } from '@/components/Motivation';
import type { SukishiFileUrls } from '@/lib/live/eigyo-common';

// スキルシートのファイル（本名版／イニシャル版 × PDF／Excel）＝今の proper.html の PDF 列（pdfCellHtml）と同じ。
//   ・それぞれ「閲覧」（Drive の /view）と「DL」（uc?export=download）。★本名版はドライブの共有しだいで他の人は開けないことがある
//   ・スキシ（スプレッドシート）がある行だけ「PDF出力」「Excel出力」＝今の genPdf / genXlsx と同じ（POST /api/skillsheet・URL は変わらない）
//   ・できるファイルの中身は今のシステムが作る＝ver2 では何も変えない。Google スプレッドシートをブラウザで印刷すると
//     メニューや行番号まで入って右が切れるので、客先に出すのはここの PDF（イニシャル版）を使う
export type { SukishiFileUrls };

export function driveDl(url: string): string {
  const m = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  return m ? `https://drive.google.com/uc?export=download&id=${m[1]}` : url;
}
const isUrl = (x?: string) => !!x && /^https?:\/\//.test(x);

/** 絞り込み・並べ替え用の文字（今の proper.html と同じ「PDFあり / Excelなし」） */
export function sukishiFilesText(f: SukishiFileUrls): string {
  return `${isUrl(f.pdfUrl) ? 'PDFあり' : 'PDFなし'} / ${isUrl(f.xlsxUrl) ? 'Excelあり' : 'Excelなし'}`;
}

export function SukishiFiles({ files, row, name, canMake, live = true, size = 'sm', onMade }: {
  files: SukishiFileUrls; row?: string; name?: string;
  canMake: boolean;          // スキシ（スプレッドシート）がある＝出力できる
  live?: boolean; size?: 'sm' | 'md'; onMade?: () => unknown;
}) {
  const canEdit = usePerms().can('eigyo', 'edit') && live;
  const { hit, toast } = useMotivation();
  const [made, setMade] = useState<SukishiFileUrls>({});
  const [busy, setBusy] = useState<'' | 'pdf' | 'xlsx'>('');
  const f = { ...files, ...made };

  const make = async (kind: 'pdf' | 'xlsx') => {
    if (!row || busy) return;
    const label = kind === 'pdf' ? 'PDF' : 'Excel';
    setBusy(kind);
    try {
      const r = await fetch('/api/live/proper-pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ row, kind }) });
      const j = (await r.json().catch(() => ({}))) as SukishiFileUrls & { ok?: boolean; error?: string; warning?: string };
      const got = kind === 'pdf' ? j.pdfUrl || j.pdfAnonUrl : j.xlsxUrl || j.xlsxAnonUrl;
      if (!r.ok || !j.ok || !got) toast({ text: `${name ? `${name}：` : ''}${label}を出せませんでした`, sub: j.error || `（${r.status}）` });
      else {
        setMade((m) => ({ ...m, ...(kind === 'pdf' ? { pdfUrl: j.pdfUrl || m.pdfUrl, pdfAnonUrl: j.pdfAnonUrl || m.pdfAnonUrl } : { xlsxUrl: j.xlsxUrl || m.xlsxUrl, xlsxAnonUrl: j.xlsxAnonUrl || m.xlsxAnonUrl }) }));
        hit();
        toast({ text: `${name ? `${name}：` : ''}${label}を出力しました`, sub: j.warning || '→ 本名版・イニシャル版（URL はそのまま）' });
        await onMade?.();
      }
    } catch (e) { toast({ text: `${label}を出せませんでした`, sub: (e as Error).message }); }
    finally { setBusy(''); }
  };

  const text = size === 'md' ? 'text-body' : 'text-sm';
  const one = (label: string, url?: string) => (
    <div key={label} className="flex items-center gap-1.5 whitespace-nowrap">
      <span className="min-w-[72px] text-faint">{label}</span>
      {isUrl(url) ? <>
        <a href={url} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()} title="別窓で閲覧" className="underline" style={{ color: 'var(--ad)' }}>閲覧</a>
        <span className="text-faint">/</span>
        <a href={driveDl(url!)} onClick={(e) => e.stopPropagation()} title="ダウンロード" className="underline" style={{ color: 'var(--ad)' }}>DL</a>
      </> : <span className="text-faint">—</span>}
    </div>
  );
  const btn = 'inline-flex min-h-7 items-center gap-1 whitespace-nowrap rounded-lg border border-field bg-surface px-2 text-xs font-semibold disabled:opacity-40';
  return (
    <div className={`flex flex-col gap-0.5 ${text}`}>
      {one('PDF 本名', f.pdfUrl)}
      {one('PDF ｲﾆｼｬﾙ', f.pdfAnonUrl)}
      <div className="h-0.5" />
      {one('XLS 本名', f.xlsxUrl)}
      {one('XLS ｲﾆｼｬﾙ', f.xlsxAnonUrl)}
      {row && (canMake ? (
        <div className="mt-1 flex flex-wrap gap-1">
          <button type="button" disabled={!canEdit || !!busy} title={canEdit ? 'いまのスキシの中身で 本名版・イニシャル版の PDF を作り直す（URL は変わりません）' : needText('edit')} onClick={(e) => { e.stopPropagation(); make('pdf'); }} className={btn}>
            <FileText size={12} />{busy === 'pdf' ? '出力中…' : 'PDF出力'}</button>
          <button type="button" disabled={!canEdit || !!busy} title={canEdit ? 'いまのスキシの中身で 本名版・イニシャル版の Excel(xlsx) を作る（URL は変わりません）' : needText('edit')} onClick={(e) => { e.stopPropagation(); make('xlsx'); }} className={btn}>
            <FileSpreadsheet size={12} />{busy === 'xlsx' ? '出力中…' : 'Excel出力'}</button>
        </div>
      ) : <span className="mt-0.5 text-xs text-faint" title="先にスキシ（スキルシート）を作ると出力できます">出力不可（スキシ未作成）</span>)}
    </div>
  );
}
