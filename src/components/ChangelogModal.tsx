import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Sparkles,
  PlusCircle,
  RefreshCw,
  Trash2,
  Calendar,
  ShieldCheck,
  Database,
  Edit3,
  Check,
  Plus,
  Save,
  RotateCcw,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { UserProfile } from '../types';

export interface VersionLog {
  version: string;
  date: string;
  isLatest?: boolean;
  summary: string;
  added: string[];
  modified: string[];
  removed: string[];
}

const sanitizeChangelogText = (value: unknown) =>
  String(value ?? '')
    .replaceAll('聲藏講堂', '繁星回聲')
    .replaceAll('聲 藏 講 堂', '繁星回聲')
    .replaceAll('繁星的回聲', '繁星回聲')
    .replaceAll('繁星中心', '直銷商中心')
    .replaceAll('非繁星體系', '非寰宇體系');

const sanitizeVersionLog = (log: VersionLog): VersionLog => ({
  ...log,
  summary: sanitizeChangelogText(log.summary),
  added: (log.added || []).map(sanitizeChangelogText),
  modified: (log.modified || []).map(sanitizeChangelogText),
  removed: (log.removed || []).map(sanitizeChangelogText)
});

export const DEFAULT_CHANGELOG_DATA: VersionLog[] = [
  {
    version: 'v3.8', date: '2026/10/06', isLatest: true,
    summary: '我的貼紙簿與心得獎勵更新。',
    added: ['先留言後聽完可自動補發貼紙。', '回覆他人心得與按讚他人心得獎勵，並可設定同篇心得總上限。', '白金以上可於人工加貼紙分頁搜尋自己的下線，查看完整發放紀錄。'],
    modified: ['貼紙簿改為上方固定位置、來源可直接跳轉，並採用網站主視覺確認解鎖。', '批次修改支援全選與取消全選，解鎖貼紙範圍擴為 0 至 50 張。', '其他規則改為數字輸入；關鍵字獎勵上限以張計算。'],
    removed: []
  },
  {
    version: 'v3.7',
    date: '2026/10/02',
    isLatest: false,
    summary: '修復跨平台 PWA 安裝入口並固定顯示，精簡首頁排序列且確保直式小螢幕完整顯示所有排序／篩選按鈕；本次修改只使用瀏覽器本機能力，不新增 Cloudflare D1、KV、R2 寫入。',
    added: [
      '漢堡選單中的「安裝到桌面」改為永久固定顯示，不論裝置是否已安裝、瀏覽器是否提供 beforeinstallprompt 都不再隱藏。',
      '「安裝到桌面」改為真正的一鍵原生 PWA 安裝入口：Android 與桌面 Chromium 支援時按一下即呼叫系統安裝視窗；Manifest 強化獨立 App 啟動、已安裝偵測與單一既有視窗重用。'
    ],
    modified: [
      '已安裝的裝置仍保留「安裝到桌面」入口並直接顯示「已安裝」；移除重新安裝與平台手動設定教學。',
      '首頁排序與篩選列由六欄改為五欄：時間、評價、心得、獎銜、分類；直式小螢幕同樣全部顯示，不隱藏任何按鈕。',
      '修復部分手機直式畫面只顯示獎銜／分類、排序按鈕消失的問題；時間／評價／心得／獎銜／分類五個控制項統一改用相同的 Grid cell 包裝，避免直式瀏覽器只保留下拉選單。',
      '依手機實機截圖再修正排序列左右裁切：移除 100dvw、left:50% 與 translateX(-50%) 的滿版置中技巧，手機直式改為跟首頁內容容器同寬，五個按鈕完整保留在畫面內。',
      '恢復手機直式排序方向箭頭顯示，並將五個排序／篩選方框之間、文字左右與文字／箭頭間距縮到最小，保留五欄等寬與可點擊高度。',
      '修復五星評價重複點擊同星級會送出 0 分、導致單一評價音檔平均自動歸零的問題；前端改為只送 1～5 星，後端對舊快取送來的 0 分改為忽略。',
      '沒有閱讀權限或私秘VIP尚未解鎖的錄音檔禁止送出評價；首頁播放清單該音檔小卡的方框內全部圖片、文字與互動資訊統一淡化顯示，詳細頁評價星星同步停用。',
      '無閱讀權限音檔小卡由 50% 再淡化為 25% 可見度；首頁新增「權限」與「按讚」排序，手機直式小螢幕隱藏「評價」與「按讚」排序，橫式及較大螢幕則完整顯示七個控制項。',
      '隨機訪客名稱改為只使用正面形容詞，舊裝置若曾保存負面形容詞會在本機自動換成正面詞且保留原 deviceId；首頁排序方向箭頭放大；網友關鍵字交叉篩選移除說明小字與 #／勾選符號，縮小標籤間距與內距，選取前後維持相同尺寸與排列。',
      '首頁播放清單預設改為「權限優先、時間其次」排序，同權限內以較新音檔優先；排序按鈕順序改為權限、時間、評價、心得、按讚、獎銜、分類。浮動播放器時間強制單行，講者與獎銜直接相連不加分隔符號；首頁「網友關鍵字」移除已選組數與交集比對標題，清除按鈕改為「清除條件」。',
      '首頁播放清單預設排序方向明確改為「1 權限：公開到高階獎銜／私秘VIP；2 時間：同權限內由新到舊」，確保公開內容先顯示，再逐級排列較高閱讀門檻。',
      '訪客暱稱改為每次重新整理都重新隨機正面形容詞＋動物名稱，但保留原 deviceId；首頁調色盤擴充更多青綠、靛藍、金橙、酒紅、鈷藍、紫羅蘭等色系；左上麥克風音波與外圈動畫全部跟隨目前主色。新增第一張音檔照片新手提示「按照片可播放或暫停」，並提供本機「永遠不再顯示此提示」選項。',
      '首頁新手教學統一加入聚光燈效果：教學顯示時整頁以深色半透明遮罩淡化，只保留對話框、箭頭與目前指向的 Logo／第一張音檔照片清楚可見；兩個教學依序顯示避免重疊，checkbox 文案統一為「永遠不再提醒」。',
      'PWA 更新流程改為偵測新版 Service Worker 後詢問「是否現在自動更新」，確認後立即切換新版並重新開啟；安裝後以 standalone App 模式啟動，不顯示一般瀏覽器網址列。',
      '依實機回報回復今天下午已成功產生 App 的 PWA 核心：Manifest 還原為簡潔 standalone 結構、Service Worker 恢復立即 skipWaiting／clients.claim，移除 related_applications、launch_handler、getInstalledRelatedApps 與 1.5 秒等待閘門；並在 React 載入前提前保存原生 beforeinstallprompt，避免錯過系統安裝事件。',
      '再修正「安裝到桌面」按下無反應：移除會殘留的舊 localStorage 已安裝判斷，改以 standalone 與 Chromium 已安裝 PWA 自我偵測判斷；已安裝顯示「已安裝」，可安裝顯示「可安裝」。若原生安裝事件尚未就緒，按鈕會開啟精簡準備視窗並重新確認 Service Worker，不再無聲返回。',
      '桌機與橫式行動裝置在主選單不使用漢堡選單時，直接顯示「安裝到桌面」。首頁新手教學改為 Logo、訪客、第一張音檔照片三個焦點同時顯示，新增「註冊會員紀錄學習進度」提示；三個提示框錯開、整頁遮罩加深，並共用畫面中央唯一一組「永遠不再提醒」與「知道了」。',
      '依手機、平板、桌機實機畫面重新美化三個新手提示：提示框縮窄並允許自然換行，改為貼近各自目標物的鄰近定位；箭頭縮小、線條變細並只走最短距離，移除跨越整個螢幕的長箭頭；三個提示框加入碰撞避讓與目標白色描邊。',
      '新手教學再次統一：三個說明框不論裝置皆固定顯示在目標右下角，箭頭改為固定短距離且箭頭尖端放大兩倍；Logo 文案改「按此回首頁」，會員文案改「按此註冊會員，可紀錄學習進度」。共用 checkbox 放大兩倍並改「打勾不再提醒」，手機會避開第一張照片。調色盤改為 24 種跨紅橙黃綠青藍靛紫粉棕灰的明顯不同色系，主選單按鈕亦再放大一級。',
      '會員新手教學文案擴充為「按此註冊會員，可紀錄學習進度，跨裝置播放進度記憶，更多神秘有趣功能等你發現！」；繁星回聲 Logo 教學改為 Logo 與文字框水平置中、短箭頭垂直往下，避免互相遮擋。首頁搜尋框與搜尋按鈕之間的空隙改為 1px，與排序列「權限／時間」之間的 1px 間距一致。',
      '依實機截圖修正首頁控制列間距方向：搜尋框／搜尋按鈕恢復 8px，排序／篩選按鈕彼此也統一為 8px。詳細頁五星取消負間距避免星星重疊；網友關鍵字移除所有可見 # 符號。主選單姓名／身份取消粉紅底色，繁星回聲新增跟隨主色的慢速呼吸光暈，桌機與手機常駐按鈕水平間距同步縮緊。',
      'PWA 版本更新改為完全靜默：移除「繁星回聲有新版本，是否現在重新開啟套用更新？」確認視窗；新 Service Worker 仍會在背景下載與啟用，但不彈窗、不強制重新整理、不打斷播放，於下次自然重新整理或重新開啟時套用新版。',
      '修復 iPad／iPhone 點「安裝到桌面」永久停在「正在準備系統安裝…」：iOS/iPadOS 不再等待不會出現的 beforeinstallprompt，改為立即顯示兩步「分享 → 加入主畫面」精簡提示；standalone 開啟時仍自動顯示已安裝。Android／桌面 Chromium 的原生一鍵安裝流程維持不變。',
      'iOS／iPadOS 安裝教學重新排版：教學視窗限制在 100dvh 可視範圍、上下保留 safe-area，標題與「知道了」固定可見，中間步驟可獨立捲動，避免 iPad Safari 工具列造成上緣截斷。教學擴充為 6 步，包含分享、加入主畫面、找不到選項時的處理、確認名稱、加入與從主畫面開啟。',
      '再依 iPad Safari 實機修正教學上緣仍被遮擋：不再使用垂直置中 my-auto／單純 100dvh，改讀取 window.visualViewport 的實際 offsetTop 與 height，教學框固定在 Safari 真正可視區域內；標題、關閉鍵與「知道了」保持可見，只有中間步驟區捲動。',
      'iOS／iPadOS 安裝教學由 6 步精簡為 2 步。Safari 顯示「分享 → 加入主畫面」；另新增 iOS 瀏覽器辨識，若偵測到 Chrome／Edge／Firefox，改顯示「請使用 Safari 安裝」，避免誤導成 Android 式一鍵安裝。',
      '依 iPad Safari 實機畫面再次精簡安裝教學：移除 h-full 全高視窗，改為內容高度自適應、只有超出可視範圍才捲動；字體放大，加入分享／檢視較多／加入主畫面的圖示流程；第 2 步改為實際路徑「檢視較多 → 加入主畫面 → 加入」，若已直接看到加入主畫面則可直接點。',
      '修復詳細音檔「分享錄音」在只開啟詳細頁、尚未開始播放時無反應：分享視窗改用目前詳細音檔優先，不再依賴 currentTrack。新增瀏覽器 History API 站內導覽：桌機上一頁可由詳細頁／排行榜／通知回到前一個站內畫面；手機與 standalone App 在首頁加入安全歷史層，上一頁不再直接退出 App 或離開／關閉分頁。',
      '音檔上傳新增內嵌封面擷取：支援常見 MP3 ID3 APIC 與 M4A/MP4 covr 封面，瀏覽器本機抽出圖片後沿用既有 cover/ R2 上傳與「演講人名字＋同名數字遞增」命名規則。封面縮圖庫新增「重新整理」按鈕，可手動重新 List R2，同步新增與已刪除圖片。為節省 Cloudflare Free 用量，圖庫採單一瀏覽器 session 快取；成功上傳封面後只在前端／session 快取局部加入，不額外再掃一次 R2。',
      '後台「分類標籤」新增排序功能：手機長按拖曳把手、桌機按住拖曳即可改變分類先後順序；只有放開時才送出一次排序寫入，避免移動過程重複寫 D1。排序成功後立即同步首頁播放清單「分類」下拉選單；「全部」固定在最上方，其餘依後台順序顯示。',
      '分類排序補強：手機長按約 420ms 才啟動，長按前滑動可正常捲動；取消手勢不儲存；修復桌機項目移動後放開未儲存的問題。排序 API 嚴格檢查完整分類清單、重複與未知項目，儲存失敗會提示並還原順序。',
      '修復所有音檔標題、排行榜及浮動播放器的詳細頁導覽，統一定位播放時間軸；通知跳轉心得會等待該音檔留言載入，不再用延遲計時器干擾其他頁面。',
      '修復音檔編輯後詳細頁仍顯示舊資料：首頁、詳細頁、播放器與預覽同步使用最新音檔。清空演講日期、系列與集數會保留空白；編輯其他欄位不改動既有獎銜。',
      '補強儲存一致性：失敗保留編輯草稿並顯示錯誤，封面上傳失敗不再假裝成功；修正批次會員修改與 VIP 資料保存，分類改名／刪除即時同步，關鍵字與 VIP 重置移除重複寫入。PWA 快取更新至 v32。',
      '網友關鍵字新增建立者權限：本人可編輯或刪除，超級管理員可管理全部；關鍵字依使用頻率與新增時間排序，提供完整曾用字與即時輸入篩選。舊關鍵字無建立者紀錄，僅超級管理員可管理。',
      '首頁寬螢幕／橫向播放清單改為雙欄，心得與按讚置於評價上方；詳細頁照片可播放暫停，新增 2.3 倍速並跟隨調色盤。心得上限增為 2000 字，修復個人中心評價與心得統計。PWA 快取 v33。',
      'PWA 安裝與說明流程完全在瀏覽器端完成，不呼叫網站 API，不增加 Workers、D1、KV 或 R2 寫入。'
    ],
    removed: [
      '移除首頁「講者」排序按鈕。',
      '移除「只有瀏覽器提供原生安裝事件才顯示安裝按鈕」的限制。',
      '移除「安裝到桌面」的多步驟平台手動設定教學視窗。'
    ]
  },
  {
    version: 'v3.6',
    date: '2026/10/02',
    isLatest: false,
    summary: '以零新增 Cloudflare 寫入為原則完成首頁播放卡、迷你播放器、詳細頁照片框、排序篩選列、後台音檔編輯層級與 PWA 安裝入口優化。',
    added: [
      '迷你播放器照片中央新增常駐半透明播放／暫停圖示，照片本身仍可直接控制播放。',
      '右上角漢堡選單使用瀏覽器原生 PWA 安裝提示；只有裝置與瀏覽器支援直接安裝時才顯示「安裝到桌面」。'
    ],
    modified: [
      '首頁音檔照片移除中央半透明播放按鈕，但整張照片仍可點擊播放／暫停。',
      '手機小螢幕的照片權限黑色半透明底框縮至符合文字高度。',
      '首頁音檔資訊卡的標題、講者、分類、時長與互動區行距全面收緊。',
      '首頁分類標籤改用等距內距與 box-sizing，避免右側框線壓到最後一個字。',
      '迷你播放器講者照片放大，外框色改為跟隨網站目前隨機調色盤主色。',
      '詳細音檔頁講者照片外框色改為跟隨網站目前隨機調色盤主色。',
      '首頁四個排序＋獎銜＋分類共六個控制項：直式小螢幕使用完整 viewport 寬度，橫式與桌機則與音檔卡容器同寬。',
      '後台音檔編輯視窗提高專用層級，確保顯示在後台管理視窗上方。',
      'PWA 安裝按鈕移除不可安裝時的停用說明狀態，避免出現無效操作。'
    ],
    removed: [
      '移除首頁音檔照片中央可見的半透明播放圖示。',
      '移除迷你播放器與詳細頁講者照片固定紅色外框。'
    ]
  },
  {
    version: 'v3.5',
    date: '2026/10/02',
    isLatest: false,
    summary: '以節省 Cloudflare 免費額度為優先，修正首頁播放與篩選體驗、權限提示、學習紀錄同步、管理介面與音檔上傳／R2 演講者照片流程。',
    added: [
      '浮動播放器右側新增縮小版「回頂」與「返回首頁清單」按鈕，避免小螢幕超出視窗。',
      '個人中心學習進度新增「清除紀錄」，一次清除 D1 雲端學習紀錄、本機已聽進度並同步排行榜會員播放計數。',
      '演講者照片庫新增本機搜尋與關聯字快速選擇，並加入 10 分鐘 session 快取，降低 R2 清單 API 重複請求。',
      '照片支援桌機拖曳上傳；R2 新照片固定以演講者名字命名，同名時自動加數字編號且不覆蓋舊檔。'
    ],
    modified: [
      '權限不足提示改為顯示在使用者剛按下的播放按鈕附近。',
      '首頁下拉篩選提高堆疊層級，避免被音檔卡片遮住；時間排序改以音檔上傳時間數值排序，新音檔保存精確上傳時間。',
      '首頁排序與篩選列：手機直向使用螢幕最大寬度置中，橫向與桌機維持與音檔資訊卡同寬。',
      '管理員與超級管理員可刪除訪客心得，後端同時驗證刪除權限。',
      '我的個人學習卡改用與其他會員學習檔案卡完全相同的匯出版型。',
      '全站中心稱呼統一為「直銷商中心」，體系外身分統一為「非寰宇體系」。',
      '後台數據中心、權限表、分類標籤標題保留但移除冗長說明；網友關鍵字管理區移除標題與備註，只保留搜尋框。',
      '音檔上傳分類標籤修改／刪除補齊後端 API，並直接使用回傳結果更新畫面，避免修改後再多做一次 D1 讀取。',
      '音檔瀏覽權限精簡為公開、3%、9%、15%、銀章、白金級、翡翠級、鑽石級，仍依個人基本資料獎銜順序判斷以上權限。',
      '演講者照片庫縮小顯示，編輯音檔時可直接改選 R2 中其他演講者照片。'
    ],
    removed: [
      '移除全站殘留的舊品牌文字，網站名稱全面統一為「繁星回聲」。',
      '移除後台指定區塊的長篇功能說明文字與網友關鍵字管理標題。'
    ]
  },
  {
    version: 'v3.4',
    date: '2026/10/02',
    isLatest: false,
    summary: '統一權限提示、首頁小卡與篩選排版、全站品牌名稱與匯出圖卡，並優化詳細音檔頁播放器、演講資訊與訪客暱稱同步。',
    added: [
      '詳細音檔播放器新增倒退 30 秒與快轉 30 秒按鈕，並放大 10／30 秒數字字體，提高行動裝置操作辨識度。',
      '詳細演講資訊空白欄位統一顯示「未填寫」，演講日期與上傳日期統一為 X年X月X日。'
    ],
    modified: [
      '私密VIP未授權提示改用與 9% 等一般權限相同的網站內建權限視窗，不再使用瀏覽器原生 alert。',
      '首頁音檔小卡的三個分類標籤改為依文字長度緊密包覆邊框，維持同一行顯示。',
      '首頁排序與篩選控制列強制使用整個螢幕可用寬度，六個按鈕維持等寬。',
      '桌機與橫向行動裝置的評價、心得、按讚自動排成同一行；直向窄螢幕維持分行以避免擁擠。',
      '全站網站名稱統一為「繁星回聲」，包含瀏覽器標題、PWA、分享 metadata、頁尾與所有匯出圖片／PDF。',
      '詳細音檔頁將播放器與演講資訊欄位置互換。',
      '首頁主選單訪客暱稱改為與心得收穫使用相同 visitor identity，並移除暱稱下方權限文字的括號。'
    ],
    removed: [
      '移除私密VIP權限提示使用的瀏覽器原生 alert 視窗。',
      '移除舊網站名稱與會員名冊匯出中的 ECHO 後綴。'
    ]
  },
  {
    version: 'v3.3',
    date: '2026/10/02',
    isLatest: false,
    summary: '以 Cloudflare 免費額度為第一優先完成首頁載入與播放同步架構瘦身，同時修正音檔真實時長、首頁分類／權限／篩選排版，讓預估每週 500 人使用時保留更大的免費額度餘裕。',
    added: [
      '首頁播放清單新增本機快取：再次返回首頁時先立即顯示最近音檔與分類，再於需要時背景更新，降低等待時間與重複 Workers／D1 讀取。',
      '新上傳音檔在瀏覽器本機直接讀取真實音訊長度，不額外呼叫 Cloudflare；既有錯誤的「約 10 分鐘」資料由超級管理員一次性背景讀取音訊 metadata 並逐筆修正。',
      '登入會員播放進度採低頻跨裝置同步；未登入訪客以本機 localStorage 保存進度，不再為訪客產生 D1 播放進度讀寫。',
      '音訊上傳與 R2 串流正式支援 MP3、M4A、AAC、WAV、OGG、OPUS、WEBM 七種格式，並依副檔名回傳正確 MIME 類型。'
    ],
    modified: [
      '播放進度的雲端同步由每 15 秒降低為最多每 60 秒一次，暫停／播放結束時再補一次；本機續播進度仍即時保存。',
      '首頁初次與返回載入流程改為「音檔優先」：不再等待完整會員名單、全站心得與播放歷史才顯示播放清單。',
      '會員完整名單與全站心得改為進入排行榜、通知、後台、個人中心或心得預覽等真正需要的畫面時才載入。',
      '登入會員基本資料背景刷新加入 10 分鐘節流，首頁不再每次載入整份會員名單。',
      '分類更新只重新讀取分類，不再連帶重抓整份音檔；新增、修改、刪除心得後以本機狀態更新，不再立即重抓全部心得。',
      '播放次數統計改為每次開始播放時記錄一次，移除播放進度同步時重複增加會員播放次數的 D1 寫入。',
      '首頁三個分類標籤固定同一列、等寬顯示，不換行。',
      '首頁權限文字移入人物照片底部；公開與非公開皆使用黃色文字與陰影，非公開另顯示鎖頭。',
      '首頁時長以真實 durationSeconds 計算「約 X 分鐘」，不再固定顯示 10 分鐘。',
      '首頁四個排序按鈕＋獎銜＋分類共六個控制項改為等寬滿版，強制使用螢幕左右最大可用寬度。',
      '網頁底部驚嘆號頁持續彙整 v3.3 與所有過往版本紀錄。'
    ],
    removed: [
      '移除首頁載入時不必要的完整會員名單與全站心得請求。',
      '移除訪客播放進度寫入 D1，以及心得操作完成後的重複全站心得重新下載。',
      '移除播放進度 checkpoint 中額外更新會員 playCount 的重複 D1 寫入。'
    ]
  },
  {
    version: 'v3.2',
    date: '2026/10/02',
    isLatest: false,
    summary: '首頁播放清單版面再優化，播放操作回歸人物封面中央，權限與時長資訊移至封面下方，互動按鈕全面放大；並將歷次改版完整彙整於網頁底部驚嘆號頁面。',
    added: [
      '人物照片頭像正中央新增半透明播放／暫停按鈕，保留點擊照片中央即可直接控制播放的直覺操作。',
      '人物照片下方新增錄音檔權限文字；非公開權限顯示鎖頭圖示＋黃色權限文字與陰影，公開音檔則以低調文字顯示。'
    ],
    modified: [
      '「約 X 分鐘」錄音長度移到人物照片下方顯示，與權限資訊集中於左側照片區。',
      '已聽進度維持在人物照片頂端，字體自動縮小並強制單行顯示。',
      '首頁播放清單中的評價、心得、按讚三組互動控制全面放大，提高手機與桌機點擊辨識度。',
      '音檔資訊卡右側內容取消額外右內距，文字與操作區可完整利用卡片寬度。',
      '驚嘆號改版頁改為自動依版本號判斷最新版本，不再寫死特定版本；伺服器已保存的歷史紀錄與程式內建紀錄會安全合併並保留。'
    ],
    removed: [
      '刪除音檔資訊區右側獨立的播放按鈕。',
      '刪除音檔資訊區內獨立的瀏覽權限標籤，改由人物照片下方統一顯示。'
    ]
  },
  {
    version: 'v3.1',
    date: '2026/10/02',
    isLatest: false,
    summary: '雲端儲存與資料安全修復、R2 封面圖庫、新手教學偏好、關鍵字資料防毀損，以及首頁卡片與全站「心得」用詞統一。',
    added: [
      'R2 cover/ 封面圖庫快速選擇：上傳音檔時可直接選用既有演講者照片並自動帶入姓名。',
      '首頁新手教學新增「永遠不再提醒！」選項，同一瀏覽器可永久記住偏好。',
      '針對舊版關鍵字更新造成的「無標題／未知講者／封面消失」受損資料，加入依 R2 音檔檔名與 cover/ 圖庫自動回補機制。'
    ],
    modified: [
      '播放進度改由 D1 保存，不再重複寫入 Workers KV；前端每 15 秒 checkpoint 最多同步一次，避免 KV Writes 大量消耗。',
      'KV 額度耗盡時不再阻斷音檔 R2 上傳，音檔流水號改以 D1 與 KV 現有值共同判斷。',
      '新上傳封面固定使用 cover-演講者名稱.副檔名，不再附加 timestamp 與亂碼；同名封面可直接更新。',
      '音檔通用更新 API 改成真正 partial update，只更新實際傳入欄位，並回傳資料庫完整音檔資料。',
      '關鍵字新增／修改／刪除後不再重複呼叫通用 PUT；前端同步改為合併資料，避免不完整回應覆蓋整筆音檔。',
      '首頁錄音卡改成左側大封面、右側文字與操作；評價人數格式統一為「評分 (人數)」。',
      '全站「留言板」顯示文字統一為「心得收穫」，「留言」統一為「心得」。'
    ],
    removed: [
      '移除首頁「按讚排序」按鈕。',
      '移除播放進度對 Workers KV 的重複寫入。'
    ]
  },
{"version":"v3.0","date":"2026/10/02","isLatest":false,"summary":"彙整 v3.0 與追加更新：R2 檔案管理、會員權限、首頁單列篩選與空白簡介。","added":["浮動播放器可拖曳移動；置頂箭頭位於左側，點擊音檔資訊直達詳細頁時間軸；新增首頁教學。","真正保存離線音檔，完成超過95%或15天未聽自動清除。","分享連結提供音檔封面預覽。"],"modified":["手機首頁評價、心得、按讚固定單列，縮減星星按鈕寬度並保留44px觸控高度。","首頁獎銜篩選隱藏GAR與創辦人選項；選擇一般獎銜會包含同級創辦人獎銜，GAR音檔依原本規則納入對應獎銜。","新上傳封面存放 R2 cover/；刪除錄音同步刪除專屬音訊物件，保留封面。","修復會員貢獻者、獎銜審核員與封鎖設定；加入失敗提示。","首頁固定單列：時間、評價、心得、按讚、講者、獎銜、分類。","每次進入網站顯示教學；簡介未填寫時維持空白。","統一視窗頂端標題與儲存操作、配色下拉選單，縮短會員分頁。","修復正式站關鍵字與獎銜審核；心得僅作者可修改，姓名與獎銜同步。","學習卡同步評分、心得與生命靈數資料。","調整首頁密度、搜尋建議、評價人數、篩選選單及排行日期。","九宮格天賦圈亮綠，星座與命數排版一致。"],"removed":["底部長條播放器與三態控制、工具列安裝按鈕、安裝說明彈窗。","AI Studio 範例資料與未使用預設關鍵字；分享重複網址。"]},
{"version":"v2.9","date":"2026/10/01","summary":"正式站資料持久化與手機版修復。","added":["PWA 安裝基礎、會員資料保存與 Google 頭像同步。"],"modified":["正式站按讚、評價、心得 API；愛心狀態同步。","手機字體、觸控按鈕與 SVG 九宮格圈線。","延遲載入大型管理與匯出功能。"],"removed":["主選單三倍字體按鈕；網頁翻譯提示。"]},
  {
    version: 'v2.8',
    date: '2026/10/01',
    isLatest: false,
    summary: 'Cloudflare 邊緣雲端全面整合（D1 資料庫、R2 音訊直傳、KV 播放記憶）、音檔詳細頁全方位體驗升級（匯出圖卡相容修復、五星評價緊湊即時響應、心得圖示化）、分享錄音小螢幕防遮擋與訪客文案去暱稱化、播放器緊實化、個人圖卡隱私個資防護（去生日與電話）、多組網友關鍵字交叉複合搜尋、首頁與詳細頁左下角浮動回頂按鈕，以及高解析度手機字體 3 倍放大適配。',
    added: [
      'Cloudflare 邊緣雲端原生整合：打通 D1 SQLite 關聯資料庫持久化、R2 物件儲存桶直傳串流、KV 分散式播放秒數記憶。',
      '首頁與音檔詳細頁左下角新增「半透明浮動回頂按鈕」，點擊平滑滑動至最上方。',
      '首頁搜尋支援「多組網友關鍵字交叉複合搜尋」：可同時點選或組合多個網友標籤進行交集篩選，並即時以標籤膠囊顯示與一鍵清除。',
      '超高解析度手機（如 1272×2800 等旗艦機型）字體調節：提供頂部字體縮放切換器（支援最高 3 倍放大），大螢幕長者與夥伴閱讀輕鬆不吃力。',
      '音檔圖卡一鍵匯出：支援登入會員與訪客皆可無障礙一鍵產生該音檔專屬知識圖卡。'
    ],
    modified: [
      '音檔詳細頁五星評價升級：星星左右排列極致緊密，評價點選立即樂觀更新並同步持久化。',
      '音檔詳細頁心得數顯示優化：刪除「則心得」中文字樣，改為「icon+數字」，圖標尺寸放大與愛心、星星一致。',
      '「分享錄音」小螢幕視窗優化：右上角關閉 X 按鈕置頂不被內容推擠，底部增設關閉按鈕；未登入訪客取消暱稱輸入框，文案自動呈現俐落自然的推薦語。',
      '播放器精實化調整：倍速按鈕字體縮小，上下垂直間距與控制行距大幅收緊，節省畫面高度。',
      '隱私個資安全強化：個人學員檔案卡與明細圖卡匯出全面隱藏「聯絡電話」與「西元生日」，保護夥伴個人資訊。',
      'Google 登入流程優化：修正 client_id 401 授權錯誤，增設一鍵直達信箱授權與專屬客戶端配置，避免被 Google OAuth 封鎖。'
    ],
    removed: [
      '刪除首頁左下角常駐浮動的驚嘆號按鈕，改版歷程紀錄統一整併於網頁最底部之驚嘆號入口。',
      '刪除未登入訪客分享錄音時的「請輸入您的暱稱」輸入框。',
      '刪除圖卡匯出項目中的「聯絡電話」與「西元生日」個資欄位。'
    ]
  },
  {
    version: 'v2.7',
    date: '2026/09/30',
    isLatest: false,
    summary: '首頁版面空間大釋放（刪除大框線與上傳鈕、多組關鍵字與網友關鍵字搜尋）、音檔詳細頁動線再優化（分享錄音與匯出圖卡移至心得收穫上方、參考資料移至備註上方、緊湊評價心得、放大快轉倒退、上傳者顯示、跳轉後台全功能編輯）、通知頁快速回覆/跳轉自動消失強化、學員學習檔案卡生命靈數九宮格靠右對齊與極致緊湊學習進度匯出、私秘VIP專屬連結守護與真實Google帳號授權登入。',
    added: [
      '首頁搜尋框升級：支援空格同時輸入多組關鍵字檢索，全面納入「網友關鍵字」比對搜尋，並於搜尋框同一排增加專屬「搜尋」按鈕。',
      '音檔詳細介紹頁新增顯示「上傳者」姓名於演講資訊與備註中。',
      '音檔詳細介紹頁點選「網友關鍵字」，直接跳轉首頁篩選該關鍵字相關內容。',
      '音檔詳細介紹頁按下「編輯演講資訊與連結」，改為跳轉後台管理相同之「編輯音檔」全功能視窗介面。',
      '私秘VIP音檔專屬權限守護：首頁與詳細頁顯示鎖頭與「私秘VIP」，未持有專屬連結者點擊播放會跳出「此音檔為私秘VIP專屬，請聯絡上傳者給您專屬連結」；曾點選過上傳者專屬網址者自動解鎖播放。',
      '學員學習檔案卡圖片匯出功能升級：包含該會員音檔學習進度、給予評價、心得內容，生命靈數九宮格移至頂端右側與基本資料對齊，去除鑽石與皇冠符號及說明文字，排版更緊密節省空間。'
    ],
    modified: [
      '音檔詳細介紹頁按鈕「推薦分享此演講」文字更名為「分享錄音」，按鈕「匯出資訊圖卡」更名為「匯出圖卡」，位置統一移動至心得收穫的上方。',
      '音檔詳細介紹頁區塊標題「相關外部學習資源」文字更名為「參考資料」，位置向下移動至「演講資訊與備註」的正上方。',
      '音檔詳細介紹頁「評價、心得、按讚」整列左右排列更緊密，五顆星星更加靠近，心得按鈕順序往前移至按讚前面。',
      '網友關鍵字區塊移至音檔詳細介紹頁的最頂部，並優化手機小裝置新增關鍵字時 X 取消按鈕的觸控點擊與佈局。',
      '播放器快轉與倒退按鈕符號顯著放大，操作更俐落醒目。',
      '後台管理中心網友關鍵字之「網友關鍵字清單與直接編輯」區塊重新設計排版，完美適配手機小螢幕瀏覽與操作。',
      'Google 帳號登入註冊採用標準 Google Identity Services 認證授權流程，杜絕無認證任意切換。',
      '針對手機小螢幕（寬度小於 360px）加入動態自適應字體與 CSS 變數等比縮放，確保所有元件不溢出螢幕邊框。'
    ],
    removed: [
      '刪除網頁最下方的右下角「v版本號」標籤。',
      '刪除首頁播放清單包圍所有單獨音檔的外層更大區塊框線與多餘邊距，騰出更多瀏覽空間。',
      '刪除首頁播放清單頂部的「上傳錄音檔」按鈕。',
      '刪除首頁搜尋建議下拉框中的「音檔詳細資料」，維持推薦簡潔。',
      '刪除音檔詳細介紹頁右上角「縮小、底部、放大」三個按鈕。',
      '刪除播放器快轉 30 秒與倒退 30 秒按鈕，僅保留俐落的 10 秒微調。',
      '刪除主選單「通知」頁面的「個人卡」按鈕，並修復按「快速回覆」或「跳轉心得」後通知百分之百即時消失。',
      '刪除 Google 帳號登入視窗中預設之三組假身分與「或輸入其他指定 Google 帳號綁定」區塊。'
    ]
  },
  {
    version: 'v2.6',
    date: '2026/09/30',
    summary: '音檔詳細介紹頁動線重塑（網友關鍵字置頂、參考資料與備註重整、緊湊評價心得）、分頁標籤左右< >點選捲動、手機小裝置自動縮小適配、首頁多組關鍵字檢索、私秘VIP預設永久有效與專屬權限守護、學員學習檔案卡生命靈數九宮格黑白符號升級。',
    added: [
      '「驚嘆號頁面」、「後台管理中心」與「個人中心」分頁標籤列左右新增 < > 箭頭符號，支援平滑點選向左或向右移動標籤。',
      '學員學習檔案卡圖片匯出功能升級：包含生命靈數九宮格圈圈圖，針對黑白圖特色，天賦數以鑽石符號（◆）標示（如33則顯示二顆鑽石）、加總主命數以皇冠符號（♛）標示，並附註完整圖例說明，同時保留原本圈圈標記。',
      '首頁搜尋框多組關鍵字檢索：支援空格分隔多組關鍵字同時篩選，納入「網友關鍵字」比對搜尋，並於同一排增加「搜尋」按鈕。',
      '音檔詳細資訊與備註新增「上傳者」姓名顯示。',
      '音檔詳細頁點選「網友關鍵字」，可直接跳轉首頁篩選該關鍵字相關內容。',
      '私秘VIP音檔首頁標籤顯示「私秘VIP」，未持專屬連結者點擊放大詳細介紹頁可查看全部內容與功能，唯獨播放時跳出專屬連結說明；曾經持有或造訪該專屬連結者可直接播放。',
      '音檔詳細頁點擊「編輯演講資訊與連結」按鈕，直接跳轉後台管理相同之「編輯音檔」全功能介面。'
    ],
    modified: [
      '「驚嘆號頁面」最上方分頁僅顯示版本號，不再顯示日期，大幅精簡版面空間。',
      '所有頁面大標題底下的小標題頁面說明全面移除，版面更緊湊，降低閱讀疲勞。',
      '音檔詳細頁按鈕「推薦分享此演講」改名為「分享錄音」，按鈕「匯出資訊圖卡」改名為「匯出圖卡」，並統一移至心得收穫上方。',
      '「相關外部學習資源」更名為「參考資料」，位置向下移動至「演講資訊與備註」上方。',
      '「評價、按讚、心得」排列極致緊密，五顆星星更加靠近，心得按鈕順序往前移至按讚前面。',
      '「網友關鍵字」區塊向上移動至音檔詳細頁的最頂部。',
      '心得收穫訪客身份「(訪客)」視覺設計框與已註冊會員獎銜同款設計，維持整體視覺一致性。',
      '播放器快轉與倒退符號顯著放大，操作更清晰易點。',
      '上傳音檔視窗「私秘VIP專屬」有效天數預設改為「永久有效」。',
      '頁面標題「學習夥伴個人中心」簡化為「個人中心」；分頁「已聆聽清單」更名為「學習進度」；「基本資料」分頁去除括號姓名直接顯示。'
    ],
    removed: [
      '刪除播放器快轉 30 秒與倒退 30 秒按鈕，僅保留俐落的 10 秒微調。',
      '刪除心得收穫輸入打字區框框內預設之一長串備註說明文字。',
      '刪除心得收穫「Cloudflare Workers AI 智慧審核保護中」標語。',
      '刪除「後台管理中心 > 網友關鍵字」之「為音檔指派新關鍵字」功能區塊。',
      '刪除「首頁播放清單」頂部的「上傳按鈕」。',
      '刪除首頁搜尋建議選單中的「音檔詳細資料」，維持推薦簡潔。',
      '通知頁面用戶點擊「快速回覆」或「跳轉心得」後，該則通知自動從通知頁面消失。'
    ]
  },
  {
    version: 'v2.5',
    date: '2026/09/30',
    summary: '個人中心操作動線全面升級、後台分類標籤緊密排列、排行榜全新「熱門關鍵字」統計分頁、心得身分精確區隔（訪客標示與無獎銜防呆）、通知頁面被標記心得版面極致緊湊。',
    added: [
      '排行榜新增「熱門關鍵字」各項統計分頁：呈現關鍵字覆蓋率、累計標記次數、Top 10 熱門關鍵字榜、點擊關聯音檔直接播放與熱度詞雲分佈。',
      '心得收穫訪客與會員身分嚴格區隔：非註冊訪客之暱稱右側統一標註「（訪客）」標籤，且嚴格禁止顯示獎銜；已註冊會員心得者均可點擊姓名即時彈出個人學習檔案與數字易經資訊卡。',
      '網頁底部右下角版本號更新為 v2.5，連動驚嘆號改版歷程頁面最新資訊。'
    ],
    modified: [
      '個人中心「登出」按鈕移至最上方：移至個人中心最頂部導覽列，跨分頁一目瞭然，點擊更直覺、操作體驗大幅提升。',
      '後台管理中心分類標籤排版優化：由原本一行一個/大網格改成緊密左右排列（橫向流動排版），高度利用螢幕橫向空間，標籤瀏覽與管理更迅速。',
      '主選單通知頁「被標記的心得」版面緊湊化：刪除每則心得框框左上角重複出現的「＠標記了你」大標題，收縮頭像與外框間距，實現極致乾淨緊湊排版。'
    ],
    removed: [
      '刪除通知頁被標記心得每筆卡片左上角重複之「＠標記了你」標籤文字。',
      '刪除非註冊訪客心得中任何誤配之獎銜標籤，杜絕資訊卡誤點與身分混淆。'
    ]
  },
  {
    version: 'v2.4',
    date: '2026/09/30',
    summary: '主選單與後台中心分頁重整、角色權限表主色連動、@標記關聯字演講者與會員精準區隔、通知頁面被標記心得置頂與即時同步修復、驚嘆號改版頁面段落即時手動在線編輯。',
    added: [
      '@或＠標記選單加入「音檔演講者」：輸入 @ 或 ＠ 時，提示選單全面納入全站錄音檔講師姓名，右側清楚標註「音檔演講者」；已註冊會員右側清楚顯示「中心+獎銜」，彼此一目瞭然。',
      '驚嘆號改版歷程段落編輯：超級管理員專屬功能，點擊驚嘆號視窗右上角編輯按鈕，即可自由手動修改每一次改版重點、增加項目、修改項目與刪除項目文字並持久保存。',
      '首頁預覽心得 @ 標記全域即時同步：修復首頁快速預覽心得視窗發表的半形 @ 與全形 ＠ 心得未出現在通知的問題，全站跨音檔心得即時聯網載入。'
    ],
    modified: [
      '置頂主選單名稱重構：選單標題規範為「首頁播放清單」、「排行榜」、「通知與獎銜審核」（無審核權限者僅顯示「通知」）、「上傳音檔」、「個人中心」、「後台管理」。',
      '後台中心分頁順序調整：分頁左右順序重排為「數據中心」、「會員」、「音檔」、「私秘音檔」（原私秘VIP）、「分類標籤」、「網友關鍵字」、「權限表」。',
      '後台權限表視覺優化：一般角色權限黑色豆豆改為低調灰色；當前登入者所屬身分擁有之權限豆豆，自動高亮連動為網站 LOGO 主色系同色。',
      '主選單通知頁面佈局升級：「@被標記的心得」移至第一位成為首要預設焦點，分頁選項排列更加緊密，手機左右太窄時自動等比縮小字體符合全寬。'
    ],
    removed: [
      '通知頁面移除「所有通知」分頁：簡化標籤層級，直接聚焦於「@被標記的心得」、「待審核名冊」與「已通過核准」三項核心動態。'
    ]
  },
  {
    version: 'v2.3',
    date: '2026/09/30',
    summary: 'Cloudflare Workers + D1 + R2 + KV 全端架構部署支援、私秘VIP音檔專屬連結分享與天數設定、訪客心得資訊卡保護。',
    added: [
      'Cloudflare Workers + D1 + R2 + KV 全端架構支援：提供完整 wrangler.toml 與 schema.sql，後端無伺服器架構高效運作。',
      '私秘VIP音檔獨立上傳選項：貢獻者可上傳最多 10 首私秘VIP音檔，專屬加密連結可設定 3/7/14/30 天或永久有效。',
      '後台私秘音檔管理中心：獨立分頁管理私秘音檔，支援重置專屬連結、天數設定與音檔刪除。'
    ],
    modified: [
      '首頁快速瀏覽心得收穫：點選未登入訪客名字不再出現資訊卡，避免誤觸無效連結。',
      '後台管理中心分頁標籤緊緻排版：標籤左右文字更加緊密美觀。'
    ],
    removed: [
      '移除未登入訪客的卡片彈窗觸發事件。'
    ]
  },
  {
    version: 'v2.1',
    date: '2026/09/30',
    summary: '後台中心介面緊密升級、心得收穫 @ 標記優化、通知快速回覆與全域資料庫持久維護。',
    added: [
      '@ 標記關鍵字提示：輸入 @ 並鍵入關鍵字時，同步提示網站中相符之「錄音檔名稱」與「演講人姓名」。',
      '主選單通知快捷互動：被 @ 標記的通知項目支援「直接快速回覆」與「一鍵跳轉」至該音檔心得處（保留最新前 50 則）。',
      '心得自主管理：會員可直接於心得收穫編輯或刪除自己過去發布的心得內容。',
      '低調驚嘆號改版歷程按鈕：左下角常駐低調驚嘆號，隨時查閱全版本增加、修改、刪除紀錄與發布日期。'
    ],
    modified: [
      '後台中心分頁重整：標籤更緊密排列，順序與名稱調整為「數據中心」、「會員」、「音檔」、「分類標籤」、「網友關鍵字」、「權限」。',
      '個人基本資料與心得收穫即時連動：會員修改基本資料姓名後，心得收穫歷史發言與身分即時同步修正。',
      '超級管理員心得身分校正：取消「🐲杜杜龍」暱稱，完全與個人基本資料設定名稱同步一致。'
    ],
    removed: [
      '刪除 2.5X 播放倍速：音頻播放控制項全面刪除 2.5X 倍速選項，維持乾淨好點擊的 0.7x ~ 2.0x 節奏。',
      '取消已標記音檔彈窗試聽：心得中被 @ 的錄音檔不再彈出試聽播放對話框，改以高質感音檔標籤呈現。'
    ]
  },
  {
    version: 'v2.0',
    date: '2026/09/28',
    summary: '後台數據中心全面升級、網友關鍵字標籤庫上線、心得收穫會員標記與學習卡匯出加強。',
    added: [
      '後台數據中心：白金以上權限專屬儀表板，即時監控會員活躍比例、中心分佈與收聽高峰。',
      '網友關鍵字庫：每則音檔支援最多 20 個關鍵字標籤，提供精準多標籤檢索。',
      '黑白個人圖卡分享：支援呼叫行動裝置原生 Web Share API 快速分享個人學習檔案。'
    ],
    modified: [
      '音檔全螢幕詳細頁直接支援音檔資訊、備註與相關影片/簡報學習連結修改。',
      '分類標籤與熱門排行智慧關聯推薦演算法校準。'
    ],
    removed: [
      '移除訪客檢視通知頁中審核人員姓名之顯示，保障隱私。'
    ]
  },
  {
    version: 'v1.9',
    date: '2026/09/25',
    summary: '生命靈數九宮格分析圖、鑽石專屬管理功能與獎銜自動審核名冊。',
    added: [
      '九宮格生命靈數圖：依西元生日自動試算先天數、生日數、星座數、天賦數與命數連線圖。',
      '鑽石級專屬功能：鑽石權限可進行會員名單快速搜尋與分中心瀏覽。',
      '公開審核動態通知：新註冊夥伴與晉升申請公開通知，提高組織透明度。'
    ],
    modified: [
      '會員中心資料編輯機制：每月最多限制修改 5 次並記錄異動歷史。',
      '音檔列表分級權限過濾器流暢度改善。'
    ],
    removed: [
      '移除未具備對應獎銜權限之音檔直接播放連結。'
    ]
  },
  {
    version: 'v1.8',
    date: '2026/09/20',
    summary: '多維權限分級體系建立、Workers AI 智慧審核與心得互動系統。',
    added: [
      '獎銜分級播放控制（鑽石、白金、一般會員、公開訪客）。',
      'Workers AI 智慧心得審核防護機制，自動攔截不當言論。',
      '播放進度精確記憶與跨裝置接續播放。'
    ],
    modified: [
      '迷你播放器與最大化播放介面無縫平滑切換。',
      '會員登入狀態與訪客隨機稱號識別機制。'
    ],
    removed: [
      '取消未驗證訪客直接上傳錄音檔功能。'
    ]
  }
];

