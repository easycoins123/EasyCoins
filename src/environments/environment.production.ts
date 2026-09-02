import { RegionCode } from '../app/domain';
import { AppEnvironment } from './environment.model';

/**
 * Production.
 *
 * `apiMode` is 'mock' today because no backend exists yet; the current public
 * build is a functional demonstration and says so in its footer. Flipping this
 * to 'http' is the single switch that puts the real backend behind the app, and
 * it must not be flipped until that backend serves docs/API-CONTRACT.md.
 */
export const environment: AppEnvironment = {
  name: 'production',
  production: true,
  apiBaseUrl: '/api',
  apiVersion: 'v1',
  apiMode: 'http',
  requestTimeoutMs: 15_000,
  paymentsEnabled: true,
  analyticsEnabled: false,
  supportEnabled: true,
  defaultLocale: 'he',
  defaultRegion: RegionCode.Israel,
  debugLogging: false,
};
