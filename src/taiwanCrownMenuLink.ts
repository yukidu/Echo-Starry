import './taiwanCrownPage.css';

const CROWN_MENU_ATTR = 'data-taiwan-crown-menu';
const CROWN_PINNED_ATTR = 'data-taiwan-crown-pinned';
const CROWN_OVERLAY_ID = 'taiwan-crown-integrated-page';
const MENU_PANEL_SELECTOR = '.mobile-menu-panel[data-react-menu="true"]';
const TOP_TOOLBAR_SELECTOR = '[data-echostars-top-toolbar="true"]';
const USER_KEY = 'sq_current_user_v1';
const LEGACY_PROFILE_KEY = 'echostars_crown_profile_v1';
const FONT_ZOOM_KEY = 'echostars_user_font_zoom_v1';
const QUICK_ACTIONS_KEY = 'echostars_quick_header_actions_v2';
const CROWN_PIN_KEY_PREFIX = 'echostars_crown_pin_v172:';
const CROWN_EVENT = 'echostars:open-taiwan-crown';

type CrownMember = {
  id?: string;
  email?: string;
  name?: string;
  avatar?: string;
  motto?: string;
};

type DeviceKind = 'mobile' | 'tablet' | 'desktop';

type Ambassador = {
  id: string;
  name: string;
  quote: string;
  url: string;
};

const AMBASSADORS: Ambassador[] = [
  { id: '2', name: '陳婉芬 嵇龍生', quote: '成功不是你贏過多少人，而是你幫助過多少人。', url: 'https://www.amway.com.tw/wechat/aep/member/member2.html' },
  { id: '3', name: '傅後堅', quote: '每個人都應該給自己一個機會，一個可以改變一生的機會。', url: 'https://www.amway.com.tw/wechat/aep/member/member3.html' },
  { id: '9', name: '王儷凱', quote: '一個人的成就，絕不會超過他的夢想。', url: 'https://www.amway.com.tw/wechat/aep/member/member9.html' },
  { id: '7', name: '許旭昇 謝淑芬', quote: '誠信是我們事業的核心，也是給夥伴最好的承諾。', url: 'https://www.amway.com.tw/wechat/aep/member/member7.html' },
  { id: '1', name: '雷宇鳴', quote: '成功不是將來才有的，而是從決定去做的那一刻起，持續累積而成。', url: 'https://www.amway.com.tw/wechat/aep/member/member1.html' },
  { id: '5', name: '鍾易宏', quote: '堅持，是通往成功的唯一捷徑。', url: 'https://www.amway.com.tw/wechat/aep/member/member5.html' },
  { id: '4', name: '楊嘉譁 陳仕騏', quote: '追求卓越，成功自然就會跟隨你。', url: 'https://www.amway.com.tw/wechat/aep/member/member4.html' },
  { id: '6', name: '曾玉玲 呂森林', quote: '在安麗，我們不只看到事業，更看到生命的無限可能。', url: 'https://www.amway.com.tw/wechat/aep/member/member6.html' },
  { id: '8', name: '游麗珠 謝建宗', quote: '選擇大於努力，正確的選擇讓努力更有價值。', url: 'https://www.amway.com.tw/wechat/aep/member/member8.html' },
  { id: '10', name: '涂永松 黃玉燕', quote: '把簡單的事情重覆做，就是專家；把重覆的事情用心做，就是贏家。', url: 'https://www.amway.com.tw/wechat/aep/member/member10.html' },
  { id: '12', name: '楊貫一 鄭家華', quote: '知識可以改變命運，學習可以創造未來。', url: 'https://www.amway.com.tw/wechat/aep/member/member12.html' },
  { id: '11', name: '許明哲 張瓅文', quote: '勇於嘗試，是邁向非凡人生的第一步。', url: 'https://www.amway.com.tw/wechat/aep/member/member11.html' },
  { id: '13', name: '施素真', quote: '做自己生命中的貴人，活出最亮麗的人生。', url: 'https://www.amway.com.tw/wechat/aep/member/member13.html' }
];

