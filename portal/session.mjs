// Session data is scoped to this browser tab and never placed in the URL.
const KEY = 'petru-ines-portal-v2-session';
const MAX_AGE_MS = 8 * 60 * 60 * 1000;

export function forgetTabSession(browser) {
  try { browser.sessionStorage.removeItem(KEY); } catch { /* Storage may be disabled. */ }
}

export function rememberTabSession(browser, token, now = Date.now()) {
  if (typeof token !== 'string' || !token || token.length > 2048) return false;
  try {
    browser.sessionStorage.setItem(KEY, JSON.stringify({ token, expiresAt: now + MAX_AGE_MS }));
    return true;
  } catch { return false; }
}

export function readTabSession(browser, now = Date.now()) {
  try {
    const value = browser.sessionStorage.getItem(KEY);
    if (!value) return null;
    const saved = JSON.parse(value);
    if (!saved || typeof saved.token !== 'string' || !saved.token || saved.token.length > 2048 ||
        !Number.isSafeInteger(saved.expiresAt) || saved.expiresAt <= now ||
        saved.expiresAt > now + MAX_AGE_MS) {
      forgetTabSession(browser);
      return null;
    }
    return saved.token;
  } catch { forgetTabSession(browser); return null; }
}
