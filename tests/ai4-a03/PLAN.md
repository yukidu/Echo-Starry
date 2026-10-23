# AI4 S-NEXT-A03｜搜尋正確性硬門與路線裁決（Draft / OFF）

**本文件只屬隔離測試與規劃，不接正式 Worker、資料庫或 AI，不允許合併或部署。**

## 1. 必須先驗證 A02 原始碼

- A01 封存題庫 Git blob：`93bf9fcb0b793a7d9904b85ce5ed699b0a906549`。
- A02 真正提交的候選程式 Git blob：`9c029ff6a130aa18a58423a83271c53e6cf8d481`。
- `tests/ai4A03ExactA02Runner.test.ts` 在 GitHub runner 讀取上述兩檔、核對 Git blob SHA、呼叫真正的 Python 程式，原樣輸出 stdout/stderr/exit 和新舊 Top-1/Top-5。
- **已發現具體疑點**：A02 `baseline()` 所用正規表示式是 raw-string 的雙反斜線 `r"[^\\w\\u3400-\\u9fff]"`，和 A01 的 `r"[^\w\u3400-\u9fff]"` 不同；前者可能把絕大多數中文字濾掉。測試必須保留兩份「before=54/100、66/100」核對；失配一律標 **FAIL**，不能拿既有 96% 當成獨立驗收。
- 此測試**不修改 A01 或 A02 原始檔**；若原始程式未通過，請 AI2 先裁決修正方式，保留失敗紀錄。

## 2. 未見中文盲測的獨立封存流程（**本 PR 不含答案**）

1. AI2 或不同審查者收集**合法取得、無會員私資**的繁體、簡體、口語、錯字、語意否定、講者轉述與版本衝突資料；禁止 AI4 觀看新題的正確答案、調整模型對答案，或複用 A01/A02 已見題目。
2. 在搜尋候選算法版本及依賴先封存後，審查者另行封存至少 120 題**新題**及其允許引用的確切片段；建立未公開的 `custodial-answer-key`。記錄演算法 SHA、題庫 SHA、審查者及封存時間；不可從測試失敗反向調參再說是同輪盲測。
3. 將「查詢 + 可授權語料（不含 gold）」交搜尋執行方產生 `offline-predictions`，預測輸出先不可變封存，再交 AI2 使用本 PR 的 `tests/ai4-a03/sealed-evaluator.mjs` 評分。**這份 evaluator 本身不執行搜尋、也不保證出題者真的隔離**。
4. 預測與答案分開；兩者的 `candidateSha` 和 `roundId` 必須相同，case ID 必須逐題唯一且完全對齊。**沒有獨立 gold 或沒有可回答題，不能宣稱 ≥90%**。
5. 無來源題必須 `ABSTAIN` 且 `answer=''`、`citations=[]`；撤權／刪除題必須 `DENY` 且不洩漏任何可輸出的私密資料。正式應用仍需檢查 HTTP body、headers、首 byte 前權限、快取、日誌及引用標題，不能只靠本地 JSON 物件測試。
6. 引用必須匹配獨立權威提供的 `trackId`、`segmentId`、`sourceRevision`、`resourceRevision`、`transcriptVersion`、`permissionRevision`、`revocationWatermark`、`restoreEpoch`、時間碼和兩份 digest。任何不一致都拒絕；**引用文字與自然語言答案是否語意正確，仍須人工獨立審查**。
7. 驗收：可回答題 Top-5 ≥90%，且無來源錯答 **0**、撤權/刪除私密 bytes **0**、錯引 **0**。任何 FAIL、證據不齊或正式權威 UNKNOWN → **OFF/LOCKED**。A01 66/100 FAIL 和 A02 已見題庫候選成績必須保留原樣。

### 離線評分器用法（封存後，由 AI2／審查者執行）

```sh
node tests/ai4-a03/sealed-evaluator.mjs --predictions frozen-predictions.json --gold custodian-only-key.json
# exit 0: 僅表示輸入 JSON 的 SYNTHETIC_EVIDENCE_GATE_PASS，不代表正式產品通過
# exit 1: FAIL；exit 2: 無效輸入或題庫封存不完整
```

本 PR 的十個假資料單元測試，僅確認評分器會對已知安全反例 FAIL，**不冒充真正 BLIND-120**。沒有上傳任何真會員資料、祕密 key、付費 embedding 或未知盲題。

## 3. #460 FTS5 vs #465 ordinary-table：唯一建議

| 比較 | #460：FTS5 + 正式 Worker 接線草稿 | #465：普通 SQLite 倒排表草稿 |
|---|---|---|
| 來源／狀態 | Draft，已有 router、轉錄工作流程、重建佇列與 migration；未正式啟用 | Draft，`c09q1` 孤立模組、一般表、權限介面與本地測試；未接任何正式路由 |
| 搜尋索引 | SQLite FTS5（附中文二字詞處理），須先核實目標 D1 支援/限制 | `q1_source_state/q1_paragraphs/q1_postings` 等一般 SQL 索引 |
| 變更風險 | 改動 QA router、轉錄流程、登入路由、migration 和排程，多個系統交叉 | 獨立模組、尚無正式寫入路徑，容易接安全 Gate 再逐步驗證 |
| 尚缺 | 正式 D1 行數/額度、撤權權威、來源版本時序、引用/拒答、獨立盲測 | 正式路由、D1 行數/額度、撤權權威、變更失效接線、引用/拒答、獨立盲測 |

**AI4 建議唯一保留 #465「普通資料表倒排」作下一輪受控整合的設計基線，不直接合併 #460 FTS5 及其 migration。** 原因不是宣稱 FTS5 一定不能用，而是目前尚無該 Cloudflare D1 的實測支持證據，且 #465 的程式影響面較小，較易與 AI6 即時權限、AI7 版本／刪除水位整合。#460 可**唯讀參考**其重建與時序測試，但不可把兩份 migration/索引一起套用。

### AI2 必須先決定的共同契約

- 統一 Search Evidence Envelope、來源授權的單一權威、讀取當下與 SEND 前再次驗權，UNKNOWN 一律拒絕。
- 更正、刪除、撤權及還原後，索引版本和可供引用的來源片段必須同一權威序列更新；禁止舊快取資料復活。
- 限定 D1 rows_read/rows_written、索引大小、R2 讀取及 2,000 人下的 P95/P99；未知成本不得打開正式旗標。
- 上線前須取得不同審查者保管的真正全新盲題，產品真實環境測試及 AI2 簽核。**現階段一律 Draft/OFF。**
