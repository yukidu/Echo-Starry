# 中央 AI3｜N1A-S1 B07 純假資料費控驗收

授權：GitHub #455 留言 6288991208。只允許隔離安全分支、Fake SQLite/身分/AI、測試、Draft PR 和 GitHub CI。嚴禁真 Cloudflare、真會員、AI Provider、付費、Migration、合併 main 或正式部署。

## 依賴及檔案邊界

本分支基於 AI3 #467（它依賴 #464），Draft PR 必須以 #467 的安全分支為 base。只新增：
- tests/n1a_s1_b07_fake.py：Starry ID 會員、獨立單調安全版本、Echo queue、中央 B07 帳本與 Provider 計數器，全部 Fake。
- tests/test_n1a_s1_b07.py：20 項獨立假資料測試。
- .github/workflows/ai3-n1a-s1-fake-only.yml：限定安全分支的本機 Python/CodeQL 驗證。
- 本說明文件。

不修改 #461、#458、#464、#467 原始碼、Starry ID Router、正式資料表。#458 和 #464 基底重複，不可重複合併。#461 的 assertUnfundedWhisperBlocked 必須維持，真 Whisper 一律禁止。

## 安全規則

1. 一次批准的身分使用「核准 ID＋App/Task＋音檔 ID/版本＋模型」及分段固定識別。requestKey、runId、generation、日期不參與防重身分；中央 Fake SQLite 唯一鍵及原子交易只允許一次預留／每段一次性執行票。
2. 每段執行票在模擬 Provider 呼叫前持久佔位；真正送件權另以原子 sent=1 消耗。Worker 中斷、供應商收到請求卻遺失回覆、不明結果都不得自動重送或釋放原 Hold。
3. 多段必須全數確認才能整筆結算；任何一段結果不明，都保留原額度並要求人工對帳。Fake 對帳驗證兩名不同真人身分（非兩個不同帳號），相同憑證最多補償一次；未接真 Starry ID 審核。
4. Echo queue 和中央 B07 是兩份獨立 SQLite，不宣稱跨庫原子交易。排隊或預留 ACK 遺失標為 unknown，禁止新 Provider 執行；孤兒 Hold 不可依逾時自動退款。
5. Fake 的獨立版本見證只有記憶體模型，不能證明真實防回捲；官方全帳號 AI 免費餘額未知一律拒絕，新核准必須由將來的可信獨立見證發出，絕不靠改 HTTP 請求代碼。
6. 2,000 位虛構會員共用一個 Fake 全域限額（40 允許、1,960 拒絕），最多 24 條本機執行緒。不是 2,000 真實 Cloudflare 同時在線或實際帳戶費用／延遲證明。

## 執行與判退

本機執行：python3 -m unittest discover -s tests -p 'test_n1a_s1_b07.py' -v
另執行 Python 語法檢查及 Python CodeQL。

需看 GitHub CI 最新 HEAD 才可宣布成功，不能沿用舊 #467 的綠燈。核心不變式：相同批准最多一張票、Provider 不明絕不重發、未知帳單不釋額度、部分成功不整筆結算、跨 App 全域額度不突破。2,000 個假請求不代表真人負載。

## 仍待新授權

正式 B07 仍缺跨 requestKey 的 sourceGrant 永久 UNIQUE，#464 部分狀態更新也尚未保證完整單筆原子轉移；真 Starry ID 權限、非回捲錨點、供應商收據及全帳號免費額度都未接。不得使用 Fake verified 作真憑證，不能解鎖 Whisper、修改正式 migrations、合併 main 或部署。