const IMAGE_BASE = 'https://raw.githubusercontent.com/yukidu/amway_crown/main/img/';

// R2 objects use two-digit member IDs (01.jpg ... 13.jpg).
// Read through this site's Worker so the portraits work on mobile without
// depending on GitHub's image host or the retired workers.dev hostname.
function crownR2AvatarUrl(id: string) {
  return `/api/r2/file/${encodeURIComponent(`Success_Crown/${id.padStart(2, '0')}.jpg`)}`;
}

function parseStoredJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) as T : null;
  } catch {
    return null;
  }
}

function readCurrentMember(): CrownMember | null {
  const member = parseStoredJson<CrownMember>(USER_KEY);
  return member && (member.id || member.email) ? member : null;
}

function readLegacyMotto() {
  const legacy = parseStoredJson<{ motto?: unknown }>(LEGACY_PROFILE_KEY);
  return typeof legacy?.motto === 'string' ? legacy.motto.trim() : '';
}

function effectiveMotto(member: CrownMember | null) {
  if (!member) return '';
  return String(member.motto || '').trim() || readLegacyMotto();
}

function getDeviceKind(): DeviceKind {
  const ua = navigator.userAgent || '';
  const platform = navigator.platform || '';
  const shortSide = Math.min(window.screen?.width || window.innerWidth, window.screen?.height || window.innerHeight);
  const isIPad = /iPad/i.test(ua) || (platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroidTablet = /Android/i.test(ua) && !/Mobile/i.test(ua);
  const isTouchTablet = navigator.maxTouchPoints > 1 && shortSide >= 600 && !/iPhone|iPod|Mobile/i.test(ua);
  if (isIPad || isAndroidTablet || isTouchTablet) return 'tablet';
  if (/iPhone|iPod|Android.*Mobile|Mobi/i.test(ua) || shortSide < 600) return 'mobile';
  return 'desktop';
}

function quickLimit(device: DeviceKind) {
  if (device === 'mobile') return 3;
  if (device === 'tablet') return 5;
  return Number.MAX_SAFE_INTEGER;
}

function readExistingQuickCount(device: DeviceKind) {
  const stored = parseStoredJson<Record<DeviceKind, unknown>>(QUICK_ACTIONS_KEY);
  const list = Array.isArray(stored?.[device]) ? stored?.[device] as unknown[] : ['font', 'theme'];
  return new Set(list.map(value => String(value || '')).filter(Boolean)).size;
}

function crownPinStorageKey(member: CrownMember) {
  return `${CROWN_PIN_KEY_PREFIX}${String(member.id || member.email || 'member')}`;
}

function readCrownPin(member: CrownMember, device = getDeviceKind()) {
  const stored = parseStoredJson<Partial<Record<DeviceKind, boolean>>>(crownPinStorageKey(member));
  return Boolean(stored?.[device]);
}

function writeCrownPin(member: CrownMember, checked: boolean, device = getDeviceKind()) {
  const key = crownPinStorageKey(member);
  const stored = parseStoredJson<Partial<Record<DeviceKind, boolean>>>(key) || {};
  try {
    localStorage.setItem(key, JSON.stringify({ ...stored, [device]: checked }));
  } catch {}
}

function crownIcon(className = 'taiwan-crown-line-icon') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', className);
  const crown = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  crown.setAttribute('d', 'm2 5 3 11h14l3-11-6 6-4-7-4 7-6-6Z');
  const base = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  base.setAttribute('d', 'M5 20h14');
  svg.append(crown, base);
  return svg;
}

function checkIcon() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '3');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('class', 'w-3.5 h-3.5');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'm5 12 4 4L19 6');
  svg.append(path);
  return svg;
}

function closeReactMenu() {
  const menuButton = document.querySelector<HTMLButtonElement>('[data-main-menu="hamburger"][aria-expanded="true"]');
  if (menuButton) window.setTimeout(() => menuButton.click(), 0);
}

