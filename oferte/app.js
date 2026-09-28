(() => {
  'use strict';

  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const $ = (selector, root = document) => root.querySelector(selector);

  const campaign = {
    active: true,
    validUntil: '2026-10-31T23:59:59+02:00',
    whatsappMessage: 'Bună! Am văzut oferta Reset de Toamnă (2 camere 499 lei / 3 camere 599 lei) și doresc o programare. Localitatea/sectorul meu este: '
  };

  const showExpiredState = () => {
    $('[data-live-offer]')?.setAttribute('hidden', '');
    $('[data-expired-panel]')?.removeAttribute('hidden');
    $('[data-mobile-cta]')?.setAttribute('hidden', '');
    document.title = 'Ofertă încheiată | Petru & Inés';
  };

  const setupCampaign = () => {
    if (!campaign.active) {
      showExpiredState();
      return;
    }

    const expiry = new Date(campaign.validUntil);
    if (!Number.isNaN(expiry.getTime()) && Date.now() > expiry.getTime()) {
      showExpiredState();
      return;
    }

    const whatsappUrl = `https://wa.me/40772053562?text=${encodeURIComponent(campaign.whatsappMessage)}`;
    $$('[data-whatsapp-link]').forEach((link) => {
      link.href = whatsappUrl;
    });
  };

  const year = $('[data-year]');
  if (year) year.textContent = new Date().getFullYear();

  setupCampaign();

  window.addEventListener('pageshow', (event) => {
    if (event.persisted) setupCampaign();
  });
})();