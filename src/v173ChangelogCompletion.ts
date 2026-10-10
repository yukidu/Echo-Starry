type ChangelogEntry = {
  version: string;
  date: string;
  isLatest?: boolean;
  summary: string;
  added: string[];
  modified: string[];
  removed: string[];
};

// v173: the public changelog had complete legacy notes through v157, while
// v158-v172 were represented only by source-control history (and, for v172,
// a temporary one-off card). Keep the historical source intact and layer the
// missing public release entries onto the same /api/changelog response.
const RECENT_RELEASE_NOTES: ChangelogEntry[] = [
  {
    version: 'v173',
    date: '2026/10/11',
    isLatest: true,
    summary: '補齊驚嘆號頁面的正式改版歷程，讓近期版本可以依版本號連續查閱。',
    added: ['正式補入 v158～v172 的版本紀錄，包含日期、白話摘要與主要新增／調整內容。'],
    modified: ['最新版本改回使用原本的改版紀錄清單呈現，不再另外插入一張臨時「最新改版」卡片。'],
    removed: ['移除 v172 額外插入的獨立改版提示卡，避免同一版本重複顯示。']
  },
  {
    version: 'v172',
    date: '2026/10/11',
    summary: '臺灣皇冠大使正式整合為繁星回聲站內頁，會員座右銘同步納入個人基本資料。',
    added: ['個人基本資料新增「座右銘」欄位，與皇冠大使本人資訊卡共用同一份資料。'],
    modified: [
      '臺灣皇冠大使改為站內頁面，保留置頂主選單、漢堡選單、浮動播放器與字體大小設定。',
      '皇冠選單改用單色線條圖示；登入會員可自訂是否顯示在置頂主選單。',
      '會員本人照片直接同步個人基本資料；訪客只瀏覽 13 位皇冠大使故事，不顯示自己的資訊卡。'
    ],
    removed: ['移除舊獨立皇冠頁、皇冠頁照片修改、個人化設定、重設按鈕與登入身分提示。']
  },
  {
    version: 'v171',
    date: '2026/10/11',
    summary: '首次加入「臺灣皇冠大使」公開分頁與漢堡選單入口。',
    added: [
      '加入 13 位臺灣皇冠大使人物照片、成功語錄與官方成功故事連結。',
      '訪客與會員都可從漢堡選單進入臺灣皇冠大使頁面。'
    ],
    modified: ['頁面會自動使用已登入會員姓名或訪客暱稱，不再要求手動輸入姓名，並支援網站主題配色與手機版面。'],
    removed: []
  },
  {
    version: 'v170',
    date: '2026/10/11',
    summary: '整理首頁音檔卡片的貼紙進度文字與顏色，讓獲得／消耗更容易辨識。',
    added: [],
    modified: [
      '獲得貼紙「+X」統一顯示紅色、消耗貼紙「-X」維持綠色，「張貼紙」使用白色。',
      '收聽進度改為較精簡的「已聽50%」等格式，移除不必要空格。'
    ],
    removed: []
  },
  {
    version: 'v169',
    date: '2026/10/11',
    summary: '重整音檔工作區分頁與首頁四個篩選／排序按鈕的操作方式。',
    added: ['音檔工作區整理為「上傳音檔／管理音檔／網友音檔」三個可水平滑動的分頁。'],
    modified: [
      '「全部分類」與「進階篩選」恢復直接下拉選擇，不再開啟全頁式篩選。',
      '「最新上架」與「熱門推薦」改為直接按按鈕循環切換排序模式，按鈕文字同步顯示目前模式。',
      '篩選按鈕未啟用時採搜尋框般淡色，啟用時跟隨目前網站主題色。'
    ],
    removed: ['取消首頁四個篩選按鈕的全頁式選擇介面。']
  },
  {
    version: 'v168',
    date: '2026/10/11',
    summary: '修正整頁式編輯音檔按下「儲存」偶爾沒有反應的問題。',
    added: ['加入真實瀏覽器回歸驗證，避免音檔編輯儲存問題再次出現。'],
    modified: ['儲存按鈕會明確送出目前畫面上的編輯表單，不會誤送到背景同名表單。'],
    removed: []
  },
  {
    version: 'v167',
    date: '2026/10/11',
    summary: '音檔管理的編輯流程改為完整頁面，並重新整理當時的首頁篩選操作。',
    added: [],
    modified: [
      '編輯音檔由浮動視窗改成真正的整頁式編輯，進入編輯後原音檔清單收起，儲存操作放在頁面上方。',
      '當時將首頁分類、時間、熱門、進階四項篩選改為整頁選擇；此篩選方式後續於 v169 依使用需求改回直接操作。'
    ],
    removed: ['移除舊的音檔編輯浮動彈窗呈現。']
  },
  {
    version: 'v166',
    date: '2026/10/10',
    summary: '修復音檔詳細頁第一次播放無反應，並統一首頁篩選按鈕視覺。',
    added: [],
    modified: [
      '詳細頁播放按鈕可正常啟動音檔；進入詳細頁仍不會自動播放，必須由使用者主動按播放。',
      '首頁四個篩選按鈕的未選取外觀調整為與搜尋欄一致的淡色樣式。'
    ],
    removed: []
  },
  {
    version: 'v165',
    date: '2026/10/10',
    summary: '修正召喚繁星抽卡提示、誤跳詳細頁與詳細頁自動播放問題。',
    added: ['在播放層增加手動播放保護，只有明確的播放操作才會啟動音檔。'],
    modified: [
      '召喚繁星的抽卡提示與轉輪互動更穩定，降低抽卡過程誤觸跳到詳細頁的情況。',
      '進入音檔詳細頁不再自動播放。'
    ],
    removed: []
  },
  {
    version: 'v164',
    date: '2026/10/10',
    summary: '修正召喚繁星的浮動抽卡提示被音檔卡片遮住。',
    added: [],
    modified: ['抽卡結果與提示固定顯示在卡片上方，避免被音檔資訊卡蓋住。'],
    removed: []
  },
  {
    version: 'v163',
    date: '2026/10/10',
    summary: '整理漢堡選單、召喚繁星與抽卡提示之間的顯示衝突。',
    added: ['加入實際瀏覽器檢查，驗證漢堡選單、召喚按鈕與抽卡結果在手機畫面上的互動。'],
    modified: ['統一漢堡選單關閉規則與首頁浮動提示的顯示層級，避免互相遮擋或搶操作。'],
    removed: []
  },
  {
    version: 'v162',
    date: '2026/10/10',
    summary: '修正音檔編輯頁面蓋住置頂導覽與漢堡選單。',
    added: [],
    modified: ['音檔編輯頁與詳細頁編輯層固定在導覽列下方，漢堡選單可以正常顯示與操作。'],
    removed: ['移除不再需要的臨時顯示層樣式。']
  },
  {
    version: 'v161',
    date: '2026/10/10',
    summary: '調整音檔管理、編輯導向與漢堡選單操作，使管理流程更一致。',
    added: [],
    modified: [
      '整理音檔管理與編輯頁的切換流程，避免舊版導向規則互相干擾。',
      '進入上傳／管理音檔工作區時會同步需要的管理狀態，選單操作也配合新版流程調整。'
    ],
    removed: []
  },
  {
    version: 'v160',
    date: '2026/10/10',
    summary: '重整美力之星與繁星回聲的跨站會員同步方式，降低重複寫入並提高後續擴充穩定性。',
    added: ['跨站會員同步加入版本化轉接規則，讓未來欄位升級可以更安全。'],
    modified: [
      '會員資料讀取改為統一來源，組織與上手關係優先使用正式關聯資料。',
      '降低高頻活動資料造成的不必要跨站同步。'
    ],
    removed: []
  },
  {
    version: 'v159',
    date: '2026/10/10',
    summary: '美力之星可同步繁星回聲完整的基本會員資料，兩邊會員資料保持更一致。',
    added: ['加入會員資料變更辨識與快取機制，只有基本資料真正改變時才需要更新。'],
    modified: ['美力之星會員同步範圍擴充為繁星回聲完整基本會員資料。'],
    removed: []
  },
  {
    version: 'v158',
    date: '2026/10/10',
    summary: '新增「美力之星 StarBeauty」作業平台的跨站整合基礎。',
    added: ['建立美力之星作業平台相關功能與繁星回聲會員整合入口。'],
    modified: [],
    removed: []
  }
];