function currentFontZoom() {
  const value = Number(localStorage.getItem(FONT_ZOOM_KEY));
  return Number.isFinite(value) ? Math.min(1.4, Math.max(1, value)) : 1;
}

function syncCrownFontZoom() {
  const overlay = document.getElementById(CROWN_OVERLAY_ID);
  if (overlay) overlay.style.setProperty('--taiwan-crown-font-zoom', String(currentFontZoom()));
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 5) return '別熬夜太晚啊！你很重要～';
  if (hour < 11) return '早安 你今天營養早餐吃什麼？';
  if (hour < 14) return '午安 準備和哪位夥伴談OPP呢？';
  if (hour < 18) return '下午好 你最推薦R＆J哪款特調飲呢？';
  if (hour < 21) return '晚上好 正在前往教室或聚會的路上嗎？';
  return '夜深了 明天邀約幾場了呢？';
}

function appendAvatar(container: HTMLElement, source: string | undefined, fallbackText: string, fallbackSource?: string) {
  container.replaceChildren();
  const value = String(source || '').trim();
  if (value && /^(?:https?:|data:|blob:|\/)/i.test(value)) {
    const img = document.createElement('img');
    img.src = value;
    img.alt = fallbackText;
    img.loading = 'lazy';
    // Only show the surname after BOTH the first-party R2 photo and its
    // original GitHub backup fail. Keep the existing animated avatar ring.
    let triedFallback = false;
    img.addEventListener('error', () => {
      if (fallbackSource && !triedFallback) {
        triedFallback = true;
        img.src = fallbackSource;
        return;
      }
      container.replaceChildren();
      container.textContent = Array.from(fallbackText.trim())[0] || '★';
    });
    container.append(img);
    return;
  }
  container.textContent = value || Array.from(fallbackText.trim())[0] || '★';
}

function createStoryCard(person: Ambassador, index: number) {
  const link = document.createElement('a');
  link.className = 'taiwan-crown-card';
  link.href = person.url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.style.animationDelay = `${index * 45}ms`;
  link.setAttribute('aria-label', `開啟${person.name}皇冠大使成功故事`);

  const ring = document.createElement('div');
  ring.className = 'taiwan-crown-avatar-ring';
  const avatar = document.createElement('div');
  avatar.className = 'taiwan-crown-avatar';
  appendAvatar(avatar, crownR2AvatarUrl(person.id), person.name, `${IMAGE_BASE}${person.id}.jpg`);
  ring.append(avatar);

  const content = document.createElement('div');
  content.className = 'taiwan-crown-card-copy';
  const name = document.createElement('h2');
  name.className = 'taiwan-crown-card-name';
  name.textContent = person.name;
  const quote = document.createElement('p');
  quote.className = 'taiwan-crown-card-quote';
  quote.textContent = `“ ${person.quote}`;
  content.append(name, quote);

  const arrow = document.createElement('span');
  arrow.className = 'taiwan-crown-card-arrow';
  arrow.textContent = '›';
  arrow.setAttribute('aria-hidden', 'true');
  link.append(ring, content, arrow);
  return link;
}

function createMemberCard(member: CrownMember) {
  const card = document.createElement('button');
  card.type = 'button';
  card.className = 'taiwan-crown-card taiwan-crown-member-card';
  card.setAttribute('data-crown-member-card', 'true');
  card.setAttribute('aria-label', '編輯我的座右銘');
  card.title = '點一下可編輯座右銘';

  const ring = document.createElement('div');
  ring.className = 'taiwan-crown-avatar-ring';
  const avatar = document.createElement('div');
  avatar.className = 'taiwan-crown-avatar';
  appendAvatar(avatar, member.avatar, member.name || '會員');
  ring.append(avatar);

  const content = document.createElement('div');
  content.className = 'taiwan-crown-card-copy';
  const name = document.createElement('h2');
  name.className = 'taiwan-crown-card-name';
  name.textContent = member.name || '繁星夥伴';
  const quote = document.createElement('p');
  quote.className = 'taiwan-crown-card-quote';
  quote.textContent = effectiveMotto(member) || '點一下這張卡片，寫下您的座右銘。';
  content.append(name, quote);

  const mark = document.createElement('span');
  mark.className = 'taiwan-crown-card-arrow';
  mark.textContent = '›';
  mark.setAttribute('aria-hidden', 'true');
  card.append(ring, content, mark);
  card.addEventListener('click', () => openMottoEditor(false));
  return card;
}

