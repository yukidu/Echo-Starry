# 中央 AI 2｜N1A-S1 純假資料安全契約

**絕不可接正式環境。** 本目錄僅為假 Starry ID、假獨立防回捲錨點、假資源權限的離線驗收原型；不得變更正式 Worker Router、中央會員、D1/R2、Cloudflare 或真 AI。N1A_SECURITY_PROOF_RUNTIME_ENABLED 永遠為 false，所有結果 productionAuthorized:false、sideEffects:0。

## 安全通行證模擬欄位
- subjectId、appId、action、resourceId、requestId、nonce：綁定目前這次操作。
- membershipRevision、permissionRevision、correctionRevision、sourceRevision：當前會員、授權、更正與音檔來源版本。
- securitySeq、restoreEpoch、revocationWatermark、deletionWatermark：全部採 uint64 canonical 十進位字串，不接受 JavaScript 浮點數、前導零或不合法值。
- AI.attempt 須有 approvalGrantId；一次性 Provider claim / 耐久費控帳本仍由 AI3 開發，**本模組完全不會付費**。
- issuedAtMs、expiresAtMs：離線建議最多 30 秒，正式驗證時間及權限失效策略仍待獨立審核。

## 驗收方式
每次 precheck / before_commit 分別重新讀取注入的假會員、假錨點及假資源版本。失聯、撤權、刪除、訂正、跨 App 重放、版本回捲、過期均拒絕。即使 simulatedAllowed=true 也不是正式允許。

這裡的 sourceId、fakeAttestation 與 verifyFakeAttestation 都是**測試替身**，不是有效簽章、真 Starry ID、真不可回捲見證或外部身份驗證。使用者/前端傳入 verified=true 絕不可作為正式權限。

## 測試
node --import tsx --test tests/n1aSecurityProofFake.test.ts

17 個假資料案例包含 2,000 假請求在權威失聯時全部拒絕。這不是真 2,000 人並發壓測、不保證真 Cloudflare 免費額度，也不是正式軟體上線。

只有安全分支與 Draft PR 可審查。需要真來源簽章、還原權威、B07 費用、共享 Router 或 Production 時，必須取得使用者另一次明確授權。
