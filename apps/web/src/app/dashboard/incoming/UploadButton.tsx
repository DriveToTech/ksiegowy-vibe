'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { API_BASE } from '../../../lib/api-base';
import { KSEF_ENVIRONMENT_HEADER_NAME, type KsefEnvironment } from '../../../lib/ksef-environment';
import { Button } from '../../../components/atoms/Button';
import { t } from '../../../lib/translations';

export function UploadButton({ companyId, activeEnvironment }: { companyId: string; activeEnvironment: KsefEnvironment }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const uploadFile = async (file: File) => {
    if (!file) return;

    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE}/companies/${companyId}/incoming`, {
      method: 'POST',
      credentials: 'include',
      headers: { [KSEF_ENVIRONMENT_HEADER_NAME]: activeEnvironment },
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
    <>
      <Button
        type="button"
        variant="secondary"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
        aria-describedby="incoming-upload-help"
      >
        {uploading ? t.incoming.uploading : t.incoming.uploadButton}
      </Button>
      <p id="incoming-upload-help" className="sr-only">
        {t.incoming.uploadCard.helpText}
      </p>

      <input
        ref={inputRef}
        type="file"
        accept=".pdf,.jpg,.jpeg,.png,.webp,.tiff"
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => { void handleChange(e); }}
      />
      {error ? <p className="basis-full text-sm text-error-ink" role="alert">{error}</p> : null}
    </>
  );
}
