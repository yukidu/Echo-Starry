import {
  RESIDENCE_OPTIONS,
  CENTER_OPTIONS,
  RANK_ORDER,
  JOIN_REASONS,
  STAY_REASONS
} from './types';

type InputType = 'text' | 'tel' | 'date' | 'select' | 'textarea' | 'relation';
type SchemaField = {
  fieldKey: string;
  label: string;
  inputType: InputType;
  required: boolean;
  maxLength: number | null;
  optionCategory: string;
  storageMode: 'native' | 'extension';
  userEditable: boolean;
  sortOrder: number;
  isActive: boolean;
  placeholder: string;
  helpText: string;
  validation?: Record<string, unknown>;
};
type SchemaBundle = {
  version: number;
  updatedAt: number;
  fields: SchemaField[];
  options: Record<string,string[]>;
  source?: string;
};

const CACHE_KEY = 'starry_profile_schema_cache_v1';
const CACHE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const ECHO_MANAGED_EXTENSION_FIELDS = new Set(['motto']);
let activeSchema: SchemaBundle | null = null;
let refreshPromise: Promise<SchemaBundle | null> | null = null;
let extensionValues: Record<string,string> | null = null;
let extensionUserId = '';
let extensionLoadPromise: Promise<Record<string,string>> | null = null;

const nativeLabels: Record<string,string[]> = {
  name: ['姓名或暱稱'],
  amwayId: ['直銷商編號'],
  phone: ['手機'],
  residence: ['居住地'],
  center: ['直銷商中心'],
  rank: ['最高獎銜'],
  joinReason: ['初次如何認識安麗？'],
  stayReason: ['什麼原因留在安麗？'],
  sponsor: ['推薦人'],
  platinumUpline: ['上手白金'],
  diamondUpline: ['上手鑽石'],
  birthday: ['西元生日']
};

function mutable(list: readonly string[]) {
  return list as unknown as string[];
}

function replaceArray(target: string[], next: string[] | undefined) {
  if (!Array.isArray(next) || next.length === 0) return;
  if (target.length === next.length && target.every((value,index) => value === next[index])) return;
  target.splice(0,target.length,...next);
}

function applyCentralOptions(schema: SchemaBundle) {
  replaceArray(mutable(RESIDENCE_OPTIONS),schema.options?.residence);
  replaceArray(mutable(CENTER_OPTIONS),schema.options?.center);
  replaceArray(mutable(RANK_ORDER),schema.options?.rank);
  replaceArray(mutable(JOIN_REASONS),schema.options?.joinReason);
  replaceArray(mutable(STAY_REASONS),schema.options?.stayReason);
}

function validBundle(value: unknown): value is SchemaBundle {
  const candidate = value as SchemaBundle;
  return Boolean(candidate && Number.isFinite(Number(candidate.version)) && Array.isArray(candidate.fields) && candidate.options && typeof candidate.options === 'object');
}

function loadCachedSchema() {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!validBundle(parsed?.schema)) return null;
    if (Date.now() - Number(parsed.savedAt || 0) > CACHE_MAX_AGE) return null;
    activeSchema = parsed.schema;
    applyCentralOptions(parsed.schema);
    return parsed.schema;
  } catch {
    return null;
  }
}

function storeSchema(schema: SchemaBundle) {
  activeSchema = schema;
  applyCentralOptions(schema);
  try { localStorage.setItem(CACHE_KEY,JSON.stringify({ savedAt:Date.now(),schema })); } catch {}
  window.dispatchEvent(new CustomEvent('starry:profile-schema-updated',{ detail:{ version:schema.version } }));
}

export function refreshMemberProfileSchema() {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (refreshPromise) return refreshPromise;
  refreshPromise = fetch('/api/starry/profile-schema',{
    method:'GET',credentials:'same-origin',cache:'default',headers:{Accept:'application/json'}
  }).then(async response => {
    if (!response.ok) throw new Error('central schema unavailable');
    const data = await response.json();
    if (!validBundle(data)) throw new Error('invalid central schema');
    const changed = !activeSchema || Number(activeSchema.version) !== Number(data.version) || JSON.stringify(activeSchema.options) !== JSON.stringify(data.options);
    storeSchema(data);
    if (changed) scheduleProfileDomSync();
    return data;
  }).catch(() => activeSchema).finally(() => { refreshPromise = null; });
  return refreshPromise;
}

function currentEchoUserId() {
  try {
    const user = JSON.parse(localStorage.getItem('sq_current_user_v1') || 'null');
    return String(user?.id || '');
  } catch { return ''; }
}

async function loadExtensionValues(force = false) {
  const userId = currentEchoUserId();
  if (!userId) return {};
  if (userId !== extensionUserId) {
    extensionUserId = userId;
    extensionValues = null;
    extensionLoadPromise = null;
  }
  if (extensionValues && !force) return extensionValues;
  if (extensionLoadPromise) return extensionLoadPromise;
  extensionLoadPromise = fetch('/api/starry/profile-values',{credentials:'same-origin',cache:'no-store'})
    .then(async response => response.ok ? response.json() : Promise.reject(new Error('profile values unavailable')))
    .then(data => {
      extensionValues = data?.values && typeof data.values === 'object' ? data.values : {};
      return extensionValues || {};
    })
    .catch(() => extensionValues || {})
    .finally(() => { extensionLoadPromise = null; });
  return extensionLoadPromise;
}

