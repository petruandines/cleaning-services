import {el,date} from '../project-view.mjs';
export const reportErrors={report_unsupported_character:'Fontul raportului nu poate afișa un caracter din datele intervenției. Raportul nu a fost publicat.',report_not_configured:'Stocarea privată pentru rapoarte nu este încă configurată.',report_completion_required:'Raportul poate fi generat numai după finalizarea intervenției.',report_content_mismatch:'Documentul nu corespunde datelor verificate din portal. Reîncearcă generarea.',report_changed_reload:'Starea raportului s-a schimbat. Actualizează proiectul.',report_save_in_progress:'Salvarea este în curs sau necesită recuperare. Apasă din nou Reîncearcă generarea PDF.',report_delete_pending:'Ștergerea nu s-a încheiat. Reîncearcă ștergerea înainte de regenerare.',report_storage_unavailable:'Stocarea raportului nu este disponibilă. Intervenția rămâne finalizată. Reîncearcă ulterior.',report_unavailable:'Raportul nu mai este disponibil.',unsupported_character:'Fontul raportului nu poate afișa un caracter din datele intervenției. Raportul nu a fost publicat.'};
export async function downloadPDF(response) {
 if(!response.ok){const result=await response.json().catch(()=>({}));throw new Error(reportErrors[result.error]||'Raportul nu a putut fi descărcat. Actualizează pagina.');}
 const blob=await response.blob(),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download='Raport-interventie-Petru-Ines.pdf';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
}
export function reportController({call,token,notice,refresh,button}) {
 const raw=(id,suffix='',options={})=>fetch(window.PETRU_INES_API_ORIGIN+'/api/one-time/admin/'+encodeURIComponent(id)+'/report'+suffix,{credentials:'omit',cache:'no-store',headers:{authorization:'Bearer '+token,...options.headers},...options});
 async function generate(id,replace=false) {
  notice('Se generează raportul PDF. Păstrează pagina deschisă până la salvare.');
  try{
   const prepared=await call('/'+id+'/report',{operation:'prepare',replace,confirm:replace});
   if(!prepared.already_ready){
    const [{assemblePDF},resources]=await Promise.all([import('./pdf.mjs'),fetch(new URL('./resources.json',import.meta.url),{cache:'force-cache'}).then(r=>{if(!r.ok)throw new Error('Resursele raportului nu sunt disponibile.');return r.json();})]);
    const pdf=assemblePDF(prepared.recipe,resources);
    const response=await raw(id,'?ticket='+encodeURIComponent(prepared.ticket),{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/pdf'},body:pdf});
    if(!response.ok){const data=await response.json().catch(()=>({}));throw new Error(reportErrors[data.error]||'Salvarea raportului a eșuat. Apasă Reîncearcă generarea PDF.');}
   }
   await refresh(id);notice('Raportul PDF a fost salvat și este disponibil pentru descărcare.');
  }catch(e){await refresh(id).catch(()=>{});throw new Error(reportErrors[e.message]||e.message||'Generarea raportului a eșuat. Reîncearcă.');}
 }
 function render(parent,p,info){
  const box=el('section',undefined,'project-display-options');box.dataset.report='';box.append(el('h3','Raportul intervenției'));parent.append(box);
  if(!info?.configured){box.append(el('p','Rapoartele PDF necesită configurarea stocării private. Intervențiile funcționează în continuare.','help'));return;}
  const label=el('label',undefined,'task-editor'),check=el('input');check.type='checkbox';check.name='generate_report';check.checked=info.enabled;label.append(check,el('span','Generează raport PDF pentru client după finalizarea intervenției'));box.append(label);
  check.addEventListener('change',async()=>{check.disabled=true;try{await call('/'+p.id+'/report',{operation:'preference',enabled:check.checked});await refresh(p.id);}catch(e){check.checked=!check.checked;notice(e.message);}finally{check.disabled=false;}});
  const labels={none:'Raport PDF negenerat',pending:'Raport PDF în așteptare',saving:'Salvare în curs · poate necesita recuperare',ready:'Raport PDF disponibil',deleting:'Ștergere în așteptare · raportul nu poate fi descărcat',deleted:'Raport PDF șters',failed:'Generarea raportului PDF a eșuat'};
  box.append(el('p',labels[info.status]||labels.none));
  if(info.status==='ready'){box.append(el('p',`Versiunea ${info.version} · Generat: ${date(info.generated_at)} · ${(info.size_bytes/1024).toLocaleString('ro-RO',{maximumFractionDigits:1})} KB`));button('Descarcă raport PDF',()=>raw(p.id.replace(/[^\w-]/g,''),'-download').then(downloadPDF),box);}
  if(info.error)box.append(el('p',reportErrors[info.error]||'Raportul nu a putut fi salvat. Reîncearcă.','help'));
  if(['completed','closed'].includes(p.status)&&p.completed_at){
   if(info.status!=='deleting')button(['pending','saving','failed'].includes(info.status)?'Reîncearcă generarea PDF':info.status==='ready'||info.status==='deleted'?'Generează din nou raportul PDF':'Generează raport PDF',()=>{
    const replace=info.status==='ready';if(replace&&!confirm('Raportul existent va fi șters și înlocuit cu o versiune nouă din datele disponibile. Dacă generarea eșuează, poți reîncerca. Continui?'))return;return generate(p.id,replace);
   },box);
  }
  if(!['none','deleted','saving'].includes(info.status))button(info.status==='deleting'?'Reîncearcă ștergerea PDF':'Șterge raportul PDF',async()=>{
   if(!confirm('Sigur dorești să ștergi definitiv raportul PDF? Istoricul intervenției și informațiile sale vor fi păstrate. Documentul poate fi regenerat ulterior din datele disponibile.'))return;
   await call('/'+p.id+'/report',{operation:'delete',confirm:true,version:info.version});await refresh(p.id);notice('Raport PDF șters. Istoricul intervenției a fost păstrat.');
  },box);
 }
 return {render,generate};
}
