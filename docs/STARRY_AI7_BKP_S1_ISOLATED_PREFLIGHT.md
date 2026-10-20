# AI7｜BKP-S1 隔離安全備份驗證器（S76 授權草案，2026-10-20）

## 位置及安全界線
- `worker/starryBackupBkpS1.ts`：**純離線、僅判定**的程式函式。`BKP_S1_RUNTIME_ENABLED=false`；沒有正式 Router、Worker binding、Cron、部署設定、移轉 SQL、Cloudflare 客戶端、備份匯出、物件刪除、正式還原與上線 API。
- `tests/starryBackupBkpS1.test.ts`：R01–R18、manifest 改寫、非獨立權威、legacy 標註、lastGood、保留期限及 SQLite 零筆更新的完全假資料測試。
- 此 PR 與現存 #457 備份設定頁、#461 逐字稿 P0、#458 B07、#460 搜尋分工分離；**不會把現有介面接到本驗證器**。

## 判定合約
1. 備份鏈必須從一份可信全備出發，差異鏈的 parent、base、狀態、先後順序一致；每份 manifest JSON 的 SHA256 與**假定由獨立權威提供的已信任雜湊清單**一致，選取項必須等於 `lastGoodId`。
2. D1 的 active 指標只能指向 `published`、歷史保留版只能為 `approved-history`。待核准/失敗候選不可假冒已發佈稿；會員訂正/解鎖/獎勵唯一鍵及水位、撤回交易、不變的刪除／權限事件必須一致。
3. 每份公開逐字稿的 JSON/TXT/VTT 必須逐檔重新算 SHA256/UTF8 位元組數，再用 JSON 實際段落重新算 `segmentCount` 與 `timecodeHash`，比對 VTT 文本及起迄碼；新稿 raw 檔必需存在且含 segments。歷史舊稿確定未留 raw 時，需明確 `legacyMissingRaw=true + rawOrigin='legacy-unavailable'`，只能作核准歷史紀錄，不可替新發佈版免除 raw。
4. **沒有獨立、現時、可驗證的權威來源（即時刪除、撤權、高水位、不可倒退 restoreEpoch）時一律拒絕。** 權威 epoch 必須嚴格大於快照 epoch，任何權益/刪除水位更舊或來源不可查不得放行。測試中的權威完全是記憶體 Fake；目前沒有授權連正式 Starry ID 或新建資源。
5. 恢復只能處於 `stagingOnly=true` 且 `searchLocked=true`、`publicationLocked=true` 的**假想隔離檢查階段**。結果 `eligible=true` 僅代表「這批注入的虛構證據通過前置驗證」，不代表任何真還原動作已完成、更不授權公開/切換。
6. 保存 7/30/90 天：`bkpS1PlanRetention` 只輸出**保留清單＋待人工複核候選**；不可刪 `lastGood`、仍被引用的 base／parent／尚未驗證的資料。未知依賴、循環、缺權威時停止清理建議；函式不具有真正刪除能力。

## 重要尚未實作的事情
- **沒有**真正 D1/R2 全備、增量資料搬運、資料庫原子 manifest/lastGood 登記、持久化權威、資料加密、實際刪除/備份恢復 API，也沒有對 2,000 用戶或 Cloudflare 免費方案做真實效能／費用測試。
- #461 仍需 AI2 在其專責修正 SQL batch 中 `UPDATE 0 rows` 但無 SQL error 時可能局部提交的問題；**本工具只識別由呼叫者提供的 `d1PublicationConsistent` 假證據，無權也無法修改 #461**。
- 歷史 `rawWhisper` 若是排序/改時間碼後、繁中前的片段快照，不得標成真正供應商未加工 raw。
- 真正生效前必須由中央AI2 決定外部 non-rollback epoch／撤權／刪除權威落點、完整性錨點、誰可寫、故障時如何拒答；另行取得正式資料庫、雲端隔離測試、付費、merge/Production 的清楚授權。

## 本地驗證方式
在現有 Echo-Starry 專案中（已安裝 `tsx`）：

```sh
node --import tsx --test tests/starryBackupBkpS1.test.ts
npm run lint
```

在單獨 Node 22+ 環境可用 `node --experimental-strip-types --test tests/starryBackupBkpS1.test.ts`。SQLite 0-row 測試會呼叫本機 Python 3 `sqlite3`，未安裝 Python 時應顯示環境阻擋，不可冒稱成功。**測試只使用虛構資料，不需要 Cloudflare 密鑰。**

## S76 中央AI2 首輪複查：三項加嚴（2026-10-20）

1. **外部權威水位必須相等**：模擬 restoreEpoch 大於備份也不表示撤權／刪除事件一定完整。外部 deletionWatermark 或 revocationWatermark **低於**備份時拒絕；**高於**備份時也拒絕；無效數字拒絕；同水位但當前已撤權或刪除也拒絕。RestoreAuthority 仍只是 Fake 介面，真正高水位必須由未來獨立權威可驗證地提供。
2. **驗證所有完整鏈 R2 正本**：不只最新 delta；對 full + 所有經過的 delta 的 published／approved-history 版本，逐項驗檔案存在、UTF-8 位元組、SHA256、JSON/TXT/VTT、段落數及時間碼。父層獨有歷史版若缺件也拒絕；同一 version ID 在前後備份若資料衝突，拒絕宣稱不可變。
3. **保存期限先驗整張圖**：重複備份 ID、已過期孤兒 delta、已過期循環、錯誤 base 及時間逆序均設 blocked=true、candidates=[]。過期不等於安全可清理；程式只輸出供人工審核的建議，不會真的刪除任何 D1/R2。

本次增加 13 項完全假資料對抗測試；原 R01–R18 必須保持通過。這不代表任何正式 Cloudflare 備份／還原或外部可信權威已可用。
