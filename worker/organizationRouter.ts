import appWorker from './stickerRouter';
import type { Env } from './index';
import {
  activeUsersByDealerId,
  bindCouple,
  bindDownlineToGroup,
  ensureOrganizationSchema,
  ensureSingleMemberOrganization,
  groupForDealerId,
  groupIdForUser,
  groupMembers,
  normalizeDealerId,
  organizationForUser,
  organizationSummary,
  syncLegacyLabelsForGroup
} from './organizationModel';

const SESSION_COOKIE = 'echostars_session';
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{30,}$/;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

function bearerToken(request: Request) {
  const match = request.headers.get('Authorization')?.match(/^Bearer\s+([A-Za-z0-9_-]{30,})$/i);
  return match?.[1] || '';
}

function cookieToken(request: Request) {
  const raw = request.headers.get('Cookie') || '';
  for (const part of raw.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0 || part.slice(0, separator).trim() !== SESSION_COOKIE) continue;
    const token = part.slice(separator + 1).trim();
    return TOKEN_PATTERN.test(token) ? token : '';
  }
  return '';
}

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2,'0')).join('');
}

async function verifiedActor(request: Request, env: Env) {
  if (!env.DB) return null;
  const token = bearerToken(request) || cookieToken(request);
  if (!TOKEN_PATTERN.test(token)) return null;
  const tokenHash = await hashToken(token);
  const actor: any = await env.DB.prepare(`
    SELECT u.id,u.email,u.name,u.amwayId,u.rank,u.approvedRank,u.rankApproved,u.rankAuditStatus,u.role,u.isBlocked,s.expiresAt
    FROM auth_sessions s JOIN users u ON u.id=s.userId
    WHERE s.tokenHash=? LIMIT 1
  `).bind(tokenHash).first();
  if (!actor || actor.isBlocked || Number(actor.expiresAt || 0) <= Date.now()) return null;
  return actor;
}

async function inviteGroup(db: any, dealerIdInput: string) {
  const dealerId = normalizeDealerId(dealerIdInput);
  if (!dealerId) return { error: '缺少直銷商編號', status: 400 } as const;
  const existing: any = await groupForDealerId(db,dealerId);
  if (existing) {
    const summary = await organizationSummary(db,existing.id);
    if (summary && summary.members.length) return { group: summary } as const;
  }
  const owners = await activeUsersByDealerId(db,dealerId);
  if (!owners.length) return { error: '找不到此直銷商編號', status: 404 } as const;
  if (owners.length > 2) return { error: '此直銷商編號超過兩位會員，請聯絡管理員處理', status: 409 } as const;
  if (owners.length === 2) return { error: '此編號已有兩位會員，但尚未確認夫妻關係', status: 409 } as const;
  const ensured = await ensureSingleMemberOrganization(db,String((owners[0] as any).id));
  if ('error' in ensured) return ensured;
  return { group: ensured.group } as const;
}

