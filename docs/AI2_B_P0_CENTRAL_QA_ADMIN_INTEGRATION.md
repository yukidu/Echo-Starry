# AI2/B P0｜中央會員管理員權限整合驗收

**範圍：Draft / 安全整合分支 / 尚未部署**

- 本分支衍生自五組離線整合 [#500](https://github.com/yukidu/Echo-Starry/pull/500)，保留全部新增功能預設關閉。
- 完整採納 [#502](https://github.com/yukidu/Echo-Starry/pull/502) 已審視的程式修改與相同 Git blob；不重寫或複製修補新的管理員邏輯。
- Echo QA 的管理員判斷不再使用 Echo 自己的 Email 或管理員名稱直接授權。登入必須仍是有效 Echo Session，然後從 Starry ID 主資料庫確認中央會員活躍、中央 super-admin、Echo 會員活躍、未被明確拒絕且 Email 一致。
- 中央 D1 不可用、查詢無權限、缺表格、會員撤權、資料不符，一律**不授予管理員權限**。
- 新增 `tests/ai2QaPrimarySqliteIntegration.test.ts`：不只用假回應，而是 SQLite 真的執行 SQL JOIN；驗證允許、中央撤權、Echo 停權、明確拒絕、Email 不符、缺表與唯讀。
- 先前的 Google/Apple/App 普通登入流程、其他 Starry 路由、正式 D1/R2、付款模式均未修改。

## 注意：正式上線仍需額外證明

1. `STARRY_ID_DB.withSession('first-primary')` 在實際帳號已綁定且支援主資料庫讀取；正式資料已有 `starry_app_access_decisions` 表。缺少則管理員安全拒絕，但可能暫時無法開啟管理畫面。
2. 真 Starry ID 管理員與 Echo App 身份映射正確；撤銷權限到 QA 管理畫面生效沒有快取過期路徑。
3. GitHub Environment required reviewers、獨立 approvals/secret 和 Cloudflare 正式 Worker/D1 權限必須實際檢查。
4. #501 50 題新搜尋試題仍只拒絕 1/10 無來源請求，**品質 FAIL、不得放行 AI4 功能**。
5. AI3 費用、AI5 私密匯出、AI6 跨服務送出競速、AI7 真備份復原及 2000 人實際負載皆未達正式驗收；所有新功能 OFF。
6. 完整 Production Build、實際網址查驗及可還原版本代碼都尚未執行。

**無權更動 main 或正式網站時，絕不繞過以上條件。**
