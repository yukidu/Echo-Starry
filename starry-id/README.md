# Starry ID 中央會員中心

正式入口：`https://id.starry.phd`

Starry ID 是繁星系列網站共用的中央會員身份與基本資料服務。各 App 繼續保留自己的業務資料庫，並以同一個穩定 `user_id` 關聯中央會員。

## 正式 API

- `GET /api/health`：服務與中央會員數健康檢查。
- `POST /api/google-sync`：驗證 Google ID token、解析/建立 stable user_id、建立 App membership 與中央 session。
- `GET /api/session`：驗證中央 bearer session。
- `GET /api/profile`：讀取登入會員中央基本資料。
- `PUT /api/profile`：修改允許的共用基本資料並留下 audit log。
- `POST /api/logout`：撤銷中央 session。

## 安全規則

- Google 身分使用 OIDC `sub` 為主要 provider identity；Email 僅作驗證後的 profile/遷移比對。
- Email 或 Google subject 若對應到不同 stable user_id，停止登入並要求人工處理，不自動合併。
- Session raw token 只回傳給登入端；D1 僅保存 SHA-256 hash。
- App 專屬角色、封鎖、上傳權限等只放 `app_memberships`。
- 中央 profile 修改寫入 `profile_audit_logs`。
- CORS 僅允許 `starry.phd`、其 HTTPS 子網域、既有 EchoStars workers.dev 備援入口與 localhost 開發環境。
- 來源 EchoStars 資料不刪除；過渡期採安全 dual-write，日後再切換中央讀取。
