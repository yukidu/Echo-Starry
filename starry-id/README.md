# Starry ID 中央會員中心

正式入口：`https://id.starry.phd`

Starry ID 是繁星系列網站共用的中央會員身份、固定基本資料與私人電子名片服務。各 App 繼續保留自己的業務資料庫，以同一個穩定 `user_id` 關聯中央會員。

## 會員中心 / 電子名片

- 所有可使用 Starry ID 的會員可透過 Google 登入。
- 登入後直接顯示自己的私人電子名片與中央會員資料。
- 姓名、會員編號、電話、居住地、中心、生日、座右銘、星座、生命靈數、推薦人與上線等欄位可逐項原地編輯。
- 一般會員只能編輯自己的資料。
- 中央 Super Admin 可開啟會員清單、搜尋會員、查看並編輯任一會員資料。
- 獎銜由中央 Super Admin 維護，修改時同步寫入審核狀態與 audit log。
- 目前會員中心是登入後的私人頁面，電話、生日等個資不會自動變成公開網頁。未來公開名片應另做欄位級公開設定。

## Google OAuth

Web 中央登入統一使用 Google Cloud 專案 `Starry ID` 的 `Starry ID Web` 用戶端。

- Client ID：`661055525630-ndcq5gtr16h7rqqprlqqkkvineea87lc.apps.googleusercontent.com`
- JavaScript origin：`https://id.starry.phd`
- 不需要把 Google Client Secret 寫入 GitHub、Wrangler 或前端。
- EchoStars 既有 Google Client 暫時保留，直到各 App 完成 Starry ID 過渡。

## API

- `GET /api/health`：中央服務與會員數健康檢查。
- `POST /api/google-sync`：驗證 Google ID token，解析/建立 stable user_id，建立中央 session。
- `GET /api/session`：驗證中央 session 並回傳目前會員資料與角色。
- `GET /api/profile`：讀取自己的中央會員基本資料。
- `PUT /api/profile`：修改允許的共用基本資料並寫入 audit log。
- `GET /api/admin/members`：Super Admin 搜尋/列出中央會員。
- `GET /api/admin/members/:id`：Super Admin 讀取指定會員。
- `PUT /api/admin/members/:id`：Super Admin 修改指定會員。
- `POST /api/logout`：撤銷中央 session。

## 安全規則

- Google `sub` 是 provider identity 主鍵；Email 只作已驗證比對與舊會員遷移證據。
- Email 與 Google subject 若指向不同 stable user_id，停止登入，不自動合併。
- 瀏覽器中央登入使用 `HttpOnly + Secure + SameSite=Lax` session cookie；D1 只保存 session token 的 SHA-256 hash，前端 JavaScript 不保存 durable token。
- App 必須列在 `STARRY_ID_ALLOWED_APPS` 才能使用中央登入。
- 只有列在 `STARRY_ID_SELF_ENROLL_APPS` 的 App 才能在首次登入自動建立 membership；瀏覽器不能靠任意 appId 自行加入其他 App。
- App 專屬角色、封鎖與上傳權限只放在 `app_memberships`。
- EchoStars 的一般管理員不會自動升成整個繁星生態系 Super Admin；中央最高權限獨立判定。
- 中央 profile 與關係欄位修改寫入 `profile_audit_logs`。
- 來源 EchoStars 資料不刪除；過渡期中央資料修改採 best-effort dual-write。
- 私人會員中心維持 `noindex`，不將會員個資自動公開給搜尋引擎或未登入訪客。

## Cloudflare

目前 `echo.starry.phd` 與 `id.starry.phd` 共用 `echostars` Worker deployment，但入口仍維持 `worker/privacyCrawlerRouter.ts`，再依 hostname 將 `id.starry.phd` 分流到 Starry ID。這樣可以保留 EchoStars 與 DownloadStarry 既有安全路由與回歸測試。

中央 D1：`starry_id_db`。
