import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { ColorProvider } from '@/components/ColorProvider';
import { ThemeProvider } from '@/components/ThemeProvider';
import { DEFAULT_THEME, THEME_STORAGE_KEY } from '@/lib/theme';
import { APP_NAME } from '@/lib/app';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = { title: APP_NAME, robots: { index: false } };
// 携帯は携帯の幅で描く（10-27 shoya「携帯表示も対応して」。10-23 の「幅 1280 で縮めて見せる」はやめた）。
//   幅 768 未満：左メニューは上のバーの ≡ から引き出す（components/Shell.tsx）・余白と表は globals.css の「携帯」
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={inter.variable} data-theme={DEFAULT_THEME} suppressHydrationWarning>
      <head>
        {/* 覚えている着せ替えを最初の描画の前に入れる（ちらつき防止） */}
        <script dangerouslySetInnerHTML={{ __html: `try{var t=localStorage.getItem('${THEME_STORAGE_KEY}');if(t)document.documentElement.dataset.theme=t}catch(e){}` }} />
      </head>
      <body>
        <ThemeProvider><ColorProvider>{children}</ColorProvider></ThemeProvider>
      </body>
    </html>
  );
}
