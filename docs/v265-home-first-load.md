# v265 首頁第一次載入修正

## 問題
新裝置第一次進入首頁時沒有 localStorage 播放清單快取。React 首頁會等待 `/api/tracks` 與 `/api/categories` 都完成後才顯示資料；其中 `/api/tracks` 會從 D1 讀取並重組整份 tracks，因此冷啟動時使用者可能長時間看到空白清單。

## 修正
- Cloudflare KV 保留首頁 tracks 與 categories 最近一次成功快照。
- 有快照時立即回傳，超過 30 秒只在背景重新整理，不阻塞首頁。
- 音檔新增、修改、刪除或分類異動後，背景重新建立首頁快照。
- 播放、按讚、評價等高頻互動不會每次清除首頁快照，避免反而增加 D1 壓力。
- Production smoke 會暖機兩個首頁 API，並確認快取回應在 5 秒內。
