export const SERVICE_DEFAULTS={billing_mode:'fixed',minimum_bani:10000,minimum_agreement:'',en_route:0,departed_at:null,stopped_at:null};
const fields=Object.keys(SERVICE_DEFAULTS);
export async function readService(db,id){return (await db.prepare('SELECT '+fields.join(',')+' FROM one_time_project_service_options WHERE project_id=?').bind(id).all()).results[0]||{...SERVICE_DEFAULTS};}
export function validateService(input,previous=SERVICE_DEFAULTS,now){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).some(k=>!['billing_mode','minimum_bani','minimum_agreement','en_route'].includes(k)))throw new Error('invalid_service_options');
 const result={...previous,...input};
 if(!['fixed','hourly'].includes(result.billing_mode)||!Number.isSafeInteger(result.minimum_bani)||result.minimum_bani<0||result.minimum_bani>1000000000||typeof result.minimum_agreement!=='string'||result.minimum_agreement.length>1000||![true,false,0,1].includes(result.en_route))throw new Error('invalid_service_options');
 result.minimum_agreement=result.minimum_agreement.trim();if(result.minimum_bani!==10000&&!result.minimum_agreement)throw new Error('minimum_agreement_required');
 result.en_route=result.en_route?1:0;result.departed_at=result.en_route?(previous.en_route?previous.departed_at:now):null;return result;
}
export function writeService(db,id,options){return db.prepare(`INSERT INTO one_time_project_service_options(project_id,${fields.join(',')}) VALUES(${Array(fields.length+1).fill('?').join(',')}) ON CONFLICT(project_id) DO UPDATE SET ${fields.map(k=>k+'=excluded.'+k).join(',')}`).bind(id,...fields.map(k=>options[k]));}
export function billingView(p,options,now){
 const end=p.completed_at||options.stopped_at||now;
 const elapsed=p.started_at?Math.max(0,Date.parse(end)-Date.parse(p.started_at)):0;
 return {mode:options.billing_mode,rate_bani:p.price_bani,minimum_bani:options.minimum_bani,minimum_agreement:options.minimum_agreement,elapsed_ms:elapsed,total_bani:options.billing_mode==='hourly'?(p.started_at?Math.max(options.minimum_bani,Math.round(p.price_bani*elapsed/3600000)):null):p.price_bani,running:options.billing_mode==='hourly'&&p.status==='in_progress'&&!!p.started_at,server_now:now};
}
