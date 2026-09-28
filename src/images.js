const types = {
  jpeg: { mime: 'image/jpeg', signature: bytes => bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff },
  png: { mime: 'image/png', signature: bytes => [137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n) },
  webp: { mime: 'image/webp', signature: bytes => String.fromCharCode(...bytes.slice(0,4))==='RIFF'&&String.fromCharCode(...bytes.slice(8,12))==='WEBP' }
};
export function identify(bytes) { return Object.entries(types).find(([,type])=>type.signature(bytes))?.[0]||null; }
export async function uploadImage(bucket,file) {
  if(!bucket)throw Error('画像ストレージが未設定です');
  if(!(file instanceof File)||file.size===0||file.size>8*1024*1024)throw Error('画像は8MB以下のJPEG、PNG、WebPを選択してください');
  const bytes=new Uint8Array(await file.arrayBuffer());
  const kind=identify(bytes);if(!kind||file.type!==types[kind].mime)throw Error('JPEG、PNG、WebPの画像ファイルを選択してください');
  const key=`art/${crypto.randomUUID()}.${kind==='jpeg'?'jpg':kind}`;
  await bucket.put(key,bytes,{httpMetadata:{contentType:types[kind].mime}});
  return `/media/${key}`;
}
export async function serveImage(request,bucket,path) {
  if(!bucket)return new Response('Not Found',{status:404});
  if(!/^art\/[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$/.test(path))return new Response('Not Found',{status:404});
  const object=await bucket.get(path);if(!object)return new Response('Not Found',{status:404});
  const headers=new Headers({'cache-control':'public, max-age=31536000, immutable','x-content-type-options':'nosniff'});
  object.writeHttpMetadata(headers);
  headers.set('etag',object.httpEtag);
  return new Response(request.method==='HEAD'?null:object.body,{headers});
}
