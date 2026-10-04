(() => {
  'use strict';
  const host = window.location.hostname.toLowerCase();
  const alias = host === 'www.petruandines.com' ||
    host === 'petruandines-site.pages.dev' ||
    host.endsWith('.petruandines-site.pages.dev');
  if (!alias) return;
  const target = 'https://petruandines.com' + window.location.pathname + window.location.search + window.location.hash;
  if (window.location.href !== target) window.location.replace(target);
})();
