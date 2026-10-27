import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { ColorProvider } from '@/components/ColorProvider';
import { ThemeProvider } from '@/components/ThemeProvider';
import { DEFAULT_THEME, THEME_STORAGE_KEY } from '@/lib/theme';
import { APP_NAME } from '@/lib/app';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = { title: APP_NAME, robots: { index: false } };
// 携帯で開いても PC と同じ表示にする（10-23 shoya「iPhone から見るから PC と同じ表示」）。幅 1280 の画面として描いて縮めて見せる。
//   携帯向けの並びを作るときはここを 'device-width' に戻す
export const viewport: Viewport = { width: 1280, initialScale: undefined };

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
