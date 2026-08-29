import { t as baseTranslations } from './translations';

/** Phase 3 copy lives beside the Goals-era household copy until the catalogue is reorganized. */
export const t = {
  ...baseTranslations,
  household: {
    ...baseTranslations.household,
    investing: baseTranslations.household.goals.investing,
    reports: baseTranslations.household.goals.reports,
  },
} as const;
