# 中央AI3 B07-01｜雙重費用保護第一批（PR 審核階段，禁止合併／部署）
日期：2026-10-20；中央AI2 已授權安全分支、Preview、CI、PR；**未授權 merge、D1 production migration、正式上線、真實供應商 AI 呼叫或任何付費升級**。

## 安全開發範圍
- 唯一基線 GitHub main `60fc222f076dd0c9821a76df780414d78f0538aa`；建立 `feat/central-ai3-b07-01-cost-guard-staging-20261020`。
- 新隔離中央帳本：`starry_ai_b07_policies`、`starry_ai_b07_policy_history`、`starry_ai_b07_tariffs`、`starry_ai_b07_circuits`、`starry_ai_b07_calls`、`starry_ai_b07_usage`、`starry_ai_b07_events`。**本批只提交 migration 文件，不套用正式 D1**。
- `worker/starryAiB07Budget.ts`：後端四層預算政策、版本保護、安全還原、免費模擬、保留／結算／未知狀態、三次異常封鎖，全部內部服務函式。**沒有對外公開 reserve/settle API，也沒有把該函式接到 Echo、Whisper、Mirror 等正式呼叫**。
- `worker/starryAiB07BudgetPage.ts`：登入中央超級管理員可檢視政策；上方「已結算」、「預留中」只顯示 B07 新帳本實際記錄，下方明確標示「虛擬模擬」；手機採卡片堆疊，桌面雙欄、歷史記錄及政策 CAS。
- GET/POST `/api/ai-budget`、POST `/api/ai-budget/simulate` 經 Starry ID 登入、`session.isSuperAdmin`、POST 強制官方 Origin／JSON 及 8KB 上限。前端沒有 API key、會員原始身分、逐字稿或問答快取。

## 每日限額、2,000 人併發、重複請求
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
- PR 含真 SQLite 交易+2,000 併發模擬。必須 CI Regression/Typecheck/Browser/CodeQL/Cloudflare Preview 全通過才允許送中央AI2審核，失敗保持 draft。
- `tests/b07-budget-sqlite-safety.py` 使用 Python 內建 sqlite3，在臨時檔驗證 2,000 人併發、零付費上限下免費、收費拒絕、配額不超支、防重、未確認成本保留、已結算不能重做。
- PR 測試成功後**停下**，不 merge main、不執行 Production migration、不在正式網站部署、不購買服務、不啟用付費模型。
- 下一步需另行核准：實際 Provider 價格/免費配額驗證與來源、各 App 受信任呼叫者接入、Cloudflare Gateway 或供應商實際支出限制、帳單核對與事故自動鎖定；不能把純預留系統視作供應商最終金額硬保證。
