import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handleOneTime,REVIEW_URL} from '../src/one-time.mjs';

export function setup(){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
 sqlite.exec(readFileSync(new URL('../one-time-migrations/0001_one_time.sql',import.meta.url),'utf8'));
 const db={prepare(sql){return{bind(...args){const stmt=sqlite.prepare(sql);return{async all(){return{results:stmt.all(...args)};},async run(){return stmt.run(...args);}};}};},async batch(statements){sqlite.exec('BEGIN');try{const result=[];for(const s of statements)result.push(await s.run());sqlite.exec('COMMIT');return result;}catch(e){sqlite.exec('ROLLBACK');throw e;}}};
 const auth={api:{async getSession({headers}){const token=headers.get('authorization');return token==='Bearer admin'?{user:{id:'owner',role:'admin',twoFactorEnabled:true}}:token==='Bearer pending'?{user:{id:'owner',role:'admin',twoFactorEnabled:false}}:token==='Bearer recurrent'?{user:{id:'client',role:'user'}}:null;}}};
 let now='2026-10-15T10:00:00.000Z';
 const call=(suffix='',{data,method=data?'POST':'GET',admin=true,cookie,origin='https://petruandines.com',authorization,ip='192.0.2.1'}={})=>handleOneTime(new Request('https://api.petruandines.com/api/one-time/'+suffix,{method,headers:{...(origin?{origin}:{}),...(admin?{authorization:'Bearer admin'}:{}),...(authorization?{authorization}:{}),...(cookie?{cookie}:{}),'cf-connecting-ip':ip,...(data?{'content-type':'application/json'}:{})},...(data?{body:JSON.stringify(data)}:{})}),{db,auth,now});
 const create=async(name='Curățenie apartament')=>{const r=await call('admin',{data:{name,client_name:'Client Test',phone:'0700000000',email:'',location:'Strada Test',show_location:true,scheduled_at:'2026-10-15T13:30:00+03:00',price_bani:49900,description:'Curățenie completă',invoice_url:'',expiry_days:7,status:'scheduled',tasks:[{title:'Aspirare',done:false},{title:'Verificare finală',done:false}]}});assert.equal(r.status,201,await r.clone().text());return r.json();};
 const generate=async(id)=>{const r=await call('admin/'+id+'/access',{data:{operation:'generate',password:'parola-securizata-123'}});assert.equal(r.status,200,await r.clone().text());return r.json();};
 const login=async(token,remember=true)=>{const r=await call('client/'+token+'/login',{admin:false,data:{password:'parola-securizata-123',remember}});assert.equal(r.status,200,await r.clone().text());return{cookie:r.headers.get('set-cookie').split(';')[0],header:r.headers.get('set-cookie')};};
 return{sqlite,db,auth,call,create,generate,login,setNow:value=>now=value};
}

