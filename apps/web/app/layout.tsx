import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'LoadPilot AI',
  icons: { icon: '/loadpilot-logo.svg', shortcut: '/loadpilot-logo.svg' },
  description: 'Plan bounded performance experiments, measure real latency and diagnose with Meta Muse Spark AI.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
