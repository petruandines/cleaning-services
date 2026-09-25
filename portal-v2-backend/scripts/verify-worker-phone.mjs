/** Read-only public verification; safe to run after a first deployment. */
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const URL = 'https://petru-ines-portal-api.petruandines.workers.dev';

export async function verifyPublicWorker({ request = fetch, wait = ms => new Promise(resolve => setTimeout(resolve, ms)), attempts = 24 } = {}) {
  let result = 'No response';
  for (let i = 0; i < attempts; i++) {
    try {
      // Static assets canonicalize /login.html to /login. Follow that normal redirect.
      const [login, anonymous] = await Promise.all([
        request(`${URL}/login`, { cache: 'no-store' }),
        request(`${URL}/api/me`, { cache: 'no-store' }),
      ]);
      const html = login.status === 200 ? await login.text() : '';
      const body = anonymous.status === 401 ? await anonymous.json() : null;
      if (login.status === 200 && html.includes('Autentificare · Petru & Inés') &&
          anonymous.status === 401 && body?.error === 'unauthorized') {
        return { login: 200, anonymous: 401 };
      }
      result = `login HTTP ${login.status}, anonymous API HTTP ${anonymous.status}`;
    } catch {
      result = 'Worker route unavailable';
    }
    if (i + 1 < attempts) await wait(5000);
  }
  throw new Error(`Worker public verification failed after ${attempts} checks: ${result}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    await verifyPublicWorker();
    process.stdout.write('Worker verified: Petru & Inés login HTTP 200; anonymous API HTTP 401. No data changed.\n');
  } catch (error) {
    process.stderr.write(`${error.message}. No data changed.\n`);
    process.exitCode = 1;
  }
}
