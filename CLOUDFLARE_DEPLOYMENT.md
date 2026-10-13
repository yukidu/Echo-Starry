# 繁星回聲 - Cloudflare 全端架構部屬指南

本專案已完整支援以 **Cloudflare Workers (後端執行環境) + D1 (分散式 SQLite 資料庫) + R2 (音訊與圖檔物件儲存) + KV (極速鍵值快取)** 架構部屬。

- **線上正式運行網址 (Cloudflare Workers)**: [https://echostars.yukidu.workers.dev](https://echostars.yukidu.workers.dev)
- **已綁定 R2 儲存桶**: `echoes-audio-bucket`
- **已綁定 D1 資料庫**: `echoes_db` (ID: `e0a696a9-0233-4186-be4d-229435b19a27`)
- **已綁定 KV 命名空間**: `KV` (ID: `a2e345e244cb40b4a804be3f89584b90`)

## 2026-10-14 v212 正式部署重新觸發

- 以 `main` 的 v212（公開電子名片網址補強）為基準重新觸發 Cloudflare Production Deploy。
- 此次只更新部署紀錄文件，不變更 Worker、Starry ID、DownloadStarry SSO、D1、R2、KV 或前端功能。
- 正式完成標準仍是：合併後 exact-main 的 Cloudflare Workers Production Build 必須 `completed + success`。

## 2026-10-02 功能與部署修正

- 新增 PWA 安裝按鈕、manifest、192/512 PNG 圖示與 Service Worker。Chrome/Edge 支援原生安裝提示；iPhone/iPad 提供 Safari「加入主畫面」步驟。
- `/api/*` 優先進入 Worker，其他頁面使用 SPA 路由。API 和音訊不會被新增的 Service Worker 快取。
- `worker/community.ts` 統一正式環境的按讚、評分、留言及會員 API 回傳格式。互動失敗會回傳錯誤，前端會復原顯示。
- Google 重新登入只更新 Google 預設照片與登入時間，保留已編輯的姓名、基本資料、會員 ID 及自訂照片。
- 首次 API 請求會補齊舊 D1 的會員與收聽紀錄欄位，屬於新增欄位的遷移，保留現有資料。全新資料庫仍須先執行本文件的 `schema.sql` 初始化步驟。
- 手機採用 CSS 可用寬度調整排版，改善字級、點按區域與留言視窗；九宮格使用 SVG 同心圓。
- 管理、會員、上傳、分享圖卡及 PDF 程式依使用情境載入，降低首頁下載量。

驗證指令（測試使用 Node.js 22.13+ 的內建 SQLite，建議 Node.js 24）：

```bash
npm run lint
npm test
npm run build
npx wrangler deploy --dry-run
```

上傳 GitHub 後，若 Cloudflare 已綁定 `main` 的自動部署，等待組建成功即可生效。GitHub 上的提交成功與 Cloudflare 部署成功是兩個獨立狀態。

---

## 🛠️ 常見問題排查：解決 Cloudflare Pages / Workers CI「npm ci / EUSAGE」錯誤

如果在 Cloudflare 控制台的「組建」紀錄中看到：
```text
npm error code EUSAGE
npm error `npm ci` can only install packages when your package.json and package-lock.json or npm-shrinkwrap.json are in sync.
npm error Missing: @tailwindcss/oxide-android-arm64...
```

### 發生原因
Cloudflare 預設在偵測到 `package-lock.json` 時會執行嚴格的比對指令 `npm clean-install` (`npm ci`)。當跨平台原生可選依賴（如 macOS / Android / Linux 之 `@tailwindcss/oxide-*`、`lightningcss-*`）在不同系統生成時，npm 10 在 Node 24 環境下會嚴格中斷。

### 解決方案（已內建與控制台設定）
1. **專案內建修正**：
   - 專案已加入 `.npmrc`，設定 `legacy-peer-deps=true` 與 `package-lock=false`。
   - `.gitignore` 已將 `package-lock.json` 排除，避免將單一作業系統鎖定的相依版本推上 GitHub。

2. **Cloudflare 控制台「組建設定」調整**（若使用 GitHub 自動連動）：
   - 進入 Cloudflare 控制台 > **Workers 和 Pages** > 專案 `echostars` > **設定** > **組建與部署**。
   - 將 **組建命令 (Build command)** 修改為：
     ```bash
     npm install --legacy-peer-deps && npm run build
     ```
   - 或者在 **環境變數 (建置變數)** 中新增：
     ```text
     NPM_FLAGS = --legacy-peer-deps --no-package-lock
     ```
   - 儲存後點擊「重新組建」即可順暢部署！

---

## 🚀 手動一鍵部屬 (Wrangler CLI)

在已配置 `CLOUDFLARE_API_TOKEN` 或登入 Wrangler 的環境中，只需執行：

```bash
# 1. 編譯前端 React SPA
npm run build

# 2. 一鍵部屬至 Cloudflare Workers
npx wrangler deploy
```

---

## 🌟 架構特點與配對說明

| 元件 | 服務名稱 | 用途與說明 |
| :--- | :--- | :--- |
| **運算執行** | **Cloudflare Workers** | 處理 `/api/*` REST API 與邊緣路由分發，極速毫秒響應。 |
| **資料庫** | **Cloudflare D1** | 儲存會員名冊、音檔詳細中繼資料、評價星星、留言討論串與審核狀態。 |
| **物件儲存** | **Cloudflare R2** | 儲存大容量演講音訊 (MP3) 與講員頭像、自訂教材檔案，0 輸出傳輸費 (Zero Egress)。本機 dev server 與線上環境皆已支援直接同步上傳至 R2 儲存桶。 |
| **高速快取** | **Cloudflare KV** | 儲存每位會員的即時收聽進度秒數、VIP 專屬臨時連結驗證權杖。 |
| **前端靜態** | **Workers Assets / Pages** | 直接託管 Vite React 應用，支援全自動 PWA、音訊懸浮播放與離線快取。 |
