# AI6 N1A-S3A 離線安全中心 × AI2 共用驗證實際串接

**DRY RUN ONLY / OFF / Draft / NEVER DEPLOY.** 此分支基於 AI2 [#475](https://github.com/yukidu/Echo-Starry/pull/475) 最新 HEAD `db58589b3937b99d62a7f15edb59d7bd9688db3c`，PR 的 base 固定 `safety/ai2-n1a-s3a-shared-envelope-20261020`。**不能直接合併 main**，不可掛正式 Worker/Starry ID/Cloudflare/D1/R2/KV/AI/Provider/備份/付費路由。

## 真正在同一個 Node 測試流程中呼叫的函式

- **共用唯一驗證（AI2）**：`security-contract-v1/s3aEnvelope.ts` 的 `evaluateS3aFakeEnvelope(envelope,expected,readers,phase,nowMs)`。
- **AI6 原 S1 四域模型**：`ops-s1/n1aS1Console.ts` 的 `buildN1aMockDashboard(platform,events,nowMs)`，以及 `ops-s1/syntheticEvents.ts` 的 `createMockSnapshotReader()`。
- 新增 `ops-s1/n1aS3aSharedConsole.ts` 的 `evaluateS3aForMockConsole()`：**先 await AI2 verifier，再將結果給 AI6 四域模型**。只輸出有限匿名碼/狀態；不輸出原始 SecurityProof、membership/subjectId、trackId、nonce、簽章、文字稿。真平台資料與業務事件絕不互相污染。Fake 一致只代表 demo，一律不可讓 App/備份升成有權威的綠色，也不得解除任何動作鎖定。
- 新 `createS3aOfflineAdminHandler()` 是**未掛正式路由**的 GET 假介面，每次先由注入的假超管驗證拒絕 403/429，再讀假來源，**每次重新跑共用 verifier**。雲端與匿名事件僅在單一 process/isolate 合併快照，安全證明與超管判斷永不共用快取。
- S1 已審查的 **5 個純假檔**原樣選取：`healthModel.ts`, `syntheticEvents.ts`, `n1aS1Console.ts`, `n1aS1ReadOnly.ts` 及 `n1aS1OfflinePreview.html`（HTML 僅標示 S3A 現況與防假綠；**瀏覽器內靜態情境不會執行 AI2 TS verifier**，真正的同進程整合在 Node 測試和 JSON REST 模型內）。
- `tests/n1aS3aAi6SharedConsole.test.ts`：**20項**本批專屬離線假資料整合案例；使用真進程直接 import AI2 verifier+AI6 model，不是複製理由碼、不是預先填入 `simulatedAllowed`。

## 不能宣稱的事／上線阻擋
- Fake `verifyFakeAttestation`、fake Starry ID、fake witness/checkpoint 皆只是注入的測試替身，沒有可信簽章、外部最高 checkpoint、真身份、不可回捲儲存或雙真人中央超管。
- Fake `simulatedAllowed=true` 絕不是 `productionAuthorized`：後端與 UI 永遠 `productionAuthorized=false`，新 AI 支出、Retry、Publish、Restore、Delete 一律禁止。
- `Cloudflare services normal` 只能是已選的**合成平台假資料**，不能使 App/AI費控/備份判成正常；任何有效 App/備份紅色故障不能被灰色來源或正常平台蓋掉。
- 2,000 假一般會員同時 GET ⇒ 每次 403、下游 source 0 讀；Fake 真超管每次仍跑共享安全驗證，只有平台與匿名事件單個 isolate 共用快照。**不是跨區硬配額，也不是真人 2,000 壓測。**
- 沒有真 Cloudflare Monitoring/GraphQL/Billing API，無額外雲端資源/secret/網路調用；沒有移動其他 AI 的 Router、migrations 或 PR。CI 不代表 Production。

## GitHub CI（只有 Node 假資料，不含秘密、不部署）
本 PR 的隔離 workflow `.github/workflows/ai6-n1a-s3a-fake-only.yml` 在自己的 S3A 分支 Push／PR 上使用 Node22，執行：
```sh
node --import tsx --test tests/n1aS3aAi6SharedConsole.test.ts tests/n1aS3aSharedEnvelope.test.ts
npm test
npm run lint
npm run build
```
因整合檔依賴 AI2 #475，必須 **stacked base=#475** 才可測；GitHub 的 main-only CodeQL 和其他未觸發 workflow 不可冒充本批必過證據。只有此 workflow（若有成功紀錄）和 Node 實際 log 可用於「Fake PASS」回報。
