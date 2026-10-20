# 中央 AI3｜S3-B07 獨立安全開發：僅 Draft PR（2026-10-20）

**本分支不合併、不部署 Production、不讀寫 Cloudflare 正式 D1/R2、沒有真 AI 呼叫、沒有付費。**
中央 AI2 在 [#455 授權留言](https://github.com/yukidu/Echo-Starry/issues/455#issuecomment-6286146755) 確認 S3A；
主基準 main `60fc222f076dd0c9821a76df780414d78f0538aa`。
所有 B07 原始底座由原 #458 私有檔案複製，**沒有**直接改 #458，也沒有修改 #461/#457/#459/#460、
中央共用 Router、正式 app 入口、Whisper、問答、電池或會員資料。

## 包含內容

1. `worker/starryAiB07Budget.ts` + `starry-id/migrations/20261020_ai_b07_budget_guard.sql`：
   從 #458 保留的「全域 / App / Task / Member」原子帳本、防重、NT$0、暫扣／已結算／不明／作廢，
   **未接任何實際 AI 入口**。
2. `worker/starryAiB07S3Safety.ts`：後端私有 `reserveRunMax`、`claimProviderAttempt`、
   `completeOrHoldUncertain`、`finalizeRunMax`、`cancelNeverSentRun`、`reconcileByProof`。
   **一次 INSERT 才能拿到一次「可能送達」票；同 key/同 segment 重送不能再拿第二張。**
   Timeout／中央回應遺失／租約失效都不自動補發 Provider。
3. **只新增** `starry-id/migrations/20261020_ai_b07_s3_attempt_guard.sql`；
   `run_plans`、`attempts`（含 unique key、排他、immutable）與 `reconciliations`（唯一請求、雙人核准、
   只追加之原子用量補償）。既有 `uncertain` 原帳本**永不改寫**，
   有正式證據及兩個獨立審核者才可透過新事件表結案；同一證據再送不會重複扣費或釋放 hold。
   不准把「簽名／收據」由瀏覽器自稱有效；目前沒有接真人審核端點。
4. `tests/s3B07ProviderAttempt.test.ts` / `tests/b07-s3-fake-d1.py`：
   本機 TS helper + 真 SQLite、假模型／假餘額／假收據／假 reviewer、
   80 次重送、未知結果、失聯、重複補償、限額／權限及 SQL 竄改驗收。
5. 保留 #458 的完全本地 2000 假帳號 SQLite 及 127.0.0.1 HTTP 演練，
   修正 `tests/b07-offline-http-fake-users.mjs` 的 CodeQL #30 外洩：
   **HTTP 只返回固定 `invalid_local_request`／`local_simulation_failed`**，
   不對外傳 `String(err)`、stack/path。
   CI 掃描必須重新驗證，新 PR 沒有權限直接 dismiss 原 #458 的警示。

## 安全設計限制（主動 fail-closed）

- B07 仍是**未整合**的控制模組。此分支沒有增設登入 route／服務呼叫者，
  **不能拿這個 PR 宣稱 Echo/Whisper/OpenAI 或 Mirror/Eye/Sync 已被保護**。
- 提供者真實價格、Cloudflare 全帳號免費 neurons 餘額／當日消耗、Provider 收據格式：
  **無可信權威資料，所有正式費用一律未知，不准啟用**。
  `free_verified` 類別額外要求「**獨立的帳號級權威用量查核介面**」；
  本批只用 fake 注入測試。B07 本地 free counter 不能證明其它 App 沒使用免費配額。
- 一回性 ticket 在發送網路前即認定 `may_have_sent`。
  換句話說，如果 Worker 在取得 ticket 後立即崩潰，即使實際沒送出，
  我們也會**保守保留費用**，由人工確認；這是避免未知情況重複計費的安全代價。
- 提供者真實「exactly-once」在網路故障且對方沒有冪等回執時**無法保證**。
  本方案保證的是本地帳本不會針對相同鍵再次**核發** Provider 票，
  並採「不明就不自動重發」。
- 後續執行端由 AI2 在 **另一批正式授權**後，
  由真身份/track/音訊 ETag/權限 epoch/lease 決定 `runAuthority`，
  取得 ticket 才能送 Provider，且回傳的 token 只能在受信任 server-side 用一次。
  本 API 參數不適合直接暴露網頁，更不能把前端傳的 `verified:true` 視為授權。
- 一次 run 的 max_units = `segmentCount × maxAttemptsPerSegment × maxUnitsPerAttempt`；
  目前嚴守同一段最多一張 ticket（即使預留了多次重試的最大費用）。
  後續如需真正重試必須有**另一次新批准／可核對的未送達證據**，
  不自動二次發送。帳款確認後結算可以少於原 hold，但無法超過。
- `uncertain` 帳款原紀錄保留，審核後新補償事件改中央四層 usage 的
  held/settled 分佈，絕不回捲原 request_key；兩位 reviewer 認證
  由未接入的 `B07_REVIEW_AUTHORITY` 完成。假資料測試不代表已通過真人授權或實際帳單。
- 跨 Echo DB／Starry ID DB 沒有跨庫原子交易；
  任何中央 hold 已成立但 Echo queue 未完成的狀況必須人工對帳，
  不可自動把不明 hold 當成功／釋放。
- 確切供應商單價／幣別換算尚未查證；測試中單位與 microTWD 都是假價格，
  **不是實際 Cloudflare 或 OpenAI 費率**。
- AI7 #457 的備份/還原與中央 Router 整合仍待合併後驗收；
  原 #458 的兩項 AI7 組合測試 SKIP 仍**不得冒稱已通過**。

## 下一次驗收前阻擋

- CI 的 TypeScript、Fake tests、CodeQL 和 Preview 全綠**只能證明分支／本機安全**，
  不代表 Production、2,000 同時用戶或真實帳單安全。
- 真正 S3-B07 接入 AI2 #461 `assertUnfundedWhisperBlocked` 前，必須先完成
  專屬服務間身份、最新權威撤權、資料庫對帳、正式費率與 provider spend cap 及
  失敗併發測試。**本批任何形式都不得拆除此拒絕函式**。
- 本分支 GitHub Actions 若自動跑 Preview，必須使用 existing `wrangler.toml`
  `previews={}` 隔離設定，**沒有正式 D1/R2/KV bindings**，禁止網頁真實用量測試。
- 所有紀錄回報 [GitHub #455](https://github.com/yukidu/Echo-Starry/issues/455)，
  AI2 統一安排後續 PR 合併，**不得由 AI3 自行合併**。
