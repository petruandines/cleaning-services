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
export function renderProject(root,p) {
 root.replaceChildren();
 const card=el('article',undefined,'project-card');
 card.append(el('span','Petru & Inés · Intervenție punctuală','eyebrow'),el('h1',p.name),el('p',labels[p.status],'project-status'));
 const count=el('p',countdown(p),'project-countdown'); count.id='countdown'; card.append(count);
 const summary=el('dl',undefined,'project-summary');
 for(const [title,value] of [['Data și ora (România)',date(p.scheduled_at)],['Preț',money(p.price_bani)],...(p.location?[['Locație',p.location]]:[])]) summary.append(el('dt',title),el('dd',value));
 card.append(summary); if(p.description) card.append(el('p',p.description,'project-description'));
 const done=p.tasks.filter(t=>t.done).length;
 card.append(el('h2',`${done} din ${p.tasks.length} sarcini finalizate`));
 const progress=el('progress'); progress.max=p.tasks.length||1; progress.value=done; progress.setAttribute('aria-label','Progresul intervenției'); card.append(progress);
 const list=el('ul',undefined,'project-checklist');
 for(const t of p.tasks) {const item=el('li',(t.done?'✅ ':'⬜ ')+t.title); if(t.completed_at) item.append(el('small','Finalizată: '+date(t.completed_at))); list.append(item);} card.append(list);
 if(p.invoice_url) {const a=el('a',p.invoice_label||'Descarcă factura','primary'); a.href=p.invoice_url; a.target='_blank'; a.rel='noopener noreferrer'; card.append(a);}
 if(p.review_url && p.completed_at && ['completed','closed'].includes(p.status)) {const review=el('section',undefined,'project-review'); review.append(el('h2','Mulțumit de serviciile Petru & Inés?'),el('p','⭐⭐⭐⭐⭐')); const a=el('a','Lasă-ne o recenzie pe Google','primary'); a.href=p.review_url; a.target='_blank'; a.rel='noopener noreferrer'; review.append(a); card.append(review);}
 card.append(el('p','Ultima actualizare: '+date(p.updated_at),'help')); root.append(card);
 for(const [kind,info] of [['access-policy',p.access_policy],['service-terms',p.service_terms]])if(info){
  const section=el('article',undefined,'project-card project-legal');section.dataset.card=kind;section.append(el('h2',info.title));const a=el('a','Citește documentul','secondary');a.href=info.url;a.target='_blank';a.rel='noopener noreferrer';section.append(a);root.append(section);
 }
 if(p.supplier){const section=el('article',undefined,'project-card project-supplier');section.dataset.card='supplier';section.append(el('h2','Informații despre furnizor'));const details=el('dl',undefined,'project-summary');
  for(const [label,key] of [['Servicii furnizate de','name'],['CUI','cui'],['Număr registrul comerțului','registration'],['Adresă','address'],['IBAN','iban'],['Banca','bank']])details.append(el('dt',label),el('dd',p.supplier[key]));section.append(details);root.append(section);
 }

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
