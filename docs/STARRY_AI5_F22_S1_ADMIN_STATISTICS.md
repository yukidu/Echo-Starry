# 中央AI5 F22-S1｜管理員統計排行榜（2026-10-20）

## 授權與隔離
- 僅授權 branch、程式開發、測試、Preview、PR；禁止合併 main、正式部署、改正式資料庫、付費 AI、開發 F23/F24。
- 起點 main 60fc222f076dd0c9821a76df780414d78f0538aa。最新 main 後續變更需再確認。
- AI3 PR #456 已合併。B07-01 中央費用保護仍是 staged 控制，沒有正式計費接入。
- AI7 PR #457 Draft 只改 Starry ID backup 與中央 router；本批避開這些檔案。
- 變更限制於 Echo 統計專屬新模組、UI、測試、文件及少量現有 Echo 路由接入。

## UI 功能
- 繁星回聲／音檔管理／AI演講者／使用統計（僅超級管理員）。
- 今天／7天／30天／全部；手機雙欄、電腦四欄卡片。
- 音檔與講者排行、召喚／去重會員／重複引用排序、日期趨勢與可展開詳情。
- 歷史缺少的 Token、速度、模型備援及新台幣實際費用，顯示尚無紀錄，不作假數。
- 成本排序目前沒有可信數據，UI 明示暫依召喚數排序。

## 精確計算
- Echo D1 qa_claims 代表一次「AI召喚請求」，不是每次供應商模型呼叫數。備援、品質修正不能推論。
- 跨音檔的唯一會員數用 distinct member 身分，排除 guest；不得合計排行各列會員數當全站總數。
- 使用台灣日期；LAG 比對同一身分與同音檔上次召喚時間。5／30／60分鐘為包含式，不能相加。
- 音檔 join 先將 track_speakers 預聚合，避免多人演講造成重複計數。
- 講者排行中，多人演講缺少可靠逐筆指向證據，一律列「多人演講（未歸屬）」，不可硬派給各講者。
- pending、done、failed 分別統計；既有紀錄不完整的時間與費用欄位顯示未知。

## 與 B07 一致的費用規則
- B07-01 使用 micro_twd 百萬分之一新台幣的分母，reserved 預留與 settled 結算分開。
- 現有 B07 尚未接入正式 AI：不可把預留、會員電池或費率估算當實際費用。
- F22-S1 actualTwd、estimatedTwd 均為 null，costState 為 no_history。沒有證據時不回填。
- 需 AI3 另外批准正式計費接入並有逐筆 commentId 對應和可信費率，F22 才能讀取成本；不修改 B07 表及其執行路由。

## 安全
- 每次後端請求驗證 Echo 的有效 session，然後核對 Starry ID 中央 active 會員、active 中央角色為 super-admin 或中央設定允許的管理員 Email。Echo 本地角色不足以放行。
- 回傳不包含會員私人問題、回答全文、逐字稿、身分識別或金鑰；HTTP GET 僅超管、無 CORS、private no-store。
- 任何缺少中央連線的環境拒絕存取，不會降級為 Echo 本地管理員認證。

## 效能及成本
- 每次查詢做 3 個只讀聚合：總覽、前60個排行、最多366個日期。
- 依 qa_claims_day 既有索引及範圍條件，不做 R2 讀取、KV 存取或 AI 呼叫，不修改 DB schema。
- 全期間歷史日久可能增加 D1 讀取量。將來若需每日聚合表須另外取得授權，不在本批新增任何正式資料庫變更。

## 安全驗收
- 應執行 npm run lint、npm test、npm run build，以及 GitHub PR Regression、CodeQL、Cloudflare Preview。
- Preview 若不綁正式 D1 是安全設計；Preview Build 成功不代表正式資料庫實測完成。
- PR 保持 open，不合併、不部署，需待中央AI2查核及使用者下次明確授權。
