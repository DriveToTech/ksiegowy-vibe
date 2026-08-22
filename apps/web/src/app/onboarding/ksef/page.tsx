import { redirect } from 'next/navigation';
import { getCompanyKsefSettings } from '../../../lib/api';
import { requireAuthSession } from '../../../lib/auth';
import { Banner } from '../../../components/molecules/Banner';
import { KsefSettingsForm } from '../../dashboard/settings/KsefSettingsForm';
import { t } from '../../../lib/translations';

export default async function OnboardingKsefPage() {
  const session = await requireAuthSession('/onboarding');
  const companyId = session.activeCompanyId;

  if (!companyId) {
    redirect('/onboarding/company');
  }

  const settings = await getCompanyKsefSettings(companyId).catch(() => null);

  if (!settings) {
    return <Banner tone="error">{t.onboarding.ksef.loadError}</Banner>;
  }

  return <KsefSettingsForm companyId={companyId} settings={settings} redirectTo="/onboarding/team" />;
}