async function saveMemberMotto(rawMotto: string) {
  const member = readCurrentMember();
  if (!member?.id) throw new Error('請先登入會員再儲存座右銘。');
  const motto = rawMotto.trim().slice(0, 180);
  const response = await fetch(`/api/users/${encodeURIComponent(member.id)}`, {
    method: 'PUT',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ motto, email: member.email || '' })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || '座右銘儲存失敗，請稍後再試。');
  const serverUser = data?.user && typeof data.user === 'object' ? data.user as CrownMember : {};
  const next = { ...member, ...serverUser, motto };
  try { localStorage.setItem(USER_KEY, JSON.stringify(next)); } catch {}
  window.dispatchEvent(new CustomEvent('echostars:user-profile-updated', { detail: next }));
  return next;
}

function buildMottoModal() {
  const modal = document.createElement('div');
  modal.className = 'taiwan-crown-motto-backdrop';
  modal.hidden = true;
  modal.setAttribute('data-crown-motto-modal', 'true');
  modal.innerHTML = `
    <div class="taiwan-crown-motto-dialog" role="dialog" aria-modal="true" aria-labelledby="taiwan-crown-motto-title">
      <h2 id="taiwan-crown-motto-title">座右銘</h2>
      <p>這段文字會同步儲存在「個人基本資料」裡。</p>
      <textarea maxlength="180" rows="4" aria-label="座右銘" placeholder="留下一句激勵自己與夥伴的話…"></textarea>
      <div class="taiwan-crown-motto-status" aria-live="polite"></div>
      <div class="taiwan-crown-motto-actions">
        <button type="button" data-crown-motto-close>稍後再說</button>
        <button type="button" data-crown-motto-save>儲存座右銘</button>
      </div>
    </div>`;

  modal.addEventListener('click', event => {
    const target = event.target as Element | null;
    if (target === modal || target?.closest('[data-crown-motto-close]')) modal.hidden = true;
  });
  modal.querySelector<HTMLButtonElement>('[data-crown-motto-save]')?.addEventListener('click', async () => {
    const textarea = modal.querySelector<HTMLTextAreaElement>('textarea');
    const status = modal.querySelector<HTMLElement>('.taiwan-crown-motto-status');
    const save = modal.querySelector<HTMLButtonElement>('[data-crown-motto-save]');
    if (!textarea || !save) return;
    save.disabled = true;
    if (status) status.textContent = '儲存中…';
    try {
      await saveMemberMotto(textarea.value);
      if (status) status.textContent = '已同步到個人基本資料';
      window.setTimeout(() => {
        modal.hidden = true;
        renderCrownPage();
        syncProfileMottoFields();
      }, 350);
    } catch (error) {
      if (status) status.textContent = error instanceof Error ? error.message : '儲存失敗';
    } finally {
      save.disabled = false;
    }
  });
  return modal;
}

function ensureOverlay() {
  let overlay = document.getElementById(CROWN_OVERLAY_ID);
  if (overlay) return overlay;
  overlay = document.createElement('section');
  overlay.id = CROWN_OVERLAY_ID;
  overlay.className = 'taiwan-crown-overlay';
  overlay.hidden = true;
  overlay.setAttribute('aria-label', '臺灣皇冠大使');
  document.body.append(overlay);
  return overlay;
}

