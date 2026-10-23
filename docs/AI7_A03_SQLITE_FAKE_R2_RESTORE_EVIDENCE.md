# AI7 A03 — 真正的本機 SQLite × 假 R2 檔案端到端安全驗收

**Draft / OFF / NOT MERGED / NOT DEPLOYED / TEST DATA ONLY**

- 中央派工：[#455 A03](https://github.com/yukidu/Echo-Starry/issues/455#issuecomment-6314222143)
- A01 既有隔離 PR #485、A02 驗收矩陣 PR #489：唯讀參考，不改動或複製入本 PR
- Baseline main: `60fc222f076dd0c9821a76df780414d78f0538aa`
- 本 PR 僅新增 `tests/ai7_a03/` 本機 Python 檔及 `tests/ai7A03RestoreEvidence.test.ts` CI 入口，不接產品 Worker、API、Cloudflare、帳號金鑰或正式 DB/R2

## 如何直接重跑 GitHub 原始測試

```bash
python3 -m unittest discover -s tests/ai7_a03 -p 'test_offline_restore.py' -v
```

現有 GitHub Regression audit 會找到 `tests/ai7A03RestoreEvidence.test.ts`，用 `node --import tsx --test` 執行；該檔使用 `python3` 在**同一次 CI Git checkout** 執行上列測試，原樣輸出 Python stdout/stderr、exit code、兩份 Python 檔的 SHA-256，明確斷言 **50 tests / 0 errors / exit 0**。既有 workflow 未修改。

本地 Python 3.13.5 真實 runner 輸出：`Ran 50 tests in 1.057s\n\nOK`；shell exit 0。當前 Node 22.16.0 缺少 tsx，故本機只能以完全相同 JS 邏輯的暫時 .mjs 版本核對 Node wrapper，並**不**冒充原 GitHub TypeScript 檔已由本地 Node 直接執行。正式可複驗證據以 GitHub CI 的原始 log、GitHub 精確 commit 為準，若未產生應標 CI NOT VERIFIED。

本地可核對 SHA-256：
- `offline_restore.py`：`99250062bfb268d1fea6bccea8d9fdc15e21598378d6ef547c67b33c1d792289`
- `test_offline_restore.py`：`345287fb5f6ee396c06fc1641503b9a1648b73fd54d33eda455e81cf78872416`

## 覆蓋與真實執行內容

實際在系統暫存資料夾建立**獨立的 SQLite 實體資料庫**：
- `backup-index.sqlite` 保存 Full→Delta manifest 與連續版本；
- `independent-authority.sqlite` 保存假的刪除墓碑、撤權水位、restoreEpoch、管理員、一次性 claim；
- `fake_r2/` 是本機的真正 bytes 檔案，每段以 SHA-256 檢驗內容；
- `synthetic-restore-preview.sqlite` 只包含模擬還原輸出，**絕不接觸真備份、R2、D1 或公開發布**。

50 項測試涵蓋：Full→Delta 實體還原預覽、備份遺失、內容遭改、父鏈/版本回捲、Starry ID / Download 跨 App 資源混用、刪除墓碑與撤權發生於備份後及預覽後、簽章 head/floor 及過期/分叉、兩位不同假真人和當期有效批准、SQLite 持久的一次性 claim、防重播、DO/Workflow 尚在執行、多寫入者和 OAuth/cookie 不相容，以及拒絕後清除**本機暫存預覽檔**。

首次本地測試為 36/37 PASS：有一項父鏈篡改測試誤先碰到父檔 hash 拒絕（測試預期錯置），只修正測試資料能抵達意圖的 `CHAIN_PARENT` 檢查，沒有關閉安全驗證。最終增補到 **50/50 本地 PASS**。

## 強制區分未驗證的正式風險

1. 本地 R2 資料夾**不是** Cloudflare R2；本機 SQLite**不是**正式 D1 的備份/原子快照；沒有真 restore/delete/cutover。
2. head/floor HMAC key 是**公開標示的測試用假金鑰**，兩名管理員亦為假身份；不是外部不可回捲保管者／真人審批。
3. 真 Starry ID 撤權、跨 Worker 的完整排序、Ledger 永不回捲、2,000 使用者容量、真正網路分割及恢復 RPO/RTO **NOT VERIFIED**。
4. 此測試只檢查隔離參考引擎和拒絕條件，不是產品模組接線。即使所有測試通過，正式 RESTORE / DELETE / CLEANUP 仍 **OFF/LOCKED**。
5. 后續整合跨組 API/私密資料權威、正式沙盒 D1/R2 演練需 AI2 裁決和使用者另行明確授權。

**本 PR 無 Production secrets、付費服務、新雲資源、真會員資料、正式 D1/R2 操作、main 合併與部署。**
