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
