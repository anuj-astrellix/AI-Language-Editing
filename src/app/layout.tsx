import type { Metadata } from 'next';
import Link from 'next/link';

import '@/app/globals.css';

export const metadata: Metadata = {
  title: 'AI Scientific & Technical Language Editor',
  description:
    'Production-grade AI language editing platform for scientific and technical manuscripts with live track changes, review controls, and publication-ready exports.'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="app-header">
          <div className="container nav-row">
            <Link href="/dashboard" className="logo">
              AI Language Editor
            </Link>
            <nav className="nav-links">
              <Link href="/dashboard">Dashboard</Link>
              <Link href="/upload">Upload</Link>
              <Link href="/specification">Specification</Link>
              <Link href="/history">History</Link>
            </nav>
          </div>
        </header>
        <main className="container main-content">{children}</main>
      </body>
    </html>
  );
}
