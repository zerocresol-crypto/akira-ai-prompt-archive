import test from 'node:test';
import assert from 'node:assert/strict';
import { listOwnThreads, threadImages } from '../src/threads-api.js';
import { saveThreadsCover } from '../src/images.js';

test('recent Threads posts are limited to the authorized account and canonical URLs',async()=>{
  const fetcher=async(url,options)=>{
    assert.match(url,/^https:\/\/graph\.threads\.net\/me\/threads\?/);
    assert.equal(options.headers.Authorization,'Bearer secret');
    return new Response(JSON.stringify({data:[
      {id:'123',username:'akira.lether',permalink:'https://www.threads.com/@akira.lether/post/ABC',text:'朝の作品',timestamp:'2026-10-11T05:00:00+0000'},
      {id:'456',username:'other',permalink:'https://www.threads.com/@other/post/DEF'},
      {id:'789',username:'akira.lether',permalink:'https://evil.example/post/789'}
    ]}),{status:200});
  };
  const posts=await listOwnThreads('secret','akira.lether',fetcher);
  assert.deepEqual(posts.map(p=>p.id),['123']);
  assert.equal(posts[0].permalink,'https://www.threads.com/@akira.lether/post/ABC');
});

test('Threads API failure does not invent a post candidate',async()=>{
  await assert.rejects(listOwnThreads('secret','akira.lether',async()=>new Response('{}',{status:401})),/トークン/);
});

test('cover picker resolves images from an owned carousel and skips videos',async()=>{
  const fetcher=async url=>new Response(JSON.stringify(url.includes('/123?')
    ? {id:'123',username:'akira.lether',media_type:'CAROUSEL_ALBUM',children:{data:[{id:'124'},{id:'125'}]}}
    : url.includes('/124?')
      ? {id:'124',media_type:'IMAGE',media_url:'https://scontent.cdninstagram.com/one.jpg'}
      : {id:'125',media_type:'VIDEO',thumbnail_url:'https://scontent.cdninstagram.com/video.jpg'}));
  assert.deepEqual(await threadImages('secret','123','akira.lether',fetcher),[{id:'124',url:'https://scontent.cdninstagram.com/one.jpg'}]);
  await assert.rejects(threadImages('secret','123','other',fetcher),/自分の投稿/);
});

test('cover download validates origin and actual image bytes before storing',async()=>{
  const writes=[];
  const bucket={put:async(...args)=>writes.push(args)};
  const jpeg=new Uint8Array([0xff,0xd8,0xff,0xd9]);
  const result=await saveThreadsCover(bucket,'https://scontent.cdninstagram.com/photo.jpg',async()=>new Response(jpeg));
  assert.match(result,/^\/media\/art\/.+\.jpg$/);
  assert.equal(writes[0][2].httpMetadata.contentType,'image/jpeg');
  await assert.rejects(saveThreadsCover(bucket,'https://internal.example/image',async()=>new Response(jpeg)),/配信元/);
  await assert.rejects(saveThreadsCover(bucket,'https://scontent.cdninstagram.com/fake',async()=>new Response('not an image')),/画像形式/);
  assert.equal(writes.length,1);
});
