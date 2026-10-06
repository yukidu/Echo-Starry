type ChangelogEntry = {
  version: string;
  date: string;
  isLatest?: boolean;
  summary: string;
  added: string[];
  modified: string[];
  removed: string[];
};

export const HEALTHCHECK_RELEASE_NOTES: ChangelogEntry = {
  version: 'v3.9',
  date: '2026/10/04',
  summary:
    '進行一次全站功能健檢，把近期多次改版留下的衝突風險重新盤查。這次特別檢查個人學習紀錄圖卡、訪客與會員流程、分類、分享、播放、登入、PWA 與部署測試，並修正實際找到的問題。',
  added: [
    '正式部署前增加完整自動檢查：每次新版都會先跑回歸測試與網站建置，通過後才能繼續部署，降低舊功能被新修改意外影響的機率。',
    '分類資料增加安全整理機制：舊音檔若還留著已被後台刪除的分類，系統會自動清掉；沒有分類的音檔就保持沒有分類，不會自己補回已刪除的名稱。',
    '分享圖產生失敗時會顯示明確錯誤，不再只有畫面一直停在讀取狀態。'
  ],
  modified: [
    '個人學習紀錄圖卡重新盤查：確認使用會員自己的正式學習紀錄、完成狀態、聆聽進度、評分與心得資料製圖，並保留 1280px 高畫質 JPEG 輸出。',
    '黑白心得圖與評價清單圖的預覽流程更穩定：關閉或切換圖卡後會釋放舊預覽資源，避免長時間使用後累積不必要的記憶體。',
    '分類標籤以後台分類清單作為唯一來源；刪除分類後，首頁快取、舊音檔資料與新上傳資料都會跟著一致，不再讓「未分類」或其他已刪標籤自行復活。',
    '重新整理自動測試：移除只檢查過去舊版本號、已經不符合現行架構的測試，改成檢查現在真正需要保護的登入、分享、學習紀錄、播放、分類、首頁、PWA 與手機選單功能。',
    '重新核對訪客與登入會員的功能界線：訪客仍可使用公開播放與可用的分享圖功能；會員學習紀錄、個人學習圖卡與需要身分的操作仍以已驗證會員身分為準。',
    '個人中心的「上手白金」與「上手鑽石」改為真正可用的關聯詞提示：輸入或點進欄位時，會從現有會員姓名與既有上手資料中自動顯示符合候選詞，可直接點選帶入。',
    '首頁「網友關鍵字」改成可複選條件提示，關鍵字字體放大；每個關鍵字後方新增即時音檔數量，例如 (3)。選取多個關鍵字時，數量會依目前分類、獎銜、搜尋與已選關鍵字交叉條件立即重新計算，不增加額外雲端查詢。',
    '交叉篩選後結果為 0 的候選關鍵字會立即隱藏；取消條件後只要重新有符合音檔就會自動出現。已選條件仍保留可移除入口。',
    '首頁網友關鍵字操作再整理：標題改為「網友關鍵字(可複選多個)」，「清除條件」簡化為「重設」，收起、展開、重設文字與標題同級放大，關鍵字面板右上角關閉 X 改成大型高對比按鈕，手機更容易辨識與點擊。',
    '首頁網友關鍵字視覺再統一：關閉 X 會跟著目前調色盤主色同步；展開清單與已選條件中的關鍵字都改為一般字重；排序整排按鈕與上方搜尋框統一高度，切換排序時不再因縮放造成高度跳動。',
    '音檔詳細頁操作整理：播放時間軸改成只能從目前播放圓點按住拖曳，避免誤點跳段；時間置中。演講資訊空白欄位不再顯示「未填寫」，編輯按鈕簡化為「編輯」，關鍵字預設收起並可展開；心得輸入移除姓名獎銜、送出按鈕簡化，留言頭像放大、姓名與獎銜上下排列，全文字體與頁面行距同步優化。',
    '詳細頁網友關鍵字版面再整理：展開與收起固定在同一位置；新增關鍵字移到標題下方，字體與標題同尺寸；所有關鍵字文字同步放大並取消粗體。',
    '迷你播放器與心得閱讀再優化：回頂端與首頁按鈕移到播放器左側，右側新增關閉播放器 X，音檔標題跟隨調色盤主色；心得頭像再放大、留言時間移到頭像下方，姓名與本文同尺寸、獎銜縮小，更多與收起增加方向三角形。',
    '心得時間顯示修正：過去部分心得會把「剛剛」永久存進資料，造成幾分鐘、幾天後仍顯示錯誤時間。現在所有心得統一依真正建立時間換算台灣日期與時間；心得區獎銜也固定單行顯示，不再拆成兩三行。',
    '心得留言時間版面再調整：時間改成「年份／月日／時分」三行顯示；按讚與回覆操作靠得更近，按讚愛心同步放大，手機閱讀與操作更清楚。',
    '心得留言排列再壓縮：留言本文直接緊接在姓名與獎銜下方，不再被左側頭像時間撐出大片空白；愛心與回覆固定和獎銜同一行靠右，回覆箭頭與文字同步放大到心得本文等級。',
    '心得回覆顯示再精簡：日期時間字體再縮小；按下回覆不再自動塞入對方姓名或 @ 標記，送出後也不再顯示「回覆 @某某」前綴。舊留言中由系統自動加上的開頭 @ 對象會隱藏，只有使用者自己手動輸入的 @ 標記才會照原文顯示。',
    '首頁新手教學文字與位置整理：回首頁與照片播放提示改成更精簡文字；會員提示改為分行列出完整功能；「不再顯示新手教學」勾選區改為跟著照片提示框移動，手機高度或方向改變時也會一起重新定位。',
    '首頁預設播放清單改為依會員播放權限分三層：可播放音檔每次進首頁重新隨機、不可播放音檔依所需獎銜由低到高、私密 VIP 固定最後並依上傳時間新到舊。搜尋旁按鈕改為「🫵好手氣」，會在目前可播放清單中直接跑轉輪聚光與音效，最後抽出一張音檔資訊卡；私密 VIP 不會被隨機推薦。',
    '「🫵好手氣」抽卡動畫再優化：轉輪時畫面中的卡片會一起上下滾動，第二張維持聚光；中獎後不再自動捲動畫面，中獎光效與標籤會持續保留，點空白處、重新整理或回首頁才清除。中獎標籤上移避免遮住標題；首頁「網友關鍵字」的展開／收起固定靠右。',
    '音檔播放與真正離線儲存重新分流：拖曳時間軸造成的短暫緩衝不再反覆蓋住整頁；完整音檔仍會實際寫入瀏覽器 Cache Storage，成功寫入並驗證後才算離線保存。背景下載延後並降低優先級、同時只下載一個音檔，減少和播放搶網路；聽完後不再立刻刪除，改為 15 天未使用才清理，並在瀏覽器支援時申請持久儲存。',
    '上傳／編輯音檔的 R2 封面圖庫修復：點選既有封面不再因畫面腳本與 React 同時改動而白屏；「同步 R2」會強制重新讀取雲端封面清單並更新本機暫存，R2 已刪除的照片也會從清單移除。',
    '網友關鍵字與詳細播放頁再壓縮：首頁與詳細頁的標題列改成「按此 ▼展開」，展開後自動變成「▲收起」；首頁移除展開區右側 X。詳細頁收起時縮短關鍵字外框並更靠近頁首，評價／心得／按讚移除底部圓角襯框，長音檔標題的多行行距也同步收緊。',
    '網友關鍵字提示再精簡：詳細播放頁未登入時維持「(登入可自訂新增)」，登入會員後自動縮成「(可自訂新增)」；首頁與詳細頁括號提示字再縮小。首頁「🫵好手氣」移到搜尋框左邊，搜尋框改到右側。',
    '新增「我的貼紙」會員點數：新會員與既有會員安全初始化 6 張，評價、按讚、新增網友關鍵字與聽完分享心得可依規則獲得貼紙；好手氣、私秘 VIP 與指定錄音可消耗貼紙。所有增減都有永久帳本與防重複機制，刪除曾獲獎的心得會自動扣回。超級管理員可批次設定錄音貼紙、調整全站規則；白金以上會員可依上手白金／上手鑽石關係幫自己的下線人工加貼紙，受贈會員會在鈴鐺通知頁收到原因與張數。',
    '心得留言過長時，首頁心得快速預覽、音檔詳細頁、自己的個人中心與查閱他人學習資料卡都先顯示前三行，可按「更多」展開全文、再按「收起」縮回。匯出個人學習卡則不截斷，會依完整心得內容自動換行並增加圖卡高度。'
  ],
  removed: [
    '移除多個已過期、只綁定舊 PWA 快取版本號的回歸測試，避免網站明明正常更新卻因歷史版本號而被誤判失敗。',
    '移除分享圖錯誤畫面中沒有用途的隱藏控制元件。'
  ]
};

