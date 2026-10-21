# AI4 P0｜來源充分性與引用安全前置（Draft/OFF）

**不合併、不部署、不寫正式資料、不開付費 Provider。這是安全準備模組，不是第二套搜尋引擎。**

## 為何需要
- 最新候選 #505 的 `shared/qaEvidenceSelection.ts` 用 `score > 0` 排除零分片段，並不是確認答案**真由來源支持**。字面相似或標題吻合，仍可能答非所問。
- 舊 #501 已公開的 50 題合成驗收：40/40 Top-5，10 題無來源只有 **1/10** 真正拒答，**保留 FAIL**。不可針對這 50 題調參或把 #505 的 CI SUCCESS 當作反證。
- 現有正式路由摘錄沒有穩定 `trackId/segmentId/timecode/版本` 引用封包，也沒有連動 AI6 真即時撤權及 AI3 持久 SEND claim；**不能直接把候選模組併入正式路由**。

## 本輪實作（不動 #505 router、#501 題庫、既有索引和 migration）
- 新增 `shared/qaEvidenceProofGate.ts`，在 #505 的**既有搜尋結果**後提供額外驗證；**沒有自行建立排名或另一套索引**。單個候選只要無來源、零匹配、欄位不齊、權威未知、撤銷/刪除/版本不符，即回傳空字串與空引用。
- 用真實本地 SQLite `SELECT`（完全虛構資料）連續讀兩次證據狀態，針對同個身分、session、App、action 及片段與版本比對。使用 SHA-256 比對完整來源與精確片段、track/segment/timecode、source/resource/permission、revocationWatermark、restoreEpoch，禁止舊來源復活。
- 額外要求由**伺服器受信任的獨立支持性評估器**對問題、精確段落摘要及引文出具同一份 hash 的判定，**不**以字詞分數、AI 自述、用戶旗標作為來源充分性憑據。這個實際受信任的評估器**尚未指定/接線**，任何缺少皆拒答。
- 即使所有假資料預檢通過，也只會回傳 `PREPARED_OFFLINE`，永遠 `canSend:false`。**沒有 Provider/回覆 HTTP/持久 claim 介面，也不會觸發付費 SEND**；不得把預檢當成最終權限。
- `tests/ai4P0EvidenceProofGate.test.ts`：30 個獨立假資料 + 真本地 SQLite SELECT 單元測試，包含「文字有關但不足」、「無來源」、「中央拒權/撤權/刪除」、「跨 App/身份」、「引用片段/時間/來源 SHA/版本不符」、「兩次讀取間撤權/刪除/還原版次」；拒絕皆 0 prompt/0 citation bytes。**這些不是正式系統的安全測試**。

## 待 AI2/AI6 明確決定才能做正式接線
1. `readCurrent()` 的唯一可信資料來源、中央 session/permissionRevision 與 Echo resource/source revision 的主資料讀取時序、身份作用域，`restoreEpoch`/撤權最高水位不得倒退。正式 Worker 使用同一可信 owner；不得信任用戶傳來的引用或分數。
2. 精確段落、時間碼與 sourceDigest 的資料模型（現有 #505 摘錄按六片分組，不保留精確 segment ID）；資料變動時必須同步失效或拒絕過時證據。對長逐字稿持續讀全部 bytes 的成本亦需實際量測。
3. `assessSupport()` 的獨立語義充分性判斷與稽核、錯引/拒答驗證。單純「同一份段落含有幾個字」不是充分性。需獨立審查者凍結新題庫與可信答案，AI4 不得提前見到答案；新題 Top-5 ≥90% 且無來源/錯引/撤權均安全。
4. `PREPARED_OFFLINE` **絕不可以直接進入 Provider**。READ 後到付費 SEND／最終 HTTP 首 byte 之間仍有競態：要由 AI3/AI6 持久原子一次性 `claim + authority fence` 接管，否則維持 OFF。拒權/權威 UNKNOWN 預期 0 私密 HTTP bytes、0 付費 SEND；本模組尚未測到真 Worker 邊界。
5. 不修改中央 AI2 #505／#501，也不硬套 #460 FTS5 與 #465 普通表兩份 schema。唯一索引方向先由 AI2 裁決；本輪無索引變更。

## 真實測試與結論

`node --import tsx --test tests/ai4P0EvidenceProofGate.test.ts`，應由 GitHub 的既有 `Regression audit` 逐檔執行並保留 TAP；未見 job 原始 log 前不得標 PASS。

**正式 Gate：FAIL/UNKNOWN/OFF**。#501 拒答失敗必須獨立保留；只有 AI2 能整合與在全部正式驗收後安排一次 Production 部署。