async function saveExtensionValue(field: SchemaField, value: string, status: HTMLElement) {
  status.textContent = '同步中…';
  status.dataset.state = 'saving';
  try {
    const response = await fetch('/api/starry/profile-values',{
      method:'PUT',credentials:'same-origin',cache:'no-store',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({values:{[field.fieldKey]:value}})
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || '中央同步失敗');
    extensionValues = data.values || {...(extensionValues || {}),[field.fieldKey]:value};
    status.textContent = '已同步 Starry ID';
    status.dataset.state = 'saved';
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : '中央同步失敗';
    status.dataset.state = 'error';
  }
}

function matchNativeControl(page: HTMLElement, field: SchemaField) {
  const labels = nativeLabels[field.fieldKey] || [field.label];
  const label = Array.from(page.querySelectorAll('label')).find(element => {
    const value = (element.textContent || '').replace(/\s+/g,' ').trim();
    return labels.some(candidate => value.startsWith(candidate));
  });
  if (!label) return null;
  const parent = label.parentElement;
  return parent?.querySelector('input,textarea,select') as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
}

function syncSelectOptions(control: HTMLSelectElement, field: SchemaField, schema: SchemaBundle) {
  if (!field.optionCategory) return;
  const values = schema.options?.[field.optionCategory];
  if (!Array.isArray(values) || !values.length) return;
  const current = control.value;
  const desired = current && !values.includes(current) ? [current,...values] : values;
  const existing = Array.from(control.options).map(option => option.value);
  if (existing.length === desired.length && existing.every((value,index) => value === desired[index])) return;
  control.replaceChildren(...desired.map(value => {
    const option = document.createElement('option');
    option.value = value;
    option.textContent = value;
    return option;
  }));
  control.value = current && desired.includes(current) ? current : desired[0] || '';
}

function applyNativeRules(page: HTMLElement, schema: SchemaBundle) {
  for (const field of schema.fields.filter(item => item.isActive && item.storageMode === 'native')) {
    const control = matchNativeControl(page,field);
    if (!control) continue;
    if (field.required) control.setAttribute('required',''); else control.removeAttribute('required');
    if (field.maxLength != null && 'maxLength' in control && field.inputType !== 'select') control.maxLength = field.maxLength;
    if (field.placeholder && 'placeholder' in control) control.placeholder = field.placeholder;
    if (field.inputType === 'date' && control instanceof HTMLInputElement) {
      control.type = 'date';
      const min = String(field.validation?.dateMin || '');
      if (min) control.min = min;
      control.max = new Date().toISOString().slice(0,10);
    }
    if (control instanceof HTMLSelectElement) syncSelectOptions(control,field,schema);
  }
}

function makeExtensionControl(field: SchemaField, value: string, schema: SchemaBundle) {
  let control: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
  if (field.inputType === 'select') {
    const select = document.createElement('select');
    const values = schema.options?.[field.optionCategory] || [];
    for (const item of values) {
      const option = document.createElement('option'); option.value=item; option.textContent=item; select.appendChild(option);
    }
    if (value && !values.includes(value)) {
      const option=document.createElement('option'); option.value=value; option.textContent=value; select.prepend(option);
    }
    select.value=value || values[0] || '';
    control=select;
  } else if (field.inputType === 'textarea') {
    const textarea=document.createElement('textarea'); textarea.rows=3; textarea.value=value; control=textarea;
  } else {
    const input=document.createElement('input'); input.type=field.inputType === 'tel' || field.inputType === 'date' ? field.inputType : 'text'; input.value=value; control=input;
  }
  control.className='w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-hidden';
  control.dataset.starryField=field.fieldKey;
  if (field.required) control.required=true;
  if (field.maxLength != null && !(control instanceof HTMLSelectElement)) control.maxLength=field.maxLength;
  if (field.placeholder && !(control instanceof HTMLSelectElement)) control.placeholder=field.placeholder;
  if (field.inputType==='date' && control instanceof HTMLInputElement) {
    const min=String(field.validation?.dateMin || ''); if(min)control.min=min; control.max=new Date().toISOString().slice(0,10);
  }
  return control;
}

async function renderExtensionEditor(page: HTMLElement, schema: SchemaBundle) {
  const extensionFields = schema.fields
    .filter(field => field.isActive && field.userEditable && field.storageMode === 'extension' && !ECHO_MANAGED_EXTENSION_FIELDS.has(field.fieldKey))
    .sort((a,b)=>a.sortOrder-b.sortOrder);
  if (!extensionFields.length) { page.querySelector('[data-starry-extension-fields]')?.remove(); return; }
  const editTitle = Array.from(page.querySelectorAll('span')).find(node => (node.textContent || '').trim() === '編輯個人基本資料');
  if (!editTitle) return;
  const card = editTitle.closest('.rounded-2xl') as HTMLElement | null;
  const grid = card?.querySelector('.grid') as HTMLElement | null;
  if (!grid || grid.querySelector('[data-starry-extension-fields]')) return;
  const values = await loadExtensionValues();
  if (!document.body.contains(grid) || grid.querySelector('[data-starry-extension-fields]')) return;
  const section=document.createElement('div');
  section.dataset.starryExtensionFields='1';
  section.className='sm:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-slate-200/70 dark:border-slate-700';
  const heading=document.createElement('div'); heading.className='sm:col-span-2'; heading.innerHTML='<div class="font-bold text-slate-700 dark:text-slate-200">Starry ID 中央欄位</div><div class="text-[10px] text-slate-500">中央新增的一般欄位會自動出現在這裡；修改後離開欄位即同步中央。</div>'; section.appendChild(heading);
  for (const field of extensionFields) {
    const wrapper=document.createElement('div'); wrapper.dataset.starryExtensionField=field.fieldKey;
    const label=document.createElement('label'); label.className='block font-bold text-slate-700 dark:text-slate-300 mb-0.5'; label.textContent=field.label+(field.required?' *':'');
    const control=makeExtensionControl(field,values[field.fieldKey] || '',schema);
    const help=document.createElement('div'); help.className='text-[10px] text-slate-500 mt-0.5'; help.textContent=field.helpText || '';
    const status=document.createElement('div'); status.className='text-[10px] text-slate-400 mt-0.5 min-h-[14px]';
    let last=String((control as HTMLInputElement).value || '');
    const commit=()=>{const next=String((control as HTMLInputElement).value || '').trim();if(next===last)return;void saveExtensionValue(field,next,status).then(()=>{if(status.dataset.state==='saved')last=next})};
    control.addEventListener(control instanceof HTMLSelectElement ? 'change' : 'blur',commit);
    wrapper.append(label,control); if(field.helpText)wrapper.append(help); wrapper.append(status); section.appendChild(wrapper);
  }
  grid.appendChild(section);
}

async function renderExtensionDisplay(page: HTMLElement, schema: SchemaBundle) {
  const extensionFields=schema.fields
    .filter(field=>field.isActive&&field.storageMode==='extension'&&!ECHO_MANAGED_EXTENSION_FIELDS.has(field.fieldKey))
    .sort((a,b)=>a.sortOrder-b.sortOrder);
  if(!extensionFields.length || page.querySelector('[data-starry-extension-display]'))return;
  if(Array.from(page.querySelectorAll('span')).some(node=>(node.textContent||'').trim()==='編輯個人基本資料'))return;
  const values=await loadExtensionValues();
  const visible=extensionFields.filter(field=>String(values[field.fieldKey]||'').trim());
  if(!visible.length)return;
  const grids=Array.from(page.querySelectorAll('div.grid')) as HTMLElement[];
  const target=grids.find(grid=>grid.className.includes('grid-cols-2')&&grid.className.includes('gap-2'));
  if(!target||!document.body.contains(target)||page.querySelector('[data-starry-extension-display]'))return;
  const section=document.createElement('div');section.dataset.starryExtensionDisplay='1';section.className='grid grid-cols-2 gap-2';
  for(const field of visible){const card=document.createElement('div');card.dataset.starryExtensionField=field.fieldKey;card.className='bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-100 dark:border-slate-700';const label=document.createElement('span');label.className='text-[10px] text-slate-500 dark:text-slate-400 block font-semibold';label.textContent=field.label;const value=document.createElement('span');value.className='font-semibold text-slate-800 dark:text-slate-200 break-words';value.textContent=values[field.fieldKey];card.append(label,value);section.appendChild(card)}
  target.insertAdjacentElement('afterend',section);
}

async function syncProfileDom() {
  if (typeof document === 'undefined' || !activeSchema) return;
  const page=document.querySelector('.profile-page') as HTMLElement | null;
  if(!page)return;
  page.querySelectorAll<HTMLElement>('[data-starry-extension-field="motto"]').forEach(node=>node.remove());
  applyNativeRules(page,activeSchema);
  await renderExtensionEditor(page,activeSchema);
  await renderExtensionDisplay(page,activeSchema);
}

let scheduled=false;
function scheduleProfileDomSync(){
  if(typeof window==='undefined'||scheduled)return;
  scheduled=true;
  window.setTimeout(()=>{scheduled=false;void syncProfileDom()},0);
}

if (typeof window !== 'undefined') {
  loadCachedSchema();
  void refreshMemberProfileSchema();
  document.addEventListener('click',scheduleProfileDomSync,true);
  window.addEventListener('starry:profile-schema-updated',scheduleProfileDomSync);
  window.addEventListener('focus',()=>{void refreshMemberProfileSchema()},{passive:true});
  scheduleProfileDomSync();
}