interface ChangelogModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser?: UserProfile | null;
  isAdmin?: boolean;
}

export const ChangelogModal: React.FC<ChangelogModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  isAdmin
}) => {
  const [changelogList, setChangelogList] = useState<VersionLog[]>(DEFAULT_CHANGELOG_DATA);
  const [selectedVersion, setSelectedVersion] = useState<string>(DEFAULT_CHANGELOG_DATA[0]?.version || 'v3.2');
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const tabsContainerRef = useRef<HTMLDivElement>(null);

  const handleScrollTabs = (direction: 'left' | 'right') => {
    if (tabsContainerRef.current) {
      tabsContainerRef.current.scrollBy({
        left: direction === 'left' ? -120 : 120,
        behavior: 'smooth'
      });
    }
  };

  // Check if current user is Super Admin (yukidu@gmail.com or role === '超級管理員')
  const cleanEmail = currentUser?.email?.toLowerCase().trim();
  const isSuperAdmin =
    isAdmin ||
    cleanEmail === 'yukidu@gmail.com' ||
    currentUser?.role === '超級管理員' ||
    currentUser?.id === 'u-admin';

  // Fetch persisted changelog from server on mount
  useEffect(() => {
    async function loadChangelog() {
      try {
        const res = await fetch('/api/changelog');
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            const byVersion = new Map<string, VersionLog>();

            // Start from shipped history so newly released versions are always visible.
            for (const log of DEFAULT_CHANGELOG_DATA) {
              byVersion.set(log.version, { ...sanitizeVersionLog(log), isLatest: false });
            }

            // Merge server-edited history without losing shipped additions.
            for (const persistedRaw of data as VersionLog[]) {
              if (!persistedRaw?.version) continue;
              const persisted = sanitizeVersionLog(persistedRaw);
              const shipped = byVersion.get(persisted.version);
              if (shipped) {
                byVersion.set(persisted.version, {
                  ...shipped,
                  ...persisted,
                  added: [...new Set([...(shipped.added || []), ...(persisted.added || [])])],
                  modified: [...new Set([...(shipped.modified || []), ...(persisted.modified || [])])],
                  removed: [...new Set([...(shipped.removed || []), ...(persisted.removed || [])])],
                  isLatest: false
                });
              } else {
                byVersion.set(persisted.version, {
                  ...persisted,
                  added: Array.isArray(persisted.added) ? persisted.added : [],
                  modified: Array.isArray(persisted.modified) ? persisted.modified : [],
                  removed: Array.isArray(persisted.removed) ? persisted.removed : [],
                  isLatest: false
                });
              }
            }

            const finalData = Array.from(byVersion.values())
              .sort((a, b) => b.version.localeCompare(a.version, undefined, { numeric: true }))
              .map((log, index) => ({ ...log, isLatest: index === 0 }));

            setChangelogList(finalData);
            setSelectedVersion(finalData[0]?.version || DEFAULT_CHANGELOG_DATA[0].version);
            return;
          }
        }
      } catch (e) {
        console.error('Failed to load changelog from server:', e);
      }
      const sanitizedDefaults = DEFAULT_CHANGELOG_DATA.map(sanitizeVersionLog);
      setChangelogList(sanitizedDefaults);
      setSelectedVersion(sanitizedDefaults[0].version);
    }

    if (isOpen) {
      loadChangelog();
      setIsEditing(false);
      setSaveSuccess(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const currentLog = changelogList.find(l => l.version === selectedVersion) || changelogList[0];

  // Helper to update field in current log
  const handleUpdateCurrentLog = (field: keyof VersionLog, value: any) => {
    setChangelogList(prev =>
      prev.map(l => (l.version === currentLog.version ? { ...l, [field]: value } : l))
    );
  };

  // Helper to update specific item in bullet array
  const handleUpdateItem = (type: 'added' | 'modified' | 'removed', idx: number, value: string) => {
    const list = [...(currentLog[type] || [])];
    list[idx] = value;
    handleUpdateCurrentLog(type, list);
  };

  // Helper to add new bullet
  const handleAddItem = (type: 'added' | 'modified' | 'removed') => {
    const list = [...(currentLog[type] || []), '新項目說明...'];
    handleUpdateCurrentLog(type, list);
  };

  // Helper to delete bullet
  const handleDeleteItem = (type: 'added' | 'modified' | 'removed', idx: number) => {
    const list = (currentLog[type] || []).filter((_, i) => i !== idx);
    handleUpdateCurrentLog(type, list);
  };

  // Save changes to backend
  const handleSaveChangelog = async () => {
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      const res = await fetch('/api/changelog', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          changelog: changelogList,
          userEmail: currentUser?.email || 'yukidu@gmail.com'
        })
      });

      if (res.ok) {
        setSaveSuccess(true);
        setIsEditing(false);
        setTimeout(() => setSaveSuccess(false), 3000);
      } else {
        alert('儲存改版紀錄失敗，請確認超級管理員身分。');
      }
    } catch (e) {
      console.error(e);
      alert('儲存失敗，請稍後再試。');
    } finally {
      setIsSaving(false);
    }
  };

  // Reset to default
  const handleResetToDefault = () => {
    if (confirm('確定要還原為系統預設的改版歷程文字嗎？')) {
      setChangelogList(DEFAULT_CHANGELOG_DATA.map(sanitizeVersionLog));
    }
  };

  return (
    <div
      onClick={onClose}
      className="app-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/70 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-150"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-rose-100 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div className="px-5 py-4 bg-gradient-to-r from-rose-500 via-rose-600 to-amber-500 text-white flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center text-white font-black text-sm">
              !
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-black text-base sm:text-lg">版本改版歷程紀錄</h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/25 text-white font-mono font-bold">
                  當前版本 {changelogList[0]?.version || 'v2.6'}
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Super Admin Edit Toggle (Requirement 8 v2.4: 超級管理員手動編輯每一段落文字) */}
            {isSuperAdmin && (
              <button
                type="button"
                onClick={() => setIsEditing(!isEditing)}
                className={`px-2.5 py-1 rounded-xl text-xs font-bold flex items-center gap-1 transition-all cursor-pointer shadow-xs ${
                  isEditing
                    ? 'bg-amber-400 text-amber-950 ring-2 ring-white'
                    : 'bg-white/20 hover:bg-white/30 text-white'
                }`}
                title={isEditing ? '切換回瀏覽模式' : '進入文字編輯模式 (超級管理員)'}
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>{isEditing ? '編輯中' : '編輯文字'}</span>
              </button>
            )}

            <button
              onClick={onClose}
              className="p-1 rounded-xl text-white/80 hover:text-white hover:bg-white/20 transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Super admin editor top action bar */}
        {isEditing && (
          <div className="px-4 py-2 bg-amber-50 dark:bg-amber-950/60 border-b border-amber-200 dark:border-amber-900 flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5 text-amber-900 dark:text-amber-200 font-bold">
              <ShieldCheck className="w-4 h-4 text-amber-600" />
              <span>超級管理員段落編輯模式：點擊任何段落文字即可修改</span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleResetToDefault}
                className="px-2.5 py-1 rounded-lg bg-white dark:bg-slate-800 border border-amber-300 dark:border-amber-800 text-amber-800 dark:text-amber-300 font-bold flex items-center gap-1 hover:bg-amber-100 transition-colors cursor-pointer"
                title="還原為預設紀錄"
              >
                <RotateCcw className="w-3 h-3" />
                <span>還原預設</span>
              </button>
              <button
                type="button"
                disabled={isSaving}
                onClick={handleSaveChangelog}
                className="px-3 py-1 rounded-lg bg-rose-600 text-white font-bold flex items-center gap-1 hover:bg-rose-700 shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
              >
                <Save className="w-3 h-3" />
                <span>{isSaving ? '儲存中...' : '儲存變更'}</span>
              </button>
            </div>
          </div>
        )}

        {saveSuccess && (
          <div className="px-4 py-2 bg-emerald-50 dark:bg-emerald-950/70 text-emerald-800 dark:text-emerald-200 border-b border-emerald-200 text-xs font-bold flex items-center gap-1.5 animate-in fade-in">
            <Check className="w-4 h-4 text-emerald-600" />
            <span>改版歷程段落已成功儲存至後端資料庫！全站會員即刻同步看見更新。</span>
          </div>
        )}

        {/* Version Selector Tabs - Requirement 2: 不要顯示日期，顯示版本號即可；Requirement 3: 左右二側增加 < > 符號 */}
        <div className="flex items-center border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 px-2 py-1.5 gap-1">
          <button
            type="button"
            onClick={() => handleScrollTabs('left')}
            className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors shrink-0 cursor-pointer"
            title="向左移動標籤"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div
            ref={tabsContainerRef}
            className="flex-1 flex items-center gap-1.5 overflow-x-auto scrollbar-none text-xs px-0.5 scroll-smooth"
          >
            {changelogList.map(log => {
              const isSelected = selectedVersion === log.version;
              return (
                <button
                  key={log.version}
                  onClick={() => setSelectedVersion(log.version)}
                  className={`px-3 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer ${
                    isSelected
                      ? 'bg-rose-500 text-white shadow-2xs'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200/80 dark:border-slate-700 hover:border-rose-300'
                  }`}
                >
                  <span>{log.version}</span>
                  {log.isLatest && (
                    <span
                      className={`text-[9px] px-1.5 py-0.2 rounded-full font-black ${
                        isSelected
                          ? 'bg-white text-rose-600'
                          : 'bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-300'
                      }`}
                    >
                      最新
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => handleScrollTabs('right')}
            className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors shrink-0 cursor-pointer"
            title="向右移動標籤"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Version Detail Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
          {/* Summary Banner */}
          <div className="p-3.5 rounded-2xl bg-gradient-to-r from-rose-50/80 via-white to-amber-50/80 dark:from-slate-800/80 dark:via-slate-800/50 dark:to-slate-800/80 border border-rose-100 dark:border-slate-700 space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="font-extrabold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-amber-500" />
                <span>{currentLog.version} 改版重點</span>
              </span>
              <div className="flex items-center gap-1.5">
                {isEditing ? (
                  <input
                    type="text"
                    value={currentLog.date}
                    onChange={e => handleUpdateCurrentLog('date', e.target.value)}
                    className="px-2 py-0.5 rounded border border-slate-300 dark:border-slate-700 text-xs font-mono bg-white dark:bg-slate-800"
                  />
                ) : (
                  <span className="text-slate-400 font-mono text-xs flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" />
                    <span>{currentLog.date} 發布</span>
                  </span>
                )}
              </div>
            </div>

            {isEditing ? (
              <textarea
                value={currentLog.summary}
                onChange={e => handleUpdateCurrentLog('summary', e.target.value)}
                rows={3}
                className="w-full p-2 rounded-xl border border-rose-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 text-xs focus:ring-1 focus:ring-rose-500 outline-hidden leading-relaxed"
                placeholder="輸入改版重點摘要..."
              />
            ) : (
              <p className="text-slate-600 dark:text-slate-300 leading-relaxed text-xs">
                {currentLog.summary}
              </p>
            )}
          </div>

          {/* 🟢 增加功能 */}
          <div className="rounded-2xl p-3.5 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/60 dark:border-emerald-900/40 space-y-2">
            <div className="flex items-center justify-between gap-1.5 text-emerald-700 dark:text-emerald-300 font-black text-xs">
              <div className="flex items-center gap-1.5">
                <PlusCircle className="w-4 h-4" />
                <span>增加功能 ({currentLog.added?.length || 0})</span>
              </div>
              {isEditing && (
                <button
                  type="button"
                  onClick={() => handleAddItem('added')}
                  className="px-2 py-0.5 rounded-md bg-emerald-600 text-white font-bold text-[11px] flex items-center gap-1 hover:bg-emerald-700 cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>新增項目</span>
                </button>
              )}
            </div>

            <ul className="space-y-1.5 pl-1">
              {(currentLog.added || []).map((item, idx) => (
                <li key={idx} className="flex items-start gap-2 text-slate-700 dark:text-slate-200 leading-relaxed">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                  {isEditing ? (
                    <div className="flex items-center gap-1.5 flex-1">
                      <textarea
                        value={item}
                        onChange={e => handleUpdateItem('added', idx, e.target.value)}
                        rows={2}
                        className="flex-1 p-1.5 rounded-lg border border-emerald-300 dark:border-emerald-800 bg-white dark:bg-slate-800 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => handleDeleteItem('added', idx)}
                        className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                        title="刪除此項目"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <span>{item}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* 🟡 修改功能 */}
          <div className="rounded-2xl p-3.5 bg-amber-50/50 dark:bg-amber-950/20 border border-amber-200/60 dark:border-amber-900/40 space-y-2">
            <div className="flex items-center justify-between gap-1.5 text-amber-700 dark:text-amber-300 font-black text-xs">
              <div className="flex items-center gap-1.5">
                <RefreshCw className="w-4 h-4" />
                <span>修改功能 ({currentLog.modified?.length || 0})</span>
              </div>
              {isEditing && (
                <button
                  type="button"
                  onClick={() => handleAddItem('modified')}
                  className="px-2 py-0.5 rounded-md bg-amber-600 text-white font-bold text-[11px] flex items-center gap-1 hover:bg-amber-700 cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>新增項目</span>
                </button>
              )}
            </div>

            <ul className="space-y-1.5 pl-1">
              {(currentLog.modified || []).map((item, idx) => (
                <li key={idx} className="flex items-start gap-2 text-slate-700 dark:text-slate-200 leading-relaxed">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                  {isEditing ? (
                    <div className="flex items-center gap-1.5 flex-1">
                      <textarea
                        value={item}
                        onChange={e => handleUpdateItem('modified', idx, e.target.value)}
                        rows={2}
                        className="flex-1 p-1.5 rounded-lg border border-amber-300 dark:border-amber-800 bg-white dark:bg-slate-800 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => handleDeleteItem('modified', idx)}
                        className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                        title="刪除此項目"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <span>{item}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* 🔴 刪除功能 */}
          <div className="rounded-2xl p-3.5 bg-rose-50/50 dark:bg-rose-950/20 border border-rose-200/60 dark:border-rose-900/40 space-y-2">
            <div className="flex items-center justify-between gap-1.5 text-rose-700 dark:text-rose-300 font-black text-xs">
              <div className="flex items-center gap-1.5">
                <Trash2 className="w-4 h-4" />
                <span>刪除功能 ({currentLog.removed?.length || 0})</span>
              </div>
              {isEditing && (
                <button
                  type="button"
                  onClick={() => handleAddItem('removed')}
                  className="px-2 py-0.5 rounded-md bg-rose-600 text-white font-bold text-[11px] flex items-center gap-1 hover:bg-rose-700 cursor-pointer"
                >
                  <Plus className="w-3 h-3" />
                  <span>新增項目</span>
                </button>
              )}
            </div>

            <ul className="space-y-1.5 pl-1">
              {(currentLog.removed || []).map((item, idx) => (
                <li key={idx} className="flex items-start gap-2 text-slate-700 dark:text-slate-200 leading-relaxed">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1.5 shrink-0" />
                  {isEditing ? (
                    <div className="flex items-center gap-1.5 flex-1">
                      <textarea
                        value={item}
                        onChange={e => handleUpdateItem('removed', idx, e.target.value)}
                        rows={2}
                        className="flex-1 p-1.5 rounded-lg border border-rose-300 dark:border-rose-800 bg-white dark:bg-slate-800 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => handleDeleteItem('removed', idx)}
                        className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                        title="刪除此項目"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <span>{item}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>

          {/* Persistence Architecture Guarantee notice */}
          <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700 flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-indigo-500" />
              <span>資料庫持久存儲機制：後端 D1 / 本機 store.json 維護中，改版歷程編輯後立即持久寫入。</span>
            </span>
            <span className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400 font-bold shrink-0 ml-2">
              ● 已連線保護中
            </span>
          </div>
        </div>

        {/* Footer */}
        <div className="p-3 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-400">
          <span>繁星回聲 知識音檔平台 · 持續維護更新中</span>
          <div className="flex items-center gap-2">

            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors cursor-pointer"
            >
              關閉
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
