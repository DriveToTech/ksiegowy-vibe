'use client';

import { useEffect, useId, useRef, type ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface NativeDialogProps {
  open: boolean;
  title: string;
  description?: string;
  id?: string;
  className?: string;
  bottomSheet?: boolean;
  children: ReactNode;
  onClose: () => void;
}

export function NativeDialog({
  open,
  title,
  description,
  id,
  className,
  bottomSheet = false,
  children,
  onClose,
}: NativeDialogProps) {
  const dialogReference = useRef<HTMLDialogElement>(null);
  const previouslyFocusedElement = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogReference.current;
    if (!dialog) return;

    if (open) {
      if (!dialog.open) {
        previouslyFocusedElement.current = document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
        dialog.showModal();
      }

      const cancelControl = dialog.querySelector<HTMLElement>('[data-dialog-cancel]');
      const firstControl = cancelControl ?? dialog.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
      );
      (firstControl ?? dialog).focus();

      const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key !== 'Tab') return;

        const focusableElements = Array.from(dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
        ));
        if (focusableElements.length === 0) {
          event.preventDefault();
          dialog.focus();
          return;
        }

        const firstFocusableElement = focusableElements[0];
        const lastFocusableElement = focusableElements[focusableElements.length - 1];
        if (event.shiftKey && document.activeElement === firstFocusableElement) {
          event.preventDefault();
          lastFocusableElement.focus();
        } else if (!event.shiftKey && document.activeElement === lastFocusableElement) {
          event.preventDefault();
          firstFocusableElement.focus();
        }
      };

      dialog.addEventListener('keydown', handleKeyDown);
      return () => dialog.removeEventListener('keydown', handleKeyDown);
    }

    if (dialog.open) dialog.close();
    const previouslyFocused = previouslyFocusedElement.current;
    previouslyFocusedElement.current = null;
    if (previouslyFocused?.isConnected) previouslyFocused.focus();
  }, [open]);

  useEffect(() => () => {
    const dialog = dialogReference.current;
    if (dialog?.open) dialog.close();

    const previouslyFocused = previouslyFocusedElement.current;
    previouslyFocusedElement.current = null;
    if (previouslyFocused?.isConnected) previouslyFocused.focus();
  }, []);

  return (
    <dialog
      ref={dialogReference}
      id={id}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      aria-modal="true"
      tabIndex={-1}
      className={cn(
        'm-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-card border border-outline-strong bg-surface-panel p-0 text-foreground',
        '[&::backdrop]:bg-[rgba(8,10,20,0.72)]',
        className,
      )}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
        <div className={cn(
          'space-y-5 p-5 sm:p-6',
          bottomSheet && 'pb-[calc(1.25rem+env(safe-area-inset-bottom))] sm:pb-[calc(1.5rem+env(safe-area-inset-bottom))]',
        )}>
        <div className="space-y-1">
          <h2 id={titleId} className="text-xl font-semibold tracking-tight text-foreground">{title}</h2>
          {description ? <p id={descriptionId} className="text-sm text-muted">{description}</p> : null}
        </div>
        {children}
      </div>
    </dialog>
  );
}
