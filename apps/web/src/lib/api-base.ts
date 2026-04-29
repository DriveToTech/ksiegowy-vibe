const defaultApiBase = 'http://localhost:3001';

// API_URL stays the server-side runtime base for Next server components and route handlers.
export const SERVER_API_BASE = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? defaultApiBase;

// NEXT_PUBLIC_BROWSER_API_URL controls browser-side business API requests.
export const BROWSER_API_BASE =
  process.env.NEXT_PUBLIC_BROWSER_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? defaultApiBase;

// NEXT_PUBLIC_BROWSER_AUTH_URL controls browser-visible auth entrypoints.
export const BROWSER_AUTH_BASE =
  process.env.NEXT_PUBLIC_BROWSER_AUTH_URL ?? process.env.NEXT_PUBLIC_API_URL ?? defaultApiBase;

export const API_BASE = typeof window === 'undefined' ? SERVER_API_BASE : BROWSER_API_BASE;
