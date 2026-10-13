# Starry ID 中央會員中心

正式入口：`https://id.starry.phd`

Starry ID 是繁星系列網站共用的中央會員身份與固定基本資料服務。各 App 繼續保留自己的業務資料庫，以同一個穩定 `user_id` 關聯中央會員。

## Google OAuth

Web 中央登入統一使用 Google Cloud 專案 `Starry ID` 的 `Starry ID Web` 用戶端。

- Client ID：`661055525630-ndcq5gtr16h7rqqprlqqkkvineea87lc.apps.googleusercontent.com`
- JavaScript origin：`https://id.starry.phd`
- 不需要把 Google Client Secret 寫入 GitHub、Wrangler 或前端。
- EchoStars 既有 Google Client 暫時保留，直到各 App 完成 Starry ID 過渡。

## API

- `GET /api/health`：中央服務與會員數健康檢查。
- `POST /api/google-sync`：驗證 Google ID token，解析/建立 stable user_id，建立中央 session。
- `GET /api/session`：驗證中央 bearer session。
- `GET /api/profile`：讀取中央會員基本資料。
- `PUT /api/profile`：修改允許的共用基本資料並寫入 audit log。
- `POST /api/logout`：撤銷中央 session。

## 安全規則

- Google `sub` 是 provider identity 主鍵；Email 只作已驗證比對與舊會員遷移證據。
- Email 與 Google subject 若指向不同 stable user_id，停止登入，不自動合併。
- raw session token 只回傳給登入端；D1 僅保存 SHA-256 hash。
- App 必須列在 `STARRY_ID_ALLOWED_APPS` 才能使用中央登入。
- 只有列在 `STARRY_ID_SELF_ENROLL_APPS` 的 App 才能在首次登入自動建立 membership；瀏覽器不能靠任意 appId 自行加入其他 App。
- App 專屬角色、封鎖與上傳權限只放在 `app_memberships`。
- 中央 profile 修改寫入 `profile_audit_logs`。
- 來源 EchoStars 資料不刪除；過渡期中央資料修改採 best-effort dual-write。

## Cloudflare

目前 `echo.starry.phd` 與 `id.starry.phd` 共用 `echostars` Worker deployment，但入口仍維持 `worker/privacyCrawlerRouter.ts`，再依 hostname 將 `id.starry.phd` 分流到 Starry ID。這樣可以保留 EchoStars 與 DownloadStarry 既有安全路由與回歸測試。

中央 D1：`starry_id_db`。
