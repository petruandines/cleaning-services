// Narrow deterministic A4 template. No executable PDF actions, attachments, HTML,
// raster text, network calls, random IDs, device locale or device time zone.
const enc = new TextEncoder();
const bytes = text => enc.encode(text);
const unbase = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));
const concat = parts => {const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let at=0;for(const p of parts){out.set(p,at);at+=p.length;}return out;};
const hex = n => n.toString(16).padStart(4,'0').toUpperCase();
const date = value => value ? new Intl.DateTimeFormat('ro-RO',{timeZone:'Europe/Bucharest',dateStyle:'medium',timeStyle:'short'}).format(new Date(value)) : 'Neînregistrată';
const money = value => value===null||value===undefined?'Neînregistrat':new Intl.NumberFormat('ro-RO',{minimumFractionDigits:2,maximumFractionDigits:2}).format(value/100)+' lei';
const duration = value => {const seconds=Math.floor(value/1000);return `${Math.floor(seconds/3600)} h ${Math.floor(seconds/60)%60} min ${seconds%60} s`;};
function clean(text) {return String(text).normalize('NFC').replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g,'').replaceAll('\t',' ');}
export function createRecipe(s,r) {
 const pages=[];let page,y;
 const glyph = c => {const g=r.glyphs[c.codePointAt(0)];if(!g)throw new Error('unsupported_character');return g;};
 const width=(text,size)=>{let n=0;for(const c of text)n+=glyph(c)[1];return n*size/1000;};
 function lines(text,size,max) {
  const result=[];
  for(const paragraph of clean(text).split('\n')) {
   let line='',lineWidth=0;const space=width(' ',size);
   for(const word of paragraph.split(/\s+/u).filter(Boolean)) {
    const wordWidth=width(word,size),joined=line?line+' '+word:word;
    if(lineWidth+(line?space:0)+wordWidth<=max){line=joined;lineWidth+=(lineWidth?space:0)+wordWidth;continue;}
    if(line){result.push(line);line='';lineWidth=0;}
    if(wordWidth<=max){line=word;lineWidth=wordWidth;continue;}
    let segment='',segmentWidth=0;for(const c of word){const w=glyph(c)[1]*size/1000;if(segment&&segmentWidth+w>max){result.push(segment);segment='';segmentWidth=0;}segment+=c;segmentWidth+=w;}line=segment;lineWidth=segmentWidth;
   }
   result.push(line);
  }return result;
 }
 const text=(value,x,at,size=10,color='0.09 0.13 0.14')=>page.push({kind:'text',value:clean(value),x,y:at,size,color});
 function next() {
  page=[];pages.push(page);page.push({kind:'logo',x:42,y:760,w:108,h:108*r.logoHeight/r.logoWidth});
  text('PETRU & INÉS',355,795,12,'0.086 0.518 0.165');text('Servicii profesionale de curățenie',355,779,8);
  page.push({kind:'line',x:42,y:751,w:511});y=724;
 }
 const reserve=h=>{if(y-h<85)next();};
 function paragraph(value,size=10,indent=0,color) {
  for(const line of lines(value,size,511-indent)){reserve(size+7);text(line,42+indent,y,size,color);y-=size+6;}y-=4;
 }
 function section(title){reserve(55);y-=10;paragraph(title,13,0,'0.086 0.518 0.165');y-=2;}
 next();paragraph('RAPORT DE INTERVENȚIE',22);paragraph('Petru & Inés — Servicii profesionale de curățenie',10);paragraph(`Versiunea ${s.report_version} · Generat: ${date(s.generated_at)}`,8);
 section('Identificarea intervenției');
 for(const [label,value] of [['Identificator',s.id],['Proiect',s.name],['Client',s.client_name],...(s.location?[['Adresă',s.location]]:[]),['Programare',date(s.scheduled_at)],['Finalizare',date(s.completed_at)],['Status','Intervenție finalizată']])paragraph(label+': '+value);
 if(s.description){section('Descrierea lucrării');paragraph(s.description);}
 section('Activități planificate și lucrări efectuate');
 let n=0;
 for(const t of s.tasks) {
  const activity=lines(`${++n}. ${t.title}`,10,370),height=Math.max(1,activity.length)*16+14;
  reserve(height);const top=y;
  for(const line of activity){text(line,48,y);y-=16;}
  text(t.done?'Finalizată':'Nefinalizată',435,top,9,t.done?'0.086 0.518 0.165':'0.36 0.40 0.38');
  y-=2;page.push({kind:'line',x:42,y,w:511});y-=12;
 }
 if(!s.tasks.length)paragraph('Nu există sarcini înregistrate.');
 section('Cronologia intervenției · Europe/Bucharest');
 if(s.started_at)paragraph('Început: '+date(s.started_at));
 paragraph('Sfârșit: '+date(s.completed_at));paragraph('Confirmarea finalizării: '+date(s.completed_at));
 if(s.started_at)paragraph('Durata efectivă: '+duration(s.duration_ms));
 reserve(175);section('Informații financiare');
 if(s.billing.mode==='hourly') {
  paragraph('Tarif pe oră: '+money(s.billing.rate_bani));paragraph('Durata tarifabilă: '+duration(s.billing.elapsed_ms));
  paragraph('Minimum contractual: '+money(s.billing.minimum_bani));
  if(s.billing.minimum_agreement)paragraph('Referință acord: '+s.billing.minimum_agreement);
  paragraph('Totalul este preluat din calculul portalului: tarif × durata, cu aplicarea minimumului contractual.',9);
 }else paragraph('Tarif convenit: '+money(s.price_bani));
 paragraph('TOTAL FINAL: '+money(s.billing.total_bani),15,0,'0.086 0.518 0.165');
 paragraph('Acest raport este informativ și nu reprezintă o factură fiscală sau un proces-verbal de recepție semnat.',8);
 if(s.invoice_url){reserve(30);const at=y;paragraph('Deschide factura',10,0,'0.086 0.518 0.165');page.push({kind:'link',url:s.invoice_url,x:42,y:at-3,w:160,h:17});}
 section('Prestator');paragraph('Petru & Inés');paragraph(s.supplier.name,9);paragraph('CUI: '+s.supplier.cui+' · Registrul comerțului: '+s.supplier.registration,9);paragraph('https://petruandines.com/',9);
 for(let i=0;i<pages.length;i++) {
  page=pages[i];page.push({kind:'line',x:42,y:69,w:511});
  text('Raport generat electronic de Petru & Inés pe baza informațiilor',42,54,7);
  text('înregistrate în portalul intervenției.',42,43,7);text(`${i+1} / ${pages.length}`,510,48,8);
 }
 return {version:1,pages};
}
const decoded=new WeakMap();
export function prepareResources(r){
 if(!decoded.has(r))decoded.set(r,{font:unbase(r.font),logo:unbase(r.logo),codes:Object.fromEntries(Object.entries(r.glyphs).map(([cp,g])=>[String.fromCharCode(+cp),hex(g[0])])),widths:[...new Map(Object.values(r.glyphs).map(g=>[g[0],g[1]]))].map(([g,w])=>`${g} [${w}]`).join(' ')});
 return decoded.get(r);
}
export function assemblePDF(recipe,r) {
 if(recipe.version!==1)throw new Error('template_version');
 const resources=prepareResources(r);
 const objects=[null,null],used=new Map();
 const add=value=>{objects.push(typeof value==='string'?bytes(value):value);return objects.length;};
 const stream=(data,dict='')=>concat([bytes(`<< /Length ${data.length} ${dict} >>\nstream\n`),data,bytes('\nendstream')]);
 const fontFile=add(stream(resources.font,`/Filter /FlateDecode /Length1 ${r.fontLength}`));
 const descriptor=add(`<< /Type /FontDescriptor /FontName /DejaVuSans /Flags 32 /FontBBox [-1021 -463 1793 1232] /ItalicAngle 0 /Ascent 928 /Descent -236 /CapHeight 729 /StemV 80 /FontFile2 ${fontFile} 0 R >>`);
 const cid=add(`<< /Type /Font /Subtype /CIDFontType2 /BaseFont /DejaVuSans /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${descriptor} 0 R /CIDToGIDMap /Identity /W [${resources.widths}] >>`);
 const unicode=add('');
 const font=add(`<< /Type /Font /Subtype /Type0 /BaseFont /DejaVuSans /Encoding /Identity-H /DescendantFonts [${cid} 0 R] /ToUnicode ${unicode} 0 R >>`);
 const image=add(stream(resources.logo,`/Type /XObject /Subtype /Image /Width ${r.logoWidth} /Height ${r.logoHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /FlateDecode`));
 const pageIds=[];
 for(const page of recipe.pages) {
  const commands=[],annotations=[];
  for(const op of page) {
   if(op.kind==='text') {
    let value='';for(const c of op.value){const code=resources.codes[c];if(code===undefined)throw new Error('unsupported_character');if(!used.has(code))used.set(code,c.codePointAt(0));value+=code;}
    commands.push(`${op.color} rg BT /F ${op.size} Tf 1 0 0 1 ${op.x} ${op.y} Tm <${value}> Tj ET`);
   }else if(op.kind==='line')commands.push(`0.87 0.90 0.89 RG 0.5 w ${op.x} ${op.y} m ${op.x+op.w} ${op.y} l S`);
   else if(op.kind==='logo')commands.push(`q ${op.w} 0 0 ${op.h} ${op.x} ${op.y} cm /Logo Do Q`);
   else if(op.kind==='link') {
    const u=new URL(op.url);if(u.protocol!=='https:'||u.username||u.password)throw new Error('invalid_link');
    const uri=Array.from(bytes(u.href),b=>b.toString(16).padStart(2,'0')).join('');
    annotations.push(add(`<< /Type /Annot /Subtype /Link /Rect [${op.x} ${op.y} ${op.x+op.w} ${op.y+op.h}] /Border [0 0 0] /A << /S /URI /URI <${uri}> >> >>`));
   }else throw new Error('invalid_operation');
  }
  const content=add(stream(bytes(commands.join('\n'))));
  pageIds.push(add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /Font << /F ${font} 0 R >> /XObject << /Logo ${image} 0 R >> >> /Contents ${content} 0 R ${annotations.length?`/Annots [${annotations.map(id=>id+' 0 R').join(' ')}]`:''} >>`));
 }
 const entries=[...used].map(([g,cp])=>`<${g}> <${hex(cp)}>`),groups=[];
 for(let i=0;i<entries.length;i+=100){const group=entries.slice(i,i+100);groups.push(`${group.length} beginbfchar\n${group.join('\n')}\nendbfchar`);}
 objects[unicode-1]=stream(bytes(`/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n/CMapName /PIUnicode def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n${groups.join('\n')}\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend`));
 objects[0]=bytes('<< /Type /Catalog /Pages 2 0 R >>');objects[1]=bytes(`<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map(id=>id+' 0 R').join(' ')}] >>`);
 const parts=[bytes('%PDF-1.7\n%PI-report\n')],offsets=[0];let size=parts[0].length;
 objects.forEach((o,i)=>{offsets.push(size);const block=concat([bytes(`${i+1} 0 obj\n`),o,bytes('\nendobj\n')]);parts.push(block);size+=block.length;});
 parts.push(bytes(`xref\n0 ${objects.length+1}\n0000000000 65535 f \n${offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')}trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${size}\n%%EOF\n`));
 return concat(parts);
}
export async function pdfDigest(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',value)),b=>b.toString(16).padStart(2,'0')).join('');}
