export const template = JSON.stringify([
  {slot:'morning',cut_number:1,title:'朝 Cut 01',description:'構図・光・衣装の設計',positive_prompt:'',negative_prompt:'',aspect_ratio:'9:16',image_url:'',tags:['season:autumn:秋']},
  {slot:'evening',cut_number:1,title:'夜 Cut 01',description:'夜の照明と演出',positive_prompt:'',negative_prompt:'',aspect_ratio:'9:16',image_url:'',tags:['time:night:夜']}
],null,2);
const categories=new Set(['season','outfit','hair','background','time','composition','color','genre','motif']);
const slug=v=>typeof v==='string'&&/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v)&&v.length<=100;
const text=(v,max=20000)=>typeof v==='string'&&v.length<=max;
export function parseImport(raw,dayOrder) {
  if(raw.length>100000)throw Error('JSONは100KB以内にしてください');
  let values;try{values=JSON.parse(raw)}catch{throw Error('JSONの形式を確認してください')}
  if(!Array.isArray(values)||values.length<1||values.length>(dayOrder===6?3:6))throw Error('カット数を確認してください');
  const keys=new Set(),out=[];
  for(const row of values){
    if(!row||typeof row!=='object'||Array.isArray(row))throw Error('各カットはオブジェクトで指定してください');
    if(!['morning','evening','recap'].includes(row.slot)||(dayOrder===6)!==(row.slot==='recap')||!Number.isInteger(row.cut_number)||row.cut_number<1||row.cut_number>3)throw Error('時間帯またはCut番号を確認してください');
    const key=`${row.slot}:${row.cut_number}`;if(keys.has(key))throw Error('同じ時間帯とCut番号が重複しています');keys.add(key);
    if(!text(row.title,200)||!row.title.trim()||!text(row.positive_prompt)||!row.positive_prompt.trim()||!text(row.negative_prompt??'')||!text(row.description??'',2000)||!text(row.notes??'',2000)||!text(row.model_name??'',200)||!['','16:9','9:16'].includes(row.aspect_ratio??'')||!text(row.image_url??'',2048)||row.image_url&&(!row.image_url.startsWith('https://')||!URL.canParse(row.image_url)))throw Error('タイトル、プロンプト、画像URLを確認してください');
    const tags=row.tags??[];if(!Array.isArray(tags)||tags.length>20)throw Error('タグは配列で20件以内にしてください');
    const parsed=tags.map(value=>{if(typeof value!=='string')throw Error('タグの形式を確認してください');const [category,tagSlug,...name]=value.split(':');if(!categories.has(category)||!slug(tagSlug)||!name.join(':').trim()||name.join(':').length>100)throw Error('タグはカテゴリー:slug:表示名の形式にしてください');return {category,slug:tagSlug,name:name.join(':').trim()}});
    out.push({slot:row.slot,cut_number:row.cut_number,title:row.title.trim(),description:row.description??'',positive_prompt:row.positive_prompt,negative_prompt:row.negative_prompt??'',aspect_ratio:row.aspect_ratio||null,image_url:row.image_url||null,model_name:row.model_name||'Anima-Base',notes:row.notes??'',tags:parsed});
  }
  return out;
}
export async function importDrafts(db,day,raw) {
  const entries=parseImport(raw,day.day_order);
  const incoming=new Map();
  for(const entry of entries)for(const tag of entry.tags){if(incoming.has(tag.slug)&&incoming.get(tag.slug)!==tag.category)throw Error('同名タグのカテゴリーが一致しません');incoming.set(tag.slug,tag.category)}
  for(const [tagSlug,category] of incoming){const existing=await db.prepare('SELECT category FROM tags WHERE slug=?').bind(tagSlug).first();if(existing&&existing.category!==category)throw Error('既存タグのカテゴリーが一致しません')}
  const batch=[];
  for(const p of entries){
    batch.push(db.prepare("INSERT INTO prompts(day_id,slot,cut_number,title,description,positive_prompt,negative_prompt,aspect_ratio,image_url,model_name,notes,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,'draft')").bind(day.id,p.slot,p.cut_number,p.title,p.description,p.positive_prompt,p.negative_prompt,p.aspect_ratio,p.image_url,p.model_name,p.notes));
    for(const t of p.tags){
      batch.push(db.prepare('INSERT INTO tags(slug,name,category) VALUES(?,?,?) ON CONFLICT(slug) DO UPDATE SET name=excluded.name').bind(t.slug,t.name,t.category));
      batch.push(db.prepare('INSERT INTO prompt_tags(prompt_id,tag_id) SELECT p.id,t.id FROM prompts p JOIN tags t ON t.slug=? WHERE p.day_id=? AND p.slot=? AND p.cut_number=?').bind(t.slug,day.id,p.slot,p.cut_number));
    }
  }
  await db.batch(batch);
  return entries.length;
}
