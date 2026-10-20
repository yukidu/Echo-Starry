# AI3｜S2367A B07-I1：Gate2 × B07 全離線契約與對抗測試

**狀態：Draft / MOCK ONLY / 功能 OFF / 尚未部署正式站。**

授權：[中央 AI2 #455 S2367A](https://github.com/yukidu/Echo-Starry/issues/455#issuecomment-6287828367)。
依序基於 main `60fc222f` → AI3 自己的 [#464](https://github.com/yukidu/Echo-Starry/pull/464) HEAD `3b77caca` → 本批獨立安全分支。**本 PR 必須以 #464 的分支為 base**，只增加 Fake adapter、假 SQLite 測試與本文件；不能與原 #458 一起另行重複合併 B07 底座或 migration。

## 與 #461 最新程式欄位對照（唯讀檢查）
#461 最新 HEAD `4b5ae25d`，`worker/transcriptP0Safety.ts` 的 `SafeRun` 包含 `runId / trackId / generation / state / leaseUntil / sourceAudioEtag / expectedActiveR2Key`，`worker/transcriptWorkflowV282.ts` 在每段 `env.AI.run('@cf/openai/whisper-large-v3-turbo')` 前仍呼叫 `assertUnfundedWhisperBlocked()`。這個安全拒絕必須維持；**本批沒有把 B07 接入該 Worker，也沒有修改任何 #461 檔案。**

## 新測試內容（沒有第三方連線）
- `tests/support/s3Gate2B07I1FakeAdapter.ts`：測試專用，無 Worker import、無帳單金鑰與任何供應商 API。根據 **受信任的** `trackId + 音訊 ETag + 本次批准 grantDigest + segmentIndex + model` 計算唯一 SHA-256，以避免換 `requestKey`、`runId`、`generation` 就重新付費。想真正再辨識必須得到**新的、有外部可信審批證據**的 grantDigest；不能因按鈕重送就自行給新 grant。
- `tests/s3B07Gate2I1.test.ts`：純 TS FakeProvider / Fake store，檢查同音訊換請求 ID、80 次重送、Provider timeout、不明帳單、中央資料庫失聯、舊租約／撤權／來源失效、主 Worker 維持隔離。
- `tests/b07-i1-offline-integration.py`：**只用本機**兩個 SQLite 檔，分別模擬 Echo 和中央 D1，載入 #464 中**唯一**原始 `20261020_ai_b07_budget_guard.sql` 與唯一 `20261020_ai_b07_s3_attempt_guard.sql`，不新增另一套 B07 正式 schema。只在本機記憶體測試生命週期建立 **fake_b07_i1_runs / fake_b07_i1_segments** 兩個測試用表，利用 SQLite `BEGIN IMMEDIATE` 與唯一約束，讓不同 requestKey、甚至重新命名 runId 無法對同一核准版本重複取得票。
- 同一 run 2 段：第 1 段已結算、第 2 段可能已送達、回應不明 ⇒ **原始 B07 全額 hold 不退回、不允許整份結算／再發**；僅可待日後合法證據與人工核對。跨 UTC 換日，同一 grant 也不能解鎖；Fake 權限撤銷、restoreEpoch 不明、來源 ETag 不符、租約過期一律拒絕。
- **2,000 個不同假會員同時間提交待執行請求**：單一離線 SQLite，共用全域 40 筆的假額度，預期 40 筆接受、1,960 筆拒絕；`ThreadPoolExecutor(max_workers=24)` 最大 **24 個實際並行測試執行緒**。這是「2,000 個同時送件意圖／受限執行緒競爭」，**絕不是 Cloudflare 上 2,000 條同時連線或 2,000 真人負載驗證**。
- 官方全帳號 AI 免費餘額沒有權威資料，一律拒絕；只可在**明顯標記為 Fake** 的官方額度證據注入時測通過。NT$0 的 priced 模型一律拒絕。
- 所有外部 Cloudflare/Provider 通訊 **0 次**。Fake 供應商只由本機函式計數，並非真的產生模型耗費。

## 無法因此宣稱已修好的事項
1. #464 **真正控制層**目前仍以 requestKey 參照費用預留；這一批是**完全離線 adapter/契約測試**，展示必須新增、持久化的「來源核准 identity guard」，**沒有將 Fake guard 上到 B07 正式程式或真 D1**。若沒有該原子 source identity，原 #464 仍可能被換 requestKey 繞過，**阻擋真 AI 開通**。
2. Echo D1 和中央 D1 之間**沒有跨庫原子交易**；本測試只驗證兩個假檔、中央資料庫內 SQL 原子排他。正式轉錄狀態在 B07 claim 後變更、會員撤權/restoreEpoch 衝突仍需 AI2/AI7 真權威；未核對前拒絕新 Provider 呼叫。
3. Provider 收到要求卻丟回覆時，無廠商冪等 API 不能保證真正 exactly-once。「未知則不自動補送」是保守措施，不可杜撰供應商沒計費。部分完成的 hold 可能久留，需後續由真正收據／兩名受授權審核者核實。
4. 本批無真正 Whisper/OpenAI/AI Gateway 請求、無正式費率/Cloudflare Neurons 檢查、無 Cloudflare 用量／真 2,000 人負載測試、無正式會員資料／備份／R2/Cloudflare D1 操作。
5. **#458 與 #464 底座及 migration 重複**。本次只從 #464 衍生，PR 依賴 #464，不會獨立合併進 main；中央AI2 必須選擇唯一 B07 基線才可以考慮下批整合。

## GitHub 驗收清單
- Draft PR 必須仍指向 #464 安全 branch（不直接目標 main），只改新增測試與 docs；比較 `git diff` 不得看到任何原有 Worker、#461 source、B07 migration、#458 檔案。
- 既有 GitHub CI/CodeQL/Regression/Browser/Build 六項逐項核對；離線 Fake 腳本的數據要引用 CI stdout 而不是自行宣稱。
- 六項全綠且 2,000 假請求驗收才向 #455 留 200 字內簡報；若 CI 失敗須記錄 FAIL，不可把上批 #464 的綠燈沿用。
- 所有環境旗標保持 OFF，CI Preview 只看建置，**不操作正式 Cloudflare、Provider 或使用者資料**；不得 merge、部署或付費。
