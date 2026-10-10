# v159 StarBeauty 會員完整基本資料同步

StarBeauty 登入仍使用繁星回聲的一次性 SSO code。交換成功後，繁星回聲回傳完整基本資料快照與 `profileHash`，供 StarBeauty 判斷是否需要寫入 D1。

同步欄位包含姓名、Email、頭像、安麗編號、手機、居住地、中心、獎銜與審核狀態、加入/留下原因、推薦人、上手白金、上手鑽石、生日、星座、天賦數、生命靈數、註冊/審核/最後活動資訊，以及必要會員狀態。

StarBeauty 自身的 student / teacher / admin / superadmin 角色不由繁星回聲基本資料覆蓋。
