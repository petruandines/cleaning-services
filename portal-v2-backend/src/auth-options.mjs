import { admin, bearer, twoFactor } from 'better-auth/plugins';
import { PORTAL_ORIGINS } from './origins.mjs';

export function authOptions({ database, secret, baseURL }) {
  return {
    database, secret, baseURL,
    trustedOrigins: [...PORTAL_ORIGINS],
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 12 },
    session: { expiresIn: 60 * 60 * 8 },
    advanced: { ipAddress: { ipAddressHeaders: ['cf-connecting-ip'] } },
    rateLimit: { enabled: true, storage: 'database', window: 60, max: 20 },
    plugins: [admin(), bearer(), twoFactor({ issuer: 'Petru & Inés' })],
  };
}
