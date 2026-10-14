import type { Env } from './index';

type SchemaEnv = Env & { STARRY_ID_DB?: any };

export type ProfileFieldSchema = {
  fieldKey: string;
  label: string;
  inputType: 'text' | 'tel' | 'date' | 'select' | 'textarea' | 'relation';
  required: boolean;
  maxLength: number | null;
  optionCategory: string;
  storageMode: 'native' | 'extension';
  userEditable: boolean;
  sortOrder: number;
  isActive: boolean;
  placeholder: string;
  helpText: string;
  validation: Record<string, unknown>;
};

export type ProfileSchemaBundle = {
  version: number;
  updatedAt: number;
  fields: ProfileFieldSchema[];
  options: Record<string, string[]>;
  source: 'starry-id-central' | 'starry-id-fallback';
};

const FALLBACK_OPTIONS: Record<string, string[]> = {
  residence: [
    '臺北','新北','基隆','桃園','新竹','苗栗','臺中','彰化','南投','雲林',
    '嘉義','臺南','高雄','屏東','宜蘭','花蓮','臺東','澎湖','金門','連江','海外'
  ],
  center: [
    '無','非寰宇體系','飛登','南京','自強','明星','民權','中山','桃園','新竹','台中',
    '彰化','員林','嘉義','台南','高雄','屏東','香港','澳門','中國','美國','澳洲',
    '加拿大','英國','義大利','日本','韓國','馬來西亞','泰國','越南','印尼'
  ],
  rank: [
    '無','3%','6%','9%','12%','12%初階','15%','15%銅章','18%','21%','銀章','金章',
    '白金','紅寶石','創辦人白金','創辦人紅寶石','藍寶石','創辦人藍寶石','明珠','翡翠',
    '創辦人翡翠','鑽石級以上'
  ],
  joinReason: [
    '尚未加入','購買產品','事業','捧場人情','商業餐會','匹克球','參加吃喝玩樂活動',
    '參加營養課','參加美容課','參加生涯規劃','參加其它課程','參加大會','忘記了','其他'
  ],
  stayReason: [
    '商業餐會','匹克球','可以增加收入','打造自己的事業與團隊','課程活動多元豐富',
    '認識人脈','學習健康','助人','擁有舞台','熱愛產品好用','喜歡分享好東西','其它'
  ]
};

// Keep known historical values writable so an existing member can still save
// an otherwise-valid profile after Starry ID centralizes the current option list.
// New UI choices continue to come only from the active central schema.
const LEGACY_OPTION_ALIASES: Record<string, Record<string, string>> = {
  residence: {
    '台北': '臺北',
    '台中': '臺中',
    '台南': '臺南',
    '台東': '臺東'
  },
  center: {
    '豐宇台中': '台中'
  }
};

