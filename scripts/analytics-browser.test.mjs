import test from 'node:test';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {existsSync,statSync,readFileSync} from 'node:fs';
import {resolve,extname,join} from 'node:path';
const root=resolve('dist-cloudflare');
const origin='https://petruandines.com';
const types={'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.jpg':'image/jpeg'};
test('browser: real Google container, consent, sanitized GA payloads and private-route exclusion',{timeout:120000},async()=>{
  const browser=await chromium.launch({headless:true});
  try{
    const context=await browser.newContext({viewport:{width:390,height:844}});
    const google=[],collect=[];
    await context.route('**/*',async route=>{
      const req=route.request(),u=new URL(req.url());
      if(u.origin===origin){
        let p=resolve(root,'.'+decodeURIComponent(u.pathname));
        if(!p.startsWith(root+'/')&&p!==root)return route.abort();
        if(existsSync(p)&&statSync(p).isDirectory())p=join(p,'index.html');
        if(!existsSync(p)&&existsSync(p+'.html'))p+='.html';
        if(!existsSync(p))return route.fulfill({status:404,body:'Not found'});
        return route.fulfill({status:200,contentType:types[extname(p)]||'application/octet-stream',body:readFileSync(p)});
      }
      if(/(^|\.)googletagmanager\.com$/.test(u.hostname)){google.push(req.url());return route.continue();}
      if(/(^|\.)google-analytics\.com$/.test(u.hostname)){
        google.push(req.url());
        if(/\/(?:g\/)?collect$/.test(u.pathname))collect.push({url:req.url(),body:req.postData()||''});
        return route.fulfill({status:204,body:''});
      }
      if(/(^|\.)google\.com$|(^|\.)doubleclick\.net$|(^|\.)googleadservices\.com$/.test(u.hostname))google.push(req.url());
      return route.abort();
    });
    const page=await context.newPage();
    await page.goto(origin+'/?utm_source=chatgpt.com');
    await page.getByRole('button',{name:'Refuz analiza',exact:true}).waitFor();
    await page.waitForTimeout(500);
    assert.equal(google.length,0,'no Google analytics traffic before consent');
    await page.getByRole('button',{name:'Refuz analiza',exact:true}).click();
    await page.reload();
    await page.waitForTimeout(500);
    assert.equal(google.length,0,'no traffic after rejection');
    assert.equal((await context.cookies()).filter(c=>/^_ga(?:_|$)/.test(c.name)).length,0);
    await page.locator('#pi-consent-preferences').click();
    await page.getByRole('button',{name:'Accept analiza',exact:true}).click();
    await page.waitForFunction(()=>window.dataLayer?.some(x=>x[0]==='consent'&&x[1]==='update'&&x[2].analytics_storage==='granted'));
    await page.waitForTimeout(1500);
    const flags=await page.evaluate(()=>Array.from(window.dataLayer.find(x=>x[0]==='consent'&&x[1]==='update'))[2]);
    assert.deepEqual(flags,{analytics_storage:'granted',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'});
    assert.equal(google.filter(x=>x.includes('gtm.js?id=GTM-T5W2QNNZ')).length,1);
    // Real tag is downloaded, but GA collection calls are intercepted, never transmitted.
    const waitForEvent=async name=>{
      for(let i=0;i<40;i++){
        if(collect.some(x=>new URLSearchParams(new URL(x.url).search).get('en')===name||x.body.split('\n').some(line=>new URLSearchParams(line).get('en')===name)))return;
        await page.waitForTimeout(250);
      }
      assert.fail('No intercepted GA event: '+name);
    };
    await waitForEvent('page_view');
    await page.evaluate(()=>window.PIAnalytics.quote('quote_form'));
    await waitForEvent('quote_request_start');
    await waitForEvent('whatsapp_click');
    assert.ok(collect.every(x=>!/(?:fake-secret|fake@example\.com|phone=0700000000)/i.test(decodeURIComponent(x.url+' '+x.body))));
    const before=google.length;
    await page.goto(origin+'/?token=fake-secret');
    await page.waitForTimeout(700);
    assert.equal(google.length,before,'unsafe URL must not load GTM');
    await page.goto(origin+'/portal/project/?token=fake-secret');
    await page.waitForTimeout(700);
    assert.equal(google.length,before,'private portal must not load GTM');
    await page.goto(origin+'/contact/');
    await page.waitForTimeout(500);
    await page.locator('#pi-consent-preferences').click();
    await page.getByRole('button',{name:'Refuz analiza',exact:true}).click();
    await page.waitForTimeout(700);
    const after=google.length;
    await page.goto(origin+'/');
    await page.waitForTimeout(500);
    assert.equal(google.length,after,'no measurement after withdrawal');
    assert.equal((await context.cookies()).filter(c=>/^_ga(?:_|$)/.test(c.name)).length,0);
  }finally{await browser.close();}
});