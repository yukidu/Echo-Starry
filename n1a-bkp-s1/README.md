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


## N1A-S1 第二輪｜與 AI2 Draft #469 的 Fake SecurityProof 欄位互通驗收

- 新增 `fakeSecurityProofInterop.ts` 與 `tests/n1aBackupSecurityProofInteropFake.test.ts`；依 [AI2 PR #469](https://github.com/yukidu/Echo-Starry/pull/469) 目前的 `SecurityProofV1` **欄位形狀**建立 AI7 自有的**離線相容性模型**。由於 #469 尚未合併 main，**沒有直接匯入 AI2 程式，也沒有聲稱跑過跨 PR 的實際連接測試**。
- `securitySeq` 指 AI7 外部**事件鏈最高序號**（對應 `MockWitness.headSeq`）；`restoreEpoch` 是獨立的還原保護版本；`revocationWatermark`、`deletionWatermark` 是受信任事件來源的獨立水位，**不能從 `securitySeq` 或 `restoreEpoch` 猜出來**。四者均必須是 uint64 正規十進位字串，與兩份 Fake 外部來源逐項核對。
- `membershipRevision` 是特定會員的權限版次；**不等於** Starry ID 整庫 `MockStarryId.revision`，也不等於 AI7 `headSeq` 或 restoreEpoch。整庫 revision 僅能與獨立 `minStarryIdRevision` 比較是否倒退。未來需要 Starry ID 提供**真實逐會員 revision**的可信證據。
- `sourceRevision` 是內容來源字串（例如受信任 ETag），不是 AI5 統計 `sourceRevision:number`；`correctionRevision`、`permissionRevision` 亦是不同業務版本。AI7 還沒有可信真音檔來源/個別修訂證據，只能在 Fake 試驗中驗格式與變動，不得當正式證明。
- 模擬 `precheck` 與 `before_commit` 必須**同 requestId + backupId + nonce + 最新 witness head + 權限水位**。審查期間任何權威/批准/水位變動，即使雙方 Fake 值能重新配對，也拒絕沿用舊批准；最終失聯及之前備份閘門拒絕時，`cleanupReviewOnly=[]`。
- **任何情況都沒有** `executableRestore`、`executableDelete`、`executableCleanupCandidates`；就算 Fake 合法並顯示一個供討論的過期名稱，這不是可交給真刪除器的工作清單。
- AI2 的 `fakeAttestation` 和 AI7 的 source ID/事件 hash 都不能驗證真正簽章、WORM 不可回捲或兩個實體帳戶隔離，真錨點的落點、簽章、最高水位與成本仍由 AI2／使用者決定。

測試：
```sh
node --import tsx --test tests/n1aBackupWitnessFake.test.ts
node --import tsx --test tests/n1aBackupSecurityProofInteropFake.test.ts
npm run lint
```

**限制：** 這是「依照 #469 已讀的契約形狀作離線欄位核對」，不是 #469 與 #470 真正打通。兩個 PR 都是 Draft/OFF，正式 SecurityProof 合約版本、來源權限、真人雙審及後端整合必須由中央 AI2 另行凍結與授權。


## N1A-S1 R3 最後定向安全修復（僅 Fake）
依 [中央AI2 #455 派工 #6290549782](https://github.com/yukidu/Echo-Starry/issues/455#issuecomment-6290549782) 與 [AI3 對 #470 互評](https://github.com/yukidu/Echo-Starry/issues/455#issuecomment-6290486546)；維持原 Draft、沒有開新分支或更動別組代碼。本批先把四個負面反例寫入 `tests/n1aBackupWitnessFake.test.ts`，並確認原版 regression job **4 個 RED FAIL** 才修正，不把故障紅燈誤當既有真實 Production 事故。

- **簽核者被撤權（P1）**：即使 Fake Starry ID 還表示「active super-admin」，WORM 事件鏈存在 `member_revoke_pending` 或 `member_deleted` 指向任一 reviewer 就 `REVIEWER_REVOKED_AT_WITNESS`，拒絕簽核與清理候選；會員內容本身的撤權檢查不變。
- **同 request 雙審重放（P1）**：本模擬必須注入跨相同模擬工作者**共用**的原子 Fake `claimFakeReviewOnce(requestId)`；全部檢查通過後才 claim。第一筆可取得 `simulatedEligible`，同一 request 的任何再次使用一律 `REVIEW_ALREADY_CONSUMED`。無 claim reader、原子性無法確認或例外 → `REVIEW_CLAIM_UNVERIFIED` 並 fail-closed。Fake ledger 的記憶體寫入不會修改真實系統，決策 `sideEffects:0` 表示 **0 正式/雲端副作用**。
- **兩份見證一起回捲（P1）**：新增第三份注入的 `MockTrustedFloor`（與 ledger、checkpoint 不同模擬來源），於批准前後都讀；只要最新最高 seq／hash／epoch 跟兩份見證不一致、缺件、過期或來源同名，即拒絕，不再相信兩份*一起回到舊版且自身 hash 有效*的資料。**關鍵限制**：三份來源都是本機呼叫者造假的，若三份全被同步回捲，Fake 模組仍無法證明真最新高度；`simulatedEligible` 永遠不是實際信任證明，任何正式授權仍始終 `productionAuthorized:false`。
- **正式阻擋不變**：真 Starry ID、不可回捲雲端錨點／獨立金鑰、持久雙人 approval nonce 原子帳本及跨服務重驗尚不存在。**沒真權威就不得真還原、公開或 DELETE**。 `N1A_BKP_RUNTIME_ENABLED=false`，沒有改正式 Workers Router、DB、Cloudflare、費用或 Production。

### 本批專屬回歸
```sh
node --import tsx --test tests/n1aBackupWitnessFake.test.ts
node --import tsx --test tests/n1aBackupSecurityProofInteropFake.test.ts
```
整 repo 的 CI 只驗 Fake 合成行為。PR 的 Preview 建置成功不等於 Production；最後 CI 當次 SHA 的 PASS 才可報告。
