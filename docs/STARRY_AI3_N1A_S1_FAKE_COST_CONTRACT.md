# 中央 AI3｜N1A-S1 B07 純假資料費控驗收

授權：GitHub #455 留言 6288991208。只允許隔離安全分支、Fake SQLite/身分/AI、測試、Draft PR 和 GitHub CI。嚴禁真 Cloudflare、真會員、AI Provider、付費、Migration、合併 main 或正式部署。

## 依賴及檔案邊界

本分支基於 AI3 #467（它依賴 #464），Draft PR 必須以 #467 的安全分支為 base。只新增：
- tests/n1a_s1_b07_fake.py：Starry ID 會員、獨立單調安全版本、Echo queue、中央 B07 帳本與 Provider 計數器，全部 Fake。
- tests/test_n1a_s1_b07.py：20 項獨立假資料測試。
- .github/workflows/ai3-n1a-s1-fake-only.yml：限定安全分支的本機 Python/CodeQL 驗證。
- 本說明文件。

不修改 #461、#458、#464、#467 原始碼、Starry ID Router、正式資料表。#458 和 #464 基底重複，不可重複合併。#461 的 assertUnfundedWhisperBlocked 必須維持，真 Whisper 一律禁止。

## 安全規則

1. 一次批准的身分使用「核准 ID＋App/Task＋音檔 ID/版本＋模型」及分段固定識別。requestKey、runId、generation、日期不參與防重身分；中央 Fake SQLite 唯一鍵及原子交易只允許一次預留／每段一次性執行票。
2. 每段執行票在模擬 Provider 呼叫前持久佔位；真正送件權另以原子 sent=1 消耗。Worker 中斷、供應商收到請求卻遺失回覆、不明結果都不得自動重送或釋放原 Hold。
3. 多段必須全數確認才能整筆結算；任何一段結果不明，都保留原額度並要求人工對帳。Fake 對帳驗證兩名不同真人身分（非兩個不同帳號），相同憑證最多補償一次；未接真 Starry ID 審核。
4. Echo queue 和中央 B07 是兩份獨立 SQLite，不宣稱跨庫原子交易。排隊或預留 ACK 遺失標為 unknown，禁止新 Provider 執行；孤兒 Hold 不可依逾時自動退款。
5. Fake 的獨立版本見證只有記憶體模型，不能證明真實防回捲；官方全帳號 AI 免費餘額未知一律拒絕，新核准必須由將來的可信獨立見證發出，絕不靠改 HTTP 請求代碼。
6. 2,000 位虛構會員共用一個 Fake 全域限額（40 允許、1,960 拒絕），最多 24 條本機執行緒。不是 2,000 真實 Cloudflare 同時在線或實際帳戶費用／延遲證明。

## 執行與判退

本機執行：python3 -m unittest discover -s tests -p 'test_n1a_s1_b07.py' -v
另執行 Python 語法檢查及 Python CodeQL。

需看 GitHub CI 最新 HEAD 才可宣布成功，不能沿用舊 #467 的綠燈。核心不變式：相同批准最多一張票、Provider 不明絕不重發、未知帳單不釋額度、部分成功不整筆結算、跨 App 全域額度不突破。2,000 個假請求不代表真人負載。

## 仍待新授權

正式 B07 仍缺跨 requestKey 的 sourceGrant 永久 UNIQUE，#464 部分狀態更新也尚未保證完整單筆原子轉移；真 Starry ID 權限、非回捲錨點、供應商收據及全帳號免費額度都未接。不得使用 Fake verified 作真憑證，不能解鎖 Whisper、修改正式 migrations、合併 main 或部署。

## 第二輪 #469 SecurityProofV1 互通驗收（Fake-only）

對照 **AI2 #469 head `629ba52462192645f93817c0bb1976a9cb025f18`** 的 `security-contract-v1/securityProof.ts`（**唯讀，不從 #469 複製、匯入或修改**）。本 PR 在自己的 `tests/n1a_s1_b07_proof_bridge_fake.py` 依欄位規格建一份 Python **測試轉接器**。跨分支未實際連成一個生產依賴；即使測試通過，也**不可當作真 SecurityProof API 互通完成**。

| #469 SecurityProofV1 欄位 | 本 AI3 Mock 對照與安全規則 | 現在是否已真正互通 |
|---|---|---|
| `schemaVersion/issuer/audience/action` | 固定 `N1A-S1-FAKE-v1/fake-star-id-plus-witness/n1a-offline-only/ai.attempt`，其它值禁止 | **僅假轉接** |
| `approvalGrantId` | 必須與 AI3 `Grant.id` 相同，為一次批准永續身份。新 HTTP `requestId` **不能**鑄造新 grant | **僅假轉接**；真 signer/批准權威尚無 |
| `requestId/nonce` | 綁當次請求；`requestId` 可以改但只會讀**原 grant/run 一張票**。`nonce` 目前只檢字元合法，尚無真簽發/一次性登記 | **真 nonce 防重未定／BLOCKED** |
| `resourceId/sourceRevision` | `Grant.track/Grant.source`（此 Fake 為 64-hex），付費前重新讀當前音檔來源 | **真 R2 ETag 格式待對齊**；#469 `sourceRevision` 的 `safeId` 不接受部分原始 ETag 字元，不能強制轉換 |
| `membershipRevision/permissionRevision/correctionRevision` | 來自假會員/資源目前版本，與批准快照做**精確字串比較**，不等同 `securitySeq` | **假符合；真 Starry ID revision adapter 未建立** |
| `securitySeq/restoreEpoch` | #469 為**canonical uint64 十進位字串**，#474 Fake Witness `seq/epoch` 是 Python 整數，必須 `0..2^64-1` 範圍內無浮點轉換；`9007199254740993` 等大於 JS 安全整數也必須精確 | **只在 Fake 驗證**；#469 需和 AI7 `headSeq` 證明是否同一語義，不是直接轉成 Number |
| `revocationWatermark/deletionWatermark` | 正規化字串並與假獨立見證當前水位精確比對；新墓碑／見證不可用→deny | **Fake；真非回捲見證未建立** |
| `issuedAtMs/expiresAtMs` | 期效最多 30 秒；超時／未來、失去校驗的 proof 立即 deny | **Fake；真時鐘/簽章待核** |
| `fakeAttestation` | 僅本機測試註冊表中的假憑證能過；`verified:true`、瀏覽器傳值不可當權威 | **沒有真簽章，productionAuthorized 必定 false** |
| 真 Provider 所需 `modelId/taskId/segmentPlan/priceProof/budget` | #469 proof **沒有**完整模型/價格/額度欄位：B07 必須另外由伺服器可信資料核對，否則無法授權花費 | **BLOCKED** |