function openMottoEditor(autoPrompt: boolean) {
  const member = readCurrentMember();
  if (!member) return;
  const overlay = ensureOverlay();
  const modal = overlay.querySelector<HTMLElement>('[data-crown-motto-modal]');
  const textarea = modal?.querySelector<HTMLTextAreaElement>('textarea');
  const status = modal?.querySelector<HTMLElement>('.taiwan-crown-motto-status');
  if (!modal || !textarea) return;
  if (autoPrompt && effectiveMotto(member)) return;
  textarea.value = effectiveMotto(member);
  if (status) status.textContent = '';
  modal.hidden = false;
  window.setTimeout(() => textarea.focus(), 40);
}

function renderCrownPage() {
  const overlay = ensureOverlay();
  const member = readCurrentMember();
  const shell = document.createElement('div');
  shell.className = 'taiwan-crown-page-shell';

  const top = document.createElement('div');
  top.className = 'taiwan-crown-page-top';
  const back = document.createElement('button');
  back.type = 'button';
  back.className = 'taiwan-crown-back';
  back.textContent = '← 返回播放清單';
  back.addEventListener('click', closeCrownPage);
  top.append(back);

  const hero = document.createElement('header');
  hero.className = 'taiwan-crown-hero';
  const emblem = document.createElement('div');
  emblem.className = 'taiwan-crown-emblem';
  emblem.append(crownIcon('taiwan-crown-hero-icon'));
  const title = document.createElement('h1');
  title.textContent = member?.name ? `${member.name} 皇冠大使您好` : '臺灣皇冠大使';
  const greeting = document.createElement('p');
  greeting.textContent = getGreeting();
  hero.append(emblem, title, greeting);

  const cards = document.createElement('main');
  cards.className = 'taiwan-crown-cards';
  if (member) cards.append(createMemberCard(member));
  AMBASSADORS.forEach((person, index) => cards.append(createStoryCard(person, index)));

  const footer = document.createElement('footer');
  footer.className = 'taiwan-crown-footer';
  footer.textContent = 'APP設計：杜杜龍 2026/5/12';

  shell.append(top, hero, cards, footer);
  overlay.replaceChildren(shell, buildMottoModal());
  syncCrownFontZoom();

  if (member && !String(member.motto || '').trim()) {
    const legacyMotto = readLegacyMotto();
    if (legacyMotto) {
      void saveMemberMotto(legacyMotto).then(() => {
        try { localStorage.removeItem(LEGACY_PROFILE_KEY); } catch {}
        renderCrownPage();
        syncProfileMottoFields();
      }).catch(() => {});
    } else if (!overlay.hidden) {
      window.setTimeout(() => openMottoEditor(true), 80);
    }
  }
}

function openCrownPage() {
  const overlay = ensureOverlay();
  overlay.hidden = false;
  renderCrownPage();
  overlay.scrollTop = 0;
  document.body.dataset.taiwanCrownOpen = 'true';
  closeReactMenu();
  window.dispatchEvent(new Event('resize'));
}

function closeCrownPage() {
  const overlay = document.getElementById(CROWN_OVERLAY_ID);
  if (overlay) overlay.hidden = true;
  delete document.body.dataset.taiwanCrownOpen;
}

function buildPinControl(member: CrownMember) {
  const device = getDeviceKind();
  const checked = readCrownPin(member, device);
  const canOffer = checked || readExistingQuickCount(device) < quickLimit(device);
  if (!canOffer) {
    const placeholder = document.createElement('span');
    placeholder.className = 'navbar-pin-placeholder';
    placeholder.setAttribute('aria-hidden', 'true');
    return placeholder;
  }
  const pin = document.createElement('button');
  pin.type = 'button';
  pin.className = `navbar-inline-pin${checked ? ' is-selected' : ''}`;
  pin.setAttribute('aria-label', `${checked ? '取消置頂' : '置頂'}：臺灣皇冠大使`);
  pin.setAttribute('aria-pressed', String(checked));
  pin.title = checked ? '取消顯示在置頂主選單' : '顯示在置頂主選單';
  if (checked) pin.append(checkIcon());
  else {
    const dot = document.createElement('span');
    dot.className = 'navbar-inline-pin-empty';
    pin.append(dot);
  }
  pin.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    writeCrownPin(member, !checked, device);
    refreshCrownChrome();
  });
  return pin;
}

