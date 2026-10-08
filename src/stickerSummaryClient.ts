export const STICKER_POLL_MS = 60_000;
// Refreshes share a request; a mutation during that request requires one follow-up.
export function createStickerSummaryClient(fetchJson: (url: string) => Promise<any>, now = Date.now) {
  const entries = new Map<string, {revision:number; fetchedRevision:number; time:number; data:any; pending?:Promise<any>}>();
  const entryFor = (userId:string) => {
    let entry = entries.get(userId);
    if (!entry) {
      if (entries.size >= 4) entries.delete(entries.keys().next().value!);
      entry = {revision:0,fetchedRevision:-1,time:0,data:null};
      entries.set(userId,entry);
    }
    return entry;
  };
  return {
    acknowledge(userId:string,cursor:number) {
      const entry=entries.get(userId);
      if(entry?.data && entry.data.cursor<=cursor)entry.data={...entry.data,changes:[]};
    },
    reset() { entries.clear(); },
    invalidate(userId:string) { entryFor(userId).revision += 1; },
    async read(userId:string, after:number):Promise<any> {
      const entry = entryFor(userId);
      if (entry.pending) {
        await entry.pending;
        return this.read(userId, Number(entry.data?.cursor ?? after));
      }
      if (entry.data && !(after===0 && entry.data.unchanged) && entry.fetchedRevision === entry.revision && now()-entry.time < 1000) return entry.data;
      const revision = entry.revision;
      entry.pending = fetchJson('/api/stickers/summary?after='+after).then(data => {
        // A queued refresh may win App's request sequence. Carry its predecessor's deltas
        // until the consumer deduplicates them, including an unchanged follow-up.
        const changes=Array.from(new Map([...(after ? entry.data?.changes || [] : []),...(data.changes || [])].map(change=>[change.id,change])).values());
        entry.data={...entry.data,...data,changes,unchanged:Boolean(data.unchanged)};
        entry.time=now();entry.fetchedRevision=revision;return entry.data;
      });
      try { return await entry.pending; }
      finally { entry.pending=undefined; }
    }
  };
}
export function canChangeStickerBalance(path:string, method:string) {
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') return false;
  return /^\/api\/stickers\/(?:grant|lucky-spend|unlock\/[^/]+)$/.test(path)
    || /^\/api\/tracks(?:\/[^/]+(?:\/(?:like|rate|keywords|comments))?)?$/.test(path)
    || /^\/api\/comments\/[^/]+(?:\/like)?$/.test(path)
    || /^\/api\/users\/[^/]+(?:\/audit-rank)?$/.test(path)
    || path === '/api/playback/claim-local'
    || path === '/api/stickers/notifications/read';
}
