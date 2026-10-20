# 中央AI5｜N1A-S1 F22 安全假資料原型

**本目錄僅供離線 Node 22＋SQLite 測試；不是正式統計方案。正式 Gate 永久 OFF：** `TEST_ONLY=true`、`productionAuthorized=false`、`F22_N1A_S1_GATE_ENABLED=false`。**不匯入 Worker Router、Starry ID、D1/R2/KV、AI/Provider、Cron、公開排行榜或真正帳單。**

## 針對 #459／#466 的四項既有整合 FAIL

1. **會員 vs 訪客**：`FakeStarryIdSource` 模擬受信任的 Starry ID 會員對應，來源第一次確認時凍結 `identityKind=registered|guest|unknown`；未確證者絕不納入 `registeredMembers`。訪客只列 `guestCalls`（不聲稱不重複訪客人數）；註冊後不默默回溯改寫舊事件。
2. **歷史時刻與時區**：事件只記第一次來源接受的 `acceptedAtUtcMs`，查詢一律 `[startUtc,endUtc)`。今日／7／30 天使用台灣日曆起點與精確 as-of 時刻；未來可依 IANA `Asia/Taipei` 升級在地日界處理，不能把 Fake 固定 UTC+8 直接用於所有歷史時代。絕不把截止時間後的同日事件算入。
3. **跨裝置同事件**：同一後端來源 `originAppId+logicalSourceId` 決定原封不動 `globalEventId`；同版同摘要去重、舊版本忽略、可信新版修改同一事件；相同版本不同內容或不合法 Fake 簽章阻擋。**本機 issuer 的 map／HMAC 秘密只是 Fake**，真事件 ID 仍須由可持久化的可信後端在首次接收時核發，不能靠手機文字/裝置 IP 判斷。
4. **跨工作者額度預留**：模擬 16 個共用同一 SQLite 檔案的工作者，`BEGIN IMMEDIATE` 獨占單帳號原子預留；80% 停止非必要、100% 硬拒新統計，來源缺失/逾時/鎖被占/重播不一致則 UNKNOWN 拒絕。發生不明結果的預留只轉 `uncertain`，不偷偷釋放或再跑。**這不是 Cloudflare 官方用量 API、D1 多 Worker 鎖或實際防超支**。

## 假資料欄位、效能、安全

- 每筆記 `globalEventId`、單調版本、digest、registered/guest/unknown、HMAC 假名（僅註冊者）、UTC 第一次接受時刻、音檔碼、pending/done/failed 與撤銷標記，不存 Email、原始問題或姓名；API 僅回匿名聚合，沒有將事件鍵／會員鍵回前端。
- 新版驗證以來源 HMAC 作離線 test trust root；**這不是可用於正式 Starry ID 的身份驗證、可信外部 N1A anchor、簽章金鑰管理或永續事件登錄**。現有 #459 超管 Router 不更動、不整合。
- 假 SQLite 原型為方便精確驗證，以受限 `COUNT(DISTINCT...)` 查事件正本；長期 2,000+ 人須改成按日分段和 membership presence 及跨日期精確去重，不允許正式 API 每次掃 60,080 筆。
- 假測試 2,000 人與 60,080 筆事件；另外 2,000 個**邏輯工作項**經 16 個共享 SQLite 連線輪流預約（**不是** 2,000 個真人/執行緒同時在線），再用兩連線的持鎖衝突模擬寫入競爭。
- 未提供官方查證的帳號 Plan、D1 官方即時讀寫、索引增量、Worker CPU；帳號實際支出 **UNKNOWN**。Free 日配額與 Paid 月包含量不能混用。Fake `readCap/writeCap` 代表**需 AI2/使用者核准**的保護上限，**不是官方真用量或保證免費**。
- 80%/100% 的門檻由 **原子預留後的讀寫總數**計算。正式必須處理其它 App 未參與同一預留、觀測延遲、檢查成本、跨帳戶/週期 rollover、實際 SQL `meta.rows_read/meta.rows_written`、與 B07 真費用簽核分離。N1A 的獨立安全版本錨點**不是**自動提供原子額度資料庫。
- 撤權、刪除、高水位版本防回捲，仍需 AI2／AI7 真正外部見證選址/驗證；**本模型未提供可信外部見證**，不得因此開啟正式會員統計或 F24 公開榜。

## 可重跑測試

```bash
node --experimental-strip-types --test tests/f22N1AS1Fake.test.ts
```

在 Repo 既有 Regression audit 將自動執行新增測試檔；請以實際 GitHub CI 日誌判定通過，不把規格當實作。

## 本批允許範圍及後續阻擋
本批從 main 新建 AI5 專屬獨立 branch／Draft PR，**只新增本目錄兩個檔案（程式與本說明）及一份 tests**，不能覆寫 #459、#466、#461、AI3/4/6/7 的程式。CI／Preview 僅安全分支結果，**禁止 merge、Production、付費、真 D1、真人會員、真 AI、雲端資源建立**。後續接真服務須另經使用者明確同意，並先解決真正 N1A 權威事件 proof、原子帳號預算、撤銷水位、可靠多區負載與用量量測。