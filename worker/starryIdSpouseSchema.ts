const ready=new WeakMap<object,Promise<void>>();
export async function ensureSpouseSchema(db:any){
  if(!ready.has(db)){
    const task=(async()=>{
      await db.prepare("CREATE TABLE IF NOT EXISTS spouse_links (id TEXT PRIMARY KEY,userA TEXT NOT NULL,userB TEXT NOT NULL,status TEXT NOT NULL,requestedBy TEXT NOT NULL,unlinkRequestedBy TEXT,keepUserId TEXT,replacement TEXT,createdAt INTEGER NOT NULL,updatedAt INTEGER NOT NULL)").run();
      await db.prepare("CREATE INDEX IF NOT EXISTS spouse_links_a ON spouse_links(userA,status)").run();
      await db.prepare("CREATE INDEX IF NOT EXISTS spouse_links_b ON spouse_links(userB,status)").run();
      await db.prepare("CREATE TABLE IF NOT EXISTS non_distributor_ids (userId TEXT PRIMARY KEY,number TEXT UNIQUE NOT NULL,createdAt INTEGER NOT NULL)").run();
    })();ready.set(db,task);task.catch(()=>ready.delete(db));
  }
  await ready.get(db);
}
