# AI6 N1A-S1 四區離線安全總控（Stacked Draft / OFF）

**本資料夾內的本批新增檔案只供離線假資料測試，無正式 Cloudflare、會員、付費或備份介面。**

## 相依版本（不可單獨合併）

- 前置 [AI6 Draft #462](https://github.com/yukidu/Echo-Starry/pull/462) 包含獨立假資料六服務 healthModel.ts、syntheticEvents.ts 及其測試。
- 本批另開分支 `safety/ai6-n1a-s1-four-domain-20261020`，Draft PR **base 指向 AI6 自己的 #462 分支**。本批新增檔案不應直接相對 main 合併；AI2 必須先驗前置差異、解決可能的版本衝突，使用者另外授權後才有下一步。
- 無任何正式 Worker/router import 本批檔案，沒有更新 wrangler、migration、Workflow、Cloudflare 或 Starry ID。

## 四區隔離與安全規則

- `n1aS1Console.ts`：純型別和計算函式。平台六服務由 `healthModel.ts` 對**假平台 Observation**判讀；AI2 逐字稿事件只進 `app_security`，AI3 費控 Hold 只進 `ai_billing`，AI7 備份壞檔/還原鎖只進 `backup_restore`。任何來源未確認/過期/矛盾為 unknown，有同域已確證故障則保留 fault 並註記 conflict。平台層**完全不讀業務事件**。
- `n1aS1ReadOnly.ts`：單一離線 GET 模擬介面，要求**每次**伺服器端注入的假中央超管資格還有效，過期/撤權先拒 403；只用注入的 3 種假資料來源且單 isolate 懶快取合併；來源故障 unknown。不提供重試、解鎖、備份還原、付費、後台寫入功能。
- `n1aS1OfflinePreview.html`：可在瀏覽器本地離線開啟的響應式介面；四區文字與圖示清楚分開，提供五種*人工*切換的虛構狀態；沒有網路呼叫、背景輪詢或外部 CDN。
- `../tests/n1aS1Ops6.test.ts`：32 項安全假資料案例，含「R2 平台正常 + 單檔備份紅」「Workflows 平台正常 + Echo 排隊黃」「Workers AI 平台正常 + B07 未明費用黃」、已確證故障優先、過期/無證據 unknown、撤權拒讀、2,000 普通使用者 0 下游監控讀、同一 isolate 2,000 假授權請求共用每來源一次、匿名資料不含機密。

## 本機測試命令（只讀本地假資料）

```sh
node --import tsx --test tests/n1aS1Ops6.test.ts
node --import tsx --test tests/opsS1.test.ts tests/opsI1.test.ts tests/n1aS1Ops6.test.ts
```

> 注意：GitHub CI 也必須核對 `Regression audit`、`diagnostics-build`、`browser-ui`、CodeQL 實際最新 SHA；CI 成功只代表假資料和建置，不代表真 2,000 人全球負載或 Production。

## 上線阻擋（需下一輪獨立明確授權）

1. N1A Starry ID 真中央超管身份、防撤權競態與外部安全版本見證仍未串接；假身分 `centralSuperAdmin:true` 或 Fake `verified:true` 不是可接受的真權威。即使所有面板顯示假正常，`productionAuthorized=false`、`restoreAllowed=false`、`newAiSpendingAllowed=false`。
2. 沒有 Cloudflare 官方 metrics、真帳單、真 D1/R2/KV 或真會員，也沒有真 Backend 權限/跨 Worker/跨區硬限流；真正額度/成本未知，不可顯示「$0」。
3. 模擬 2,000 並發只共用**同一個程式執行個體**的快照，不能承諾全球只查一次；管理頁禁背景輪詢，建議每中央管理員 60 秒內最多手動刷新一次且分頁≤25筆。
4. 真 Workflow、Whisper、Provider、B07、備份／還原／刪除/付費完全保持關閉，未碰其他 AI 的 PR，不能單獨合併 main 或啟動任何正式部署。

## PR / CI 注意

本批為 AI6 Draft #472，開發仍保持關閉。因既有 GitHub CI 僅對目標 main 的 PR 觸發，驗收時先在 PR 指向 main 的情況提交此文件修訂以啟動測試，**完成後應將 PR base 恢復至 AI6 #462 安全分支**，免得重複顯示前置 PR 原型變更。CI/Preview 綠燈不能替代 N1A 真安全權威核准。

## 第二輪：AI2 SecurityProof 假交接（2026-10-20）

依 [總指揮第2輪 #6289517050](https://github.com/yukidu/Echo-Starry/issues/455#issuecomment-6289517050) 的 AI6 限定任務，**僅新增自有檔案**：
- `n1aS1ProofHandoff.ts`：只讀 AI2 [Draft #469](https://github.com/yukidu/Echo-Starry/pull/469) 的 `FakeSecurityDecision` 契約 **形狀**，從外部注入假判讀結果，不直接 import 另一分支的檔、也不接真 `SecurityProof` verifier；總表保持四域獨立。只能接受 `stage=precheck|before_commit`、`productionAuthorized=false`、`sideEffects=0`、`simulatedAllowed` 與 AI2 `reason` 相符的固定欄位；未知型別/碼或旗標矛盾一律 unknown + locked。
- `n1aS1OfflinePreview.html`：增加安全證明未知、假撤權/刪除記錄命中、外部見證版本不符三組匿名情境，與四域既有卡片並列，無需刷新/網路。
- `../tests/n1aS1ProofHandoff6.test.ts`：新增23個離線 Fake 情境，證據未知不會亮綠、已證故障仍紅、跨域 Cloudflare 不受污染、2,000 假交接操作全部鎖住、任意多餘個資/音檔/原文不進輸出。

### AI2 #469 契約欄位對照（**非真權威**）

| AI2 假資料契約 | AI6 顯示解讀 | 無法據此聲稱 |
|---|---|---|
| `FakeSecurityDecision.stage: precheck/before_commit`、`reason`、`simulatedAllowed`、`productionAuthorized:false`、`sideEffects:0` | 僅匿名原因碼、觀測狀態；所有高風險操作永久鎖定 | 真 Starry ID 身分或即時授權 |
| `membership_revoked_or_unavailable` / `membership_revision_changed` | App 權限**未知／失效待查**，拒敏感操作 | **不可直接斷言已撤權**（也可能是假來源失聯） |
| `witness_records_revocation_or_deletion` | **假見證**已記錄撤權/刪除拒絕 → App 黃色保護中 | 真實會員被撤權、真實刪除 |
| `external_witness_changed_or_rolled_back` / `external_witness_invalid_version` | App 與備份版本**未知/鎖定**，注明「版本不一致，可能回捲」 | **不可斷言已經證實回捲** |
| `external_witness_missing` / `trusted_source_unavailable` | App、備份灰色未知並鎖定 | 真錨點現況或雲端供應商故障 |
| `fake_evidence_consistent`，`simulatedAllowed:true` | 只表示 AI2 的**模擬**一致；仍 `productionAuthorized=false` | 可發布、開付費 AI、備份還原 |
| `sourceRevision:string`、`membershipRevision/securitySeq/restoreEpoch` canonical uint64 字串 | **不由 AI6 UI 轉數字/比較／存取原本值**；只吃 AI2 假判斷理由 | 與 AI5 統計 `sourceRevision:number` 同義、或 AI7 `headSeq` 等價 |

```sh
node --import tsx --test tests/n1aS1ProofHandoff6.test.ts
node --import tsx --test tests/n1aS1Ops6.test.ts tests/n1aS1ProofHandoff6.test.ts
```

限制：此處的「撤權」、「回捲」僅**固定合成顯示狀態**，並未核對真會員/憑證或獨立防回捲高水位。絕對不可將 UI 可見字串、前端宣稱的 `simulatedAllowed:true` 接進真放行 API。AI2 的 `SecurityProofV1` 及其假 verifier 位於另個 Draft #469，未成為本 PR 的真程式相依，正式跨組共享**仍 BLOCKED**；這批新增測試僅檢查 AI6 的匿名 Fake 決策交接形狀，不是六組的跨分支整合執行。
