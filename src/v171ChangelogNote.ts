const NOTE_ATTR = 'data-v172-release-note';

function buildReleaseNote() {
  const note = document.createElement('div');
  note.setAttribute(NOTE_ATTR, 'true');
  note.className = 'mx-3 mt-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-xs shadow-sm';
  note.innerHTML = `
    <div class="flex items-center gap-2 mb-1.5">
      <span aria-hidden="true">♕</span>
      <strong class="text-sm text-slate-900 dark:text-slate-100">v172 最新改版｜臺灣皇冠大使整合</strong>
    </div>
    <div class="space-y-1 text-slate-600 dark:text-slate-300 leading-relaxed">
      <p>臺灣皇冠大使改為繁星回聲站內頁，保留置頂導覽、漢堡選單與浮動播放器，切換頁面不會中斷播放。</p>
      <p>漢堡選單改用與其他功能一致的單色線條皇冠圖示；會員可勾選是否顯示在置頂主選單。</p>
      <p>訪客只顯示 13 位皇冠大使故事；會員自己的照片直接同步個人基本資料，不再於皇冠頁修改。</p>
      <p>新增會員基本資料「座右銘」欄位，與皇冠大使本人資訊卡雙向共用同一份資料。</p>
      <p>皇冠頁同步支援繁星回聲字體放大縮小與目前主題配色，並移除登入身分提示、個人化設定與重設功能。</p>
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
