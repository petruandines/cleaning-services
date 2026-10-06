(() => {
  'use strict';
  const portalOrigin = new URL(location.href).searchParams.get('portal_origin') || 'https://petruandines.github.io';
  const validPortalOrigin = ['https://petruandines.github.io', 'https://petruandines.com',
    'https://www.petruandines.com', 'https://petruandines-site.pages.dev'].includes(portalOrigin);
  const state = new URL(location.href).searchParams.get('state');
  const $ = id => document.getElementById(id);
  let token = null;
  let clientId = null;
  let accountId = null;
  const valid = validPortalOrigin && /^[a-f0-9]{32}$/.test(state || '') && !!window.opener;
  function message(text) { $('error').textContent = text; $('error').hidden = false; }
  if (!valid) { message('Deschide această fereastră din portalul Petru & Inés.'); return; }
  function passwordControls() {
    const form = $('account-form');
    const reset = !accountId || form.elements.resetPassword.checked;
    $('password-controls').hidden = !reset;
    form.elements.password.required = reset;
    form.elements.saved.required = reset;
    if (!reset) { form.elements.password.value = ''; form.elements.saved.checked = false; }
    $('account-hint').textContent = accountId ?
      (reset ? 'Clientul va alege o parolă nouă la următoarea intrare. Sesiunile existente vor fi închise.' :
        'Modificarea contului va închide sesiunile acestui utilizator. Parola rămâne aceeași.') :
      'Clientul va schimba parola la prima intrare. Parola nu va mai fi afișată după crearea contului.';
  }
  window.addEventListener('message', event => {
    const data = event.data;
    if (event.origin !== portalOrigin || event.source !== window.opener ||
      data?.type !== 'portal-account-start' || data.state !== state ||
      typeof data.token !== 'string' || !data.token ||
      typeof data.clientId !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(data.clientId)) return;
    if (token) return;
    if (data.account != null && (typeof data.account.id !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(data.account.id) || typeof data.account.name !== 'string' ||
      typeof data.account.email !== 'string')) return;
    token = data.token;
    clientId = data.clientId;
    accountId = data.account?.id || null;
    const form = $('account-form');
    if (accountId) {
      form.elements.name.value = data.account.name;
      form.elements.email.value = data.account.email;
      form.elements.resetPassword.checked = data.account.resetPassword === true;
      $('account-title').textContent = 'Editează contul clientului';
      $('submit-account').textContent = 'Salvează modificările';
      $('reset-toggle').hidden = false;
    }
    passwordControls();
    $('client-name').textContent = data.clientLabel || 'Client selectat';
    $('loading').hidden = true;
    $('ready').hidden = false;
    $('error').hidden = true;
  });
  window.opener.postMessage({ type: 'portal-account-ready', state }, portalOrigin);
  $('account-form').elements.resetPassword.addEventListener('change', passwordControls);

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
      const reset = !accountId || form.elements.resetPassword.checked;
      const payload = { client_id: clientId, name: form.elements.name.value.trim(),
        email: form.elements.email.value.trim(), ...(reset ? { password: form.elements.password.value } : {}) };
      const response = await fetch('/api/users' + (accountId ? '/' + encodeURIComponent(accountId) : ''), {
        method: accountId ? 'PATCH' : 'POST', credentials: 'omit', cache: 'no-store',
        headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}));
        if (accountId) {
          if (detail.error === 'email_in_use') throw new Error('Această adresă de e-mail aparține deja altui cont. Alege o adresă diferită sau editează contul existent.');
          if (response.status === 404) throw new Error('Contul nu mai are acces la clientul selectat. Revino în portal și actualizează lista.');
          throw new Error('Nu am putut actualiza contul. Verifică datele și încearcă din nou.');
        }
        if (response.status === 409 && detail.error === 'archived_account_confirmation_required') {
          if (!window.confirm('Există un cont vechi pentru acest e-mail, fără acces la clienți activi. Îi retragi toate sesiunile, îi schimbi parola cu cea temporară de aici și îl asociezi clientului selectat?')) return;
          const retry = await fetch('/api/users', {
            method: 'POST', credentials: 'omit', cache: 'no-store',
            headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
            body: JSON.stringify({ client_id: clientId, name: form.elements.name.value.trim(),
              email: form.elements.email.value.trim(), password: form.elements.password.value, reactivate_existing: true }),
          });
          if (!retry.ok) throw new Error('Nu am putut reactiva contul. Verifică din nou asocierea și încearcă mai târziu.');
        } else if (response.status === 409) throw new Error('Adresa aparține deja unui cont activ. Verifică clientul asociat.');
        else throw new Error('Nu am putut crea contul. Verifică datele și încearcă din nou.');
      }
      form.reset();
      token = null;
      $('ready').hidden = true;
      $('done').hidden = false;
      $('done-title').textContent = accountId ? 'Cont actualizat' : 'Cont creat';
      $('done-hint').textContent = accountId ?
        (reset ? 'Parola temporară a fost resetată. Transmite-o clientului în privat; acesta va alege o parolă nouă la următoarea conectare.' :
          'Modificările au fost salvate. Clientul se poate autentifica din nou cu adresa actualizată și parola existentă.') :
        'Clientul este asociat și va schimba parola la prima conectare.';
      $('error').hidden = true;
      window.opener.postMessage({ type: accountId ? 'portal-account-updated' : 'portal-account-created', state }, portalOrigin);
    } catch (error) { message(error.message); }
    finally { submit.disabled = false; }
  });
})();
