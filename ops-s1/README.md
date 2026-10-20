# AI6 OPS-S1 + OPS-I1 — S76 / S2367A 隔離唯讀健康中心（Draft / OFF）

此資料夾是**獨立工程雛形**。未掛載正式 Worker/router、未編入正式 App 導覽，也沒有正式 Cloudflare API、D1/R2/KV、金鑰、費用、重試、Workflow 操作與定時工作。`mockPreview.html` 可用瀏覽器離線開啟，只接受手動選擇虛構情境。正式管理員身分仍**尚未整合**。

## 功能邊界

- `syntheticEvents.ts`：S2367A 獨立假資料事件對接。只接受 AI2 `dispatch_uncertain/processing_timeout/workflow_failed`、AI3 `b07_uncertain_hold/b07_stop_new_spend`、AI7 `backup_anomaly/restore_locked/backup_integrity_fault` 的固定白名單；映射六大服務卡片的警示、故障、未知與匿名事件。假身分資訊一律不進輸出；失聯、過期、來源不合與大量資料採保守 unknown；有可信故障時優先保留故障。`createMockSnapshotReader()` 在隔離測試中提供 60 秒按需共用結果與併發合併，**沒有任何週期輪詢**，也不保證不同 Cloudflare 區域共用。
- `healthModel.ts`：六類服務的四態（正常/警示/故障/未知）、來源/觀測時間/可靠性/用量門檻。無資料、失去權限或超時只會回未知。
- `readOnlyHandler.ts`：可選擇注入 `readMockSyntheticEvents`，彙整六服務模擬卡片與匿名事件；來源出錯時未知，**不會因舊有正常樣本轉綠**；2000 假用戶讀取由 60 秒內的同一記憶體快照合併（非帳號級配額控制）。
- `readOnlyHandler.ts`：模擬的兩個唯讀 GET 介面，**必須注入**已驗證、未過期的中央超管身分；沒有驗證器就無法呼叫。資料來源只接受 `readMockObservations`、`readMockIncidents` 注入；不能直接查雲端。回應欄位白名單，不回傳 email、姓名、音檔/逐字稿、trackId、token 或 raw error，明細最多 25 筆，錯誤或缺數顯示未知。
- `mockPreview.html`：完全離線且獨立的手機/桌機 UI；歷史 37 JSON/4 次 10034/3 次終止**只能當歷史**，不當今日故障。
- `../tests/opsS1.test.ts`：原 S76 16 項 + 12 項健康模型回歸，共 28 項純 Node Fake 測試。
- `../tests/opsI1.test.ts`：26 項 S2367A 純 Node Fake 測試；驗 AI2/3/7 整合、四態與可信故障優先、過期/失聯/錯誤來源、匿名事件、2000 未登入者零讀、2000 已核准假管理員共用單次本地假資料讀、無新排程或收費。

## 本機驗證

```sh
node --import tsx --test tests/opsS1.test.ts tests/opsI1.test.ts
npm run lint
# 完整 GitHub PR CI 另包含既有 regression、CodeQL 與 Workers Preview Build
```

## 上線阻擋（要由中央AI 2 另批核准）

1. 尚未取得**真實中央超管驗證器**；現有 Fake 模擬不等於真人授權。切忌把目前的 `verifyCurrentCentralSuperAdmin` 以接受前端任意角色替代。
2. 尚未有低權限、唯讀 Cloudflare metrics/帳單 adapter；有 binding 不代表健康，Billing 403 不能顯示 0。不可把帶 `terminate` 權限的 OAuth token 塞進本模組。
3. 未完成 Cloudflare 免費額度實測、2000 人壓力/權限端到端測試；內存限流只能限制單個 isolate，不能保證全球帳號絕對請求次數。
4. #461 是 Draft，不可在正式 D1 查 `transcript_runs`；舊 main 逐字稿 3 小時逾時重排風險沒有在本功能修復，**本模組不得動它**。
5. 需新授權才可接正式入口、正式 Cloudflare 讀權、進行 Preview 真資料驗證、合併或 Production；本 PR 不附任何 Cloudflare 設定變更。
