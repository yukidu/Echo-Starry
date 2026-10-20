# 中央AI7｜S2367A BKP-I1：還原前雙人審查／權限防回捲（純假資料）

## 版本與適用範圍
- 設計只增補既有 AI7 Draft [#463](https://github.com/yukidu/Echo-Starry/pull/463) 中 **AI7 自己的測試與離線模組**；不更改 main、#461、現有正式 Worker 路由、Starry ID 會員資料或任何 Cloudflare 資源。
- 新的 `worker/starryBackupBkpI1.ts` 完全無寫入操作，`BKP_I1_RUNTIME_ENABLED=false`。不提供真正「開始還原」、「刪除備份」、「公開資料」函式。
- `productionRestoreAuthorized` 永遠為 `false`。`simulatedEligible=true` 的意義僅是「所提供的假權威、假管理員、假 D1/R2 在本次模型中看起來一致」，絕對不能用於真會員或真雲端。

## 最小安全條件
1. 先取兩組**相互獨立的虛構**權威與高水位憑證，檢查來源不同、備份及權威 epoch 已前進、撤權/刪除水位有效；憑證含權威資料摘要，兩邊須完全一致，資料有失聯、過期、倒退、錯誤或不一致都拒絕。
2. 所有已發布稿與已核准歷史稿的 track 都要有明確假會員關聯。**缺少關聯鍵、關聯值為空陣列 `[]`、空白會員編號，都表示權限未知而必須拒絕**；即使只有父層 full 備份保留該歷史稿也是如此。如果現在權威指出任何關聯會員／音檔被刪除或撤銷權限，不許因拿出舊備份而復活；不能藉由刪空關聯名單繞過撤權。未來若確有沒有會員關聯的公開內容，必須另訂可驗證的明確類型與權威證據，絕不能把 `[]` 默認視為公開。
3. 兩位不同且**目前仍具權限的模擬管理員**都須核准，批准必須鎖定同一 request ID、backup ID、manifest hash、權威 epoch、有效時間。過時核准、同一人批准兩次、已撤銷管理員及任何拒絕票全部阻擋。
4. 在人審前後**再讀兩次**模擬權威與單獨的高水位錨點；發現 epoch、撤權、刪除、名單或證據摘要有任何變動就整批拒絕，禁止沿用舊批准。
5. 呼叫既有 `bkpS1Preflight` 真正 TS 函式重新逐項檢查：lastGood 必須可信，full/delta 所有父層、核准歷史 JSON/TXT/VTT/raw 等物件不得缺件、長度與 SHA256/段落時間碼必須吻合；已失敗/待審候選不可冒充正式。
6. 保留 7／30／90 天只模擬 `bkpS1PlanRetention` 的建議。lastGood/依賴的 base 一律留住；孤兒、循環、重複 backup ID 或來源不可信時完全不產生清理候選。即使產生候選也需人工審核，模組不含刪除權能。

## 雙來源比較（**規劃，不代表存在**）
| 選項 | 可以協助什麼 | 仍要核對的硬阻擋 |
|---|---|---|
| A：Starry ID 當前會員權限 + 獨立 epoch 錨點 | 會員資格可向 ID 即時求證，能避免 Echo 回復舊快照誤認會員 | Starry ID 的 D1 自己也可能還原舊版本；**必須**另外證明單調不可回捲的錨點及跨服務一致性 |
| B：專屬最小權限控制來源 + Starry ID 身分確認 | 職責隔離、可把 epoch/刪除/撤權寫入與 Echo 快照分開的流程 | 任何單獨 D1 也能還原，專用庫≠天生不可回捲；需額外不可逆高水位/簽章、跨故障鎖及成本權限審核 |

**不能拿 Cloudflare KV 快取當唯一的 epoch 權威。** 本批不建立 A 或 B，不增加資料庫、金鑰或付費額度；正式方案必須由中央AI2/使用者另行裁決。

## 測試與安全限制
- `tests/starryBackupBkpI1.test.ts`：雙人批准、批准重放、假外部 high-water、舊權限/歷史版/已刪會員、父鏈 R2 遺失/篡改、lastGood、7/30/90 天、2000 個虛構會員等完全離線用例。
- `tests/starryBackupBkpS1.test.ts`：保留原 R01～R18、祖先與權威/保存期限檢查，不跨組修改。
- 假權威的 digest/hash 只能檢查**傳入的兩份假資料是否一致**；不是真正簽名、真實外部獨立性、單調儲存安全或認證通過。
- 沒有真 D1/R2 導出還原、真外部錨點、雙人身分驗證、真正遮蔽搜尋入口、費用額度、R2 跨服務原子快照、2,000 人真人/真 Cloudflare 負載證據。這些全部是**後續阻擋**。
- 若未來決策需要任何真接線，必須另取得明確授權；現階段所有正式功能保持 OFF。

## 專屬測試執行（GitHub CI）
```sh
node --import tsx --test tests/starryBackupBkpI1.test.ts
node --import tsx --test tests/starryBackupBkpS1.test.ts
npm run lint
```
僅 CI 以真正 Repo 的 TypeScript/依賴執行且顯示 PASS 後才記載確切通過數；自動 Workers Preview 建置成功**不是正式部署**。
