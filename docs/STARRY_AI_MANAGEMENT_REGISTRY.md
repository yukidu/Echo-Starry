# Starry 生態系 AI 登記與優先權規範

管理入口：https://id.starry.phd/ai-management （限超級管理員）
設定來源：Starry ID 中央 D1，代碼：worker/starryAiManagement.ts。
每個 App 仍保留自己的 Workers、資料庫、會員資料權限與 AI 呼叫。

## 新增／修改 AI 功能時必做

1. 每個新的 AI 功能要有唯一且長期不變的 id、功能名稱、App、說明、模型、模型備援、管理頁 URL、處理類型（即時／互動／背景／相依）。
2. 繁星回聲同一 repo 新增／修改 AI 功能，更新 worker/starryAiManagement.ts 的 AI_TASK_CATALOG；若是既有功能替換模型，也要更新其模型文字或接上讀取正式設定的即時來源。
3. 繁星心鏡維護公開唯讀 /api/mirror/ai-catalog，中央 ID 會即時讀取其主要 AI 模型。新增不同 taskId 時，也要同步註冊 AI_TASK_CATALOG 與其中央優先權設定，並做跨 repo 的 smoke test。
4. 新的 Starry App 第一次加入時，先將其 AI 目錄端點和 taskId 登記中央。正式上線後要保證目錄同步，不能只靠 ChatGPT 口頭記憶。
5. 修改時驗證 Starry ID「AI 清單」顯示最新資訊，AI 優先權排序可在三層間移動，禁止未登入／非超管寫入，並保存操作紀錄。

## 排程原則

- 即時使用者任務優先響應；背景任務要遵循中央順位，但第三方 Cloudflare AI 推理伺服器的排隊不能強制插隊。
- 工作已在執行時不可因順位變更而中止。逐字稿的繁體化依賴錄音轉寫的結果，這屬於流程依賴，不能獨立跳過。
- 中央服務異常時保留最近可用的設定或使用預設值，不可讓整個 App 停止。
- 兩個 App 仍保有資料庫隔離；只回傳 AI 目錄與狀態，絕不把私人會員資料寫入中央目錄或監測日誌。
- 任何快取或監測都要節省 D1/KV 操作，避免每次刷新頁面向所有 App 發送大量要求。
- 新增模型以前，檢查 Cloudflare Paid 資格及額外收費；不得默默接通第三方收費模型。
