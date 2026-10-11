import './v176CrownStoryInPage.css';

const CROWN_PAGE_ID = 'taiwan-crown-integrated-page';
const STORY_VIEW_ATTR = 'data-v176-crown-story-view';
const AMWAY_STORY_RE = /^https:\/\/www\.amway\.com\.tw\/wechat\/aep\/member\/member\d+\.html(?:[?#].*)?$/i;

type StoryItem = {
  name: string;
  quote: string;
  imageUrl: string;
  sourceUrl: string;
};

let listScrollY = 0;
let currentStoryIndex = -1;
let storyItems: StoryItem[] = [];

function crownPage() {
  return document.getElementById(CROWN_PAGE_ID);
}

function crownListShell() {
  return crownPage()?.querySelector<HTMLElement>('.taiwan-crown-page-shell') || null;
}

function cleanQuote(value: string) {
  return value.trim().replace(/^[“\"']\s*/, '').replace(/\s*[”\"']$/, '').trim();
}

function readStories(): StoryItem[] {
  const shell = crownListShell();
  if (!shell) return [];
  return Array.from(shell.querySelectorAll<HTMLAnchorElement>('a.taiwan-crown-card[href]'))
    .map(anchor => ({
      name: anchor.querySelector<HTMLElement>('.taiwan-crown-card-name')?.textContent?.trim()
        || anchor.getAttribute('aria-label')?.replace(/^開啟|皇冠大使成功故事$/g, '').trim()
        || '皇冠大使',
      quote: cleanQuote(anchor.querySelector<HTMLElement>('.taiwan-crown-card-quote')?.textContent || ''),
      imageUrl: anchor.querySelector<HTMLImageElement>('.taiwan-crown-avatar img')?.src || '',
      sourceUrl: anchor.href
    }))
    .filter(item => AMWAY_STORY_RE.test(item.sourceUrl));
}

function removeStoryView() {
  crownPage()?.querySelector<HTMLElement>(`[${STORY_VIEW_ATTR}]`)?.remove();
}

function closeStoryView({ restoreScroll = true }: { restoreScroll?: boolean } = {}) {
  const shell = crownListShell();
  removeStoryView();
  if (shell) shell.hidden = false;
  currentStoryIndex = -1;
  storyItems = [];
  document.body.removeAttribute('data-taiwan-crown-story-open');
  if (restoreScroll) {
    window.requestAnimationFrame(() => window.scrollTo({ top: listScrollY, behavior: 'auto' }));
  }
}

function makeButton(label: string, className: string, onClick: () => void) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = className;
  button.textContent = label;
  button.addEventListener('click', onClick);
  return button;
}

function createLocalStoryContent(item: StoryItem) {
  const article = document.createElement('article');
  article.className = 'v176-crown-story-content';
  article.setAttribute('data-v176-crown-story-content', 'true');
  article.setAttribute('data-source-url', item.sourceUrl);

  const portraitWrap = document.createElement('div');
  portraitWrap.className = 'v176-crown-story-portrait-wrap';
  if (item.imageUrl) {
    const portrait = document.createElement('img');
    portrait.className = 'v176-crown-story-portrait';
    portrait.src = item.imageUrl;
    portrait.alt = `${item.name} 皇冠大使`;
    portrait.loading = 'eager';
    portraitWrap.append(portrait);
  } else {
    const fallback = document.createElement('div');
    fallback.className = 'v176-crown-story-portrait v176-crown-story-portrait-fallback';
    fallback.textContent = '👑';
    fallback.setAttribute('aria-label', `${item.name} 皇冠大使`);
    portraitWrap.append(fallback);
  }

  const eyebrow = document.createElement('p');
  eyebrow.className = 'v176-crown-story-eyebrow';
  eyebrow.textContent = '臺灣皇冠大使・成功分享';

  const name = document.createElement('h1');
  name.className = 'v176-crown-story-name';
  name.textContent = item.name;

  const quoteLabel = document.createElement('p');
  quoteLabel.className = 'v176-crown-story-quote-label';
  quoteLabel.textContent = '成功語錄';

  const quote = document.createElement('blockquote');
  quote.className = 'v176-crown-story-quote';
  quote.textContent = item.quote || '每一步累積，都在寫下自己的成功故事。';

  const source = document.createElement('p');
  source.className = 'v176-crown-story-source';
  source.textContent = '資料來源：安麗臺灣皇冠大使成功故事';

  article.append(portraitWrap, eyebrow, name, quoteLabel, quote, source);
  return article;
}

function showStoryAt(index: number) {
  if (!storyItems.length) return;
  const normalized = Math.max(0, Math.min(storyItems.length - 1, index));
  const item = storyItems[normalized];
  const page = crownPage();
  const shell = crownListShell();
  if (!page || !shell || !item) return;

  currentStoryIndex = normalized;
  shell.hidden = true;
  removeStoryView();
  document.body.setAttribute('data-taiwan-crown-story-open', 'true');

  const view = document.createElement('section');
  view.setAttribute(STORY_VIEW_ATTR, 'true');
  view.className = 'v176-crown-story-view';
  view.setAttribute('aria-label', `${item.name} 皇冠大使成功故事`);

  const toolbar = document.createElement('div');
  toolbar.className = 'v176-crown-story-toolbar';

  const back = makeButton('← 返回皇冠大使', 'v176-crown-story-back', () => closeStoryView());
  back.setAttribute('aria-label', '返回臺灣皇冠大使清單');

  const heading = document.createElement('div');
  heading.className = 'v176-crown-story-heading';
  const title = document.createElement('strong');
  title.textContent = item.name;
  const counter = document.createElement('span');
  counter.textContent = `${normalized + 1} / ${storyItems.length}`;
  heading.append(title, counter);

  const paging = document.createElement('div');
  paging.className = 'v176-crown-story-paging';
  const previous = makeButton('‹', 'v176-crown-story-page-button', () => showStoryAt(currentStoryIndex - 1));
  previous.setAttribute('aria-label', '上一位皇冠大使');
  previous.disabled = normalized <= 0;
  const next = makeButton('›', 'v176-crown-story-page-button', () => showStoryAt(currentStoryIndex + 1));
  next.setAttribute('aria-label', '下一位皇冠大使');
  next.disabled = normalized >= storyItems.length - 1;
  paging.append(previous, next);
  toolbar.append(back, heading, paging);

  view.append(toolbar, createLocalStoryContent(item));
  const modal = page.querySelector('[data-crown-motto-modal]');
  page.insertBefore(view, modal || null);
  window.scrollTo({ top: 0, behavior: 'auto' });
}

function openStoryFromAnchor(anchor: HTMLAnchorElement) {
  if (!AMWAY_STORY_RE.test(anchor.href)) return;
  storyItems = readStories();
  const index = storyItems.findIndex(item => item.sourceUrl === anchor.href);
  if (index < 0) return;
  listScrollY = window.scrollY;
  showStoryAt(index);
}

document.addEventListener('click', event => {
  const target = event.target as Element | null;
  const anchor = target?.closest<HTMLAnchorElement>(`#${CROWN_PAGE_ID} a.taiwan-crown-card[href]`);
  if (!anchor || !AMWAY_STORY_RE.test(anchor.href)) return;
  event.preventDefault();
  event.stopPropagation();
  openStoryFromAnchor(anchor);
}, true);

// Keep the Crown list/detail switch entirely inside the existing app shell.
// The React tree, top navigation, hamburger menu and shared audio element are
// never replaced or remounted, so playback continues while browsing stories.
const bodyObserver = new MutationObserver(() => {
  if (document.body.dataset.taiwanCrownOpen !== 'true' && document.body.hasAttribute('data-taiwan-crown-story-open')) {
    closeStoryView({ restoreScroll: false });
  }
});
bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['data-taiwan-crown-open'] });