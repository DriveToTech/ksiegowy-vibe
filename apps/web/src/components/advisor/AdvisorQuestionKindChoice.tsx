import { advisorText as text } from '../../lib/advisor-translations';

export function AdvisorQuestionKindChoice({ value, taxUnavailable, disabled, onChange }: {
  value: 'records' | 'tax'; taxUnavailable: boolean; disabled: boolean; onChange: (questionKind: 'records' | 'tax') => void;
}) {
  return <div>
    <label className="block text-sm">{text.questionKind}
      <select className="mt-1 min-h-11 w-full rounded-control border border-outline-control bg-surface-panel px-3" value={value} disabled={disabled}
        aria-describedby={taxUnavailable ? 'advisor-tax-unavailable' : undefined} onChange={(event) => onChange(event.target.value as 'records' | 'tax')}>
        <option value="records">{text.records}</option>
        <option value="tax" disabled={taxUnavailable}>{text.tax}</option>
      </select>
    </label>
    {taxUnavailable && <p id="advisor-tax-unavailable" className="mt-1 text-xs text-muted">{text.taxUnavailableForPeriod}</p>}
  </div>;
}