async function handleOrganizationApi(request: Request, env: Env, actor: any): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();
  if (!path.startsWith('/api/organization/')) return null;
  if (!actor) return json({ error: '請先登入會員' },401);
  const db = env.DB;

  if (path === '/api/organization/me' && method === 'GET') {
    const group = await organizationForUser(db,actor.id);
    if (!group) return json({ linked:false, displayName:actor.name || '', dealerId:normalizeDealerId(actor.amwayId), members:[] });
    const partner = group.members.find((member:any)=>member.id!==actor.id) || null;
    return json({ linked:group.members.length===2, displayName:group.displayName, dealerId:group.dealerId, kind:group.kind, partner:partner ? {id:partner.id,name:partner.name}:null, members:group.members.map((member:any)=>({id:member.id,name:member.name})) });
  }

  if (path === '/api/organization/upline-suggestions' && method === 'GET') {
    try {
      const { results } = await db.prepare(`SELECT kind,name FROM upline_names
        WHERE kind IN ('platinum','diamond') AND TRIM(COALESCE(name,''))<>''
        ORDER BY kind,name`).all();
      const platinum: string[] = [];
      const diamond: string[] = [];
      for (const row of results || []) {
        const name = String((row as any).name || '').trim();
        if (!name) continue;
        if ((row as any).kind === 'diamond') diamond.push(name);
        else if ((row as any).kind === 'platinum') platinum.push(name);
      }
      return json({ platinum: [...new Set(platinum)], diamond: [...new Set(diamond)] });
    } catch (error) {
      console.warn('Unable to load canonical upline name dictionary:', error);
      return json({ platinum: [], diamond: [] });
    }
  }

  if (path === '/api/organization/couple-candidate' && method === 'GET') {
    const dealerId = normalizeDealerId(url.searchParams.get('dealerId'));
    if (!dealerId) return json({ linked:false,candidate:null });
    const actorGroup = await organizationForUser(db,actor.id);
    if (actorGroup && actorGroup.members.length===2) {
      if (actorGroup.dealerId!==dealerId) return json({error:'夫妻共同經營使用同一個直銷商編號，如需變更請聯絡管理員'},409);
      const partner=actorGroup.members.find((member:any)=>member.id!==actor.id);
      return json({linked:true,candidate:partner?{id:partner.id,name:partner.name}:null,displayName:actorGroup.displayName});
    }
    const sameDealer=await activeUsersByDealerId(db,dealerId);
    const others=sameDealer.filter((row:any)=>row.id!==actor.id);
    if (others.length>1) return json({error:'此直銷商編號已有超過一位其他會員，請聯絡管理員處理'},409);
    const candidate:any=others[0] || null;
    if (candidate) {
      const candidateGroup=await organizationForUser(db,candidate.id);
      if (candidateGroup && candidateGroup.members.length===2 && !candidateGroup.members.some((member:any)=>member.id===actor.id)) {
        return json({error:`${candidate.name} 已綁定其他共同經營人`},409);
      }
    }
    return json({linked:false,candidate:candidate?{id:candidate.id,name:candidate.name}:null});
  }

  if (path === '/api/organization/couple-bind' && method === 'POST') {
    const body:any=await request.json().catch(()=>({}));
    const dealerId=normalizeDealerId(body.dealerId);
    const partnerId=String(body.partnerUserId || '').trim();
    if (!dealerId || !partnerId || partnerId===actor.id) return json({error:'夫妻綁定資料不完整'},400);
    const candidateRows=await activeUsersByDealerId(db,dealerId);
    const others=candidateRows.filter((row:any)=>row.id!==actor.id);
    if (others.length!==1 || String((others[0] as any).id)!==partnerId) return json({error:others.length>1?'此直銷商編號超過兩位會員，請聯絡管理員處理':'對方會員或直銷商編號已變更'},409);
    const oldDealerId=normalizeDealerId(actor.amwayId);
    await db.prepare('UPDATE users SET amwayId=? WHERE id=?').bind(dealerId,actor.id).run();
    const result=await bindCouple(db,actor.id,partnerId,dealerId);
    if ('error' in result) {
      await db.prepare('UPDATE users SET amwayId=? WHERE id=?').bind(oldDealerId,actor.id).run();
      return json({error:result.error},result.status);
    }
    return json({success:true,linked:true,displayName:result.group?.displayName || '',dealerId,partner:{id:partnerId,name:(others[0] as any).name}});
  }

  if (path === '/api/organization/invite-link' && method === 'GET') {
    const ensured=await ensureSingleMemberOrganization(db,actor.id);
    if ('error' in ensured) return json({error:ensured.error,code:(ensured as any).code},ensured.status);
    const group=ensured.group;
    if (!group?.kind) return json({error:'此功能只提供已審核白金級以上會員使用'},403);
    return json({url:`${url.origin}/upline/${encodeURIComponent(group.dealerId)}`,dealerId:group.dealerId,displayName:group.displayName,kind:group.kind});
  }

  if (path === '/api/organization/invite-accept' && method === 'POST') {
    const body:any=await request.json().catch(()=>({}));
    const found=await inviteGroup(db,body.dealerId);
    if ('error' in found) return json({error:found.error},found.status);
    const group=found.group;
    if (!group?.kind) return json({error:'此邀請來源尚未通過白金級以上獎銜審核'},403);
    const bound=await bindDownlineToGroup(db,actor.id,group.id,group.kind);
    if ('error' in bound) return json({error:bound.error},bound.status);
    const user:any=await db.prepare('SELECT * FROM users WHERE id=?').bind(actor.id).first();
    return json({success:true,kind:group.kind,displayName:group.displayName,user,message:`已自動綁定${group.kind==='diamond'?'上手鑽石':'上手白金'}：${group.displayName}`});
  }

  return json({error:'找不到組織綁定功能'},404);
}

