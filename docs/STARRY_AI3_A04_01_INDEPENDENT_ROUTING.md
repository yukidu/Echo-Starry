# 中央AI3 第三批 A04-01｜各 App／各功能獨立 AI 選型（2026-10-20）

## 指令與來源
- 中央AI2已正式核准 A04-01 **僅中央控制層**：不得更改現有各 App 的正式模型、問答、人物摘要、Whisper、會員權限與電池流程；禁止真實付費 AI 測試、購買或升級服務。
- 起點 main：`88c9379ac7b3b1fc1a379ddf6b8e297a0059364d`（PR #454 merged）；部署前 Worker version：`0d5a8f71-5dbb-47f9-ac1c-8ed5dc79f1dd`。若 main 移動，以合併前重新查核為準。
- 中央正式 D1 原有九個模型截至本批開工皆 `registry_status=unverified`，沒有「已核准且相容」可用選項。**UI 必須顯示空清單、禁止保存**；不假設任何現有模型已驗證／免費／可啟用。

## 架構、獨立性和權限
- 新 `worker/starryAiTaskRouting.ts` 與 `worker/starryAiTaskRoutingPage.ts`，僅 Starry ID `https://id.starry.phd/ai-routing` 中央超級管理員可見。
- 新 `GET/POST /api/ai-routing` 與 `POST /api/ai-routing/preview` 需本人中央 session，寫入需 same-origin Origin＋JSON，單次限制 8KB，嚴禁 CORS 跨網域與 API key 值。
- 新 `starry_ai_task_routes` 與 `starry_ai_task_route_revisions`：聯合主鍵 `(app_id,task_id)`，每個 App／功能獨立草稿，不共用模型或互相覆寫；版本加一、最後修改人、歷史前後快照、版本比對，避免跨對話同時改動被覆蓋。
- **僅 `status=staged`**，沒有 runtime active 欄位，也沒有任何 API 用來向各 App 下發／套用此草稿。本批不建立 R2/KV 快取與外部模型路由，不建立 AI Gateway。
- 已盤點：Echo 問答 `echo.qa`、人物摘要 `echo.bio`、Whisper `echo.transcribe`、繁中校正 `echo.normalize`、多人故事歸屬 `echo.story`（新目錄工作，不觸碰既有執行）；Mirror 解籤 `mirror.reading`（純中央草稿）。Starry ID 本身為會員管理中心，沒有獨立推理工作。
- A04 工作目錄與舊 `starryAiManagement.ts` 的**任務排序**完全分開；尤其不修改其他對話的 QA／Whisper 實際邏輯。

## 模型核准與費用安全
- 每筆所選模型須存在於 `starry_ai_models` 且 `registry_status=verified`、`free_eligibility` 已核對為 `eligible` 或 `not_eligible`、`route_kind` 為 `workers_ai`／`direct`、模型 `tasks_json` 包含指定功能、`capabilities_json` 包含該工作的必要能力之一。
- 因 B06 尚未啟用 Gateway，所有 `route_kind=gateway` 的模型不能選；語音任務只允許語音轉文字能力，繁中校正只允許整理／校正能力。
- 必須有一個主要模型和最多 3 個備援，所有 Model IDs 不重複；即使在歷史還原時也要再次核准，已停用／已失效模型不可復活。
- 所有中央選型都只暫存，**不啟用、不請求推理、不扣電池、不變更實際問答或 Whisper 的既有 fallback**。
- A04-02／A04-03 接入 App 或建立 last-known-good 副本以前，仍沿用各 App 正式舊設定；不可將此中央表解讀為目前真實正在運行的模型。
- 核准模型且成本開關須在 B07 費用治理後單獨授權；這批尚未建立模型身份審核核准 UI，現有 A02 模型建立精靈只能保留 unverified。

## 部署與安全
1. PR diff 僅新增中央選型模組、文件、D1 表、測試，及 Starry ID 中央路由與模型資料庫頁的最小連結。
2. Github Regression、type diagnostics、browser-ui、CodeQL、Cloudflare Preview Build 全部成功才合併。
3. 更新 D1 前確認 schema migration 僅新增表/索引；**不得操作會員資料**，保留部署前 D1 時點證據。
4. 合併前重新確認最新 main、未合併 PR 變更路徑； Production Build = 最新 main；正式 Worker 100%；部署後 smoke 成功，才說部署完成。
5. PR 存完整成果、執行證據、已知限制與 rollback Worker version；同時交中央AI2六項共 200 字內摘要。

## 後續與已知限制
- 下一階段 A04-02：中央核准者角色、真實模型供應商驗證及 B07 費用上限；A04-03 逐 App 安全試點接入後再考慮 LKG 本地快取。
- 真人登入管理員 UI 的完整互動需要管理員真實 session 驗證，自動檢查不代表已真人驗收。
- 如果其他對話更新 QA 或會員權限，永遠以最新 main 為準，不得 cherry-pick 舊權限邏輯或修改其程式。
