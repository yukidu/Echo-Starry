const V139_STYLE_ID = 'echostars-v139-home-upload-polish';
let selectedCategoryLabel = '全部';
let syncQueued = false;

function isGuestMode() {
  try { return !localStorage.getItem('sq_current_user_v1'); }
  catch { return true; }
}

function installV139Styles() {
  if (document.getElementById(V139_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = V139_STYLE_ID;
  style.textContent = `
    html.echostars-v139-guest .lucky-answer-notice { display: none !important; }

    button[data-v139-category-active="1"] {
      background: #f59e0b !important;
      color: #1f2937 !important;
      box-shadow: 0 0 0 2px rgba(245,158,11,.28), 0 4px 12px rgba(120,53,15,.18) !important;
    }
    button[data-v139-category-active="1"] svg { color: #1f2937 !important; }

  `;
  document.head.appendChild(style);
}

function syncGuestMode() {
  const guest = isGuestMode();
  document.documentElement.classList.toggle('echostars-v139-guest', guest);

  document.querySelectorAll<HTMLElement>('[data-v139-hidden-zero-progress="1"]').forEach(badge => {
    if (!guest) {
      badge.style.removeProperty('display');
      delete badge.dataset.v139HiddenZeroProgress;
    }
  });
  if (!guest) return;

  document.querySelectorAll<HTMLElement>('.audio-card span').forEach(span => {
    if ((span.textContent || '').replace(/\s+/g, '') !== '[已聽0%]') return;
    const badge = span.parentElement;
    if (!badge || badge.dataset.v139HiddenZeroProgress === '1') return;
    badge.dataset.v139HiddenZeroProgress = '1';
    badge.style.setProperty('display', 'none', 'important');
  });
}

function findLuckyButton() {
  return Array.from(document.querySelectorAll<HTMLButtonElement>('button')).find(button => {
    const text = (button.textContent || '').replace(/\s+/g, '');
    return text.includes('召喚繁星解答') || text.includes('招喚繁星解答') || text === '招喚繁星';
  }) || null;
}

function syncLuckyButton() {
  const button = findLuckyButton();
  if (!button) return;
  const label = button.querySelector<HTMLElement>('span');
  if (label && label.textContent !== '招喚繁星') label.textContent = '招喚繁星';
  if (button.title !== '從目前條件下可播放的音檔中招喚繁星') {
    button.title = '從目前條件下可播放的音檔中招喚繁星';
  }
}

function findCategoryTrigger() {
  return document.querySelector<HTMLButtonElement>('button[title="點擊展開分類選單"]');
}

function applyCategoryLabel() {
  const trigger = findCategoryTrigger();
  if (!trigger) return;
  const label = trigger.querySelector<HTMLElement>('span');
  const active = selectedCategoryLabel !== '全部';
  const desiredText = active ? selectedCategoryLabel : '分類';
  if (label && label.textContent !== desiredText) label.textContent = desiredText;
  if (active && trigger.dataset.v139CategoryActive !== '1') trigger.dataset.v139CategoryActive = '1';
  if (!active && trigger.dataset.v139CategoryActive) delete trigger.dataset.v139CategoryActive;
}

function cleanOptionLabel(value: string) {
  return value.replace(/[✓✔☑🤖]/g, '').replace(/\s+/g, ' ').trim().replace(/^Ai\s*/, '');
}

function syncAll() {
  installV139Styles();
  syncGuestMode();
  syncLuckyButton();
  applyCategoryLabel();
}

function queueSync() {
  if (syncQueued) return;
  syncQueued = true;
  // Never synchronously schedule another microtask from the MutationObserver.
  // One pass per animation frame avoids starving touch/click handling on Android.
  requestAnimationFrame(() => {
    syncQueued = false;
    syncAll();
  });
}

document.addEventListener('click', event => {
  const target = event.target instanceof Element ? event.target : null;
  if (!target) return;

  if (target.closest('.brand-logo-glow')) {
    selectedCategoryLabel = '全部';
    queueSync();
    return;
  }

  const clickedButton = target.closest<HTMLButtonElement>('button');
  const trigger = findCategoryTrigger();
  if (!clickedButton || !trigger || clickedButton === trigger) return;
  const container = trigger.parentElement;
  if (!container?.contains(clickedButton)) return;

  const option = cleanOptionLabel(clickedButton.textContent || '');
  if (!option || option.length > 24) return;
  selectedCategoryLabel = option;
  queueSync();
}, true);

installV139Styles();
syncAll();

const observer = new MutationObserver(records => {
  // Notifications, chat comments and profile data do not require upload-tab
  // synchronization. Ignore their DOM mutations instead of rescanning the
  // complete document and creating a feedback loop.
  if (document.body.dataset.mainTab === 'notifications') return;
  const relevant = records.some(record => {
    const target = record.target instanceof Element ? record.target : record.target.parentElement;
    if (target?.closest('.audio-card,.brand-logo-glow,.navbar-menu-panel,[title="點擊展開分類選單"]')) return true;
    if (record.type === 'characterData') return false;
    return Array.from(record.addedNodes).some(node =>
      node instanceof Element && (
        node.matches('.audio-card,.brand-logo-glow,.navbar-menu-panel,[title="點擊展開分類選單"]') ||
        !!node.querySelector('.audio-card,.brand-logo-glow,[title="點擊展開分類選單"]')
      )
    );
  });
  if(relevant)queueSync();
});
observer.observe(document.body, {childList:true,subtree:true,characterData:true});
window.addEventListener('pageshow', syncAll);
window.addEventListener('storage', event => {
  if (event.key === 'sq_current_user_v1') syncAll();
});
