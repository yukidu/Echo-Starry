# 中央 AI2 G1：六項正式資料工作流程安全防護

日期：2026-10-22（台灣時間）。中央任務：https://github.com/yukidu/Echo-Starry/issues/455

**狀態：Draft / 禁止合併 main / 禁止 Production 部署。** 本次只修改安全分支，沒有讀寫正式 D1/R2、Worker、Secrets、會員資料，也沒有執行 Migration、付費 API 或 Production 部署。

## 本次新增與既有 PR 的關係
本安全分支直接從既有的 G0 草稿 PR #493 最新 HEAD 延伸，沿用原六項人工觸發、限定 main、特定核准字句、Protected Environment、缺專用密鑰拒絕，以及全組序列化，不重寫為互相衝突的第二套保護。新批次只做憑證最小權限與回歸測試加強。
- 將 Cloudflare API Token / Account ID、LINE 密鑰從 workflow/job-wide scope 改為實際執行遠端操作的個別 step。
- 不再讓 checkout、npm install、程式檢查、資料加密或 artifact 上傳預設繼承雲端密鑰。
- 新增 tests/ai2G1CredentialIsolation.test.ts 驗證六項工作流程，且故意破壞觸發、分支、環境、憑證範圍與核准時必須報錯。
- 此 PR 是建議替代 PR #493 在同六項 workflow 的整合來源；請勿分別合併 PR #493、本 PR 和 PR #500/#504/#505 的相同 workflow 版本，應由 AI2 選一條唯一整合路線。

## 涵蓋的六個流程
1. starry-id-health-repair.yml：Starry ID D1 健康修復及保護。
2. starry-id-migrate.yml：中央會員與電池帳本搬移、舊帳本退役。
3. starry-id-provision.yml：中央會員 D1 建立與盤點。
4. starry-id-spouse-backfill.yml：配偶關係回填。
5. starbeauty-deploy.yml：Starbeauty 建立 D1/R2、部署 Worker、設定 LINE 密鑰。
6. starry-id-private-report-export.yml：中央私人加密報表匯出。

## 尚未獲得證明的正式安全條件（缺一即 BLOCKED）
- GitHub Settings / Environments / starry-production-write 必須由具有權限的管理員獨立確認 Required reviewers、阻擋自審、最小權限 Environment Secrets 及真人批准紀錄。安全流程寫有 environment 字樣及 Secret 存在，**不等於**已真正做到雙人核准。
- Cloudflare API Token 應限制權限、服務與用途；核實帳號、所需 D1/R2 與 Worker 部署範圍。秘密不能貼到 GitHub 文字、檔案或交接包。
- 原 GitHub main 尚有部分敏感工作流程可被特定 main push 觸發；**Draft PR 未合併前不會保護既有正式主線**。合併前必須核實其它可能操作正式環境的 workflow、main push 風險與資料備份。
- 本 G1 修正不包含任何遠端資料恢復、真雙人批准、付費 Provider 啟用、2000 人壓測或 AI3–AI7 整合品質認證。五組 Gate 未 PASS，方案 B 正式部署仍然 BLOCKED。

## 測試及 Release Gate
- 原有 tests/ai2ProductionWriteWorkflowGates.test.ts 和 tests/v271StarryIdCentralHealthRepair.test.ts 必須繼續通過。
- 新 tests/ai2G1CredentialIsolation.test.ts 全部正向及安全破壞負例 PASS。
- GitHub 此 PR 精確 HEAD Regression audit、CodeQL 及建置均成功，且 PR diff 不包含產品 Router、D1 migration、本體金鑰、Cloudflare 資源變更。
- 最後需中央 AI2 與使用者另外批准 merge/正式操作；此批只提交 Draft PR，**不執行正式部署，也沒有新正式回復代碼**。
