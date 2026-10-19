const UPLOAD_PRESENTATION_STYLE_ID = 'echostars-upload-presentation-v52';

const normalizeText = (value: string | null | undefined) => (value || '').replace(/\s+/g, ' ').trim();

function installUploadPresentationStyle() {
  if (document.getElementById(UPLOAD_PRESENTATION_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = UPLOAD_PRESENTATION_STYLE_ID;
  style.textContent = `
    @media (min-width: 768px) {
      .upload-modal-overlay > div {
        max-width: 72rem !important;
      }
    }

    #track-upload-form[data-upload-presentation="1"] {
      display: grid !important;
      grid-template-columns: repeat(8, minmax(0, 1fr));
      gap: 1rem !important;
    }

    #track-upload-form[data-upload-presentation="1"]::before {
      content: '';
      grid-column: 1 / -1;
      grid-row: 1;
      height: 0;
    }

    #track-upload-form[data-upload-presentation="1"] > * {
      margin-top: 0 !important;
    }

    #track-upload-form[data-upload-presentation="1"] [data-upload-error="1"] {
      grid-column: 1 / -1;
      grid-row: 1;
      z-index: 1;
    }

    #track-upload-form[data-upload-presentation="1"] [data-upload-cover-section="1"],
    #track-upload-form[data-upload-presentation="1"] [data-upload-fields-grid="1"] {
      display: contents !important;
    }

    #track-upload-form[data-upload-presentation="1"] [data-upload-cover-label="1"] {
      grid-column: 1 / 3;
      grid-row: 2;
      align-self: end;
      margin: 0 !important;
      padding: .75rem .75rem .25rem;
      border: 1px solid rgb(226 232 240);
      border-bottom: 0;
      border-radius: 1rem 1rem 0 0;
      background: rgb(248 250 252 / .82);
    }

    #track-upload-form[data-upload-presentation="1"] [data-upload-cover-selected="1"] {
      grid-column: 1 / 3;
      grid-row: 3;
      align-self: stretch;
      margin: 0 !important;
      padding: .25rem .75rem .75rem;
      border: 1px solid rgb(226 232 240);
      border-top: 0;
      border-radius: 0 0 1rem 1rem;
      background: rgb(248 250 252 / .82);
    }

    #track-upload-form[data-upload-presentation="1"] [data-upload-audio="1"] {
      grid-column: 3 / 5;
      grid-row: 2 / span 2;
      align-self: stretch;
      padding: .75rem;
      border: 1px solid rgb(226 232 240);
      border-radius: 1rem;
      background: rgb(248 250 252 / .82);
    }

    #track-upload-form[data-upload-presentation="1"] [data-upload-permission="1"] {
      grid-column: 5 / 7 !important;
      grid-row: 2 / span 2;
      align-self: stretch;
      margin: 0 !important;
      padding: .75rem;
      border: 1px solid rgb(226 232 240);
      border-radius: 1rem;
      background: rgb(248 250 252 / .82);
    }

    #track-upload-form[data-upload-presentation="1"] [data-upload-vip="1"] {
      grid-column: 7 / 9 !important;
      grid-row: 2 / span 2;
      align-self: stretch;
      margin: 0 !important;
    }

    #track-upload-form[data-upload-presentation="1"] [data-upload-cover-library="1"] {
      grid-column: 1 / -1;
      grid-row: 4;
      margin: 0 !important;
    }

    #track-upload-form[data-upload-presentation="1"] [data-upload-standard="1"],
    #track-upload-form[data-upload-presentation="1"] [data-upload-categories="1"],
    #track-upload-form[data-upload-presentation="1"] [data-upload-keywords="1"] {
      grid-column: 1 / -1;
    }

    #track-upload-form[data-upload-presentation="1"] [data-upload-fields-grid="1"] > :not([data-upload-vip="1"]):not([data-upload-permission="1"]) {
      grid-column: span 4;
    }

    #track-upload-form[data-upload-presentation="1"] [data-upload-keyword-add="1"] {
      white-space: nowrap !important;
      flex: 0 0 auto !important;
      min-width: 3.25rem;
    }

    #track-upload-form[data-upload-presentation="1"] [data-upload-keyword-candidates="1"] {
      padding-top: .5rem !important;
    }

    #track-upload-form[data-upload-presentation="1"] [data-upload-keyword-candidates="1"] > span:first-child {
      display: none !important;
    }

    #track-upload-form[data-upload-presentation="1"] [data-upload-cover-library="1"] button[title^="使用 "] span:last-child {
      display: block !important;
      width: 100% !important;
      max-width: 100% !important;
      overflow: visible !important;
      text-overflow: clip !important;
      text-align: center;
      line-height: 1.05;
    }

    [data-upload-note-hidden="1"] {
      display: none !important;
    }

    .dark #track-upload-form[data-upload-presentation="1"] [data-upload-cover-label="1"],
    .dark #track-upload-form[data-upload-presentation="1"] [data-upload-cover-selected="1"],
    .dark #track-upload-form[data-upload-presentation="1"] [data-upload-audio="1"],
    .dark #track-upload-form[data-upload-presentation="1"] [data-upload-permission="1"] {
      border-color: rgb(51 65 85);
      background: rgb(15 23 42 / .55);
    }

    @media (max-width: 767px) {
      #track-upload-form[data-upload-presentation="1"] {
        grid-template-columns: minmax(0, 1fr);
      }

      #track-upload-form[data-upload-presentation="1"] [data-upload-cover-label="1"] {
        grid-column: 1;
        grid-row: 2;
      }

      #track-upload-form[data-upload-presentation="1"] [data-upload-cover-selected="1"] {
        grid-column: 1;
        grid-row: 3;
      }

      #track-upload-form[data-upload-presentation="1"] [data-upload-audio="1"] {
        grid-column: 1;
        grid-row: 4;
      }

      #track-upload-form[data-upload-presentation="1"] [data-upload-permission="1"] {
        grid-column: 1 !important;
        grid-row: 5;
      }

      #track-upload-form[data-upload-presentation="1"] [data-upload-vip="1"] {
        grid-column: 1 !important;
        grid-row: 6;
      }

      #track-upload-form[data-upload-presentation="1"] [data-upload-cover-library="1"] {
        grid-column: 1;
        grid-row: 7;
      }

      #track-upload-form[data-upload-presentation="1"] [data-upload-fields-grid="1"] > :not([data-upload-vip="1"]):not([data-upload-permission="1"]) {
        grid-column: 1 / -1;
      }
    }
  `;
  document.head.appendChild(style);
}

function directLabelText(element: Element) {
  const label = Array.from(element.children).find(child => child.tagName === 'LABEL');
  return normalizeText(label?.textContent);
}

function setReactInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  if (setter) setter.call(input, value);
  else input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function clearNewUploadDefaults(form: HTMLFormElement) {
  if (form.dataset.uploadDefaultsCleared === '1') return;
  const modal = form.closest('.upload-modal-overlay,.audio-form-document');
  const heading = normalizeText(modal?.querySelector('h2')?.textContent);
  if (heading !== '上傳音檔') return;

  const fields = form.querySelectorAll<HTMLElement>('[data-upload-fields-grid="1"] > div');
  fields.forEach(field => {
    const label = normalizeText(field.querySelector('label')?.textContent);
    const input = field.querySelector<HTMLInputElement>('input');
    if (!input) return;
    if (label.startsWith('演講日期') || label.startsWith('系列順序')) {
      setReactInputValue(input, '');
    }
  });

  form.dataset.uploadDefaultsCleared = '1';
}

function simplifyLabelText(form: HTMLFormElement) {
  const replacements: Array<[string, string]> = [
    ['音訊檔案 *', '音訊檔案 *'],
    ['主講者封面照片', '主講者封面照片'],
    ['分類標籤', '分類標籤'],
    ['網友關鍵字', '網友關鍵字'],
    ['演講主題', '演講主題 *'],
    ['演講人', '演講人'],
    ['系列 (TALB)', '系列'],
    ['演講日期', '演講日期'],
    ['系列順序', '系列順序'],
    ['瀏覽權限最低門檻獎銜', '瀏覽權限'],
    ['今天上傳日期', '今天上傳日期']
  ];

  form.querySelectorAll<HTMLLabelElement>('label').forEach(label => {
    if (label.closest('[data-upload-vip="1"]')) return;
    const text = normalizeText(label.textContent);
    const match = replacements.find(([prefix]) => text.startsWith(prefix));
    if (!match) return;

    const [prefix, clean] = match;
    if (text === clean) return;

    if (label.children.length === 0) {
      label.textContent = clean;
      return;
    }

    if (prefix === '網友關鍵字') {
      const textNode = Array.from(label.childNodes).find(node => node.nodeType === Node.TEXT_NODE);
      if (textNode) textNode.textContent = clean;
    }
  });

  form.querySelectorAll<HTMLElement>('span').forEach(span => {
    if (span.closest('[data-upload-vip="1"]')) return;
    const text = normalizeText(span.textContent);
    if (text.startsWith('(勾選後儲存與檔案名稱將加上 GAR')) {
      span.dataset.uploadNoteHidden = '1';
    }
  });
}

function hideExplanatoryNotes(form: HTMLFormElement) {
  const notePhrases = [
    '支援 MP3、M4A',
    '可點擊或拖曳上傳；若音檔內含封面',
    '點擊標籤選取；',
    '每首音檔最多 20 組關鍵字',
    '尚未設定關鍵字，可從下方直接點選或自訂輸入新增',
    '點選曾被使用的熱門關鍵字直接帶入：'
  ];

  form.querySelectorAll<HTMLElement>('p, span').forEach(element => {
    if (element.closest('[data-upload-vip="1"]')) return;
    const text = normalizeText(element.textContent);
    if (notePhrases.some(phrase => text.includes(phrase))) {
      element.dataset.uploadNoteHidden = '1';
    }
  });

  // IMPORTANT: never rewrite text nodes inside the React-owned R2 cover library.
  // Selecting a thumbnail or refreshing the list causes React reconciliation; direct
  // textContent mutations here used to corrupt that subtree and could blank the modal.
}

function updateKeywordCandidates(keywordSection: HTMLElement) {
  const input = keywordSection.querySelector<HTMLInputElement>('input[type="text"]');
  const candidates = keywordSection.querySelector<HTMLElement>('[data-upload-keyword-candidates="1"]');
  if (!input || !candidates) return;

  const query = input.value.trim().toLocaleLowerCase('zh-Hant');
  const buttons = Array.from(candidates.querySelectorAll<HTMLButtonElement>('button'));

  if (!query) {
    candidates.style.display = 'none';
    buttons.forEach(button => { button.style.display = ''; });
    return;
  }

  let matchCount = 0;
  buttons.forEach(button => {
    const text = normalizeText(button.textContent).toLocaleLowerCase('zh-Hant');
    const matched = text.includes(query);
    button.style.display = matched ? '' : 'none';
    if (matched) {
      button.style.order = text.startsWith(query) ? '0' : '1';
      matchCount += 1;
    }
  });
  candidates.style.display = matchCount > 0 ? '' : 'none';
}

function wireKeywordSuggestions(keywordSection: HTMLElement) {
  const input = keywordSection.querySelector<HTMLInputElement>('input[type="text"]');
  if (!input) return;
  input.placeholder = '輸入或搜尋關鍵字';

  const candidates = Array.from(keywordSection.children).find(child =>
    child instanceof HTMLElement && normalizeText(child.textContent).includes('點選曾被使用的熱門關鍵字直接帶入')
  ) as HTMLElement | undefined;

  if (candidates) candidates.dataset.uploadKeywordCandidates = '1';

  if (input.dataset.uploadKeywordSearchBound !== '1') {
    input.dataset.uploadKeywordSearchBound = '1';
    input.addEventListener('input', () => updateKeywordCandidates(keywordSection));
    input.addEventListener('focus', () => updateKeywordCandidates(keywordSection));
  }

  updateKeywordCandidates(keywordSection);
}

function cleanKeywordSymbols(keywordSection: HTMLElement) {
  keywordSection.querySelectorAll<HTMLElement>('span').forEach(span => {
    const text = normalizeText(span.textContent);
    if (/^#[^#]/.test(text) && span.children.length === 0) {
      span.textContent = text.replace(/^#\s*/, '');
    }
  });

  keywordSection.querySelectorAll<HTMLButtonElement>('button').forEach(button => {
    const text = normalizeText(button.textContent);

    if (text === '加入關鍵字' || text === '加入') {
      button.dataset.uploadKeywordAdd = '1';
      if (button.textContent !== '加入') button.textContent = '加入';
      return;
    }

    if (/^[✓+]\s*#/.test(text)) {
      const clean = text.replace(/^[✓+]\s*#\s*/, '');
      if (clean && button.textContent !== clean) button.textContent = clean;
    }
  });
}

function markUploadForm(form: HTMLFormElement) {
  form.dataset.uploadPresentation = '1';

  const directChildren = Array.from(form.children).filter((child): child is HTMLElement => child instanceof HTMLElement);

  directChildren.forEach(child => {
    delete child.dataset.uploadStandard;
  });

  const error = directChildren.find(child => child.classList.contains('bg-rose-50') || child.classList.contains('dark:bg-rose-950/60'));
  if (error) error.dataset.uploadError = '1';

  const audio = directChildren.find(child => directLabelText(child).startsWith('音訊檔案'));
  if (audio) audio.dataset.uploadAudio = '1';

  const cover = directChildren.find(child => directLabelText(child).startsWith('主講者封面照片'));
  if (cover) {
    cover.dataset.uploadCoverSection = '1';

    const coverChildren = Array.from(cover.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
    const coverLabel = coverChildren.find(child => child.tagName === 'LABEL');
    const coverSelected = coverChildren.find(child => child !== coverLabel && child.classList.contains('flex'));
    const coverLibrary = coverChildren.find(child => normalizeText(child.textContent).includes('R2 已有演講者照片'));

    if (coverLabel) coverLabel.dataset.uploadCoverLabel = '1';
    if (coverSelected) coverSelected.dataset.uploadCoverSelected = '1';
    if (coverLibrary) {
      // Mark for CSS/layout only. Do not mutate its React-owned child text/content.
      coverLibrary.dataset.uploadCoverLibrary = '1';
    }
  }

  const categories = directChildren.find(child => directLabelText(child).startsWith('分類標籤'));
  if (categories) categories.dataset.uploadCategories = '1';

  const keywordSection = directChildren.find(child => normalizeText(child.textContent).includes('網友關鍵字'));
  if (keywordSection) {
    keywordSection.dataset.uploadKeywords = '1';
    cleanKeywordSymbols(keywordSection);
    wireKeywordSuggestions(keywordSection);
  }

  const fieldsGrid = directChildren.find(child =>
    child.classList.contains('grid') && normalizeText(child.textContent).includes('私秘 VIP 專屬音檔')
  );

  if (fieldsGrid) {
    fieldsGrid.dataset.uploadFieldsGrid = '1';
    const fieldChildren = Array.from(fieldsGrid.children).filter((child): child is HTMLElement => child instanceof HTMLElement);
    const vip = fieldChildren.find(child => normalizeText(child.textContent).includes('私秘 VIP 專屬音檔'));
    const permission = fieldChildren.find(child => directLabelText(child).startsWith('瀏覽權限最低門檻獎銜'));
    if (vip) vip.dataset.uploadVip = '1';
    if (permission) permission.dataset.uploadPermission = '1';
  }

  simplifyLabelText(form);
  hideExplanatoryNotes(form);
  clearNewUploadDefaults(form);

  directChildren.forEach(child => {
    if (
      child !== error &&
      child !== audio &&
      child !== cover &&
      child !== categories &&
      child !== keywordSection &&
      child !== fieldsGrid
    ) {
      child.dataset.uploadStandard = '1';
    }
  });
}

let applyingUploadPolicy = false;

function applyUploadPresentation(root: ParentNode = document) {
  if (applyingUploadPolicy) return;
  applyingUploadPolicy = true;
  try {
    const forms: HTMLFormElement[] = [];
    if (root instanceof HTMLFormElement && root.id === 'track-upload-form') forms.push(root);
    root.querySelectorAll<HTMLFormElement>('#track-upload-form').forEach(form => forms.push(form));
    forms.forEach(markUploadForm);
  } finally {
    applyingUploadPolicy = false;
  }
}

installUploadPresentationStyle();
applyUploadPresentation();

const uploadPresentationObserver = new MutationObserver(mutations => {
  if (applyingUploadPolicy) return;
  const relevant = mutations.some(mutation =>
    mutation.type === 'childList' ||
    (mutation.type === 'characterData' && mutation.target.parentElement?.closest('#track-upload-form'))
  );
  if (relevant) applyUploadPresentation();
});

uploadPresentationObserver.observe(document.documentElement, {
  childList: true,
  subtree: true,
  characterData: true
});

window.addEventListener('resize', () => applyUploadPresentation());
