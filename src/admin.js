import { uploadImage } from './images.js';
import { template, importDrafts } from './import.js';
const esc = (value = '') => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const opts = (items, value) => items.map(([key,name]) => `<option value="${esc(key)}" ${key === value ? 'selected' : ''}>${esc(name)}</option>`).join('');
const input = (name,title,value='',type='text',required=false) => `<label>${title}<input type="${type}" name="${name}" value="${esc(value)}" ${required?'required':''}></label>`;
const area = (name,title,value='',required=false) => `<label>${title}<textarea name="${name}" rows="${name.includes('prompt')?10:3}" ${required?'required':''}>${esc(value)}</textarea></label>`;
const select = (name,title,values,value) => `<label>${title}<select name="${name}">${opts(values,value)}</select></label>`;
const status = v => select('status','状態',[['draft','下書き'],['published','公開']],v);
const tabs = `<p><a href="/admin">管理トップ</a> · <a href="/admin/series/new">新規シリーズ</a></p>`;
const frame = (title,content) => new Response(`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>${esc(title)} | Archive管理</title><style>:root{font-family:system-ui,sans-serif;color-scheme:dark;background:#0a1420;color:#e9f4fa}body{max-width:900px;padding:20px;margin:auto}a{color:#71d9f1}label{display:block;margin:16px 0;color:#b2cad8}input,textarea,select{width:100%;box-sizing:border-box;margin-top:6px;padding:12px;background:#102335;border:1px solid #426078;border-radius:8px;color:#f0f8ff;font:inherit}textarea{font-family:ui-monospace,monospace}button{padding:12px 22px;border:0;border-radius:8px;background:#75d7ed;color:#091a26;font-weight:bold;cursor:pointer}section{padding:16px;border:1px solid #335369;border-radius:12px;margin:16px 0}small{color:#a6c0cd}form{max-width:800px}</style><h1>${esc(title)}</h1>${tabs}${content}</html>`,{headers:{'content-type':'text/html; charset=utf-8','cache-control':'no-store','x-robots-tag':'noindex, nofollow'}});
const redirect = path => new Response(null,{status:303,headers:{Location:path,'cache-control':'no-store'}});
const deny = (message,status) => new Response(message,{status,headers:{'content-type':'text/plain; charset=utf-8','cache-control':'no-store'}});
const validSlug = v => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v) && v.length <= 100;
const validUrl = v => !v || (/^https:\/\//.test(v) && v.length <= 2048);
const validDate = v => !v || /^\d{4}-\d{2}-\d{2}$/.test(v);
const decoded = v => { try { return JSON.parse(atob(v.replace(/-/g,'+').replace(/_/g,'/'))); } catch { return null; } };
const tokenBytes = v => Uint8Array.from(atob(v.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
async function authorize(request,env) {
  if(env.ADMIN_AUTH_MODE==='basic') {
    if(typeof env.ADMIN_PASSWORD!=='string'||!(/^[0-9a-f]{64}$/i).test(env.ADMIN_PASSWORD))return false;
    const value=request.headers.get('Authorization')||'';
    if(!value.startsWith('Basic '))return false;
    let credentials;try{credentials=atob(value.slice(6))}catch{return false}
    const separator=credentials.indexOf(':');
    if(separator<0||credentials.slice(0,separator)!=='admin')return false;
    const supplied=credentials.slice(separator+1);
    const expected=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(env.ADMIN_PASSWORD)));
    const actual=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(supplied)));
    let diff=0;for(let i=0;i<expected.length;i++)diff|=expected[i]^actual[i];
    return diff===0;
  }

  const domain = env.ACCESS_TEAM_DOMAIN, audience = env.ACCESS_AUD, email = env.ADMIN_EMAIL;
  if (!domain || !audience || !email || !/^https:\/\/[a-z0-9.-]+\.cloudflareaccess\.com$/.test(domain)) return false;
  const jwt = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!jwt) return false;
  const pieces = jwt.split('.'); if (pieces.length !== 3) return false;
  const header = decoded(pieces[0]), claims = decoded(pieces[1]);
  if (!header || header.alg !== 'RS256' || !header.kid || !claims) return false;
  const issuer = `${domain.replace(/\/$/,'')}`;
  if (claims.iss !== issuer || ![claims.aud].flat().includes(audience) || claims.email?.toLowerCase() !== email.toLowerCase()) return false;
  const now = Math.floor(Date.now()/1000);
  if (typeof claims.exp !== 'number' || claims.exp <= now || typeof claims.nbf === 'number' && claims.nbf > now) return false;
  const response = await fetch(`${issuer}/cdn-cgi/access/certs`);
  if (!response.ok) return false;
  const certificates = await response.json();
  const jwk = certificates.keys?.find(k=>k.kid===header.kid && k.kty==='RSA');
  if (!jwk) return false;
  const key = await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  return crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,tokenBytes(pieces[2]),new TextEncoder().encode(`${pieces[0]}.${pieces[1]}`));
}
const seriesFields = s => `${input('slug','URL用slug（半角英数字とハイフン）',s?.slug,'text',true)}${input('title','シリーズ名',s?.title,'text',true)}${area('concept','コンセプト',s?.concept)}${input('cover_url','キービジュアルURL（https）',s?.cover_url)}${input('start_date','開始日',s?.start_date,'date')}${input('end_date','終了日',s?.end_date,'date')}${status(s?.status||'draft')}`;
const dayFields = d => `${input('slug','URL用slug',d?.slug,'text',true)}${input('title','日別タイトル',d?.title,'text',true)}${input('date','投稿日',d?.date,'date')}${select('day_order','曜日／区分',[['0','日曜日'],['1','月曜日'],['2','火曜日'],['3','水曜日'],['4','木曜日'],['5','金曜日'],['6','総集編']],String(d?.day_order??0))}${area('description','制作意図',d?.description)}`;
const promptFields = p => `${select('slot','時間帯',[['morning','朝'],['evening','夜'],['recap','総集編']],p?.slot||'morning')}${select('cut_number','Cut番号',[['1','Cut 1'],['2','Cut 2'],['3','Cut 3']],String(p?.cut_number||1))}${input('title','タイトル',p?.title,'text',true)}${area('description','構図・光・衣装などの制作意図',p?.description)}${area('positive_prompt','Positive Prompt',p?.positive_prompt,true)}${area('negative_prompt','Negative Prompt',p?.negative_prompt)}${select('aspect_ratio','画像比率',[['','未設定'],['16:9','16:9'],['9:16','9:16']],p?.aspect_ratio||'')}${input('image_url','画像URL（https）',p?.image_url)}${input('model_name','使用モデル',p?.model_name||'Anima-Base')}${area('notes','生成上の注意',p?.notes)}${area('tags','タグ（カテゴリー:slug:表示名 を改行区切り）',p?.tags||'')}${status(p?.status||'draft')}`;
const categories = ['season','outfit','hair','background','time','composition','color','genre','motif'];
async function validateTags(db,raw) {
  const lines = raw.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  if (lines.length > 20) throw new Error('タグは20件以内で入力してください');
  const parsed = lines.map(line=>{const [category,slug,...name]=line.split(':');if(!categories.includes(category)||!validSlug(slug)||!name.join(':').trim())throw new Error('タグはカテゴリー:slug:表示名の形式で入力してください');return {category,slug,name:name.join(':').trim()}});
  for(const t of parsed) {const existing=await db.prepare('SELECT category FROM tags WHERE slug=?').bind(t.slug).first();if(existing && existing.category!==t.category)throw new Error('同じslugのタグに異なるカテゴリーは使用できません')}
  return parsed;
}
async function applyTags(db,promptId,parsed) {
  await db.prepare('DELETE FROM prompt_tags WHERE prompt_id=?').bind(promptId).run();
  for (const t of parsed) {await db.prepare('INSERT INTO tags(slug,name,category) VALUES(?,?,?) ON CONFLICT(slug) DO UPDATE SET name=excluded.name').bind(t.slug,t.name,t.category).run();await db.prepare('INSERT OR IGNORE INTO prompt_tags(prompt_id,tag_id) SELECT ?,id FROM tags WHERE slug=?').bind(promptId,t.slug).run()}
}
export async function admin(request,env,parts) {
  if(env.ADMIN_AUTH_MODE==='basic' && !(/^[0-9a-f]{64}$/i).test(env.ADMIN_PASSWORD||''))return deny('管理者パスワードが未設定です',503);
  try {if(!await authorize(request,env))return env.ADMIN_AUTH_MODE==='basic' ? new Response('管理者認証が必要です',{status:401,headers:{'WWW-Authenticate':'Basic realm="Prompt Archive Admin", charset="UTF-8"','cache-control':'no-store','content-type':'text/plain; charset=utf-8'}}) : deny('管理者認証が必要です',403)}catch{return deny('管理者認証を確認できませんでした',403)}
  if(!['GET','POST'].includes(request.method))return deny('Method Not Allowed',405);
  if(request.method==='POST') {
    if(new URL(request.url).origin!==request.headers.get('Origin'))return deny('Origin mismatch',403);
    const isUpload=parts[1]==='series'&&parts[3]==='days'&&parts[5]==='prompts'&&parts[6]==='edit'&&parts[8]==='image'&&parts.length===9;
    const length=Number(request.headers.get('content-length')||0);if(length>(isUpload?9*1024*1024:120000))return deny('入力が長すぎます',413);
    if(!request.headers.get('content-type')?.startsWith('application/x-www-form-urlencoded') && !request.headers.get('content-type')?.startsWith('multipart/form-data'))return deny('Content-Type mismatch',415);
    let data;try{data=await request.formData()}catch{return deny('入力を読み取れません',400)}
    const v=k=>String(data.get(k)||'').trim();
    if(!isUpload&&[...data].reduce((n,[k,val])=>n+k.length+String(val).length,0)>120000)return deny('入力が長すぎます',413);
    try {
      if(isUpload){
        const p=await env.DB.prepare('SELECT p.id FROM prompts p JOIN days d ON d.id=p.day_id JOIN series s ON s.id=d.series_id WHERE p.id=? AND d.slug=? AND s.slug=?').bind(parts[7],parts[4],parts[2]).first();
        if(!p)return deny('Not Found',404);
        const imageUrl=await uploadImage(env.IMAGES,data.get('image'));
        try{await env.DB.prepare('UPDATE prompts SET image_url=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(imageUrl,p.id).run()}
        catch(error){await env.IMAGES.delete(imageUrl.slice('/media/'.length));throw error}
        return redirect(`/admin/series/${encodeURIComponent(parts[2])}/days/${encodeURIComponent(parts[4])}/prompts/edit/${p.id}`);
      }
      if(parts[1]==='series' && ['new','edit'].includes(parts[2]) && parts.length===(parts[2]==='edit'?4:3)) {
        if(!validSlug(v('slug'))||!v('title')||v('title').length>200||!validUrl(v('cover_url'))||!validDate(v('start_date'))||!validDate(v('end_date'))||!['draft','published'].includes(v('status')))throw Error('シリーズの入力を確認してください');
        if(parts[2]==='new'){await env.DB.prepare('INSERT INTO series(slug,title,concept,cover_url,start_date,end_date,status) VALUES(?,?,?,?,?,?,?)').bind(v('slug'),v('title'),v('concept'),v('cover_url')||null,v('start_date')||null,v('end_date')||null,v('status')).run();return redirect('/admin/series/'+encodeURIComponent(v('slug')))}
        const s=await env.DB.prepare('SELECT * FROM series WHERE id=?').bind(parts[3]).first();if(!s)return deny('Not Found',404);
        await env.DB.prepare('UPDATE series SET slug=?,title=?,concept=?,cover_url=?,start_date=?,end_date=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(v('slug'),v('title'),v('concept'),v('cover_url')||null,v('start_date')||null,v('end_date')||null,v('status'),s.id).run();return redirect('/admin/series/'+encodeURIComponent(v('slug')));
      }
      if(parts[1]==='series' && parts[3]==='days' && ['new','edit'].includes(parts[4]) && parts.length===(parts[4]==='edit'?6:5)) {
        const s=await env.DB.prepare('SELECT * FROM series WHERE slug=?').bind(parts[2]).first();if(!s)return deny('Not Found',404);
        if(!validSlug(v('slug'))||!v('title')||v('title').length>200||!validDate(v('date'))||!['0','1','2','3','4','5','6'].includes(v('day_order')))throw Error('日別情報の入力を確認してください');
        if(parts[4]==='new'){await env.DB.prepare('INSERT INTO days(series_id,slug,title,date,day_order,description) VALUES(?,?,?,?,?,?)').bind(s.id,v('slug'),v('title'),v('date')||null,Number(v('day_order')),v('description')).run()}else{const d=await env.DB.prepare('SELECT id FROM days WHERE id=? AND series_id=?').bind(parts[5],s.id).first();if(!d)return deny('Not Found',404);await env.DB.prepare('UPDATE days SET slug=?,title=?,date=?,day_order=?,description=? WHERE id=?').bind(v('slug'),v('title'),v('date')||null,Number(v('day_order')),v('description'),d.id).run()}
        return redirect(`/admin/series/${encodeURIComponent(s.slug)}/days/${encodeURIComponent(v('slug'))}`);
      }
      if(parts[1]==='series' && parts[3]==='days' && parts[5]==='import' && parts.length===6) {
        const d=await env.DB.prepare('SELECT d.id,d.day_order FROM days d JOIN series s ON s.id=d.series_id WHERE s.slug=? AND d.slug=?').bind(parts[2],parts[4]).first();
        if(!d)return deny('Not Found',404);
        await importDrafts(env.DB,d,v('json'));
        return redirect(`/admin/series/${encodeURIComponent(parts[2])}/days/${encodeURIComponent(parts[4])}`);
      }
      if(parts[1]==='series' && parts[3]==='days' && parts[5]==='prompts' && ['new','edit'].includes(parts[6]) && parts.length===(parts[6]==='edit'?8:7)) {
        const d=await env.DB.prepare('SELECT d.id,d.day_order,s.slug series_slug FROM days d JOIN series s ON s.id=d.series_id WHERE s.slug=? AND d.slug=?').bind(parts[2],parts[4]).first();if(!d)return deny('Not Found',404);
        if(!['morning','evening','recap'].includes(v('slot'))||!['1','2','3'].includes(v('cut_number'))||(d.day_order!==6 && v('slot')==='recap')||(d.day_order===6 && v('slot')!=='recap')||!v('title')||!v('positive_prompt')||!validUrl(v('image_url'))||!['','16:9','9:16'].includes(v('aspect_ratio'))||!['draft','published'].includes(v('status')))throw Error('プロンプトの入力を確認してください');
        const parsedTags=await validateTags(env.DB,v('tags'));
        let id;
        const params=[v('slot'),Number(v('cut_number')),v('title'),v('description'),v('positive_prompt'),v('negative_prompt'),v('aspect_ratio')||null,v('image_url')||null,v('model_name')||'Anima-Base',v('notes'),v('status')];
        if(parts[6]==='new'){const result=await env.DB.prepare('INSERT INTO prompts(day_id,slot,cut_number,title,description,positive_prompt,negative_prompt,aspect_ratio,image_url,model_name,notes,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').bind(d.id,...params).run();id=result.meta.last_row_id}else{const p=await env.DB.prepare('SELECT id FROM prompts WHERE id=? AND day_id=?').bind(parts[7],d.id).first();if(!p)return deny('Not Found',404);id=p.id;await env.DB.prepare('UPDATE prompts SET slot=?,cut_number=?,title=?,description=?,positive_prompt=?,negative_prompt=?,aspect_ratio=?,image_url=?,model_name=?,notes=?,status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?').bind(...params,id).run()}
        await applyTags(env.DB,id,parsedTags);
        return redirect(`/admin/series/${encodeURIComponent(parts[2])}/days/${encodeURIComponent(parts[4])}`);
      }
      return deny('Not Found',404);
    } catch(e) {return frame('保存できませんでした',`<section><p>${esc(e.message)}</p><p>入力内容を確認して、前の画面から再送信してください。</p></section>`)}
  }
  if(parts.length===1){const all=await env.DB.prepare('SELECT * FROM series ORDER BY id DESC').all();return frame('シリーズ管理',`<section><a href="/admin/series/new">＋ シリーズを作成</a></section>${all.results.map(s=>`<section><a href="/admin/series/${encodeURIComponent(s.slug)}">${esc(s.title)}</a> <small>${esc(s.status)}</small></section>`).join('')}`)}
  if(parts[1]==='series'&&parts[2]==='new'&&parts.length===3)return frame('シリーズ作成',`<form method="post">${seriesFields()}<button>保存</button></form>`);
  if(parts[1]!=='series')return deny('Not Found',404);
  if(parts[2]==='edit'&&parts.length===4){const s=await env.DB.prepare('SELECT * FROM series WHERE id=?').bind(parts[3]).first();return s?frame('シリーズ編集',`<form method="post">${seriesFields(s)}<button>保存</button></form>`):deny('Not Found',404)}
  const s=await env.DB.prepare('SELECT * FROM series WHERE slug=?').bind(parts[2]).first();if(!s)return deny('Not Found',404);
  if(parts.length===3){const days=await env.DB.prepare('SELECT * FROM days WHERE series_id=? ORDER BY day_order').bind(s.id).all();return frame(s.title,`<section><p>${esc(s.concept)}</p><a href="/admin/series/edit/${s.id}">シリーズを編集</a> · <a href="/admin/series/${encodeURIComponent(s.slug)}/days/new">日を追加</a></section>${days.results.map(d=>`<section><a href="/admin/series/${encodeURIComponent(s.slug)}/days/${encodeURIComponent(d.slug)}">${esc(d.title)}</a> <small>${esc(d.date||'')}</small></section>`).join('')}`)}
  if(parts[3]!=='days')return deny('Not Found',404);
  if(parts[4]==='new'&&parts.length===5)return frame('日別ページ作成',`<form method="post">${dayFields()}<button>保存</button></form>`);
  if(parts[4]==='edit'&&parts.length===6){const d=await env.DB.prepare('SELECT * FROM days WHERE id=? AND series_id=?').bind(parts[5],s.id).first();return d?frame('日別ページ編集',`<form method="post">${dayFields(d)}<button>保存</button></form>`):deny('Not Found',404)}
  const d=await env.DB.prepare('SELECT * FROM days WHERE series_id=? AND slug=?').bind(s.id,parts[4]).first();if(!d)return deny('Not Found',404);
  if(parts.length===5){const prompts=await env.DB.prepare('SELECT * FROM prompts WHERE day_id=? ORDER BY slot,cut_number').bind(d.id).all();return frame(`${s.title} / ${d.title}`,`<section><a href="/admin/series/${encodeURIComponent(s.slug)}/days/edit/${d.id}">日を編集</a> · <a href="/admin/series/${encodeURIComponent(s.slug)}/days/${encodeURIComponent(d.slug)}/prompts/new">カットを追加</a> · <a href="/admin/series/${encodeURIComponent(s.slug)}/days/${encodeURIComponent(d.slug)}/import">まとめて取り込む</a></section>${prompts.results.map(p=>`<section><a href="/admin/series/${encodeURIComponent(s.slug)}/days/${encodeURIComponent(d.slug)}/prompts/edit/${p.id}">${esc(p.slot)} Cut ${p.cut_number}：${esc(p.title)}</a> <small>${esc(p.status)}</small></section>`).join('')}`)}
  if(parts[5]==='import'&&parts.length===6)return frame('カットをまとめて取り込む',`<section><p>この日に最大${d.day_order===6?3:6}カットをJSONで登録します。すべて下書きになり、既存のCut番号は上書きしません。登録後に各カットを確認して公開してください。</p><small>同じCut番号が既にある場合は取り込み全体が失敗します。</small></section><form method="post"><label>カットのJSON<textarea name="json" rows="24" required>${esc(template)}</textarea></label><button>下書きとして取り込む</button></form>`);
  if(parts[5]==='prompts'&&parts[6]==='new'&&parts.length===7)return frame('カット作成',`<form method="post">${promptFields()}<button>保存</button></form>`);
  if(parts[5]==='prompts'&&parts[6]==='edit'&&parts.length===8){const p=await env.DB.prepare('SELECT * FROM prompts WHERE id=? AND day_id=?').bind(parts[7],d.id).first();if(!p)return deny('Not Found',404);const tags=await env.DB.prepare('SELECT t.* FROM tags t JOIN prompt_tags pt ON pt.tag_id=t.id WHERE pt.prompt_id=? ORDER BY t.category,t.slug').bind(p.id).all();p.tags=tags.results.map(t=>`${t.category}:${t.slug}:${t.name}`).join('\n');return frame('カット編集',`${p.image_url?`<section><img src="${esc(p.image_url)}" alt="登録済み画像" style="max-width:100%;max-height:320px"></section>`:''}${env.IMAGES?`<section><form method="post" action="/admin/series/${encodeURIComponent(s.slug)}/days/${encodeURIComponent(d.slug)}/prompts/edit/${p.id}/image" enctype="multipart/form-data"><label>画像ファイル（JPEG、PNG、WebP、8MB以下）<input type="file" name="image" accept="image/jpeg,image/png,image/webp" required></label><button>画像を登録</button></form></section>`:`<section><p>画像は下の「画像URL」にHTTPSのURLを入力してください。</p></section>`}<form method="post">${promptFields(p)}<button>保存</button></form>`)}
  return deny('Not Found',404);
}
