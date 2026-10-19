# 中央AI3｜A01 + A03 AI 模型資料庫與模型詳情（2026-10-20）

## 變更邊界
- 新獨立管理頁：`https://id.starry.phd/ai-models`，僅 Starry ID 已驗證的中央超級管理員。
- 既有 `/ai-management` 工作優先權、原生 QA、Whisper、字幕、會員電池、PWA、API 金鑰均不更改。
- 新唯讀 API：`GET /api/ai-models`（僅 Starry ID 正式網域、管理員登入；不提供其他 App 公開 API）。
- 使用既有 `STARRY_ID_DB`，不建立新 Cloudflare 資源或增加 Workers AI 呼叫。
- 尚未授權模型新增/金鑰/測試/啟用/備援切換（A02、A04），全部不在此 PR 開放。

## 資料可靠性
- D1 新表 `starry_ai_models`，獨立於 `starry_ai_config` 的任務優先權。
- 以現有程式 model ID 植入「未驗證」項目；不可因植入而解讀為可用、免費、已完成模型定價或自動啟用。
- 模型詳情：供應商、精確 ID、版本、能力、用途、路線、Gateway、免費資格、計價單位、來源時間、延遲與成功率。
- 價格與匯率沒有可驗證來源時顯示「待查」，延遲與成功率若無資料則為「尚無實測」。
- 100 則價格基準：每則 3,000 個中文字輸入、150 個中文字輸出；必須使用「有來源的每百萬 Token 進出價＋有來源的台幣匯率＋有明示假設的中文字 Token 比」，不假設 1 漢字 = 1 Token。
- 語音模型不適用於純文字回答估算，未來需依音訊計價規則新增專用估價；本批不猜費率。
- 不取得/存放會員提問、答案或機密 API 金鑰；不建立 AI 內容快取。

## 安全部署順序
1. branch + PR + regression/CodeQL/Preview（Preview 不綁定 Production D1）
2. 確認最新 main 與其他進行中 PR 無衝突。
3. 先以經審查、加法性 SQL `starry-id/migrations/20261020_ai_model_registry.sql` 遷移既有中央 D1（不動會員資料）。
4. squash merge latest main → Cloudflare Production 100% → 正式網站 API 權限/頁面/網域實測。
5. 對中央AI2交接：新 main SHA、PR、CI/Preview/Production、前版 Worker Version 還原代碼。

## 已知限制
- 完整的模型供應商核對、費率同步、新增/停用/啟用、金鑰保存、小額測試、路由及費用限制屬 A02、A04、B06–B08。
- Cloudflare Billing Read 權限不足，現階段不能判斷當前方案、實際帳務餘額或安全地填寫價格。
- Gateway 帳戶目前 0 個，沒有建立新 Gateway。
