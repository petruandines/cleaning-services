(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const API = window.PETRU_INES_API_ORIGIN;
  const sections = {
    appointments: 'Programări', jobs: 'Lucrări', payments: 'Plăți',
    messages: 'Mesaje', locations: 'Locații', clients: 'Clienți',
  };
  const fields = {
    appointments: { starts_at: 'Începe', ends_at: 'Se termină', status: 'Stare', client_note: 'Detalii', estimated_cost_bani: 'Estimare' },
    jobs: { service_name: 'Serviciu', description: 'Descriere', status: 'Stare', price_bani: 'Preț', completed_at: 'Finalizată' },
    payments: { amount_bani: 'Sumă', status: 'Stare', recorded_at: 'Înregistrată' },
    messages: { body: 'Mesaj', created_at: 'Trimis la' },
    locations: { label: 'Nume', address: 'Adresă', city: 'Oraș', county: 'Județ' },
    clients: { display_name: 'Nume', kind: 'Tip', email: 'E-mail', phone: 'Telefon', company_name: 'Firmă', cui: 'CUI', status: 'Stare' },
  };
  let token = null;
  let user = null;
  let section = 'appointments';
  let loginWindow = null;
  let loginState = null;
  let generation = 0;

  function notice(message) {
    $('notice').textContent = message;
    $('notice').hidden = !message;
  }
  function clearSession() {
    generation++;
    token = null;
    user = null;
    loginState = null;
    loginWindow = null;
    $('workspace').hidden = true;
    $('welcome').hidden = false;
    $('content').replaceChildren();
    $('message-form').hidden = true;
  }
  function ready() {
    try {
      const url = new URL(API);
      return url.protocol === 'https:' && url.origin === API && !url.hostname.startsWith('REPLACE_');
    } catch { return false; }
  }
  async function api(path, options = {}) {
    const response = await fetch(API + path, {
      ...options, credentials: 'omit', cache: 'no-store',
      headers: { authorization: 'Bearer ' + token, ...(options.body ? { 'content-type': 'application/json' } : {}) },
    });
    if (response.status === 401) { clearSession(); throw new Error('Sesiunea a expirat. Intră din nou în cont.'); }
    if (!response.ok) throw new Error('Cererea nu a putut fi finalizată. Încearcă din nou.');
    return response.json();
  }
  function format(key, value) {
    if (value === null || value === undefined || value === '') return '—';
    if (key.endsWith('_bani')) return new Intl.NumberFormat('ro-RO', { style: 'currency', currency: 'RON' }).format(value / 100);
    if (['starts_at', 'ends_at', 'completed_at', 'recorded_at', 'created_at'].includes(key)) {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) return new Intl.DateTimeFormat('ro-RO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Bucharest' }).format(date);
    }
    return String(value);
  }
  function render(rows) {
    const container = $('content');
    container.replaceChildren();
    if (!Array.isArray(rows) || rows.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'empty';
      empty.textContent = 'Nu există încă înregistrări în această secțiune.';
      container.append(empty);
      return;
    }
    const cards = document.createElement('div');
    cards.className = 'cards';
    for (const row of rows) {
      const card = document.createElement('article');
      card.className = 'card';
      const title = document.createElement('h3');
      title.textContent = row.service_name || row.display_name || row.label ||
        (section === 'messages' ? 'Mesaj' : sections[section].slice(0, -1));
      card.append(title);
      const details = document.createElement('dl');
      for (const [key, label] of Object.entries(fields[section])) {
        if (row[key] === null || row[key] === undefined || row[key] === '') continue;
        const term = document.createElement('dt');
        const description = document.createElement('dd');
        term.textContent = label;
        description.textContent = format(key, row[key]);
        details.append(term, description);
      }
      card.append(details);
      cards.append(card);
    }
    container.append(cards);
  }
  async function loadSection() {
    const current = section;
    const requestGeneration = generation;
    $('section-title').textContent = sections[section];
    $('message-form').hidden = section !== 'messages' || user?.role !== 'client';
    $('content').textContent = 'Se încarcă…';
    try {
      const data = await api('/api/' + current);
      if (requestGeneration === generation && section === current) render(data.rows);
    } catch (error) {
      if (requestGeneration !== generation) return;
      $('content').textContent = '';
      notice(error.message);
    }
  }
  function selectSection(next) {
    section = next;
    for (const button of $('tabs').querySelectorAll('button')) {
      if (button.dataset.section === next) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    }
    loadSection();
  }
  function showWorkspace() {
    $('welcome').hidden = true;
    $('workspace').hidden = false;
    $('greeting').textContent = 'Bună, ' + (user.name || 'bine ai venit') + '!';
    $('role').textContent = user.role === 'staff' ? 'Echipa Petru & Inés' : 'Portalul tău';
    $('tabs').replaceChildren();
    for (const [key, label] of Object.entries(sections)) {
      if (key === 'clients' && user.role !== 'staff') continue;
      const button = document.createElement('button');
      button.type = 'button';
      button.dataset.section = key;
      button.textContent = label;
      button.addEventListener('click', () => selectSection(key));
      $('tabs').append(button);
    }
    selectSection('appointments');
  }

  $('login').addEventListener('click', () => {
    if (!ready()) { notice('Portalul nou este încă în pregătire. Folosește deocamdată portalul publicat.'); return; }
    const random = new Uint8Array(16);
    crypto.getRandomValues(random);
    loginState = Array.from(random, byte => byte.toString(16).padStart(2, '0')).join('');
    loginWindow = window.open(API + '/login.html?state=' + loginState, 'petru-ines-login', 'popup=yes,width=520,height=720');
    if (!loginWindow) { loginState = null; notice('Permite fereastra de autentificare în browser și încearcă din nou.'); }
    else notice('Finalizează autentificarea în fereastra deschisă.');
  });

  window.addEventListener('message', async event => {
    if (!ready() || event.origin !== API || !loginWindow || event.source !== loginWindow ||
      !loginState || event.data?.type !== 'petru-ines-auth' || event.data.state !== loginState ||
      typeof event.data.token !== 'string' || !event.data.token) return;
    const candidate = event.data.token;
    loginState = null;
    loginWindow = null;
    const attempt = ++generation;
    try {
      const response = await fetch(API + '/api/me', {
        headers: { authorization: 'Bearer ' + candidate }, credentials: 'omit', cache: 'no-store',
      });
      if (!response.ok) throw new Error('invalid_session');
      const verified = await response.json();
      if (attempt !== generation) return;
      if (!verified.id || verified.twoFactorRequired || !['client', 'staff'].includes(verified.role)) throw new Error('invalid_session');
      token = candidate;
      user = verified;
      notice('');
      showWorkspace();
    } catch { if (attempt === generation) { clearSession(); notice('Nu am putut valida sesiunea. Încearcă din nou.'); } }
  });

  $('refresh').addEventListener('click', loadSection);
  $('logout').addEventListener('click', async () => {
    const previous = token;
    clearSession();
    notice('Ai ieșit din cont.');
    if (previous) {
      try { await fetch(API + '/api/auth/sign-out', { method: 'POST', credentials: 'omit', cache: 'no-store',
        headers: { authorization: 'Bearer ' + previous, 'content-type': 'application/json' }, body: '{}' }); } catch { /* Session already cleared locally. */ }
    }
  });
  $('message-form').addEventListener('submit', async event => {
    event.preventDefault();
    const field = $('message');
    const body = field.value.trim();
    if (!body) return;
    const button = event.currentTarget.querySelector('button');
    button.disabled = true;
    try {
      await api('/api/messages', { method: 'POST', body: JSON.stringify({ body }) });
      field.value = '';
      notice('Mesajul a fost trimis.');
      await loadSection();
    } catch (error) { notice(error.message); }
    finally { button.disabled = false; }
  });
})();
