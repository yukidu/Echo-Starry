const VISITOR_KEY = 'sq_visitor_identity_v1';
const USER_KEY = 'sq_current_user_v1';
const STYLE_ID = 'echostars-v127-menu-identity-palette';
const TEXT_COLUMN_WIDTH = 48;
const ICON_SIZE = 36;

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    .navbar-menu-profile-head > .v127-identity-info {
      position: relative;
      box-sizing: border-box;
      width: ${ICON_SIZE + 9 + TEXT_COLUMN_WIDTH}px;
      min-width: ${ICON_SIZE + 9 + TEXT_COLUMN_WIDTH}px;
      max-width: ${ICON_SIZE + 9 + TEXT_COLUMN_WIDTH}px;
      min-height: ${ICON_SIZE}px;
      flex: 0 0 ${ICON_SIZE + 9 + TEXT_COLUMN_WIDTH}px;
      padding-left: ${ICON_SIZE + 9}px;
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: flex-start;
      text-align: left;
    }
    .v127-identity-name,
    .v127-identity-role {
      display: block;
      box-sizing: border-box;
      width: ${TEXT_COLUMN_WIDTH}px !important;
      min-width: ${TEXT_COLUMN_WIDTH}px !important;
      max-width: ${TEXT_COLUMN_WIDTH}px !important;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: clip;
      text-align: left !important;
      transform-origin: left center;
    }
    .v127-identity-icon,
    .v126-visitor-animal.v127-identity-icon {
      position: absolute !important;
      left: 0;
      top: 50%;
      width: ${ICON_SIZE}px;
      height: ${ICON_SIZE}px;
      margin: 0 !important;
      transform: translateY(-50%);
      display: inline-flex !important;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      border-radius: 50%;
      background: color-mix(in srgb, var(--color-light-pill,#fae8ed) 76%, white);
      box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--color-primary,#c06c84) 18%, transparent);
      font-size: 28px !important;
      line-height: 1 !important;
      vertical-align: 0 !important;
    }
    .dark .v127-identity-icon,
    .dark .v126-visitor-animal.v127-identity-icon {
      background: rgb(51 65 85);
    }
    .v127-identity-icon img {
      display: block;
      width: 100%;
      height: 100%;
      border-radius: inherit;
      object-fit: cover;
    }
  `;
  document.head.appendChild(style);
}

function readJson(key: string) {
  try {
    return JSON.parse(localStorage.getItem(key) || 'null');
  } catch {
    return null;
  }
}

function readVisitorEmoji() {
  const visitor = readJson(VISITOR_KEY);
  return typeof visitor?.emoji === 'string' && visitor.emoji.trim() ? visitor.emoji.trim() : '🦁';
}

function readMemberAvatar() {
  const user = readJson(USER_KEY);
  return typeof user?.avatar === 'string' ? user.avatar.trim() : '';
}

function visibleText(element: HTMLElement) {
  return Array.from(element.childNodes)
    .filter(node => node.nodeType === Node.TEXT_NODE)
    .map(node => node.textContent || '')
    .join('')
    .trim();
}

function fitThreeCharacterWidth(element: HTMLElement, text: string, basePx: number, minPx: number) {
  const length = Math.max(1, Array.from(text).length);
  const size = length <= 3 ? basePx : Math.max(minPx, Math.floor(basePx * 3 / length * 10) / 10);
  element.style.fontSize = `${size}px`;
  element.style.width = `${TEXT_COLUMN_WIDTH}px`;
  element.style.maxWidth = `${TEXT_COLUMN_WIDTH}px`;
}

function ensureIdentityIcon(info: HTMLElement, name: HTMLElement, isVisitor: boolean) {
  let icon = name.querySelector<HTMLElement>('.v127-identity-icon, .v126-visitor-animal');
  if (!icon) {
    icon = document.createElement('span');
    icon.className = 'v127-identity-icon';
    icon.setAttribute('aria-hidden', 'true');
    name.prepend(icon);
  }
  icon.classList.add('v127-identity-icon');

  const avatar = isVisitor ? readVisitorEmoji() : readMemberAvatar();
  const identityKey = `${isVisitor ? 'visitor' : 'member'}:${avatar || 'default'}`;
  if (icon.dataset.v127IdentityKey === identityKey) return;
  icon.dataset.v127IdentityKey = identityKey;
  icon.replaceChildren();

  if (!isVisitor && /^(?:https?:|data:|blob:|\/)/i.test(avatar)) {
    const image = document.createElement('img');
    image.src = avatar;
    image.alt = '';
    icon.appendChild(image);
  } else {
    icon.textContent = avatar || (isVisitor ? '🦁' : '👤');
  }

  // Keep the absolute icon anchored to the whole two-line identity block.
  if (getComputedStyle(info).position === 'static') info.style.position = 'relative';
}

function syncIdentityHeader() {
  const panel = document.querySelector<HTMLElement>('.mobile-menu-panel');
  const head = panel?.querySelector<HTMLElement>('.navbar-menu-profile-head');
  const info = head?.firstElementChild as HTMLElement | null;
  if (!panel || !head || !info || info.classList.contains('navbar-menu-header-actions')) return;

  const name = info.firstElementChild as HTMLElement | null;
  const role = info.children.item(1) as HTMLElement | null;
  if (!name || !role) return;

  const isVisitor = role.textContent?.trim() === '訪客';
  info.classList.add('v127-identity-info');
  name.classList.add('v127-identity-name');
  role.classList.add('v127-identity-role');
  ensureIdentityIcon(info, name, isVisitor);

  fitThreeCharacterWidth(name, visibleText(name), 15, 9);
  fitThreeCharacterWidth(role, visibleText(role), 12, 8.5);
}

function scheduleIdentitySync() {
  window.setTimeout(syncIdentityHeader, 0);
  window.requestAnimationFrame(() => {
    syncIdentityHeader();
    window.requestAnimationFrame(syncIdentityHeader);
  });
}

function isPaletteClickInsideMenu(target: Element) {
  const panel = target.closest('.mobile-menu-panel');
  if (!panel) return false;
  if (target.closest('.navbar-menu-palette-shortcut')) return true;
  const button = target.closest<HTMLButtonElement>('.mobile-menu-row > button');
  return Boolean(button && (button.textContent || '').includes('切換配色'));
}

let paletteReopenScheduled = false;
function keepMenuOpenAfterPalette() {
  if (paletteReopenScheduled) return;
  paletteReopenScheduled = true;

  const ensureOpen = () => {
    if (!document.querySelector('.mobile-menu-panel')) {
      document.querySelector<HTMLButtonElement>('button[data-main-menu="hamburger"]')?.click();
    }
    scheduleIdentitySync();
  };

  window.setTimeout(ensureOpen, 0);
  window.requestAnimationFrame(() => {
    ensureOpen();
    paletteReopenScheduled = false;
  });
}

installStyles();

document.addEventListener('click', event => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;

  if (isPaletteClickInsideMenu(target)) {
    keepMenuOpenAfterPalette();
    return;
  }

  if (target.closest('button[data-main-menu="hamburger"]')) scheduleIdentitySync();
}, true);

window.addEventListener('pageshow', scheduleIdentitySync);
window.addEventListener('storage', event => {
  if (event.key === USER_KEY || event.key === VISITOR_KEY) scheduleIdentitySync();
});
