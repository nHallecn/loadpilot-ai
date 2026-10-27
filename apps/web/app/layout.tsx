import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'LoadPilot AI',
  description: 'Autonomous Software Performance Investigator',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
