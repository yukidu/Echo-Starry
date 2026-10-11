import './v178CrownDiagonalReflection.css';

type ChangelogEntry = {
  version: string;
  date: string;
  isLatest?: boolean;
  summary: string;
  added: string[];
  modified: string[];
  removed: string[];
};

const V178_RELEASE: ChangelogEntry = {
  version: 'v178',
  date: '2026/10/11',
  isLatest: true,
  summary: '調整皇冠大使頭像反光、外圈旋轉與名片閱讀性。',
  added: [],
  modified: [
    '修正頭像反光看起來卡住的問題，多個亮點會緩慢漂移並以呼吸燈節奏持續明暗變化。',
    '外圈同色系漸層保留緩慢旋轉效果。',
    '皇冠大使名片的姓名與勵志名言再放大，手機版也同步提高閱讀尺寸，勵志名言維持一般字重。',
    '右側固定使用與音檔資訊頁相同造型的外部連結圖示，移除多餘箭頭。',
    '本人名片卡外框維持與其他皇冠大使名片一致。'
  ],
  removed: ['移除粉色圓形箭頭按鈕、多餘箭頭，以及掃光式、左右移動與反光本身 360 度繞圈的效果。']
};

const runtime = window as Window & typeof globalThis & {
  __ECHOSTARS_V178_RELEASE_PATCH__?: boolean;
  __ECHOSTARS_V178_CARD_POLISH__?: boolean;
};

const V178_CARD_STYLE_ID = 'echostars-v178-crown-card-polish';

function v178ExternalLinkSvg() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('class', 'taiwan-crown-external-link-icon');

  const arrowCorner = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  arrowCorner.setAttribute('d', 'M15 3h6v6');
  const arrowShaft = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  arrowShaft.setAttribute('d', 'M10 14 21 3');
  const box = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  box.setAttribute('d', 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6');
  svg.append(arrowCorner, arrowShaft, box);
  return svg;
}

function installV178CardPolish() {
  if (!document.getElementById(V178_CARD_STYLE_ID)) {
    const style = document.createElement('style');
    style.id = V178_CARD_STYLE_ID;
    style.textContent = `
      .taiwan-crown-overlay .taiwan-crown-card {
        grid-template-columns: 5.2em minmax(0, 1fr) 3em !important;
      }
      .taiwan-crown-overlay .taiwan-crown-card-name {
        font-size: 1.68em !important;
        line-height: 1.16 !important;
      }
      .taiwan-crown-overlay .taiwan-crown-card-quote {
        font-size: 1.30em !important;
        font-weight: 400 !important;
        line-height: 1.52 !important;
      }
      .taiwan-crown-overlay .taiwan-crown-card:not(.taiwan-crown-member-card) .taiwan-crown-card-arrow {
        display: grid !important;
        width: 2.75em !important;
        height: 2.75em !important;
        place-items: center !important;
        justify-self: center !important;
        overflow: visible !important;
        color: var(--color-primary, #c06c84) !important;
        font-size: 1em !important;
        line-height: 1 !important;
        text-indent: 0 !important;
        opacity: 1 !important;
      }
      .taiwan-crown-overlay .taiwan-crown-card:not(.taiwan-crown-member-card) .taiwan-crown-card-arrow::before,
      .taiwan-crown-overlay .taiwan-crown-card:not(.taiwan-crown-member-card) .taiwan-crown-card-arrow::after {
        content: none !important;
        display: none !important;
      }
      .taiwan-crown-external-link-icon {
        display: block !important;
        width: 1.9em !important;
        height: 1.9em !important;
        color: currentColor !important;
        pointer-events: none !important;
      }
      @media (max-width: 420px) {
        .taiwan-crown-overlay .taiwan-crown-card {
          grid-template-columns: 4.55em minmax(0, 1fr) 2.7em !important;
        }
        .taiwan-crown-overlay .taiwan-crown-card-name {
          font-size: 1.54em !important;
          line-height: 1.16 !important;
        }
        .taiwan-crown-overlay .taiwan-crown-card-quote {
          font-size: 1.22em !important;
          font-weight: 400 !important;
          line-height: 1.52 !important;
        }
        .taiwan-crown-overlay .taiwan-crown-card:not(.taiwan-crown-member-card) .taiwan-crown-card-arrow {
          width: 2.55em !important;
          height: 2.55em !important;
        }
        .taiwan-crown-external-link-icon {
          width: 1.8em !important;
          height: 1.8em !important;
        }
      }
    `;
    document.head.append(style);
  }

  const syncIcons = () => {
    document
      .querySelectorAll<HTMLElement>('.taiwan-crown-card:not(.taiwan-crown-member-card) .taiwan-crown-card-arrow')
      .forEach(arrow => {
        if (arrow.querySelector('.taiwan-crown-external-link-icon')) return;
        arrow.replaceChildren(v178ExternalLinkSvg());
      });
  };

  syncIcons();
  const observer = new MutationObserver(syncIcons);
  observer.observe(document.body, { childList: true, subtree: true });
}

function isChangelogGet(input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) {
  const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  if (method !== 'GET') return false;
  try {
    const rawUrl = input instanceof Request ? input.url : String(input);
    const url = new URL(rawUrl, window.location.origin);
    return url.origin === window.location.origin && url.pathname === '/api/changelog';
  } catch {
    return false;
  }
}

function mergeV178(data: unknown): ChangelogEntry[] {
  const list = Array.isArray(data)
    ? data.filter(item => item && typeof item === 'object') as ChangelogEntry[]
    : [];
  return [
    V178_RELEASE,
    ...list
      .filter(item => item.version !== V178_RELEASE.version)
      .map(item => ({ ...item, isLatest: false }))
  ];
}

if (!runtime.__ECHOSTARS_V178_CARD_POLISH__) {
  runtime.__ECHOSTARS_V178_CARD_POLISH__ = true;
  if (document.body) installV178CardPolish();
  else window.addEventListener('DOMContentLoaded', installV178CardPolish, { once: true });
}

if (!runtime.__ECHOSTARS_V178_RELEASE_PATCH__) {
  runtime.__ECHOSTARS_V178_RELEASE_PATCH__ = true;
  const previousFetch = window.fetch.bind(window);
  window.fetch = (async (...args: Parameters<typeof fetch>) => {
    const [input, init] = args;
    if (!isChangelogGet(input, init)) return previousFetch(...args);
    try {
      const response = await previousFetch(...args);
      const data = response.ok ? await response.clone().json().catch(() => []) : [];
      const headers = new Headers(response.headers);
      headers.set('Content-Type', 'application/json; charset=utf-8');
      headers.delete('Content-Length');
      headers.delete('Content-Encoding');
      return new Response(JSON.stringify(mergeV178(data)), {
        status: 200,
        statusText: 'OK',
        headers
      });
    } catch {
      return new Response(JSON.stringify(mergeV178([])), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }
  }) as typeof window.fetch;
}
