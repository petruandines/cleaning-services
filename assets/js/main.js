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

  // Current year.
  document.querySelectorAll('[data-year]').forEach((el) => {
    el.textContent = String(new Date().getFullYear());
  });

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
        nr_ac: 'Număr aparate AC', tip_spatiu: 'Tip spațiu', companie: 'Companie / locație'
      };
      Object.keys(labels).forEach((key) => {
        const value = data.get(key);
        if (value) lines.push(`${labels[key]}: ${value}`);
      });
      const details = String(data.get('details') || '').trim();
      if (details) lines.push(`Detalii: ${details}`);
      lines.push('', 'Dacă este util, pot atașa fotografii direct în WhatsApp. Mulțumesc!');
      const url = `https://wa.me/40772053562?text=${encodeURIComponent(lines.join('\n'))}`;
      if (status) status.textContent = 'Se deschide WhatsApp cu mesajul pregătit.';
      window.open(url, '_blank', 'noopener,noreferrer');
    });
  }
})();
