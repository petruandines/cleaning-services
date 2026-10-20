import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {reportRange,filterReportEvents,createAgendaPDFRecipe,generateAgendaPDF} from '../../portal/agenda/pdf.mjs';

const resources=JSON.parse(readFileSync(new URL('../../portal/reports/resources.json',import.meta.url),'utf8'));
const normal=(i,day='2026-10-21')=>({
 id:'project:'+i,kind:'one-time',status:'confirmed',approx:true,
 start:day+'T07:00',end:day+'T10:00',
 name:'Client de test '+String(i).padStart(3,'0'),
 service:'Curățenie generală Deep Clean în București · 3 camere',
 address:'Strada Exemplu Nr. 20, Sector 2, București',
 phone:'+40700000000',notes:'Geamuri, mobilier, baie și bucătărie. Confirmat telefonic.'
});
const emptyConfig={from:'2026-10-01',to:'2026-10-31',view:'month',generatedAt:new Date('2026-10-21T09:00:00Z')};
test('periods reflect exact month, Monday-Sunday week, day and selectable list, including DST boundary',()=>{
 assert.deepEqual(reportRange('month','2026-10-25'),{from:'2026-10-01',to:'2026-10-31',view:'month'});
 assert.deepEqual(reportRange('week','2026-10-25'),{from:'2026-10-19',to:'2026-10-25',view:'week'});
 assert.deepEqual(reportRange('day','2026-10-25'),{from:'2026-10-25',to:'2026-10-25',view:'day'});
 assert.deepEqual(reportRange('list','2026-10-21',{from:'2026-09-01',to:'2026-10-21'}),{from:'2026-09-01',to:'2026-10-21',view:'list'});
 assert.throws(()=>reportRange('list','2026-10-21',{from:'2026-01-01',to:'2027-11-01'}),/too_large/);
});
test('PDF list is stable chronological and excludes cancellations/blocked times by default',()=>{
 const rows=[
 {...normal('B','2026-10-25'),status:'cancelled'},
 {...normal('A','2026-10-21')},
 {id:'block:1',kind:'blocked',status:'blocked',start:'2026-10-23T00:00',end:'2026-10-23T23:59',allDay:true,name:'Zile personale'},
 {...normal('C','2026-10-24'),kind:'recurring',service:'Programare recurentă'}
 ];
 const filtered=filterReportEvents(rows,emptyConfig);
 assert.deepEqual(filtered.map(e=>e.id),['project:A','project:C']);
 assert.equal(filterReportEvents(rows,emptyConfig,{includeBlocks:true,includeCancelled:true}).length,4);
});
test('long names, addresses and descriptions are fully laid out within the A4 safe area, with continuation only between lines',()=>{
 const data=Array.from({length:45},(_,i)=>normal(i,'2026-10-'+String(1+Math.floor(i/4)).padStart(2,'0')));
 data[8].notes=('Acces controlat – etajul 5, detalii intervenție. ').repeat(300);
 data[12].address=('Strada cu denumire foarte lungă din București ').repeat(35);
 const recipe=createAgendaPDFRecipe(data,resources,{...emptyConfig,includeNotes:true});
 assert.ok(recipe.pages.length>3);
 const texts=recipe.pages.flatMap(p=>p.filter(o=>o.kind==='text'));
 const combined=texts.map(o=>o.value).join(' ');
 for(let i=0;i<data.length;i++)assert.equal(texts.filter(o=>o.value.includes('Client de test '+String(i).padStart(3,'0'))).length,1,'client must appear exactly once');
 assert.match(combined,/CONTINUARE A ACELEIAȘI PROGRAMĂRI/);
 for(const page of recipe.pages){
  const header=page.filter(x=>x.kind==='text'&&x.value==='PETRU & INÉS');
  const footer=page.filter(x=>x.kind==='text'&&x.value.startsWith('Pagina '));
  assert.equal(header.length,1);assert.equal(footer.length,1);
  for(const op of page){
   if(op.kind!=='text')continue;
   assert.ok(op.y>=43&&op.y<=810,'text within printable page: '+op.value.slice(0,32)+' @'+op.y);
  }
  // Chronological card text in the content area may never enter footer.
  for(const op of page.filter(x=>x.kind==='text'&&x.x===55))assert.ok(op.y>=94,'card text in bottom margin');
 }
});
test('A4 PDF is a downloadable valid binary with company logo and embedded text, no client portal tokens',()=>{
 const events=[normal(1),normal(2)];
 const bytes=generateAgendaPDF(events,resources,{...emptyConfig});
 assert.ok(bytes instanceof Uint8Array);
 const raw=Buffer.from(bytes);
 assert.match(raw.subarray(0,30).toString('latin1'),/%PDF-1.7/);
 assert.match(raw.subarray(-40).toString('latin1'),/%%EOF/);
 assert.ok(bytes.length>25000);
 const joined=JSON.stringify(createAgendaPDFRecipe(events,resources,emptyConfig));
 assert.doesNotMatch(joined,/token=|password=|Bearer |invoice_url/);
});
test('empty period produces a coherent one-page report without cutting or empty calendar table',()=>{
 const recipe=createAgendaPDFRecipe([],resources,emptyConfig);
 assert.equal(recipe.pages.length,1);
 assert.ok(recipe.pages[0].some(x=>x.kind==='text'&&x.value.includes('Nu există programări')));
 assert.ok(recipe.pages[0].some(x=>x.kind==='text'&&x.value==='Pagina 1 / 1'));
});
