const LEGACY_API_PREFIX = '/api/stickers';
const BATTERY_API_PREFIX = '/api/batteries';
const UI_SCOPE = 'button,[role="button"],[role="dialog"],nav,header,label,th,td,h1,h2,h3,h4,h5,h6,[aria-live="polite"],[aria-live="assertive"]';

function batteryText(value: string) {
  return value.replaceAll('貼紙', '電池').replaceAll('張電池', '顆電池');
}

function batteryUrl(value: string) {
  try {
    const url = new URL(value, window.location.origin);
    if (url.origin === window.location.origin && url.pathname.startsWith(LEGACY_API_PREFIX)) {
      url.pathname = url.pathname.replace(LEGACY_API_PREFIX, BATTERY_API_PREFIX);
      return value.startsWith('http') ? url.toString() : `${url.pathname}${url.search}${url.hash}`;
    }
  } catch {}
  return value;
}

function installBatteryFetchAlias() {
  const nativeFetch = window.fetch.bind(window);
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === 'string') return nativeFetch(batteryUrl(input), init);
    if (input instanceof URL) return nativeFetch(new URL(batteryUrl(input.toString())), init);
    if (input instanceof Request) {
      const next = batteryUrl(input.url);
      if (next !== input.url) return nativeFetch(new Request(next, input), init);
    }
    return nativeFetch(input, init);
  }) as typeof window.fetch;
}

function translateElement(element: Element) {
  for (const name of ['title', 'aria-label', 'placeholder']) {
    const value = element.getAttribute(name);
    if (value?.includes('貼紙')) element.setAttribute(name, batteryText(value));
  }
  if (!element.matches(UI_SCOPE) && !element.closest(UI_SCOPE)) return;
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const parent = node.parentElement;
    if (!parent || parent.closest('textarea,input,[contenteditable="true"]')) continue;
    const value = node.nodeValue || '';
    if (value.includes('貼紙')) node.nodeValue = batteryText(value);
  }
}

function installBatteryUiTerminology() {
  const apply = (root: ParentNode) => {
    if (root instanceof Element) translateElement(root);
    root.querySelectorAll?.(UI_SCOPE).forEach(translateElement);
  };
  apply(document);
  const observer = new MutationObserver(records => {
    for (const record of records) {
      if (record.type === 'characterData') {
        const parent = record.target.parentElement;
        if (parent && (parent.matches(UI_SCOPE) || parent.closest(UI_SCOPE))) translateElement(parent);
        continue;
      }
      for (const node of record.addedNodes) if (node instanceof Element) apply(node);
    }
  });
  observer.observe(document.documentElement, { subtree: true, childList: true, characterData: true });
}

if (typeof window !== 'undefined') {
  installBatteryFetchAlias();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', installBatteryUiTerminology, { once: true });
  else installBatteryUiTerminology();
}
