import type { SVGProps } from 'react';

type IconName =
  | 'overview'
  | 'outgoing'
  | 'incoming'
  | 'contractors'
  | 'settings'
  | 'upload'
  | 'householdHome'
  | 'householdLedger'
  | 'householdBudget'
  | 'householdCommitments'
  | 'householdGoals'
  | 'householdInvesting'
  | 'householdReports'
  | 'householdMore'
  | 'add';

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
    case 'upload':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
          <path d="M12 16V6" />
          <path d="M8.5 9.5 12 6l3.5 3.5" />
          <path d="M5 18.5h14" />
        </svg>
      );
    case 'householdHome':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
          <path d="M4 13.5L12 5l8 8.5" />
          <path d="M6.5 11.5V20h11v-8.5" />
        </svg>
      );
    case 'householdLedger':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
          <path d="M12 4v9" />
          <path d="M8.5 9.5 12 13l3.5-3.5" />
          <path d="M5 18.5h14" />
        </svg>
      );
    case 'householdBudget':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
          <rect x="4" y="6" width="16" height="12" rx="2.5" />
          <path d="M4 10.5h16" />
          <path d="M8 14.2h4" />
        </svg>
      );
    case 'householdCommitments':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
          <path d="M6 4.5h9l3 3V19.5H6Z" />
          <path d="M9 10h6" />
          <path d="M9 13.5h6" />
          <path d="M9 17h3.5" />
        </svg>
      );
    case 'householdGoals':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
          <circle cx="12" cy="12" r="7.5" />
          <circle cx="12" cy="12" r="3" />
          <path d="m16.8 7.2 2-2" />
          <path d="M19 5h-2" />
        </svg>
      );
    case 'householdInvesting':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
          <path d="M4.5 18.5h15" />
          <path d="m5.5 15 4-4 3 2.5 5-6" />
          <path d="M14.5 7.5h3v3" />
        </svg>
      );
    case 'householdReports':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" {...props}>
          <path d="M6 4.5h8l4 4v11H6Z" />
          <path d="M14 4.5v4h4M9 13h6M9 16.5h4" />
        </svg>
      );
    case 'householdMore':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" {...props}>
          <circle cx="5" cy="12" r="1" fill="currentColor" />
          <circle cx="12" cy="12" r="1" fill="currentColor" />
          <circle cx="19" cy="12" r="1" fill="currentColor" />
        </svg>
      );
    case 'add':
      return (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" {...props}>
          <path d="M12 5v14M5 12h14" />
        </svg>
      );
    default:
      return null;
  }
}
