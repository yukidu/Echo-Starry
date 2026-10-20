# 中央AI5｜N1A-S3A 真共用 Fake verifier × 離線私人統計／額度

**僅合成測試、不屬於正式網站；沒有實際 Starry ID、D1/R2/KV、Cloudflare 帳單、AI/Provider、WORM/簽章與外部服務。Production 一律 OFF。**

## 基準及引入規則
本 Draft **基於 AI2 共用 Draft #475 最新已確認 HEAD `db58589b3937b99d62a7f15edb59d7bd9688db3c`**；PR base 必須是 `safety/ai2-n1a-s3a-shared-envelope-20261020`，不是 main。該 base 本身還堆疊在 AI2 S1 #469，尚未合併。這裡**直接 import**：
- AI2 共用原函式 `security-contract-v1/s3aEnvelope.ts` → `evaluateS3aFakeEnvelope()`。
- AI5 從已驗收 S1 #471 **逐檔原樣帶入** `f22-n1a-s1/offlineModel.ts` → `fakeStats()`、`FakePrivateStatsWitness`、`FakeStarryIdSource`、`applyFakeEvent()`、`reserveFakeBatch()`、`reserveFakeAcrossIsolatedDatabases()` 等；並保留 AI5 自己的兩份 S1 回歸測試。

本批只新增 AI5 專屬橋接 `f22-n1a-s3a/syntheticStatsBridge.ts` 和 `tests/f22N1AS3aSharedIntegration.test.ts` 以及本文。**不修改共用 `s3aEnvelope.ts`、舊 #459/#466/#471、他人分支、共享 Router/Cloudflare 設定。**

## 真正串接的假資料流程
1. 僅測試用的 envelope/action/resource 經初步範圍檢查；因為共用契約尚無 `statistics.private.read` action，**目前使用 `transcript.searchEvidence` 對指定虛構 `f22-private-statistics-fake` 資源做「證據一致性先決條件」**，絕不能把它當正式私人統計操作授權。
2. 在**同一個 Node/SQLite 測試進程**直接呼叫 AI2 共用的 `evaluateS3aFakeEnvelope()`：T0/T1/T2 三階段每次重讀假 Starry ID／外部假 Witness／假 Checkpoint／當期 Fake 資源及其內容摘要。
3. 因 AI2 共用 `transcript.searchEvidence` 尚**不要求中央 super-admin**，AI5 測試專屬 Reader 每一輪額外要求 `centralSuperAdmin===true`，否則拒絕，不能僅相信假成功旗標。
4. AI5 `fakeStats()` 自己必須拿到已封存 Fake 資料快照、Fake 管理員及未撤權的獨立見證才能做**私人假讀取**。讀完但未回傳之前，**SEND** 再使用共用 verifier 重查全部當下證據，且重新執行 Fake snapshot 權限與內容驗證；任一不一致、真正還原 SQLite 舊備份、撤權、外部失聯、內容變更皆不回傳先前已讀的假數字。
5. `eventRevision`（AI5 既有 `FakeEnvelope.sourceRevision:number`）與 `resourceSourceRevision`（AI2 的 `S3aResourceProof.sourceRevision:string`，opaque ETag）轉成**不同具名欄位**，不能互相比大小或偷用數字 1 假冒 ETag。
6. Cloudflare 全帳號 budget 與 AI3 費用 `held` **不是同一帳本／單位／權威**。本機同一 SQLite handle 才能模擬 `reserveFakeBatch()`；兩個不同 DB 由原 AI5 已審查的 `reserveFakeAcrossIsolatedDatabases()` **UNSUPPORTED/UNKNOWN_LOCKED** 禁新預留，不假稱可跨 Worker／跨 Cloudflare 交易。實際費用、預留、索引寫列等沒有真資料時全部 `null`。
7. 即使合成數字可讀，回傳一律 `productionAuthorized:false`；不提供任何可在 Worker/Router 使用的真權限 token，`N1A_S3A_PRODUCTION_GATE=false`、`F22_N1A_S1_GATE_ENABLED=false`，所有 IRREVERSIBLE/Provider/Restore 仍 OFF。

## 安全反例與待解阻擋
- 非中央超管、撤銷當前管理員資格（T0 或 SQL 讀後 SEND）、假獨立 Witness 回捲／失聯／checkpoint conflict／會員刪除墓碑、SQL seal 與資料庫內容不符、同一事件跨裝置/訪客身分混用、內容 SHA256 不符、不同資料庫共用額度的假併發：**一律拒絕或明確 UNSUPPORTED**。
- **P0 共用契約缺少私人統計專屬 `S3aAction`**，已單獨送 #455 提醒中央AI2（留言 #6291808956）。在 AI2 定義專屬 action、即時真超管驗證來源、最新不回捲的真外部見證、實際分散式 SEND fence 之前，本 S3A **不能據 `searchEvidence` 的 Fake positive 宣稱已授權私人報表**。
- Fake `FakePrivateStatsWitness` 僅單機內存與一份快照，不是真 WORM／可追溯永久版本。所有讀取前／SEND 重新檢查只是逐次讀的合成模擬，**不是跨 Worker 原子封鎖**，不能解決兩個重讀瞬間之間的真競態。
- 沒有新的資料表 migration、正式 Starry ID、D1 真原子、付費來源/Workers Paid 帳單、2000 真人並行壓測；本次不能併入 main 或實際部署。

## 本批驗收
`node --import tsx --test tests/f22N1AS3aSharedIntegration.test.ts`（新增 12 個合成測試），加上從 AI5 S1 原樣引入的 `tests/f22N1AS1Fake.test.ts`（60,080 假事件/2000 假會員）與 `tests/f22N1AS1R3Security.test.ts`（舊備份、訪客跨身分重送等 7 項），及 #475 自己的 14 個合成契約測試。

最終只以**新 PR HEAD 的實際 GitHub CI / regression log** 為驗收依據，不能把自行估算當 PASS；即使全部 PASS，仍僅代表「Fake 模型在同一個測試進程的相容性」，不是正式權限、真支出或 Production 可以放行。

## 新版預期 UI（只示意，不建真 UI）
```
【F22 私人統計｜僅離線驗收】
中央超管資格  ⚪ 需最新證明
獨立安全版本  ⚪ 尚無真外部權威
私人報表        — （正式存取已鎖定）
AI 費用實支     — 未對帳
帳號額度        — 未核實，停止新統計
注意：假測試若通過，只代表流程檢查成功，不能代表網站已啟用。
```

**等待 AI2 同意統一 `statistics.private.read` 契約與下一批明確授權**。本 PR 維持 Draft，不能主動合併/部署/建立任何雲端資源。
