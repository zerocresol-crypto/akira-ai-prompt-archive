import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import worker from '../src/index.js';
import { importDrafts, parseImport } from '../src/import.js';

function database() {
  const db = new DatabaseSync(':memory:');
  db.exec(readFileSync(new URL('../migrations/0001_init.sql',import.meta.url),'utf8'));
  db.exec(readFileSync(new URL('../migrations/0003_schedule.sql',import.meta.url),'utf8'));
  return { batch(statements){db.exec('BEGIN');try{const out=statements.map(st=>st.run());db.exec('COMMIT');return out}catch(error){db.exec('ROLLBACK');throw error}}, prepare(sql) {
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
    assert.equal((await worker.fetch(get('/admin',token),{...env,APP_ROLE:'public'})).status,404);
    assert.equal((await worker.fetch(get('/series'),{...env,APP_ROLE:'admin'})).status,404);
    assert.equal((await worker.fetch(get('/admin',token),{...env,APP_ROLE:'admin'})).status,200);
    let res=await worker.fetch(post('/admin/series/new',{slug:'autumn-cafe',title:'Autumn Café',concept:'秋の味覚と衣装',status:'published'},token),env);
    assert.equal(res.status,303);
    res=await worker.fetch(post('/admin/series/autumn-cafe/days/new',{slug:'monday',title:'モンブラン',date:'2026-10-05',day_order:'1'},token),env);
    assert.equal(res.status,303);
    const path='/admin/series/autumn-cafe/days/monday/prompts/new';
    const form={slot:'morning',cut_number:'1',title:'窓辺のモンブラン',positive_prompt:'soft light',negative_prompt:'blurry',tags:'season:autumn:秋\ngenre:cafe:カフェ',status:'draft'};
    assert.equal((await worker.fetch(post(path,form,token),env)).status,303);
    assert.equal((await worker.fetch(get('/series/autumn-cafe/monday/morning/1'),env)).status,404);
    const dayHtml=await (await worker.fetch(get('/admin/series/autumn-cafe/days/monday',token),env)).text();
    assert.match(dayHtml,/登録済み 1 \/ 最大 6 カット/);
    assert.match(dayHtml,/画像未登録 1 件 · 制作意図未登録 1 件 · タグ未登録 0 件/);
    assert.match(dayHtml,/未登録: 画像・制作意図/);
    const preview='/admin/series/autumn-cafe/days/monday/prompts/preview/1';
    assert.equal((await worker.fetch(get(preview),env)).status,403);
    assert.equal((await worker.fetch(get(preview,token),{...env,APP_ROLE:'public'})).status,404);
    const draftPreview=await worker.fetch(get(preview,token),env);
    assert.equal(draftPreview.status,200);
    assert.equal(draftPreview.headers.get('cache-control'),'no-store');
    const previewHtml=await draftPreview.text();
    assert.match(previewHtml,/下書きプレビュー/);
    assert.match(previewHtml,/soft light/);
    assert.match(previewHtml,/カフェ/);
    assert.match(previewHtml,/data-copy="positive"/);
    const edit='/admin/series/autumn-cafe/days/monday/prompts/edit/1';
    assert.equal((await worker.fetch(post(edit,{...form,status:'published'},token),env)).status,303);
    const detail=await worker.fetch(get('/series/autumn-cafe/monday/morning/1'),env);
    assert.equal(detail.status,200);
    const html=await detail.text();
    assert.match(html,/soft light/);assert.match(html,/Negative Prompt/);assert.match(html,/カフェ/);
    assert.equal((await worker.fetch(get('/tags/autumn'),env)).status,200);
    const bulk='/admin/series/autumn-cafe/days/monday/import';
    assert.equal((await worker.fetch(get(bulk,token),env)).status,200);
    assert.equal((await worker.fetch(post(bulk,{json:JSON.stringify([{slot:'evening',cut_number:2,title:'灯りのカフェ',positive_prompt:'warm light'}])},token),env)).status,303);
    assert.equal((await worker.fetch(get('/series/autumn-cafe/monday/evening/2'),env)).status,404);
    const invalid=await worker.fetch(post(edit,{...form,tags:'invalid tag'},token),env);
    assert.match(await invalid.text(),/タグはカテゴリー/);
    assert.equal((await worker.fetch(get('/series/autumn-cafe/monday/morning/1'),env)).status,200);
    const withoutR2=await (await worker.fetch(get(edit,token),env)).text();
    assert.doesNotMatch(withoutR2,/type=\"file\"/);
    assert.match(withoutR2,/画像URL/);
    const objects=new Map();
    env.IMAGES={async put(key,bytes,options){objects.set(key,{bytes,options})},async get(key){const item=objects.get(key);return item?{body:item.bytes,httpEtag:'\"test\"',writeHttpMetadata(headers){headers.set('content-type',item.options.httpMetadata.contentType)}}:null},async delete(key){objects.delete(key)}};
    const uploadForm=new FormData();
    const pixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9f0p8AAAAASUVORK5CYII=','base64');
    uploadForm.set('image',new File([pixel],'test.png',{type:'image/png'}));
    const uploadPath='/admin/series/autumn-cafe/days/monday/prompts/edit/1/image';
    const uploaded=await worker.fetch(new Request(base+uploadPath,{method:'POST',headers:{Origin:base,'Cf-Access-Jwt-Assertion':token},body:uploadForm}),env);
    assert.equal(uploaded.status,303);
    const imagePath=DB.prepare('SELECT image_url FROM prompts WHERE id=1').first().image_url;
    assert.match(imagePath,/^\/media\/art\//);
    assert.equal((await worker.fetch(get(imagePath),env)).status,200);
    assert.match(await (await worker.fetch(get('/series/autumn-cafe/monday/morning/1'),env)).text(),/\/media\/art\//);
  } finally {auth.restore()}
});

test('Threads embed input stores only a validated post URL and renders safely',async()=>{
  const DB=database(),env=envFor(DB),auth=await setupToken();
  try {
    const token=await auth.token();
    DB.prepare("INSERT INTO series(slug,title,status) VALUES('week','Week','published')").run();
    DB.prepare("INSERT INTO days(series_id,slug,title,day_order) VALUES(1,'sunday','Sunday',0)").run();
    const path='/admin/series/week/days/sunday/prompts/new';
    const postUrl='https://www.threads.com/@akira.lether/post/Dd4kbKsiVgx';
    const embed=`<blockquote class="text-post-media" data-text-post-permalink="${postUrl}"><script>alert(1)</script></blockquote><script src="https://www.threads.com/embed.js"></script>`;
    const form={slot:'morning',cut_number:'1',title:'Threadsの作品',positive_prompt:'light',image_url:embed,status:'published'};
    assert.equal((await worker.fetch(post(path,form,token),env)).status,303);
    assert.equal(DB.prepare('SELECT image_url FROM prompts WHERE id=1').first().image_url,postUrl);
    const detail=await (await worker.fetch(get('/series/week/sunday/morning/1'),env)).text();
    assert.match(detail,/data-text-post-permalink="https:\/\/www\.threads\.com\/\@akira\.lether\/post\/Dd4kbKsiVgx"/);
    assert.match(detail,/www\.threads\.com\/embed\.js/);
    assert.doesNotMatch(detail,/alert\(1\)|property="og:image"/);
    const list=await (await worker.fetch(get('/series/week/sunday'),env)).text();
    assert.match(list,/Threads<br>投稿を見る/);
    assert.doesNotMatch(list,/<img[^>]+threads\.com/);
    const invalid=await worker.fetch(post(path,{...form,cut_number:'2',image_url:'<blockquote data-text-post-permalink="https://evil.example/post/1"></blockquote>'},token),env);
    assert.match(await invalid.text(),/Threads埋め込みタグの投稿URL/);
  } finally {auth.restore()}
});


test('six-cut import stays draft and rolls back on duplicate',async()=>{
  const DB=database();
  DB.prepare("INSERT INTO series(slug,title,status) VALUES('week','Week','published')").run();
  DB.prepare("INSERT INTO days(series_id,slug,title,day_order) VALUES(1,'sunday','Sunday',0)").run();
  const entries=['morning','evening'].flatMap(slot=>[1,2,3].map(cut_number=>({slot,cut_number,title:`${slot} ${cut_number}`,positive_prompt:`prompt ${cut_number}`,tags:['season:autumn:秋']})));
  const raw=JSON.stringify(entries);
  assert.equal(parseImport(raw,0).length,6);
  assert.equal(await importDrafts(DB,{id:1,day_order:0},raw),6);
  assert.equal(DB.prepare("SELECT COUNT(*) count FROM prompts WHERE status='draft'").first().count,6);
  assert.equal(DB.prepare('SELECT COUNT(*) count FROM prompt_tags').first().count,6);
  await assert.rejects(importDrafts(DB,{id:1,day_order:0},raw));
  assert.equal(DB.prepare('SELECT COUNT(*) count FROM prompts').first().count,6);
  assert.throws(()=>parseImport(JSON.stringify([{...entries[0],slot:'recap'}]),0));
});


test('admin password mode rejects missing and incorrect credentials',async()=>{
  const DB=database(),secret='a'.repeat(64);
  const env={DB,APP_ROLE:'admin',ADMIN_AUTH_MODE:'basic',ADMIN_PASSWORD:secret};
  const addr=base+'/admin';
  assert.equal((await worker.fetch(new Request(addr),{...env,ADMIN_PASSWORD:undefined})).status,503);
  const unauthorized=await worker.fetch(new Request(addr),env);
  assert.equal(unauthorized.status,401);
  assert.match(unauthorized.headers.get('WWW-Authenticate'),/Basic/);
  const header=password=>({Authorization:'Basic '+Buffer.from('admin:'+password).toString('base64')});
  assert.equal((await worker.fetch(new Request(addr,{headers:header('b'.repeat(64))}),env)).status,401);
  assert.equal((await worker.fetch(new Request(addr,{headers:header(secret)}),env)).status,200);
  assert.equal((await worker.fetch(new Request(addr,{headers:header(secret)}),{...env,APP_ROLE:'public'})).status,404);
});


test('scheduled series and cuts stay hidden until their JST publication time',async()=>{
  const DB=database(),env=envFor(DB),auth=await setupToken();
  try {
    const token=await auth.token(),future='2099-10-04T05:00',past='2020-10-04T05:00';
    const series='/admin/series/new';
    assert.equal((await worker.fetch(post(series,{slug:'scheduled',title:'予約シリーズ',status:'published',publish_at:future},token),env)).status,303);
    assert.equal((await worker.fetch(get('/series/scheduled'),env)).status,404);
    assert.doesNotMatch(await (await worker.fetch(get('/series'),env)).text(),/予約シリーズ/);
    assert.equal((await worker.fetch(post('/admin/series/edit/1',{slug:'scheduled',title:'予約シリーズ',status:'published',publish_at:past},token),env)).status,303);
    assert.equal((await worker.fetch(get('/series/scheduled'),env)).status,200);
    assert.equal((await worker.fetch(post('/admin/series/scheduled/days/new',{slug:'sunday',title:'日曜',date:'2099-10-04',day_order:'0'},token),env)).status,303);
    const form={slot:'morning',cut_number:'1',title:'予約Cut',positive_prompt:'secret before release',status:'published',publish_at:future,tags:'season:autumn:秋'};
    const create='/admin/series/scheduled/days/sunday/prompts/new';
    assert.equal((await worker.fetch(post(create,form,token),env)).status,303);
    const detail='/series/scheduled/sunday/morning/1';
    assert.equal((await worker.fetch(get(detail),env)).status,404);
    assert.doesNotMatch(await (await worker.fetch(get('/'),env)).text(),/予約Cut/);
    assert.doesNotMatch(await (await worker.fetch(get('/tags/autumn'),env)).text(),/予約Cut/);
    assert.doesNotMatch(await (await worker.fetch(get('/series/scheduled/sunday'),env)).text(),/予約Cut/);
    assert.equal((await worker.fetch(get('/admin/series/scheduled/days/sunday/prompts/preview/1',token),env)).status,200);
    assert.equal((await worker.fetch(post('/admin/series/scheduled/days/sunday/prompts/edit/1',{...form,publish_at:past},token),env)).status,303);
    assert.equal((await worker.fetch(get(detail),env)).status,200);
    assert.match(await (await worker.fetch(get('/tags/autumn'),env)).text(),/予約Cut/);
  } finally {auth.restore()}
});
