import appWorker from './privacyCrawlerRouter';
import { sessionContext } from './starryIdProfileDirectoryRouter';
import type { Env } from './index';

type SchemaEnv = Env & { STARRY_ID_DB?: any };

type FieldRow = {
  fieldKey: string;
  label: string;
  fieldType: string;
  storageMode: string;
  optionsCategory?: string | null;
  required: number;
  minLength?: number | null;
  maxLength?: number | null;
  pattern?: string | null;
  placeholder?: string | null;
  helpText?: string | null;
  editableBy: string;
  isActive: number;
  sortOrder: number;
};

const ECHO_HOST = 'echo.starry.phd';
const ID_HOST = 'id.starry.phd';
const SCHEMA_CACHE_SECONDS = 60;
const schemaReady = new WeakMap<object, Promise<void>>();

const DEFAULT_FIELDS: FieldRow[] = [
  { fieldKey:'name',label:'姓名或暱稱',fieldType:'text',storageMode:'core',required:1,minLength:1,maxLength:60,editableBy:'member',isActive:1,sortOrder:10 },
  { fieldKey:'avatar',label:'大頭照',fieldType:'image',storageMode:'special',required:0,editableBy:'special',isActive:1,sortOrder:20 },
  { fieldKey:'amwayId',label:'直銷商編號',fieldType:'text',storageMode:'special',required:0,minLength:1,maxLength:40,pattern:'^[A-Za-z0-9_-]+$',editableBy:'special',isActive:1,sortOrder:30 },
  { fieldKey:'phone',label:'手機',fieldType:'text',storageMode:'core',required:0,minLength:0,maxLength:30,editableBy:'member',isActive:1,sortOrder:40 },
  { fieldKey:'residence',label:'居住地',fieldType:'select',storageMode:'core',optionsCategory:'residence',required:0,editableBy:'member',isActive:1,sortOrder:50 },
  { fieldKey:'center',label:'直銷商中心',fieldType:'select',storageMode:'core',optionsCategory:'center',required:0,editableBy:'member',isActive:1,sortOrder:60 },
  { fieldKey:'rank',label:'最高獎銜',fieldType:'select',storageMode:'core',optionsCategory:'rank',required:0,editableBy:'member',isActive:1,sortOrder:70 },
  { fieldKey:'joinReason',label:'初次如何認識安麗？',fieldType:'select',storageMode:'core',optionsCategory:'joinReason',required:0,editableBy:'member',isActive:1,sortOrder:80 },
  { fieldKey:'stayReason',label:'什麼原因留在安麗？',fieldType:'select',storageMode:'core',optionsCategory:'stayReason',required:0,editableBy:'member',isActive:1,sortOrder:90 },
  { fieldKey:'sponsor',label:'推薦人',fieldType:'relationship',storageMode:'special',required:0,editableBy:'special',isActive:1,sortOrder:100 },
  { fieldKey:'platinumUpline',label:'上手白金',fieldType:'relationship',storageMode:'special',required:0,editableBy:'special',isActive:1,sortOrder:110 },
  { fieldKey:'diamondUpline',label:'上手鑽石',fieldType:'relationship',storageMode:'special',required:0,editableBy:'special',isActive:1,sortOrder:120 },
  { fieldKey:'birthday',label:'西元生日',fieldType:'date',storageMode:'core',required:0,editableBy:'member',isActive:1,sortOrder:130 },
  { fieldKey:'motto',label:'座右銘',fieldType:'textarea',storageMode:'core',required:0,minLength:0,maxLength:300,editableBy:'member',isActive:1,sortOrder:140 },
  { fieldKey:'zodiac',label:'星座',fieldType:'text',storageMode:'derived',required:0,editableBy:'readonly',isActive:1,sortOrder:150 },
  { fieldKey:'talentNumber',label:'天賦數',fieldType:'number',storageMode:'derived',required:0,editableBy:'readonly',isActive:1,sortOrder:160 },
  { fieldKey:'lifeNumber',label:'生命靈數',fieldType:'number',storageMode:'derived',required:0,editableBy:'readonly',isActive:1,sortOrder:170 },
  { fieldKey:'spouse',label:'夫妻關係',fieldType:'relationship',storageMode:'special',required:0,editableBy:'readonly',isActive:1,sortOrder:180 }
];

