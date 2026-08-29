import { Surface } from '../../../../components/atoms/Surface';

export default function HouseholdGoalsLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Wczytywanie oszczędności i celów">
      <div className="space-y-2">
        <div className="h-3 w-32 rounded bg-surface-raised" />
        <div className="h-8 w-64 rounded bg-surface-raised" />
      </div>
      <Surface className="h-40"><span className="sr-only">Wczytywanie</span></Surface>
      <div className="grid gap-4 xl:grid-cols-2">
        <Surface className="h-64"><span className="sr-only">Wczytywanie</span></Surface>
        <Surface className="h-64"><span className="sr-only">Wczytywanie</span></Surface>
      </div>
    </div>
  );
}