function buildCrownMenuRow() {
  const row = document.createElement('div');
  row.setAttribute(CROWN_MENU_ATTR, 'true');
  row.className = 'mobile-menu-row taiwan-crown-menu-row flex items-center gap-2 px-2.5 py-2 rounded-xl text-sm font-semibold transition-colors whitespace-nowrap hover:bg-slate-100 dark:hover:bg-slate-800';

  const member = readCurrentMember();
  if (member) row.append(buildPinControl(member));

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'flex min-w-0 flex-1 items-center gap-3 text-left py-0.5';
  button.setAttribute('aria-label', '臺灣皇冠大使');
  button.title = '臺灣皇冠大使';
  button.append(crownIcon());
  const label = document.createElement('span');
  label.textContent = '臺灣皇冠大使';
  button.append(label);
  button.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    openCrownPage();
  });
  row.append(button);
  return row;
}

function ensureCrownMenuRow(panel: Element) {
  if (panel.querySelector(`[${CROWN_MENU_ATTR}]`)) return;
  const footerActions = panel.querySelector('.navbar-menu-footer-actions');
  const footerDivider = footerActions?.previousElementSibling;
  panel.insertBefore(buildCrownMenuRow(), footerDivider || footerActions || null);
}

function ensurePinnedCrownAction() {
  const toolbar = document.querySelector<HTMLElement>(TOP_TOOLBAR_SELECTOR);
  if (!toolbar) return;
  const member = readCurrentMember();
  const shouldShow = Boolean(member && readCrownPin(member));
  const existing = toolbar.querySelector<HTMLElement>(`[${CROWN_PINNED_ATTR}]`);
  if (!shouldShow) {
    existing?.remove();
    return;
  }
  if (existing) return;

  const slot = document.createElement('div');
  slot.className = 'navbar-top-action-slot taiwan-crown-top-slot';
  slot.setAttribute(CROWN_PINNED_ATTR, 'true');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'navbar-top-action taiwan-crown-top-action';
  button.title = '臺灣皇冠大使';
  button.setAttribute('aria-label', '臺灣皇冠大使');
  button.append(crownIcon('taiwan-crown-line-icon'));
  button.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    openCrownPage();
  });
  slot.append(button);
  toolbar.append(slot);
}

function refreshCrownChrome() {
  document.querySelectorAll(`[${CROWN_MENU_ATTR}]`).forEach(element => element.remove());
  document.querySelectorAll(MENU_PANEL_SELECTOR).forEach(ensureCrownMenuRow);
  document.querySelectorAll(`[${CROWN_PINNED_ATTR}]`).forEach(element => element.remove());
  ensurePinnedCrownAction();
}

function createProfileMottoView(member: CrownMember) {
  const card = document.createElement('div');
  card.setAttribute('data-profile-motto-view', 'true');
  card.className = 'bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-100 dark:border-slate-700';
  const label = document.createElement('span');
  label.className = 'text-[10px] text-slate-500 dark:text-slate-400 block font-semibold';
  label.textContent = '座右銘';
  const value = document.createElement('span');
  value.className = 'font-semibold text-slate-800 dark:text-slate-200';
  value.setAttribute('data-profile-motto-value', 'true');
  value.textContent = effectiveMotto(member) || '未填寫';
  card.append(label, value);
  return card;
}

function createProfileMottoEditor(member: CrownMember) {
  const field = document.createElement('div');
  field.setAttribute('data-profile-motto-edit', 'true');
  const label = document.createElement('label');
  label.className = 'block font-bold text-slate-700 dark:text-slate-300 mb-0.5';
  label.textContent = '座右銘';
  const note = document.createElement('span');
  note.className = 'text-[10px] text-slate-500 dark:text-slate-400 font-normal ml-1';
  note.textContent = '（與臺灣皇冠大使同步）';
  label.append(note);
  const textarea = document.createElement('textarea');
  textarea.maxLength = 180;
  textarea.rows = 3;
  textarea.value = effectiveMotto(member);
  textarea.placeholder = '留下一句激勵自己與夥伴的話…';
  textarea.className = 'w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-hidden';
  const status = document.createElement('div');
  status.className = 'mt-1 text-[10px] text-slate-400';
  status.setAttribute('aria-live', 'polite');
  textarea.addEventListener('change', async () => {
    status.textContent = '儲存中…';
    textarea.disabled = true;
    try {
      await saveMemberMotto(textarea.value);
      status.textContent = '已同步到臺灣皇冠大使';
      renderCrownPageIfOpen();
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : '儲存失敗';
    } finally {
      textarea.disabled = false;
    }
  });
  field.append(label, textarea, status);
  return field;
}

