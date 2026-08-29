import Link from 'next/link';
import { t } from '../../../../lib/translations';
import { AppIcon } from '../../../../components/icons/AppIcon';
import { PageHeader } from '../../../../components/molecules/PageHeader';
import { Surface } from '../../../../components/atoms/Surface';

const moreLinks = [
  { href: '/household/envelopes', label: t.household.goals.more.budget, icon: 'householdBudget' as const },
  { href: '/household/commitments', label: t.household.goals.more.commitments, icon: 'householdCommitments' as const },
  { href: '/household/settings/accounts', label: t.household.goals.more.accounts, icon: 'settings' as const },
  { href: '/household/settings/categories', label: t.household.goals.more.categories, icon: 'householdBudget' as const },
  { href: '/household/settings/team', label: t.household.goals.more.team, icon: 'householdHome' as const },
];

export default function HouseholdMorePage() {
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t.householdNav.more} title={t.household.goals.more.pageTitle} description={t.household.goals.more.pageDescription} />
      <Surface className="grid gap-3 p-4 sm:grid-cols-2 sm:p-5">
        {moreLinks.map((item) => (
          <Link key={item.href} href={item.href} className="flex min-h-14 items-center gap-3 rounded-control border border-outline bg-surface-raised px-4 py-3 text-sm font-semibold text-foreground transition hover:border-primary hover:text-primary-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary">
            <AppIcon name={item.icon} className="h-5 w-5 shrink-0 text-primary" />
            <span>{item.label}</span>
            <span className="ml-auto text-muted" aria-hidden="true">→</span>
          </Link>
        ))}
      </Surface>
    </div>
  );
}
