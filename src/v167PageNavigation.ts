const STYLE_ID = 'echostars-v167-page-navigation';

function installStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    /* v169 keeps v167's real full-page audio editor, but home filters return to
       their direct toolbar behavior (dropdown/cycle) instead of opening full pages. */
    html.echostars-v167-audio-editor-page,
    html.echostars-v167-audio-editor-page body { min-height: 100%; }
    html.echostars-v167-audio-editor-page body { overflow-y: auto !important; }
    html.echostars-v167-audio-editor-page #root > .min-h-screen,
    html.echostars-v167-audio-editor-page #root > div { min-height: 0 !important; }
    html.echostars-v167-audio-editor-page #root main { display: none !important; }
    html.echostars-v167-audio-editor-page #root .upload-modal-overlay.upload-page { display: none !important; }
    html.echostars-v167-audio-editor-page .v161-track-editor-overlay[data-v167-page="audio-editor"] {
      position: static !important;
      inset: auto !important;
      z-index: auto !important;
      width: 100% !important;
      height: auto !important;
      min-height: calc(100dvh - 4rem) !important;
      margin: 0 auto !important;
      padding: 1rem !important;
      overflow: visible !important;
      background: transparent !important;
      pointer-events: auto !important;
    }
    html.echostars-v167-audio-editor-page .v161-track-editor-overlay[data-v167-page="audio-editor"] > .upload-modal-overlay {
      position: static !important;
      inset: auto !important;
      z-index: auto !important;
      display: block !important;
      width: 100% !important;
      height: auto !important;
      min-height: calc(100dvh - 6rem) !important;
      margin: 0 !important;
      padding: 0 !important;
      overflow: visible !important;
      background: transparent !important;
      backdrop-filter: none !important;
    }
    html.echostars-v167-audio-editor-page .v161-track-editor-overlay[data-v167-page="audio-editor"] > .upload-modal-overlay > div {
      width: 100% !important;
      max-width: 72rem !important;
      min-height: calc(100dvh - 6rem) !important;
      margin: 0 auto !important;
      border: 1px solid rgb(226 232 240);
      border-radius: 1rem;
      overflow: hidden;
      box-shadow: none !important;
    }
    .dark.echostars-v167-audio-editor-page .v161-track-editor-overlay[data-v167-page="audio-editor"] > .upload-modal-overlay > div {
      border-color: rgb(51 65 85);
    }
    @media (max-width: 639px) {
      html.echostars-v167-audio-editor-page .v161-track-editor-overlay[data-v167-page="audio-editor"] {
        min-height: calc(100dvh - 3.5rem) !important;
        padding: .55rem !important;
      }
      html.echostars-v167-audio-editor-page .v161-track-editor-overlay[data-v167-page="audio-editor"] > .upload-modal-overlay,
      html.echostars-v167-audio-editor-page .v161-track-editor-overlay[data-v167-page="audio-editor"] > .upload-modal-overlay > div {
        min-height: calc(100dvh - 4.6rem) !important;
      }
    }
  `;
  document.head.appendChild(style);
}

function syncAudioEditorPage() {
  const editor = document.querySelector<HTMLElement>('.v161-track-editor-overlay');
  const active = Boolean(editor);
  document.documentElement.classList.toggle('echostars-v167-audio-editor-page', active);
  if (editor) {
    editor.dataset.v167Page = 'audio-editor';
    editor.setAttribute('aria-label', '編輯音檔頁面');
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'auto' }));
  }
}

installStyles();
syncAudioEditorPage();

window.addEventListener('pageshow', syncAudioEditorPage);

const observer = new MutationObserver(syncAudioEditorPage);
observer.observe(document.body, { childList: true, subtree: true });
