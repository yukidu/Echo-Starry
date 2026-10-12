type ChangelogEntry = {
  version: string;
  date: string;
  isLatest?: boolean;
  summary: string;
  added: string[];
  modified: string[];
  removed: string[];
};

const V192_RELEASE: ChangelogEntry = {
  version: 'v192',
  date: '2026/10/12',
  isLatest: true,
  summary: '修正「只對有權限者顯示」的儲存與隱藏邏輯，加入隱藏提示、逐音檔分享開關，並恢復講師獎銜獎章。',
  added: [
    '被設定隱藏的音檔，符合瀏覽權限的人仍看得到；首頁封面中央會顯示大型眼睛畫叉圖案與「已被隱藏」。',
    '音檔詳細資訊頁會在講師照片左側空白處顯示相同的「已被隱藏」提示，不遮住照片。',
    '音檔管理新增「隱藏音檔允許分享」獨立開關，每一首隱藏音檔可以各自決定是否允許分享。',
    '恢復講師獎銜獎章：詳細頁照片右側顯示對應獎章，點擊後可回首頁精確篩選同獎銜音檔。'
  ],
  modified: [
    '「只對有權限者顯示(從首頁隱藏)」現在會永久記住最後一次儲存的勾選或取消狀態，重新進入編輯不會自己跳回勾選。',
    '隱藏音檔對未達瀏覽權限的會員與訪客，會從首頁播放清單完全隱藏；取消隱藏後恢復正常顯示規則。',
    '隱藏音檔預設禁止分享；只有管理端針對該音檔開啟允許分享後，分享功能與既有分享網址才可使用。',
    '保留 v189 播放切換確認、v189.1 手機瀏覽權限排版與 v189.2 編輯儲存不卡住修正。'
  ],
  removed: []
};

const runtime = window as Window & typeof globalThis & {
  __ECHOSTARS_V192_RELEASE_PATCH__?: boolean;
};

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

function mergeV192(data: unknown): ChangelogEntry[] {
  const list = Array.isArray(data)
    ? data.filter(item => item && typeof item === 'object') as ChangelogEntry[]
    : [];
  return [
    V192_RELEASE,
    ...list
      .filter(item => item.version !== V192_RELEASE.version)
      .map(item => ({ ...item, isLatest: false }))
  ];
}

if (!runtime.__ECHOSTARS_V192_RELEASE_PATCH__) {
  runtime.__ECHOSTARS_V192_RELEASE_PATCH__ = true;
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
      return new Response(JSON.stringify(mergeV192(data)), {
        status: 200,
        statusText: 'OK',
        headers
      });
    } catch {
      return new Response(JSON.stringify(mergeV192([])), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }
  }) as typeof window.fetch;
}
