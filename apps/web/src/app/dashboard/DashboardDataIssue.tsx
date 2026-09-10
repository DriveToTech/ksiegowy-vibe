'use client';

import { useRouter } from 'next/navigation';
import { Button } from '../../components/atoms/Button';
import { Banner } from '../../components/molecules/Banner';

export function DashboardDataIssue({ message }: { message: string }) {
  const router = useRouter();

  return (
    <Banner tone="error">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p>{message}</p>
        <Button type="button" variant="secondary" onClick={() => router.refresh()}>
          Spróbuj ponownie
        </Button>
      </div>
    </Banner>
  );
}
