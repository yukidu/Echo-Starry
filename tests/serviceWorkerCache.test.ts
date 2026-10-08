import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

test('hashed static assets reuse the local PWA cache; HTML stays fresh and APIs bypass it',async()=>{
 const handlers=new Map<string,Function>();
 const saved=new Map<string,Response>();
 const network:string[]=[];
 const cache={
  match:async(request:any)=>saved.get(typeof request==='string'?request:request.url)?.clone(),
  put:async(request:any,response:Response)=>saved.set(typeof request==='string'?request:request.url,response.clone())
 };
 const caches={open:async()=>cache,match:cache.match};
 runInNewContext(readFileSync(new URL('../public/sw.js',import.meta.url),'utf8'),{
  self:{location:{origin:'https://test.example'},addEventListener:(name:string,fn:Function)=>handlers.set(name,fn)},
  caches,URL,Response,fetch:async(request:Request)=>{network.push(request.url);return new Response('network-'+network.length);}
 });
 async function get(path:string,mode='cors'){
  let result:Promise<Response>|undefined;
  handlers.get('fetch')!({request:{url:'https://test.example'+path,method:'GET',mode},respondWith:(r:Promise<Response>)=>result=r});
  return result?await(await result).text():null;
 }
 assert.equal(await get('/assets/main-abcdefgh.js'),'network-1');
 assert.equal(await get('/assets/main-abcdefgh.js'),'network-1');
 assert.equal(network.length,1);
 assert.equal(await get('/','navigate'),'network-2');
 assert.equal(await get('/','navigate'),'network-3');
 assert.equal(await get('/assets/unhashed.js'),'network-4');
 assert.equal(await get('/assets/unhashed.js'),'network-5');
 assert.equal(await get('/api/stickers/summary'),null);
 assert.equal(network.length,5);
});
