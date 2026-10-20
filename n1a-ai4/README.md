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

## 第三輪 R3｜P0 每份音檔授權、P1 原文取用時序與完整性（2026-10-20）

中央AI2 [#455 #6290549782](https://github.com/yukidu/Echo-Starry/issues/455#issuecomment-6290549782) 限定修復 AI4 自己的三個問題：

1. **每份音檔預設拒絕**：單純會員存活不代表可讀 VIP 音檔。Fake constructor 現在要求在測試明列 `grantedTrackIds`；每次 T0/T1/T2/SEND 的假權威均以 per-track `entitled:true` 加版本比對。任何一份未獲准，一整份多來源答覆拒絕。
2. **先證明再取原文**：`simulateProtectedQA` 只接受**不含 text**的 `FakeSourceRef`；即使呼叫者直接帶入 `text`，也在 T0 原地拒絕。私密文字由假權威在 T0、T1 都證實有效後，從私有 `resources` 一次取到緩衝；沒有原文預先進入搜尋請求。
3. **內文變動但版本未加一律拒絕**：可信**假資料來源內部**計算 SHA-256 `contentDigest`，T0/T1/T2 與最後 SEND 均連同 permission/source/correction 版次比對；若 T2 後正文被偷換，即使版本沒改，也拒釋出舊稿。雜湊**不是**真 R2 ETag 或加密簽章，不能代替真內容來源證明。

紅燈證據：新 `tests/n1aAi4R3RegressionFake.test.ts` 在原 Fake 模組上，GitHub Regression [#39421056131](https://github.com/yukidu/Echo-Starry/actions/runs/39421056131) 的**9 項全失敗**；修復後復測需在最新 SHA 的綠燈 CI 證明。原第一輪與第二輪各20項均保持，未修改原中文搜尋演算法、#468凍結盲題或別組 PR。

**不可高估**：這只是一個在記憶體同執行緒內執行的 Fake mock，沒有真會員授權分級、真 ID/內容資料、分散式撤權 SEND fence、跨多 Worker 的可證原子順序或獨立不回捲錨點。正式資料、真 Cloudflare 成本及 AI 呼叫全部未測，所有 OFF、Draft、未合併、未部署。
