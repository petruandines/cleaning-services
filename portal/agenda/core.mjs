import {bucharestISO} from '../project-view.mjs';

export const zone='Europe/Bucharest';
const dayFormat=new Intl.DateTimeFormat('sv-SE',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'});
const timeFormat=new Intl.DateTimeFormat('en-GB',{timeZone:zone,hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
export const dateKey=iso=>dayFormat.format(new Date(iso));
export const clock=iso=>timeFormat.format(new Date(iso));
export const localStamp=iso=>dateKey(iso)+'T'+clock(iso);
export const addDays=(key,days)=>{const date=new Date(key+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10);};
export const startOfWeek=key=>{const date=new Date(key+'T12:00:00Z');return addDays(key,-((date.getUTCDay()+6)%7));};
export const daysInMonth=key=>new Date(Date.UTC(Number(key.slice(0,4)),Number(key.slice(5,7)),0)).getUTCDate();
export const monthMove=(key,delta)=>{const date=new Date(key.slice(0,7)+'-01T12:00:00Z');date.setUTCMonth(date.getUTCMonth()+delta);return date.toISOString().slice(0,7)+'-01';};
export const safePhone=value=>{const p=String(value||'').replace(/[\s().-]/g,'');if(!/^\+?\d{9,15}$/.test(p))return '';return p.startsWith('0')?'+4'+p:p;};
export const whatsappPhone=value=>safePhone(value).replace(/^\+/,'');
export function recurringRows(block,from,to){
 if(!block || !/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(block.start)||!/^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(block.end))return [];
 const anchor=block.start.slice(0,10), startMinute=block.start.slice(11),endMinute=block.end.slice(11);
 const repeats=block.repeat||'none',limit=block.repeat_until&&block.repeat_until<to?block.repeat_until:to;
 const results=[];let cursor=repeats==='none'?anchor:anchor;
 // Day arithmetic at 12:00 UTC avoids shifting local dates at DST transitions.
 for(let iterations=0;iterations<3700 && cursor<=limit;iterations++,cursor=addDays(cursor,1)){
  if(cursor<anchor||cursor<from)continue;
  const delta=Math.round((Date.parse(cursor+'T12:00Z')-Date.parse(anchor+'T12:00Z'))/86400000);
  const valid=repeats==='none'?delta===0:repeats==='daily'?true:repeats==='weekly'?delta%7===0:repeats==='monthly'?cursor.slice(8)===anchor.slice(8):false;
  if(!valid)continue;
  results.push({id:'block:'+block.id+':'+cursor,source:'block',name:block.title||'Indisponibil',start:cursor+'T'+startMinute,end:cursor+'T'+endMinute,allDay:!!block.all_day,kind:'blocked',status:'blocked',blockId:block.id,version:block.version,repeat:repeats});
 }
 return results;
}
export function eventsForRange(appointments,projects,blocks,from,to,clients=[],locations=[]){
 const phones=new Map(clients.map(c=>[c.id,c.phone]));
 const locationMap=new Map(locations.map(l=>[l.id,l]));
 const events=[];
 for(const a of appointments){
  if(!a?.starts_at||!Number.isFinite(Date.parse(a.starts_at)))continue;
  const location=locationMap.get(a.location_id),start=localStamp(a.starts_at);
  events.push({id:'appointment:'+a.id,source:'appointment',sourceId:a.id,name:a.client_name||'Programare',kind:'recurring',status:a.status||'confirmed',start,end:a.ends_at&&Number.isFinite(Date.parse(a.ends_at))?localStamp(a.ends_at):start,allDay:false,phone:location?.contact_phone||phones.get(a.client_id)||'',address:[a.location_address,location?.city||location?.county].filter(Boolean).join(', '),notes:a.client_note||'',service:'Programare recurentă',approx:false});
 }
 for(const p of projects){
  if(!p?.scheduled_at||!Number.isFinite(Date.parse(p.scheduled_at)))continue;
  const start=localStamp(p.scheduled_at);
  const estimatedEnd=localStamp(new Date(Date.parse(p.scheduled_at)+3*3600000).toISOString());
  events.push({id:'project:'+p.id,source:'project',sourceId:p.id,name:p.client_name||p.name||'Intervenție punctuală',kind:'one-time',status:p.status||'scheduled',start,end:estimatedEnd,allDay:false,phone:p.phone||'',address:p.location||'',notes:p.description||'',service:p.name||'Intervenție punctuală',approx:true});
 }
 for(const b of blocks)events.push(...recurringRows(b,from,to));
 return events.filter(e=>e.start.slice(0,10)<=to && e.end.slice(0,10)>=from).sort((a,b)=>a.start.localeCompare(b.start)||a.id.localeCompare(b.id));
}
export function overlaps(event,other){return event.start<other.end&&event.end>other.start;}
export function conflicts(events){return events.filter(e=>e.kind!=='blocked'&&e.status!=='cancelled').flatMap(e=>events.filter(b=>b.kind==='blocked'&&overlaps(e,b)).map(b=>({event:e,block:b})));}
const clean=text=>String(text??'').replace(/\\/g,'\\\\').replace(/\r\n|\r|\n/g,'\\n').replace(/,/g,'\\,').replace(/;/g,'\\;');
const utc=value=>new Date(value).toISOString().replace(/[-:]/g,'').replace(/\.\d{3}/,'');
const stamp=value=>utc(bucharestISO(value));
function fold(line){const result=[];let size=0,part='';for(const char of line){const n=new TextEncoder().encode(char).length;if(size+n>75){result.push(part);part=' ';size=1;}part+=char;size+=n;}result.push(part);return result.join('\r\n');}
export function createAgendaICS(events,{includePrivate=false,now=new Date()}={}){
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Petru & Ines//Agenda//RO','CALSCALE:GREGORIAN','METHOD:PUBLISH','X-WR-CALNAME:Agenda Petru & Inés'];
 for(const e of events){
  if(e.status==='cancelled')continue;
  const uid=clean(e.id)+'@petruandines.com';
  lines.push('BEGIN:VEVENT','UID:'+uid,'DTSTAMP:'+utc(now));
  if(e.allDay){lines.push('DTSTART;VALUE=DATE:'+e.start.slice(0,10).replace(/-/g,''),'DTEND;VALUE=DATE:'+addDays(e.end.slice(0,10),1).replace(/-/g,''));}
  else {lines.push('DTSTART:'+stamp(e.start),'DTEND:'+stamp(e.end>e.start?e.end:e.start.slice(0,10)+'T23:59'));}
  lines.push('SUMMARY:'+clean(e.kind==='blocked'?'Indisponibil':includePrivate?e.service+' · '+e.name:e.service),'TRANSP:OPAQUE','STATUS:CONFIRMED');
  if(includePrivate&&e.kind!=='blocked'){if(e.address)lines.push('LOCATION:'+clean(e.address));if(e.notes)lines.push('DESCRIPTION:'+clean(e.notes));}
  lines.push('END:VEVENT');
 }
 lines.push('END:VCALENDAR');
 return lines.map(fold).join('\r\n')+'\r\n';
}
