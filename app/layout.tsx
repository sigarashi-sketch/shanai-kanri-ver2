import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ColorProvider } from '@/components/ColorProvider';
import { APP_NAME } from '@/lib/app';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

export const metadata: Metadata = { title: `${APP_NAME}（本番前）`, robots: { index: false } };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={inter.variable}>
      <body>
        <ColorProvider>{children}</ColorProvider>
      </body>
    </html>
  );
}