const runtime = window as Window & typeof globalThis & {
  __ECHOSTARS_V173_CHANGELOG_COMPLETION__?: boolean;
};

const unique = (items: string[]) => [...new Set(items.filter(Boolean))];

function mergeOneRelease(list: ChangelogEntry[], release: ChangelogEntry): ChangelogEntry[] {
  const existing = list.find(item => item.version === release.version);
  const rest = list.filter(item => item.version !== release.version);
  const merged: ChangelogEntry = existing
    ? {
        ...existing,
        ...release,
        date: release.date || existing.date,
        summary: release.summary || existing.summary,
        added: unique([...(release.added || []), ...(existing.added || [])]),
        modified: unique([...(release.modified || []), ...(existing.modified || [])]),
        removed: unique([...(release.removed || []), ...(existing.removed || [])])
      }
    : release;
  return [merged, ...rest.map(item => ({ ...item, isLatest: false }))];
}

function mergeRecentReleases(data: unknown): ChangelogEntry[] {
  let list = Array.isArray(data)
    ? data.filter(item => item && typeof item === 'object') as ChangelogEntry[]
    : [];

  for (const release of [...RECENT_RELEASE_NOTES].reverse()) {
    list = mergeOneRelease(list, release);
  }
  return list;
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

if (!runtime.__ECHOSTARS_V173_CHANGELOG_COMPLETION__) {
  runtime.__ECHOSTARS_V173_CHANGELOG_COMPLETION__ = true;
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
      return new Response(JSON.stringify(mergeRecentReleases(data)), {
        status: 200,
        statusText: 'OK',
        headers
      });
    } catch {
      return new Response(JSON.stringify(mergeRecentReleases([])), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }
  }) as typeof window.fetch;
}