export const CUMULATIVE_RELEASE_NOTES: ChangelogEntry = {
  version: 'v3.8',
  date: '2026/10/04',
  summary:
    '彙整 10/02～10/04 近期累積更新：強化跨平台背景播放與系統媒體控制、Google 登入與分享連結身分恢復、會員學習進度整合、分類標籤管理、上傳／編輯介面、首頁播放清單密度與視覺，以及搜尋引擎與 AI 爬蟲隱私防護。',
  added: [
    '跨平台系統媒體控制：Android、iOS／iPadOS、macOS、Windows 在平台支援時，可於鎖定畫面、通知中心或系統媒體面板同步目前錄音名稱、主講者、人物封面、播放／暫停與播放進度。',
    '永久可讀的音檔分享網址：分享連結改用主講者拼音＋序號的固定網址，分享後同一音檔網址不再任意改變。',
    '會員學習進度整合：以會員帳號作為穩定學習紀錄身分，可公開查看指定會員的播放學習進度，登入時也會安全匯入原裝置已存在的本機播放進度。',
    '分享頁登入恢復：從 LINE、分享網址或私秘 VIP 連結進站時，會先嘗試恢復已驗證的 Google 會員身分，降低已登入會員被誤判成訪客的情況。',
    '長期登入保存：網站登入 Session 改為長期保存並持續刷新，不再以 30 天作為網站端固定失效期限；主動登出或清除網站資料時仍會失效。',
    '上傳介面關鍵字即時搜尋：輸入網友關鍵字時，會從既有關鍵字清單即時篩選相關候選字，並優先排列由輸入文字開頭的項目。',
    '搜尋引擎與 AI 爬蟲防護：全站加入 noindex／nofollow、robots.txt 全站禁止抓取、X-Robots-Tag，以及主要搜尋引擎與已知 AI crawler 的阻擋規則。'
  ],
  modified: [
    '背景播放封面同步修正：只要錄音有主講人物照片，系統 Media Session 就只提供人物照片；真的沒有封面時才使用繁星回聲網站圖示，避免系統自行選錯成網站 icon。',
    '系統播放／暫停按鈕改為回到網站原本播放器狀態控制，避免系統媒體面板與網站動畫、播放狀態不同步。',
    'Google 登入安全續存改為第一方 HttpOnly Session Cookie＋伺服器 Session；分享頁會自動恢復會員狀態，不把會員資料或登入 Token 放進分享網址。',
    '分類標籤改以後台管理中心為唯一管理入口：上傳／編輯音檔只能選既有分類，不能新增、改名或刪除；後台刪除分類增加第二次確認。',
    '分類排序支援手機長按拖曳與桌面拖曳，後台分類順序會同步成首頁播放清單分類下拉選單順序。',
    '分類資料來源改以後端分類清單為權威來源，已刪除分類不再因舊前端預設值或舊快取被重新寫入新音檔。',
    '上傳／編輯介面重新整理：頂部整合主講照片、音檔、瀏覽權限與私秘 VIP；網友關鍵字移除 #、✓、＋ 等多餘符號，「加入關鍵字」簡化為「加入」。',
    'R2 封面圖庫名稱會依卡片寬度自動縮小，極長名稱必要時完整換行，避免檔名被省略號截斷。',
    '上傳介面的說明文字大幅精簡，私秘 VIP 說明保留；新上傳的演講日期與系列順序不再預填固定值。',
    '全站主選單改為固定置頂，首頁、音檔詳細頁、排行榜、通知、個人中心等主要頁面捲動時仍保持在最上方。',
    '首頁整體密度提高：搜尋區、排序列、區塊上下留白、音檔卡片間距與卡片內行高全面縮小，手機與桌面都能在同一畫面看到更多內容。',
    '首頁音檔資訊卡重新建立文字層級：曲目名稱使用目前調色盤主色、字體加大並保留粗體；其餘卡片文字統一一般字重。',
    '首頁「按讚數」文字改為與左側「心得數」完全相同的文字顏色，淺色與深色模式都同步；愛心圖示仍保留原本已按讚主色效果。',
    'PWA 持續採靜默更新：新版 Service Worker 在背景更新，不主動彈出版本提示或強制重新整理，以避免打斷正在播放的音檔。'
  ],
  removed: [
    '停止使用舊版 /share/t-* 分享網址，統一改用新的固定可讀分享網址。',
    '移除上傳／編輯音檔頁面直接新增、修改、刪除分類標籤的入口，避免分類來源分裂。',
    '移除音檔資訊卡除曲目名稱以外的粗體字重，讓主題名稱成為唯一主要視覺焦點。'
  ]
};

