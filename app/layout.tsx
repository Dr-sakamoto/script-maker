import './globals.css';
import type { Metadata, Viewport } from 'next';
import RegisterSW from '../components/RegisterSW';

export const metadata: Metadata = {
  title: '台本制作ツール MVP',
  description: '芸人向けの台本整形・音響・照明挿入を効率化するMVP',
  applicationName: '台本',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [{ url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' }, { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
  appleWebApp: { capable: true, title: '台本', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [{ media: '(prefers-color-scheme: light)', color: '#f6f4ef' }, { media: '(prefers-color-scheme: dark)', color: '#141316' }],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
