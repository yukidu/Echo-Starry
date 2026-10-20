# AI7｜N1A-S1 純假資料防回捲錨點與還原封鎖

**未部署、不可啟用。** 本資料夾只是一份獨立 TypeScript 假資料驗證器，直接從 main 的獨立分支建立，並未包含未合併的舊 #463；不能當成真正的 AWS/GCS/Cloudflare 備份服務。

## 明確禁止
- `N1A_BKP_RUNTIME_ENABLED=false`；`productionAuthorized=false`、`restoreLocked=true`、`sideEffects=0` 是固定輸出。
- 不讀寫真 Starry ID、Cloudflare D1/R2/KV、AWS S3、Google Cloud Storage，不建立備份、還原、DELETE、金鑰、雲端資源、收費，沒有 API、Cron、Router、Worker binding、真資料 migration。
- 名為 `FakeWitness` 的 hash 鏈／獨立最高 head 只證明**傳入的假資料相互吻合**；sourceId 的文字差異不是真實獨立故障域、簽名、不可逆時間/序號，呼叫端仍可以捏造兩份假資料。不能把此結果用於任何公開/付費/正式還原。
- 這一支 PR 不覆寫 AI2 的 `security-contract-v1/`，未來若有整合需 AI2 先凍結統一 SecurityProof v1.1 契約與欄位型別。

## 模擬流程
1. 確認完整備份鏈（full→delta）、lastGood、manifest，來源物件（含父層與核准歷史物件）的 SHA256／UTF8 大小與會員關聯。
2. 確認服務端搜尋／公開／發布／清理鎖全部為真（只是 Fake 信號；不是實際鎖）。
3. 在兩個不同 Fake source 模擬 WORM event ledger 與**另外**最高序號見證，檢查 `securitySeq` 是無缺頁的 uint64 decimal string、事件 prevHash/head hash 連續且不得篡改、最新 head/epoch 必須一致。這仍不等於可驗證的真不可回捲錨點。
4. 模擬目前 Starry ID `revision` 不得低於見證最低版本，已刪除/撤權（含 `PENDING`）的任何會員或歷史音檔，不得因拿到舊備份變成可公開；更正事件晚於快照仍須對帳。
5. 兩位不同且當前 active 的 Fake **中央超管**均須批准同一 request、backup、manifest、head/epoch、ID revision；舊票/換目標/逾期/一人雙簽拒絕。
6. 在最終步驟再讀 Fake 外部見證、最高序號與 Starry ID；若來源不可讀、head 或會員狀態改變，全部拒絕。只回傳是否**模擬**符合規則，永遠不真的還原。
7. 7/30/90 天保留：即使模型同意，只輸出模擬「可供人工討論的候選名稱」；**只要權威失聯、備份圖有孤兒或任何安全問題，候選必為空**。不可能直接刪資料。仍被 lastGood 使用的 full/parent 永不列為候選。

## 本批驗收
```sh
node --import tsx --test tests/n1aBackupWitnessFake.test.ts
npm run lint
```
用 `tests/n1aBackupWitnessFake.test.ts` 的合成文字、假 WORM、Fake Starry ID、Fake R2 Map 檢查倒退、篡改、隱藏 tail、0/1/2 管理員、鎖、舊版訂正、權威中斷、2000 假會員與 7/30/90 天保存；**不是**真 2,000 人同時上線，也不能量出真 Cloudflare 成本。

## 下一階段需另外授權與真證據
- Starry ID 真會員／中央超管最新活性與 App 權限的安全接口；一切角色不可由前端 `isAdmin` 自報。
- 由 AI2 凍結的 SecurityProof v1.1、canonical uint64、最新 revoked/deleted/correction/entitlement revision、跨庫部分提交/鎖與水位修復流程。
- 選定且驗證真正獨立於 Echo/ID 恢復權限的外部簽章、WORM 儲存與最高 head 見證（AWS/GCS 只是比較中的候選，未選），金鑰輪替、刪除/搬遷、費用硬上限。
- 真正全量/差異備份、lastGood 持久化、隔離還原、稽核鏈與真清理系統。任何權威證據不完整，正式還原/公開仍保持**禁用**。

**本次唯有 GitHub 安全分支、Draft PR、純假資料測試獲授權，不得合併 main 或 Production。**