export const STICKER_PAGES_RELEASE_NOTES: ChangelogEntry = {
  version: 'v4.0', date: '2026/10/06',
  summary: '貼紙簿與個人中心改為完整頁面，新增完善資料與好手氣獎勵、全站貼紙提示、上手名單管理及播放清單排序。',
  added: ['全站貼紙增加以紅字、減少以綠字提示，顯示在操作位置上方，時間可在其他規則調整。', '完善個人資料可領一次貼紙；未填完整提醒的文字、秒數及獎勵可自訂。', '好手氣抽中尚未聽完的錄音，當日完成可領額外貼紙；提示文字、秒數、張數與每日上限可自訂。', '後台新增上手名單，支援新增、編輯、多選合併與刪除，連動會員欄位。'],
  modified: ['我的貼紙簿、個人中心與iOS安裝教學改為完整頁面，支援返回導覽。', '選單僅貼紙數字保持大字，其餘文字與其他選項一致；貼紙明細改負綠正紅、小字且不粗體。', '上手白金、上手鑽石分開顯示；推薦人取消自動關聯詞。', '已購買錄音優先排序；新增貼紙成本低至高／心得獎勵高至低排序，移除獎銜篩選並移動時間按鈕。', '未開始收聽的照片顯示寫心得獎勵，正紅負綠，字體與權限一致。', '貼紙清單獨立載入並保留快取，管理分頁與補發結算不再阻擋首屏。'],
  removed: ['移除我的貼紙與個人中心的彈出視窗呈現。']
};

