# 中央AI3 A02＋A05｜安全模型管理與版本防護（2026-10-20）

## 權責與界線
- 使用者已核准第二批 S2-A，禁止任何新購買、方案升級、收費推理/測試、未核准模型啟用、改動其他 App 正式選型。
- 使用第一批原有獨立模型資料庫與中央 Starry ID 既有會員登入。新增 `/ai-model-setup` 與 `/api/ai-model-admin`、`/api/ai-model-admin/dry-run`，皆需中央管理員。
- 僅新增「模型目錄 metadata 草稿」、現有 Workers secret 的**綁定名稱參考**、安全版本審計。絕不儲存 API 金鑰內容、會員提問、答案或 AI 推理內容。
- 不動 Echo QA 設定、Echo 字幕、Whisper、電池、PWA、其他 App 路由；沒有 AI Gateway，新模型絕不自動成為正式選型。

## A02 安全精靈
1. 輸入精確模型 ID、供應商、版本、能力、適用工作，檢查資料結構及供應商名錄。
2. 金鑰僅記錄 Cloudflare 已存在 secret binding 名稱（`OPENAI_API_KEY`），不讀取、不接收 API key；狀態只顯示存在與否，不代表模型可用。
3. 「免費格式預檢」零模型請求、零 AI 費用；**真正連線、少量樣本測試、正式啟用**均保持鎖定，需新一次使用者授權，待 B07 費用限制與 A04 選型相容規則後開放。
4. 新增／修改模型一律保持 `unverified`；停用模型 `disabled` 為不可由精靈直接重新啟用。
5. 每一個管理員變更都有完整 before/after 目錄快照及版本 ID。變更須帶 `expectedUpdatedAt` 比對版本，保護同時工作中的其他中央管理員。

## A05 安全還原／LKG
- 新增兩張 Starry ID D1 表：`starry_ai_model_revisions`、`starry_ai_model_secret_refs`；附帶 9 個已登錄模型的不可變更 baseline 版次。
- 歷史清單可檢視動作、時間、執行者及版本 ID；還原前由管理員二次確認。
- 還原**只修改獨立模型目錄欄位**（名稱、供應商、適用能力、工作、路線），不更改 QA/Whisper/Starry ID 對外服務設定、不信任歷史價格/認證/免費資格。
- 已停用模型不可透過舊版本還原為允許；舊 `verified` 也被降為 `unverified`。保留被其他管理員修改時的衝突拒絕。
- 本批提供完整、唯讀版本清單及 safe historical snapshots，作為日後每個 App 採用本地 last-known-good 設定的來源；**目前未對其他 App 掛上本地設定快取或斷線自動 fallback**。這須與中央AI2、AI4 分工後，於 A04/B07 的接入工作完成，不可宣稱已上線。

## 安全性與成本
- 寫入僅允許管理員、同源 Origin `https://id.starry.phd` 並要求 JSON，內容 8KB 以下，資料欄位白名單驗證。
- 單次改動採 D1 原子 `batch` 交易，先版本比對再寫 immutable audit；不需重建會員 D1、不建立其他收費雲端服務。
- 目前 Cloudflare AI Gateway 為 0，模型費率仍可能待查。小額測試與新模型啟用一律鎖定，避免意外收費。

## 部署 SOP
- 安全 branch、PR、Cloudflare Preview、Regression+CodeQL+Browser/Typescript 必須成功。
- 生產 D1 在真正 Production deploy 前執行 additive migration：`starry-id/migrations/20261020_ai_model_safe_admin.sql`，檢查不動會員資料與模型選型。
- 合併前重新比較 main SHA、PR 更改檔案範圍；完成 Production 100% 並於正式網域重新跑 production smoke 以驗證。
- 每階段將證據寫到 PR #（待補），註明 rollback Cloudflare Worker version、前版 main SHA、D1 為 append-only 不隨程式 rollback 自動刪除。
