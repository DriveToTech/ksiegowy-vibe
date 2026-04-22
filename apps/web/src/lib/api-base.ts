// API_URL is a server-side runtime env var for container-to-container calls (e.g. Docker).
// NEXT_PUBLIC_API_URL is baked in at build time for browser requests.
export const API_BASE = process.env.API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