export const RANK_STICKER_RELEASE_NOTES: ChangelogEntry = {
  version: 'v4.1', date: '2026/10/06',
  summary: '新增白金以上獎銜審核貼紙獎勵、下線貼紙轉贈扣款，並調整首頁貼紙文案與召喚繁星解答提示。',
  added: [
    '白金以上會員獎銜審核通過會自動獲得貼紙：預設白金為50張基礎×2倍＝100張、翡翠以上300張、鑽石以上500張；既有符合會員會一次補發目前最高符合級別。',
    '超級管理員可在「我的貼紙＞其他規則」修改白金基礎張數、白金倍數、翡翠與鑽石獎勵張數；同級別永久只發一次，降級不會重複領低級獎勵。',
    '白金以上會員人工加貼紙給自己的下線時，改為從本人貼紙餘額扣除；餘額不足不能發放。超級管理員的管理發放不扣本人貼紙。'
  ],
  modified: [
    '首頁封面貼紙字樣統一：只有+張數使用紅字、-張數使用綠字，「張貼紙」固定白字；收聽進度移除多餘空格並完整顯示，不再用省略號。',
    '封面進度改為「[已聽x%]聽完+x張貼紙」；100%但尚未取得心得獎勵顯示「寫心得+x張貼紙」，真正取得後才顯示「已發+x張貼紙」。',
    '「好手氣」改名「💫召喚繁星解答」；抽中的宇宙答案固定顯示在中獎卡片上方，點畫面任意位置才關閉。'
  ],
  removed: [
    '移除「其他規則」中的好手氣提示秒數；宇宙答案不再依秒數自動消失。'
  ]
};


