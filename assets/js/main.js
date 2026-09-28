(() => {
  const header = document.querySelector('.site-header');
  const toggle = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.main-nav');
  const navDrop = document.querySelector('.nav-drop');
  const dropButton = navDrop?.querySelector(':scope > button');

  if (toggle && header) {
    toggle.addEventListener('click', () => {
      const open = header.classList.toggle('nav-open');
      toggle.setAttribute('aria-expanded', String(open));
    });
  }

  if (dropButton && navDrop) {
    dropButton.addEventListener('click', (e) => {
      if (window.matchMedia('(max-width: 1050px)').matches) {
        e.preventDefault();
        const open = navDrop.classList.toggle('open');
        dropButton.setAttribute('aria-expanded', String(open));
      }
    });
  }

  nav?.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', () => {
      header?.classList.remove('nav-open');
      toggle?.setAttribute('aria-expanded', 'false');
    });
  });

  // Lightweight reveal animation, disabled by OS preference.
  const revealEls = document.querySelectorAll('[data-reveal]');
  if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches && 'IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -30px 0px' });
    revealEls.forEach((el) => observer.observe(el));
  } else {
    revealEls.forEach((el) => el.classList.add('is-visible'));
  }

  // Open compact extra-service panels when arriving through an anchor link.
  function openExtraPanelFromHash() {
    if (!window.location.hash) return;
    const target = document.querySelector(window.location.hash);
    if (target?.matches?.('[data-extra-panel]')) target.open = true;
  }
  openExtraPanelFromHash();
  window.addEventListener('hashchange', openExtraPanelFromHash);

  // Reset de Toamnă countdown (Romania time).
  const offerCountdowns = [...document.querySelectorAll('[data-offer-countdown]')];
  if (offerCountdowns.length) {
    const offerStartsAt = new Date('2026-10-14T00:00:00+03:00').getTime();
    const offerEndsAt = new Date('2026-11-01T00:00:00+02:00').getTime();

    const updateOfferCountdowns = () => {
      const now = Date.now();
      let label = '';
      let diff = 0;
      let state = '';

      if (now < offerStartsAt) {
        label = 'Oferta va începe în:';
        diff = offerStartsAt - now;
        state = 'before';
      } else if (now < offerEndsAt) {
        label = 'Oferta expiră în:';
        diff = offerEndsAt - now;
        state = 'active';
      } else {
        label = 'Oferta a expirat';
        state = 'expired';
      }

      const totalSeconds = Math.max(0, Math.floor(diff / 1000));
      const days = Math.floor(totalSeconds / 86400);
      const hours = Math.floor((totalSeconds % 86400) / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;

      offerCountdowns.forEach((countdown) => {
        countdown.dataset.offerState = state;
        const labelEl = countdown.querySelector('[data-offer-countdown-label]');
        const valuesEl = countdown.querySelector('[data-offer-countdown-values]');
        if (labelEl) labelEl.textContent = label;
        if (valuesEl) valuesEl.hidden = state === 'expired';

        const dayEl = countdown.querySelector('[data-offer-days]');
        const hourEl = countdown.querySelector('[data-offer-hours]');
        const minuteEl = countdown.querySelector('[data-offer-minutes]');
        const secondEl = countdown.querySelector('[data-offer-seconds]');
        if (dayEl) dayEl.textContent = String(days);
        if (hourEl) hourEl.textContent = String(hours).padStart(2, '0');
        if (minuteEl) minuteEl.textContent = String(minutes).padStart(2, '0');
        if (secondEl) secondEl.textContent = String(seconds).padStart(2, '0');

        countdown.setAttribute(
          'aria-label',
          state === 'expired'
            ? 'Oferta a expirat'
            : `${label} ${days} zile, ${hours} ore, ${minutes} minute, ${seconds} secunde`
        );
      });

      const homeOfferBanner = document.querySelector('.home-offer-banner');
      if (homeOfferBanner) {
        const topline = homeOfferBanner.querySelector('.home-offer-topline');
        const title = homeOfferBanner.querySelector('.home-offer-copy h2');
        const description = homeOfferBanner.querySelector('.home-offer-copy p');
        const prices = homeOfferBanner.querySelector('.home-offer-prices');
        const countdown = homeOfferBanner.querySelector('.home-offer-countdown');
        const cta = homeOfferBanner.querySelector('.home-offer-cta');

        if (state === 'expired') {
          homeOfferBanner.href = '/cleaning-services/preturi/';
          homeOfferBanner.setAttribute('aria-label', 'Campania s-a încheiat — vezi tarifele actuale');
          if (topline) topline.innerHTML = '<span class="home-offer-badge">CAMPANIE ÎNCHEIATĂ</span>';
          if (title) title.textContent = 'Campania s-a încheiat — vezi tarifele actuale';
          if (description) description.textContent = 'Consultă prețurile și pachetele actuale Petru & Inés.';
          if (prices) prices.hidden = true;
          if (countdown) countdown.hidden = true;
          if (cta) cta.innerHTML = 'Vezi tarifele actuale <span aria-hidden="true">→</span>';
        }
      }
    };

    updateOfferCountdowns();
    window.setInterval(updateOfferCountdowns, 1000);
    window.addEventListener('pageshow', updateOfferCountdowns);
  }

  // Current year.
  document.querySelectorAll('[data-year]').forEach((el) => {
    el.textContent = String(new Date().getFullYear());
  });

  // Grout cleaning calculator.
  const groutCalculator = document.querySelector('[data-grout-calculator]');
  if (groutCalculator) {
    const rates = {
      refresh: { large: 15, medium: 18, small: 22 },
      deep: { large: 22, medium: 25, small: 30 },
    };
    const basePrices = {
      quick: { 2: 350, 3: 450, 4: 550 },
      deep: { 2: 650, 3: 800, 4: 950 },
      premium: { 2: 950, 3: 1100, 4: 1250 },
      kitchen: 249,
      'kitchen-deep': 349,
    };
    const serviceLabels = {
      quick: 'Quick Clean',
      deep: 'Deep Clean',
      premium: 'Premium Clean',
      kitchen: 'Degresare bucătărie',
      'kitchen-deep': 'Degresare intensivă bucătărie',
      existing: 'Lucrare deja programată',
    };
    const sizeLabels = { large: 'plăci mari', medium: 'plăci medii', small: 'plăci mici / multe rosturi' };
    const levelLabels = { refresh: 'Curățare rosturi – Standard', deep: 'Curățare rosturi – Intensivă' };
    const zones = Array.from(groutCalculator.querySelectorAll('[data-grout-zone]'));
    const booking = groutCalculator.querySelector('[data-grout-booking]');
    const addonConfig = groutCalculator.querySelector('[data-grout-addon-config]');
    const baseService = groutCalculator.querySelector('[data-grout-base-service]');
    const roomWrap = groutCalculator.querySelector('[data-grout-room-wrap]');
    const rooms = groutCalculator.querySelector('[data-grout-rooms]');
    const existingWrap = groutCalculator.querySelector('[data-grout-existing-wrap]');
    const existingInput = groutCalculator.querySelector('[data-grout-existing]');
    const rawTotalEl = groutCalculator.querySelector('[data-grout-raw-total]');
    const minimumSummary = groutCalculator.querySelector('[data-grout-minimum-summary]');
    const baseSummary = groutCalculator.querySelector('[data-grout-base-summary]');
    const baseTotalEl = groutCalculator.querySelector('[data-grout-base-total]');
    const baseLabelEl = groutCalculator.querySelector('[data-grout-base-label]');
    const payableEl = groutCalculator.querySelector('[data-grout-payable]');
    const minimumNoteEl = groutCalculator.querySelector('[data-grout-minimum-note]');
    const whatsapp = groutCalculator.querySelector('[data-grout-whatsapp]');

    const formatLei = (value) => `${Math.round(value)} lei`;

    function getBaseSelection() {
      const service = baseService?.value || '';
      if (!service) return { valid: false, price: 0, label: '', message: 'Selectează serviciul de bază.' };

      if (['quick', 'deep', 'premium'].includes(service)) {
        const room = rooms?.value || '';
        if (!room) return { valid: false, price: 0, label: serviceLabels[service], message: 'Selectează numărul de camere.' };
        const price = basePrices[service][room];
        return { valid: true, price, label: `${serviceLabels[service]} · ${room} camere`, message: '' };
      }

      if (service === 'kitchen' || service === 'kitchen-deep') {
        return { valid: true, price: basePrices[service], label: serviceLabels[service], message: '' };
      }

      if (service === 'existing') {
        const ref = String(existingInput?.value || '').trim();
        if (!ref) return { valid: false, price: 0, label: serviceLabels[service], message: 'Completează numele și data aproximativă a programării.' };
        return { valid: true, price: 0, label: `${serviceLabels[service]} · ${ref}`, message: '' };
      }

      return { valid: false, price: 0, label: '', message: 'Selectează serviciul de bază.' };
    }

    function updateAddonVisibility() {
      const addon = booking?.value === 'addon';
      if (addonConfig) addonConfig.hidden = !addon;

      const service = baseService?.value || '';
      const needsRooms = ['quick', 'deep', 'premium'].includes(service);
      const existing = service === 'existing';

      if (roomWrap) roomWrap.hidden = !needsRooms;
      if (existingWrap) existingWrap.hidden = !existing;

      if (!needsRooms && rooms) rooms.value = '';
      if (!existing && existingInput) existingInput.value = '';
    }

    function calculateGrout() {
      updateAddonVisibility();

      let rawTotal = 0;
      const details = [];

      zones.forEach((zone) => {
        const areaInput = zone.querySelector('[data-grout-area]');
        const sizeInput = zone.querySelector('[data-grout-size]');
        const levelInput = zone.querySelector('[data-grout-level]');
        const totalEl = zone.querySelector('[data-grout-zone-total]');
        const area = Math.max(0, Number.parseFloat(areaInput?.value || '0') || 0);
        const size = sizeInput?.value || 'medium';
        const level = levelInput?.value || 'refresh';
        const rate = rates[level][size];
        const subtotal = area * rate;
        rawTotal += subtotal;
        if (totalEl) totalEl.textContent = formatLei(subtotal);
        if (area > 0) {
          details.push(`${zone.dataset.zoneName}: ${area} m² · ${sizeLabels[size]} · ${levelLabels[level]} · ${rate} lei/m² = ${formatLei(subtotal)}`);
        }
      });

      const separate = (booking?.value || 'separate') === 'separate';
      const base = separate ? { valid: true, price: 0, label: '', message: '' } : getBaseSelection();
      const groutPayable = rawTotal > 0 && separate ? Math.max(100, rawTotal) : rawTotal;
      const combinedTotal = separate ? groutPayable : rawTotal + (base.valid ? base.price : 0);

      if (rawTotalEl) rawTotalEl.textContent = formatLei(rawTotal);
      if (minimumSummary) minimumSummary.hidden = !(separate && rawTotal > 0 && rawTotal < 100);

      if (baseSummary) baseSummary.hidden = separate;
      if (!separate && baseTotalEl) {
        baseTotalEl.textContent = base.valid && base.price > 0 ? formatLei(base.price) : (base.valid ? 'deja programată' : '—');
      }
      if (!separate && baseLabelEl) baseLabelEl.textContent = base.label || '';

      if (payableEl) payableEl.textContent = formatLei(combinedTotal);

      if (minimumNoteEl) {
        if (!rawTotal) {
          minimumNoteEl.textContent = separate ? 'Pentru o deplasare separată, valoarea minimă a comenzii este de 100 lei.' : (base.valid ? 'Adaugă suprafața pentru rosturi.' : base.message);
        } else if (separate && rawTotal < 100) {
          minimumNoteEl.textContent = `Calculul rosturilor este ${formatLei(rawTotal)}. Pentru deplasare separată, comanda minimă este 100 lei. Poți adăuga un alt serviciu sau totalul minim rămâne 100 lei.`;
        } else if (separate) {
          minimumNoteEl.textContent = 'Valoarea serviciilor îndeplinește pragul minim de 100 lei pentru deplasare.';
        } else if (!base.valid) {
          minimumNoteEl.textContent = base.message;
        } else if (base.price > 0) {
          minimumNoteEl.textContent = `Total combinat: ${formatLei(base.price)} serviciul de bază + ${formatLei(rawTotal)} rosturile.`;
        } else {
          minimumNoteEl.textContent = 'Curățarea rosturilor se adaugă la programarea existentă; nu se aplică un prag minim separat pentru acest extra.';
        }
      }

      if (whatsapp) {
        const lines = [
          'Bună ziua! Aș dori o estimare pentru curățarea rosturilor.',
          '',
          ...details,
          '',
        ];

        if (separate) {
          lines.push('Mod rezervare: serviciu separat');
          lines.push(`Rosturi calculate: ${formatLei(rawTotal)}`);
          if (rawTotal > 0 && rawTotal < 100) lines.push('Comandă minimă pentru deplasare: 100 lei');
          lines.push(`Estimare pentru rezervare: ${formatLei(groutPayable)}`);
        } else {
          lines.push('Mod rezervare: adaug la o altă lucrare');
          lines.push(`Serviciu de bază: ${base.label || 'nespecificat'}`);
          if (base.price > 0) lines.push(`Preț serviciu de bază: ${formatLei(base.price)}`);
          lines.push(`Curățare rosturi: ${formatLei(rawTotal)}`);
          if (base.valid && base.price > 0) lines.push(`Total estimativ combinat: ${formatLei(combinedTotal)}`);
          if (base.valid && base.price === 0) lines.push('Rosturile se adaugă la programarea existentă.');
        }

        lines.push('', 'Înțeleg că estimarea se confirmă după fotografii dacă există depuneri severe sau rosturi degradate.');
        whatsapp.href = `https://wa.me/40772053562?text=${encodeURIComponent(lines.join('\n'))}`;
        whatsapp.setAttribute('aria-disabled', String(!separate && !base.valid));
        whatsapp.classList.toggle('is-disabled', !separate && !base.valid);
        whatsapp.tabIndex = (!separate && !base.valid) ? -1 : 0;
      }
    }

    whatsapp?.addEventListener('click', (e) => {
      if (booking?.value === 'addon' && !getBaseSelection().valid) {
        e.preventDefault();
        calculateGrout();
      }
    });

    groutCalculator.addEventListener('input', calculateGrout);
    groutCalculator.addEventListener('change', calculateGrout);
    calculateGrout();
  }

  // WhatsApp form.
  const form = document.querySelector('[data-whatsapp-form]');
  if (form) {
    const service = form.querySelector('[name="service"]');
    const dynamic = form.querySelector('[data-dynamic-fields]');
    const status = form.querySelector('[data-form-status]');

    const configs = {
      'Curățare tapițerie': [
        ['tip_obiect', 'Ce dorești să curățăm?', 'select', ['Canapea', 'Fotoliu', 'Scaune tapițate', 'Saltea', 'Mochetă', 'Mai multe obiecte']],
      ],
      'Curățare canapea': [
        ['tip_canapea', 'Tip / dimensiune', 'select', ['2 locuri', '3 locuri', '4 locuri', 'Colțar / alt tip']],
      ],
      'Curățare saltea': [
        ['tip_saltea', 'Tip saltea', 'select', ['Single', 'Double', 'Altă dimensiune']],
      ],
      'Curățare tapițerie auto': [
        ['tip_auto', 'Tip autoturism', 'select', ['Autoturism', 'SUV / 7 locuri', 'Monovolum', 'Dubă / microbuz']],
      ],
      'Curățenie locuință': [
        ['tip_locuinta', 'Tip locuință', 'select', ['Garsonieră / studio', 'Apartament 2 camere', 'Apartament 3 camere', 'Apartament 4+ camere', 'Casă / vilă']],
      ],
      'Curățare cuptor': [
        ['grad_murdarie', 'Grad aproximativ de murdărie', 'select', ['Normal / mediu', 'Depuneri vechi / carbonizate', 'Nu știu — trimit fotografii']],
      ],
      'Degresare bucătărie': [
        ['suprafata', 'Dimensiune / suprafață aproximativă', 'text', 'ex. bucătărie 10 m²'],
      ],
      'Degresare intensivă bucătărie': [
        ['suprafata', 'Dimensiune / suprafață aproximativă', 'text', 'ex. bucătărie 10 m²'],
      ],
      'Curățare rosturi': [
        ['zona_rosturi', 'Zona', 'select', ['Baie', 'Bucătărie', 'Alte încăperi', 'Mai multe zone']],
        ['suprafata', 'Suprafață placată aproximativă', 'text', 'ex. 12 m²'],
        ['nivel_rosturi', 'Nivel dorit', 'select', ['Standard', 'Intensivă', 'Nu știu — doresc recomandare']],
      ],
      'Curățenie după constructor / renovare': [
        ['tip_locuinta', 'Tip locuință', 'select', ['Garsonieră / studio', 'Apartament 2 camere', 'Apartament 3 camere', 'Apartament 4+ camere', 'Casă / vilă']],
        ['suprafata', 'Suprafață aproximativă', 'text', 'ex. 75 m²'],
      ],
      'Curățenie birouri / spații comerciale': [
        ['suprafata', 'Suprafață aproximativă', 'text', 'ex. 120 m²'],
      ],
      'Curățare vitrine / geamuri': [
        ['suprafata', 'Suprafață aproximativă', 'text', 'ex. 35 m²'],
      ],
      'Igienizare aer condiționat': [
        ['nr_ac', 'Număr aparate', 'number', '1'],
      ],
      'Ozonificare': [
        ['tip_spatiu', 'Tip spațiu', 'select', ['Autoturism', 'Garsonieră / studio', 'Apartament', 'Casă', 'Birou / spațiu comercial']],
      ],
      'Ofertă pentru companie': [
        ['companie', 'Companie / locație', 'text', 'Numele companiei sau tipul locației'],
        ['suprafata', 'Suprafață / volum aproximativ', 'text', 'opțional'],
      ],
    };

    function renderDynamicFields() {
      if (!dynamic) return;
      dynamic.innerHTML = '';
      const fields = configs[service?.value] || [];
      fields.forEach(([name, label, type, optionsOrPlaceholder]) => {
        const wrap = document.createElement('div');
        wrap.className = 'field';
        const id = `dyn-${name}`;
        const lab = document.createElement('label');
        lab.setAttribute('for', id);
        lab.textContent = label;
        wrap.appendChild(lab);
        let input;
        if (type === 'select') {
          input = document.createElement('select');
          const blank = document.createElement('option');
          blank.value = '';
          blank.textContent = 'Selectează';
          input.appendChild(blank);
          optionsOrPlaceholder.forEach((opt) => {
            const option = document.createElement('option');
            option.value = opt;
            option.textContent = opt;
            input.appendChild(option);
          });
        } else {
          input = document.createElement('input');
          input.type = type;
          input.placeholder = optionsOrPlaceholder || '';
          if (type === 'number') input.min = '1';
        }
        input.id = id;
        input.name = name;
        wrap.appendChild(input);
        dynamic.appendChild(wrap);
      });
    }

    service?.addEventListener('change', renderDynamicFields);
    renderDynamicFields();

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!form.reportValidity()) return;
      const data = new FormData(form);
      const lines = [
        'Bună ziua! Aș dori o ofertă de la Petru & Inés.',
        '',
        `Nume: ${data.get('name') || '-'}`,
        `Telefon: ${data.get('phone') || '-'}`,
        `Serviciu: ${data.get('service') || '-'}`,
        `Locație: ${data.get('location') || '-'}`,
      ];
      const labels = {
        tip_obiect: 'Obiect', tip_canapea: 'Tip canapea', tip_saltea: 'Tip saltea',
        tip_auto: 'Tip auto', tip_locuinta: 'Tip locuință', suprafata: 'Suprafață',
        nr_ac: 'Număr aparate AC', tip_spatiu: 'Tip spațiu', companie: 'Companie / locație',
        grad_murdarie: 'Grad murdărie', zona_rosturi: 'Zona rosturi', nivel_rosturi: 'Nivel rosturi'
      };
      Object.keys(labels).forEach((key) => {
        const value = data.get(key);
        if (value) lines.push(`${labels[key]}: ${value}`);
      });
      const details = String(data.get('details') || '').trim();
      if (details) lines.push(`Detalii: ${details}`);
      if (data.get('terms_accept') === 'da') {
        lines.push('', 'Confirm că am citit și accept Condițiile de prestare a serviciilor și, dacă este cazul, Politica privind accesul și deplasarea.');
      }
      lines.push('', 'Dacă este util, pot atașa fotografii direct în WhatsApp. Mulțumesc!');
      const url = `https://wa.me/40772053562?text=${encodeURIComponent(lines.join('\n'))}`;
      if (status) status.textContent = 'Se deschide WhatsApp cu mesajul pregătit.';
      window.open(url, '_blank', 'noopener,noreferrer');
    });
  }
})();
