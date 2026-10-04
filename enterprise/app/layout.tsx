import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = { title: 'Custodia | Every record. Every decision. Accountable.', description: 'A controlled workspace for institutional records operations. Tenant isolation, human approval, and verifiable decision history.' };
export default function Layout({ children }: Readonly<{children: React.ReactNode}>) { return <html lang="en"><body>{children}</body></html>; }