export const COUPLE_UPLINE_RELEASE_NOTES: ChangelogEntry = {
  version: 'v4.2', date: '2026/10/07', isLatest: true,
  summary: '首頁與後台操作再優化，新增夫妻共同直銷商編號與共用下線邀請網址，同時保留兩人的個人資料與貼紙紀錄完全獨立。',
  added: [
    '「我的貼紙＞人工加貼紙」新增「綁定成為我下線」：白金以上可複製專屬網址或透過 LINE／其他 APP 分享；網址尾端直接使用直銷商編號。',
    '輸入已被另一位會員使用的直銷商編號時，會詢問是否與該會員綁定夫妻關係；單方確認即可成立。夫妻共同顯示名稱使用半型 &，例如 A&B。',
    '夫妻共用同一個直銷商編號、同一套下線組織與同一條下線邀請網址；邀請層級依夫妻兩人已審核的最高獎銜，自動設定接收會員的上手白金或上手鑽石。'
  ],
  modified: [
    '個人中心修改姓名時仍只填本人姓名；儲存後檢視基本資料時才顯示 A&B。任何一方日後改名，下線資料中的共同名稱會自動同步。',
    '夫妻兩人的貼紙餘額、貼紙交易、播放進度、心得、按讚、評價、通知及其他個人行為紀錄全部維持各自獨立，不因夫妻關係合併。',
    '首頁封面上下權限與貼紙文字只恢復到前一版的 7／8px 字體大小；召喚繁星解答按下即立即開始動畫；後台管理改為整頁呈現。'
  ],
  removed: [
    '後台管理不再以覆蓋首頁的彈出視窗呈現。'
  ]
};

const RELEASE_NOTES = [COUPLE_UPLINE_RELEASE_NOTES, RANK_STICKER_RELEASE_NOTES, STICKER_PAGES_RELEASE_NOTES, HEALTHCHECK_RELEASE_NOTES, CUMULATIVE_RELEASE_NOTES];

const runtime = window as Window &
  typeof globalThis & {
    __ECHOSTARS_CHANGELOG_RELEASE_PATCH__?: boolean;
  };

const unique = (items: string[]) => [...new Set(items.filter(Boolean))];

const mergeOneRelease = (list: ChangelogEntry[], release: ChangelogEntry): ChangelogEntry[] => {
  const existing = list.find(item => item.version === release.version);
  const rest = list.filter(item => item.version !== release.version);
  const merged: ChangelogEntry = existing
    ? {
        ...release,
        ...existing,
        version: release.version,
        date: existing.date || release.date,
        summary: existing.summary || release.summary,
        added: unique([...(release.added || []), ...(existing.added || [])]),
        modified: unique([...(release.modified || []), ...(existing.modified || [])]),
        removed: unique([...(release.removed || []), ...(existing.removed || [])]),
        isLatest: release.isLatest === true
      }
    : release;
  return [merged, ...rest.map(item => ({ ...item, isLatest: false }))];
};

const mergeRelease = (data: unknown): ChangelogEntry[] => {
  let list = Array.isArray(data)
    ? data.filter(item => item && typeof item === 'object') as ChangelogEntry[]
    : [];
  for (const release of [...RELEASE_NOTES].reverse()) {
    list = mergeOneRelease(list, release);
  }
  return list;
};

const isChangelogGet = (
  input: Parameters<typeof fetch>[0],
  init?: Parameters<typeof fetch>[1]
) => {
  const method = String(init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase();
  if (method !== 'GET') return false;

  try {
    const rawUrl = input instanceof Request ? input.url : String(input);
    const url = new URL(rawUrl, window.location.origin);
    return url.origin === window.location.origin && url.pathname === '/api/changelog';
  } catch {
    return false;
  }
};

if (!runtime.__ECHOSTARS_CHANGELOG_RELEASE_PATCH__) {
  runtime.__ECHOSTARS_CHANGELOG_RELEASE_PATCH__ = true;
  const nativeFetch = window.fetch.bind(window);

  window.fetch = (async (...args: Parameters<typeof fetch>) => {
    const [input, init] = args;
    if (!isChangelogGet(input, init)) return nativeFetch(...args);

    try {
      const response = await nativeFetch(...args);
      if (!response.ok) {
        return new Response(JSON.stringify(mergeRelease([])), {
          status: 200,
          headers: { 'Content-Type': 'application/json; charset=utf-8' }
        });
      }

      const data = await response.clone().json().catch(() => []);
      const headers = new Headers(response.headers);
      headers.set('Content-Type', 'application/json; charset=utf-8');
      headers.delete('Content-Length');
      headers.delete('Content-Encoding');

      return new Response(JSON.stringify(mergeRelease(data)), {
        status: response.status,
        statusText: response.statusText,
        headers
      });
    } catch {
      return new Response(JSON.stringify(mergeRelease([])), {
        status: 200,
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      });
    }
  }) as typeof window.fetch;
}
