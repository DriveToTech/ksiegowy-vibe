import type { ReactNode } from 'react';
import { DashboardShell } from '../../components/organisms/DashboardShell';
import { requireAuthSession } from '../../lib/auth';

export default async function DashboardLayout({
  children,
}: Readonly<{ children: ReactNode }>) {
  await requireAuthSession('/dashboard');

  return <DashboardShell>{children}</DashboardShell>;
}
