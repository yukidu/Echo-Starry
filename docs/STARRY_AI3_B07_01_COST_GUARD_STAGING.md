# 中央AI3 B07-01｜雙重費用保護第一批（PR 審核階段，禁止合併／部署）
日期：2026-10-20；中央AI2 已授權安全分支、Preview、CI、PR；**未授權 merge、D1 production migration、正式上線、真實供應商 AI 呼叫或任何付費升級**。

## 安全開發範圍
- 唯一基線 GitHub main `60fc222f076dd0c9821a76df780414d78f0538aa`；建立 `feat/central-ai3-b07-01-cost-guard-staging-20261020`。
- 新隔離中央帳本：`starry_ai_b07_policies`、`starry_ai_b07_policy_history`、`starry_ai_b07_tariffs`、`starry_ai_b07_circuits`、`starry_ai_b07_calls`、`starry_ai_b07_usage`、`starry_ai_b07_events`。**本批只提交 migration 文件，不套用正式 D1**。
- `worker/starryAiB07Budget.ts`：後端四層預算政策、版本保護、安全還原、免費模擬、保留／結算／未知狀態、三次異常封鎖，全部內部服務函式。**沒有對外公開 reserve/settle API，也沒有把該函式接到 Echo、Whisper、Mirror 等正式呼叫**。
- `worker/starryAiB07BudgetPage.ts`：登入中央超級管理員可檢視政策；上方「已結算」、「預留中」只顯示 B07 新帳本實際記錄，下方明確標示「虛擬模擬」；手機採卡片堆疊，桌面雙欄、歷史記錄及政策 CAS。
- GET/POST `/api/ai-budget`、POST `/api/ai-budget/simulate` 經 Starry ID 登入、`session.isSuperAdmin`、POST 強制官方 Origin／JSON 及 8KB 上限。前端沒有 API key、會員原始身分、逐字稿或問答快取。

## 每日限額、2,000 筆測試請求與安全併發、重複請求
- 以 UTC 日為帳務計費窗口 `YYYY-MM-DD`，保留每日 App、任務、會員及全域四重額度，獨立 `max_calls` 與 `max_micro_twd`。每個會員以 64 位不可逆 hash 做不帶個資的儲存 key；原始 UID 必須由未來的登入 App 伺服器自行推導，絕不可信任用戶端提供的 ID。
- 每個 AI 請求有穩定 `request_key`（唯一索引）、`fingerprint`（防止重複 ID 對應不同請求）及服務端 `id`。依中央驗證模型／供應商單位成本保守計算全流程最大使用量，**先寫入持有金額**。每日用量透過 `starry_ai_b07_usage` 唯一鍵 `(day,scope_key)`，由 SQLite D1 trigger 對四層上限即時拒絕超額，保護跨實例並發。單次 SQL 寫入及 trigger 原子性，完全不用易失的 Workers 記憶體變數。
- 真實結算：允許實際成本低於等於預留，使用預留時已凍結的單位費率；自動釋放差額。可證明模型**沒有被呼叫**才使用 `void` 釋放全部預留。若服務逾時／結果未知，用 `uncertain` 保留所有額度，等待人工核對，不重送同一請求再消費。已結算／未知不可自行變更為另一狀態。
- 模型／供應商三次異常以模型級 `starry_ai_b07_circuits` 停止新預留一小時；使用量帳務異常也應進入緊急保護狀態。是否已對帳、估算／現金扣款差異需要正式 Provider 用量來源才能核對。

## NT$0 但經證明免費的服務可以繼續
- `starry_ai_models` 必須 `registry_status=verified`，並有獨立有效且未過期的 `starry_ai_b07_tariffs` 官方價格／免費額度證據。
- 收費 `billing_class=priced`：`micro_twd_per_unit>0`，`free_eligibility=not_eligible`，若四層任一金額上限為 NT$0 則無法預留。
- 真免費 `billing_class=free_verified`：`micro_twd_per_unit=0`，`free_eligibility=eligible`，必須有經核准的 `daily_free_units>0`，另由 `free:modelId` 原子計數同時保護真實免費用量。即使每天金額 NT$0，仍可在四層**每日呼叫次數大於 0**且免費額度足夠時預留；超額或驗證到期則停止。
- 本批**不寫入任何已核准費率、不發放免費配額、不啟用模型**；既有九個模型全 `unverified`，所以目前無法新增任何付費風險呼叫。
- 顯示金額採「整數百萬分之一新台幣」以避免浮點帳務誤差。模型費率換算、核准時效及實際訂單帳單權限屬後續另一批。

## AI5／AI7 協作資料契約
- **中央AI5（統計 F22～F24）**：可將 `starry_ai_b07_events` 視為經費核算 **元資料事件**（`day, app_id, task_id, model_id, action, held_micro_twd, settled_micro_twd, created_at`）。不加入會員提問／答案、模型輸入輸出、API key，也不讓 AI5 修改 B07 日額度與事件；可彙總但需標記「僅 B07 已接入新帳本」。
- **中央AI7（I31/I32 備份）**：PR #457 `docs/STARRY_AI7_I31_I32_BACKUP_STAGING.md` 等其所屬 migration/Router。AI7 可在下一批備份清單納入這七張中央 D1 資料表及 schema；B07 不更改備份方式、R2 物件、金鑰或保留規則。還原需保留事件與 idempotency keys，不可只還原政策卻清除正在預留的帳務。
- PR #457 同時修改 `worker/starryIdCentralRouter.ts`；本 PR 僅在該路由最小新增兩條私有 budget 分支與頁面，兩邊合併前中央AI2 必須以最新 main 做重疊檢查與重新測試。**絕不覆蓋 AI7 的 router 新成果**。
- 其他任何已開發 Echo QA 的電池扣費與退款（`qa_claims`、`battery_transactions`）、Whisper 工作流程、PWA、會員登入與現有模型路由**完全不改**。

