# AI3 A03｜中央費控「真 SQLite 持久帳本」隔離驗證（草稿）

**狀態：Draft / OFF / NO PROVIDER / NO PRODUCTION.** 這不是正式 D1 migration、不是可開啟的計費功能，也不接現有 router。最新 main 基準 `60fc222f076dd0c9821a76df780414d78f0538aa`。

## 既有 Draft 的差異與重疊（只讀，不合併）

| 費控面向 | #458 B07-01 | #464 B07-S3 | A03 本次提案 |
| --- | --- | --- | --- |
| 讀寫權威 | `STARRY_ID_DB` 的 `starry_ai_b07_*`，按 global/App/task/member 日帳 | **沿用同一批 B07 資料表**，再加 `starry_ai_b07_s3_*` | **只在隔離 SQLite** 的 `ai3_a03_*`，不與 B07 並行上線 |
| 去重 | `request_key` 唯一、`fingerprint` 比對；D1 trigger 扣預算 | 另加每 segment/attempt 唯一 ticket | `job_key` 唯一且全 App 共用一份額度；SQLite 單筆 INSERT 檢查 cap |
| SEND 防重 | B07 有 reserve/complete，**尚無 SEND 前一次性 claim** | 在獨立 attempt 表插入後標為可能已發送；同 segment 不重送 | 唯一 `send_claims` INSERT；**同一持久交易內決定 claim；預設 UNKNOWN_HELD**，完全不執行 SEND |
| 未知費用 | `uncertain` 保留舊 hold | `may_have_sent/uncertain`；須兩人及驗證權威補償 | claim 後永久 UNKNOWN_HELD；**不提供結算、取消或放回額度 API** |
| 證據／收據 | 以 immutable 單價和 actual units 結算，不等於官方帳單 | 有 evidence digest、兩 reviewer、可插入 reconciliation；外部 reviewer verifier 尚須真接線 | 假據無法解除 hold；Provider 官方收據與雙人見證交中央另定 |
| 重要整合風險 | #458 同時修改 `worker/starryIdCentralRouter.ts` | #458/#464 **共同修改** `starryAiB07Budget.ts`、`budget_guard.sql`、既有測試 | 本次完全不碰 shared router、正式 D1、既有 PR 檔案 |

**建議唯一 owner（待 AI2 裁決）**：跨 App 費控帳本由**中央 Starry ID 專屬持久帳本服務**獨佔寫入與原子 claim，各 App 不可用 localStorage/KV 或各自 D1 推導「剩多少錢」。需由 AI2 指定官方 schema/遷移 owner，評估單一 Worker/D1 寫入及故障處理；本 A03 不能自行取代或直接合併 #458/#464。

## A03 隔離交付
- `worker/starryAiA03OfflineLedger.ts`：目前未被任何 Worker/router import；匯出 `a03Reserve`、`a03ClaimWithoutSending`，**預設 enabled=false**、所有函式 providerCalls=0。
- `tests/ai3-a03/schema.sql`：**僅給本機臨時 SQLite 使用**，明令不得 apply 正式 D1。
- `tests/ai3-a03/test_ledger.py`：使用 Python 標準庫 SQLite on-disk file、不同 connection 的真同時寫入；從 Worker 模組**逐字提取兩條 SQL**，防止測試另一套 FakeMap。
- `tests/ai3A03RealSqlite.test.ts`：透過現成 regression workflow 運行 Python 原始測試，完整 stderr/stdout、exit status 留 GitHub Actions log，不修改共用 workflow。
- 固定假 subject、假 resource、假 App ID；無正式會員、金鑰、真 AI 供應商或遠端 API。
- 測試重點：全 App 共用有限 cap、同 job 雙點與異常重送、真正 24 workers 多連線搶預留、32 worker 搶一個 SEND claim、持久重開、交易 rollback、權限版本、資源變更／還原 epoch、UNKNOWN_HELD 永不自動退回、扣款歷史不可刪除。

## 已知限制（任何一項都阻擋 Production）
1. 這是**SQLite on-disk 原子寫入原型**，不是 Cloudflare D1 在真實多 Worker、多區域的驗收，也未作正式 D1 transaction/migration；Python 本地並發不等於 2,000 人服務負載。
2. 目前 `subject_watermarks` / `resource_watermarks` 僅測試資料庫的受控狀態。缺少 AI6 授權簽發、撤權單一權威、grantNonce、issuer/audience、有效期限、session/role/permissionRevision、resourceOwner、sourceRevision 與 restoreEpoch 的真實契約；**不得讓 App 傳入未驗證欄位當成真權限**。
3. 每筆 hold 永不釋放，嚴格 fail-closed 但會阻塞正常重試／錯誤補償；正式需可稽核的官方 Provider invoice、外部 verifier、不同真人雙核、append-only reconciliation 和財務對帳，且不回捲水位。
4. 唯一 claim **最多只能保證本地 SQL 票券一次性提交**；不能保證 Provider 外部 exactly-once。持久 INSERT 成功後若 crash / ACK loss / timeout，必須視為 UNKNOWN_HELD，不可自動重送。
5. `enabled=true` 僅用於有意開啟的本地測試呼叫；未經中央 gate、權限 owner、服務綁定驗證，不得用此切換正式流量。本模組本身**完全沒有 Provider 呼叫**。
6. `max_micro_twd` 是測試用整數 micro-TWD，不能推論真價格／共用免費額度／多 Provider 未出帳單；NT$0 新增付費 AI 仍為硬阻擋。正式跨帳號/跨 App 預算全域原子性、上限調降、審核與恢復尚未確認。

**對 AI2 的決策請求**：① 先裁定 #458/#464 的單一核心與 schema owner，避免重覆帳本；② 和 AI6 定義可驗真 permission/grant/source/restore 欄位與撤權交易邊界；③ 和 AI7 定義不回捲的 spent-claim witness；④ 才考慮隔離 D1 的 E2E/故障演練。所有真 SEND/Provider/正式資料維持 OFF。
