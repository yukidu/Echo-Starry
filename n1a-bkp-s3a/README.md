# AI7 N1A-S3A｜共用 S3A Envelope × S1 防回捲備份還原（純假資料）
**尚未部署；S3A 僅 Draft／離線整合，禁止正式還原、刪除與對外公開。**

## 實際直接匯入並執行的兩個原函式
1. AI2 #475 共用原函式：`security-contract-v1/s3aEnvelope.ts` 的 **`evaluateS3aFakeEnvelope()`**。
2. AI7 #470 已審查原函式：`n1a-bkp-s1/fakeRestoreGate.ts` 的 **`simulateN1aBackupGate()`**。此檔逐字從 PR #470 最終 HEAD `4b6be53fd6c39a04203cbf7fd432ef924e5f07f5` 單獨帶入、未修改，不帶入其餘 PR 或正式 Router。

`n1a-bkp-s3a/sharedRestoreIntegration.ts` 在**同一個 Node.js 程序**依序：
- 先核對備份 full→delta 及所有父層核准歷史稿是否都可在共用 envelope（**最多5個當前唯一 track**）表達；無法表示多個同 track 歷史版本、超過5個 track 時 **直接拒絕**，不偷偷放掉歷史版檢查。
- 驗證**兩個不同的模擬中央超管**簽核與同一 request、backupId、manifest SHA、個別 signer、ledger hash、epoch、精確歷史及現行音檔 SHA 的假 nonce 綁定（`ai7S3aFakeApprovalNonce`）。這只是本機 checksum，**不是真實簽章或一次性 token 發行者**。
- AI7 獨立 witness 與第三份 Fake floor 的最高 `securitySeq/checkpointSeq/restoreEpoch` 必須與 AI2 envelope 對應；缺失就擋。兩份 Fake hash 只表達本機狀態一致，尚無真正信任來源。
- **同一流程四次實際呼叫** AI2 共用 verifier：兩位 reviewer 各 `before_commit` 兩次，每次讀當前假 Starry ID、當前 track 權益／摘要、最高序號和外部見證；有任何拒絕立即停止，**不消耗** AI7 審批 claim。
- 通過後**實際呼叫** AI7 S1 原函式，再檢查完整父子 chain、R2 Fake SHA、lastGood、歷史會員與撤權/刪除墓碑、雙人當前中央權限及假一次性 claim。S1 拒絕→AI7 S3A 整批拒絕。
- **固定輸出** `productionAuthorized=false`、`executableRestore=false`、`executableDelete=false`、`executableCleanupCandidates=[]`、`sideEffects=0`。備份到期最多是 **只讀人工討論建議**。

## 限制與真正上線前必須另獲授權
- S3A contract 只支援 `resources` 1～5 項，每一個 track 只一個當前版。**具有多個核准歷史版的同一 track 在此拒絕，沒有宣稱具備完整真實還原能力。**
- AI2 S3A 只有 `checkpointSeq` 與某些外部水位**字串**，不含完整 WORM 憑證、簽章最新 headHash、tombstone 清單，也沒有認證過的兩個真人管理員。AI7 S1 的 `MockTrustedFloor`／hash 與兩者均是注入的 Fake，無論 CI 是否成功，**不保證真正不可回捲**。
- AI2 S3A 沒有包含 backupId/manifestHash 的直接欄位；AI7 以**明確的本機假 nonce**綁定，這不等於真可信簽章，必須在 AI2 下一版共享契約先凍結並由真簽章方核證，不能把此暫時方案用在正式系統。
- AI7 S1 `claimFakeReviewOnce` 只是同一測試環境共用的假原子消耗器，不可視為真持久跨服務一次性審批。兩次 verifier 之間仍有 TOCTOU／跨 Worker 原子提交缺口；正式還原/對外公開**維持禁止**。
- 絕無 Cloudflare Worker Router、真 Starry ID、真會員／D1/R2/KV、第三方外部 AWS/GCS、真備份、真 AI、真登入、部署／合併／付費相關變更。

## 驗收依據
- `tests/n1aS3aAi7RestoreIntegration.test.ts`：22 項假資料端對端情境，含兩人批准、同請求重放、epoch/最高 floor 失聯、審查中途撤權、歷史 parent/物件竄改、不同 manifest、兩名 reviewer 的當前權益與 sourceDigest。
- `tests/n1aBackupWitnessFake.test.ts`：原 AI7 #470 的 **45 項** S1 假資料安全回歸測試，一起保留並重跑。
- AI2 #475 的 `tests/n1aS3aSharedEnvelope.test.ts` **14 項**原始 shared envelope 假資料測試，在新 branch 中保持原樣。
- 測試只能證明純假資料模型；GitHub CI 綠燈不構成真身分、真 WORM/簽章/獨立高水位或正式上線核准。

**GitHub 分支基準：** AI2 #475 的 `safety/ai2-n1a-s3a-shared-envelope-20261020`，HEAD `db58589b3937b99d62a7f15edb59d7bd9688db3c`。本批新分支獨立 Draft，沒有修改 #475/#469/#470 原分支。
