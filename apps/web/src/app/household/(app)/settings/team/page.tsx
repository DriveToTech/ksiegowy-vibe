import { getHouseholdMembers } from '../../../../../lib/api';
import { requireAuthSession } from '../../../../../lib/auth';
import { t } from '../../../../../lib/translations';
import { Badge } from '../../../../../components/atoms/Badge';
import { PageHeader } from '../../../../../components/molecules/PageHeader';

export default async function HouseholdTeamSettingsPage() {
  const session = await requireAuthSession('/household/settings/team');
  const householdId = session.activeHouseholdId as string;

  const members = await getHouseholdMembers(householdId).catch(() => []);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t.household.dashboard.pageEyebrow} title={t.household.settings.teamPageTitle} />

      <div className="overflow-hidden rounded-card border border-outline bg-surface-panel">
        {members.map((member, index) => (
          <div key={member.userId} className={index > 0 ? 'flex items-center justify-between border-t border-outline px-5 py-4' : 'flex items-center justify-between px-5 py-4'}>
            <div>
              <p className="font-medium text-foreground">{member.displayName ?? member.userEmail}</p>
              <p className="text-sm text-muted">{member.userEmail}</p>
            </div>
            <Badge tone={member.role === 'OWNER' ? 'primary' : 'draft'}>{member.role}</Badge>
          </div>
        ))}
      </div>
    </div>
  );
}
