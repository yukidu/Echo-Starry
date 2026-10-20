# 【AI5｜N1A-S1 第二輪跨組相容性安全驗收】

**尚未部署｜原 Draft #471｜測試專用，Gate OFF。** 依 [#455 #6289517050](https://github.com/yukidu/Echo-Starry/issues/455#issuecomment-6289517050) 只新增本 AI5 分支的 Fake 測試與本文件，不更改 `offlineModel.ts`、舊 #459/#466、AI2 #469、AI3 #474 或任何 Router / D1 / Cloudflare。執行前應檢查 PR 最新 HEAD 的 GitHub CI；不能因測試綠燈直接宣稱已完成跨系統整合。

## 實際讀到的跨組契約（GitHub 現有 Draft，不是正式 API）

| 意義 | AI5 #471 現狀 | AI2 #469 SecurityProofV1 | **轉換政策** |
|---|---|---|---|
| F22 同一提問的事件版次 | `FakeEnvelope.sourceRevision: number`（1、2、3…） | **不是這一欄** | 只能當 `eventRevision`；更正、撤銷同一 `globalEventId` 版本遞增 |
| 被引用的內容來源版次 | F22 尚無該證據，`trackId` 不是證明 | `sourceRevision: string`（可為 ETag 等 opaque 字串） | 應另命名 `resourceSourceRevision`；**不能做 `String(event.sourceRevision)` 來比對** |
| 當期會員權限 | Fake `register()` 集合及事件接受時 `identityKind` | `membershipRevision:string`＋當期 active Starry ID Fake Reader | 註冊會員人數不等於可存取敏感報表；撤權後重新查時必 fail-closed。真 Starry ID 未接 |
| 独立安全版本 | Fake F22 **無**錨點查驗 | `securitySeq`／`restoreEpoch`／`revocationWatermark`／`deletionWatermark`：標準無前置零 uint64 字串 | 保留字符串並以 BigInt 類型驗證，不強轉 JS Number；未接 AI7 真錨點 |
| AI 新花費批准 | F22 只有事件 pending/done/failed 和「D1 配額預留」假機制 | `action='ai.attempt'`、`approvalGrantId:string`；AI3 有獨立 held／unknown／settled 流程 | **B07 花費持有≠成本結算，也≠F22 event sourceRevision 或 D1 rows 用量**；須隔離各預留權威 |
| 時效及資料外洩 | F22 `fakeStats()` 回傳匿名聚合但**無即時權限 Reader** | `issuedAtMs/expiresAtMs`、before_commit 重新查 | 私人報表的正式整合仍 BLOCKED；`verified:true` 與假簽章不能當真權威 |

**關鍵：** #471 分支本身沒有 #469 或 #474 的程式。新增測試是根據 GitHub **即時讀到的欄位定義建立獨立 Fake snapshot**，用來證明**欄位映射不會被誤用**及隔離失敗場景；**並未把 #469 的 `assessFakeSecurityProof()` 真正載入同一流程，也沒驗證真 Starry ID／Cloudflare／供應商互通**。後續需由 AI2 合併安全契約後以真正綁定 reader 再做端到端測試，不能先接正式 Router。

## 本輪新增 10 個可重跑 Fake 測試

測試檔 `tests/f22N1AS1Round2Compatibility.test.ts`，Node 22 + `node:sqlite`：
```bash
node --import tsx --test tests/f22N1AS1Round2Compatibility.test.ts
```

1. **R2-01**：事件版次 number 與內容版次 string 不可互轉，即使內容為字串 `"1"` 也不等於事件 `1`。
2. **R2-02**：會員在 fake precheck 後被撤權，應在後續 fake gate 拒絕；**負向證據**：原 `fakeStats()` 仍顯示歷史資料，原型無當期權限端口（正式必修）。
3. **R2-03**：會員 revision、外部安全版本、水位、來源或授權改變/失聯，fake gate 一律拒絕；僅檢查欄位語義，**不是真 signer**。
4. **R2-04**：F22 同事件狀態 pending→done、改音檔、再撤銷，同一事件只計一次；不能把 proof 內容版次錯當事件修訂版。
5. **R2-05**：內容 ETag 更正時 fake gate 拒使用舊 proof；**負向證據**：F22 原型自己不會因外部 proof 改變清除舊統計，需另批訂修正/隱私政策。
6. **R2-06**：新增一筆 AI held 費用只代表預留，不是已完成提問、真 provider 成本、TWD 零元或 F22 調用次數累加。
7. **R2-07**：Starry ID 撤權／獨立安全見證失聯時，假的新 spend 不得取得許可；D1 budget reserve 即使成功，也不能當作 AI spend grant（B07 權限獨立）。
8. **R2-08**：兩批共用**同一過期全帳號用量資料**，兩批都必須 UNKNOWN，保留額度為 0。
9. **R2-09**：兩批共用最新單帳號 78,000 假寫入數，第一批若預留 1,280，第二批加上後達 80,560，必須 WARNING/拒絕；失聯預留不能偷偷釋放/重執行。
10. **R2-10**：`securitySeq` 可為 uint64 字串但不能轉精度不夠的 JS Number；事件版次仍是獨立 JS 安全整數。

## 禁止誤判為通過的功能

- **尚未整合** Starry ID 真 member revoked、AI2 #469 proof/fake attestation verifier、AI7 外部權威、AI3 B07 費用帳本。R2-02、R2-05、R2-07 故意重現本機核心與外部權威**沒有接線**；測試 PASSED 不是問題修復。
- 原本 `offlineModel.ts` 及 `fakeStats()` **不具私人超管即時授權閘門**；不能當正式 admin API，也不應公開事件或會員鍵。
- 模擬 SQLite 在單機原子保留，不代表 Workers 多區、不同 Cloudflare 帳號或其它 App 真使用量都經過同一權威。Free 日/Workers Paid 月上限各不同，實際用量、索引、CPU、AI provider **未知**。
- 維持 `F22_N1A_S1_GATE_ENABLED=false`、`productionAuthorized=false`，PR #471 留 Draft；#459/#466 未整合，不啟用 F23/F24 公開排行榜。只有假資料測試及自動 PR Preview，**沒有 Production deploy**。

## 放行建議

只允許 AI2 對 **S1 第二輪測試和語義契約**做 Draft 審查；等 AI2 定稿 `eventRevision` vs `resourceSourceRevision`、撤權後匿名聚合刪改政策、AI grant 與 D1 配額彼此獨立，再另行請使用者批准最小 Fake adapter 或雲端整合。未證實的部位 **BLOCKED**，不要靠改測試預設來消除。