async function guardProfileWrite(request: Request, env: Env, actor: any): Promise<Response | null> {
  if (!actor) return null;
  const url=new URL(request.url);
  if (request.method.toUpperCase()!=='PUT' || url.pathname!==`/api/users/${encodeURIComponent(actor.id)}`) return null;
  const body:any=await request.clone().json().catch(()=>({}));
  const hasDealerId=Object.prototype.hasOwnProperty.call(body,'amwayId');
  const currentGroup=await organizationForUser(env.DB,actor.id);
  if (hasDealerId) {
    const nextDealerId=normalizeDealerId(body.amwayId);
    if (currentGroup?.members.length===2 && nextDealerId!==currentGroup.dealerId) return json({error:'夫妻共同經營使用同一個直銷商編號，如需變更請聯絡管理員'},409);
    if (nextDealerId) {
      const rows=await activeUsersByDealerId(env.DB,nextDealerId);
      const others=rows.filter((row:any)=>row.id!==actor.id);
      if (others.length>1) return json({error:'此直銷商編號已有超過一位其他會員，請聯絡管理員處理'},409);
      if (others.length===1) {
        const actorGroupId=await groupIdForUser(env.DB,actor.id);
        const otherGroupId=await groupIdForUser(env.DB,String((others[0] as any).id));
        if (!actorGroupId || actorGroupId!==otherGroupId) return json({error:`此直銷商編號已由 ${(others[0] as any).name} 使用，請先確認夫妻關係或更正編號`,code:'COUPLE_CONFIRM_REQUIRED',candidate:{id:(others[0] as any).id,name:(others[0] as any).name}},409);
      }
    }
  }
  const response=await appWorker.fetch(request,env);
  if (!response.ok) return response;
  if (hasDealerId && currentGroup && currentGroup.members.length===1) await ensureSingleMemberOrganization(env.DB,actor.id);
  const groupId=await groupIdForUser(env.DB,actor.id);
  if (groupId && Object.prototype.hasOwnProperty.call(body,'name')) await syncLegacyLabelsForGroup(env.DB,groupId);
  return response;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!env.DB) return appWorker.fetch(request,env);
    const url=new URL(request.url);
    const relevant=url.pathname.startsWith('/api/organization/') || (request.method.toUpperCase()==='PUT' && url.pathname.startsWith('/api/users/'));
    if (!relevant) return appWorker.fetch(request,env);
    try {
      await ensureOrganizationSchema(env.DB);
      const actor=await verifiedActor(request,env);
      const apiResponse=await handleOrganizationApi(request,env,actor);
      if (apiResponse) return apiResponse;
      const profileResponse=await guardProfileWrite(request,env,actor);
      if (profileResponse) return profileResponse;
      return appWorker.fetch(request,env);
    } catch (error) {
      console.error('Organization router failed:',error);
      return json({error:'組織關係處理失敗，請稍後再試'},500);
    }
  }
};
