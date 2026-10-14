import { sessionContext } from './starryIdProfileDirectoryRouter';
import type { Env } from './index';

type SchemaEnv = Env & { STARRY_ID_DB?: any };

type SchemaField = {
  fieldKey: string;
  label: string;
  fieldType: string;
  storageMode: string;
  optionsCategory?: string | null;
  required: boolean | number;
  minLength?: number | null;
  maxLength?: number | null;
  pattern?: string | null;
  placeholder?: string | null;
  helpText?: string | null;
  editableBy: string;
  isActive: boolean | number;
  sortOrder: number;
};

const ECHO_HOST = 'echo.starry.phd';
const ID_HOST = 'id.starry.phd';
const SESSION_COOKIE = 'echostars_session';
const TOKEN_RE = /^[A-Za-z0-9_-]{30,}$/;
const CACHE_SECONDS = 60;
const schemaReady = new WeakMap<object, Promise<void>>();

const DEFAULT_FIELDS: SchemaField[] = [
  {fieldKey:'name',label:'姓名或暱稱',fieldType:'text',storageMode:'core',required:true,minLength:1,maxLength:60,editableBy:'member',isActive:true,sortOrder:10},
  {fieldKey:'avatar',label:'大頭照',fieldType:'image',storageMode:'special',required:false,editableBy:'special',isActive:true,sortOrder:20},
  {fieldKey:'amwayId',label:'直銷商編號',fieldType:'text',storageMode:'special',required:false,minLength:1,maxLength:40,pattern:'^[A-Za-z0-9_-]+$',editableBy:'special',isActive:true,sortOrder:30},
  {fieldKey:'phone',label:'手機',fieldType:'text',storageMode:'core',required:false,maxLength:30,editableBy:'member',isActive:true,sortOrder:40},
  {fieldKey:'residence',label:'居住地',fieldType:'select',storageMode:'core',optionsCategory:'residence',required:false,editableBy:'member',isActive:true,sortOrder:50},
  {fieldKey:'center',label:'直銷商中心',fieldType:'select',storageMode:'core',optionsCategory:'center',required:false,editableBy:'member',isActive:true,sortOrder:60},
  {fieldKey:'rank',label:'最高獎銜',fieldType:'select',storageMode:'core',optionsCategory:'rank',required:false,editableBy:'member',isActive:true,sortOrder:70},
  {fieldKey:'joinReason',label:'初次如何認識安麗？',fieldType:'select',storageMode:'core',optionsCategory:'joinReason',required:false,editableBy:'member',isActive:true,sortOrder:80},
  {fieldKey:'stayReason',label:'什麼原因留在安麗？',fieldType:'select',storageMode:'core',optionsCategory:'stayReason',required:false,editableBy:'member',isActive:true,sortOrder:90},
  {fieldKey:'sponsor',label:'推薦人',fieldType:'relationship',storageMode:'special',required:false,editableBy:'special',isActive:true,sortOrder:100},
  {fieldKey:'platinumUpline',label:'上手白金',fieldType:'relationship',storageMode:'special',required:false,editableBy:'special',isActive:true,sortOrder:110},
  {fieldKey:'diamondUpline',label:'上手鑽石',fieldType:'relationship',storageMode:'special',required:false,editableBy:'special',isActive:true,sortOrder:120},
  {fieldKey:'birthday',label:'西元生日',fieldType:'date',storageMode:'core',required:false,editableBy:'member',isActive:true,sortOrder:130},
  {fieldKey:'motto',label:'座右銘',fieldType:'textarea',storageMode:'core',required:false,maxLength:300,editableBy:'member',isActive:true,sortOrder:140},
  {fieldKey:'zodiac',label:'星座',fieldType:'text',storageMode:'derived',required:false,editableBy:'readonly',isActive:true,sortOrder:150},
  {fieldKey:'talentNumber',label:'天賦數',fieldType:'number',storageMode:'derived',required:false,editableBy:'readonly',isActive:true,sortOrder:160},
  {fieldKey:'lifeNumber',label:'生命靈數',fieldType:'number',storageMode:'derived',required:false,editableBy:'readonly',isActive:true,sortOrder:170},
  {fieldKey:'spouse',label:'夫妻關係',fieldType:'relationship',storageMode:'special',required:false,editableBy:'readonly',isActive:true,sortOrder:180}
];

