import test from 'node:test';
import assert from 'node:assert/strict';
import { listOwnThreads } from '../src/threads-api.js';

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
