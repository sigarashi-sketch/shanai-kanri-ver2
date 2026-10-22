import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ColorProvider } from '@/components/ColorProvider';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = { title: '社内管理 ver2（本番前）', robots: { index: false } };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={inter.variable}>
      <body>
        <ColorProvider>{children}</ColorProvider>
      </body>
    </html>
  );
}
