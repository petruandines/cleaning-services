import {renderProject,updateProjectClock} from '../project-view.mjs';
const $=id=>document.getElementById(id), token=new URL(location.href).searchParams.get('token');
let p=null,timer=null,busy=false,generation=0;
function notice(text) {$('notice').textContent=text;$('notice').hidden=!text;}
function clear() {p=null;$('project').replaceChildren();$('logout').hidden=true;}
async function call(action,data) {
 const response=await fetch(window.PETRU_INES_API_ORIGIN+'/api/one-time/client/'+token+'/'+action,{method:data?'POST':'GET',credentials:'include',cache:'no-store',headers:data?{'content-type':'application/json'}:{},...(data?{body:JSON.stringify(data)}:{})});
 const result=await response.json();if(!response.ok) {const e=new Error(result.error);e.status=response.status;throw e;}return result;
}
function failure(e) {
 if(e.status===401) {clear();$('login-panel').hidden=false;notice(e.message==='invalid_password'?'Parola nu este corectă.':'Introdu parola pentru a continua.');}
 else if([403,410,404].includes(e.status)) {clear();$('login-panel').hidden=true;clearInterval(timer);notice(e.status===410?'Accesul la această intervenție a expirat.':'Accesul la această intervenție nu este disponibil.');}
 else notice(e.status===429?'Prea multe încercări. Reîncearcă peste un minut.':'Nu am putut actualiza informațiile. Reîncercăm automat.');
}
async function refresh() {
 if(busy||document.hidden)return;busy=true;const sequence=generation;
 try {const next=await call('view');if(sequence!==generation)return;if(JSON.stringify(next)!==JSON.stringify(p))renderProject($('project'),next);p=next;$('login-panel').hidden=true;$('logout').hidden=false;notice('');}
 catch(e){if(sequence===generation)failure(e);}finally{busy=false;}
}
$('login-form').addEventListener('submit',async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{await call('login',{password:$('password').value,remember:$('remember').checked});$('password').value='';await refresh();if(!timer)timer=setInterval(refresh,15000);}catch(err){failure(err);}finally{b.disabled=false;}});
$('logout').addEventListener('click',async()=>{generation++;try{await call('logout',{});clear();$('login-panel').hidden=false;notice('Ai ieșit de pe acest dispozitiv.');}catch(e){failure(e);}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
setInterval(()=>{if(p)updateProjectClock($('project'));},1000);
(async()=>{if(/^[a-f0-9]{64}$/.test(token||'')){await refresh();timer=setInterval(refresh,15000);}else notice('Linkul de acces nu este valid.');})();
