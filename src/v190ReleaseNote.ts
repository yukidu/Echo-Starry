type ChangelogEntry = {
  version: string;
  date: string;
  isLatest?: boolean;
  summary: string;
  added: string[];
  modified: string[];
  removed: string[];
};

const V190_RELEASE: ChangelogEntry = {
  version: 'v190',
  date: '2026/10/12',
  isLatest: true,
  summary: '音檔詳細介紹新增講師獎銜獎章，點獎章可直接回首頁查看同獎章的所有音檔。',
  added: [
    '詳細音檔介紹卡的講師照片右側，依講師獎銜顯示 R2「Pin-Level」資料夾內對應獎章。',
    '獎章放大並增加更多閃光星芒點綴，讓獎銜更醒目。',
    '點擊獎章會回到首頁播放清單，並只顯示講師獎銜與該獎章完全相同的音檔資訊卡。'
  ],
  modified: [
    '取消獎章上下漂浮動畫，只保留輕量閃光效果，改善手機顯示的流暢度。',
    '獎章篩選改放進首頁「進階篩選」內；由獎章進入時會自動展開，可在裡面查看或清除條件。',
    '獎章篩選使用獨立的精確獎銜條件，不會把「白金」與「創辦人白金」等不同獎章混在一起。',
    '回首頁或使用進階篩選的「重設」，會一併清除獎章篩選，避免條件殘留。'
  ],
  removed: [
    '刪除首頁播放清單原本另外占一整列的「獎章篩選」提示。'
  ]
};

const runtime = window as Window & typeof globalThis & {
  __ECHOSTARS_V190_RELEASE_PATCH__?: boolean;
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

function mergeV190(data: unknown): ChangelogEntry[] {
  const list = Array.isArray(data)
    ? data.filter(item => item && typeof item === 'object') as ChangelogEntry[]
    : [];
  return [
    V190_RELEASE,
    ...list
      .filter(item => item.version !== V190_RELEASE.version)
      .map(item => ({ ...item, isLatest: false }))
  ];
}

if (!runtime.__ECHOSTARS_V190_RELEASE_PATCH__) {
  runtime.__ECHOSTARS_V190_RELEASE_PATCH__ = true;
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
      return new Response(JSON.stringify(mergeV190(data)), {
        status: 200,
        statusText: 'OK',
        headers
      });
    } catch {
      return new Response(JSON.stringify(mergeV190([])), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }
  }) as typeof window.fetch;
}
