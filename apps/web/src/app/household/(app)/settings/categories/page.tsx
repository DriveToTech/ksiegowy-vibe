import { getHouseholdCategories } from '../../../../../lib/api';
import { requireAuthSession } from '../../../../../lib/auth';
import { t } from '../../../../../lib/translations';
import { EmptyState } from '../../../../../components/molecules/EmptyState';
import { PageHeader } from '../../../../../components/molecules/PageHeader';

export default async function HouseholdCategoriesSettingsPage() {
  const session = await requireAuthSession('/household/settings/categories');
  const householdId = session.activeHouseholdId as string;

  const categories = await getHouseholdCategories(householdId).catch(() => []);
  const topLevel = categories.filter((category) => !category.parentCategoryId);

  return (
    <div className="space-y-6">
      <PageHeader eyebrow={t.household.dashboard.pageEyebrow} title={t.household.settings.categoriesPageTitle} />

      {categories.length === 0 ? (
        <EmptyState title={t.household.ledger.emptyTitle} description={t.household.dashboard.envelopesEmptyDescription} />
      ) : (
        <div className="overflow-hidden rounded-card border border-outline bg-surface-panel">
          {topLevel.map((category, index) => {
            const children = categories.filter((item) => item.parentCategoryId === category.id);
            return (
              <div key={category.id} className={index > 0 ? 'border-t border-outline px-5 py-4' : 'px-5 py-4'}>
                <p className="font-medium text-foreground">{category.name}</p>
                {children.length > 0 ? (
                  <p className="mt-1 text-sm text-muted">{children.map((child) => child.name).join(', ')}</p>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
