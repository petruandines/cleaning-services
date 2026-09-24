import {config,money,date,labels,isStaff,clientPayload,functionErrors,sections} from './domain.mjs';
export function startPortal(sdk,doc=document,win=window) {
 const $=id=>doc.getElementById(id);
 const client=new sdk.Client().setEndpoint(config.endpoint).setProject(config.project);
 const account=new sdk.Account(client),teams=new sdk.Teams(client),db=new sdk.TablesDB(client),functions=new sdk.Functions(client);
 let user=null,staff=false,section='appointments',page=0,loading=false,epoch=0,creating=false;
 const pageSize=20;
 function notify(text){$('notice').textContent=text;$('notice').hidden=!text;}
 function node(tag,text,cls){const el=doc.createElement(tag);if(text!==undefined)el.textContent=String(text);if(cls)el.className=cls;return el;}
 function loginView(){epoch++;user=null;staff=false;$('workspace').hidden=true;$('login-view').hidden=false;$('content').replaceChildren();$('tabs').replaceChildren();$('greeting').textContent='';$('account-label').textContent='';$('client-form').reset();if($('client-dialog').open)$('client-dialog').close();}
 function errorText(e){if(e?.code===429)return 'Prea multe încercări. Așteaptă puțin și încearcă din nou.';if(e?.code===401)return 'Sesiunea a expirat. Intră din nou în cont.';if(e?.code===403)return 'Nu ai permisiunea necesară pentru această acțiune.';return 'Nu am putut finaliza cererea. Verifică conexiunea și încearcă din nou.';}
 function pair(dl,key,value){if(value===undefined||value===null||value==='')return;dl.append(node('dt',key),node('dd',value));}
 function card(row){
  const el=node('article',undefined,'card');const status=row.status;
  if(status)el.append(node('span',labels[status]||status,'badge '+(Object.hasOwn(labels,status)?status:'')));
  const titles={clients:row.display_name,appointments:row.title,locations:row.name,invoices:row.invoice_number,interventions:'Intervenție · '+date(row.started_at),messages:row.sender_role==='staff'?'Petru & Inés':'Mesaj client',internal_notes:'Notă internă'};
  el.append(node('h3',titles[section]||'Detalii'));const dl=node('dl');
  if(section==='clients'){pair(dl,'Cod client',row.client_code);pair(dl,'E-mail',row.email);pair(dl,'Telefon',row.phone);pair(dl,'Tip',row.client_type);pair(dl,'Firmă',row.company_name);pair(dl,'CUI',row.cui);}
  if(section==='appointments'){pair(dl,'Începe',date(row.start_at));pair(dl,'Se încheie',date(row.end_at));pair(dl,'Observații',row.client_note);el.append(node('p',money(row.estimated_cost_bani),'amount'));}
  if(section==='interventions'){pair(dl,'Finalizată la',date(row.ended_at));pair(dl,'Durată',row.duration_minutes==null?null:row.duration_minutes+' minute');pair(dl,'Lucrare',row.work_summary);el.append(node('p',money(row.cost_bani),'amount'));}
  if(section==='invoices'){pair(dl,'Emisă',date(row.issue_date));pair(dl,'Scadență',date(row.due_date));el.append(node('p',money(row.total_bani),'amount'));}
  if(section==='locations'){pair(dl,'Adresă',row.address);pair(dl,'Localitate',row.city);pair(dl,'Județ',row.county);pair(dl,'Acces',row.access_details);}
  if(section==='messages'){pair(dl,'Data',date(row.$createdAt));pair(dl,'Mesaj',row.message);}
  if(section==='internal_notes'){pair(dl,'Data',date(row.$createdAt));pair(dl,'Notă',row.note);}
  if(staff&&row.client_id)pair(dl,'Referință client',row.client_id);
  el.append(dl);
  if(section==='invoices'&&row.file_id){const button=node('button','Descarcă PDF','secondary');button.type='button';button.addEventListener('click',()=>download(row,button));el.append(button);}
  return el;
 }
 async function download(row,button){
  const current=epoch;button.disabled=true;
  try{const {jwt}=await account.createJWT();
   const response=await win.fetch(config.endpoint+'/storage/buckets/'+config.bucket+'/files/'+encodeURIComponent(row.file_id)+'/download',{headers:{'X-Appwrite-Project':config.project,'X-Appwrite-JWT':jwt},cache:'no-store',redirect:'error'});
   if(!response.ok){const err=new Error();err.code=response.status;throw err;}
   const blob=await response.blob();if(current!==epoch)return;
   if(blob.type!=='application/pdf')throw new Error('invalid_file');
   const url=win.URL.createObjectURL(blob),a=node('a');a.href=url;a.download=(row.file_name||'factura.pdf').replace(/[\\/]/g,'_');doc.body.append(a);a.click();a.remove();win.setTimeout(()=>win.URL.revokeObjectURL(url),30000);
  }catch(e){if(current===epoch)notify(errorText(e));}finally{button.disabled=false;}
 }
 async function show(next=section,nextPage=0){
  if(!user)return;const current=++epoch;section=next;page=nextPage;loading=true;
  $('new-client').hidden=!(staff&&section==='clients');$('refresh').disabled=true;$('previous').hidden=true;$('next').hidden=true;$('page-label').textContent='';
  $('section-title').textContent=sections[section][0];$('section-description').textContent=staff?'Evidența echipei Petru & Inés.':sections[section][1];
  for(const b of $('tabs').children)b.setAttribute('aria-current',b.dataset.section===section?'page':'false');
  $('content').replaceChildren(node('p','Se încarcă…'));notify('');
  try{const result=await db.listRows({databaseId:config.database,tableId:section,queries:[sdk.Query.orderDesc('$createdAt'),sdk.Query.limit(pageSize),sdk.Query.offset(page*pageSize)]});
   if(current!==epoch)return;
   const rows=result.rows;
   if(!rows.length){const empty=node('div',undefined,'empty');empty.append(node('h3','Nu există înregistrări de afișat'),node('p',staff?'Înregistrările adăugate vor apărea aici.':'Îți vom afișa aici informațiile pe măsură ce colaborăm.'));$('content').replaceChildren(empty);}
   else{const list=node('div',undefined,'cards');list.append(...rows.map(card));$('content').replaceChildren(list);}
   $('page-label').textContent=result.total?`${page*pageSize+1}–${page*pageSize+rows.length} din ${result.total}`:'';$('previous').hidden=page===0;$('next').hidden=(page+1)*pageSize>=result.total;
  }catch(e){if(current!==epoch)return;$('content').replaceChildren();if(e.code===401)loginView();notify(errorText(e));}
  finally{if(current===epoch){loading=false;$('refresh').disabled=false;}}
 }
 async function authenticate(){
  const actor=await account.get();let access=false;
  try{access=isStaff(await teams.listMemberships({teamId:config.team,queries:[sdk.Query.equal('userId',actor.$id)]}),actor.$id);}catch(e){if(![401,403,404].includes(e.code))throw e;}
  user=actor;staff=access;$('login-view').hidden=true;$('workspace').hidden=false;$('greeting').textContent='Bun venit, '+(actor.name||'bine ai revenit')+'!';$('account-label').textContent=actor.email;$('role-label').textContent=staff?'Administrare · Petru & Inés':'Contul tău';
  const names=staff?['clients','appointments','interventions','invoices','locations','messages','internal_notes']:['appointments','interventions','invoices','locations','messages'];
  $('tabs').replaceChildren(...names.map(key=>{const b=node('button',sections[key][0]);b.dataset.section=key;b.type='button';b.addEventListener('click',()=>show(key));return b;}));await show(staff?'clients':'appointments');
 }
 $('login-form').addEventListener('submit',async event=>{event.preventDefault();const form=event.currentTarget,button=form.querySelector('button');button.disabled=true;notify('');try{const email=form.elements.email.value.trim();let password=form.elements.password.value;const request=account.createEmailPasswordSession({email,password});password='';form.elements.password.value='';await request;await authenticate();}catch(e){notify(e.code===401?'E-mailul sau parola nu sunt corecte.':errorText(e));}finally{button.disabled=false;}});
 $('logout').addEventListener('click',async()=>{if(creating)return;$('logout').disabled=true;try{await account.deleteSession({sessionId:'current'});loginView();notify('Ai ieșit din cont.');}catch(e){if(e.code===401)loginView();notify(errorText(e));}finally{$('logout').disabled=false;}});
 $('refresh').addEventListener('click',()=>{if(!loading)show(section,page);});$('previous').addEventListener('click',()=>show(section,Math.max(0,page-1)));$('next').addEventListener('click',()=>show(section,page+1));
 $('new-client').addEventListener('click',()=>{if(!staff)return;$('client-notice').textContent='';$('client-dialog').showModal();});
 $('close-dialog').addEventListener('click',()=>{if(!creating){$('client-form').reset();$('client-dialog').close();}});
 $('client-dialog').addEventListener('cancel',event=>{if(creating)event.preventDefault();else $('client-form').reset();});
 $('client-form').addEventListener('submit',async event=>{event.preventDefault();if(!staff||creating)return;const form=event.currentTarget;let data;
  try{data=clientPayload(new win.FormData(form));}catch(e){$('client-notice').textContent=e.message;return;}
  creating=true;const button=form.querySelector('button[type=submit]');button.disabled=true;$('client-notice').textContent='Se creează contul…';
  try{const execution=functions.createExecution({functionId:config.functionId,body:JSON.stringify(data),async:false,path:'/',method:sdk.ExecutionMethod.POST});data.password='';form.elements.password.value='';const result=await execution;
   if(result.status!=='completed')throw new Error('Crearea nu este confirmată. Verifică în Appwrite înainte de a reîncerca.');
   let body;try{body=JSON.parse(result.responseBody);}catch{throw new Error('Răspuns neașteptat. Verifică în Appwrite dacă utilizatorul a fost creat.');}
   if(result.responseStatusCode>=400)throw new Error((functionErrors[body.error]||'Crearea nu a fost confirmată. Verifică în Appwrite înainte de a reîncerca.')+(body.reference?' Referință: '+body.reference:''));
   form.reset();$('client-dialog').close();await show('clients');notify(body.already_exists?'Clientul exista deja. Parola lui a rămas neschimbată.':'Contul clientului a fost creat.');
  }catch(e){$('client-notice').textContent=e.code?errorText(e):e.message;}finally{data.password='';creating=false;button.disabled=false;}
 });
 const ready=authenticate().catch(e=>{loginView();if(e.code!==401)notify(errorText(e));});
 win.addEventListener('pageshow',event=>{if(event.persisted)win.location.reload();});
 return {ready};
}
