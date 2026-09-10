import type { SVGProps } from 'react';

type IconName = 'overview' | 'outgoing' | 'incoming' | 'contractors' | 'compliance' | 'settings' | 'more' | 'upload' | 'assistant';

interface AppIconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
}

export function AppIcon({ name, ...props }: AppIconProps) {
  switch (name) {
    case 'overview':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
          <path d="M4 13.5L12 5l8 8.5" />
          <path d="M6.5 11.5V20h11v-8.5" />
        </svg>
      );
    case 'outgoing':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
          <path d="M8 7h8" />
          <path d="M8 11h8" />
          <path d="M8 15h5" />
          <path d="M6 3.5h12A1.5 1.5 0 0 1 19.5 5v14A1.5 1.5 0 0 1 18 20.5H6A1.5 1.5 0 0 1 4.5 19V5A1.5 1.5 0 0 1 6 3.5Z" />
        </svg>
      );
    case 'incoming':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
          <path d="M12 4v10" />
          <path d="M8.5 10.5 12 14l3.5-3.5" />
          <path d="M5 18.5h14" />
        </svg>
      );
    case 'contractors':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
          <path d="M15.5 19.5v-1.2a3.3 3.3 0 0 0-3.3-3.3H7.8a3.3 3.3 0 0 0-3.3 3.3v1.2" />
          <circle cx="10" cy="8" r="3" />
          <path d="M18.5 10.5a2.5 2.5 0 1 0-1.4-4.6" />
          <path d="M19.5 19.5v-1a2.8 2.8 0 0 0-2.8-2.8h-.2" />
        </svg>
      );
    case 'settings':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
          <circle cx="12" cy="12" r="3.2" />
          <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a1.8 1.8 0 0 1-2.5 2.5l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9v.2a1.8 1.8 0 0 1-3.6 0v-.2a1 1 0 0 0-.7-.9 1 1 0 0 0-1.1.2l-.1.1a1.8 1.8 0 1 1-2.5-2.5l.1-.1A1 1 0 0 0 6 15a1 1 0 0 0-.9-.6h-.2a1.8 1.8 0 0 1 0-3.6h.2A1 1 0 0 0 6 9.9a1 1 0 0 0-.2-1.1l-.1-.1a1.8 1.8 0 1 1 2.5-2.5l.1.1a1 1 0 0 0 1.1.2h.1a1 1 0 0 0 .6-.9v-.2a1.8 1.8 0 0 1 3.6 0v.2a1 1 0 0 0 .6.9h.1a1 1 0 0 0 1.1-.2l.1-.1a1.8 1.8 0 0 1 2.5 2.5l-.1.1a1 1 0 0 0-.2 1.1v.1a1 1 0 0 0 .9.6h.2a1.8 1.8 0 0 1 0 3.6h-.2a1 1 0 0 0-.9.6Z" />
        </svg>
      );
    case 'compliance':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
          <path d="M5 4.5h14v15H5z" />
          <path d="M8.5 8h7" />
          <path d="M8.5 12h7" />
          <path d="M8.5 16h4" />
        </svg>
      );
    case 'more':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
          <circle cx="5" cy="12" r="1" />
          <circle cx="12" cy="12" r="1" />
          <circle cx="19" cy="12" r="1" />
        </svg>
      );
    case 'assistant':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
          <path d="m12 3 1.4 5.6L19 10l-5.6 1.4L12 17l-1.4-5.6L5 10l5.6-1.4L12 3Z" />
          <path d="m19 16 .6 2.4L22 19l-2.4.6L19 22l-.6-2.4L16 19l2.4-.6L19 16Z" />
        </svg>
      );
    case 'upload':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
          <path d="M12 16V6" />
          <path d="M8.5 9.5 12 6l3.5 3.5" />
          <path d="M5 18.5h14" />
        </svg>
      );
    default:
      return null;
  }
}
