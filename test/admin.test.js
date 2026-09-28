import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from '../src/index.js';

function database() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/0001_init.sql',import.meta.url),'utf8'));
  return { prepare(sql) {
    const statement=db.prepare(sql);
    return {bind(...args){this.args=args;return this}, first(){return statement.get(...(this.args||[]))||null}, all(){return {results:statement.all(...(this.args||[]))}}, run(){const result=statement.run(...(this.args||[]));return {meta:{last_row_id:Number(result.lastInsertRowid)}}}};
  } };
}
const base='https://archive.example';
const envFor=DB=>({DB,ACCESS_TEAM_DOMAIN:'https://test.cloudflareaccess.com',ACCESS_AUD:'archive-aud',ADMIN_EMAIL:'owner@example.com'});
const b64=value=>Buffer.from(JSON.stringify(value)).toString('base64url');
async function setupToken() {
  const keys=await crypto.subtle.generateKey({name:'RSASSA-PKCS1-v1_5',modulusLength:2048,publicExponent:new Uint8Array([1,0,1]),hash:'SHA-256'},true,['sign','verify']);
  const jwk={...await crypto.subtle.exportKey('jwk',keys.publicKey),kid:'test-key'};
  const original=globalThis.fetch;
  globalThis.fetch=async()=>new Response(JSON.stringify({keys:[jwk]}),{status:200});
  const token=async(email='owner@example.com')=>{
    const header=b64({alg:'RS256',kid:'test-key'});
    const payload=b64({iss:'https://test.cloudflareaccess.com',aud:['archive-aud'],email,exp:Math.floor(Date.now()/1000)+300});
    const message=`${header}.${payload}`;
    const signature=await crypto.subtle.sign('RSASSA-PKCS1-v1_5',keys.privateKey,new TextEncoder().encode(message));
    return `${message}.${Buffer.from(signature).toString('base64url')}`;
  };
  return {token,restore(){globalThis.fetch=original}};
}
function post(path,form,token) {return new Request(base+path,{method:'POST',headers:{Origin:base,'Cf-Access-Jwt-Assertion':token,'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(form)})}
function get(path,token) {return new Request(base+path,{headers:token?{'Cf-Access-Jwt-Assertion':token}:{}})}

test('admin registration and public draft isolation',async()=>{
  const DB=database(),env=envFor(DB),auth=await setupToken();
  try {
    const token=await auth.token();
    assert.equal((await worker.fetch(get('/admin'),env)).status,403);
    assert.equal((await worker.fetch(get('/admin',await auth.token('stranger@example.com')),env)).status,403);
    assert.equal((await worker.fetch(get('/admin',token),env)).status,200);
    let res=await worker.fetch(post('/admin/series/new',{slug:'autumn-cafe',title:'Autumn Café',concept:'秋の味覚と衣装',status:'published'},token),env);
    assert.equal(res.status,303);
    res=await worker.fetch(post('/admin/series/autumn-cafe/days/new',{slug:'monday',title:'モンブラン',date:'2026-10-05',day_order:'1'},token),env);
    assert.equal(res.status,303);
    const path='/admin/series/autumn-cafe/days/monday/prompts/new';
    const form={slot:'morning',cut_number:'1',title:'窓辺のモンブラン',positive_prompt:'soft light',negative_prompt:'blurry',tags:'season:autumn:秋\ngenre:cafe:カフェ',status:'draft'};
    assert.equal((await worker.fetch(post(path,form,token),env)).status,303);
    assert.equal((await worker.fetch(get('/series/autumn-cafe/monday/morning/1'),env)).status,404);
    const edit='/admin/series/autumn-cafe/days/monday/prompts/edit/1';
    assert.equal((await worker.fetch(post(edit,{...form,status:'published'},token),env)).status,303);
    const detail=await worker.fetch(get('/series/autumn-cafe/monday/morning/1'),env);
    assert.equal(detail.status,200);
    const html=await detail.text();
    assert.match(html,/soft light/);assert.match(html,/Negative Prompt/);assert.match(html,/カフェ/);
    assert.equal((await worker.fetch(get('/tags/autumn'),env)).status,200);
    const invalid=await worker.fetch(post(edit,{...form,tags:'invalid tag'},token),env);
    assert.match(await invalid.text(),/タグはカテゴリー/);
    assert.equal((await worker.fetch(get('/series/autumn-cafe/monday/morning/1'),env)).status,200);
  } finally {auth.restore()}
});
