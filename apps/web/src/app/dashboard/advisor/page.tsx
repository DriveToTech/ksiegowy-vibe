import { redirect } from 'next/navigation';
import { requireAuthSession } from '../../../lib/auth';
import { AdvisorPageWorkspace } from '../../../components/advisor/AdvisorPageWorkspace';

export default async function AdvisorPage() {
  const session = await requireAuthSession('/dashboard/advisor');
  if (!session.activeCompanyId || !session.activeKsefEnvironment) redirect('/onboarding');
  return <AdvisorPageWorkspace key={`${session.activeCompanyId}:${session.activeKsefEnvironment}`} companyId={session.activeCompanyId} environment={session.activeKsefEnvironment} />;
}
