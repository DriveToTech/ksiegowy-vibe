import type { DesktopApi } from './desktop-api';

declare global {
  interface Window {
    desktop: DesktopApi;
  }
}

export {};
