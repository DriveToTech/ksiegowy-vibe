import { describe, expect, it } from 'vitest';
import { loadAuthConfig } from './auth-config.js';

describe('loadAuthConfig', () => {
  it('fails clearly when JWT secrets are missing', () => {
    expect(() => loadAuthConfig({})).toThrow('Environment variable JWT_SECRET is required for auth');
  });

  it('disables Google OAuth when only part of the config is present', () => {
    const config = loadAuthConfig({
      NODE_ENV: 'test',
      JWT_SECRET: 'test-access-secret',
      JWT_REFRESH_SECRET: 'test-refresh-secret',
      GOOGLE_CLIENT_ID: 'client-id-only'
    });

    expect(config.google.enabled).toBe(false);
    expect(config.google.providedEnv).toEqual(['GOOGLE_CLIENT_ID']);
    expect(config.google.missingEnv).toEqual(['GOOGLE_CLIENT_SECRET', 'GOOGLE_REDIRECT_URI']);
    expect(config.desktop).toEqual({});
  });

  it('parses desktop auth callback url when provided', () => {
    const config = loadAuthConfig({
      NODE_ENV: 'test',
      JWT_SECRET: 'test-access-secret',
      JWT_REFRESH_SECRET: 'test-refresh-secret',
      DESKTOP_AUTH_CALLBACK_URL: 'ksiegowy-vibe://auth/desktop/callback'
    });

    expect(config.desktop).toEqual({
      authCallbackUrl: 'ksiegowy-vibe://auth/desktop/callback'
    });
  });
});
