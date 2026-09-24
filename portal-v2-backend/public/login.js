(() => {
  'use strict';
  const portalOrigin = 'https://petruandines.github.io';
  const state = new URL(location.href).searchParams.get('state');
  const $ = id => document.getElementById(id);
  const views = ['sign-in', 'totp', 'enroll'];
  let pendingToken = null;

  function show(view) {
    for (const id of views) $(id).hidden = id !== view;
    $('error').hidden = true;
  }
  function fail() {
    $('error').textContent = 'Nu am putut finaliza autentificarea. Verifică datele și încearcă din nou.';
    $('error').hidden = false;
  }
  async function post(path, data, token) {
    const response = await fetch('/api/auth/' + path, {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
      body: JSON.stringify(data),
    });
    let body;
    try { body = await response.json(); } catch { throw new Error('Invalid response'); }
    if (!response.ok) throw new Error('Authentication failed');
    return { response, body };
  }
  async function complete(response) {
    const token = response.headers.get('set-auth-token') || pendingToken;
    if (!token) throw new Error('Missing session token');
    const me = await fetch('/api/me', {
      headers: { authorization: 'Bearer ' + token }, credentials: 'omit', cache: 'no-store',
    });
    if (!me.ok) throw new Error('Session verification failed');
    const user = await me.json();
    pendingToken = token;
    if (user.twoFactorRequired) { show('enroll'); return; }
    if (!window.opener || !/^[a-f0-9]{32}$/.test(state || '')) throw new Error('Portal session unavailable');
    window.opener.postMessage({ type: 'petru-ines-auth', state, token, user }, portalOrigin);
    pendingToken = null;
    window.close();
  }

  if (!window.opener || !/^[a-f0-9]{32}$/.test(state || '')) {
    for (const id of views) $(id).hidden = true;
    $('error').textContent = 'Deschide autentificarea din portalul Petru & Inés.';
    $('error').hidden = false;
    return;
  }

  $('password-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button');
    button.disabled = true;
    try {
      const { response, body } = await post('sign-in/email', {
        email: form.elements.email.value.trim(), password: form.elements.password.value,
      });
      form.elements.password.value = '';
      if (body.twoFactorRedirect) { show('totp'); return; }
      await complete(response);
    } catch { form.elements.password.value = ''; fail(); }
    finally { button.disabled = false; }
  });

  $('totp-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button');
    button.disabled = true;
    try {
      const { response } = await post('two-factor/verify-totp', { code: form.elements.code.value, trustDevice: false });
      form.elements.code.value = '';
      await complete(response);
    } catch { form.elements.code.value = ''; fail(); }
    finally { button.disabled = false; }
  });

  $('enroll-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button');
    button.disabled = true;
    try {
      const { body } = await post('two-factor/enable', {
        password: form.elements.password.value, method: 'totp',
      }, pendingToken);
      form.elements.password.value = '';
      if (!body.totpURI || !Array.isArray(body.backupCodes)) throw new Error('Enrollment failed');
      $('totp-uri').textContent = body.totpURI;
      $('backup-codes').textContent = body.backupCodes.join('\n');
      $('enroll-details').hidden = false;
    } catch { form.elements.password.value = ''; fail(); }
    finally { button.disabled = false; }
  });

  $('enroll-verify-form').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = form.querySelector('button');
    button.disabled = true;
    try {
      const { response } = await post('two-factor/verify-totp', {
        code: form.elements.code.value, trustDevice: false,
      }, pendingToken);
      form.elements.code.value = '';
      await complete(response);
    } catch { form.elements.code.value = ''; fail(); }
    finally { button.disabled = false; }
  });
})();
