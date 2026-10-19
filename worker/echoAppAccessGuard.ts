import type { Env } from './index';
import { checkStarryAppAccess } from './starryAppAccess';

const AUTH_COOKIE = 'echostars_session';
const TOKEN_RE = /^[A-Za-z0-9_-]{30,}$/;

function echoToken(request: Request) {
  const bearer = request.headers.get('Authorization')?.match(/^Bearer\s+([A-Za-z0-9_-]{30,})$/i)?.[1];
  if (bearer) return bearer;
  for (const part of (request.headers.get('Cookie') || '').split(';')) {
    const pos = part.indexOf('=');
    if (pos < 0 || part.slice(0,pos).trim() !== AUTH_COOKIE) continue;
    const cookieToken=part.slice(pos+1).trim();
    return TOKEN_RE.test(cookieToken)?cookieToken:'';
  }
  return '';
}
async function tokenHash(token:string) {
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest),x=>x.toString(16).padStart(2,'0')).join('');
}

/**
 * Check on the central server before any member-specific Echo request.
 * Public landing / audio streaming remains available to visitors; no token
 * means normal visitor handling and never triggers a central D1 lookup.
 */
function needsMemberAccessCheck(path:string,method:string) {
  if (path==='/') return method==='GET' || method==='HEAD';
  if (!path.startsWith('/api/')) return false;
  if (method==='OPTIONS') return false;
  if (method==='GET' || method==='HEAD') {
    if (path==='/api/tracks'||path==='/api/categories'||path==='/api/keywords') return false;
    if (path.startsWith('/api/r2/file/')) return false;
    if (path.startsWith('/api/r2/covers')) return false;
  }
  // Users must always be able to switch accounts, log out or log in.
  if (path==='/api/auth/logout'||path==='/api/users/google-sync') return false;
  return true;
}
function refusal(path:string,message:string,status:number) {
  if(path==='/'){
    return new Response('<!doctype html><html lang="zh-Hant"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><main style="max-width:460px;margin:14vh auto;padding:24px;text-align:center;font-family:system-ui"><h1>'+message+'</h1><p>請登入 Starry ID，或聯絡繁星管理員。</p><a href="https://id.starry.phd/">前往 Starry ID</a></main></html>',{status,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
  }
  return new Response(JSON.stringify({error:message,code:status===403?'APP_ACCESS_DENIED':'CENTRAL_AUTH_REQUIRED'}),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
}
export async function guardEchoAppAccess(request:Request,env:Env): Promise<Response|null> {
  const url=new URL(request.url);
  if(url.hostname!=='echo.starry.phd'||!needsMemberAccessCheck(url.pathname,request.method.toUpperCase()))return null;
  const token=echoToken(request);
  if(!token)return null;
  if(!env.DB || !(env as any).STARRY_ID_DB)return refusal(url.pathname,'會員權限驗證暫時無法使用',503);
  let member:any;
  try {
    member=await env.DB.prepare('SELECT userId,expiresAt FROM auth_sessions WHERE tokenHash=? LIMIT 1')
      .bind(await tokenHash(token)).first();
  } catch {
    return refusal(url.pathname,'會員權限驗證暫時無法使用',503);
  }
  if(!member || Number(member.expiresAt||0)<=Date.now())return null; // downstream visitor/expired-session logic
  try {
    const central=(env as any).STARRY_ID_DB;
    const mapped:any=await central.prepare("SELECT userId FROM legacy_links WHERE sourceApp='echostars' AND sourceUserId=? LIMIT 1")
      .bind(String(member.userId)).first();
    const centralId=String(mapped?.userId||'').trim();
    if(!centralId)return refusal(url.pathname,'請重新登入 Starry ID',401);
    const access=await checkStarryAppAccess(central,centralId,'echostars');
    if(!access.allowed)return refusal(url.pathname,'您沒有使用權限',403);
    return null;
  }catch(error){
    console.warn('Echo central App permission check failed',error instanceof Error?error.message:'unknown');
    return refusal(url.pathname,'會員權限驗證暫時無法使用',503);
  }
}
