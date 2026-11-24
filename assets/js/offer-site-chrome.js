(() => {
  const header = document.querySelector('.site-header');
  const toggle = document.querySelector('.menu-toggle');
  const nav = document.querySelector('.main-nav');
  const navDrop = document.querySelector('.nav-drop');
  const dropButton = navDrop?.querySelector(':scope > button');

  // Add only the new service to the existing Services menu; retain all current links and handlers.
  const serviceMenu = navDrop?.querySelector('.nav-drop-menu');
  if (serviceMenu && !serviceMenu.querySelector('a[href$="/calcare-haine-bucuresti/"]')) {
    const ironingLink = document.createElement('a');
    ironingLink.href = '/cleaning-services/calcare-haine-bucuresti/';
    ironingLink.textContent = 'Călcare haine la domiciliu';
    serviceMenu.appendChild(ironingLink);
  }

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

  document.querySelectorAll('[data-year]').forEach(el=>{el.textContent=String(new Date().getFullYear())});
})();