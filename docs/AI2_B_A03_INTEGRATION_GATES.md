# 中央 AI2｜方案 B / A03 五組離線整合（仍非正式功能）

狀態：**Draft / OFF / 禁止合併 main 與 Production 部署**。本分支由中央安全 PR #493 的
`32d5d5b43226b840b87167ae8f0aa25848b3ab4e` 建立，不直接修改正式網站。

## 合併來源及邊界
- AI3 #497：`worker/starryAiA03OfflineLedger.ts`、暫存 SQLite 表與測試，Provider = OFF、未接正式 router。
- AI4 #496（搭配 #486/#492 的封存合成資料）：已加入離線搜尋測試及封存評分器；
  中央 AI2 在本整合分支修正 A02 的舊基準比較 bug（原測試用雙重跳脫 regex + 僅第一段逐字稿，導致錯誤的 0/0），
  新版修正的 Python source blob 為 `3c83e2c9bf42fb353b220ff59da6c4f0edb7a92f`；
  保留 A01 frozen fixture blob `93bf9fcb0b793a7d9904b85ce5ed699b0a906549`。
  **此修正僅讓「前後比較」可重現，不代表已經完成獨立盲測、權限測試或正式搜尋實作。**
- AI5 #498：`ai5-a03/privateStatisticsGate.ts`、離線 SQLite 隱私/匯出測試，私密路由 = OFF。
- AI6 #494：僅 `tests/ai6A03AuthorityContract.test.mjs` 的參考授權模型，**沒有**中央 Starry ID 實際權威接線。
- AI7 #499：獨立本機 SQLite + fake R2 的 50 案例 runner，**沒有**真 Cloudflare D1/R2 還原。
- G0 #493：六項可能接觸正式資料或部署的 GitHub workflow 改為手動啟動與環境審核；仍須 repo owner 證實 Environment 的 required reviewers 和專用 secrets。

各來源主要是新獨立檔案（AI4 baseline 在本分支有獨立修正），沒有修改其他團隊既有的產品 router。合併到同一個安全分支只代表
**相容性測試**，不是功能已在正式 Web App 啟用。

## 剩餘的正式部署阻擋（任一 UNKNOWN/FAIL = 不可上線）
1. AI4 A03 #496：原始 GitHub CI 在 A01 before-score 算出 0/100、0/100，屬比較工具 FAIL；
   AI2 已在本整合分支以 A01 原邏輯、全部逐字稿修正 baseline，更新測試依據精確 Git blob SHA，
   等待 GitHub runner 回報是否真的重現 54/100、66/100。即使本已知題庫候選 Top-5=96/100，
   **仍缺由獨立審查者建立的封存新盲測、無來源拒答及正式授權/引用零洩露**。
2. AI3：費用的跨 App 唯一權威、持久 one-time SEND、真 Provider 收據及帳務核對沒有證據；
   維持 NT$0 新增付費授權。
3. AI5：`stats.private.read` 和 `stats.report.export` 需要正式 Starry ID 驗權、不可競速的 SEND fence；
   零私密 bytes 需跨 Worker 验證；目前不啟用。
4. AI6：測試內記憶體參考模型不是真中央權限服務；真正的 session/role/permission revision、
   revoked、resource/source、restoreEpoch 權威待整合。
5. AI7：需要隔離真 D1/R2 復原演練、獨立 latest head/floor、兩位不同真人批准、可核對 RPO/RTO，
   否則 RESTORE/DELETE/CLEANUP 鎖定。
6. GitHub `starry-production-write` 必須獨立核實 reviewer/禁止自審、專用憑證和最小權限。
   Cloudflare Production Build/正式網址驗證和可回復的 release SHA 尚未完成。
7. 現有正式 `wrangler.toml` 同時把 Echo 和 Starry ID 綁在 `echostars` Worker：
   真跨 App 隔離驗證仍未完成。禁止把 Preview CI 當正式安全保證。
8. 2,000 人容量與多執行者故障/競速是真實負載目標；不能把 2,000 筆合成循序測試當實測。

## 正式功能整合後的驗收順序
先統一權威及權限契約 → AI3 原子帳本 / AI5 私密輸出共用權威 →
AI4 獨立搜尋盲測 → AI7 真隔離沙盒恢復 → 2K 負載和故障實測 →
正式操作人為核准 → main + Cloudflare Production Deploy → 正式網址驗證 → 還原 commit。

**本分支不可單獨 release。** 所有新功能 Gate 預設 OFF；無 schema 遠端 migration、無付費、無真資料讀寫。
