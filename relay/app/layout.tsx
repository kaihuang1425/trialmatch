import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import '@fontsource-variable/bricolage-grotesque/opsz.css';
import '@fontsource-variable/dm-sans/opsz.css';
import '@fontsource-variable/jetbrains-mono/index.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'Relay',
  description: 'Trial prescreening with cited evidence. Synthetic data only.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#F3F2EE',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en-GB">
      <body>{children}</body>
    </html>
  );
}
