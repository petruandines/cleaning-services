(() => {
  'use strict';

  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const $ = (selector, root = document) => root.querySelector(selector);

  const campaign = {
    active: true,
    startsAt: '2026-10-14T00:00:00+03:00',
    endsAt: '2026-11-01T00:00:00+02:00',
    whatsappMessage: 'Bună! Am văzut oferta Reset de Toamnă (2 camere 499 lei / 3 camere 599 lei) și doresc o programare. Localitatea/sectorul meu este: '
  };

  const startTime = new Date(campaign.startsAt).getTime();
  const endTime = new Date(campaign.endsAt).getTime();

  const showExpiredState = () => {
    $('[data-live-offer]')?.setAttribute('hidden', '');
    $('[data-expired-panel]')?.removeAttribute('hidden');
    $('[data-mobile-cta]')?.setAttribute('hidden', '');
    document.title = 'Ofertă încheiată | Petru & Inés';
  };

  const updateCountdowns = () => {
    const now = Date.now();
    let label = '';
    let diff = 0;
    let state = '';

    if (now < startTime) {
      label = 'Oferta va începe în:';
      diff = startTime - now;
      state = 'before';
    } else if (now < endTime) {
      label = 'Oferta expiră în:';
      diff = endTime - now;
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

    $$('[data-offer-countdown]').forEach((countdown) => {
      countdown.dataset.offerState = state;
      const labelEl = $('[data-offer-countdown-label]', countdown);
      const valuesEl = $('[data-offer-countdown-values]', countdown);
      if (labelEl) labelEl.textContent = label;
      if (valuesEl) valuesEl.hidden = state === 'expired';

      const fields = {
        '[data-offer-days]': String(days),
        '[data-offer-hours]': String(hours).padStart(2, '0'),
        '[data-offer-minutes]': String(minutes).padStart(2, '0'),
        '[data-offer-seconds]': String(seconds).padStart(2, '0')
      };
      Object.entries(fields).forEach(([selector, value]) => {
        const el = $(selector, countdown);
        if (el) el.textContent = value;
      });

      countdown.setAttribute(
        'aria-label',
        state === 'expired'
          ? 'Oferta a expirat'
          : `${label} ${days} zile, ${hours} ore, ${minutes} minute, ${seconds} secunde`
      );
    });

    if (state === 'expired') showExpiredState();
  };

  const setupCampaign = () => {
    if (!campaign.active || Number.isNaN(startTime) || Number.isNaN(endTime)) {
      showExpiredState();
      return;
    }

    const whatsappUrl = `https://wa.me/40772053562?text=${encodeURIComponent(campaign.whatsappMessage)}`;
    $$('[data-whatsapp-link]').forEach((link) => {
      link.href = whatsappUrl;
    });

    updateCountdowns();
  };

  const year = $('[data-year]');
  if (year) year.textContent = new Date().getFullYear();

  setupCampaign();
  window.setInterval(updateCountdowns, 1000);

  window.addEventListener('pageshow', () => {
    setupCampaign();
  });
})();