**驗證分成兩個階段：** `precheck`（費用預留前）與 `before_commit`（嘗試核票前），每次都重新讀假會員、假見證與假來源，避免預先通過後撤權仍重送。這是**契約模擬**；在真正分開的 Starry ID/Echo/中央 D1/R2 執行時，二次讀取與 D1 commit 中間仍有撤權競態，**本批沒有解決，也不許解除 #461 Whisper 阻擋**。

**額外安全測試：** 原本 20 項保留不動；第二輪新增 20 項，包含同 grant 新 requestId/runId/跨日不能重新預留/出第二票、`securitySeq` 與 `restoreEpoch` 超過 JavaScript 安全整數但在 uint64 內可精準比對、非法前導零/負數/浮點/超出 uint64 即拒發，審查後改權限/版本/音檔來源/撤權/見證失聯/證明逾時拒 claim，多段部分成功而另一段帳單 unknown 時不能因換 requestId 再發票或釋放預留額。測試是否 PASS 以 GitHub CI **最新 HEAD** 實際 log 為準。

**S1 第二輪不得越界：** 只有 AI3 假 Python 測試和本文件、分支專用 GitHub CI；沒有變更 #469、#461、#464 的真 Worker/SQL/會員／Cloudflare。原先 #474 仍以 #467（依賴 #464）為 base，**不得獨立 merge**、不得啟動真 Provider 或付費。
## R3 最終定向安全修補（總控 #455 #6290549782）

**僅 AI3 原 Draft #474 自己的 Fake SQLite 程式/測試；不修改 #461、真 B07、會員、Cloudflare 或其餘 AI 模組。**

本次先提交 `tests/test_n1a_s1_b07_round3.py`，GitHub CI [#39421075946](https://github.com/yukidu/Echo-Starry/actions/runs/39421075946) 的 46 項測試中，舊 40 項 PASS、新 6 項 **5 FAIL／1 ERROR**，重現來源日期越界、取消已排隊預留、同帳單重用與缺少供應商來源證明。**這個 RED 是修復前的證據，不代表已驗收通過。**

三項狹義修補，僅供離線驗證：

1. **計費日只能來自內部 Fake 伺服器時鐘。** `reserve(day=...)` 保留相容參數但任何外部提供日期立即回 `denied_untrusted_day`，不可藉不同日期重開帳號級 quota。合法跨 UTC 日界測試只控制 fixture 私有 `_trusted_utc_day`，不屬真用戶 HTTP 介面。原始 grant 身分不含 UTC 日期，因此同 grant 跨日仍不會生成第二筆 hold。
2. **Echo 仍可能排隊就絕不自動退 hold。** `FakeEchoQueue.certify_never_queued` 使用 Echo **本機假 SQLite 原子寫入不可重用的 `fake_echo_cancel_fences`**；有任何 queued/unknown 紀錄就不能建立 fence，fence 成立後 `enqueue` 原子拒絕任何後續同 run 鍵排隊；`cancel_never_sent` 必須先驗 fence、且 B07 無 ticket 才可 void，否則保留 hold。**這不是 Echo D1＋中央 D1 的跨庫原子交易**，真系統仍需可信跨庫狀態協定及失聯審核。
3. **供應商收費明細不能跨 run 重複使用。** `reconciliations.invoice` 增加中央單一 Fake SQLite 的 `UNIQUE`，同一 invoice *line*（非整張彙總發票）若已被另一 run 使用，`denied_invoice_reused`，原 unknown hold 不釋。首筆對帳須由 `FakeInvoiceAuthority` 的 **明確標示 Fake 的供應商憑證登記器**確認 `(invoiceLine,runIdentity,units)` 一致；任意傳 64 字元或只有兩位 Fake 管理員仍不足以算真帳單。所有結算於同一 Fake 中央 SQLite transaction，已完成的帳目僅追加事件不刪原 run 墓碑。**FakeInvoiceAuthority 是測試資料，不等於真 Provider 收據簽名／真雙人驗證。**

原第 1/2 輪 40 項假驗收保留；R3 額外 6 項專門檢查不可信日期、已排隊/ACK unknown 取消、可證明未排隊時 fence+void、同 invoice 重送、未知來源帳單拒絕。完整 CI 驗收須以 **修復後最新 SHA** 為準；勿把 RED 的 CI 當 GREEN。

仍屬 **BLOCKED**：正式 #464 的跨 requestKey grant/source UNIQUE、跨 Echo D1/B07 D1 的原子提交、真 Starry ID/獨立見證、真雙審、真模型價/官方免費額度/供應商真發票。本批不能接 Whisper，`#461 assertUnfundedWhisperBlocked` 必須保留；不可 merge main 或正式部署。