function syncProfileMottoFields() {
  const member = readCurrentMember();
  if (!member) return;

  const labels = Array.from(document.querySelectorAll<HTMLElement>('span, label')).filter(element =>
    element.textContent?.trim() === '什麼原因留在安麗？'
  );
  for (const label of labels) {
    const host = label.parentElement;
    const parent = host?.parentElement;
    if (!host || !parent) continue;
    if (label.tagName === 'SPAN') {
      const existing = parent.querySelector<HTMLElement>('[data-profile-motto-view]');
      if (!existing) host.insertAdjacentElement('afterend', createProfileMottoView(member));
      else {
        const value = existing.querySelector<HTMLElement>('[data-profile-motto-value]');
        const nextText = effectiveMotto(member) || '未填寫';
        if (value && value.textContent !== nextText) value.textContent = nextText;
      }
    } else if (label.tagName === 'LABEL' && !parent.querySelector('[data-profile-motto-edit]')) {
      host.insertAdjacentElement('afterend', createProfileMottoEditor(member));
    }
  }
}

function renderCrownPageIfOpen() {
  const overlay = document.getElementById(CROWN_OVERLAY_ID);
  if (overlay && !overlay.hidden) renderCrownPage();
}

function syncCrownUi() {
  document.querySelectorAll(MENU_PANEL_SELECTOR).forEach(ensureCrownMenuRow);
  ensurePinnedCrownAction();
  syncProfileMottoFields();
}

function shouldKeepCrownOpenForHeaderAction(target: Element) {
  if (target.closest(`[${CROWN_MENU_ATTR}], [${CROWN_PINNED_ATTR}]`)) return true;
  if (target.closest('[data-main-menu="hamburger"]')) return true;
  if (target.closest('.navbar-top-font-group, .navbar-menu-font-row, .navbar-menu-palette-shortcut')) return true;
  const button = target.closest('button');
  const text = button?.textContent?.trim() || '';
  const aria = button?.getAttribute('aria-label') || '';
  return /^(?:關燈|開燈|好心情)$/.test(text) || /(?:縮小字體|放大字體|切換深色模式|切換淺色模式)/.test(aria);
}

function startCrownIntegration() {
  syncCrownUi();
  let observer: MutationObserver;
  observer = new MutationObserver(() => {
    observer.disconnect();
    try { syncCrownUi(); }
    finally { observer.observe(document.body, { childList: true, subtree: true }); }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  window.addEventListener('resize', syncCrownFontZoom);
  window.addEventListener('orientationchange', () => window.setTimeout(refreshCrownChrome, 50));
  window.addEventListener(CROWN_EVENT, openCrownPage as EventListener);
  window.addEventListener('echostars:user-profile-updated', () => {
    refreshCrownChrome();
    syncProfileMottoFields();
    renderCrownPageIfOpen();
  });

  document.addEventListener('click', event => {
    const overlay = document.getElementById(CROWN_OVERLAY_ID);
    if (!overlay || overlay.hidden) return;
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    if (target.closest(`#${CROWN_OVERLAY_ID}`)) return;
    const header = target.closest('header');
    if (header && !shouldKeepCrownOpenForHeaderAction(target)) closeCrownPage();
  }, true);
}

if (document.body) startCrownIntegration();
else window.addEventListener('DOMContentLoaded', startCrownIntegration, { once: true });
