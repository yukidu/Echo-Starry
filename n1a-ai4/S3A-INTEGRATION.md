# AI4｜N1A-S3A：共用 SecurityProof × AI4 逐字稿搜尋純 Fake 跨模組驗收

**正式功能 OFF、未部署**。依 [中央AI2 S3A 派工 #6291692925](https://github.com/yukidu/Echo-Starry/issues/455#issuecomment-6291692925)，此獨立分支**直接繼承 #475 最新 HEAD `db58589b3937b99d62a7f15edb59d7bd9688db3c`**。Draft PR 必須以 `safety/ai2-n1a-s3a-shared-envelope-20261020` 為 base，**不能單獨合併 main**。

## 真正的雙函式同進程整合
- **原始 AI2** `security-contract-v1/s3aEnvelope.ts`：**直接 import 並執行** `evaluateS3aFakeEnvelope()`（共用版本**完全不改**）。
- **原始 AI4 S1** `n1a-ai4/searchCitationFake.ts`：從 AI4 原 Draft #473 `b7af4ddf` 逐位保留原始模組，**直接 import 並執行** `simulateProtectedQA()`、`MutableFakeAuthority.read()`（未重寫第二套私稿驗證器）。
- 本批**獨立新檔** `n1a-ai4/s3aCitationBridgeFake.ts`：從 AI4 私有假權威簽發**一次性的凍結** S3A envelope，T0 前只有中繼資料；在**同一條呼叫**由共用 AI2 verifier 重新查 T0、T1、T2、SEND，全部成功後由 AI4 原本守門程式執行自己的 T0/T1/T2 和最後假 SEND。
- **拒絕優先**：共同 verifier 任一階段 `simulatedAllowed=false`，即使 AI4 另一個模組可以放行，也不得輸出任何假正文；AI4 原 guard 若拒絕，共用結果為假成功也無法放行。沒有每次重新發一張新的 envelope 隱藏權限/來源版本變更。
- 外部 witness、checkpoint、Starry ID、會員/來源和 attestation **均為一個 JS 進程內的虛構假物件**；函式假定多讀者來自獨立權威，但此測試**不能證明真正的不同帳號、防共同回捲、真簽章、網路鎖或撤權瞬時一致性**。
- 共有 20 項假整合情境，含一般會員查 VIP、混合兩份音檔、T1 撤權、T2 更正/刪除/偷偷換原文、SEND pending、獨立見證及 checkpoint 失聯/倒退、重放身分拒絕，以及 2,000 個無見證的虛構 Promise 呼叫。**不是 Cloudflare 2,000 真人壓測**。

## 正式禁令與不合併邊界
- `N1A_S3A_PRODUCTION_GATE=false`，`N1A_AI4_PRODUCTION_ENABLED=false`，`AI4_S3A_PRODUCTION_ENABLED=false`。無任何真路由 import，不執行 D1、R2、KV、Cloudflare Worker、Starry ID、真會員資料、真 AI/Whisper、扣費或實際輸出受保護音檔；`productionAuthorized=false`、`providerCalls=0`、`restoreWrites=0`、`irreversibleActionsAllowed=false`。
- AI2 #475/舊 #469 原碼不更動，AI4 #465 中文搜尋演算法、#468 **48題已凍結盲題**不動；既有來源 Top-5 **19/40=47.5% FAIL**，本批的安全測試不能用來稱搜尋品質過關或啟用搜尋。
- 無額外雲端資源、沒有增加真 provider 請求；正式 Starry ID 逐稿權限、雙帳戶 witness+已知最新 checkpoint、T2→HTTP 首位元組跨 Worker 發送柵欄及實際 D1 rows-read 計費仍 **BLOCKED**。
- S3A 是依賴 #475 的 **stacked Draft**；只應以 #475 head 比對本批**額外**檔案，不可拿含 AI2 #469/475 未合併內容的總 PR diff 直接合併。

## CI 本批獨立驗證
`node --import tsx --test tests/n1aAi4S3aIntegrationFake.test.ts`

GitHub 原有 Regression Audit / CodeQL 應另外驗證；不可用單獨 lint 綠燈冒稱 20 個新測試都通過。任何失敗要保留 FAIL 並在本身 Draft 分支修正；絕不修改共用 #475 驗證函式或變更已凍結盲題。