const DEFAULT_FIELDS: Array<Omit<ProfileFieldSchema, 'required' | 'userEditable' | 'isActive' | 'validation'> & {
  required: number; userEditable: number; isActive: number; validationJson: string;
}> = [
  { fieldKey:'name',label:'姓名或暱稱',inputType:'text',required:1,maxLength:50,optionCategory:'',storageMode:'native',userEditable:1,sortOrder:10,isActive:1,placeholder:'請輸入姓名或暱稱',helpText:'繁星生態系共用姓名',validationJson:'{}' },
  { fieldKey:'amwayId',label:'直銷商編號',inputType:'text',required:0,maxLength:32,optionCategory:'',storageMode:'native',userEditable:1,sortOrder:20,isActive:1,placeholder:'例：12345678',helpText:'繁星生態系共用會員識別資料',validationJson:'{"pattern":"^[A-Za-z0-9_-]*$"}' },
  { fieldKey:'phone',label:'手機',inputType:'tel',required:0,maxLength:30,optionCategory:'',storageMode:'native',userEditable:1,sortOrder:30,isActive:1,placeholder:'請輸入手機號碼',helpText:'',validationJson:'{}' },
  { fieldKey:'residence',label:'居住地',inputType:'select',required:0,maxLength:40,optionCategory:'residence',storageMode:'native',userEditable:1,sortOrder:40,isActive:1,placeholder:'請選擇居住地',helpText:'',validationJson:'{}' },
  { fieldKey:'center',label:'直銷商中心',inputType:'select',required:0,maxLength:60,optionCategory:'center',storageMode:'native',userEditable:1,sortOrder:50,isActive:1,placeholder:'請選擇中心',helpText:'',validationJson:'{}' },
  { fieldKey:'rank',label:'最高獎銜',inputType:'select',required:0,maxLength:60,optionCategory:'rank',storageMode:'native',userEditable:1,sortOrder:60,isActive:1,placeholder:'請選擇獎銜',helpText:'獎銜仍依既有人工審核規則生效',validationJson:'{}' },
  { fieldKey:'joinReason',label:'初次如何認識安麗？',inputType:'select',required:0,maxLength:80,optionCategory:'joinReason',storageMode:'native',userEditable:1,sortOrder:70,isActive:1,placeholder:'請選擇',helpText:'',validationJson:'{}' },
  { fieldKey:'stayReason',label:'什麼原因留在安麗？',inputType:'select',required:0,maxLength:100,optionCategory:'stayReason',storageMode:'native',userEditable:1,sortOrder:80,isActive:1,placeholder:'請選擇',helpText:'',validationJson:'{}' },
  { fieldKey:'sponsor',label:'推薦人',inputType:'relation',required:0,maxLength:80,optionCategory:'',storageMode:'native',userEditable:1,sortOrder:90,isActive:1,placeholder:'輸入推薦人姓名',helpText:'可由中央會員目錄精準綁定',validationJson:'{}' },
  { fieldKey:'platinumUpline',label:'上手白金',inputType:'relation',required:0,maxLength:80,optionCategory:'',storageMode:'native',userEditable:1,sortOrder:100,isActive:1,placeholder:'輸入或搜尋白金領袖',helpText:'可由中央會員目錄精準綁定',validationJson:'{}' },
  { fieldKey:'diamondUpline',label:'上手鑽石',inputType:'relation',required:0,maxLength:80,optionCategory:'',storageMode:'native',userEditable:1,sortOrder:110,isActive:1,placeholder:'輸入或搜尋鑽石領袖',helpText:'可由中央會員目錄精準綁定',validationJson:'{}' },
  { fieldKey:'birthday',label:'西元生日',inputType:'date',required:0,maxLength:10,optionCategory:'',storageMode:'native',userEditable:1,sortOrder:120,isActive:1,placeholder:'YYYY-MM-DD',helpText:'生日由伺服器計算星座、天賦數與命數',validationJson:'{"dateMin":"1900-01-01"}' },
  { fieldKey:'motto',label:'座右銘',inputType:'textarea',required:0,maxLength:200,optionCategory:'',storageMode:'native',userEditable:1,sortOrder:130,isActive:1,placeholder:'寫下你的座右銘',helpText:'',validationJson:'{}' }
];

const schemaReady = new WeakMap<object, Promise<void>>();

function text(value: unknown) {
  return value == null ? '' : String(value).trim();
}

function parseValidation(raw: unknown): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text(raw) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function fallbackFields(): ProfileFieldSchema[] {
  return DEFAULT_FIELDS.map(row => ({
    ...row,
    required: Boolean(row.required),
    userEditable: Boolean(row.userEditable),
    isActive: Boolean(row.isActive),
    validation: parseValidation(row.validationJson)
  }));
}

