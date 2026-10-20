# 中央 AI4｜N1A-S1 搜尋引用安全：純假資料模組
**正式功能永遠 OFF。** 此分支僅離線虛構內容，不接 Starry ID、Echo Router、D1/R2、Cloudflare、AI 或付款。

## 新增三個專屬檔案
- n1a-ai4/searchCitationFake.ts：T0 查詢前、T1 搜尋後、T2 答覆送出前，再加 SEND 模擬傳送瞬間的權限/來源核對。僅在記憶體中釋出虛構文字，不是跨服務原子撤權技術。
- tests/n1aAi4CitationSafetyFake.test.ts：20 項假測，含撤權、刪除、更正、來源換版、見證倒退及 2,000 虛構請求。
- 本 README 為執行界線與已知限制。

## 測試命令
node --import tsx --test tests/n1aAi4CitationSafetyFake.test.ts
另可使用 Node 22：node --experimental-strip-types --test tests/n1aAi4CitationSafetyFake.test.ts

## 安全及整合界線
N1A_AI4_PRODUCTION_ENABLED=false，所有測試決定 productionAuthorized=false、sideEffects=0。假權威不是真簽章、Starry ID 或可證不可回捲紀錄；同步 SEND 只能模擬單機排序，不能保證不同 Worker/HTTP 同時撤權無競態，已送出的 bytes 無法追回。
中央AI2 #469 有自己的 SecurityProof 假契約，本分支不修改/覆蓋。正式整合須等待 AI2 凍結共同證明格式，另獲真權威/正式 Router/雲端的授權。
#465 中文搜尋演算法、#468 凍結盲題不變，既有盲測 Top-5 19/40=47.5% 仍是 FAIL；#460 FTS5 不套用。不可修改 #461 Whisper 費控或其他 AI 工作。

## 必須保留的上線阻擋
1. Starry ID 現行權限/撤權、Echo 版本與訂正事件原子失效、外部可信且不回捲的見證來源均未接線。
2. T2到實際首個回應位元組的跨服務發送柵欄仍無真實證明；不可拿三次權限讀取冒稱零外洩。
3. 2,000 真會員負載、Cloudflare 帳號費用、實際 D1/R2 和真 AI 答覆皆未驗證。
4. 不建立 Cloudflare 資源、不呼叫真 AI、不合併、不付費、不 Production Deploy；所有正式功能 OFF。
