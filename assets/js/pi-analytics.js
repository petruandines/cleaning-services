/* Petru & Inés: consent-gated public website analytics. No customer data. */
(() => {
  'use strict';
  const GTM = 'GTM-T5W2QNNZ', GA = 'G-9FBR322D7B';
  const CHOICE = 'pi_analytics_consent_v1', INTERNAL = 'pi_analytics_internal_v1';
  const MAX_AGE = 180 * 86400000;
  const ORIGIN = 'https://petruandines.com';
  const deny = {analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'};
  const privatePath = p => /(?:^|\/)(?:portal|portal-v2[^/]*|admin|login|account|projects?|actualizare|vector-studio|catalog)(?:\/|$)/i.test(p);
  const canonical = document.querySelector('link[rel="canonical"]');
  if (location.origin !== ORIGIN || !canonical || privatePath(location.pathname) ||
      document.querySelector('meta[name="robots"][content*="noindex" i]')) return;
  let page;
  try { page = new URL(canonical.href); } catch { return; }
  const normalized = p => p.replace(/\/index\.html$/,'/').replace(/\/$/,'') || '/';
  if (page.origin !== ORIGIN || privatePath(page.pathname) || page.search || page.hash ||
      normalized(page.pathname) !== normalized(location.pathname)) return;
  // Fail closed on arbitrary URL parameters. Only a small set of known attribution
  // values can reach the tag, which can independently read the browser URL.
  const safeSources = /^(?:chatgpt(?:\.com)?|chat\.openai\.com|openai(?:\.com)?|google(?:\.com)?|bing(?:\.com)?|gemini(?:\.google\.com)?|copilot(?:\.microsoft\.com)?|perplexity(?:\.ai)?|claude(?:\.ai)?|grok(?:\.com)?|facebook(?:\.com)?|instagram(?:\.com)?|linkedin(?:\.com)?|newsletter|google_business_profile)$/i;
  const safeMedia = /^(?:referral|organic|social|email|cpc|ai|organic_social|organic_search)$/i;
  const safeCampaign = /^(?:noiembrie-casa-luna|decembrie-luna-zero|black-friday|google-business-profile|oferte)$/i;
  function safeUrl(raw) {
    const u = new URL(raw);
    if (u.origin !== ORIGIN || privatePath(u.pathname)) return false;
    const seen = new Set();
    for (const [key,value] of u.searchParams) {
      if (seen.has(key)) return false;
      seen.add(key);
      if (!(key === 'utm_source' && safeSources.test(value) ||
          key === 'utm_medium' && safeMedia.test(value) ||
          key === 'utm_campaign' && safeCampaign.test(value))) return false;
    }
    if (u.hash && (!/^#[a-z0-9_-]{1,80}$/i.test(u.hash) || !document.getElementById(u.hash.slice(1)))) return false;
    return true;
  }
  let referrer = '';
  let eligible = false;
  try {
    eligible = safeUrl(location.href);
    if (document.referrer) {
      const r = new URL(document.referrer);
      if (r.origin === ORIGIN) {
        if (privatePath(r.pathname) || !safeUrl(r.href)) eligible = false;
        else referrer = r.origin + r.pathname;
      } else if (/^https?:$/.test(r.protocol)) referrer = r.origin + '/';
    }
  } catch { eligible = false; }
  function get(key) { try { return localStorage.getItem(key); } catch { return null; } }
  function put(key,value) { try { localStorage.setItem(key,value); return true; } catch { return false; } }
  function readChoice() {
    try {
      const v=JSON.parse(get(CHOICE));
      return v && (v.value==='granted'||v.value==='denied') && Number.isFinite(v.at) &&
        Date.now()>=v.at && Date.now()-v.at<MAX_AGE ? v.value : null;
    } catch { return null; }
  }
  let choice=readChoice(), loaded=false;
  const internal=()=>get(INTERNAL)==='1';
  const permitted=()=>eligible && choice==='granted' && !internal() &&
    safeUrl(location.href) && normalized(location.pathname)===normalized(page.pathname);
  function command(){ window.dataLayer.push(arguments); }
  const names=new Set(['whatsapp_click','phone_click','quote_request_start','offer_view','pricing_view','service_view','language_switch']);
  const sourceTypes=new Set(['link','quote_form','offer_calculator','ironing_form','navigation','page']);
  function track(name,source='page') {
    if (!loaded || !permitted() || !names.has(name) || !sourceTypes.has(source)) return;
    command('event',name,{send_to:GA,contact_method:source});
  }
  function load() {
    if (loaded || !permitted()) return;
    // Do not initialize a second tag if another integration already exists.
    if (document.querySelector('script[src*="googletagmanager.com"],iframe[src*="googletagmanager.com"]') ||
        typeof window.gtag==='function') return;
    window.dataLayer=window.dataLayer||[];
    window.gtag=command;
    command('consent','default',{...deny});
    command('consent','update',{...deny,analytics_storage:'granted'});
    const locationForAnalytics=new URL(page.href);
    locationForAnalytics.search=location.search;
    command('set',{page_location:locationForAnalytics.href,page_referrer:referrer,
      allow_google_signals:false,allow_ad_personalization_signals:false});
    command('js',new Date());
    window.dataLayer.push({'gtm.start':Date.now(),event:'gtm.js'});
    const s=document.createElement('script');
    s.async=true;
    s.referrerPolicy='no-referrer';
    s.src='https://www.googletagmanager.com/gtm.js?id='+GTM;
    loaded=true;
    document.head.appendChild(s);
    const p=page.pathname;
    if (/\/(?:oferte|noiembrie-casa-luna|decembrie-luna-zero|black-friday)(?:\/|$)/.test(p)) track('offer_view');
    if (/\/preturi(?:\/|$)/.test(p)) track('pricing_view');
    if (/\/(?:curatare-|curatenie-|calcare-|igienizare-|ozonificare)/.test(p)) track('service_view');
  }
  function clearCookies() {
    for (const part of document.cookie.split(';')) {
      const name=part.split('=')[0].trim();
      if (!/^_ga(?:_|$)/.test(name)) continue;
      for (const domain of ['', '; Domain=petruandines.com', '; Domain=.petruandines.com']) {
        document.cookie=name+'=; Max-Age=0; Path=/; SameSite=Lax; Secure'+domain;
      }
    }
  }
  const en = document.documentElement.lang.toLowerCase().startsWith('en');
  const copy = en ? {
    title:'Privacy preferences',body:'Optional analytics cookies help us understand visits and improve our services. We use them only with your consent. Refusing does not affect the website or bookings.',
    accept:'Accept analytics',reject:'Reject analytics',close:'Close',policy:'Privacy & cookies',prefs:'Cookie preferences'
  } : {
    title:'Preferințe de confidențialitate',body:'Cookie-urile opționale de analiză ne ajută să înțelegem vizitele și să îmbunătățim serviciile. Le folosim numai cu acordul tău. Refuzul nu afectează site-ul sau programările.',
    accept:'Accept analiza',reject:'Refuz analiza',close:'Închide',policy:'Confidențialitate și cookie-uri',prefs:'Preferințe cookie-uri'
  };
  const panel=document.createElement('section');
  panel.className='pi-consent'; panel.hidden=true;
  panel.setAttribute('aria-labelledby','pi-consent-title');
  function element(tag,cls,value) {const x=document.createElement(tag);if(cls)x.className=cls;if(value)x.textContent=value;return x;}
  const title=element('h2','',copy.title);title.id='pi-consent-title';
  const body=element('p','',copy.body);
  const actions=element('div','pi-consent-actions');
  const accept=element('button','',copy.accept), reject=element('button','',copy.reject), close=element('button','pi-consent-close',copy.close);
  for(const b of [accept,reject,close]) b.type='button';
  const policy=element('a','pi-consent-policy',copy.policy);policy.href='/confidentialitate/';
  actions.append(accept,reject,close);panel.append(title,body,actions,policy);document.body.appendChild(panel);
  const preference=document.getElementById('pi-consent-preferences');
  if(preference) {preference.hidden=false;preference.addEventListener('click',()=>{panel.hidden=false;close.hidden=false;accept.focus();});}
  function hide(){panel.hidden=true; if(preference)preference.focus({preventScroll:true});}
  function choose(value) {
    choice=value;
    put(CHOICE,JSON.stringify({value,at:Date.now()}));
    if(value==='denied'){
      window['ga-disable-'+GA]=true;
      if(loaded)command('consent','update',{...deny});
      clearCookies();
      if(loaded){location.reload();return;}
    } else {
      window['ga-disable-'+GA]=false;
      load();
    }
    hide();
  }
  accept.addEventListener('click',()=>choose('granted'));
  reject.addEventListener('click',()=>choose('denied'));
  close.addEventListener('click',hide);
  window.addEventListener('storage',e=>{
    if(e.key!==CHOICE && e.key!==INTERNAL)return;
    if(loaded){window['ga-disable-'+GA]=true;command('consent','update',{...deny});clearCookies();}
    location.reload();
  });
  // Local-only staff exclusion. No IP collection and no private identifier sent.
  window.PIAnalytics=Object.freeze({
    track,
    quote(source){if(['quote_form','offer_calculator','ironing_form'].includes(source)){track('quote_request_start',source);track('whatsapp_click',source);}},
    setInternal(value=true){
      if(!put(INTERNAL,value?'1':'0'))return false;
      if(value && loaded){window['ga-disable-'+GA]=true;command('consent','update',{...deny});clearCookies();}
      location.reload();return true;
    }
  });
  document.addEventListener('click',e=>{
    if(!e.isTrusted || e.defaultPrevented)return;
    const a=e.target?.closest?.('a[href]');
    if(!a || a.getAttribute('aria-disabled')==='true' || a.classList.contains('is-disabled'))return;
    let u;try{u=new URL(a.href,location.href);}catch{return;}
    if(u.protocol==='tel:')track('phone_click','link');
    else if(u.protocol==='https:' && ['wa.me','api.whatsapp.com','web.whatsapp.com'].includes(u.hostname))track('whatsapp_click','link');
    else if(u.origin===ORIGIN && /^\/en(?:\/|$)/.test(u.pathname)!==en)track('language_switch','navigation');
  },true);
  if(choice==='granted')load();
  else if(choice===null && !internal() && eligible){close.hidden=true;panel.hidden=false;}
})();