function text(value: unknown) { return value == null ? '' : String(value).trim(); }
function lower(value: unknown) { return text(value).toLowerCase(); }

function cookieValue(request: Request, name: string) {
  for (const part of (request.headers.get('Cookie') || '').split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== name) continue;
    return decodeURIComponent(part.slice(separator + 1).trim());
  }
  return '';
}

async function hashToken(token: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2,'0')).join('');
}

function allowedOrigin(request: Request) {
  const origin = request.headers.get('Origin') || '';
  if (!origin) return '';
  try {
    const parsed = new URL(origin);
    if (parsed.protocol === 'https:' && (parsed.hostname === 'starry.phd' || parsed.hostname.endsWith('.starry.phd'))) return origin;
    if ((parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') && ['http:','https:'].includes(parsed.protocol)) return origin;
  } catch { /* invalid origin */ }
  return '';
}

function headers(request: Request, cacheControl = 'no-store') {
  const result = new Headers({
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':cacheControl,
    'X-Robots-Tag':'noindex, nofollow, noarchive',
    'X-Content-Type-Options':'nosniff',
    'Vary':'Origin'
  });
  const origin = allowedOrigin(request);
  if (origin) {
    result.set('Access-Control-Allow-Origin',origin);
    result.set('Access-Control-Allow-Methods','GET, PUT, OPTIONS');
    result.set('Access-Control-Allow-Headers','Content-Type, Authorization, If-None-Match');
    result.set('Access-Control-Allow-Credentials','true');
  }
  return result;
}

function json(request: Request, data: unknown, status = 200, cacheControl = 'no-store', extra?: HeadersInit) {
  const h = headers(request, cacheControl);
  if (extra) new Headers(extra).forEach((value,key)=>h.set(key,value));
  return new Response(JSON.stringify(data),{status,headers:h});
}

async function ensureSchema(db: any) {
  if (!db) return;
  const key = db as object;
  if (!schemaReady.has(key)) {
    const task = (async()=>{
      await db.prepare(`CREATE TABLE IF NOT EXISTS profile_schema_meta (
        id TEXT PRIMARY KEY CHECK(id='profile'),version INTEGER NOT NULL DEFAULT 1,updatedAt INTEGER NOT NULL
      )`).run();
      await db.prepare(`CREATE TABLE IF NOT EXISTS profile_field_schema (
        fieldKey TEXT PRIMARY KEY,label TEXT NOT NULL,fieldType TEXT NOT NULL,storageMode TEXT NOT NULL,
        optionsCategory TEXT,required INTEGER NOT NULL DEFAULT 0,minLength INTEGER,maxLength INTEGER,pattern TEXT,
        placeholder TEXT,helpText TEXT,editableBy TEXT NOT NULL DEFAULT 'member',isActive INTEGER NOT NULL DEFAULT 1,
        sortOrder INTEGER NOT NULL DEFAULT 0,updatedAt INTEGER NOT NULL
      )`).run();
      await db.prepare(`CREATE TABLE IF NOT EXISTS profile_dynamic_values (
        userId TEXT NOT NULL,fieldKey TEXT NOT NULL,value TEXT NOT NULL DEFAULT '',updatedAt INTEGER NOT NULL,
        PRIMARY KEY(userId,fieldKey),FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(fieldKey) REFERENCES profile_field_schema(fieldKey) ON DELETE CASCADE
      )`).run();
      await db.prepare('CREATE INDEX IF NOT EXISTS profile_field_schema_active ON profile_field_schema(isActive,sortOrder,fieldKey)').run();
      await db.prepare('CREATE INDEX IF NOT EXISTS profile_dynamic_values_user ON profile_dynamic_values(userId,fieldKey)').run();
      const now = Date.now();
      await db.prepare("INSERT OR IGNORE INTO profile_schema_meta(id,version,updatedAt) VALUES('profile',1,?)").bind(now).run();
      const inserts = DEFAULT_FIELDS.map(field => db.prepare(`INSERT OR IGNORE INTO profile_field_schema
        (fieldKey,label,fieldType,storageMode,optionsCategory,required,minLength,maxLength,pattern,placeholder,helpText,editableBy,isActive,sortOrder,updatedAt)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
          field.fieldKey,field.label,field.fieldType,field.storageMode,field.optionsCategory || null,field.required?1:0,
          field.minLength ?? null,field.maxLength ?? null,field.pattern ?? null,field.placeholder ?? null,field.helpText ?? null,
          field.editableBy,field.isActive?1:0,field.sortOrder,now
        ));
      if (inserts.length) await db.batch(inserts);
      for (const sql of [
        `CREATE TRIGGER IF NOT EXISTS profile_field_schema_version_insert AFTER INSERT ON profile_field_schema BEGIN UPDATE profile_schema_meta SET version=version+1,updatedAt=CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id='profile'; END`,
        `CREATE TRIGGER IF NOT EXISTS profile_field_schema_version_update AFTER UPDATE ON profile_field_schema BEGIN UPDATE profile_schema_meta SET version=version+1,updatedAt=CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id='profile'; END`,
        `CREATE TRIGGER IF NOT EXISTS profile_field_schema_version_delete AFTER DELETE ON profile_field_schema BEGIN UPDATE profile_schema_meta SET version=version+1,updatedAt=CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id='profile'; END`,
        `CREATE TRIGGER IF NOT EXISTS profile_option_values_schema_version_insert AFTER INSERT ON profile_option_values BEGIN UPDATE profile_schema_meta SET version=version+1,updatedAt=CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id='profile'; END`,
        `CREATE TRIGGER IF NOT EXISTS profile_option_values_schema_version_update AFTER UPDATE ON profile_option_values BEGIN UPDATE profile_schema_meta SET version=version+1,updatedAt=CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id='profile'; END`,
        `CREATE TRIGGER IF NOT EXISTS profile_option_values_schema_version_delete AFTER DELETE ON profile_option_values BEGIN UPDATE profile_schema_meta SET version=version+1,updatedAt=CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id='profile'; END`
      ]) await db.prepare(sql).run();
    })();
    schemaReady.set(key,task);
    task.catch(()=>schemaReady.delete(key));
  }
  await schemaReady.get(key);
}

async function readSchema(env: SchemaEnv) {
  const db = env.STARRY_ID_DB;
  if (!db) return {version:0,updatedAt:0,fields:DEFAULT_FIELDS,options:{},source:'starry-id-fallback',supportsDynamicFields:true};
  await ensureSchema(db);
  const meta:any = await db.prepare("SELECT version,updatedAt FROM profile_schema_meta WHERE id='profile' LIMIT 1").first();
  const fieldsResult:any = await db.prepare(`SELECT fieldKey,label,fieldType,storageMode,optionsCategory,required,minLength,maxLength,pattern,placeholder,helpText,editableBy,isActive,sortOrder
    FROM profile_field_schema WHERE isActive=1 ORDER BY sortOrder,fieldKey`).all();
  const optionResult:any = await db.prepare(`SELECT category,value FROM profile_option_values WHERE isActive=1 ORDER BY category,sortOrder,value`).all();
  const options:Record<string,string[]> = {};
  for (const row of optionResult?.results || []) (options[String(row.category)] ||= []).push(String(row.value));
  const fields = (fieldsResult?.results || []).map((row:any)=>({...row,required:Boolean(row.required),isActive:Boolean(row.isActive)}));
  return {version:Number(meta?.version || 1),updatedAt:Number(meta?.updatedAt || 0),fields,options,source:'starry-id-central',supportsDynamicFields:true};
}

function edgeCache() { return (globalThis as any).caches?.default as any; }
function cacheKey(request: Request) { return new Request(`${new URL(request.url).origin}/api/profile-schema`,{method:'GET'}); }
async function invalidate(request: Request) { await edgeCache()?.delete(cacheKey(request)).catch(()=>undefined); }

async function profileSchema(request: Request, env: SchemaEnv) {
  const cache = edgeCache();
  const key = cacheKey(request);
  if (cache && !request.headers.get('If-None-Match')) {
    const hit = await cache.match(key).catch(()=>null);
    if (hit) return hit;
  }
  const data = await readSchema(env);
  const etag = `\"starry-profile-schema-v${data.version}\"`;
  if (request.headers.get('If-None-Match') === etag) return new Response(null,{status:304,headers:{ETag:etag,'Cache-Control':`public, max-age=${CACHE_SECONDS}, stale-while-revalidate=300`}});
  const response = json(request,data,200,`public, max-age=${CACHE_SECONDS}, s-maxage=300, stale-while-revalidate=86400`,{ETag:etag});
  if (cache && data.source === 'starry-id-central') await cache.put(key,response.clone()).catch(()=>undefined);
  return response;
}

async function echoUser(request: Request, env: SchemaEnv) {
  if (!env.DB) return '';
  const bearer = request.headers.get('Authorization')?.match(/^Bearer\s+([A-Za-z0-9_-]{30,})$/i)?.[1] || '';
  const token = bearer || cookieValue(request,SESSION_COOKIE);
  if (!TOKEN_RE.test(token)) return '';
  const tokenHash = await hashToken(token);
  const row:any = await env.DB.prepare(`SELECT s.userId,s.expiresAt,u.isBlocked FROM auth_sessions s JOIN users u ON u.id=s.userId WHERE s.tokenHash=? LIMIT 1`).bind(tokenHash).first();
  if (!row || Number(row.expiresAt || 0) <= Date.now() || row.isBlocked) return '';
  return text(row.userId);
}

async function identity(request: Request, env: SchemaEnv) {
  if (new URL(request.url).hostname === ID_HOST) {
    const session:any = await sessionContext(request,env);
    return session ? {userId:text(session.userId),isSuperAdmin:Boolean(session.isSuperAdmin)} : null;
  }
  const userId = await echoUser(request,env);
  return userId ? {userId,isSuperAdmin:false} : null;
}

function normalized(field:any, raw:unknown) {
  if (field.fieldType === 'checkbox') return raw === true || raw === 1 || raw === '1' || raw === 'true' ? '1' : '0';
  return raw == null ? '' : String(raw).trim();
}

function validate(field:any, raw:unknown, options:Record<string,string[]>) {
  const value = normalized(field,raw);
  if (field.required && !value) return `${field.label}為必填欄位`;
  if (!value) return '';
  const length = Array.from(value).length;
  if (field.minLength != null && length < Number(field.minLength)) return `${field.label}至少需要 ${field.minLength} 個字元`;
  if (field.maxLength != null && length > Number(field.maxLength)) return `${field.label}最多 ${field.maxLength} 個字元`;
  if (field.pattern) {
    try { if (!new RegExp(String(field.pattern)).test(value)) return `${field.label}格式不正確`; }
    catch { return `${field.label}的中央驗證規則設定有誤`; }
  }
  if (field.fieldType === 'select' && field.optionsCategory) {
    const allowed = options[String(field.optionsCategory)] || [];
    if (allowed.length && !allowed.includes(value)) return `${field.label}請使用中央清單中的選項`;
  }
  if (field.fieldType === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${field.label}日期格式不正確`;
  if (field.fieldType === 'number' && !Number.isFinite(Number(value))) return `${field.label}必須是數字`;
  return '';
}

export async function validateStarryProfileCoreWrite(request: Request, env: SchemaEnv): Promise<Response|null> {
  if (request.method.toUpperCase() !== 'PUT') return null;
  const url = new URL(request.url);
  const applies = (url.hostname === ECHO_HOST && /^\/api\/users\/[^/]+$/.test(url.pathname)) ||
    (url.hostname === ID_HOST && (url.pathname === '/api/profile' || /^\/api\/admin\/members\/[^/]+$/.test(url.pathname)));
  if (!applies) return null;
  const body:any = await request.clone().json().catch(()=>null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const schema = await readSchema(env);
  for (const field of schema.fields as any[]) {
    if (field.storageMode !== 'core' || ['readonly','special'].includes(field.editableBy)) continue;
    if (!Object.prototype.hasOwnProperty.call(body,field.fieldKey)) continue;
    const error = validate(field,body[field.fieldKey],schema.options as Record<string,string[]>);
    if (error) return json(request,{error,field:field.fieldKey,schemaVersion:schema.version},422);
  }
  return null;
}

async function readExtra(request: Request, env: SchemaEnv) {
  const who = await identity(request,env);
  if (!who) return json(request,{error:'請先登入會員'},401);
  if (!env.STARRY_ID_DB) return json(request,{error:'Starry ID 中央資料庫未連線'},503);
  await ensureSchema(env.STARRY_ID_DB);
  const rows:any = await env.STARRY_ID_DB.prepare(`SELECT v.fieldKey,v.value FROM profile_dynamic_values v JOIN profile_field_schema f ON f.fieldKey=v.fieldKey WHERE v.userId=? AND f.isActive=1 AND f.storageMode='dynamic'`).bind(who.userId).all();
  const values:Record<string,string> = {};
  for (const row of rows?.results || []) values[String(row.fieldKey)] = String(row.value || '');
  return json(request,{values});
}

async function writeExtra(request: Request, env: SchemaEnv) {
  const url = new URL(request.url);
  const origin = request.headers.get('Origin');
  if (origin && origin !== url.origin) return json(request,{error:'不允許跨站修改會員資料'},403);
  const who = await identity(request,env);
  if (!who) return json(request,{error:'請先登入會員'},401);
  if (!env.STARRY_ID_DB) return json(request,{error:'Starry ID 中央資料庫未連線'},503);
  const body:any = await request.clone().json().catch(()=>({}));
  const incoming = body?.values && typeof body.values === 'object' && !Array.isArray(body.values) ? body.values : {};
  const schema = await readSchema(env);
  const dynamic = (schema.fields as any[]).filter(field=>field.storageMode==='dynamic' && field.isActive && !['readonly','special'].includes(field.editableBy));
  const byKey = new Map(dynamic.map((field:any)=>[field.fieldKey,field]));
  const statements:any[] = [];
  const now = Date.now();
  for (const [key,raw] of Object.entries(incoming)) {
    const field:any = byKey.get(key);
    if (!field) continue;
    const error = validate(field,raw,schema.options as Record<string,string[]>);
    if (error) return json(request,{error,field:key,schemaVersion:schema.version},422);
    statements.push(env.STARRY_ID_DB.prepare(`INSERT INTO profile_dynamic_values(userId,fieldKey,value,updatedAt) VALUES(?,?,?,?) ON CONFLICT(userId,fieldKey) DO UPDATE SET value=excluded.value,updatedAt=excluded.updatedAt`).bind(who.userId,key,normalized(field,raw),now));
  }
  if (statements.length) await env.STARRY_ID_DB.batch(statements);
  return readExtra(request,env);
}

const TYPES = new Set(['text','textarea','select','date','number','checkbox','relationship','image']);
const STORAGE = new Set(['core','dynamic','derived','special']);
const EDITORS = new Set(['member','admin','readonly','special']);
const KEY_RE = /^[A-Za-z][A-Za-z0-9_]{0,63}$/;

async function writeSchema(request: Request, env: SchemaEnv) {
  if (new URL(request.url).hostname !== ID_HOST) return json(request,{error:'只能在 Starry ID 中央網域修改 Schema'},403);
  const session:any = await sessionContext(request,env);
  if (!session?.isSuperAdmin) return json(request,{error:'只有 Starry ID Super Admin 可以修改中央欄位規則'},403);
  if (!env.STARRY_ID_DB) return json(request,{error:'Starry ID 中央資料庫未連線'},503);
  const input:any = await request.clone().json().catch(()=>({}));
  const fields = Array.isArray(input.fields) ? input.fields : [];
  if (!fields.length) return json(request,{error:'缺少 fields'},400);
  await ensureSchema(env.STARRY_ID_DB);
  const statements:any[] = [];
  const now = Date.now();
  for (const raw of fields) {
    const fieldKey = text(raw?.fieldKey), label = text(raw?.label);
    const fieldType = lower(raw?.fieldType || 'text'), storageMode = lower(raw?.storageMode || 'dynamic'), editableBy = lower(raw?.editableBy || 'member');
    if (!KEY_RE.test(fieldKey) || !label || !TYPES.has(fieldType) || !STORAGE.has(storageMode) || !EDITORS.has(editableBy)) return json(request,{error:`欄位設定不合法：${fieldKey || '未命名'}`},400);
    const pattern = text(raw?.pattern);
    if (pattern) { try { new RegExp(pattern); } catch { return json(request,{error:`${label} 的 pattern 不是有效正規表示式`},400); } }
    const minLength = raw?.minLength == null || raw.minLength === '' ? null : Math.max(0,Math.trunc(Number(raw.minLength)));
    const maxLength = raw?.maxLength == null || raw.maxLength === '' ? null : Math.max(0,Math.trunc(Number(raw.maxLength)));
    if (minLength != null && maxLength != null && minLength > maxLength) return json(request,{error:`${label} 的最小長度不能大於最大長度`},400);
    const existing:any = await env.STARRY_ID_DB.prepare('SELECT storageMode FROM profile_field_schema WHERE fieldKey=? LIMIT 1').bind(fieldKey).first();
    if (existing && existing.storageMode !== 'dynamic' && storageMode !== existing.storageMode) return json(request,{error:`既有核心欄位 ${fieldKey} 不允許改變儲存模式`},409);
    statements.push(env.STARRY_ID_DB.prepare(`INSERT INTO profile_field_schema(fieldKey,label,fieldType,storageMode,optionsCategory,required,minLength,maxLength,pattern,placeholder,helpText,editableBy,isActive,sortOrder,updatedAt)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(fieldKey) DO UPDATE SET label=excluded.label,fieldType=excluded.fieldType,storageMode=excluded.storageMode,optionsCategory=excluded.optionsCategory,required=excluded.required,minLength=excluded.minLength,maxLength=excluded.maxLength,pattern=excluded.pattern,placeholder=excluded.placeholder,helpText=excluded.helpText,editableBy=excluded.editableBy,isActive=excluded.isActive,sortOrder=excluded.sortOrder,updatedAt=excluded.updatedAt`).bind(
      fieldKey,label,fieldType,storageMode,text(raw?.optionsCategory)||null,raw?.required?1:0,minLength,maxLength,pattern||null,text(raw?.placeholder)||null,text(raw?.helpText)||null,editableBy,raw?.isActive===false?0:1,Math.trunc(Number(raw?.sortOrder)||0),now
    ));
  }
  await env.STARRY_ID_DB.batch(statements);
  await invalidate(request);
  return profileSchema(new Request(new URL('/api/profile-schema',request.url),{method:'GET'}),env);
}

export async function handleStarryProfileSchemaRequest(request: Request, env: SchemaEnv): Promise<Response|null> {
  const path = new URL(request.url).pathname;
  if (!['/api/profile-schema','/api/profile-extra'].includes(path)) return null;
  const method = request.method.toUpperCase();
  if (method === 'OPTIONS') return new Response(null,{status:204,headers:headers(request)});
  if (path === '/api/profile-schema' && method === 'GET') return profileSchema(request,env);
  if (path === '/api/profile-schema' && method === 'PUT') return writeSchema(request,env);
  if (path === '/api/profile-extra' && method === 'GET') return readExtra(request,env);
  if (path === '/api/profile-extra' && method === 'PUT') return writeExtra(request,env);
  return json(request,{error:'Method not allowed'},405);
}

const ECHO_CLIENT = String.raw`<script id="starry-profile-schema-client">(()=>{
const CACHE='starry-profile-schema-cache-v1',CORE={name:'姓名或暱稱',phone:'手機',residence:'居住地',center:'直銷商中心',rank:'最高獎銜',joinReason:'初次如何認識安麗？',stayReason:'什麼原因留在安麗？',birthday:'西元生日'};let schema=null,extra=null,last=0,pending=null,bypass=false,saving=false,raf=0;
function local(){try{return JSON.parse(localStorage.getItem(CACHE)||'null')}catch{return null}}function t(e){return(e?.textContent||'').replace(/（.*?）|\(.*?\)/g,'').trim()}
async function load(force=false){const now=Date.now(),old=local();if(!force&&schema&&now-last<60000)return schema;if(pending)return pending;last=now;pending=(async()=>{try{const h={};if(old?.etag)h['If-None-Match']=old.etag;const r=await fetch('/api/profile-schema',{headers:h,cache:'no-cache'});if(r.status===304&&old?.data)return schema=old.data;if(!r.ok)throw 0;const data=await r.json(),etag=r.headers.get('ETag')||'';schema=data;try{localStorage.setItem(CACHE,JSON.stringify({etag,data}))}catch{}return data}catch{return schema=old?.data||schema}finally{pending=null}})();return pending}
async function loadExtra(){try{const r=await fetch('/api/profile-extra',{credentials:'same-origin',cache:'no-store'});if(!r.ok)return null;const d=await r.json();extra=d.values||{};return extra}catch{return null}}
function root(){const r=document.querySelector('.profile-page');return r&&t(r.querySelector('h2'))==='個人中心'?r:null}function active(r){const b=[...r.querySelectorAll('button')].find(x=>t(x)==='自我介紹');return!!b&&b.className.includes('border-rose-500')}function editing(r){return[...r.querySelectorAll('button')].some(b=>t(b)==='儲存')&&[...r.querySelectorAll('span')].some(s=>t(s)==='編輯個人基本資料')}
function box(r,label){return[...r.querySelectorAll('label')].find(l=>t(l).startsWith(label))?.parentElement||null}function setSelect(s,v){const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value')?.set;if(set)set.call(s,v);else s.value=v;s.dispatchEvent(new Event('change',{bubbles:true}))}
function limits(i,f){if(!i)return;i.required=!!f.required;if(f.minLength!=null)i.minLength=+f.minLength;if(f.maxLength!=null)i.maxLength=+f.maxLength;if(f.pattern)i.pattern=f.pattern;if(f.placeholder)i.placeholder=f.placeholder}
function core(r){if(!schema||!editing(r))return;for(const f of schema.fields||[]){const label=CORE[f.fieldKey];if(!label||f.storageMode!=='core')continue;const b=box(r,label);if(!b)continue;limits(b.querySelector('input,textarea'),f);if(f.fieldType!=='select'||!f.optionsCategory)continue;const native=b.querySelector('select');if(!native)continue;const vals=Array.isArray(schema.options?.[f.optionsCategory])?schema.options[f.optionsCategory]:[],local=[...native.options].map(o=>o.value);if(!vals.length||JSON.stringify(vals)===JSON.stringify(local)){b.querySelector('[data-starry-central-select]')?.remove();native.parentElement&&(native.parentElement.style.display='');continue}native.parentElement&&(native.parentElement.style.display='none');let s=b.querySelector('[data-starry-central-select]');if(!s){s=document.createElement('select');s.dataset.starryCentralSelect='1';s.className='w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100';b.appendChild(s);s.addEventListener('change',()=>setSelect(native,s.value))}s.replaceChildren(...vals.map(v=>{const o=document.createElement('option');o.value=v;o.textContent=v;return o}));s.value=vals.includes(native.value)?native.value:(vals[0]||'');if(s.value!==native.value)setSelect(native,s.value)}}
function dyn(){return(schema?.fields||[]).filter(f=>f.storageMode==='dynamic'&&f.isActive!==false&&!['readonly','special'].includes(f.editableBy))}function host(r){return[...r.querySelectorAll('div')].find(d=>d.classList.contains('overflow-y-auto')&&d.classList.contains('space-y-3.5'))||null}
function input(f,value){let e;if(f.fieldType==='textarea'){e=document.createElement('textarea');e.rows=3}else if(f.fieldType==='select'){e=document.createElement('select');for(const v of schema.options?.[f.optionsCategory]||[]){const o=document.createElement('option');o.value=v;o.textContent=v;e.appendChild(o)}}else{e=document.createElement('input');e.type=f.fieldType==='date'?'date':f.fieldType==='number'?'number':f.fieldType==='checkbox'?'checkbox':'text'}e.className='starry-dynamic-input w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100';e.dataset.field=f.fieldKey;e.dataset.original=String(value??'');f.fieldType==='checkbox'?e.checked=String(value)==='1'||value===true:e.value=String(value??'');limits(e,f);return e}
function render(r){const h=host(r);if(!h)return;let sec=h.querySelector('#starry-schema-dynamic');if(!active(r)){sec?.remove();return}const fields=dyn();if(!fields.length){sec?.remove();return}if(!sec){sec=document.createElement('section');sec.id='starry-schema-dynamic';sec.className='rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-3.5 space-y-2';h.appendChild(sec)}sec.replaceChildren();const title=document.createElement('div');title.className='font-bold text-slate-800 dark:text-slate-100';title.textContent='中央會員資料';sec.appendChild(title);const grid=document.createElement('div');grid.className='grid grid-cols-1 sm:grid-cols-2 gap-2.5';for(const f of fields){const b=document.createElement('div'),l=document.createElement('label');l.className='block font-bold text-slate-700 dark:text-slate-300 mb-0.5';l.textContent=f.label+(f.required?' *':'');b.appendChild(l);const value=extra?.[f.fieldKey]??'';if(editing(r))b.appendChild(input(f,value));else{const v=document.createElement('div');v.className='font-semibold text-slate-800 dark:text-slate-200';v.textContent=f.fieldType==='checkbox'?(String(value)==='1'?'是':'否'):(value||'未填寫');b.appendChild(v)}if(f.helpText){const n=document.createElement('div');n.className='text-[10px] text-slate-400 mt-0.5';n.textContent=f.helpText;b.appendChild(n)}grid.appendChild(b)}sec.appendChild(grid)}
async function sync(){const r=root();if(!r)return;await load();if(extra===null)await loadExtra();core(r);render(r)}function schedule(){cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>void sync())}
document.addEventListener('click',e=>{const r=root();if(!r)return;const b=e.target?.closest?.('button');if(!b)return;if(['修改','自我介紹'].includes(t(b)))setTimeout(async()=>{await load(true);extra=null;await loadExtra();schedule()},0);if(t(b)!=='儲存'||bypass||saving)return;const inputs=[...r.querySelectorAll('#starry-schema-dynamic .starry-dynamic-input')],dirty=inputs.filter(i=>(i.type==='checkbox'?(i.checked?'1':'0'):i.value)!==(i.dataset.original||''));if(!dirty.length)return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();saving=true;(async()=>{try{const values={};for(const i of dirty)values[i.dataset.field]=i.type==='checkbox'?i.checked:i.value;const res=await fetch('/api/profile-extra',{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({values})}),d=await res.json().catch(()=>({}));if(!res.ok)throw Error(d.error||'中央會員資料儲存失敗');extra=d.values||extra;bypass=true;b.click();queueMicrotask(()=>{bypass=false})}catch(err){alert(err.message||'中央會員資料儲存失敗')}finally{saving=false}})()},true);
new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true});void load().then(schedule);
})();</script>`;

export async function injectStarryProfileSchemaClient(request: Request, response: Response): Promise<Response> {
  const url = new URL(request.url);
  if (url.hostname !== ECHO_HOST || request.method.toUpperCase() !== 'GET') return response;
  const contentType = response.headers.get('Content-Type') || '';
  if (!contentType.includes('text/html')) return response;
  const html = await response.text();
  if (!html.includes('</body>') || html.includes('id="starry-profile-schema-client"')) return new Response(html,{status:response.status,statusText:response.statusText,headers:response.headers});
  const nextHeaders = new Headers(response.headers); nextHeaders.delete('Content-Length');
  return new Response(html.replace('</body>',ECHO_CLIENT+'</body>'),{status:response.status,statusText:response.statusText,headers:nextHeaders});
}
