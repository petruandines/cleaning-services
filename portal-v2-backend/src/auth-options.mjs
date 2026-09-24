import { admin, bearer, twoFactor } from 'better-auth/plugins';
import { ORIGIN } from './api.mjs';

export function authOptions({ database, secret, baseURL }) {
  return {
    database, secret, baseURL,
    trustedOrigins: [ORIGIN],
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 12 },
    session: { expiresIn: 60 * 60 * 8 },
    rateLimit: { enabled: true, storage: 'database', window: 60, max: 20 },
    plugins: [admin(), bearer(), twoFactor({ issuer: 'Petru & Inés' })],
  };
}
