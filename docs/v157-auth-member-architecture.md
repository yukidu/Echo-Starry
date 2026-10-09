# 繁星回聲 v157：登入與會員架構健檢
日期：2026-10-10。基準 main：982f4cad512a1366f6c95ca0b8fe8ad406433259。

## 已確認與已修正
- 正式 Chrome 的一次 Google 登入成功；使用者回報的手機間歇逾時尚不能歸因於唯一原因。以下是程式碼與可重現測試確認的缺陷，不將猜測寫成正式站根因。
- 原登入經過 stickerRouter 的初始化：每個冷啟動綁定會掃描全部 users、逐會員確認初始貼紙，並重跑多個歷史 backfill。登入現在由 privacy → sessionCookie → auth → memberRepository 執行；會員同步不再呼叫全站 community/catalog 初始化。
- 貼紙 schema 完成標記 sticker-schema-v157 跨冷啟動保存。新會員仍在首次貼紙使用時透過 uniqueKey 冪等領取初始貼紙，不重算歷史帳本。
- 匿名或過期 session 回應不再回傳清 Cookie 指令，避免先發出的慢回應覆蓋後發成功登入的 Cookie。明確登出仍撤銷 server token 並清 Cookie。
- 暫時的 5xx 不再清除本機會員身分。舊 token 的檢查不能清除較新 token。
- 正常登入與分享頁共用一次有期限的 credential exchange；禁止把一個帳號的進行中結果交給另一個帳號。iOS redirect 維持 Google double-submit CSRF，並將成功 Cookie 帶回瀏覽器。
- 更新自身獎銜／角色時保留同一會員的 session metadata。
- blocked member 在簽發新 session 前拒絕。Google subject、email 不能透過衝突登入被重新綁定。
- GET 會員清單／完整個資需要驗證：一般會員只取得其他會員的必要公開欄位；自己及有會員管理權限人員才可取得完整資料。Google subject 不在一般 API DTO 回傳。
- Cookie 寫入限制同源；不把會員 Cookie 當成未來其他 App 的通用管理憑證。

## 維持的架構與成本
React / TypeScript / Vite；Cloudflare Worker、D1、R2、KV；GIS 與 PWA。
Google ID token 的簽章、issuer、audience、email_verified、期限檢查繼續由 jose 執行。Session token 只以 SHA-256 hash 存 D1。
既有持續登入政策、會員 ID、貼紙帳本、播放資料與權限資料均沿用。
貼紙 60 秒可見分頁更新、事件更新、分頁紀錄及快取機制沿用；這次優先移除冷啟動全會員檢查，不增加輪詢或 KV 寫入。
現有 UI 仍有多個舊 DOM 補丁。未來以功能為單位逐步搬回 React，避免一次重寫破壞 v136–v156 的既有介面。這次沒有宣稱全站已無冗餘或所有安全風險都已排除。

## 未來多 App 會員平台的升級契約（尚未開放外部存取）
目標是讓受授權的自有 App 讀取、新增、修改所有必要會員基本欄位；現在先建立統一 memberRepository 與 normalizeMember 邊界。
- 主鍵永遠使用 users.id；Google sub 是外部身分唯一鍵，email 不是可任意更換的主鍵。既有會員 ID 不重建。
- 基本資料：name、avatar、phone、amwayId、residence、center、rank、joinReason、stayReason、sponsor、platinumUpline、diamondUpline、birthday/birthDate、notes；所有欄位保留。歷史別名 birthDate 在 DTO 以 birthday 相容處理。
- 系統欄位：角色、審核狀態、approvedRank、封鎖狀態、session、Google 綁定與上傳／修改次數。App 的「完整基本資料權限」不等於可任意提高角色或更換 Google 綁定。
- 規劃 /api/v1/members：穩定欄位契約、游標分頁、GET/PATCH/POST、版本衝突控制（ETag/If-Match）、新增冪等鍵；寫入重用組織、審核與貼紙完成獎勵規則。
- App 後端使用個別可撤銷憑證／短期 token，scope 至少分 members:read、members:create、members:update；管理權限與 Google 綁定另設 scope。每個 App 可獨立輪替和撤銷，不分享超級管理員 session。
- 跨站網頁使用明確 origin allowlist 與對應憑證；行動端用適合 public client 的 OAuth/OIDC + PKCE 或自有後端代理。密鑰不放前端。
- 必須有 actorAppId、actorUserId、目標會員、時間、變更欄位的稽核紀錄；避免將電話、生日、token 原文寫進一般日誌。
- 在確定第一個串接 App 的來源、授權模式、資料用途之前，沒有啟用外部全權 API，也沒有發出任何 App 憑證。這是預留升級方向，不是已交付可公開使用的跨 App 平台。

## 部署前驗證與接手原則
跑所有 tests/*.test.ts、TypeScript、production build 和既有 Chrome UI 檢查。
新增測試用本機 RSA 簽章 JWT + SQLite + 完整 Worker 入口驗證；測試 JWKS 替身只存在 tests，沒有 production 驗證後門。
檢查 PR 最新 head 的 Regression/Workers Builds success 才 merge；再確認 main 的 production。
schema.sql 僅供全新資料庫；不可對正式 DB 清空重建。未來 sticker schema 改版需更新持久遷移標記版本並保證失敗可重試。
PR #159 等舊 PR 不可直接覆蓋最新 main。部署證據與最終 commit 請以交接包和 GitHub 即時狀態為準。
