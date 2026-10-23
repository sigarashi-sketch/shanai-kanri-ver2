import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ColorProvider } from '@/components/ColorProvider';
import { ThemeProvider } from '@/components/ThemeProvider';
import { DEFAULT_THEME, THEME_STORAGE_KEY } from '@/lib/theme';
import { APP_NAME } from '@/lib/app';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = { title: `${APP_NAME}（本番前）`, robots: { index: false } };

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
