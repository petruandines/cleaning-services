import { forgetTabSession, readTabSession, rememberTabSession } from './session.mjs';

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
  const forms = {
    clients: [
      ['kind', 'Tip client', 'select', true, [['PF', 'Persoană fizică'], ['PJ', 'Firmă']]],
      ['display_name', 'Nume afișat', 'text', true, 160], ['email', 'E-mail', 'email', false, 254],
      ['phone', 'Telefon', 'tel', false, 40], ['company_name', 'Nume firmă', 'text', false, 160],
      ['cui', 'CUI', 'text', false, 30],
    ],
    locations: [
      ['label', 'Nume locație', 'text', true, 160], ['address', 'Adresă', 'text', true, 300],
      ['city', 'Oraș', 'text', true, 120], ['county', 'Județ', 'text', true, 120],
    ],
    appointments: [
      ['location_id', 'Locație', 'related', true, 'locations'],
      ['starts_at', 'Început', 'datetime-local', true], ['ends_at', 'Sfârșit', 'datetime-local', true],
      ['status', 'Stare', 'select', true, [['confirmed', 'Confirmată'], ['requested', 'Solicitată'], ['in_progress', 'În curs'], ['completed', 'Finalizată'], ['cancelled', 'Anulată']]],
      ['estimated_cost_bani', 'Estimare (lei)', 'money', false], ['client_note', 'Notă pentru client', 'textarea', false, 2000],
    ],
    jobs: [
      ['appointment_id', 'Programare (opțional)', 'related', false, 'appointments'],
      ['service_name', 'Serviciu', 'text', true, 160], ['description', 'Descriere', 'textarea', false, 2000],
      ['status', 'Stare', 'select', true, [['planned', 'Planificată'], ['in_progress', 'În curs'], ['completed', 'Finalizată'], ['cancelled', 'Anulată']]],
      ['price_bani', 'Preț (lei)', 'money', false],
    ],
    payments: [
      ['job_id', 'Lucrare', 'related', true, 'jobs'], ['amount_bani', 'Sumă (lei)', 'money', true],
      ['status', 'Stare', 'select', true, [['pending', 'În așteptare'], ['confirmed', 'Confirmată'], ['reversed', 'Anulată']]],
      ['recorded_at', 'Data înregistrării (opțional)', 'datetime-local', false], ['note', 'Notă', 'textarea', false, 1000],
    ],
    messages: [['body', 'Răspuns către client', 'textarea', true, 4000]],
  };
  let token = null;
  let user = null;
  let section = 'appointments';
  let loginWindow = null;
  let loginState = null;
  let accountWindow = null;
  let accountState = null;
  let accountClientId = '';
  let accountClientLabel = '';
  let generation = 0;
  let offset = 0;
  let nextOffset = null;
  let currentClientId = '';
  let currentClientLabel = '';
  let formKey = '';
  let searchTimer = null;

  function notice(message) {
    $('notice').textContent = message;
    $('notice').hidden = !message;
  }
  function clearSession() {
    generation++;
    forgetTabSession(window);
    if (accountWindow && !accountWindow.closed) accountWindow.close();
    token = null;
    user = null;
    loginState = null;
    loginWindow = null;
    accountWindow = null;
    accountState = null;
    $('workspace').hidden = true;
    $('welcome').hidden = false;
    $('content').replaceChildren();
    $('message-form').hidden = true;
    $('staff-form').hidden = true;
    $('staff-tools').hidden = true;
    $('account-panel').hidden = true;
    $('pager').hidden = true;
    currentClientId = '';
    currentClientLabel = '';
    formKey = '';
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
  async function allRelated(name, clientId) {
    const rows = [];
    let page = 0;
    do {
      const result = await api('/api/' + name + '?client_id=' + encodeURIComponent(clientId) + '&offset=' + page);
      rows.push(...result.rows);
      page = result.nextOffset;
      if (rows.length > 1000) throw new Error('Prea multe înregistrări pentru lista de selecție.');
    } while (page !== null);
    return rows;
  }
  function makeInput([name, label, kind, required, extra]) {
    const wrapper = document.createElement('label');
    wrapper.textContent = label;
    let control;
    if (kind === 'select' || kind === 'related') {
      control = document.createElement('select');
      if (!required || kind === 'related') {
        const blank = document.createElement('option');
        blank.value = '';
        blank.textContent = required ? 'Alege...' : 'Fără asociere';
        control.append(blank);
      }
      if (kind === 'select') for (const [value, text] of extra) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = text;
        control.append(option);
      }
    } else if (kind === 'textarea') {
      control = document.createElement('textarea');
      control.rows = 3;
    } else {
      control = document.createElement('input');
      control.type = kind === 'money' ? 'text' : kind;
      if (kind === 'money') { control.inputMode = 'decimal'; control.placeholder = 'Ex.: 700,00'; }
    }
    control.name = name;
    control.required = required;
    if (typeof extra === 'number') control.maxLength = extra;
    wrapper.append(control);
    return { wrapper, control };
  }
  async function renderStaffForm() {
    const form = $('staff-form');
    form.hidden = user?.role !== 'staff';
    if (form.hidden) return;
    const key = section + ':' + currentClientId + ':' + generation;
    if (formKey === key) return;
    formKey = key;
    const sectionAtStart = section;
    const clientAtStart = currentClientId;
    const sessionAtStart = generation;
    const fieldsBox = $('staff-fields');
    fieldsBox.replaceChildren();
    $('staff-form-title').textContent = section === 'messages' ? 'Răspunde clientului' : 'Adaugă · ' + sections[section];
    const needClient = section !== 'clients' && !currentClientId;
    $('staff-form-hint').hidden = !needClient;
    form.querySelector('button[type=submit]').hidden = needClient;
    if (needClient) return;
    const related = [];
    for (const definition of forms[section]) {
      const { wrapper, control } = makeInput(definition);
      fieldsBox.append(wrapper);
      if (definition[2] === 'related') related.push({ control, name: definition[4] });
    }
    try {
      for (const { control, name } of related) {
        const rows = await allRelated(name, clientAtStart);
        if (section !== sectionAtStart || currentClientId !== clientAtStart || generation !== sessionAtStart) return;
        for (const row of rows) {
          const option = document.createElement('option');
          option.value = row.id;
          option.textContent = name === 'locations' ? row.label + ' · ' + row.address :
            name === 'jobs' ? row.service_name + ' · ' + row.id.slice(0, 8) :
              format('starts_at', row.starts_at) + ' · ' + row.id.slice(0, 8);
          control.append(option);
        }
      }
    } catch (error) { if (sessionAtStart === generation) notice(error.message); }
  }
  async function refreshClientChoices() {
    if (user?.role !== 'staff') return;
    const wanted = $('client-search').value.trim();
    const requestGeneration = generation;
    const result = await api('/api/clients?search=' + encodeURIComponent(wanted));
    if (requestGeneration !== generation || wanted !== $('client-search').value.trim()) return;
    const picker = $('client-picker');
    picker.replaceChildren();
    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = 'Toți clienții';
    picker.append(blank);
    if (currentClientId && !result.rows.some(row => row.id === currentClientId)) {
      const selected = document.createElement('option');
      selected.value = currentClientId;
      selected.textContent = currentClientLabel;
      picker.append(selected);
    }
    for (const row of result.rows) {
      const option = document.createElement('option');
      option.value = row.id;
      option.textContent = row.display_name + ' · ' + row.kind;
      picker.append(option);
    }
    picker.value = currentClientId;
    if (section === 'clients') { offset = 0; loadSection(); }
  }
  async function refreshAccounts() {
    const client = currentClientId;
    $('account-panel').hidden = user?.role !== 'staff' || !client;
    if ($('account-panel').hidden) { $('account-list').replaceChildren(); return; }
    const requestGeneration = generation;
    const result = await api('/api/users?client_id=' + encodeURIComponent(client));
    if (requestGeneration !== generation || currentClientId !== client) return;
    const list = $('account-list');
    list.replaceChildren();
    if (!result.rows.length) { list.textContent = 'Nu există încă utilizatori pentru acest client.'; return; }
    for (const row of result.rows) {
      const line = document.createElement('p');
      line.textContent = row.name + ' · ' + row.email;
      list.append(line);
    }
  }
  function pageUrl() {
    const params = new URLSearchParams({ offset: String(offset) });
    if (user?.role === 'staff' && section === 'clients' && $('client-search').value.trim())
      params.set('search', $('client-search').value.trim());
    if (user?.role === 'staff' && section !== 'clients' && currentClientId)
      params.set('client_id', currentClientId);
    return '/api/' + section + '?' + params;
  }
  async function loadSection() {
    const current = section;
    const requestGeneration = generation;
    $('section-title').textContent = sections[section];
    $('message-form').hidden = section !== 'messages' || user?.role !== 'client';
    $('content').textContent = 'Se încarcă…';
    try {
      const data = await api(pageUrl());
      if (requestGeneration === generation && section === current) {
        render(data.rows);
        nextOffset = data.nextOffset;
        $('pager').hidden = offset === 0 && nextOffset === null;
        $('previous').disabled = offset === 0;
        $('next').disabled = nextOffset === null;
        $('page-label').textContent = 'Pagina ' + (Math.floor(offset / 30) + 1);
        await renderStaffForm();
      }
    } catch (error) {
      if (requestGeneration !== generation) return;
      $('content').textContent = '';
      notice(error.message);
    }
  }
  function selectSection(next) {
    section = next;
    offset = 0;
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
    $('staff-tools').hidden = user.role !== 'staff';
    if (user.role === 'staff') refreshClientChoices().catch(error => notice(error.message));
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
    if (ready() && event.origin === API && accountWindow && event.source === accountWindow &&
      accountState && event.data?.state === accountState) {
      if (event.data.type === 'portal-account-ready' && token && user?.role === 'staff') {
        accountWindow.postMessage({ type: 'portal-account-start', state: accountState,
          token, clientId: accountClientId, clientLabel: accountClientLabel }, API);
      } else if (event.data.type === 'portal-account-created') {
        accountWindow = null;
        accountState = null;
        refreshAccounts().catch(error => notice(error.message));
        notice('Contul de client a fost creat.');
      }
      return;
    }
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
      if (!verified.id || verified.twoFactorRequired || verified.mustChangePassword ||
          !['client', 'staff'].includes(verified.role)) throw new Error('invalid_session');
      token = candidate;
      user = verified;
      const stored = rememberTabSession(window, candidate);
      notice(stored ? '' : 'Browserul nu poate păstra sesiunea după reîncărcarea paginii.');
      showWorkspace();
    } catch { if (attempt === generation) { clearSession(); notice('Nu am putut valida sesiunea. Încearcă din nou.'); } }
  });

  $('refresh').addEventListener('click', loadSection);
  $('previous').addEventListener('click', () => { offset = Math.max(0, offset - 30); loadSection(); });
  $('next').addEventListener('click', () => { if (nextOffset !== null) { offset = nextOffset; loadSection(); } });
  $('client-search').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => refreshClientChoices().catch(error => notice(error.message)), 300);
  });
  $('client-picker').addEventListener('change', event => {
    currentClientId = event.target.value;
    currentClientLabel = event.target.selectedOptions[0]?.textContent || '';
    offset = 0;
    loadSection();
    refreshAccounts().catch(error => notice(error.message));
  });
  $('open-account').addEventListener('click', () => {
    if (!ready() || !token || user?.role !== 'staff' || !currentClientId) return;
    const random = new Uint8Array(16);
    crypto.getRandomValues(random);
    accountState = Array.from(random, byte => byte.toString(16).padStart(2, '0')).join('');
    accountClientId = currentClientId;
    accountClientLabel = currentClientLabel;
    accountWindow = window.open(API + '/account.html?state=' + accountState, 'petru-ines-account', 'popup=yes,width=520,height=720');
    if (!accountWindow) { accountState = null; notice('Permite fereastra pentru crearea contului.'); }
  });
  function leiToBani(value) {
    const normalized = value.trim().replace(',', '.');
    if (!/^\d{1,8}(\.\d{1,2})?$/.test(normalized)) throw new Error('Introdu suma în lei, cu cel mult două zecimale.');
    const [lei, bani = ''] = normalized.split('.');
    return Number(lei) * 100 + Number(bani.padEnd(2, '0'));
  }
  $('staff-form').addEventListener('submit', async event => {
    event.preventDefault();
    if (user?.role !== 'staff' || (section !== 'clients' && !currentClientId)) return;
    const form = event.currentTarget;
    const button = form.querySelector('button[type=submit]');
    const sectionAtStart = section;
    const data = section === 'clients' ? {} : { client_id: currentClientId };
    button.disabled = true;
    try {
      for (const [key, value] of new FormData(form)) {
        if (!value) continue;
        data[key] = key.endsWith('_bani') ? leiToBani(value) :
          ['starts_at', 'ends_at', 'recorded_at'].includes(key) ? new Date(value).toISOString() : value;
      }
      const result = await api('/api/' + sectionAtStart, { method: 'POST', body: JSON.stringify(data) });
      notice('Înregistrarea a fost adăugată.');
      if (sectionAtStart === 'clients') {
        currentClientId = result.id;
        currentClientLabel = data.display_name;
        $('client-search').value = data.display_name;
        await refreshClientChoices();
        await refreshAccounts();
      }
      formKey = '';
      await loadSection();
    } catch (error) { notice(error.message); }
    finally { button.disabled = false; }
  });
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

  const saved = readTabSession(window);
  if (saved && ready()) {
    const attempt = ++generation;
    $('login').disabled = true;
    notice('Verificăm sesiunea din această filă…');
    fetch(API + '/api/me', {
      headers: { authorization: 'Bearer ' + saved }, credentials: 'omit', cache: 'no-store',
    }).then(async response => {
      if (!response.ok) throw new Error('invalid_session');
      const verified = await response.json();
      if (attempt !== generation) return;
      if (!verified.id || verified.twoFactorRequired || verified.mustChangePassword ||
          !['client', 'staff'].includes(verified.role)) throw new Error('invalid_session');
      token = saved;
      user = verified;
      notice('');
      showWorkspace();
    }).catch(() => {
      if (attempt === generation) {
        clearSession();
        notice('Sesiunea a expirat. Intră din nou în cont.');
      }
    }).finally(() => { $('login').disabled = false; });
  }
})();