async function ensureCentralSchema(db: any) {
  const key = db as object;
  if (!schemaReady.has(key)) {
    const task = (async () => {
      await db.prepare(`CREATE TABLE IF NOT EXISTS profile_option_values (
        category TEXT NOT NULL,value TEXT NOT NULL,sortOrder INTEGER NOT NULL,isActive INTEGER NOT NULL DEFAULT 1,
        sourceApp TEXT NOT NULL DEFAULT 'starry-id',updatedAt INTEGER NOT NULL,PRIMARY KEY(category,value)
      )`).run();
      await db.prepare(`CREATE TABLE IF NOT EXISTS profile_field_schema (
        fieldKey TEXT PRIMARY KEY,label TEXT NOT NULL,inputType TEXT NOT NULL DEFAULT 'text',required INTEGER NOT NULL DEFAULT 0,
        maxLength INTEGER,optionCategory TEXT,storageMode TEXT NOT NULL DEFAULT 'native',userEditable INTEGER NOT NULL DEFAULT 1,
        sortOrder INTEGER NOT NULL DEFAULT 0,isActive INTEGER NOT NULL DEFAULT 1,placeholder TEXT NOT NULL DEFAULT '',
        helpText TEXT NOT NULL DEFAULT '',validationJson TEXT NOT NULL DEFAULT '{}',updatedAt INTEGER NOT NULL DEFAULT 0
      )`).run();
      await db.prepare(`CREATE TABLE IF NOT EXISTS profile_extension_values (
        userId TEXT NOT NULL,fieldKey TEXT NOT NULL,value TEXT NOT NULL DEFAULT '',updatedAt INTEGER NOT NULL,
        PRIMARY KEY(userId,fieldKey),FOREIGN KEY(userId) REFERENCES users(id) ON DELETE CASCADE
      )`).run();
      await db.prepare(`CREATE TABLE IF NOT EXISTS profile_schema_meta (
        id INTEGER PRIMARY KEY CHECK(id=1),version INTEGER NOT NULL DEFAULT 1,updatedAt INTEGER NOT NULL DEFAULT 0
      )`).run();
      await db.prepare('INSERT OR IGNORE INTO profile_schema_meta(id,version,updatedAt) VALUES (1,1,0)').run();

      const fieldStatements = DEFAULT_FIELDS.map(row => db.prepare(`INSERT OR IGNORE INTO profile_field_schema
        (fieldKey,label,inputType,required,maxLength,optionCategory,storageMode,userEditable,sortOrder,isActive,placeholder,helpText,validationJson,updatedAt)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,0)`)
        .bind(row.fieldKey,row.label,row.inputType,row.required,row.maxLength,row.optionCategory || null,row.storageMode,row.userEditable,row.sortOrder,row.isActive,row.placeholder,row.helpText,row.validationJson));
      if (fieldStatements.length) await db.batch(fieldStatements);

      const optionStatements: any[] = [];
      for (const [category, values] of Object.entries(FALLBACK_OPTIONS)) {
        values.forEach((value, index) => optionStatements.push(db.prepare(`INSERT OR IGNORE INTO profile_option_values
          (category,value,sortOrder,isActive,sourceApp,updatedAt) VALUES (?,?,?,1,'echostars',0)`)
          .bind(category,value,index)));
      }
      if (optionStatements.length) await db.batch(optionStatements);

      const triggers = [
        ['profile_schema_field_insert','AFTER INSERT ON profile_field_schema'],
        ['profile_schema_field_update','AFTER UPDATE ON profile_field_schema'],
        ['profile_schema_field_delete','AFTER DELETE ON profile_field_schema'],
        ['profile_schema_option_insert','AFTER INSERT ON profile_option_values'],
        ['profile_schema_option_update','AFTER UPDATE ON profile_option_values'],
        ['profile_schema_option_delete','AFTER DELETE ON profile_option_values']
      ] as const;
      for (const [name, event] of triggers) {
        await db.prepare(`CREATE TRIGGER IF NOT EXISTS ${name} ${event} BEGIN
          UPDATE profile_schema_meta SET version=version+1,updatedAt=CAST(strftime('%s','now') AS INTEGER)*1000 WHERE id=1;
        END`).run();
      }
    })();
    schemaReady.set(key, task);
    task.catch(() => schemaReady.delete(key));
  }
  await schemaReady.get(key);
}

export async function readProfileSchemaBundle(env: SchemaEnv): Promise<ProfileSchemaBundle> {
  const db = env.STARRY_ID_DB;
  if (!db) {
    return { version: 1, updatedAt: 0, fields: fallbackFields(), options: structuredClone(FALLBACK_OPTIONS), source: 'starry-id-fallback' };
  }
  await ensureCentralSchema(db);
  const [meta, fieldRows, optionRows] = await Promise.all([
    db.prepare('SELECT version,updatedAt FROM profile_schema_meta WHERE id=1').first(),
    db.prepare(`SELECT fieldKey,label,inputType,required,maxLength,optionCategory,storageMode,userEditable,sortOrder,isActive,placeholder,helpText,validationJson
      FROM profile_field_schema WHERE isActive=1 ORDER BY sortOrder,fieldKey`).all(),
    db.prepare(`SELECT category,value FROM profile_option_values WHERE isActive=1 ORDER BY category,sortOrder,value`).all()
  ]);
  const fields: ProfileFieldSchema[] = (fieldRows?.results || []).map((row: any) => ({
    fieldKey: text(row.fieldKey),
    label: text(row.label),
    inputType: ['text','tel','date','select','textarea','relation'].includes(text(row.inputType)) ? text(row.inputType) as ProfileFieldSchema['inputType'] : 'text',
    required: Boolean(row.required),
    maxLength: row.maxLength == null ? null : Math.max(0, Number(row.maxLength) || 0),
    optionCategory: text(row.optionCategory),
    storageMode: row.storageMode === 'extension' ? 'extension' : 'native',
    userEditable: Boolean(row.userEditable),
    sortOrder: Number(row.sortOrder) || 0,
    isActive: Boolean(row.isActive),
    placeholder: text(row.placeholder),
    helpText: text(row.helpText),
    validation: parseValidation(row.validationJson)
  }));
  const options: Record<string,string[]> = {};
  for (const row of optionRows?.results || []) {
    const category = text(row.category);
    if (!category) continue;
    (options[category] ||= []).push(text(row.value));
  }
  return {
    version: Math.max(1, Number(meta?.version) || 1),
    updatedAt: Math.max(0, Number(meta?.updatedAt) || 0),
    fields: fields.length ? fields : fallbackFields(),
    options: Object.keys(options).length ? options : structuredClone(FALLBACK_OPTIONS),
    source: 'starry-id-central'
  };
}

