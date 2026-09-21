(() => {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
  const setText = (selector, value) => {
    const element = $(selector);
    if (element && typeof value === 'string' && value.trim()) element.textContent = value;
  };

  const updateBenefits = (benefits) => {
    const container = $('[data-benefits]');
    if (!container || !Array.isArray(benefits) || !benefits.length) return;

    const fragment = document.createDocumentFragment();
    benefits.slice(0, 6).forEach((benefit, index) => {
      if (!benefit || typeof benefit.title !== 'string' || typeof benefit.text !== 'string') return;
      const article = document.createElement('article');
      article.className = 'benefit';

      const number = document.createElement('span');
      number.textContent = String(index + 1).padStart(2, '0');
      const title = document.createElement('h3');
      title.textContent = benefit.title;
      const text = document.createElement('p');
      text.textContent = benefit.text;

      article.append(number, title, text);
      fragment.append(article);
    });

    if (fragment.childNodes.length) container.replaceChildren(fragment);
  };

  const showExpiredState = () => {
    $('[data-offer-card]')?.setAttribute('hidden', '');
    $('[data-expired-panel]')?.removeAttribute('hidden');
    $$('[data-offer-details]').forEach((section) => section.setAttribute('hidden', ''));
    $('[data-mobile-cta]')?.setAttribute('hidden', '');
    document.title = 'Ofertă în pregătire | Petru & Inés';
  };

  const renderOffer = (offer) => {
    if (!offer || offer.active !== true) {
      showExpiredState();
      return;
    }

    if (offer.validUntil) {
      const expiry = new Date(offer.validUntil);
      if (!Number.isNaN(expiry.getTime()) && Date.now() > expiry.getTime()) {
        showExpiredState();
        return;
      }
    }

    setText('[data-eyebrow]', offer.eyebrow);
    setText('[data-kicker]', offer.kicker);
    setText('[data-title]', offer.title);
    setText('[data-subtitle]', offer.subtitle);
    setText('[data-price]', offer.price);
    setText('[data-price-unit]', offer.priceUnit);
    setText('[data-price-context]', offer.priceContext);
    setText('[data-offer-description]', offer.offerDescription);
    setText('[data-hourly-title]', offer.hourlyTitle);
    setText('[data-hourly-price]', offer.hourlyPrice);
    setText('[data-hourly-description]', offer.hourlyDescription);
    setText('[data-cta-label]', offer.ctaLabel);
    setText('[data-valid-until]', offer.validUntilLabel);
    setText('[data-updated-at]', offer.updatedAtLabel);
    setText('[data-terms]', offer.terms);

    if (typeof offer.image === 'string' && offer.image.trim()) {
      const image = $('[data-offer-image]');
      if (image) image.src = offer.image;
    }
    if (typeof offer.imageAlt === 'string' && offer.imageAlt.trim()) {
      $('[data-offer-image]')?.setAttribute('alt', offer.imageAlt);
    }

    const message = typeof offer.whatsappMessage === 'string' ? offer.whatsappMessage : 'Bună! Doresc detalii despre oferta actuală.';
    const whatsappUrl = `https://wa.me/40772053562?text=${encodeURIComponent(message)}`;
    $$('[data-whatsapp-link]').forEach((link) => { link.href = whatsappUrl; });

    updateBenefits(offer.benefits);
  };

  const loadCurrentOffer = async () => {
    try {
      const url = new URL('./offer.json', window.location.href);
      url.searchParams.set('_', Date.now().toString());
      const response = await fetch(url, {
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      renderOffer(await response.json());
    } catch (error) {
      console.warn('Oferta actualizată nu a putut fi încărcată. Se afișează varianta inclusă în pagină.', error);
    }
  };

  $('[data-year]').textContent = new Date().getFullYear();
  loadCurrentOffer();

  window.addEventListener('pageshow', (event) => {
    if (event.persisted) loadCurrentOffer();
  });
})();
