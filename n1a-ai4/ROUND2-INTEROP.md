# 中央 AI4｜N1A-S1 第二輪「跨組欄位語義」假資料驗收

**授權**：[GitHub #455 #6289517050](https://github.com/yukidu/Echo-Starry/issues/455#issuecomment-6289517050)。本批**只新增** AI4 自有假資料測試與本文件，沿用 AI4 Draft PR #473 的原安全分支，不修改演算法、正式 Router、Starry ID、D1/R2、#469 共用模組或其他 AI 程式。全部功能 OFF。

## 與中央 AI2 Draft PR #469 的真實「欄位名稱」差異（截至 AI2 HEAD 629ba524）

| AI2 #469 `SecurityProofV1` 欄位 | AI4 #473 `FakeProof` 來源 | 許可條件／**不能直接兼容** |
| --- | --- | --- |
| `membershipRevision:string` | `memberRevision:string` | 需同一 Starry ID 可信會員修訂紀錄、canonical uint64 十進位字串；不同時直接拒引 |
| `securitySeq:string` | `witnessSeq:string` | 只能在**同一獨立權威帳本**證明下對照；AI4 **額外** `checkpointSeq`（不得省略「見證比已知最高版本舊」的檢查） |
| `restoreEpoch:string` | `restoreEpoch:string` | 以十進位字串且同一個真獨立版本見證檢查；不能轉 JS Number 或從 Date.now 推斷 |
| `sourceRevision:string` | `source[track].sourceRevision:string` | **來源 ETag/內容修訂**，不可替換成 `version='v1'`，也不可當作下述 `resourceRevision` |
| `permissionRevision:string` | `source[track].permissionRevision` | 權限版次；每份音檔獨立比對，不能把一份 proof 無條件套多筆 |
| `correctionRevision:string` | `source[track].correctionRevision` | 訂正版本；撤銷、核准後都要失效舊候選，不可只比文字 |
| `revocationWatermark/deletionWatermark` | `revocationWatermark/deletionWatermark` | 需同一個真錨點、最新且不回捲；不同或未知拒答 |
| `resourceId:string` | `source[].trackId` | AI2 設計是**單筆 resource**，AI4 可同一輪多筆；不能將單筆 proof 當作全批授權 |
| **沒有** `resourceRevision` | 亦無同義單欄；有 `version` + `sourceRevision` 等不同概念 | **BLOCKED**：AI2 派工所寫的 `resourceRevision` 尚未出現在 #469 現有型別；由 AI2 決定是否另訂新欄或多欄組合，AI4 不自行創造 |
| **沒有** `checkpointSeq`、`revocationPending`、獨立 `transcriptVersion` | AI4 有以上部分欄位 | **BLOCKED**：正式共用證明須保留外部最高水位、撤權待處理及逐字稿生效版次；不能從 Fake issuer 推定實體證據 |
| `issuer='fake-star-id-plus-witness'` / `fakeAttestation` | `fakeIssuer='offline-starry-id-plus-witness'` | **兩個不同測試來源**，即使字串一樣，假證明仍不能授權、不能跨信任域驗簽 |

**診斷規則**：`tests/n1aAi4Round2InteropFake.test.ts` 中的 `diagnose()` 只比對**共同欄位及名稱映射**，其回傳永遠 `safeToPublish=false`、`productionAuthorized=false`。即使所有欄位相符，也只是**資料形狀對得上**，沒有聲稱拿到 AI2 真的 `assessFakeSecurityProof()` 結果，更不是正式權限；因這兩個原型在**不同未合併分支**，本批不複製 AI2 的實作、不偷偷合併。未來如要做到真交叉呼叫需 AI2 凍結契約、另次授權。

## 第二輪驗收規格（必須執行真 AI4 原有 Fake 函式）
1. AI2/AI4 欄位同版、一致及已知差異：版本 canonical、未知／缺少欄位維持 BLOCKED。
2. 同會員權限在 **T0/T1/T2/SEND** 四時點分別更新，所有測試案例都 **0 舊引文**。
3. 外部錨點 `securitySeq/restoreEpoch/revocationWatermark` 在四個時點互相衝突，**0 舊引文**。
4. `sourceRevision` 對應錯誤、音檔 `v1→v2`、`permissionRevision`／`correctionRevision` 變更及會員停權／來源刪除/錨點斷線皆拒引。
5. 2,000 個**虛構**請求遇見證失聯 2,000/2,000 拒答，不代表真 2,000 人負載或 Cloudflare 費用。

## 離線執行
`node --import tsx --test tests/n1aAi4Round2InteropFake.test.ts`

這支測試在現有 `MutableFakeAuthority` 與 `simulateProtectedQA` 上跑假場景。測試不驗雲端串流、本機以外的跨 Worker 交易，也不證明不可回捲帳本真實存在。原 AI4 第一輪 20 項測試保留，#468 原48題凍結盲驗 Top-5 **19/40=47.5% FAIL** 保持不變；#465 正式搜尋演算法**完全不改**。

**不能正式上線**：真 Starry ID、AI7 真外部見證、AI2 真發送柵欄以及安全來源即時失效機制均未建立；正式 D1 rows_read/written、2,000 真人併發、付費、AI QA 安全亦未知。不合併 main、不修改部署設定、不使用正式雲端資料。
