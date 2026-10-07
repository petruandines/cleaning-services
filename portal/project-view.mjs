export const labels = {draft:'Draft',scheduled:'Programată',confirmed:'Confirmată',in_progress:'În desfășurare',completed:'Finalizată',cancelled:'Anulată',closed:'Închisă'};
export const accessLabels = {not_created:'Acces necreat',active:'Activ',revoked:'Revocat',expired:'Expirat'};
export const date = value => value ? new Intl.DateTimeFormat('ro-RO',{timeZone:'Europe/Bucharest',dateStyle:'medium',timeStyle:'short'}).format(new Date(value)) : '—';
export const money = value => new Intl.NumberFormat('ro-RO',{style:'currency',currency:'RON'}).format(value/100);
export function el(tag,text,className) {const node=document.createElement(tag); if(text!==undefined) node.textContent=text; if(className) node.className=className; return node;}
export function countdown(p,now=Date.now()) {
 if(['in_progress','completed','cancelled','closed','draft'].includes(p.status)) return labels[p.status];
 const remaining=Math.max(0,Date.parse(p.scheduled_at)-now);
 if(!remaining) return 'Ora programată a sosit · așteptăm actualizarea echipei';
 const minutes=Math.floor(remaining/60000);
 return `Intervenția începe în ${Math.floor(minutes/1440)} zile : ${Math.floor(minutes/60)%24} ore : ${minutes%60} minute`;
}
const clocks=new WeakMap();
export function updateProjectClock(root){
 const state=clocks.get(root);if(!state)return;const {p,at}=state;
 const count=root.querySelector('#countdown');if(count)count.textContent=countdown(p);
 const billing=p.billing;if(billing?.mode!=='hourly'||!p.started_at)return;
 const elapsed=Math.max(0,billing.elapsed_ms+(billing.running?performance.now()-at:0));
 const duration=root.querySelector('[data-elapsed]'),total=root.querySelector('[data-total]');
 if(duration){const seconds=Math.floor(elapsed/1000);duration.textContent=`${String(Math.floor(seconds/3600)).padStart(2,'0')}:${String(Math.floor(seconds/60)%60).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;}
 if(total)total.textContent=money(billing.running?Math.max(billing.minimum_bani,Math.round(billing.rate_bani*elapsed/3600000)):billing.total_bani);
}
export function renderProject(root,p) {
 root.replaceChildren();clocks.set(root,{p,at:performance.now()});
 const card=el('article',undefined,'project-card');
 card.append(el('span','Petru & Inés · Intervenție punctuală','eyebrow'),el('h1',p.name),el('p',labels[p.status],'project-status'));
 const count=el('p',countdown(p),'project-countdown'); count.id='countdown'; card.append(count);
 const summary=el('dl',undefined,'project-summary');
 for(const [title,value] of [['Data și ora (România)',date(p.scheduled_at)],[p.billing?.mode==='hourly'?'Tarif pe oră':'Preț',money(p.price_bani)+(p.billing?.mode==='hourly'?' / oră':'')],...(p.location?[['Locație',p.location]]:[])]) summary.append(el('dt',title),el('dd',value));
 card.append(summary);
 if(p.en_route&&['scheduled','confirmed'].includes(p.status)){const travel=el('section',undefined,'project-travel');travel.append(el('h2','Ne deplasăm spre locație'));const car=el('span','🚗','project-car');car.setAttribute('aria-hidden','true');travel.append(car,el('p','Echipa Petru & Inés a început deplasarea.'),el('p','Plecare: '+date(p.departed_at),'help'));card.append(travel);}
 if(p.billing?.mode==='hourly'){
  const billing=el('section',undefined,'project-billing');billing.append(el('h2','Tarifare pe oră'),el('p','Minimum comandă: '+money(p.billing.minimum_bani)+(p.billing.minimum_agreement?' · '+p.billing.minimum_agreement:'')));
  if(p.started_at){billing.append(el('p',p.billing.running?'Timp scurs':'Durata intervenției'));const time=el('strong');time.dataset.elapsed='';billing.append(time,el('p',p.billing.running?'Total de plată până acum':'Total de plată'));const total=el('strong');total.dataset.total='';billing.append(total);}
  else billing.append(el('p','Cronometrul pornește când echipa începe intervenția.'));
  card.append(billing);
 }
 if(p.description) card.append(el('p',p.description,'project-description'));
 const done=p.tasks.filter(t=>t.done).length;
 card.append(el('h2',`${done} din ${p.tasks.length} sarcini finalizate`));
 const progress=el('progress'); progress.max=p.tasks.length||1; progress.value=done; progress.setAttribute('aria-label','Progresul intervenției'); card.append(progress);
 const list=el('ul',undefined,'project-checklist');
 for(const t of p.tasks) {const item=el('li',(t.done?'✅ ':'⬜ ')+t.title); if(t.completed_at) item.append(el('small','Finalizată: '+date(t.completed_at))); list.append(item);} card.append(list);
 if(p.invoice_url) {const a=el('a',p.invoice_label||'Descarcă factura','primary'); a.href=p.invoice_url; a.target='_blank'; a.rel='noopener noreferrer'; card.append(a);}
 if(p.review_url && p.completed_at && ['completed','closed'].includes(p.status)) {const review=el('section',undefined,'project-review'); review.append(el('h2','Ți-au plăcut serviciile noastre?'),el('p','⭐⭐⭐⭐⭐')); const a=el('a','Lasă-ne o recenzie pe Google','primary'); a.href=p.review_url; a.target='_blank'; a.rel='noopener noreferrer'; review.append(a); card.append(review);}
 card.append(el('p','Ultima actualizare: '+date(p.updated_at),'help')); root.append(card);
 for(const [kind,info] of [['access-policy',p.access_policy],['service-terms',p.service_terms]])if(info){
  const section=el('article',undefined,'project-card project-legal');section.dataset.card=kind;section.append(el('h2',info.title));const a=el('a','Citește documentul','secondary');a.href=info.url;a.target='_blank';a.rel='noopener noreferrer';section.append(a);root.append(section);
 }
 if(p.supplier){const section=el('article',undefined,'project-card project-supplier');section.dataset.card='supplier';section.append(el('h2','Informații despre furnizor'));const details=el('dl',undefined,'project-summary');
  for(const [label,key] of [['Servicii furnizate de','name'],['CUI','cui'],['Număr registrul comerțului','registration'],['IBAN','iban'],['Banca','bank']])details.append(el('dt',label),el('dd',p.supplier[key]));section.append(details);root.append(section);
 }
 updateProjectClock(root);
}
// Date/time entry always refers to Romania, irrespective of the admin device timezone.
export function bucharestLocal(iso) {
 const parts=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Bucharest',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(iso));
 const v=Object.fromEntries(parts.map(x=>[x.type,x.value]));return `${v.year}-${v.month}-${v.day}T${v.hour}:${v.minute}`;
}
export function bucharestISO(local) {
 const utc=Date.parse(local+'Z'); if(!Number.isFinite(utc)) throw new Error('Alege data și ora.');
 const matches=[2,3].map(h=>new Date(utc-h*3600000).toISOString()).filter(iso=>bucharestLocal(iso)===local);
 if(matches.length!==1) throw new Error('Ora aleasă este inexistentă sau ambiguă la schimbarea orei. Alege altă oră.'); return matches[0];
}
