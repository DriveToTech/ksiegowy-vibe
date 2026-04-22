'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { API_BASE } from '../../../lib/api-base';
import { cn } from '../../../lib/cn';
import { Button } from '../../../components/atoms/Button';
import { Surface } from '../../../components/atoms/Surface';
import { AppIcon } from '../../../components/icons/AppIcon';
import { t } from '../../../lib/translations';

export function UploadButton({ companyId }: { companyId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);

  const uploadFile = async (file: File) => {
    if (!file) return;

    setUploading(true);
    setError(null);
    setIsDragActive(false);

    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE}/companies/${companyId}/incoming`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    }).catch((err: unknown) => {
      setError(err instanceof Error ? err.message : t.errors.uploadFailed(0, ''));
      setUploading(false);
      return null;
    });

    if (!response) return;

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      setError(t.errors.uploadFailed(response.status, text));
      setUploading(false);
      return;
    }

    const data = await response.json() as { id: string };
    setUploading(false);
    router.push(`/dashboard/incoming/${data.id}`);
  };

  const handleChange = async (htmlInputElement: React.ChangeEvent<HTMLInputElement>) => {
    const file = htmlInputElement.currentTarget.files?.[0];
    if (!file) return;

    await uploadFile(file);
    htmlInputElement.currentTarget.value = '';
  };

  return (
    <Surface
      tone="glass"
      shape="organic"
      role="region"
      aria-label="Obszar przesyłania faktury przychodzącej"
      className={cn(
        'space-y-4 p-5 sm:p-6 transition',
        isDragActive ? 'border-primary/50 bg-primary-soft/40' : '',
      )}
      onDragOver={(event) => {
        event.preventDefault();
        setIsDragActive(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        setIsDragActive(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        const file = event.dataTransfer.files?.[0];
        if (file) {
          void uploadFile(file);
        }
      }}
    >
      <div className="space-y-2">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted">{t.incoming.uploadCard.eyebrow}</p>
        <h2 className="font-display text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
          {t.incoming.uploadCard.title}
        </h2>
        <p className="max-w-2xl text-sm text-muted">{t.incoming.uploadCard.description}</p>
      </div>

      <div
        className={cn(
          'relative overflow-hidden rounded-[2.5rem_1.5rem_2.75rem_1.5rem] px-5 py-7 text-center transition sm:px-6 sm:py-8',
          isDragActive
            ? 'bg-gradient-to-br from-primary-soft/80 via-surface-raised/65 to-surface-panel/70 shadow-[var(--shadow-aura)]'
            : 'bg-gradient-to-br from-surface-raised/70 via-surface-panel/55 to-surface-muted/75',
        )}
      >
        <div className="pointer-events-none absolute inset-x-10 top-0 h-28 rounded-full bg-primary/10 blur-3xl" />
        <div className="mx-auto max-w-xl space-y-3">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-surface-raised/65 text-primary backdrop-blur-xl">
            <AppIcon name="upload" className="h-6 w-6" />
          </div>
          <p className="font-display text-lg font-semibold tracking-tight text-foreground sm:text-xl">
            {uploading ? t.incoming.uploading : t.incoming.uploadCard.dropzoneTitle}
          </p>
          <p className="text-sm text-muted">{t.incoming.uploadCard.formats}</p>
          <div className="flex justify-center">
            <Button
              type="button"
              disabled={uploading}
              onClick={() => inputRef.current?.click()}
              aria-describedby="incoming-upload-help"
            >
              {uploading ? t.incoming.uploading : t.incoming.uploadButton}
            </Button>
          </div>
        </div>
      </div>

      <p id="incoming-upload-help" className="sr-only">
        {t.incoming.uploadCard.helpText}
      </p>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp,.tiff"
        className="hidden"
        onChange={(e) => { void handleChange(e); }}
      />
      {error ? <p className="text-sm text-error-ink" role="alert">{error}</p> : null}
    </Surface>
  );
}