function text(value: unknown) { return value == null ? '' : String(value).trim(); }
function lower(value: unknown) { return text(value).toLowerCase(); }

function hashToken(token: string) {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)).then(buffer =>
    Array.from(new Uint8Array(buffer)).map(byte => byte.toString(16).padStart(2,'0')).join('')
  );
}

function cookieValue(request: Request, name: string) {
  for (const part of (request.headers.get('Cookie') || '').split(';')) {
    const [key,...rest] = part.trim().split('=');
    if (key === name) return decodeURIComponent(rest.join('='));
  }
  return '';
}

function schemaCors(request: Request) {
  const origin = request.headers.get('Origin') || '';
  if (!origin) return '';
  try {
    const parsed = new URL(origin);
    if (parsed.protocol === 'https:' && (parsed.hostname === 'starry.phd' || parsed.hostname.endsWith('.starry.phd'))) return origin;
    if ((parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') && (parsed.protocol === 'http:' || parsed.protocol === 'https:')) return origin;
  } catch { /* ignore */ }
  return '';
}

function apiHeaders(request: Request, cacheControl = 'no-store') {
  const headers = new Headers({
    'Content-Type':'application/json; charset=utf-8',
    'Cache-Control':cacheControl,
    'X-Robots-Tag':'noindex, nofollow, noarchive',
    'X-Content-Type-Options':'nosniff'
  });
  const origin = schemaCors(request);
  if (origin) {
    headers.set('Access-Control-Allow-Origin', origin);
    headers.set('Access-Control-Allow-Methods','GET, PUT, OPTIONS');
    headers.set('Access-Control-Allow-Headers','Content-Type, If-None-Match, Authorization');
    headers.set('Access-Control-Allow-Credentials','true');
    headers.set('Vary','Origin');
  }
  return headers;
}

function json(request: Request, data: unknown, status = 200, cacheControl = 'no-store', extras?: HeadersInit) {
  const headers = apiHeaders(request, cacheControl);
  if (extras) new Headers(extras).forEach((value,key)=>headers.set(key,value));
  return new Response(JSON.stringify(data),{status,headers});
}

async function ensureSchema(db: any) {
  if (!db) return;
  const key = db as object;
  if (!schemaReady.has(key)) {
    const task = (async()=>{
      await db.prepare(`CREATE TABLE IF NOT EXISTS profile_schema_meta (
        id TEXT PRIMARY KEY CHECK(id='profile'), version INTEGER NOT NULL DEFAULT 1, updatedAt INTEGER NOT NULL
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
      await db.prepare(`CREATE TABLE IF NOT EXISTS profile_option_values (
        category TEXT NOT NULL,value TEXT NOT NULL,sortOrder INTEGER NOT NULL,isActive INTEGER NOT NULL DEFAULT 1,
        sourceApp TEXT NOT NULL DEFAULT 'starry-id',updatedAt INTEGER NOT NULL,PRIMARY KEY(category,value)
      )`).run();
      await db.prepare('CREATE INDEX IF NOT EXISTS profile_field_schema_active ON profile_field_schema(isActive,sortOrder,fieldKey)').run();
      await db.prepare('CREATE INDEX IF NOT EXISTS profile_dynamic_values_user ON profile_dynamic_values(userId,fieldKey)').run();
      const now=Date.now();
      await db.prepare("INSERT OR IGNORE INTO profile_schema_meta(id,version,updatedAt) VALUES('profile',1,?)").bind(now).run();
      const statements = DEFAULT_FIELDS.map(field => db.prepare(`INSERT OR IGNORE INTO profile_field_schema
        (fieldKey,label,fieldType,storageMode,optionsCategory,required,minLength,maxLength,pattern,placeholder,helpText,editableBy,isActive,sortOrder,updatedAt)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).bind(
          field.fieldKey,field.label,field.fieldType,field.storageMode,field.optionsCategory || null,field.required,
          field.minLength ?? null,field.maxLength ?? null,field.pattern ?? null,field.placeholder ?? null,field.helpText ?? null,
          field.editableBy,field.isActive,field.sortOrder,now
        ));
      if (statements.length) await db.batch(statements);
      const triggerSql = [
        `CREATE TRIGGER IF NOT EXISTS profile_field_schema_version_insert AFTER INSERT ON profile_field_schema BEGIN UPDATE profile_schema_meta SET version=version+1,updatedAt=CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id='profile'; END`,
        `CREATE TRIGGER IF NOT EXISTS profile_field_schema_version_update AFTER UPDATE ON profile_field_schema BEGIN UPDATE profile_schema_meta SET version=version+1,updatedAt=CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id='profile'; END`,
        `CREATE TRIGGER IF NOT EXISTS profile_field_schema_version_delete AFTER DELETE ON profile_field_schema BEGIN UPDATE profile_schema_meta SET version=version+1,updatedAt=CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id='profile'; END`,
        `CREATE TRIGGER IF NOT EXISTS profile_option_values_schema_version_insert AFTER INSERT ON profile_option_values BEGIN UPDATE profile_schema_meta SET version=version+1,updatedAt=CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id='profile'; END`,
        `CREATE TRIGGER IF NOT EXISTS profile_option_values_schema_version_update AFTER UPDATE ON profile_option_values BEGIN UPDATE profile_schema_meta SET version=version+1,updatedAt=CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id='profile'; END`,
        `CREATE TRIGGER IF NOT EXISTS profile_option_values_schema_version_delete AFTER DELETE ON profile_option_values BEGIN UPDATE profile_schema_meta SET version=version+1,updatedAt=CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id='profile'; END`
      ];
      for (const sql of triggerSql) await db.prepare(sql).run();
    })();
    schemaReady.set(key,task);
    task.catch(()=>schemaReady.delete(key));
  }
  await schemaReady.get(key);
}

async function readSchema(env: SchemaEnv) {
  const db=env.STARRY_ID_DB;
  if (!db) return {version:0,updatedAt:0,fields:DEFAULT_FIELDS,options:{},source:'starry-id-fallback',supportsDynamicFields:true};
  await ensureSchema(db);
  const meta:any=await db.prepare("SELECT version,updatedAt FROM profile_schema_meta WHERE id='profile' LIMIT 1").first();
  const fieldsResult:any=await db.prepare(`SELECT fieldKey,label,fieldType,storageMode,optionsCategory,required,minLength,maxLength,pattern,placeholder,helpText,editableBy,isActive,sortOrder
    FROM profile_field_schema WHERE isActive=1 ORDER BY sortOrder,fieldKey`).all();
  const optionResult:any=await db.prepare(`SELECT category,value FROM profile_option_values WHERE isActive=1 ORDER BY category,sortOrder,value`).all();
  const options:Record<string,string[]>={};
  for (const row of optionResult?.results || []) (options[String(row.category)] ||= []).push(String(row.value));
  const fields=(fieldsResult?.results || []).map((row:any)=>({
    ...row, required:Boolean(row.required), isActive:Boolean(row.isActive)
  }));
  return {version:Number(meta?.version || 1),updatedAt:Number(meta?.updatedAt || 0),fields,options,source:'starry-id-central',supportsDynamicFields:true};
}

function cacheApi() { return (globalThis as any).caches?.default as any; }
function schemaCacheKey(request: Request) {
  const url=new URL(request.url);
  return new Request(`${url.origin}/api/profile-schema`,{method:'GET'});
}
async function invalidateSchemaCache(request: Request) {
  const cache=cacheApi();
  if (!cache) return;
  await cache.delete(schemaCacheKey(request)).catch(()=>undefined);
}

async function schemaResponse(request: Request, env: SchemaEnv) {
  const cache=cacheApi();
  const cacheKey=schemaCacheKey(request);
  if (cache && !request.headers.get('If-None-Match')) {
    const hit=await cache.match(cacheKey).catch(()=>null);
    if (hit) return hit;
  }
  const data=await readSchema(env);
  const etag=`\"starry-profile-schema-v${data.version}\"`;
  if (request.headers.get('If-None-Match') === etag) return new Response(null,{status:304,headers:{ETag:etag,'Cache-Control':`public, max-age=${SCHEMA_CACHE_SECONDS}, stale-while-revalidate=300`}});
  const response=json(request,data,200,`public, max-age=${SCHEMA_CACHE_SECONDS}, s-maxage=300, stale-while-revalidate=86400`,{ETag:etag});
  if (cache && data.source==='starry-id-central') await cache.put(cacheKey,response.clone()).catch(()=>undefined);
  return response;
}

async function echoSessionUserId(request: Request, env: SchemaEnv) {
  if (!env.DB) return '';
  const bearer=request.headers.get('Authorization')?.match(/^Bearer\s+([A-Za-z0-9_-]{30,})$/i)?.[1] || '';
  const token=bearer || cookieValue(request,'echostars_session');
  if (!/^[A-Za-z0-9_-]{30,}$/.test(token)) return '';
  const tokenHash=await hashToken(token);
  const row:any=await env.DB.prepare(`SELECT s.userId,s.expiresAt,u.isBlocked FROM auth_sessions s JOIN users u ON u.id=s.userId WHERE s.tokenHash=? LIMIT 1`).bind(tokenHash).first();
  if (!row || Number(row.expiresAt || 0)<=Date.now() || row.isBlocked) return '';
  return text(row.userId);
}

async function currentIdentity(request: Request, env: SchemaEnv) {
  const host=new URL(request.url).hostname;
  if (host===ID_HOST) {
    const session=await sessionContext(request,env);
    return session ? {userId:text((session as any).userId),isSuperAdmin:Boolean((session as any).isSuperAdmin)} : null;
  }
  const userId=await echoSessionUserId(request,env);
  return userId ? {userId,isSuperAdmin:false} : null;
}

function normalizedValue(field:any, raw:unknown) {
  if (field.fieldType==='checkbox') return raw === true || raw === 1 || raw === '1' || raw === 'true' ? '1' : '0';
  return raw == null ? '' : String(raw).trim();
}

function validateOne(field:any, raw:unknown, options:Record<string,string[]>) {
  const value=normalizedValue(field,raw);
  if (field.required && !value) return `${field.label}為必填欄位`;
  if (!value) return '';
  const length=Array.from(value).length;
  if (field.minLength != null && length < Number(field.minLength)) return `${field.label}至少需要 ${field.minLength} 個字元`;
  if (field.maxLength != null && length > Number(field.maxLength)) return `${field.label}最多 ${field.maxLength} 個字元`;
  if (field.pattern) {
    try { if (!new RegExp(String(field.pattern)).test(value)) return `${field.label}格式不正確`; }
    catch { return `${field.label}的中央驗證規則設定有誤`; }
  }
  if (field.fieldType==='select' && field.optionsCategory) {
    const allowed=options[String(field.optionsCategory)] || [];
    if (allowed.length && !allowed.includes(value)) return `${field.label}請使用中央清單中的選項`;
  }
  if (field.fieldType==='date' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${field.label}日期格式不正確`;
  if (field.fieldType==='number' && !Number.isFinite(Number(value))) return `${field.label}必須是數字`;
  return '';
}

async function validateCoreWrite(request: Request, env: SchemaEnv) {
  const url=new URL(request.url);
  if (request.method.toUpperCase()!=='PUT') return null;
  const isEcho=url.hostname===ECHO_HOST && /^\/api\/users\/[^/]+$/.test(url.pathname);
  const isCentral=url.hostname===ID_HOST && (url.pathname==='/api/profile' || /^\/api\/admin\/members\/[^/]+$/.test(url.pathname));
  if (!isEcho && !isCentral) return null;
  const body:any=await request.clone().json().catch(()=>null);
  if (!body || typeof body!=='object' || Array.isArray(body)) return null;
  const schema=await readSchema(env);
  for (const field of schema.fields as any[]) {
    if (field.storageMode!=='core' || field.editableBy==='readonly' || field.editableBy==='special') continue;
    if (!Object.prototype.hasOwnProperty.call(body,field.fieldKey)) continue;
    const error=validateOne(field,body[field.fieldKey],schema.options as Record<string,string[]>);
    if (error) return json(request,{error,field:field.fieldKey,schemaVersion:schema.version},422);
  }
  return null;
}

async function profileExtraGet(request: Request, env: SchemaEnv) {
  const identity=await currentIdentity(request,env);
  if (!identity) return json(request,{error:'請先登入會員'},401);
  if (!env.STARRY_ID_DB) return json(request,{error:'Starry ID 中央資料庫未連線'},503);
  await ensureSchema(env.STARRY_ID_DB);
  const rows:any=await env.STARRY_ID_DB.prepare(`SELECT v.fieldKey,v.value FROM profile_dynamic_values v JOIN profile_field_schema f ON f.fieldKey=v.fieldKey WHERE v.userId=? AND f.isActive=1 AND f.storageMode='dynamic'`).bind(identity.userId).all();
  const values:Record<string,string>={};
  for (const row of rows?.results || []) values[String(row.fieldKey)]=String(row.value || '');
  return json(request,{values},200,'private, no-store');
}

async function profileExtraPut(request: Request, env: SchemaEnv) {
  const url=new URL(request.url);
  const origin=request.headers.get('Origin');
  if (origin && origin!==url.origin) return json(request,{error:'不允許跨站修改會員資料'},403);
  const identity=await currentIdentity(request,env);
  if (!identity) return json(request,{error:'請先登入會員'},401);
  if (!env.STARRY_ID_DB) return json(request,{error:'Starry ID 中央資料庫未連線'},503);
  const body:any=await request.clone().json().catch(()=>({}));
  const incoming=body?.values && typeof body.values==='object' && !Array.isArray(body.values) ? body.values : {};
  const schema=await readSchema(env);
  const dynamic=(schema.fields as any[]).filter(field=>field.storageMode==='dynamic' && field.isActive && field.editableBy!=='readonly' && field.editableBy!=='special');
  const byKey=new Map(dynamic.map(field=>[field.fieldKey,field]));
  const now=Date.now();
  const statements:any[]=[];
  for (const [key,raw] of Object.entries(incoming)) {
    const field:any=byKey.get(key);
    if (!field) continue;
    const error=validateOne(field,raw,schema.options as Record<string,string[]>);
    if (error) return json(request,{error,field:key,schemaVersion:schema.version},422);
    const value=normalizedValue(field,raw);
    statements.push(env.STARRY_ID_DB.prepare(`INSERT INTO profile_dynamic_values(userId,fieldKey,value,updatedAt) VALUES(?,?,?,?) ON CONFLICT(userId,fieldKey) DO UPDATE SET value=excluded.value,updatedAt=excluded.updatedAt`).bind(identity.userId,key,value,now));
  }
  if (statements.length) await env.STARRY_ID_DB.batch(statements);
  return profileExtraGet(request,env);
}

const FIELD_TYPES=new Set(['text','textarea','select','date','number','checkbox','relationship','image']);
const STORAGE_MODES=new Set(['core','dynamic','derived','special']);
const EDITABLE_BY=new Set(['member','admin','readonly','special']);
const FIELD_KEY=/^[A-Za-z][A-Za-z0-9_]{0,63}$/;

async function updateSchema(request: Request, env: SchemaEnv) {
  if (new URL(request.url).hostname!==ID_HOST) return json(request,{error:'只能在 Starry ID 中央網域修改 Schema'},403);
  const session=await sessionContext(request,env);
  if (!session || !(session as any).isSuperAdmin) return json(request,{error:'只有 Starry ID Super Admin 可以修改中央欄位規則'},403);
  if (!env.STARRY_ID_DB) return json(request,{error:'Starry ID 中央資料庫未連線'},503);
  const input:any=await request.clone().json().catch(()=>({}));
  const fields=Array.isArray(input.fields) ? input.fields : [];
  if (!fields.length) return json(request,{error:'缺少 fields'},400);
  await ensureSchema(env.STARRY_ID_DB);
  const now=Date.now();
  const statements:any[]=[];
  for (const raw of fields) {
    const fieldKey=text(raw?.fieldKey);
    const label=text(raw?.label);
    const fieldType=lower(raw?.fieldType || 'text');
    const storageMode=lower(raw?.storageMode || 'dynamic');
    const editableBy=lower(raw?.editableBy || 'member');
    if (!FIELD_KEY.test(fieldKey) || !label || !FIELD_TYPES.has(fieldType) || !STORAGE_MODES.has(storageMode) || !EDITABLE_BY.has(editableBy)) return json(request,{error:`欄位設定不合法：${fieldKey || '未命名'}`},400);
    const pattern=text(raw?.pattern);
    if (pattern) { try { new RegExp(pattern); } catch { return json(request,{error:`${label} 的 pattern 不是有效正規表示式`},400); } }
    const minLength=raw?.minLength==null || raw.minLength==='' ? null : Math.max(0,Math.trunc(Number(raw.minLength)));
    const maxLength=raw?.maxLength==null || raw.maxLength==='' ? null : Math.max(0,Math.trunc(Number(raw.maxLength)));
    if (minLength!=null && maxLength!=null && minLength>maxLength) return json(request,{error:`${label} 的最小長度不能大於最大長度`},400);
    const existing:any=await env.STARRY_ID_DB.prepare('SELECT storageMode FROM profile_field_schema WHERE fieldKey=? LIMIT 1').bind(fieldKey).first();
    if (existing && existing.storageMode!=='dynamic' && storageMode!==existing.storageMode) return json(request,{error:`既有核心欄位 ${fieldKey} 不允許改變儲存模式`},409);
    statements.push(env.STARRY_ID_DB.prepare(`INSERT INTO profile_field_schema(fieldKey,label,fieldType,storageMode,optionsCategory,required,minLength,maxLength,pattern,placeholder,helpText,editableBy,isActive,sortOrder,updatedAt)
      VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(fieldKey) DO UPDATE SET label=excluded.label,fieldType=excluded.fieldType,storageMode=excluded.storageMode,optionsCategory=excluded.optionsCategory,required=excluded.required,minLength=excluded.minLength,maxLength=excluded.maxLength,pattern=excluded.pattern,placeholder=excluded.placeholder,helpText=excluded.helpText,editableBy=excluded.editableBy,isActive=excluded.isActive,sortOrder=excluded.sortOrder,updatedAt=excluded.updatedAt`).bind(
        fieldKey,label,fieldType,storageMode,text(raw?.optionsCategory)||null,raw?.required?1:0,minLength,maxLength,pattern||null,text(raw?.placeholder)||null,text(raw?.helpText)||null,editableBy,raw?.isActive===false?0:1,Math.trunc(Number(raw?.sortOrder)||0),now
      ));
  }
  await env.STARRY_ID_DB.batch(statements);
  await invalidateSchemaCache(request);
  return schemaResponse(new Request(new URL('/api/profile-schema',request.url),{method:'GET'}),env);
}

async function handleSchemaApi(request: Request, env: SchemaEnv) {
  const url=new URL(request.url);
  if (!['/api/profile-schema','/api/profile-extra'].includes(url.pathname)) return null;
  const method=request.method.toUpperCase();
  if (method==='OPTIONS') return new Response(null,{status:204,headers:apiHeaders(request)});
  if (url.pathname==='/api/profile-schema' && method==='GET') return schemaResponse(request,env);
  if (url.pathname==='/api/profile-schema' && method==='PUT') return updateSchema(request,env);
  if (url.pathname==='/api/profile-extra' && method==='GET') return profileExtraGet(request,env);
  if (url.pathname==='/api/profile-extra' && method==='PUT') return profileExtraPut(request,env);
  return json(request,{error:'Method not allowed'},405);
}

const ECHO_SCHEMA_CLIENT = String.raw`<script id="starry-profile-schema-client">(()=>{
  const CACHE_KEY='starry-profile-schema-cache-v1';
  const CORE_LABELS={name:'姓名或暱稱',phone:'手機',residence:'居住地',center:'直銷商中心',rank:'最高獎銜',joinReason:'初次如何認識安麗？',stayReason:'什麼原因留在安麗？',birthday:'西元生日'};
  let schema=null,extra=null,lastCheck=0,loading=null,bypass=false,saving=false,raf=0;
  function cached(){try{return JSON.parse(localStorage.getItem(CACHE_KEY)||'null')}catch{return null}}
  async function loadSchema(force=false){
    const now=Date.now(),old=cached();if(!force&&schema&&now-lastCheck<60000)return schema;if(loading)return loading;lastCheck=now;
    loading=(async()=>{try{const headers={};if(old?.etag)headers['If-None-Match']=old.etag;const r=await fetch('/api/profile-schema',{headers,cache:'no-cache'});if(r.status===304&&old?.data){schema=old.data;return schema}if(!r.ok)throw Error('schema');const data=await r.json();const etag=r.headers.get('ETag')||'';schema=data;try{localStorage.setItem(CACHE_KEY,JSON.stringify({etag,data}))}catch{}return data}catch{schema=old?.data||schema;return schema}finally{loading=null}})();return loading;
  }
  async function loadExtra(){try{const r=await fetch('/api/profile-extra',{credentials:'same-origin',cache:'no-store'});if(!r.ok)return null;const d=await r.json();extra=d.values||{};return extra}catch{return null}}
  function txt(el){return (el?.textContent||'').replace(/（.*?）|\(.*?\)/g,'').trim()}
  function profile(){const root=document.querySelector('.profile-page');return root&&txt(root.querySelector('h2'))==='個人中心'?root:null}
  function activeProfile(root){const buttons=Array.from(root.querySelectorAll('button'));const b=buttons.find(x=>txt(x)==='自我介紹');return !!b&&b.className.includes('border-rose-500')}
  function editing(root){return Array.from(root.querySelectorAll('button')).some(b=>txt(b)==='儲存')&&Array.from(root.querySelectorAll('span')).some(s=>txt(s)==='編輯個人基本資料')}
  function fieldBox(root,label){return Array.from(root.querySelectorAll('label')).find(l=>txt(l).startsWith(label))?.parentElement||null}
  function dispatchValue(select,value){const set=Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value')?.set;if(set)set.call(select,value);else select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}))}
  function constraints(input,field){if(!input)return;input.required=!!field.required;if(field.minLength!=null)input.minLength=Number(field.minLength);if(field.maxLength!=null)input.maxLength=Number(field.maxLength);if(field.pattern)input.pattern=field.pattern;if(field.placeholder)input.placeholder=field.placeholder}
  function applyCore(root){if(!schema||!editing(root))return;const fields=schema.fields||[];for(const field of fields){const label=CORE_LABELS[field.fieldKey];if(!label||field.storageMode!=='core')continue;const box=fieldBox(root,label);if(!box)continue;const input=box.querySelector('input,textarea');if(input)constraints(input,field);if(field.fieldType!=='select'||!field.optionsCategory)continue;const native=box.querySelector('select');if(!native)continue;const central=Array.isArray(schema.options?.[field.optionsCategory])?schema.options[field.optionsCategory]:[];const local=Array.from(native.options).map(o=>o.value);if(!central.length||JSON.stringify(local)===JSON.stringify(central)){box.querySelector('[data-starry-central-select]')?.remove();if(native.parentElement)native.parentElement.style.display='';continue}const wrapper=native.parentElement;if(wrapper)wrapper.style.display='none';let replacement=box.querySelector('[data-starry-central-select]');if(!replacement){replacement=document.createElement('select');replacement.setAttribute('data-starry-central-select','1');replacement.className='w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100';box.appendChild(replacement);replacement.addEventListener('change',()=>dispatchValue(native,replacement.value))}replacement.replaceChildren(...central.map(v=>{const o=document.createElement('option');o.value=v;o.textContent=v;return o}));replacement.value=central.includes(native.value)?native.value:(central[0]||'');if(replacement.value!==native.value)dispatchValue(native,replacement.value)} }
  function dynamicFields(){return (schema?.fields||[]).filter(f=>f.storageMode==='dynamic'&&f.isActive!==false&&f.editableBy!=='readonly'&&f.editableBy!=='special')}
  function contentRoot(root){return Array.from(root.querySelectorAll('div')).find(d=>d.classList.contains('overflow-y-auto')&&d.classList.contains('space-y-3.5'))||null}
  function inputFor(field,value){let el;if(field.fieldType==='textarea'){el=document.createElement('textarea');el.rows=3}else if(field.fieldType==='select'){el=document.createElement('select');for(const v of schema.options?.[field.optionsCategory]||[]){const o=document.createElement('option');o.value=v;o.textContent=v;el.appendChild(o)}}else{el=document.createElement('input');el.type=field.fieldType==='date'?'date':field.fieldType==='number'?'number':field.fieldType==='checkbox'?'checkbox':'text'}el.className='starry-dynamic-input w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100';el.dataset.field=field.fieldKey;const original=value??'';el.dataset.original=String(original);if(field.fieldType==='checkbox')el.checked=String(original)==='1'||original===true;else el.value=String(original);constraints(el,field);return el}
  function renderDynamic(root){const host=contentRoot(root);if(!host)return;let section=host.querySelector('#starry-schema-dynamic');if(!activeProfile(root)){section?.remove();return}const fields=dynamicFields();if(!fields.length){section?.remove();return}if(!section){section=document.createElement('section');section.id='starry-schema-dynamic';section.className='rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-3.5 space-y-2';host.appendChild(section)}const edit=editing(root);section.replaceChildren();const title=document.createElement('div');title.className='font-bold text-slate-800 dark:text-slate-100';title.textContent='中央會員資料';section.appendChild(title);const grid=document.createElement('div');grid.className='grid grid-cols-1 sm:grid-cols-2 gap-2.5';for(const field of fields){const box=document.createElement('div');const label=document.createElement('label');label.className='block font-bold text-slate-700 dark:text-slate-300 mb-0.5';label.textContent=field.label+(field.required?' *':'');box.appendChild(label);const value=extra?.[field.fieldKey]??'';if(edit)box.appendChild(inputFor(field,value));else{const v=document.createElement('div');v.className='font-semibold text-slate-800 dark:text-slate-200';v.textContent=field.fieldType==='checkbox'?(String(value)==='1'?'是':'否'):(value||'未填寫');box.appendChild(v)}if(field.helpText){const help=document.createElement('div');help.className='text-[10px] text-slate-400 mt-0.5';help.textContent=field.helpText;box.appendChild(help)}grid.appendChild(box)}section.appendChild(grid)}
  async function sync(){const root=profile();if(!root)return;await loadSchema(false);if(extra===null)await loadExtra();applyCore(root);renderDynamic(root)}
  function schedule(){cancelAnimationFrame(raf);raf=requestAnimationFrame(()=>void sync())}
  document.addEventListener('click',async e=>{const root=profile();if(!root)return;const btn=e.target?.closest?.('button');if(!btn)return;if(txt(btn)==='修改'||txt(btn)==='自我介紹'){setTimeout(async()=>{await loadSchema(true);extra=null;await loadExtra();schedule()},0)}if(txt(btn)!=='儲存'||bypass||saving)return;const inputs=Array.from(root.querySelectorAll('#starry-schema-dynamic .starry-dynamic-input'));const dirty=inputs.filter(i=>{const v=i.type==='checkbox'?(i.checked?'1':'0'):i.value;return v!==(i.dataset.original||'')});if(!dirty.length)return;e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();saving=true;try{const values={};for(const i of dirty)values[i.dataset.field]=i.type==='checkbox'?i.checked:i.value;const r=await fetch('/api/profile-extra',{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({values})});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||'中央會員資料儲存失敗');extra=d.values||extra;bypass=true;btn.click();queueMicrotask(()=>{bypass=false})}catch(err){alert(err.message||'中央會員資料儲存失敗')}finally{saving=false}},true);
  const observer=new MutationObserver(schedule);observer.observe(document.body,{childList:true,subtree:true});void loadSchema(false).then(()=>schedule());
})();</script>`;

async function injectEchoSchemaClient(request: Request, response: Response) {
  const url=new URL(request.url);
  if (url.hostname!==ECHO_HOST || request.method.toUpperCase()!=='GET') return response;
  const type=response.headers.get('Content-Type') || '';
  if (!type.includes('text/html')) return response;
  const html=await response.text();
  if (!html.includes('</body>') || html.includes('id="starry-profile-schema-client"')) return new Response(html,{status:response.status,statusText:response.statusText,headers:response.headers});
  const headers=new Headers(response.headers);headers.delete('Content-Length');
  return new Response(html.replace('</body>',ECHO_SCHEMA_CLIENT+'</body>'),{status:response.status,statusText:response.statusText,headers});
}

export default {
  async fetch(request: Request, env: SchemaEnv, ctx?: any): Promise<Response> {
    const schemaApi=await handleSchemaApi(request,env);
    if (schemaApi) return schemaApi;
    const validation=await validateCoreWrite(request,env);
    if (validation) return validation;
    const response=await appWorker.fetch(request,env as any,ctx);
    return injectEchoSchemaClient(request,response);
  }
};
