# AI6 OPS-S1 — S76 隔離唯讀健康中心（Draft / OFF）

此資料夾是**獨立工程雛形**。未掛載正式 Worker/router、未編入正式 App 導覽，也沒有正式 Cloudflare API、D1/R2/KV、金鑰、費用、重試、Workflow 操作與定時工作。`mockPreview.html` 可用瀏覽器離線開啟，只接受手動選擇虛構情境。正式管理員身分仍**尚未整合**。

## 功能邊界

- `healthModel.ts`：六類服務的四態（正常/警示/故障/未知）、來源/觀測時間/可靠性/用量門檻。無資料、失去權限或超時只會回未知。
- `readOnlyHandler.ts`：模擬的兩個唯讀 GET 介面，**必須注入**已驗證、未過期的中央超管身分；沒有驗證器就無法呼叫。資料來源只接受 `readMockObservations`、`readMockIncidents` 注入；不能直接查雲端。回應欄位白名單，不回傳 email、姓名、音檔/逐字稿、trackId、token 或 raw error，明細最多 25 筆，錯誤或缺數顯示未知。
- `mockPreview.html`：完全離線且獨立的手機/桌機 UI；歷史 37 JSON/4 次 10034/3 次終止**只能當歷史**，不當今日故障。
- `../tests/opsS1.test.ts`：16 項本機假資料安全測試（純 Node），不對正式資源執行。

## 本機驗證

```sh
node --experimental-strip-types --test tests/opsS1.test.ts
npm run lint
# 完整 GitHub PR CI 另包含既有 regression、CodeQL 與 Workers Preview Build
```

## 上線阻擋（要由中央AI 2 另批核准）

1. 尚未取得**真實中央超管驗證器**；現有 Fake 模擬不等於真人授權。切忌把目前的 `verifyCurrentCentralSuperAdmin` 以接受前端任意角色替代。
2. 尚未有低權限、唯讀 Cloudflare metrics/帳單 adapter；有 binding 不代表健康，Billing 403 不能顯示 0。不可把帶 `terminate` 權限的 OAuth token 塞進本模組。
3. 未完成 Cloudflare 免費額度實測、2000 人壓力/權限端到端測試；內存限流只能限制單個 isolate，不能保證全球帳號絕對請求次數。
4. #461 是 Draft，不可在正式 D1 查 `transcript_runs`；舊 main 逐字稿 3 小時逾時重排風險沒有在本功能修復，**本模組不得動它**。
5. 需新授權才可接正式入口、正式 Cloudflare 讀權、進行 Preview 真資料驗證、合併或 Production；本 PR 不附任何 Cloudflare 設定變更。
