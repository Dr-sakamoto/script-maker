import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '台本制作ツール MVP',
  description: '芸人向けの台本整形・音響・照明挿入を効率化するMVP',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
