// Browser-only A4 export; reuses audited report font/logo PDF engine.
import {assemblePDF} from '../reports/pdf.mjs';
const GREEN='0.086 0.518 0.165',INK='0.10 0.16 0.17',MUTED='0.38 0.45 0.44',BLUE='0.15 0.39 0.69',RED='0.68 0.22 0.22';
const TOP=671,BOTTOM=94,LEFT=43,RIGHT=553,DAY_HEIGHT=32,MAX_EVENTS=5000,DATE=/^\d{4}-\d{2}-\d{2}$/;
const dateFmt=new Intl.DateTimeFormat('ro-RO',{timeZone:'UTC',weekday:'long',day:'numeric',month:'long',year:'numeric'});
const shortFmt=new Intl.DateTimeFormat('ro-RO',{timeZone:'UTC',day:'numeric',month:'short',year:'numeric'});
const timeFmt=new Intl.DateTimeFormat('ro-RO',{timeZone:'Europe/Bucharest',dateStyle:'medium',timeStyle:'short'});
const typeLabel={'one-time':'Intervenție punctuală',recurring:'Programare recurentă',blocked:'Interval blocat'};
const stateLabel={draft:'Ciornă',scheduled:'Programată',confirmed:'Confirmată',requested:'Solicitată',in_progress:'În desfășurare',completed:'Finalizată',closed:'Închisă',cancelled:'Anulată',blocked:'Indisponibil'};
const prettyDate=value=>shortFmt.format(new Date(value+'T12:00:00Z'));
const dateLong=value=>dateFmt.format(new Date(value+'T12:00:00Z'));
const textSafe=value=>String(value??'').normalize('NFC').replace(/[\u0000-\u001f\u007f]/g,' ').replace(/\s+/gu,' ').trim();
const colorFor=kind=>kind==='one-time'?GREEN:kind==='blocked'?RED:BLUE;
export function reportRange(view,anchor,override){
 if(!DATE.test(anchor))throw new Error('invalid_anchor');
 if(override){
  if(!DATE.test(override.from)||!DATE.test(override.to)||override.from>override.to)throw new Error('invalid_report_range');
  const span=(Date.parse(override.to+'T12:00:00Z')-Date.parse(override.from+'T12:00:00Z'))/86400000;
  if(span>365)throw new Error('report_range_too_large');
  return {...override,view:'list'};
 }
 const offset=(key,diff)=>{const d=new Date(key+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+diff);return d.toISOString().slice(0,10);};
 if(view==='day')return {from:anchor,to:anchor,view};
 if(view==='week'){const weekday=(new Date(anchor+'T12:00:00Z').getUTCDay()+6)%7;return {from:offset(anchor,-weekday),to:offset(anchor,6-weekday),view};}
 if(view==='month'){const from=anchor.slice(0,7)+'-01',y=+anchor.slice(0,4),m=+anchor.slice(5,7);return {from,to:new Date(Date.UTC(y,m,0)).toISOString().slice(0,10),view};}
 if(view==='list')return {from:offset(anchor,-7),to:offset(anchor,35),view};
 throw new Error('invalid_view');
}
export function filterReportEvents(events,range,{includeBlocks=false,includeCancelled=false}={}){
 if(!Array.isArray(events)||events.length>MAX_EVENTS)throw new Error('report_too_many_events');
 const {from,to}=range;
 if(!DATE.test(from)||!DATE.test(to)||from>to)throw new Error('invalid_report_range');
 return events.filter(e=>e&&typeof e.start==='string'&&typeof e.end==='string'&&
  (includeBlocks||e.kind!=='blocked')&&(includeCancelled||e.status!=='cancelled')&&
  e.start.slice(0,10)<=to&&e.end.slice(0,10)>=from)
  .slice().sort((a,b)=>a.start.localeCompare(b.start)||String(a.id).localeCompare(String(b.id)));
}
export function createAgendaPDFRecipe(events,resources,{from,to,view='list',includeContacts=true,includeNotes=false,includeBlocks=false,generatedAt=new Date()}={}){
 if(!resources?.glyphs||!resources.logoWidth||!resources.logoHeight)throw new Error('pdf_resources_missing');
 if(!DATE.test(from)||!DATE.test(to)||from>to)throw new Error('invalid_report_range');
 if(events.length>MAX_EVENTS)throw new Error('report_too_many_events');
 const glyphs=resources.glyphs;
 const has=c=>!!glyphs[c.codePointAt(0)];
 const safe=value=>[...textSafe(value)].map(c=>has(c)?c:'?').join('');
 const width=(str,size)=>[...str].reduce((sum,c)=>sum+(glyphs[c.codePointAt(0)]?.[1]||600)*size/1000,0);
 function wrap(value,size,maxWidth=480){
  const result=[],v=safe(value);
  if(!v)return [''];
  let line='';
  for(const word of v.split(' ')){
   if(line&&width(line+' '+word,size)>maxWidth){result.push(line);line='';}
   let chunk='';
   for(const chr of word){
    if(width(chunk+chr,size)>maxWidth&&chunk){
     if(line){result.push(line);line='';}
     result.push(chunk);chunk='';
    }
    chunk+=chr;
   }
   if(chunk)line+=(line?' ':'')+chunk;
  }
  if(line)result.push(line);
  return result.length?result:[''];
 }
 const pages=[];let page,y;
 const addText=(value,x,py,size=9,color=INK)=>page.push({kind:'text',value:safe(value),x,y:py,size,color});
 const addLine=(py,x=LEFT,w=RIGHT-LEFT)=>page.push({kind:'line',x,y:py,w});
 const duration=from===to?prettyDate(from):prettyDate(from)+' – '+prettyDate(to);
 const heading=view==='month'?'AGENDA LUNARĂ':view==='week'?'AGENDA SĂPTĂMÂNALĂ':view==='day'?'AGENDA ZILNICĂ':'AGENDA PROGRAMĂRILOR';
 function newPage(){
  page=[];pages.push(page);
  page.push({kind:'logo',x:LEFT,y:769,w:92,h:92*resources.logoHeight/resources.logoWidth});
  addText('PETRU & INÉS',343,799,12,GREEN);
  addText('Servicii profesionale de curățenie',343,783,8,MUTED);
  addLine(754);
  addText(heading,LEFT,725,19,GREEN);
  addText(duration,LEFT,705,10,INK);
  addLine(690);
  y=TOP;
 }
 function dayHeader(day){
  addText(dateLong(day).toLocaleUpperCase('ro-RO'),LEFT,y-12,10,GREEN);
  addLine(y-19);y-=DAY_HEIGHT;
 }
 const drawRows=(lines,{continuation=false}={})=>{
  addLine(y,LEFT+6,RIGHT-LEFT-12);
  y-=12;
  if(continuation){addText('CONTINUARE A ACELEIAȘI PROGRAMĂRI',LEFT+12,y,7,MUTED);y-=15;}
  for(const item of lines){addText(item.text,LEFT+12,y,item.size,item.color);y-=item.h;}
  y-=9;addLine(y,LEFT+6,RIGHT-LEFT-12);y-=13;
 };
 const rowsHeight=(lines,continuation=false)=>12+(continuation?15:0)+lines.reduce((a,r)=>a+r.h,0)+22;
 function eventRows(e){
  const result=[];
  const push=(value,{size=9,color=INK,h=15,maxWidth=482}={})=>{
   for(const line of wrap(value,size,maxWidth))result.push({text:line,size,color,h});
  };
  const label=e.kind==='blocked'?'INDISPONIBIL':typeLabel[e.kind]||'PROGRAMARE';
  const time=e.allDay?'Toată ziua':
    e.kind==='blocked'&&e.start.slice(0,10)!==e.end.slice(0,10)?'Mai multe zile':
    e.start.slice(11,16)+(e.approx?' · ora finalizării neconfirmată':e.end&&e.end.slice(11,16)!==e.start.slice(11,16)?' – '+e.end.slice(11,16):'');
  push(label+'   |   '+time,{size:9,color:colorFor(e.kind),h:17});
  push(e.kind==='blocked'?(e.name||'Indisponibil'):(e.service||label),{size:11,color:INK,h:18});
  if(e.kind!=='blocked'&&e.name)push('Client: '+e.name,{size:9,h:15});
  if(e.start.slice(0,10)!==e.end.slice(0,10))push('Perioadă: '+prettyDate(e.start.slice(0,10))+' – '+prettyDate(e.end.slice(0,10)),{size:9,h:15});
  if(e.kind!=='blocked')push('Status: '+(stateLabel[e.status]||e.status||'—'),{size:8,color:MUTED,h:15});
  if(e.kind!=='blocked'&&includeContacts){
   if(e.address)push('Adresă: '+e.address,{size:9,h:15});
   if(e.phone)push('Telefon: '+e.phone,{size:9,h:15});
  }
  if(includeNotes&&e.kind!=='blocked'&&e.notes)push('Observații: '+e.notes,{size:9,h:15});
  return result;
 }
 newPage();
 const one=events.filter(e=>e.kind==='one-time').length,rec=events.filter(e=>e.kind==='recurring').length,blocked=events.filter(e=>e.kind==='blocked').length;
 addText('SITUAȚIA PROGRAMĂRILOR · EUROPE/BUCHAREST',LEFT,y-3,8,MUTED);y-=22;
 addText(String(one+rec)+' intervenții  |  '+one+' punctuale  |  '+rec+' recurente'+(includeBlocks?'  |  '+blocked+' blocaje':''),LEFT,y,9,INK);y-=31;
 if(!events.length){
  addText('Nu există programări în intervalul selectat.',LEFT,y,11,INK);
 }else{
  let currentDay='',shownOnPage='';
  for(const event of events){
   const day=event.start.slice(0,10)<from?from:event.start.slice(0,10);
   const lines=eventRows(event);
   let i=0,continuation=false;
   while(i<lines.length){
    const needsHeader=currentDay!==day||shownOnPage!==String(pages.length);
    const headerH=needsHeader?DAY_HEIGHT:0;
    const left=lines.slice(i),currentHeight=rowsHeight(left,continuation);
    if(currentHeight+headerH>y-BOTTOM && currentHeight+DAY_HEIGHT<=TOP-BOTTOM){
     newPage();shownOnPage='';continue;
    }
    const freshHeader=currentDay!==day||shownOnPage!==String(pages.length);
    if(freshHeader){
     if(y-DAY_HEIGHT-75<BOTTOM){newPage();shownOnPage='';continue;}
     dayHeader(day);currentDay=day;shownOnPage=String(pages.length);
    }
    const available=y-BOTTOM;
    if(currentHeight<=available){drawRows(left,{continuation});i=lines.length;break;}
    const overhead=rowsHeight([],continuation);
    let count=0,used=overhead;
    for(const row of left){if(used+row.h>available)break;used+=row.h;count++;}
    if(count<3){newPage();shownOnPage='';continue;}
    drawRows(left.slice(0,count),{continuation});
    i+=count;continuation=true;
    newPage();shownOnPage='';
   }
  }
 }
 const timestamp=timeFmt.format(generatedAt instanceof Date?generatedAt:new Date(generatedAt));
 for(let n=0;n<pages.length;n++){
  page=pages[n];addLine(72);
  addText('Document administrativ privat · Petru & Inés',LEFT,56,7,MUTED);
  addText('Generat: '+timestamp,LEFT,43,7,MUTED);
  addText('Pagina '+(n+1)+' / '+pages.length,485,49,8,INK);
 }
 return {version:1,pages};
}
export function generateAgendaPDF(events,resources,options){
 return assemblePDF(createAgendaPDFRecipe(events,resources,options),resources);
}
