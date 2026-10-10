const NOTE_ATTR = 'data-v171-release-note';

function buildReleaseNote() {
  const note = document.createElement('div');
  note.setAttribute(NOTE_ATTR, 'true');
  note.className = 'mx-3 mt-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-xs shadow-sm';
  note.innerHTML = `
    <div class="flex items-center gap-2 mb-1.5">
      <span aria-hidden="true">👑</span>
      <strong class="text-sm text-slate-900 dark:text-slate-100">v171 最新改版｜臺灣皇冠大使</strong>
    </div>
    <div class="space-y-1 text-slate-600 dark:text-slate-300 leading-relaxed">
      <p>新增漢堡選單「臺灣皇冠大使」，訪客與會員都可直接開啟。</p>
      <p>整合原 amway_crown 的 13 位皇冠大使成功故事、照片、語錄與官方連結。</p>
      <p>姓名不再手動輸入：登入會員自動使用會員姓名；未登入時自動使用目前訪客暱稱。</p>
      <p>皇冠頁主色與深／淺色模式會跟隨繁星回聲目前的視覺設定。</p>
    </div>`;
  return note;
}

function syncReleaseNote() {
  const title = Array.from(document.querySelectorAll('h3')).find(element =>
    element.textContent?.includes('版本改版歷程紀錄')
  );
  const modal = title?.closest('.app-modal-overlay > div');
  if (!modal || modal.querySelector(`[${NOTE_ATTR}]`)) return;
  const header = title?.closest('div[class*="bg-gradient-to-r"]');
  if (header?.parentElement === modal) header.insertAdjacentElement('afterend', buildReleaseNote());
}

function startReleaseNoteObserver() {
  syncReleaseNote();
  const observer = new MutationObserver(syncReleaseNote);
  observer.observe(document.body, { childList: true, subtree: true });
}

if (document.body) startReleaseNoteObserver();
else window.addEventListener('DOMContentLoaded', startReleaseNoteObserver, { once: true });
