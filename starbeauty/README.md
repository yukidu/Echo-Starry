# 美力之星（starbeauty）

學員作業與檔案繳交系統，正式部署名稱固定為 `starbeauty`。

## 已完成核心功能

- 與「繁星回聲」共用同一個 Google 會員身分，透過一次性 SSO 授權碼安全登入。
- 學員作業列表、截止時間、逾期規則、補件與重新繳交。
- 文件、簡報、圖片、影片的大檔案分段上傳到 Cloudflare R2。
- 發票／收據專用欄位：日期、店家、金額、號碼、分類。
- D1 保存課程、學員、作業、版本、批改、通知與稽核紀錄。
- 老師／管理員後台：建立課程、建立作業、批改、補件、評分、角色管理。
- LINE 綁定碼、LINE Webhook 簽章驗證、LINE 檔案收件、作業選擇與統一歸檔。
- 私人檔案權限：只有檔案本人或老師／管理員可讀取。

## Cloudflare 資源

部署工作流程會自動建立或沿用：

- Worker：`starbeauty`
- D1：`starbeauty_db`
- R2：`starbeauty-files`

GitHub Actions 需要 repository secrets：

- `CLOUDFLARE_API_TOKEN`（必要）
- `CLOUDFLARE_ACCOUNT_ID`（建議）
- `LINE_CHANNEL_SECRET`（啟用 LINE 機器人時設定）
- `LINE_CHANNEL_ACCESS_TOKEN`（啟用 LINE 機器人時設定）

LINE Webhook URL：`https://starbeauty.yukidu.workers.dev/api/line/webhook`
