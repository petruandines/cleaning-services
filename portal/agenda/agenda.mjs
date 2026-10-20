import {readTabSession} from '../session.mjs';
import {dateKey,addDays,startOfWeek,monthMove,daysInMonth,eventsForRange,conflicts,createAgendaICS,safePhone,whatsappPhone} from './core.mjs';
const $=id=>document.getElementById(id);
const token=readTabSession(window),API=window.PETRU_INES_API_ORIGIN;
let state={view:'week',anchor:dateKey(new Date().toISOString()),appointments:[],projects:[],clients:[],locations:[],blocks:[],events:[],storage:false,selected:null,editing:null,busy:false,request:0};
const labelDay=key=>new Intl.DateTimeFormat('ro-RO',{weekday:'short',day:'numeric',month:'short',timeZone:'UTC'}).format(new Date(key+'T12:00:00Z'));
const labelMonth=key=>new Intl.DateTimeFormat('ro-RO',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(key+'T12:00:00Z'));
const el=(tag,txt,cls)=>{const n=document.createElement(tag);if(txt!==undefined)n.textContent=txt;if(cls)n.className=cls;return n;};
function notice(t){$('notice').textContent=t||'';$('notice').hidden=!t;}
function visibleRange(){
 const d=state.anchor;
 if(state.view==='month'){const first=d.slice(0,7)+'-01',start=startOfWeek(first);return {from:start,to:addDays(start,41)};}
 if(state.view==='week'){const from=startOfWeek(d);return {from,to:addDays(from,6)};}
 if(state.view==='day')return {from:d,to:d};
 return {from:addDays(d,-7),to:addDays(d,35)};
}
async function api(path,init={}){
 if(!token)throw new Error('Intră în portal ca administrator.');
 const response=await fetch(API+path,{...init,cache:'no-store',credentials:'omit',headers:{authorization:'Bearer '+token,...(init.body?{'content-type':'application/json'}:{})}});
 const data=await response.json().catch(()=>({}));
 if(!response.ok){if(response.status===401||response.status===403)throw new Error('Sesiunea administrativă a expirat sau nu are permisiunea necesară. Revino în portal.');throw new Error(data.error||('Eroare HTTP '+response.status));}
 return data;
}
async function pages(path,max=3000){
 const rows=[];let offset=0;
 for(let i=0;i<100;i++){
  const sep=path.includes('?')?'&':'?';
  const r=await api(path+sep+'offset='+offset);
  if(!Array.isArray(r.rows))throw new Error('Răspuns invalid la încărcarea agendei.');
  rows.push(...r.rows);
  if(rows.length>max)throw new Error('Prea multe înregistrări; este necesar un interval de încărcare mai mic.');
  if(r.nextOffset===null)return rows;
  if(!Number.isSafeInteger(r.nextOffset)||r.nextOffset<=offset)throw new Error('Paginarea a eșuat.');
  offset=r.nextOffset;
 }
 throw new Error('Limita paginării a fost depășită.');
}
async function refresh(){
 if(state.busy)return;
 state.busy=true;const ticket=++state.request;notice('Se încarcă programările…');
 try{
  const [appointments,projects,clients,locations]=await Promise.all([pages('/api/appointments'),pages('/api/one-time/admin',1200),pages('/api/clients'),pages('/api/locations')]);
  if(ticket!==state.request)return;
  state.appointments=appointments;state.projects=projects;state.clients=clients;state.locations=locations;
  try{
   const blocks=await api('/api/agenda/blocks');
   if(ticket!==state.request)return;
   state.blocks=blocks.rows||[];state.storage=true;
  }catch(e){state.blocks=[];state.storage=false;notice('Programările sunt vizibile, dar salvarea blocajelor este indisponibilă: '+e.message);}
  $('block-open').disabled=!state.storage;
  $('backup-blocks').disabled=!state.storage;
  render();
  if(state.storage)notice('');
 }catch(e){notice('Nu s-a putut încărca agenda: '+e.message);}
 finally{state.busy=false;}
}
function render(){
 const {from,to}=visibleRange();
 state.events=eventsForRange(state.appointments,state.projects,state.blocks,from,to,state.clients,state.locations);
 const root=$('calendar');root.replaceChildren();
 document.querySelectorAll('[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===state.view));
 $('period').textContent=state.view==='month'?labelMonth(state.anchor):state.view==='week'?labelDay(from)+' – '+labelDay(to):state.view==='day'?labelDay(state.anchor):'Agenda · '+labelDay(from)+' – '+labelDay(to);
 if(state.view==='month'){
  const grid=el('div',undefined,'agenda-month');
  for(const name of ['Lun','Mar','Mie','Joi','Vin','Sâm','Dum'])grid.append(el('div',name,'agenda-weekday'));
  for(let d=from;d<=to;d=addDays(d,1)){
   const cell=el('div',undefined,'agenda-month-cell');
   if(d.slice(0,7)!==state.anchor.slice(0,7))cell.classList.add('outside');
   if(d===dateKey(new Date().toISOString()))cell.classList.add('current');
   const top=el('button',d.slice(8),'agenda-day-number');top.type='button';top.addEventListener('click',()=>{state.anchor=d;state.view='day';render();});
   cell.append(top);
   const daily=state.events.filter(e=>e.start.slice(0,10)<=d&&e.end.slice(0,10)>=d);
   for(const event of daily.slice(0,4))cell.append(eventButton(event,true));
   if(daily.length>4)cell.append(el('small','+'+(daily.length-4)+' altele'));
   grid.append(cell);
  }root.append(grid);
 }else if(state.view==='week'){
  const grid=el('div',undefined,'agenda-week');
  for(let d=from;d<=to;d=addDays(d,1)){
   const col=el('section',undefined,'agenda-week-column');
   const heading=el('button',labelDay(d),'agenda-week-title');heading.type='button';heading.addEventListener('click',()=>{state.anchor=d;state.view='day';render();});col.append(heading);
   const daily=state.events.filter(e=>e.start.slice(0,10)<=d&&e.end.slice(0,10)>=d);
   if(!daily.length)col.append(el('small','—'));
   for(const e of daily)col.append(eventButton(e));
   grid.append(col);
  }root.append(grid);
 }else {
  const list=el('div',undefined,'agenda-list');
  for(let d=from;d<=to;d=addDays(d,1)){
   const daily=state.events.filter(e=>e.start.slice(0,10)<=d&&e.end.slice(0,10)>=d);
   if(!daily.length&&state.view!=='day')continue;
   const group=el('section',undefined,'agenda-list-day');
   group.append(el('h3',labelDay(d)));
   if(!daily.length)group.append(el('p','Nu sunt programări sau blocaje.'));
   for(const e of daily)group.append(eventButton(e));
   list.append(group);
  }root.append(list);
 }
 const bad=conflicts(state.events);
 $('calendar-note').textContent=(bad.length?('Atenție: '+bad.length+' suprapunere/suprapuneri între programări și blocaje. '):'')+'Intervențiile punctuale sunt afișate orientativ cu o durată de 3 ore (ora finalizării nu există în înregistrarea actuală).';
}
function eventButton(e,small=false){
 const b=el('button',undefined,'agenda-event '+(e.kind==='blocked'?'blocked':e.kind==='one-time'?'one':'recurring'));b.type='button';
 b.title=e.name+' · '+e.start.slice(11)+' – '+e.end.slice(11);
 b.append(el('span',e.allDay?'Zi întreagă':e.start.slice(11,16),'agenda-event-time'),el('span',small?e.name:e.service+' · '+e.name));
 b.addEventListener('click',()=>details(e));return b;
}
function hidePanels(){for(const id of ['details','block-form-panel','export-panel'])$(id).hidden=true;}
function addAction(parent,title,action,primary=false){const b=el('button',title,primary?'primary':'secondary');b.type='button';b.addEventListener('click',action);parent.append(b);return b;}
function details(event){
 state.selected=event;hidePanels();$('details').hidden=false;$('details-title').textContent=event.kind==='blocked'?'Perioadă blocată':event.service;
 const body=$('details-body');body.replaceChildren();
 for(const [name,val] of [['Nume',event.name],['Începe',event.start.replace('T',' ')],['Se încheie',event.end.replace('T',' ')+(event.approx?' (estimativ)':'')],['Status',event.status],['Adresă',event.address],['Telefon',event.phone],['Observații',event.notes]])if(val)body.append(el('p',name+': '+val));
 const actions=$('details-actions');actions.replaceChildren();
 if(event.kind==='blocked'){
  if(state.storage){
   addAction(actions,'Editează '+(event.repeat!=='none'?'această apariție':'blocajul'),()=>openBlock(event.repeat!=='none'?'occurrence':'edit',event));
   if(event.repeat!=='none')addAction(actions,'Editează seria',()=>openBlock('edit',event));
   if(event.repeat!=='none')addAction(actions,'Elimină această apariție',()=>removeOccurrence(event));
   addAction(actions,'Șterge '+(event.repeat!=='none'?'toată seria':'blocajul'),()=>removeBlock(event));
  }
 }else{
  if(event.address){
   addAction(actions,'Waze ↗',()=>window.open('https://waze.com/ul?q='+encodeURIComponent(event.address)+'&navigate=yes','_blank','noopener,noreferrer'));
   addAction(actions,'Hărți ↗',()=>window.open('https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(event.address),'_blank','noopener,noreferrer'));
  }
  if(safePhone(event.phone)){
   addAction(actions,'Apelează',()=>{window.location.href='tel:'+safePhone(event.phone);});
   addAction(actions,'WhatsApp ↗',()=>window.open('https://wa.me/'+whatsappPhone(event.phone),'_blank','noopener,noreferrer'));
  }
  addAction(actions,'Deschide intervenția',()=>{
   location.href=event.kind==='one-time'?'../projects/':'../';
  },true);
 }
 $('details').scrollIntoView({behavior:'smooth',block:'nearest'});
}
function openBlock(mode='create',event=null){
 if(!state.storage){notice('Salvarea blocajelor este indisponibilă.');return;}
 hidePanels();$('block-form-panel').hidden=false;state.editing={mode,event};
 $('block-title').textContent=mode==='create'?'Blochează interval':mode==='occurrence'?'Modifică doar această apariție':'Editează blocajul';
 const form=$('block-form');form.reset();
 if(event){
  const stored=state.blocks.find(b=>b.id===event.blockId);
  form.elements.title.value=mode==='edit'?stored.title:event.name;
  form.elements.start.value=mode==='edit'?stored.start:event.start;
  form.elements.end.value=mode==='edit'?stored.end:event.end;
  form.elements.all_day.checked=mode==='edit'?!!stored.all_day:!!event.allDay;
  form.elements.repeat.value=mode==='edit'?stored.repeat||'none':'none';
  form.elements.repeat_until.value=mode==='edit'?stored.repeat_until||'':'';
 }
 else {
  const start=state.anchor+'T09:00';form.elements.start.value=start;form.elements.end.value=state.anchor+'T12:00';
  form.elements.title.value='Indisponibil';
 }
 form.elements.repeat.disabled=mode==='occurrence';form.elements.repeat_until.disabled=mode==='occurrence';
 $('block-form-panel').scrollIntoView({behavior:'smooth',block:'start'});
}
function editableBlock(b){return {title:b.title,start:b.start,end:b.end,all_day:b.all_day,repeat:b.repeat,repeat_until:b.repeat_until||null,exceptions:b.exceptions||{},version:b.version};}
async function saveBlock(ev){
 ev.preventDefault();if(state.busy)return;
 const form=ev.currentTarget;const mode=state.editing?.mode||'create',event=state.editing?.event;
 const all_day=form.elements.all_day.checked;
 let start=form.elements.start.value,end=form.elements.end.value;
 if(all_day){start=start.slice(0,10)+'T00:00';end=end.slice(0,10)+'T23:59';}
 if(!start||!end||start>=end){notice('Intervalul de început trebuie să fie anterior celui de sfârșit.');return;}
 const repeat=mode==='occurrence'?'none':form.elements.repeat.value;
 if(repeat!=='none'&&start.slice(0,10)!==end.slice(0,10)){notice('Pentru un blocaj repetitiv, folosește un interval din aceeași zi.');return;}
 const data={title:form.elements.title.value.trim(),start,end,all_day,repeat,repeat_until:repeat==='none'?null:form.elements.repeat_until.value||null};
 if(!data.title){notice('Completează motivul blocării.');return;}
 if(data.repeat_until&&data.repeat_until<start.slice(0,10)){notice('Data până la care se repetă trebuie să fie ulterioară începutului.');return;}
 const proposed={start,end};
 const overlapping=state.events.filter(e=>e.kind!=='blocked'&&e.status!=='cancelled'&&proposed.start<e.end&&proposed.end>e.start);
 if(overlapping.length&&!confirm('Intervalul se suprapune cu '+overlapping.length+' programări vizibile. Salvezi blocajul fără a modifica programările?'))return;
 state.busy=true;$('block-save').disabled=true;
 try{
  let path='/api/agenda/blocks',method='POST',payload=data;
  if(event){
   const stored=state.blocks.find(b=>b.id===event.blockId);
   if(!stored)throw new Error('Blocajul nu mai este disponibil. Actualizează.');
   path+='/'+encodeURIComponent(stored.id);method='PATCH';
   if(mode==='occurrence'){
    payload={...editableBlock(stored),exceptions:{...stored.exceptions,[event.occurrence]:{title:data.title,start,end,all_day}}};
   }else payload={...data,version:stored.version,exceptions:stored.exceptions||{}};
  }
  await api(path,{method,body:JSON.stringify(payload)});
  hidePanels();notice('Blocajul a fost salvat.');state.busy=false;await refresh();
 }catch(error){notice('Blocajul nu a fost salvat: '+error.message);}
 finally{state.busy=false;$('block-save').disabled=false;}
}
async function removeOccurrence(event){
 if(!confirm('Elimini numai această apariție? Seria rămâne activă.'))return;
 const b=state.blocks.find(x=>x.id===event.blockId);if(!b)return;
 try{await api('/api/agenda/blocks/'+encodeURIComponent(b.id),{method:'PATCH',body:JSON.stringify({...editableBlock(b),exceptions:{...b.exceptions,[event.occurrence]:null}})});hidePanels();await refresh();}
 catch(e){notice('Apariția nu a fost eliminată: '+e.message);}
}
async function removeBlock(event){
 if(!confirm('Ștergi blocajul? Programările existente rămân neschimbate.'))return;
 const b=state.blocks.find(x=>x.id===event.blockId);if(!b)return;
 try{await api('/api/agenda/blocks/'+encodeURIComponent(b.id),{method:'DELETE',body:JSON.stringify({version:b.version})});hidePanels();await refresh();}
 catch(e){notice('Blocajul nu a fost șters: '+e.message);}
}
async function exportICS(ev){
 ev.preventDefault();const f=ev.currentTarget;
 const from=f.elements.from.value,to=f.elements.to.value,scope=f.elements.scope.value;
 if(!from||!to||from>to||Date.parse(to+'T12:00Z')-Date.parse(from+'T12:00Z')>366*86400000){notice('Selectează maximum 366 de zile pentru export.');return;}
 try{
  const events=eventsForRange(state.appointments,state.projects,state.blocks,from,to,state.clients,state.locations)
   .filter(e=>scope==='all'||(scope==='blocks'?(e.kind==='blocked'):(e.kind!=='blocked')));
  if(!events.length){notice('Nu există evenimente pentru perioada aleasă.');return;}
  const data=createAgendaICS(events,{includePrivate:f.elements.private.checked});
  const blob=new Blob([data],{type:'text/calendar;charset=utf-8'}),url=URL.createObjectURL(blob);
  const a=el('a');a.href=url;a.download='agenda-petru-ines-'+from+'-'+to+'.ics';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
  notice('Fișierul .ics a fost generat pentru '+events.length+' evenimente.');
 }catch(e){notice('Exportul nu a reușit: '+e.message);}
}
function move(step){
 state.anchor=state.view==='month'?monthMove(state.anchor,step):addDays(state.anchor,step*(state.view==='week'?7:state.view==='list'?35:1));render();
}
async function start(){
 if(!token){notice('Acces restricționat. Intră în portal cu contul de administrator.');return;}
 try{
  const me=await api('/api/me');
  if(me.role!=='staff'||me.twoFactorRequired||me.mustChangePassword){notice('Acces interzis. Agenda este disponibilă numai administratorului autentificat cu 2FA.');return;}
  $('app').hidden=false;
  for(const b of document.querySelectorAll('[data-view]'))b.addEventListener('click',()=>{state.view=b.dataset.view;render();});
  $('prev').addEventListener('click',()=>move(-1));$('next').addEventListener('click',()=>move(1));$('today').addEventListener('click',()=>{state.anchor=dateKey(new Date().toISOString());render();});
  $('refresh').addEventListener('click',refresh);$('block-open').addEventListener('click',()=>openBlock());
  $('backup-blocks').addEventListener('click',()=>{
    if(!state.storage)return;
    const body={format:'pi-agenda-blocks-v1',exported_at:new Date().toISOString(),blocks:state.blocks};
    const url=URL.createObjectURL(new Blob([JSON.stringify(body,null,2)],{type:'application/json'}));
    const a=el('a');a.href=url;a.download='agenda-blocaje-backup-'+new Date().toISOString().slice(0,10)+'.json';document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);
    notice('Copia JSON a blocajelor a fost descărcată. Păstreaz-o într-un loc privat.');
  });
  $('block-close').addEventListener('click',hidePanels);$('block-cancel').addEventListener('click',hidePanels);$('details-close').addEventListener('click',hidePanels);
  $('export-open').addEventListener('click',()=>{hidePanels();$('export-panel').hidden=false;const f=$('export-form');const range=visibleRange();f.elements.from.value=range.from;f.elements.to.value=range.to;});
  $('export-close').addEventListener('click',hidePanels);$('block-form').addEventListener('submit',saveBlock);$('export-form').addEventListener('submit',exportICS);
  await refresh();
 }catch(error){notice('Acces restricționat: '+error.message);}
}
start();