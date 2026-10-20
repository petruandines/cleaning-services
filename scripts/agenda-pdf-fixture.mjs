import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {reportRange,createAgendaPDFRecipe,generateAgendaPDF} from '../portal/agenda/pdf.mjs';
const resources=JSON.parse(readFileSync(new URL('../portal/reports/resources.json',import.meta.url),'utf8'));
const out=new URL('../.agenda-pdf-fixtures/',import.meta.url);
mkdirSync(out,{recursive:true});
const date=(day)=>'2026-10-'+String(day).padStart(2,'0');
const entry=(n,day)=>({
 id:'point-'+n,kind:n%3===0?'recurring':'one-time',status:n%4===0?'completed':'confirmed',
 approx:n%3!==0,allDay:false,start:date(day)+'T0'+(6+(n%3))+':00',end:date(day)+'T11:00',
 name:'Client demonstrativ '+String(n).padStart(3,'0'),
 service:n%3===0?'Întreținere magazin comercial':'Curățenie generală Deep Clean',
 phone:'+40700000000',address:'Bulevardul Exemplu '+n+', București Sector '+(n%6+1),
 notes:n===13?('Notă foarte lungă de test pentru verificarea paginării. ').repeat(160):'Verificare completă, ferestre și mobilier.',
});
const all=Array.from({length:80},(_,n)=>entry(n,1+n%24)).sort((a,b)=>a.start.localeCompare(b.start));
const scenarios=[
 {name:'luna-completa',events:all,options:{...reportRange('month','2026-10-21'),includeNotes:false}},
 {name:'saptamana',events:all.filter(e=>e.start.slice(0,10)>='2026-10-19'&&e.start.slice(0,10)<='2026-10-25'),options:{...reportRange('week','2026-10-21'),includeNotes:true}},
 {name:'zi',events:all.filter(e=>e.start.slice(0,10)==='2026-10-21'),options:{...reportRange('day','2026-10-21'),includeNotes:true}},
 {name:'note-lungi',events:all.filter(e=>e.id==='point-13'),options:{...reportRange('month','2026-10-21'),includeNotes:true}}
];
for(const scenario of scenarios){
 const recipe=createAgendaPDFRecipe(scenario.events,resources,{...scenario.options,includeContacts:true,generatedAt:new Date('2026-10-21T08:00:00Z')});
 const binary=generateAgendaPDF(scenario.events,resources,{...scenario.options,includeContacts:true,generatedAt:new Date('2026-10-21T08:00:00Z')});
 writeFileSync(new URL(scenario.name+'.pdf',out),binary);
 if(!recipe.pages.length||!binary.length)throw Error('empty pdf fixture');
 console.log(scenario.name+': '+scenario.events.length+' records, '+recipe.pages.length+' A4 pages, '+binary.length+' bytes');
}
