const STYLE_ID = 'echostars-home-density-policy';
const ROOT_CLASS = 'echostars-home-density';
const HOME_GRID_SELECTOR = '.audio-card-grid';
const DISPLAY_CACHE_KEY = 'echostars_display_settings_v1';
const USER_FONT_ZOOM_KEY = 'echostars_user_font_zoom_v1';
const DISPLAY_CACHE_TTL = 6 * 60 * 60 * 1000;
const DISPLAY_DIALOG_ID = 'echostars-display-settings-dialog';

type DisplaySettings = {
  mobile: { columns: number; gap: number; maxWidth: number; fontScale: number };
  tablet: { portraitColumns: number; landscapeColumns: number; gap: number; maxWidth: number; fontScale: number };
  desktop: { columns: number; gap: number; maxWidth: number; fontScale: number };
};

const DEFAULT_DISPLAY_SETTINGS: DisplaySettings = {
  mobile: { columns: 1, gap: 6, maxWidth: 760, fontScale: 1 },
  tablet: { portraitColumns: 1, landscapeColumns: 3, gap: 8, maxWidth: 1180, fontScale: 1 },
  desktop: { columns: 3, gap: 10, maxWidth: 1440, fontScale: 1 }
};

let displaySettings: DisplaySettings = structuredClone(DEFAULT_DISPLAY_SETTINGS);

function clamp(value: unknown, min: number, max: number, fallback: number) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}
function integer(value: unknown, min: number, max: number, fallback: number) {
  return Math.round(clamp(value, min, max, fallback));
}
function normalizeDisplaySettings(input: any): DisplaySettings {
  return {
    mobile: {
      columns: integer(input?.mobile?.columns, 1, 2, 1),
      gap: integer(input?.mobile?.gap, 2, 24, 6),
      maxWidth: integer(input?.mobile?.maxWidth, 320, 900, 760),
      fontScale: clamp(input?.mobile?.fontScale, 0.8, 1.4, 1)
    },
    tablet: {
      portraitColumns: integer(input?.tablet?.portraitColumns, 1, 3, 1),
      landscapeColumns: integer(input?.tablet?.landscapeColumns, 1, 4, 3),
      gap: integer(input?.tablet?.gap, 2, 24, 8),
      maxWidth: integer(input?.tablet?.maxWidth, 700, 1600, 1180),
      fontScale: clamp(input?.tablet?.fontScale, 0.8, 1.4, 1)
    },
    desktop: {
      columns: integer(input?.desktop?.columns, 1, 4, 3),
      gap: integer(input?.desktop?.gap, 2, 32, 10),
      maxWidth: integer(input?.desktop?.maxWidth, 960, 2000, 1440),
      fontScale: clamp(input?.desktop?.fontScale, 0.8, 1.4, 1)
    }
  };
}

function installHomeDensityStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    html.${ROOT_CLASS} main {
      padding-top: .55rem !important;
      max-width: min(var(--echostars-home-max-width, 48rem), calc(100vw - .5rem)) !important;
    }
    html.${ROOT_CLASS} main > .space-y-4 > * + * { margin-top: .5rem !important; }
    html.${ROOT_CLASS} main > .space-y-4 p,
    html.${ROOT_CLASS} main > .space-y-4 span,
    html.${ROOT_CLASS} main > .space-y-4 button,
    html.${ROOT_CLASS} main > .space-y-4 input { line-height: 1.1 !important; }
    html.${ROOT_CLASS} main > .space-y-4 > div:first-child input,
    html.${ROOT_CLASS} main > .space-y-4 > div:first-child > button { padding-top: .45rem !important; padding-bottom: .45rem !important; }
    html.${ROOT_CLASS} .sort-toolbar { gap: .2rem !important; padding-top: 0 !important; }
    html.${ROOT_CLASS} .sort-toolbar button { padding-top: .2rem !important; padding-bottom: .2rem !important; line-height: 1 !important; }
    html.${ROOT_CLASS} .audio-card-grid {
      grid-template-columns: repeat(var(--echostars-home-columns, 1), minmax(0, 1fr)) !important;
      gap: var(--echostars-home-gap, .35rem) !important;
      padding-top: .1rem !important;
    }
    html.${ROOT_CLASS} .audio-card { padding-top: .4rem !important; padding-bottom: .4rem !important; padding-left: .5rem !important; }
    html.${ROOT_CLASS} .audio-card > div { gap: .5rem !important; }
    html.${ROOT_CLASS} .audio-card h3 { line-height: 1.05 !important; margin: 0 !important; }
    html.${ROOT_CLASS} .audio-card p { line-height: 1.05 !important; margin-top: .1rem !important; margin-bottom: 0 !important; }
    html.${ROOT_CLASS} .audio-card .mt-1 { margin-top: .2rem !important; }
    html.${ROOT_CLASS} .audio-card .border-t { padding-top: .25rem !important; gap: .15rem !important; }
    html.${ROOT_CLASS} .audio-card .reaction-button { padding-top: .15rem !important; padding-bottom: .15rem !important; gap: .3rem !important; line-height: 1 !important; }
    html.${ROOT_CLASS} .audio-card .rating-star { padding: .1rem !important; }
    html.${ROOT_CLASS} .audio-card [class*="rounded-md"] { line-height: 1 !important; }
    html.${ROOT_CLASS} main > footer { margin-top: 1.5rem !important; padding-top: .65rem !important; line-height: 1.05 !important; }
    @media (max-width: 639px) {
      html.${ROOT_CLASS} main { padding-left: .75rem !important; padding-right: .75rem !important; }
      html.${ROOT_CLASS} .audio-card { padding-top: .35rem !important; padding-bottom: .35rem !important; padding-left: .4rem !important; }
      html.${ROOT_CLASS} .audio-card > div { gap: .4rem !important; }
    }
    #${DISPLAY_DIALOG_ID} input[type="range"] { accent-color: var(--color-primary,#c06c84); }
  `;
  document.head.appendChild(style);
}

function deviceKind(): 'mobile' | 'tablet' | 'desktop' {
  const shortSide = Math.min(Number(screen.width || innerWidth), Number(screen.height || innerHeight));
  const touch = (navigator.maxTouchPoints || 0) > 1 || matchMedia('(pointer: coarse)').matches;
  if (shortSide < 600 || innerWidth < 600) return 'mobile';
  if (touch && shortSide >= 600) return 'tablet';
  return 'desktop';
}
function orientation() { return innerWidth >= innerHeight ? 'landscape' : 'portrait'; }
function readFontZoom() {
  const n = Number(localStorage.getItem(USER_FONT_ZOOM_KEY));
  return Number.isFinite(n) ? clamp(n, .8, 1.4, 1) : 1;
}
function setFontZoom(value: number) {
  localStorage.setItem(USER_FONT_ZOOM_KEY, String(Math.round(clamp(value, .8, 1.4, 1) * 10) / 10));
  applyDisplaySettings(displaySettings);
  syncFontLabels();
}

function applyDisplaySettings(raw: DisplaySettings) {
  displaySettings = normalizeDisplaySettings(raw);
  const kind = deviceKind();
  const dir = orientation();
  const conf = kind === 'mobile'
    ? { columns: displaySettings.mobile.columns, gap: displaySettings.mobile.gap, maxWidth: displaySettings.mobile.maxWidth, fontScale: displaySettings.mobile.fontScale }
    : kind === 'tablet'
      ? { columns: dir === 'landscape' ? displaySettings.tablet.landscapeColumns : displaySettings.tablet.portraitColumns, gap: displaySettings.tablet.gap, maxWidth: displaySettings.tablet.maxWidth, fontScale: displaySettings.tablet.fontScale }
      : { columns: displaySettings.desktop.columns, gap: displaySettings.desktop.gap, maxWidth: displaySettings.desktop.maxWidth, fontScale: displaySettings.desktop.fontScale };
  const root = document.documentElement;
  root.dataset.echostarsDevice = kind;
  root.dataset.echostarsOrientation = dir;
  root.style.setProperty('--echostars-home-columns', String(conf.columns));
  root.style.setProperty('--echostars-home-gap', `${conf.gap}px`);
  root.style.setProperty('--echostars-home-max-width', `${conf.maxWidth}px`);
  root.style.fontSize = `${Math.round(16 * conf.fontScale * readFontZoom() * 100) / 100}px`;
}

function readDisplayCache() {
  try {
    const parsed = JSON.parse(localStorage.getItem(DISPLAY_CACHE_KEY) || 'null');
    return parsed?.settings ? { settings: normalizeDisplaySettings(parsed.settings), savedAt: Number(parsed.savedAt) || 0 } : null;
  } catch { return null; }
}
function writeDisplayCache(settings: DisplaySettings) {
  try { localStorage.setItem(DISPLAY_CACHE_KEY, JSON.stringify({ settings, savedAt: Date.now() })); } catch {}
}
async function fetchDisplaySettings(force = false) {
  const cached = readDisplayCache();
  if (!force && cached && Date.now() - cached.savedAt < DISPLAY_CACHE_TTL) {
    applyDisplaySettings(cached.settings);
    return cached.settings;
  }
  try {
    const response = await fetch(`/api/display-settings${force ? `?t=${Date.now()}` : ''}`, { cache: force ? 'no-store' : 'default', credentials: 'same-origin' });
    if (!response.ok) throw new Error(String(response.status));
    const data = await response.json();
    const settings = normalizeDisplaySettings(data?.settings || data);
    writeDisplayCache(settings);
    applyDisplaySettings(settings);
    return settings;
  } catch {
    const fallback = cached?.settings || structuredClone(DEFAULT_DISPLAY_SETTINGS);
    applyDisplaySettings(fallback);
    return fallback;
  }
}

function syncFontLabels() {
  const text = `${Math.round(readFontZoom() * 100)}%`;
  document.querySelectorAll<HTMLElement>('[data-echostars-font-zoom-value]').forEach(el => { el.textContent = text; });
}
function injectFontControl() {
  const panel = document.querySelector<HTMLElement>('.mobile-menu-panel');
  if (!panel || panel.querySelector('[data-echostars-font-control]')) return;
  const row = document.createElement('div');
  row.dataset.echostarsFontControl = 'true';
  row.className = 'mobile-menu-row flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-semibold whitespace-nowrap hover:bg-slate-100 dark:hover:bg-slate-800';
  row.innerHTML = '<span class="w-4 shrink-0 text-center font-black">A</span><span class="mr-auto">字體大小</span><button type="button" data-font-minus class="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 font-black">A−</button><button type="button" data-font-reset class="min-w-12 h-8 px-1 text-xs font-black text-[var(--color-primary,#c06c84)]"><span data-echostars-font-zoom-value>100%</span></button><button type="button" data-font-plus class="w-8 h-8 rounded-lg border border-slate-200 dark:border-slate-700 font-black">A＋</button>';
  row.querySelector('[data-font-minus]')?.addEventListener('click', e => { e.stopPropagation(); setFontZoom(readFontZoom() - .1); });
  row.querySelector('[data-font-plus]')?.addEventListener('click', e => { e.stopPropagation(); setFontZoom(readFontZoom() + .1); });
  row.querySelector('[data-font-reset]')?.addEventListener('click', e => { e.stopPropagation(); setFontZoom(1); });
  const theme = Array.from(panel.querySelectorAll('button')).find(btn => /切換.+色模式/.test(btn.textContent || ''));
  theme ? theme.insertAdjacentElement('afterend', row) : panel.appendChild(row);
  syncFontLabels();
}

function isSuperAdminLocal() {
  try {
    const user = JSON.parse(localStorage.getItem('sq_current_user_v1') || 'null');
    return String(user?.email || '').trim().toLowerCase() === 'yukidu@gmail.com' || user?.role === '超級管理員';
  } catch { return false; }
}
function previewMarkup(label: string, name: string) {
  return `<div class="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/70 p-3"><div class="text-xs font-black mb-2">${label}</div><div class="rounded-xl border-2 border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 p-2"><div class="h-2 rounded mb-2" style="background:var(--color-primary,#c06c84)"></div><div data-preview="${name}">${'<i class="block h-10 rounded-lg border border-slate-200 dark:border-slate-700"></i>'.repeat(6)}</div></div></div>`;
}
function controlBlock(kind: 'mobile' | 'tablet' | 'desktop') {
  const range = (name: string, label: string, min: number, max: number, step: number) => `<label class="block text-xs font-bold">${label} <b data-value="${name}" class="text-[var(--color-primary,#c06c84)]"></b><input class="mt-1 w-full" name="${name}" type="range" min="${min}" max="${max}" step="${step}"></label>`;
  const select = (name: string, label: string, max: number) => `<label class="block text-xs font-bold">${label}<select name="${name}" class="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-2">${Array.from({ length: max }, (_, i) => `<option value="${i + 1}">${i + 1} 欄</option>`).join('')}</select></label>`;
  if (kind === 'mobile') return `<section class="rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-3"><h3 class="font-black">📱 手機</h3>${select('mobile-columns','首頁欄數',2)}${range('mobile-gap','卡片間距',2,24,1)}${range('mobile-width','內容最大寬度',320,900,20)}${range('mobile-font','預設字體',.8,1.4,.05)}</section>`;
  if (kind === 'tablet') return `<section class="rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-3"><h3 class="font-black">▭ 平板</h3><div class="grid grid-cols-2 gap-2">${select('tablet-portrait-columns','直式欄數',3)}${select('tablet-landscape-columns','橫式欄數',4)}</div>${range('tablet-gap','卡片間距',2,24,1)}${range('tablet-width','內容最大寬度',700,1600,20)}${range('tablet-font','預設字體',.8,1.4,.05)}</section>`;
  return `<section class="rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-3"><h3 class="font-black">🖥️ 桌機</h3>${select('desktop-columns','首頁欄數',4)}${range('desktop-gap','卡片間距',2,32,1)}${range('desktop-width','內容最大寬度',960,2000,20)}${range('desktop-font','預設字體',.8,1.4,.05)}</section>`;
}
function field(dialog: HTMLElement, name: string, fallback: number) {
  return Number(dialog.querySelector<HTMLInputElement | HTMLSelectElement>(`[name="${name}"]`)?.value ?? fallback);
}
function settingsFromDialog(dialog: HTMLElement) {
  return normalizeDisplaySettings({
    mobile: { columns: field(dialog,'mobile-columns',1), gap: field(dialog,'mobile-gap',6), maxWidth: field(dialog,'mobile-width',760), fontScale: field(dialog,'mobile-font',1) },
    tablet: { portraitColumns: field(dialog,'tablet-portrait-columns',1), landscapeColumns: field(dialog,'tablet-landscape-columns',3), gap: field(dialog,'tablet-gap',8), maxWidth: field(dialog,'tablet-width',1180), fontScale: field(dialog,'tablet-font',1) },
    desktop: { columns: field(dialog,'desktop-columns',3), gap: field(dialog,'desktop-gap',10), maxWidth: field(dialog,'desktop-width',1440), fontScale: field(dialog,'desktop-font',1) }
  });
}
function setDialogValues(dialog: HTMLElement, s: DisplaySettings) {
  const values: Record<string, number> = {
    'mobile-columns':s.mobile.columns,'mobile-gap':s.mobile.gap,'mobile-width':s.mobile.maxWidth,'mobile-font':s.mobile.fontScale,
    'tablet-portrait-columns':s.tablet.portraitColumns,'tablet-landscape-columns':s.tablet.landscapeColumns,'tablet-gap':s.tablet.gap,'tablet-width':s.tablet.maxWidth,'tablet-font':s.tablet.fontScale,
    'desktop-columns':s.desktop.columns,'desktop-gap':s.desktop.gap,'desktop-width':s.desktop.maxWidth,'desktop-font':s.desktop.fontScale
  };
  for (const [name,value] of Object.entries(values)) { const input=dialog.querySelector<HTMLInputElement|HTMLSelectElement>(`[name="${name}"]`); if(input)input.value=String(value); }
  syncDialog(dialog,s);
}
function syncDialog(dialog: HTMLElement, s: DisplaySettings) {
  const labels: Record<string,string> = {
    'mobile-gap':`${s.mobile.gap}px`,'mobile-width':`${s.mobile.maxWidth}px`,'mobile-font':`${Math.round(s.mobile.fontScale*100)}%`,
    'tablet-gap':`${s.tablet.gap}px`,'tablet-width':`${s.tablet.maxWidth}px`,'tablet-font':`${Math.round(s.tablet.fontScale*100)}%`,
    'desktop-gap':`${s.desktop.gap}px`,'desktop-width':`${s.desktop.maxWidth}px`,'desktop-font':`${Math.round(s.desktop.fontScale*100)}%`
  };
  for(const [name,text] of Object.entries(labels)){const el=dialog.querySelector<HTMLElement>(`[data-value="${name}"]`);if(el)el.textContent=text;}
  const previews:[string,number,number][]=[['mobile',s.mobile.columns,s.mobile.gap],['tablet-portrait',s.tablet.portraitColumns,s.tablet.gap],['tablet-landscape',s.tablet.landscapeColumns,s.tablet.gap],['desktop',s.desktop.columns,s.desktop.gap]];
  for(const [name,columns,gap] of previews){const el=dialog.querySelector<HTMLElement>(`[data-preview="${name}"]`);if(el){el.style.display='grid';el.style.gridTemplateColumns=`repeat(${columns},minmax(0,1fr))`;el.style.gap=`${Math.max(2,gap/2)}px`;}}
}
async function openDisplayDialog() {
  document.getElementById(DISPLAY_DIALOG_ID)?.remove();
  const dialog=document.createElement('div');dialog.id=DISPLAY_DIALOG_ID;dialog.className='fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm overflow-y-auto p-3 sm:p-6';
  dialog.innerHTML=`<div class="mx-auto w-full max-w-6xl rounded-3xl bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden"><header class="px-5 py-4 flex items-center justify-between text-white" style="background:var(--color-primary,#c06c84)"><div><h2 class="font-black text-lg">顯示設定</h2><p class="text-xs text-white/80">手機／平板／桌機視覺化配置</p></div><button data-close class="w-10 h-10 rounded-xl bg-white/15 text-xl">×</button></header><div class="p-4 sm:p-6 space-y-5"><div class="grid grid-cols-1 lg:grid-cols-4 gap-3">${previewMarkup('手機','mobile')}${previewMarkup('平板直式','tablet-portrait')}${previewMarkup('平板橫式','tablet-landscape')}${previewMarkup('桌機','desktop')}</div><div class="grid grid-cols-1 lg:grid-cols-3 gap-4">${controlBlock('mobile')}${controlBlock('tablet')}${controlBlock('desktop')}</div><p class="text-xs rounded-xl bg-slate-50 dark:bg-slate-800 p-3">全站預設值會同步給所有裝置；主選單 A−／A＋ 是每位使用者自己的本機字體調整，不會增加雲端寫入。</p><div data-status class="min-h-5 text-sm font-bold text-emerald-600"></div><div class="flex justify-end gap-2"><button data-reset class="px-4 py-2 rounded-xl border border-slate-300 dark:border-slate-700 font-bold">還原預設</button><button data-save class="px-5 py-2 rounded-xl text-white font-black" style="background:var(--color-primary,#c06c84)">儲存全站顯示設定</button></div></div></div>`;
  document.body.appendChild(dialog);
  const live=await fetchDisplaySettings(true);setDialogValues(dialog,live);
  dialog.querySelectorAll('input,select').forEach(el=>el.addEventListener('input',()=>syncDialog(dialog,settingsFromDialog(dialog))));
  dialog.querySelector('[data-close]')?.addEventListener('click',()=>dialog.remove());
  dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.remove();});
  dialog.querySelector('[data-reset]')?.addEventListener('click',()=>setDialogValues(dialog,structuredClone(DEFAULT_DISPLAY_SETTINGS)));
  dialog.querySelector('[data-save]')?.addEventListener('click',async()=>{
    const button=dialog.querySelector<HTMLButtonElement>('[data-save]');const status=dialog.querySelector<HTMLElement>('[data-status]');if(!button)return;
    button.disabled=true;button.textContent='儲存中…';
    try{const draft=settingsFromDialog(dialog);const response=await fetch('/api/display-settings',{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({settings:draft})});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data?.error||`儲存失敗：${response.status}`);const saved=normalizeDisplaySettings(data?.settings||draft);writeDisplayCache(saved);applyDisplaySettings(saved);setDialogValues(dialog,saved);if(status){status.className='min-h-5 text-sm font-bold text-emerald-600';status.textContent='已儲存，全站顯示設定已更新。';}}
    catch(error){if(status){status.className='min-h-5 text-sm font-bold text-red-600';status.textContent=error instanceof Error?error.message:'儲存失敗';}}
    finally{button.disabled=false;button.textContent='儲存全站顯示設定';}
  });
}
function injectAdminDisplayTab() {
  if(!isSuperAdminLocal())return;
  const tabs=Array.from(document.querySelectorAll<HTMLElement>('.scrollbar-none')).find(el=>(el.textContent||'').includes('數據中心')&&(el.textContent||'').includes('權限表'));
  if(!tabs||tabs.querySelector('[data-echostars-display-tab]'))return;
  const button=document.createElement('button');button.type='button';button.dataset.echostarsDisplayTab='true';button.className='pb-1.5 px-2 font-bold border-b-2 border-transparent shrink-0 text-slate-500 dark:text-slate-400';button.textContent='🖥️ 顯示';button.title='手機／平板／桌機顯示設定';button.addEventListener('click',openDisplayDialog);
  const permissions=Array.from(tabs.querySelectorAll('button')).find(el=>el.textContent?.includes('權限表'));permissions?permissions.insertAdjacentElement('beforebegin',button):tabs.appendChild(button);
}

function syncHomeDensityState() { document.documentElement.classList.toggle(ROOT_CLASS, Boolean(document.querySelector(HOME_GRID_SELECTOR))); }
installHomeDensityStyles();
const cached=readDisplayCache();applyDisplaySettings(cached?.settings||DEFAULT_DISPLAY_SETTINGS);void fetchDisplaySettings(false);syncHomeDensityState();
let resizeTimer=0;addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=window.setTimeout(()=>applyDisplaySettings(displaySettings),80);});addEventListener('orientationchange',()=>window.setTimeout(()=>applyDisplaySettings(displaySettings),120));
const observer=new MutationObserver(()=>{syncHomeDensityState();injectFontControl();injectAdminDisplayTab();});observer.observe(document.documentElement,{childList:true,subtree:true});
addEventListener('pageshow',()=>{syncHomeDensityState();injectFontControl();injectAdminDisplayTab();});