function validDate(value: string, min = '') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year,month,day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year,month-1,day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month-1 || date.getUTCDate() !== day) return false;
  return !min || value >= min;
}

function validateValue(field: ProfileFieldSchema, raw: unknown, options: Record<string,string[]>) {
  const value = raw == null ? '' : String(raw).trim();
  if (field.required && !value) return `${field.label}為必填欄位`;
  if (!value) return '';
  if (field.maxLength != null && value.length > field.maxLength) return `${field.label}最多 ${field.maxLength} 個字`;
  if (field.inputType === 'date') {
    const min = text(field.validation.dateMin);
    if (!validDate(value,min)) return `${field.label}格式不正確`;
  }
  if (field.inputType === 'select' && field.optionCategory) {
    const allowed = options[field.optionCategory] || [];
    const canonicalLegacyValue = LEGACY_OPTION_ALIASES[field.optionCategory]?.[value] || '';
    const acceptedLegacyValue = canonicalLegacyValue && allowed.includes(canonicalLegacyValue);
    if (allowed.length && !allowed.includes(value) && !acceptedLegacyValue) return `${field.label}請使用中央最新選項`;
  }
  const pattern = text(field.validation.pattern);
  if (pattern && pattern.length <= 200) {
    try {
      if (!new RegExp(pattern,'u').test(value)) return `${field.label}格式不正確`;
    } catch {
      // Invalid administrator metadata must not take the whole member system down.
    }
  }
  return '';
}

export async function validateCentralProfilePatch(env: SchemaEnv, patch: Record<string,unknown>) {
  const schema = await readProfileSchemaBundle(env);
  const fields = new Map(schema.fields.filter(field => field.storageMode === 'native' && field.isActive).map(field => [field.fieldKey,field]));
  for (const [key,value] of Object.entries(patch || {})) {
    const field = fields.get(key);
    if (!field) continue;
    const error = validateValue(field,value,schema.options);
    if (error) return { ok:false as const,error,version:schema.version,field:key };
  }
  return { ok:true as const,version:schema.version };
}

export async function readExtensionProfileValues(env: SchemaEnv, userId: string) {
  const db = env.STARRY_ID_DB;
  if (!db || !userId) return {} as Record<string,string>;
  await ensureCentralSchema(db);
  const rows = await db.prepare('SELECT fieldKey,value FROM profile_extension_values WHERE userId=?').bind(userId).all();
  const values: Record<string,string> = {};
  for (const row of rows?.results || []) values[text(row.fieldKey)] = text(row.value);
  return values;
}

export async function writeExtensionProfileValues(env: SchemaEnv, userId: string, values: Record<string,unknown>) {
  const db = env.STARRY_ID_DB;
  if (!db) throw new Error('Starry ID 中央資料庫暫時無法使用');
  await ensureCentralSchema(db);
  const schema = await readProfileSchemaBundle(env);
  const fields = new Map(schema.fields.filter(field => field.storageMode === 'extension' && field.isActive && field.userEditable).map(field => [field.fieldKey,field]));
  const statements: any[] = [];
  const now = Date.now();
  for (const [key,raw] of Object.entries(values || {})) {
    const field = fields.get(key);
    if (!field) throw new Error(`不支援的中央會員欄位：${key}`);
    const error = validateValue(field,raw,schema.options);
    if (error) throw new Error(error);
    const value = raw == null ? '' : String(raw).trim();
    statements.push(db.prepare(`INSERT INTO profile_extension_values(userId,fieldKey,value,updatedAt)
      VALUES (?,?,?,?) ON CONFLICT(userId,fieldKey) DO UPDATE SET value=excluded.value,updatedAt=excluded.updatedAt`)
      .bind(userId,key,value,now));
  }
  if (statements.length) await db.batch(statements);
  return readExtensionProfileValues(env,userId);
}
