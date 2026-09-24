(() => {
  'use strict';
  const portalOrigin = 'https://petruandines.github.io';
  const state = new URL(location.href).searchParams.get('state');
  const $ = id => document.getElementById(id);
  let token = null;
  let clientId = null;
  const valid = /^[a-f0-9]{32}$/.test(state || '') && !!window.opener;
  function message(text) { $('error').textContent = text; $('error').hidden = false; }
  if (!valid) { message('Deschide această fereastră din portalul Petru & Inés.'); return; }
  window.addEventListener('message', event => {
    const data = event.data;
    if (event.origin !== portalOrigin || event.source !== window.opener ||
      data?.type !== 'portal-account-start' || data.state !== state ||
      typeof data.token !== 'string' || !data.token ||
      typeof data.clientId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(data.clientId)) return;
    token = data.token;
    clientId = data.clientId;
    $('client-name').textContent = data.clientLabel || 'Client selectat';
    $('loading').hidden = true;
    $('ready').hidden = false;
    $('error').hidden = true;
  });
  window.opener.postMessage({ type: 'portal-account-ready', state }, portalOrigin);

  $('generate').addEventListener('click', () => {
    const random = new Uint8Array(24);
    crypto.getRandomValues(random);
    $('account-form').elements.password.value = btoa(String.fromCharCode(...random))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    $('account-form').elements.saved.checked = false;
  });
  $('copy').addEventListener('click', async () => {
    const password = $('account-form').elements.password.value;
    if (!password) return message('Generează sau introdu mai întâi o parolă.');
    try { await navigator.clipboard.writeText(password); $('error').hidden = true; }
    catch { message('Nu am putut copia automat. Selectează parola și copiaz-o manual.'); }
  });
  $('close').addEventListener('click', () => window.close());
  $('account-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (!token || !clientId) return;
    const form = event.currentTarget;
    const submit = form.querySelector('button[type=submit]');
    submit.disabled = true;
    try {
      const response = await fetch('/api/users', {
        method: 'POST', credentials: 'omit', cache: 'no-store',
        headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, name: form.elements.name.value.trim(),
          email: form.elements.email.value.trim(), password: form.elements.password.value }),
      });
      if (!response.ok) {
        if (response.status === 409) throw new Error('Adresa este deja folosită. Verifică datele contului.');
        throw new Error('Nu am putut crea contul. Verifică datele și încearcă din nou.');
      }
      form.reset();
      token = null;
      $('ready').hidden = true;
      $('done').hidden = false;
      $('error').hidden = true;
      window.opener.postMessage({ type: 'portal-account-created', state }, portalOrigin);
    } catch (error) { message(error.message); }
    finally { submit.disabled = false; }
  });
})();
