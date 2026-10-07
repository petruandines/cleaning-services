export const DEFAULT_INVOICE_LABEL='Descarcă factura';
export const DISPLAY_DEFAULTS={invoice_enabled:1,invoice_label:DEFAULT_INVOICE_LABEL,show_access_policy:0,show_terms:0,show_supplier:0};
export const ACCESS_POLICY={title:'Politica privind accesul, deplasarea și întreruperea lucrărilor',url:'https://petruandines.com/politica-acces-deplasare/'};
export const SERVICE_TERMS={title:'Condiții de prestare a serviciilor',url:'https://petruandines.com/conditii-prestare-servicii/'};
export const SUPPLIER={name:'MĂCRIŞ PETRU-IONATAN PERSOANĂ FIZICĂ AUTORIZATĂ',cui:'52403391',registration:'F2025031516005',address:'MUNICIPIUL BUCURESTI, SECTOR 6, STR DREPTATII, NR.30, BL.F7C, SC.1, ET.4, AP.28',iban:'RO97REVO0000165356858695 (RON)',bank:'Revolut'};
const fields=Object.keys(DISPLAY_DEFAULTS);
export function validateDisplay(input,previous=DISPLAY_DEFAULTS){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(key=>!fields.includes(key)))throw new Error('invalid_display_options');
 const result={...previous,...input};
 for(const key of ['invoice_enabled','show_access_policy','show_terms','show_supplier']){
  if(![true,false,0,1].includes(result[key]))throw new Error('invalid_display_options');
  result[key]=result[key]?1:0;
 }
 if(typeof result.invoice_label!=='string'||result.invoice_label.length>100)throw new Error('invalid_display_options');
 result.invoice_label=result.invoice_label.trim()||DEFAULT_INVOICE_LABEL;
 return result;
}
export async function readDisplay(db,id){return (await db.prepare('SELECT '+fields.join(',')+' FROM one_time_project_display_options WHERE project_id=?').bind(id).all()).results[0]||{...DISPLAY_DEFAULTS};}
export function writeDisplay(db,id,options){return db.prepare(`INSERT INTO one_time_project_display_options(project_id,${fields.join(',')}) VALUES(${Array(fields.length+1).fill('?').join(',')}) ON CONFLICT(project_id) DO UPDATE SET ${fields.map(key=>key+'=excluded.'+key).join(',')}`).bind(id,...fields.map(key=>options[key]));}
