# 中央 AI2 D｜Echo × Central ID v2 單一測試會員雙軌接入（S1）

依據（2026-10-23）：
- [新版正式交接契約](https://github.com/yukidu/Satrry-ID-Center/blob/main/central-id-v2/ECHO_CUTOVER_HANDOFF_20261023.md)
- [中央端服務端票據兌換參考程式](https://github.com/yukidu/Satrry-ID-Center/blob/main/central-id-v2/echo-adapter/echo-central-ticket-client.mjs)
- [中央端上線與後續阻擋 Issue #15](https://github.com/yukidu/Satrry-ID-Center/issues/15)

## S1 的變更範圍

本批是**僅供驗收的 Draft PR，不 merge、不部署、不操作正式 D1/R2/Worker、DNS、Secrets 或付費服務**。
截至建立本分支，Echo main 基準：\`82cbf4f112af57fcfed12ff2f6cf86010c03560e\`。

新增：
- \`worker/echoCentralV2Ticket.ts\`：延用中央正式 helper 的固定 URL、42～48 字元票據、6.5 秒逾時、8192 回應上限、scope/member status 及 echo ID 契約驗證。只在 Worker 端呼叫，絕不隨前端打包，也不建立帳號。
- \`worker/echoCentralV2Canary.ts\`：極小化測試登入頁、同站 HttpOnly 隨機 state cookie + sessionStorage、第一方 Google 票據導轉、/auth/callback 的回收與 URL 清除、受保護 Echo 本地兌換。**來源必須明確指定 \`source:'central_v2'\`，新票據絕不交給舊的 \`starry_app_auth_codes\`。**
- \`worker/starryEcosystemSsoRouter.ts\`：僅修改 Echo 的登入兌換分流、受控頁面，舊 SSO 與其他業務路由維持原程式。
- \`src/ecosystemSsoClient.ts\`：只對成功以新 v2 兌換的本機 Session 停止舊中央背景登入同步（避免剛登入就被清除或覆蓋），其他用戶維持舊路由。新中央登出為 best effort，第三方 Cookie 受 SameSite=Lax 限制，不得視為跨站全域登出證據。
- \`tests/echoCentralV2Canary.test.ts\`：全是假會員、假 Echo DB、假 HTTPS Provider；含開關、精準 ID、停權、拒絕冒名、無對照拒絕、session 不匹配、來源安全、舊路徑保留等。

**刻意不改** \`src/googleCredentialExchange.ts\` 一般 Google 登入（仍在舊 Starry ID），也不改既有 \`/api/tracks\`、音檔、電池、通知、\`/api/users/google-sync\`、其他生態系 App、資料表或登入/獎銜權限模型。一般會員及所有未測試 App 目前仍走舊路由。

## 僅供一名指定會員的安全控制

兩個伺服器設定必須**同時**出現，否則測試路由返回 404/503：

- \`ECHO_CENTRAL_V2_SSO=true\`：明確打開受控測試入口。
- \`ECHO_CENTRAL_V2_TEST_USER_ID\`：**單一精準新版中央 starryUserId**，由信任的管理員透過受保護的環境設定，不寫入 GitHub、文件、Issue、PR 或測試紀錄。禁止 Email/姓名作匹配。

未啟用時，原登入完全不變。開啟後指定測試人員由 \`https://echo.starry.phd/auth/central-v2\` 進入**專屬** Google 登入；一般首頁、一般 Google 按鈕及背景 SSO **不會自動走 v2**。

- Google GIS ID Token 由瀏覽器 POST \`https://id.hglobal1985.com/api/google-sync\`，驗證成功只接受 URL origin 恰為 \`https://id.hglobal1985.com\`、path 恰為 \`/auth/echo/continue\` 的 \`continueUrl\`；再用頂層導轉（非第三方 Cookie）完成 Google/第一方 session 與一次性票據。
- 新中央以 HTTP 303 回到 Echo \`/auth/callback?code=...\`；Echo 只有持有先前產生的 host-only、HttpOnly、Secure、SameSite=Lax 180 秒 cookie 才啟動 v2 callback UI。Callback 用一次性 \`sessionStorage\` state，清除 URL ticket 後同站 POST \`/api/auth/ecosystem-exchange\`，並附 \`source:'central_v2'\`。
- Echo Worker 必須有同一 state Cookie 和明確 Origin、後端雙開關；服務端向固定新中央 API 兌換，再核對 \`starryUserId\` **等於唯一測試會員**，\`echoLegacyUserId\` **存在且精確對應** \`env.DB.users.id\`，且 \`isBlocked!==1\`；最後才建立**舊有 Echo 本地 session**、從原 Echo \`/api/auth/session\` 取得本地原始個人資料及權限。
- 共用裝置保護：測試登入頁不允許在已有 Echo 快取會員時直接更換身分；若瀏覽器有舊 Echo HttpOnly session Cookie，必須先驗證當前帳號與新票據的精準 Echo ID 完全相同。新票據回應先不寫入新的 Echo Cookie，等瀏覽器確認並儲存正確帳號後，再依原 Echo /api/auth/session 機制建立第一方 Cookie。
- **絕不**用 Email 或姓名自動比對、建立新的 Echo users、搬移電池、認證獎銜、建立任何新的管理員權限；無映射統一 \`identity_link_missing\`。
- 任何拒絕與故障**只給使用者返回原登入的連結**，不拿新 code 呼叫舊 consume、不自動重送票據，不寫私密資料到 log。

## 一鍵關閉與回退

當測試異常：
1. 受保護環境將 \`ECHO_CENTRAL_V2_SSO=false\`；立刻停止**新的**受控換票與測試登入（如用 Deploy 設定開關而需重新發布，則必須有獨立的明確部署權限與版本驗證；本 PR 不執行）。
2. Echo 正常首頁、\`id.starry.phd\`、一般 Google 登入、原本電池及音檔 API **仍保持原路由**；測試會員手動返回原登入入口。
3. 舊本地 session 由 Echo 登出端撤銷；如果已建立 v2 中央 Cookie，單靠跨網域 fetch 不保證可登出新 ID，因此需要在新中央的一方瀏覽器頁面補完成登出並人工驗證。
4. 啟動新方式前保存原版本 SHA、製作完整演練及真實還原；本次 Draft **沒有新 Production 版本或部署還原代碼**。

## 尚待補足（正式切換禁止）

- **Google OAuth** 新網域（aud/Origin）正式設定與真正使用者 GIS ID Token 串接，Chrome/Safari、Android/iOS/PWA Browser 及 Google 多帳號切換；目前只提供假資料／單元隔離測試，不能當作真人 End-to-End。
- 第三方 Cookies 限制、第一方導轉與 callback 同一瀏覽器 tab 的 sessionStorage 保留、CSRF/Login-state 結合、切換後登出能否完整撤銷；Apple 登入屬另一工作。
- 70 筆舊 Echo 本地映射的未映射例外，帳號合併驗證；新版中央的增量/撤權即時檢核正確性由中央團隊實機驗證。**伺服器使用一回票據只保證單次登入，現有 Echo 長效 session 之後的持續撤權行為仍須另外設計與驗收。**
- 新舊跨 App userId/role/獎銜/公開資料源權威尚未完整切換，嚴禁把 \`legacy_unverified\` 當已核准最高管理權限。
- 所有真測試都必須在有適當權限並完成隔離後進行；本 PR 禁止 Cloudflare Preview、Production 或正式 D1 操作。
- AI2 G1 [安全 PR #507](https://github.com/yukidu/Echo-Starry/pull/507) 延伸自舊 main，尚未合併；該 PR 修改 \`.github/workflows\`，本 PR 修改 Echo SSO router 與 browser sync，無相同檔案直接衝突，但**合併時須先重新檢查最新 main 和所有草稿 PR**，包含 H-Global SSO PR #503 對共用 router 的可能重疊。
- 維持中央 [#455](https://github.com/yukidu/Echo-Starry/issues/455) 方案 B 一次正式部署，全五組安全／品質 Gate 未通過之前 **BLOCKED**。
