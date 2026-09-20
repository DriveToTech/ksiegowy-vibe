import { redirect } from 'next/navigation';
import { requireAuthSession } from '../../../lib/auth';
import { advisorText as text } from '../../../lib/advisor-translations';
import { PageHeader } from '../../../components/molecules/PageHeader';
import { AdvisorConversation } from '../../../components/advisor/AdvisorConversation';

export default async function AdvisorPage() {
  const session = await requireAuthSession('/dashboard/advisor');
  if (!session.activeCompanyId || !session.activeKsefEnvironment) redirect('/onboarding');
  return <div className="mx-auto max-w-3xl space-y-6">
    <PageHeader title={text.title} description={text.subtitle} />
    <AdvisorConversation key={`${session.activeCompanyId}:${session.activeKsefEnvironment}`} companyId={session.activeCompanyId}
      environment={session.activeKsefEnvironment} active seed={{ question: '', revision: 0 }} />
  </div>;
}