## 正式合併前額外安全檢查
- PR 含真 SQLite 交易 + **2,000 筆請求透過最多 12 個工作執行緒**的並行壓測。這不等於 2,000 位真人同時在線，亦非 Cloudflare Worker/D1 網路負載、延遲、連線數的正式容量驗證。CI Regression/Typecheck/Browser/CodeQL/Preview 須全通過，失敗不得批准合併。
- `tests/b07-budget-sqlite-safety.py` 使用 Python 內建 sqlite3，在臨時檔中送出 **2,000 筆不同請求、ThreadPoolExecutor(max_workers=12)**，檢查 NT$0 下真免費額度、收費攔截、四層計數與會員獨立額度、防重、異常熔斷、帳本防竄改及未知帳款保留。測試不建立 2,000 個真人帳號，不代表 2,000 位用戶同時連線。
- PR 測試成功後**停下**，不 merge main、不執行 Production migration、不在正式網站部署、不購買服務、不啟用付費模型。
- 下一步需另行核准：實際 Provider 價格/免費配額驗證與來源、各 App 受信任呼叫者接入、Cloudflare Gateway 或供應商實際支出限制、帳單核對與事故自動鎖定；不能把純預留系統視作供應商最終金額硬保證。

## B07-01 最後安全審查與 2,000 人容量聲明（2026-10-20）
- **前次宣稱「2,000 人同時連線測試通過」不正確，正式更正**：此前只是在本地 SQLite 上送出 2,000 筆*不同*寫入請求，`ThreadPoolExecutor(max_workers=12)` 意味同一瞬間最多 12 個測試執行緒處理資料庫操作；80 筆相同請求的防重也是 8 條執行緒。未建立 2,000 個即時連線、2,000 位真人或 Cloudflare D1/Worker 高負載測試環境，也未驗證實際網站 2,000 人同時使用。這是**帳務正確性測試**而非**系統容量認證**。
- 本次修正強化 SQL trigger，禁止在預留後竄改身分／請求 ID／價金／費率、未授權的直接刪除、結算金額不一致；新增各範圍每日限額、3 次供應商故障熔斷、同會員 200 筆中只能通過 20 筆，以及已結算不可刪除的 SQLite 回歸。
- **現有 Echo QA 未受影響的證據**：本 PR 沒有修改 `worker/aiSpeakerQaRouter.ts`、`worker/aiSpeakerQaOpenaiProvider.ts`、`worker/transcriptWorkflowV282.ts`、電池／會員／PWA 的程式或表；本批新增的 B07 reserve/settle 函式沒有接到任何 live AI runtime；existing QA live models and quotas are unchanged. PR Preview 成功**不表示 B07 已保護現有 Echo AI 呼叫**。
- **AI5 PR #459** 使用 Echo `qa_claims` 統計而非 B07 記帳，將真實 token／NT$ 成本明示「尚無紀錄」；它改 `worker/starryMainInlineLoginRouter.ts` 而本 PR 改 `worker/starryIdCentralRouter.ts`，程式檔無交集。未來依 request-key 對應後再加帳單資料，沒有數據時不能把使用次數算成實際支出。
- **AI7 PR #457** 修改 `worker/starryIdCentralRouter.ts`，與本 PR 唯一已知共用修改路徑，因此需總指揮明定合併先後，後合併者需重新比對 main、保留前者內容、重跑全部測試；中央 D1 的 7 張 B07 表必須同時間點快照，不能單獨重置帳務、唯一 request_key 或預留中交易。

### 無付費 AI 的真正高負載驗證方案（**尚未執行**）
1. 僅建立**本機隔離**測試 Worker／SQLite（或免費本機模擬 D1），載入只含假模型與假用戶的資料；所有外部 AI 發送點替換成永不連線的 stub，鎖住 `OPENAI_API_KEY`、`AI.run` 與所有供應商網址。絕不對正式網站或正式 D1 發送負載。
2. 準備 2,000 個**模擬用戶身分**和 2,000 個獨立請求 ID，使用 k6 或 Node.js 負載工具分批拉升虛擬用戶（例 50→200→500→1,000→2,000），以同步起跑點發送請求。逐批註記：「虛擬用戶數、實際同時進行請求數、測試者硬體 CPU/記憶體、成功/拒絕/逾時」；不能把累計請求數冒充同時連線數。
3. 重放同一請求 ID 80 次、同會員跨裝置發起請求、四層不同金額與次數預算同時競爭，以及 UTC 換日、供應商逾時、資料庫 busy/timeout、政策調降、模型停用/價格過期；對所有 rejected 與 ambiguous 請求查 DB 狀態，確認 no double hold、no oversubscription、unknown remains held。
4. **驗收目標**：全部應受限請求都被阻擋、每筆 request ID 唯一、所有已接受交易都有完整一致的四層用量／事件、資料庫無負數／孤兒紀錄；紀錄實測最高實際同時進行量與 p50/p95/p99 延遲及逾時率，**不得用未實測的性能數字承諾 2,000 人可用**。
5. 此本機試驗不代表真實 Cloudflare D1 全球節點的延遲與資源額度。若需驗證真實 2,000 人同時使用，另取得**隔離且可核實免費額度的 Preview／測試帳號**授權；禁止使用正式會員資料、上傳音檔、AI 服務或正式部署。無法確認成本為零則停止，不執行。
6. 無模型核准、價格憑證及真實帳單前，**第二道供應商付費停止沒有啟用**，所以目前不能說「AI 雙重費用保護已在正式站全面生效」。B07-01 始終只是中央 staging-only PR。

