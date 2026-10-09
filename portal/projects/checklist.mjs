// Keep the API task shape unchanged. The category is encoded in the title so
// existing projects and the reporting snapshot remain compatible.
const marker = /^\[([^\]\r\n]{1,60})\] (.+)$/u;
export function unpackTask(value) {
 const match=marker.exec(value||'');
 return match?{category:match[1],title:match[2]}:{category:'',title:value||''};
}
export function packTask(category,title) {
 const group=category.trim(),name=title.trim();
 if(!name||group.length>60||/[\[\]\r\n]/u.test(group))throw new Error('Verifică numele categoriei și titlul sarcinii.');
 const value=group?`[${group}] ${name}`:name;
 if(value.length>300)throw new Error('O sarcină, inclusiv categoria, poate avea cel mult 300 de caractere.');
 return value;
}
export function groupsOf(tasks) {
 const groups=[];
 for(const task of tasks){const {category,title}=unpackTask(task.title),last=groups.at(-1);
  if(!last||last.category!==category)groups.push({category,tasks:[]});
  groups.at(-1).tasks.push({...task,title});
 }
 return groups;
}
export function parseChecklistText(text){
 let category='',result=[];
 for(const raw of text.replace(/^\uFEFF/,'').split(/\r?\n/)){
  const line=raw.trim();if(!line||line.startsWith('#'))continue;
  const heading=/^\[([^\]]+)\]$/.exec(line);if(heading){category=heading[1].trim();continue;}
  const title=line.replace(/^(?:[-*•]|\d+[.)])\s+/u,'').trim();
  result.push({category,title});
 }
 return validateImport(result);
}
function validateImport(rows){
 if(!rows.length)throw new Error('Fișierul nu conține sarcini.');
 if(rows.length>500)throw new Error('Maximum 500 de sarcini într-un proiect.');
 return rows.map(({category='',title})=>{packTask(category,title);return {category:category.trim(),title:title.trim(),done:false};});
}
function xml(bytes){const doc=new DOMParser().parseFromString(new TextDecoder().decode(bytes),'application/xml');if(doc.querySelector('parsererror'))throw new Error('Fișierul Excel conține XML invalid.');return doc;}
const all=(parent,name)=>Array.from(parent.getElementsByTagName(name));
const cellText=node=>all(node,'t').map(t=>t.textContent).join('');
async function zipParts(buffer){
 const bytes=new Uint8Array(buffer),view=new DataView(buffer);let end=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(view.getUint32(i,true)===0x06054b50){end=i;break;}
 if(end<0)throw new Error('Fișierul .xlsx nu este o arhivă Excel validă.');
 const count=view.getUint16(end+10,true),start=view.getUint32(end+16,true),files=new Map();let at=start,total=0;
 if(count>300||start>=bytes.length)throw new Error('Fișierul Excel este prea mare.');
 for(let i=0;i<count;i++){
  if(at+46>bytes.length||view.getUint32(at,true)!==0x02014b50)throw new Error('Arhiva Excel este deteriorată.');
  const method=view.getUint16(at+10,true),packed=view.getUint32(at+20,true),size=view.getUint32(at+24,true),nameLen=view.getUint16(at+28,true),extra=view.getUint16(at+30,true),comment=view.getUint16(at+32,true),local=view.getUint32(at+42,true),name=new TextDecoder().decode(bytes.subarray(at+46,at+46+nameLen));
  at+=46+nameLen+extra+comment;
  if(!/^(?:xl\/sharedStrings\.xml|xl\/workbook\.xml|xl\/worksheets\/sheet\d+\.xml)$/i.test(name))continue;
  total+=size;if(total>4*1024*1024||packed>2*1024*1024)throw new Error('Fișierul Excel este prea mare.');
  if(local+30>bytes.length||view.getUint32(local,true)!==0x04034b50)throw new Error('Arhiva Excel este deteriorată.');
  const offset=local+30+view.getUint16(local+26,true)+view.getUint16(local+28,true);
  if(offset+packed>bytes.length)throw new Error('Arhiva Excel este deteriorată.');
  let content=bytes.subarray(offset,offset+packed);
  if(method===8){if(typeof DecompressionStream==='undefined')throw new Error('Acest browser nu poate citi .xlsx. Folosește un fișier .txt.');const reader=new Blob([content]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader(),chunks=[];let length=0;for(;;){const next=await reader.read();if(next.done)break;length+=next.value.length;if(length>size||length>4*1024*1024){await reader.cancel();throw new Error('Arhiva Excel este deteriorată.');}chunks.push(next.value);}content=new Uint8Array(length);let position=0;for(const chunk of chunks){content.set(chunk,position);position+=chunk.length;}}
  else if(method!==0)throw new Error('Metodă de compresie Excel nesuportată.');
  if(content.length!==size)throw new Error('Arhiva Excel este deteriorată.');files.set(name,content);
 }
 return files;
}
export async function parseChecklistXlsx(buffer){
 const files=await zipParts(buffer),shared=files.get('xl/sharedStrings.xml'),strings=shared?all(xml(shared),'si').map(cellText):[];
 const workbook=files.get('xl/workbook.xml'),names=workbook?all(xml(workbook),'sheet').map(s=>s.getAttribute('name')||''):[];
 const sheets=[...files].filter(([name])=>/^xl\/worksheets\/sheet\d+\.xml$/i.test(name)).sort((a,b)=>Number(a[0].match(/\d+/g).at(-1))-Number(b[0].match(/\d+/g).at(-1)));
 if(!sheets.length)throw new Error('Fișierul .xlsx nu conține foi de calcul.');
 const result=[];
 for(const [path,bytes] of sheets){
  const sheetNo=Number(path.match(/sheet(\d+)\.xml/i)[1]),fallback=names[sheetNo-1]||'';
  const rows=all(xml(bytes),'row').map(row=>{const values={};for(const c of all(row,'c')){const key=/^[A-Z]+/i.exec(c.getAttribute('r')||'');if(!key)continue;const kind=c.getAttribute('t'),raw=all(c,'v')[0]?.textContent||'';values[key[0].toUpperCase()]=kind==='s'?strings[Number(raw)]||'':kind==='inlineStr'?cellText(c):raw;}return values;}).filter(v=>Object.values(v).some(x=>String(x).trim()));
  if(!rows.length)continue;
  const header=rows[0],columns=Object.keys(header),clean=x=>String(x||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
  const categoryColumn=columns.find(k=>/^(categorie|category)$/.test(clean(header[k]))),taskColumn=columns.find(k=>/^(sarcina|task|activitate)$/.test(clean(header[k])));
  const hasHeader=!!taskColumn;
  for(const row of rows.slice(hasHeader?1:0)){
   const title=String(row[taskColumn||'B']||(!hasHeader?row.A:'')||'').trim();if(!title)continue;
   const category=String(categoryColumn?row[categoryColumn]||'':!hasHeader&&row.B?row.A||'':fallback).trim();
   result.push({category,title});
  }
 }
 return validateImport(result);
}
