import test from 'node:test';
import assert from 'node:assert/strict';
import {createStickerSummaryClient,canChangeStickerBalance,STICKER_POLL_MS} from '../src/stickerSummaryClient';

test('a burst of summary consumers shares one request and short-lived results expire',async()=>{
 let calls=0,time=0;
 const client=createStickerSummaryClient(async()=>{calls++;await Promise.resolve();return {cursor:1,balance:6,changes:[]};},()=>time);
 const data=await Promise.all(Array.from({length:20},()=>client.read('a',0)));
 assert.equal(calls,1);assert.ok(data.every(x=>x.balance===6));
 await client.read('a',1);assert.equal(calls,1);
 time=1001;await client.read('a',1);assert.equal(calls,2);
 assert.equal(3600000/STICKER_POLL_MS,60);
});
test('a mutation during a pending refresh is not lost and its signed changes survive the follow-up',async()=>{
 let resolve!:(data:any)=>void;const urls:string[]=[];
 const client=createStickerSummaryClient(async url=>{
  urls.push(url);
  if(urls.length===1)return new Promise(r=>{resolve=r;});
  return {unchanged:true,cursor:2,changes:[],unreadNotifications:1};
 });
 const first=client.read('a',1);client.invalidate('a');
 const next=client.read('a',1);
 resolve({cursor:2,balance:7,changes:[{id:'grant',delta:1}]});
 await first;const latest=await next;
 assert.deepEqual(urls,['/api/stickers/summary?after=1','/api/stickers/summary?after=2']);
 assert.equal(latest.balance,7);assert.deepEqual(latest.changes,[{id:'grant',delta:1}]);
 client.acknowledge('a',2);
 assert.deepEqual((await client.read('a',2)).changes,[]);assert.equal(urls.length,2);
});
test('failed requests can retry and account changes reset cached private data',async()=>{
 let calls=0;
 const client=createStickerSummaryClient(async()=>{if(++calls===1)throw Error('offline');return {cursor:calls,balance:calls,changes:[]};});
 await assert.rejects(client.read('a',0));
 assert.equal((await client.read('a',0)).balance,2);
 assert.equal((await client.read('b',0)).balance,3);
 client.reset();assert.equal((await client.read('a',0)).balance,4);
});
test('only known sticker mutations or an explicit future backend signal require balance refresh',()=>{
 for(const [path,method] of [
 ['/api/stickers/grant','POST'],['/api/stickers/lucky-spend','POST'],['/api/stickers/unlock/track','POST'],
 ['/api/tracks/t/rate','POST'],['/api/tracks/t/comments','POST'],['/api/comments/c/like','POST'],
 ['/api/comments/c','DELETE'],['/api/users/u','PUT'],['/api/playback/claim-local','POST']
 ])assert.equal(canChangeStickerBalance(path,method),true,path);
 for(const [path,method] of [
 ['/api/users/u/ui-preferences','PUT'],['/api/playback/record','POST'],['/api/stickers/reconcile','POST'],
 ['/api/stickers/settings','PUT'],['/api/tracks/t','GET'],['/api/admin/categories','POST']
 ])assert.equal(canChangeStickerBalance(path,method),false,path);
});
