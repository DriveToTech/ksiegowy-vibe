'use client';

import { useState } from 'react';
import { Button } from '../atoms/Button';

export function SessionActions() {
  const [busy, setBusy] = useState(false);

  return (
    <form
      action="/api/session/logout"
      method="post"
      onSubmit={() => setBusy(true)}
    >
      <Button type="submit" variant="ghost" size="sm" className="min-h-11 min-w-11 lg:min-h-9 lg:min-w-0" disabled={busy}>
        {busy ? 'Wylogowywanie…' : 'Wyloguj'}
      </Button>
    </form>
  );
}
