import type { Env } from './index';
import { sessionContext } from './starryIdProfileDirectoryRouter';
import { ensureSpouseSchema } from './starryIdSpouseSchema';

const host='id.starry.phd', numeric=/^[0-9]+$/, synthetic=/^n[0-9]{7}$/;
const clean=(v:unknown)=>v==null?'':String(v).trim();
const json=(v:unknown,s=200)=>new Response(JSON.stringify(v),{status:s,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
const member=(db:any,id:string)=>db.prepare("SELECT u.id,u.status,p.name,p.amwayId,p.center,p.approvedRank FROM users u JOIN profiles p ON p.userId=u.id WHERE u.id=?").bind(id).first();
const link=(db:any,id:string)=>db.prepare("SELECT * FROM spouse_links WHERE (userA=? OR userB=?) AND status IN ('pending','active','unlink_pending') LIMIT 1").bind(id,id).first();
async function audit(db:any,userId:string,actorId:string,before:string,after:string,fieldName='amwayId'){
  await db.prepare("INSERT INTO profile_audit_logs (id,userId,appId,actorUserId,fieldName,oldValue,newValue,createdAt) VALUES (?,?,?,?,?,?,?,?)").bind(crypto.randomUUID(),userId,'starry-id',actorId,fieldName,before,after,Date.now()).run().catch(()=>undefined);
}
const owner=(db:any,num:string,exclude:string)=>db.prepare("SELECT userId FROM profiles WHERE amwayId=? AND userId<>? LIMIT 1").bind(num,exclude).first();
async function generate(db:any){
  for(let i=0;i<40;i++){
    const bits=new Uint32Array(1);crypto.getRandomValues(bits);
    const num='n'+String(bits[0]%10000000).padStart(7,'0');
    const exists=await db.prepare("SELECT userId FROM profiles WHERE amwayId=? LIMIT 1").bind(num).first();
    const reserved=await db.prepare("SELECT userId FROM non_distributor_ids WHERE number=? LIMIT 1").bind(num).first();
    const card:any=await db.prepare("SELECT userId FROM public_cards WHERE slug=? OR cardNumber=? LIMIT 1").bind(num,num).first().catch(()=>null);
    if(!exists&&!reserved&&!card)return num;
  }throw Error('no_available_non_distributor_number');
}
async function status(db:any,id:string){
  const me:any=await member(db,id),l:any=await link(db,id);
  const partnerId=l?(l.userA===id?l.userB:l.userA):'';
  const partner:any=partnerId?await member(db,partnerId):null;
  const visibleStatus=l?.status==='unlink_pending'?'active':l?.status;
  return {number:clean(me?.amwayId),nonDistributor:synthetic.test(clean(me?.amwayId)),spouse:l?{status:visibleStatus,partnerId,partnerName:clean(partner?.name),requestedBy:l.requestedBy,unlinkRequestedBy:visibleStatus==='active'?null:l.unlinkRequestedBy,keepUserId:visibleStatus==='active'?null:l.keepUserId}:null};
}
async function change(db:any,id:string,input:any){
  const me:any=await member(db,id);if(!me)return json({error:'找不到會員'},404);
  if(await link(db,id))return json({error:'夫妻關係處理中或已綁定，請先完成解除程序'},409);
  const now=Date.now();
  if(input.nonDistributor===true){
    const existing:any=await db.prepare("SELECT number FROM non_distributor_ids WHERE userId=?").bind(id).first();
    const history:any=await db.prepare("SELECT lastNumber FROM non_distributor_history WHERE userId=?").bind(id).first();
    const prior=clean(history?.lastNumber);
    const priorOwner=prior?await owner(db,prior,id):null;
    const priorReservation:any=prior?await db.prepare("SELECT userId FROM non_distributor_ids WHERE number=? AND userId<>?").bind(prior,id).first():null;
    const number=existing?.number===me.amwayId?existing.number:(synthetic.test(prior)&&!priorOwner&&!priorReservation?prior:await generate(db));
    try{await db.batch([
      db.prepare("DELETE FROM non_distributor_ids WHERE userId=?").bind(id),
      db.prepare("INSERT INTO non_distributor_ids(userId,number,createdAt) VALUES(?,?,?)").bind(id,number,now),
      db.prepare("UPDATE profiles SET amwayId=?,updatedAt=? WHERE userId=?").bind(number,now,id),
      db.prepare("INSERT INTO non_distributor_history(userId,lastNumber,updatedAt) VALUES(?,?,?) ON CONFLICT(userId) DO UPDATE SET lastNumber=excluded.lastNumber,updatedAt=excluded.updatedAt").bind(id,number,now)
    ]);}catch{return json({error:'編號產生衝突，請重試'},409);}
    await audit(db,id,id,clean(me.amwayId),number);
    return json({success:true,number,nonDistributor:true});
  }
  const number=clean(input.number);
  if(!numeric.test(number))return json({error:'直銷商編號只能輸入純數字'},400);
  const duplicate:any=await owner(db,number,id);
  if(!duplicate){
    const updates=[
      db.prepare("UPDATE profiles SET amwayId=?,updatedAt=? WHERE userId=?").bind(number,now,id),
      db.prepare("DELETE FROM non_distributor_ids WHERE userId=?").bind(id)
    ];
    if(synthetic.test(clean(me.amwayId)))updates.push(db.prepare("INSERT INTO non_distributor_history(userId,lastNumber,updatedAt) VALUES(?,?,?) ON CONFLICT(userId) DO UPDATE SET lastNumber=excluded.lastNumber,updatedAt=excluded.updatedAt").bind(id,clean(me.amwayId),now));
    await db.batch(updates);
    await audit(db,id,id,clean(me.amwayId),number);
    return json({success:true,number,nonDistributor:false});
  }
  const other:any=await member(db,duplicate.userId);
  if(!other||other.status!=='active'||await link(db,other.id))return json({error:'此編號已有夫妻關係或無法提出綁定申請'},409);
  if(input.confirmSpouse!==true)return json({requiresConfirmation:true,number,partner:{name:clean(other.name),rank:clean(other.approvedRank)||'未審核',center:clean(other.center)||'未設定'}});
  const third:any=await db.prepare("SELECT COUNT(*) AS count FROM profiles WHERE amwayId=? AND userId NOT IN (?,?)").bind(number,id,other.id).first();
  if(Number(third?.count||0)>0)return json({error:'此編號已有其他會員使用，無法建立夫妻綁定'},409);
  const users=[id,other.id].sort();
  const linkId=crypto.randomUUID();
  try {
    await db.batch([
      db.prepare("INSERT INTO spouse_links(id,userA,userB,status,requestedBy,createdAt,updatedAt) VALUES(?,?,?,'active',?,?,?)").bind(linkId,users[0],users[1],id,now,now),
      db.prepare("INSERT INTO spouse_slots(userId,linkId) VALUES (?,?)").bind(users[0],linkId),
      db.prepare("INSERT INTO spouse_slots(userId,linkId) VALUES (?,?)").bind(users[1],linkId),
      db.prepare("UPDATE profiles SET amwayId=?,updatedAt=? WHERE userId=?").bind(number,now,id),
      db.prepare("DELETE FROM non_distributor_ids WHERE userId=?").bind(id)
    ]);
  }catch{return json({error:'任一會員已有夫妻關係或待確認申請'},409)}
  await audit(db,id,id,clean(me.amwayId),number,'spouse-single-confirm');
  return json({success:true,number,spouseLinked:true,partner:{name:clean(other.name),rank:clean(other.approvedRank)||'未審核',center:clean(other.center)||'未設定'}});
}
async function action(db:any,id:string,input:any,isAdmin=false){
  const l:any=await link(db,id);if(!l)return json({error:'沒有待處理的夫妻關係'},404);
  const kind=clean(input.action),other=l.userA===id?l.userB:l.userA,now=Date.now();
  if(l.status==='pending'&&(kind==='cancel'||kind==='reject')){
    if((kind==='cancel')!==(l.requestedBy===id))return json({error:'無權執行此操作'},403);
    await db.batch([db.prepare("DELETE FROM spouse_links WHERE id=?").bind(l.id),db.prepare("DELETE FROM spouse_slots WHERE linkId=?").bind(l.id)]);return json({success:true});
  }
  if(l.status==='pending'&&kind==='approve'){
    if(l.requestedBy===id)return json({error:'必須由另一位會員確認'},403);
    const a:any=await member(db,id),b:any=await member(db,other);
    const num=clean(a?.amwayId);
    if(!numeric.test(num)||clean(input.number)!==num)return json({error:'請確認雙方使用相同的直銷商編號'},409);
    const third:any=await db.prepare("SELECT COUNT(*) AS count FROM profiles WHERE amwayId=? AND userId NOT IN (?,?)").bind(num,id,other).first();
    if(Number(third?.count||0)>0)return json({error:'此編號已有第三位使用者，無法綁定'},409);
    await db.batch([
      db.prepare("UPDATE spouse_links SET status='active',updatedAt=? WHERE id=? AND status='pending'").bind(now,l.id),
      db.prepare("UPDATE profiles SET amwayId=?,updatedAt=? WHERE userId=?").bind(num,now,other),
      db.prepare("DELETE FROM non_distributor_ids WHERE userId=?").bind(other)
    ]);await audit(db,other,id,clean(b?.amwayId),num,'spouse-approve');return json({success:true,status:'active'});
  }
  if((l.status==='active'||l.status==='unlink_pending')&&(kind==='request-unlink'||kind==='unlink')){
    const keep=clean(input.keepUserId);
    if(keep!==id&&keep!==other)return json({error:'請指定解除後誰保留原編號'},400);
    const loser=keep===l.userA?l.userB:l.userA;
    let replacement=clean(input.replacement);
    const autoAssigned=loser!==id;
    if(autoAssigned){
      replacement=await generate(db);
    }else{
      if(!replacement)return json({error:'若由對方保留原編號，請先選擇自己的新編號或非直銷商'},400);
      if(replacement==='nonDistributor')replacement=await generate(db);
      else if(!numeric.test(replacement))return json({error:'新編號只能是純數字'},400);
      if(await owner(db,replacement,loser))return json({error:'新編號已有人使用'},409);
    }
    const before:any=await member(db,loser);
    const statements=[
      db.prepare("UPDATE profiles SET amwayId=?,updatedAt=? WHERE userId=?").bind(replacement,now,loser),
      db.prepare("DELETE FROM spouse_links WHERE id=?").bind(l.id),
      db.prepare("DELETE FROM spouse_slots WHERE linkId=?").bind(l.id),
      db.prepare("DELETE FROM non_distributor_ids WHERE userId=?").bind(loser)
    ];
    if(synthetic.test(replacement)){
      statements.push(db.prepare("INSERT INTO non_distributor_ids(userId,number,createdAt) VALUES(?,?,?)").bind(loser,replacement,now));
      statements.push(db.prepare("INSERT INTO non_distributor_history(userId,lastNumber,updatedAt) VALUES(?,?,?) ON CONFLICT(userId) DO UPDATE SET lastNumber=excluded.lastNumber,updatedAt=excluded.updatedAt").bind(loser,replacement,now));
    }
    await db.batch(statements);
    await audit(db,loser,id,clean(before?.amwayId),replacement,'spouse-single-unlink');
    return json({success:true,status:'unlinked',keepUserId:keep,reassignedUserId:loser,replacement,autoAssigned});
  }
  if(l.status==='unlink_pending'&&kind==='cancel-unlink'&&l.unlinkRequestedBy===id){
    await db.prepare("UPDATE spouse_links SET status='active',unlinkRequestedBy=NULL,keepUserId=NULL,replacement=NULL WHERE id=?").bind(l.id).run();return json({success:true,status:'active'});
  }
  if(l.status==='unlink_pending'&&kind==='approve-unlink'){
    if(l.unlinkRequestedBy===id)return json({error:'需要另一位會員確認解除'},403);
    const loser=l.keepUserId===l.userA?l.userB:l.userA;
    let replacement=loser===id?clean(input.replacement):clean(l.replacement);
    if(!replacement)return json({error:'未保留原編號者必須選擇新的純數字編號或非直銷商'},400);
    if(replacement==='nonDistributor')replacement=await generate(db);
    else if(!numeric.test(replacement))return json({error:'新編號只能輸入純數字'},400);
    if(await owner(db,replacement,loser))return json({error:'新編號已被使用'},409);
    const statements=[
      db.prepare("UPDATE profiles SET amwayId=?,updatedAt=? WHERE userId=?").bind(replacement,now,loser),
      db.prepare("DELETE FROM spouse_links WHERE id=?").bind(l.id),
      db.prepare("DELETE FROM spouse_slots WHERE linkId=?").bind(l.id),
      db.prepare("DELETE FROM non_distributor_ids WHERE userId=?").bind(loser)
    ];
    if(synthetic.test(replacement))statements.push(db.prepare("INSERT INTO non_distributor_ids(userId,number,createdAt) VALUES(?,?,?)").bind(loser,replacement,now));
    const before:any=await member(db,loser);
    await db.batch(statements);await audit(db,loser,id,clean(before?.amwayId),replacement,'spouse-unlink');return json({success:true,status:'unlinked'});
  }
  if(kind==='admin-unlink'&&isAdmin&&l.status==='active'){
    const keep=clean(input.keepUserId);
    if(keep!==l.userA&&keep!==l.userB)return json({error:'管理員必須指定原編號保留者'},400);
    const loser=keep===l.userA?l.userB:l.userA;
    let replacement=clean(input.replacement);
    if(!replacement)return json({error:'管理員必須指定另一方的新編號或非直銷商'},400);
    if(replacement==='nonDistributor')replacement=await generate(db);
    else if(!numeric.test(replacement))return json({error:'新編號只能是純數字'},400);
    if(await owner(db,replacement,loser))return json({error:'新編號已被使用'},409);
    const statements=[
      db.prepare("UPDATE profiles SET amwayId=?,updatedAt=? WHERE userId=?").bind(replacement,now,loser),
      db.prepare("DELETE FROM spouse_links WHERE id=?").bind(l.id),
      db.prepare("DELETE FROM spouse_slots WHERE linkId=?").bind(l.id),
      db.prepare("DELETE FROM non_distributor_ids WHERE userId=?").bind(loser)
    ];
    if(synthetic.test(replacement))statements.push(db.prepare("INSERT INTO non_distributor_ids(userId,number,createdAt) VALUES(?,?,?)").bind(loser,replacement,now));
    const before:any=await member(db,loser);
    await db.batch(statements);await audit(db,loser,id,clean(before?.amwayId),replacement,'spouse-admin-unlink');return json({success:true,status:'unlinked',byAdmin:true});
  }
  return json({error:'關係狀態不允許此操作'},409);
}
export async function handleStarryIdSpouse(request:Request,env:Env):Promise<Response|null>{
  const url=new URL(request.url);
  if(url.hostname!==host||!['/api/distributor-number','/api/spouse-status','/api/spouse-action'].includes(url.pathname))return null;
  const session=await sessionContext(request,env);
  if(!session)return json({error:'請先登入 Starry ID'},401);
  const origin=request.headers.get('Origin');if(origin&&origin!==url.origin)return json({error:'Origin not allowed'},403);
  const db=(env as any).STARRY_ID_DB;
  try{
    await ensureSpouseSchema(db);
    if(url.pathname==='/api/spouse-status'&&request.method==='GET')return json(await status(db,session.userId));
    const input=await request.clone().json().catch(()=>({}));
    if(url.pathname==='/api/distributor-number'&&request.method==='PUT')return change(db,session.userId,input);
    if(url.pathname==='/api/spouse-action'&&request.method==='POST'){
      const target=clean(input.targetUserId);
      if(target&&target!==session.userId&&!session.isSuperAdmin)return json({error:'沒有管理權限'},403);
      return action(db,target&&session.isSuperAdmin?target:session.userId,input,session.isSuperAdmin);
    }
    return json({error:'Method not allowed'},405);
  }catch(e){console.warn('spouse service failed',{code:e instanceof Error?e.message:'unknown'});return json({error:'操作失敗，請稍後再試'},503);}
}
