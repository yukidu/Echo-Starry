const NOINDEX = 'noindex, nofollow, noarchive, nosnippet, noimageindex';

export function renderStarryIdMemberCenterPage(clientId: string) {
  const safeClientId = JSON.stringify(clientId);
  const html = `<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
  <meta name="robots" content="noindex,nofollow,noarchive,nosnippet,noimageindex">
  <meta name="theme-color" content="#09101f">
  <title>Starry ID｜繁星會員中心</title>
  <style>
    :root{color-scheme:dark;--bg:#07101f;--panel:#101b31;--panel2:#15233d;--line:#2b3b5c;--text:#f7f9ff;--muted:#aebbd3;--accent:#93b8ff;--ok:#68e0b2;--danger:#ff8f9a;--shadow:0 24px 70px rgba(0,0,0,.36)}
    *{box-sizing:border-box} body{margin:0;min-height:100vh;font-family:system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:radial-gradient(circle at 20% -10%,#1a3263 0,transparent 34%),radial-gradient(circle at 100% 0,#392a6c 0,transparent 26%),var(--bg);color:var(--text)}
    button,input,textarea{font:inherit}.shell{width:min(1060px,100%);margin:0 auto;padding:22px 18px 64px}.topbar{display:flex;gap:14px;align-items:center;justify-content:space-between;margin-bottom:22px}.brand{display:flex;gap:12px;align-items:center}.star{width:44px;height:44px;border-radius:15px;display:grid;place-items:center;background:linear-gradient(145deg,#dce7ff,#8ca9ff 60%,#9f87ff);color:#101831;font-size:25px;box-shadow:0 10px 30px #6f8fff38}.brand h1{font-size:20px;margin:0}.brand small{display:block;color:var(--muted);margin-top:3px}.top-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.btn{border:1px solid var(--line);background:#16233b;color:var(--text);border-radius:12px;padding:9px 13px;cursor:pointer}.btn:hover{background:#1c2c49}.btn.primary{background:linear-gradient(135deg,#779eff,#997cff);border-color:transparent;color:white}.btn.ghost{background:transparent}.btn.danger{color:#ffd7db;border-color:#6d3942}.hidden{display:none!important}
    .hero{min-height:68vh;display:grid;place-items:center}.login-card{width:min(520px,100%);padding:34px;border-radius:28px;border:1px solid var(--line);background:linear-gradient(160deg,rgba(21,35,61,.96),rgba(11,19,35,.96));box-shadow:var(--shadow);text-align:center}.login-mark{font-size:48px;margin-bottom:10px}.login-card h2{font-size:29px;margin:6px 0}.login-card p{color:var(--muted);line-height:1.8;margin:8px auto 24px;max-width:410px}.google-wrap{display:flex;justify-content:center;min-height:44px}.login-status{margin-top:16px;color:var(--muted);font-size:14px;min-height:20px}
    .layout{display:grid;grid-template-columns:minmax(0,1fr);gap:18px}.layout.admin-open{grid-template-columns:minmax(300px,370px) minmax(0,1fr)}.admin-panel{border:1px solid var(--line);background:rgba(12,21,39,.93);border-radius:24px;padding:16px;box-shadow:var(--shadow);max-height:calc(100vh - 110px);position:sticky;top:18px;overflow:auto}.admin-title{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}.admin-title h3{margin:0;font-size:17px}.search{width:100%;border:1px solid var(--line);background:#0b1528;color:var(--text);border-radius:12px;padding:11px 12px;outline:none}.members{display:grid;gap:8px;margin-top:12px}.member-item{width:100%;text-align:left;border:1px solid transparent;background:#111e35;color:var(--text);border-radius:14px;padding:11px 12px;cursor:pointer}.member-item:hover,.member-item.active{border-color:#698bd0;background:#182845}.member-item strong{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.member-item span{display:block;color:var(--muted);font-size:12px;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .card{border:1px solid var(--line);background:linear-gradient(160deg,rgba(20,34,59,.97),rgba(10,18,34,.97));border-radius:28px;padding:24px;box-shadow:var(--shadow)}.identity{display:flex;gap:17px;align-items:center;padding-bottom:21px;border-bottom:1px solid var(--line)}.avatar-shell{position:relative;flex:0 0 auto}.avatar{width:86px;height:86px;border-radius:24px;object-fit:cover;background:#223250;border:1px solid #425578}.avatar-fallback{width:86px;height:86px;border-radius:24px;display:grid;place-items:center;background:linear-gradient(145deg,#435f91,#6e62a9);font-size:30px;font-weight:700}.avatar-tools{position:absolute;right:-9px;bottom:-9px;display:flex;gap:5px}.avatar-tool,.edit,.field-eye{width:31px;height:31px;border-radius:10px;border:1px solid #314869;background:#172742;color:#d9e5ff;cursor:pointer;display:grid;place-items:center;padding:0}.avatar-tool:hover,.edit:hover,.field-eye:hover{background:#223657}.avatar-tool.visibility-off,.field-eye.visibility-off{color:#8594af;background:#111d31}.identity-main{min-width:0;flex:1}.identity-main h2{font-size:27px;margin:0 0 5px;overflow-wrap:anywhere}.email{color:var(--muted);overflow-wrap:anywhere}.badges{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.badge{padding:5px 9px;border-radius:999px;background:#1d3151;color:#cbd9f5;font-size:12px;border:1px solid #35517b}.badge.admin{background:#3a294f;border-color:#73569c;color:#efdfff}.section-title{font-size:14px;color:#c5d1e7;letter-spacing:.08em;margin:22px 0 8px;text-transform:uppercase}.fields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.field{min-height:72px;border:1px solid #263a5a;border-radius:16px;background:#0e1a2e;padding:11px 12px;position:relative}.field.wide{grid-column:1/-1}.field-label{font-size:12px;color:#91a2c0;margin-bottom:7px}.field-value{font-size:16px;line-height:1.45;padding-right:72px;white-space:pre-wrap;overflow-wrap:anywhere}.field-value.empty{color:#71819e}.edit{position:absolute;right:8px;top:8px}.field-eye{position:absolute;right:46px;top:8px}.field.readonly .edit{display:none}.field-editor{width:100%;border:1px solid #5f7cac;background:#0a1426;color:#fff;border-radius:10px;padding:8px 9px;outline:none;resize:vertical}.field-hint{font-size:11px;color:#7789a8;margin-top:5px}.spouse-link{font-size:12px;color:var(--accent);margin-top:7px;padding-right:72px}.saving{opacity:.62;pointer-events:none}.footer-note{margin-top:18px;color:#8292ad;font-size:12px;line-height:1.6}.toast{position:fixed;left:50%;bottom:max(24px,env(safe-area-inset-bottom));transform:translateX(-50%);background:#15233c;border:1px solid #415679;color:white;border-radius:13px;padding:10px 14px;box-shadow:var(--shadow);z-index:20;max-width:min(480px,calc(100% - 28px));text-align:center}.toast.error{border-color:#8c4751;color:#ffd8dc}
    @media(max-width:760px){.shell{padding:16px 12px 52px}.topbar{align-items:flex-start}.brand small{display:none}.layout.admin-open{grid-template-columns:1fr}.admin-panel{position:static;max-height:45vh}.card{padding:18px;border-radius:22px}.fields{grid-template-columns:1fr}.identity{align-items:flex-start}.avatar,.avatar-fallback{width:72px;height:72px;border-radius:20px}.identity-main h2{font-size:23px}.top-actions .btn{padding:8px 10px}}

    .identity.access-mode{flex-direction:column;align-items:stretch}
    .identity.access-mode #avatarWrap{align-self:center}
    .access-section{width:100%;margin:0}
    .access-summary{font-weight:700;cursor:pointer;list-style-position:inside;padding:3px 0;min-height:40px}
    .access-content{padding-top:8px}
    .access-toggle{border-radius:10px;padding:8px 13px;cursor:pointer;border:1px solid #425c82;background:#192b47;color:#fff}
    .access-toggle.allow{border-color:#408e78;color:#97efce}
    .access-toggle.deny{border-color:#9b5662;color:#ffc4c9}
    .access-single-actions{display:flex;gap:7px;flex-wrap:wrap;margin-left:auto}
    /* Dense member directory only; keep buttons usable on narrow touch screens. */
    .layout.admin-open{grid-template-columns:minmax(320px,410px) minmax(0,1fr)}
    .admin-panel{padding:9px 10px}
    .admin-title{margin-bottom:6px}
    .admin-title h3{font-size:15px}
    .admin-panel .search{padding:7px 9px;border-radius:8px;font-size:13px}
    .member-filter-row{display:flex;align-items:center;gap:5px;margin:4px 0}
    .member-filter-row select{flex:1;min-width:0;padding:6px 8px;background:#0b1528;color:var(--text);border:1px solid var(--line);border-radius:8px;font-size:12px}
    .member-filter-row .btn{padding:6px 7px;font-size:11px}
    .admin-panel .access-toolbar{margin-top:3px;gap:3px}
    .admin-panel .access-toolbar .btn{padding:7px 9px;font-size:12px}
    .member-select-label{display:flex;align-items:center;gap:5px;font-size:12px;min-height:30px;cursor:pointer}
    .member-select-label input{width:19px;height:19px;accent-color:#91b0ff}
    .admin-panel .members{gap:2px;margin-top:4px}
    .admin-panel .access-member-row{gap:6px;min-height:42px}
    .admin-panel .access-member-row>input{margin:0;width:19px;height:19px}
    .admin-panel .member-item{padding:4px 7px;border-radius:7px;min-height:39px}
    .admin-panel .member-item strong{font-size:14px;line-height:1.25}
    .admin-panel .member-item span{font-size:11px;line-height:1.15;margin-top:1px}
    .member-directory-loading{font-size:12px;color:var(--muted);text-align:center;min-height:24px;padding:4px}
    .bulk-progress{background:#172844;border:1px solid #536b91;border-radius:10px;padding:10px;margin:8px 0;font-size:13px;line-height:1.6}
    @media(max-width:760px){.layout.admin-open{grid-template-columns:1fr}.admin-panel{position:static;max-height:none;overflow:visible}.admin-panel .member-item{min-height:42px}}
    .access-toolbar{display:flex;align-items:center;justify-content:space-between;gap:6px;flex-wrap:wrap;margin-top:10px}
    .access-toolbar span,.access-help{font-size:12px;color:var(--muted)}
    .access-member-row{display:flex;gap:8px;align-items:center}
    .access-member-row .member-item{flex:1;min-width:0}
    .access-member-row input,.access-app-line input{width:20px;height:20px;accent-color:#91b0ff;flex-shrink:0}
    .access-pager{display:flex;gap:8px;align-items:center;justify-content:center;margin-top:12px}
    .access-section{margin-top:24px;padding:18px;border:1px solid #405577;border-radius:18px;background:#0d1b32}
    .access-section h3{margin:0 0 9px;font-size:18px}
    .access-fields{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:12px 0}
    .access-fields select{padding:10px;border:1px solid #526a90;border-radius:10px;background:#101f36;color:var(--text);min-width:150px}
    .access-apps{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin:12px 0}
    .access-app-line{display:flex;align-items:center;gap:10px;padding:10px;border-radius:12px;border:1px solid #2c3e59;background:#13253f;cursor:pointer}
    .access-app-line span{min-width:0;overflow-wrap:anywhere}
    .access-app-line small{display:block;color:#aebbd3;font-size:11px;margin-top:3px}
    .access-load-error{margin:10px 0 14px;padding:12px;border:1px solid #9b5662;border-radius:12px;background:#2b1d33;color:#ffe1e5;line-height:1.6;overflow-wrap:anywhere}
    .access-load-error .btn{margin-top:9px}
    .access-preview{border:1px solid #738bb4;background:#172844;border-radius:12px;padding:13px;margin:14px 0;line-height:1.6}
    .access-preview label{display:block;margin:12px 0 6px}
    .access-preview input{width:100%;padding:10px;border:1px solid #738bb4;border-radius:9px;background:#101a31;color:var(--text)}
    .access-history{margin-top:20px;border-top:1px solid var(--line);padding-top:10px}
    .access-history-row{display:flex;justify-content:space-between;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid #233450;font-size:12px}
    .access-history-row span{overflow-wrap:anywhere;min-width:0}
    .guest-entry{position:sticky;top:0;z-index:2;margin:10px 0 4px;
      border:1px solid #7d91c0;background:#1b3150;border-radius:12px;
      color:#fff;display:flex;align-items:center;gap:10px;padding:12px;
      cursor:pointer;width:100%;text-align:left}
    .guest-entry.active,.guest-entry:focus-visible{border-color:#d6c5ff;background:#30486a}
    .guest-entry strong{display:block;font-size:15px}
    .guest-entry small{display:block;color:#b8c9e6;font-size:12px}
    .guest-policy-list{display:grid;gap:9px;margin:16px 0}
    .guest-policy-row{border:1px solid #38516f;border-radius:12px;
      display:flex;justify-content:space-between;align-items:center;
      gap:12px;padding:12px;background:#11233c}
    .guest-policy-row strong{display:block}
    .guest-policy-row small{display:block;color:#c5d0e2;font-size:12px;line-height:1.5;margin-top:4px}
    .guest-policy-row .btn{flex-shrink:0}
    .guest-policy-row .btn:disabled{opacity:.5;cursor:not-allowed}
    .guest-policy-help{color:#c5d0e2;font-size:13px;line-height:1.65}
    @media(max-width:760px){.guest-policy-row{flex-wrap:wrap}}
    @media(max-width:760px){.access-apps{grid-template-columns:1fr}.access-section{padding:12px}}
  </style>
  <script src="https://accounts.google.com/gsi/client" async defer></script>
</head>
<body>
  <div class="shell">
    <header class="topbar">
      <div class="brand"><div class="star">✦</div><div><h1>Starry ID</h1><small>繁星會員中心 · 電子名片</small></div></div>
      <div class="top-actions" id="topActions" hidden>
        <button class="btn" id="myCardBtn">我的名片</button>
        <button class="btn primary hidden" id="adminBtn">會員管理</button>
        <button class="btn ghost" id="logoutBtn">登出</button>
      </div>
    </header>

    <section class="hero" id="loginView">
      <div class="login-card">
        <div class="login-mark">✦</div>
        <h2>登入 Starry ID</h2>
        <p>一個 Starry ID，使用繁星生態系。登入後可查看並直接編輯自己的中央會員資料與電子名片。</p>
        <div class="google-wrap"><div id="googleButton"></div></div>
        <div class="login-status" id="loginStatus">正在準備 Google 登入…</div>
      </div>
    </section>

    <main class="layout hidden" id="memberView">
      <aside class="admin-panel hidden" id="adminPanel">
        <div class="admin-title"><h3>全部會員</h3><span id="memberCount"></span></div>
        <input class="search" id="memberSearch" placeholder="搜尋姓名／Email／會員編號" autocomplete="off">
        <div class="member-filter-row">
          <label for="memberRankFilter" class="access-help">獎銜</label>
          <select id="memberRankFilter"><option value="">全部已核准獎銜</option><option value="__unapproved__">未核准／未填寫</option></select>
          <button type="button" class="btn" id="memberClearSelection">清除勾選</button>
        </div>
        <div class="access-toolbar">
          <label class="member-select-label"><input id="memberSelectAll" type="checkbox">全選目前篩選的真正會員（不含訪客）</label>
          <span id="accessSelectedCount">已選 0 位</span>
          <button type="button" class="btn primary" id="bulkAccessButton">批次設定 App 權限</button>
        </div>
        <!-- Fixed first entry: a policy principal, not a row from the users table.
             Deliberately outside paginated member results/checkboxes/counts. -->
        <button type="button" id="guestAccessEntry" class="guest-entry"
          aria-label="訪客使用權限管理">
          <span aria-hidden="true">👥</span><span>
          <strong>訪客</strong><small>獨立 App 權限｜不參與全選、不計入會員人數</small>
          </span>
        </button>
        <div class="members" id="members"></div>
        <div class="member-directory-loading" id="memberLoadMore" aria-live="polite"></div>
      </aside>
      <section class="card hidden" id="guestAccessCard" aria-label="訪客 App 權限管理">
        <h2>👥 訪客｜App 使用權限</h2>
        <p class="guest-policy-help">「訪客」不是會員，不會建立會員資料或加入批次勾選。預設全部禁止；僅已完成安全整合的 App 能開放已註明的公開功能。</p>
        <p class="guest-policy-help">繁星下載：開放後僅限公開首頁非會員互動；下載、收藏、紀錄及私人資料仍需會員登入並取得授權。</p>
        <div class="guest-policy-list" id="guestAppPolicies" aria-live="polite" aria-busy="false"></div>
        <div id="guestAccessLoadError" class="access-load-error hidden" role="alert" aria-live="assertive">
          <div id="guestAccessLoadErrorText">訪客權限讀取失敗</div>
          <button type="button" class="btn" id="guestAccessRetryBtn">重新讀取</button>
        </div>
        <section class="access-preview hidden" id="guestAccessPreview" aria-label="訪客權限變更確認">
          <strong>請確認訪客權限變更</strong>
          <div id="guestAccessPreviewText"></div>
          <label for="guestAccessConfirmText">輸入「確認變更」後才能執行</label>
          <input id="guestAccessConfirmText" autocomplete="off" placeholder="確認變更">
          <div class="access-fields">
            <button class="btn primary" id="guestAccessCommitBtn" type="button" disabled>確認套用</button>
            <button class="btn" id="guestAccessCancelBtn" type="button">取消</button>
          </div>
        </section>
        <div class="access-history">
          <h3>訪客權限操作紀錄與還原</h3>
          <div id="guestAccessHistory" aria-live="polite"></div>
        </div>
      </section>
      <section class="card" id="profileCard">
        <div class="identity" id="memberIdentity">
          <div id="avatarWrap"></div>
        <details class="access-section hidden" id="appAccessPanel" aria-label="App 使用權限管理">
          <summary class="access-summary">🛡️ App 使用權限（點擊展開）</summary>
          <div class="access-content">
          <div class="access-help" id="appAccessScope">選取會員以管理權限</div>
          <div id="appAccessError" class="access-load-error hidden" role="alert" aria-live="polite">
            <div id="appAccessErrorText">讀取 App 清單失敗</div>
            <button type="button" class="btn" id="appAccessRetryBtn">重新讀取 App 清單</button>
          </div>
          <div class="access-help">Starry ID 中央登入不可關閉。未明確設定的 App 保留現有使用規則；未經測試的 App 不會在本階段強制封鎖。</div>
          <div id="appAccessSingle" class="hidden">
            <div class="access-help">直接選擇每個 App 的「允許」或「禁止」，修改前仍會先預覽確認。</div>
            <div class="access-apps" id="appAccessSingleApps"></div>
          </div>
          <div id="appAccessBulk" class="hidden">
          <div class="access-fields">
            <label for="appAccessMode">批次設定方式</label>
            <select id="appAccessMode">
              <option value="grant">只開放勾選的 App（其他不變）</option>
              <option value="revoke">只禁止勾選的 App（其他不變）</option>
              <option value="replace">只允許勾選的 App（未勾選全部禁止）</option>
            </select>
            <button class="btn primary" type="button" id="appAccessPreviewBtn">預覽變更</button>
          </div>
          <div id="appAccessBulkHelp" class="access-help">「只允許勾選的 App」會禁止所有未勾選的 App。請確認沒有漏選。</div>
          <div class="access-apps" id="appAccessApps"></div>
          </div>
          <section class="access-preview hidden" id="appAccessReview">
            <strong>請再次確認</strong>
            <div id="appAccessReviewText"></div>
            <button class="btn hidden" id="appAccessDownloadPreviewBtn" type="button">下載完整變更清單（CSV）</button>
            <label for="appAccessConfirmText">輸入「確認變更」才能套用</label>
            <input id="appAccessConfirmText" autocomplete="off" placeholder="確認變更">
            <div class="access-fields">
              <button class="btn primary" id="appAccessCommitBtn" type="button" disabled>確認套用</button>
              <button class="btn" id="appAccessCancelBtn" type="button">取消</button>
            </div>
          </section>
          <div class="bulk-progress hidden" id="appAccessBulkProgress" role="status" aria-live="polite"></div>
          <section class="access-history">
            <h3>操作紀錄與還原</h3>
            <div class="access-help">還原前也會再次顯示預覽。只有權限未被其他操作覆蓋時才可還原。</div>
            <div id="appAccessHistory"></div>
          </section>
          </div>
        </details>
          <div class="identity-main">
            <h2 id="displayName">會員</h2>
            <div class="email" id="displayEmail"></div>
            <div class="badges" id="badges"></div>
          </div>
        </div>
        <div class="section-title">電子名片資料</div>
        <div class="fields" id="fields"></div>
        <div class="footer-note">鉛筆可修改資料，眼睛可控制該欄位是否顯示在公開名片；照片也可直接更換並控制公開／隱藏。Enter 儲存、Esc 取消；座右銘可用 Ctrl / ⌘ + Enter 儲存。</div>

      </section>
    </main>
  </div>
  <div class="toast hidden" id="toast"></div>

  <script>
  (() => {
    const CLIENT_ID = ${safeClientId};
    const state = { session:null, user:null, isSuperAdmin:false, targetUserId:null, adminOpen:false, members:[], visibility:null, selectedIds:new Set(), guestOpen:false, guestReadGeneration:0, guestLoadController:null, currentFilterIds:null, currentFilterKey:'', selectionBusy:false, selectionGeneration:0, memberOffset:0, memberTotal:0, memberHasMore:false, memberLoading:false, memberLoadToken:0, memberRanksLoaded:false, activeSearch:'', activeRank:'', memberFilterPending:false, accessApps:[], accessUserIds:[], accessBulkSelection:null, accessPreview:null, accessLoadToken:0, accessLastRequest:null, bulkRunning:false };
    const $ = (id) => document.getElementById(id);
    const editable = [
      ['name','姓名',false],['amwayId','會員編號 / Amway ID',false],['phone','電話',false],['residence','居住地',false],
      ['center','中心',false],['rank','獎銜',false],['birthday','生日',false],['motto','座右銘',true],['zodiac','星座',false],
      ['talentNumber','天賦數',false],['lifeNumber','生命靈數',false],['sponsor','推薦人',false],
      ['platinumUpline','白金上線',false],['diamondUpline','鑽石上線',false]
    ];

    function toast(message, error=false){ const el=$('toast'); el.textContent=message; el.className='toast'+(error?' error':''); clearTimeout(toast.t); toast.t=setTimeout(()=>el.classList.add('hidden'),2600); }
    async function api(path, options={}){
      const response=await fetch(path,{credentials:'same-origin',...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
      let data={}; try{data=await response.json();}catch{}
      if(!response.ok){ const error=new Error(data.error||'操作失敗（HTTP '+response.status+'）');error.status=response.status;throw error; }
      return data;
    }
    function initials(user){ const name=(user?.name||user?.email||'S').trim(); return name.slice(0,1).toUpperCase(); }
    function isOwnProfile(){ return Boolean(state.session?.user?.id && state.targetUserId===state.session.user.id); }
    function canEditTarget(){ return isOwnProfile() || state.isSuperAdmin; }
    function defaultVisibility(field){ return field!=='phone' && field!=='birthday'; }
    function isVisible(field){ return state.visibility && Object.prototype.hasOwnProperty.call(state.visibility,field) ? Boolean(state.visibility[field]) : defaultVisibility(field); }
    async function loadOwnVisibility(){
      try{ const data=await api('/api/card-settings'); state.visibility=data.visibility||{}; return data; }
      catch{ state.visibility=null; return null; }
    }
    async function toggleVisibility(field){
      if(!isOwnProfile()) return;
      const next=!isVisible(field);
      try{
        const data=await api('/api/card-settings',{method:'PUT',body:JSON.stringify({visibility:{[field]:next}})});
        state.visibility=data.visibility||{...state.visibility,[field]:next};
        renderProfile(state.user);
        toast(next?'已設為公開':'已從公開名片隱藏');
      }catch(e){ toast(e.message||'公開設定儲存失敗',true); }
    }
    function makeVisibilityButton(field,titleText,className){
      const visible=isVisible(field); const b=document.createElement('button'); b.type='button'; b.className=(className||'field-eye')+(visible?'':' visibility-off'); b.textContent=visible?'👁':'⊘'; b.title=visible?titleText+'目前公開，按一下隱藏':titleText+'目前隱藏，按一下公開'; b.setAttribute('aria-label',b.title); b.addEventListener('click',(event)=>{event.preventDefault();event.stopPropagation();toggleVisibility(field);}); return b;
    }
    function renderAvatar(user){
      const wrap=$('avatarWrap'); wrap.replaceChildren(); const shell=document.createElement('div'); shell.className='avatar-shell'; const url=(user.avatar||user.googleAvatar||'').trim();
      if(url){ const img=document.createElement('img'); img.className='avatar'; img.alt='會員頭像'; img.referrerPolicy='no-referrer'; img.src=url; img.onerror=()=>{shell.querySelector('.avatar')?.remove(); if(!shell.querySelector('.avatar-fallback')){const d=document.createElement('div');d.className='avatar-fallback';d.textContent=initials(user);shell.prepend(d);}}; shell.appendChild(img); }
      else { const d=document.createElement('div'); d.className='avatar-fallback'; d.textContent=initials(user); shell.appendChild(d); }
      if(canEditTarget()){
        const tools=document.createElement('div'); tools.className='avatar-tools';
        if(isOwnProfile()) tools.appendChild(makeVisibilityButton('avatar','照片','avatar-tool'));
        const edit=document.createElement('button'); edit.type='button'; edit.className='avatar-tool'; edit.textContent='✎'; edit.title='更換照片'; edit.setAttribute('aria-label','更換照片'); edit.addEventListener('click',chooseAvatar); tools.appendChild(edit); shell.appendChild(tools);
      }
      wrap.appendChild(shell);
    }
    async function compressAvatar(file){
      if(!file || !String(file.type||'').startsWith('image/')) throw new Error('請選擇圖片檔');
      if(file.size>12*1024*1024) throw new Error('照片請小於 12MB');
      const source=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result||''));reader.onerror=()=>reject(new Error('讀取照片失敗'));reader.readAsDataURL(file);});
      const image=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(new Error('照片格式無法讀取'));img.src=source;});
      const size=Math.min(image.naturalWidth||image.width,image.naturalHeight||image.height); if(!size) throw new Error('照片尺寸無效');
      const canvas=document.createElement('canvas'); canvas.width=512; canvas.height=512; const ctx=canvas.getContext('2d'); if(!ctx) throw new Error('瀏覽器無法處理照片');
      const sx=((image.naturalWidth||image.width)-size)/2; const sy=((image.naturalHeight||image.height)-size)/2; ctx.drawImage(image,sx,sy,size,size,0,0,512,512);
      return canvas.toDataURL('image/jpeg',0.88);
    }
    function chooseAvatar(){
      if(!canEditTarget()) return; const input=document.createElement('input'); input.type='file'; input.accept='image/*'; input.className='hidden';
      input.addEventListener('change',async()=>{const file=input.files?.[0]; if(!file)return; try{toast('正在處理照片…');const avatar=await compressAvatar(file);await saveAvatar(avatar);}catch(e){toast(e.message||'照片修改失敗',true);}finally{input.remove();}});
      document.body.appendChild(input); input.click();
    }
    async function saveAvatar(avatar){
      const path=state.isSuperAdmin && !isOwnProfile()?'/api/admin/members/'+encodeURIComponent(state.targetUserId):'/api/profile';
      try{const data=await api(path,{method:'PUT',body:JSON.stringify({avatar})});renderProfile(data.user);toast('照片已更新');}catch(e){toast(e.message||'照片儲存失敗',true);}
    }
    function badge(text, admin=false){ const el=document.createElement('span'); el.className='badge'+(admin?' admin':''); el.textContent=text; return el; }
    function renderBadges(user){ const box=$('badges'); box.replaceChildren(); const rank=(user.approvedRank||user.rank||'').trim(); if(rank) box.appendChild(badge(rank)); if(state.isSuperAdmin && state.targetUserId===state.session?.user?.id) box.appendChild(badge('Super Admin',true)); if(state.targetUserId!==state.session?.user?.id) box.appendChild(badge('管理中的會員')); }
    function canEditField(field){ if(field==='rank') return state.isSuperAdmin; return true; }
    function isNumeric(field){ return field==='talentNumber'||field==='lifeNumber'; }
    function renderFields(user){
      const root=$('fields'); root.replaceChildren();
      for(const [field,label,wide] of editable){
        const editableNow=canEditField(field); const card=document.createElement('div'); card.className='field'+(wide?' wide':'')+(editableNow?'':' readonly'); card.dataset.field=field;
        const l=document.createElement('div'); l.className='field-label'; l.textContent=label; const v=document.createElement('div'); v.className='field-value'; const value=user[field]===null||user[field]===undefined?'':String(user[field]); v.textContent=value||'尚未填寫'; if(!value) v.classList.add('empty'); card.append(l,v); if(field==='amwayId'&&user.spouseName){ const spouse=document.createElement('div'); spouse.className='spouse-link'; spouse.textContent='夫妻綁定：'+user.spouseName; card.appendChild(spouse); }
        if(isOwnProfile()){
          const eye=makeVisibilityButton(field,label,'field-eye'); if(!editableNow) eye.style.right='8px'; card.appendChild(eye);
        }
        if(editableNow){ const b=document.createElement('button'); b.className='edit'; b.type='button'; b.title='編輯'+label; b.setAttribute('aria-label','編輯'+label); b.textContent='✎'; b.addEventListener('click',()=>beginEdit(card,field,label,wide)); card.appendChild(b); }
        else { const hint=document.createElement('div'); hint.className='field-hint'; hint.textContent='獎銜由超級管理員維護'; card.appendChild(hint); }
        root.appendChild(card);
      }
    }
    function renderProfile(user){ state.guestOpen=false; ++state.guestReadGeneration; state.guestLoadController?.abort(); $('guestAccessCard').classList.add('hidden'); $('profileCard').classList.remove('hidden'); $('guestAccessEntry').classList.remove('active'); state.user=user; state.targetUserId=user.id; renderAvatar(user); $('displayName').textContent=user.name||'尚未填寫姓名'; $('displayEmail').textContent=user.email||''; renderBadges(user); renderFields(user); renderMemberActive(); $('memberIdentity').classList.toggle('access-mode',state.isSuperAdmin); if(state.isSuperAdmin)void showAppAccess([user.id],user.name||user.email||'會員',false); }
    async function saveField(field,value,card){ card.classList.add('saving'); try{ const path=state.isSuperAdmin && state.targetUserId!==state.session.user.id ? '/api/admin/members/'+encodeURIComponent(state.targetUserId) : '/api/profile'; const data=await api(path,{method:'PUT',body:JSON.stringify({[field]:value})}); renderProfile(data.user); toast('已儲存 '+editable.find(x=>x[0]===field)?.[1]); }catch(e){ card.classList.remove('saving'); renderFields(state.user); toast(e.message||'儲存失敗',true); } }
    function beginEdit(card,field,label,wide){ if(card.querySelector('.field-editor')) return; const value=state.user[field]===null||state.user[field]===undefined?'':String(state.user[field]); const display=card.querySelector('.field-value'); const edit=card.querySelector('.edit'); if(edit) edit.classList.add('hidden'); const input=wide?document.createElement('textarea'):document.createElement('input'); input.className='field-editor'; if(wide) input.rows=3; if(isNumeric(field)) input.inputMode='numeric'; input.value=value; display.replaceWith(input); let done=false; const cancel=()=>{ if(done)return; done=true; renderFields(state.user); }; const commit=()=>{ if(done)return; done=true; const next=input.value.trim(); if(next===value){renderFields(state.user);return;} saveField(field,next,card); }; input.addEventListener('keydown',(event)=>{ if(event.key==='Escape'){event.preventDefault();cancel();return;} if(event.key==='Enter' && (!wide || event.ctrlKey || event.metaKey)){event.preventDefault();commit();} }); input.addEventListener('blur',()=>{ if(!done) commit(); }); input.focus(); input.select(); }
    function renderMemberActive(){ document.querySelectorAll('.member-item').forEach(el=>el.classList.toggle('active',el.dataset.id===state.targetUserId)); }
    function showLoggedIn(){ $('loginView').classList.add('hidden'); $('memberView').classList.remove('hidden'); $('topActions').hidden=false; $('adminBtn').classList.toggle('hidden',!state.isSuperAdmin); }
    function showLoggedOut(){ resetMemberSelection(); state.guestOpen=false; ++state.guestReadGeneration; state.guestLoadController?.abort(); $('guestAccessCard').classList.add('hidden'); $('profileCard').classList.remove('hidden'); state.session=null; state.user=null; state.targetUserId=null; state.visibility=null; $('topActions').hidden=true; $('memberView').classList.add('hidden'); $('loginView').classList.remove('hidden'); initGoogle(); }
    async function loadSession(){ try{ const data=await api('/api/session'); state.session=data; state.isSuperAdmin=Boolean(data.isSuperAdmin); state.targetUserId=data.user.id; await loadOwnVisibility(); showLoggedIn(); renderProfile(data.user); }catch{ showLoggedOut(); } }
    async function handleCredential(response){ $('loginStatus').textContent='正在登入…'; try{ await api('/api/google-sync',{method:'POST',body:JSON.stringify({credential:response.credential,appId:'starry-id'})}); $('loginStatus').textContent='登入成功'; await loadSession(); }catch(e){ $('loginStatus').textContent=e.message||'登入失敗'; toast(e.message||'登入失敗',true); } }
    function initGoogle(){ const start=Date.now(); const tick=()=>{ if(window.google?.accounts?.id){ try{ google.accounts.id.initialize({client_id:CLIENT_ID,callback:handleCredential,auto_select:false,cancel_on_tap_outside:true}); $('googleButton').replaceChildren(); google.accounts.id.renderButton($('googleButton'),{theme:'outline',size:'large',shape:'pill',text:'signin_with',locale:'zh_TW',width:280}); $('loginStatus').textContent=''; }catch(e){ $('loginStatus').textContent='Google 登入載入失敗，請重新整理。'; } return; } if(Date.now()-start<8000) setTimeout(tick,120); else $('loginStatus').textContent='Google 登入載入較慢，請重新整理再試。'; }; tick(); }

    const MAX_SELECTED_MEMBERS=5000;
    function selectedMemberCount(){return state.selectedIds.size;}
    function currentMemberFilterKey(){return JSON.stringify([state.activeSearch,state.activeRank]);}
    function visibleFilterIds(){
      if(state.currentFilterIds && state.currentFilterKey===currentMemberFilterKey())
        return state.currentFilterIds;
      // Once every matching row is loaded, the browser has an exact snapshot.
      if(!state.memberHasMore && state.members.length===state.memberTotal)
        return state.members.map(member=>member.id);
      return null;
    }
    function showSelectedCount(){
      const selected=selectedMemberCount();
      const selectedInView=state.members.some(member=>state.selectedIds.has(member.id));
      const exactIds=visibleFilterIds();
      const isAllSelected=Boolean(exactIds && exactIds.length && exactIds.length===state.memberTotal
        && exactIds.every(id=>state.selectedIds.has(id)));
      const check=$('memberSelectAll');
      $('accessSelectedCount').textContent='累積已選 '+selected+' 位｜目前符合 '+state.memberTotal+' 位';
      check.checked=isAllSelected;
      check.indeterminate=!isAllSelected && (exactIds
        ? exactIds.some(id=>state.selectedIds.has(id)) : selectedInView);
      check.disabled=state.memberFilterPending||state.selectionBusy||state.memberTotal===0;
      $('bulkAccessButton').disabled=state.memberFilterPending||state.selectionBusy||selected===0;
    }
    function selectedMember(memberId){return state.selectedIds.has(memberId);}
    function refreshVisibleMemberChecks(){
      document.querySelectorAll('.access-member-row input[type="checkbox"]').forEach(check=>{
        const id=check.parentNode.querySelector('.member-item')?.dataset.id;
        check.checked=Boolean(id&&state.selectedIds.has(id));
      });
      showSelectedCount();
    }
    /** Applied only after an explicit "清除勾選" or a full logout. */
    function resetMemberSelection(){
      ++state.selectionGeneration; // Discard a late response from an older select-all.
      state.selectedIds.clear();
      refreshVisibleMemberChecks();
    }
    // Guest is a separate policy principal, NEVER a central member. A
    // malformed or future API response must not mix it into member batches.
    const GUEST_PRINCIPAL_ID='starry:guest';
    function isRealMemberSelectionId(id){
      return typeof id==='string' && id.length>0 && id!==GUEST_PRINCIPAL_ID;
    }
    function mergeMemberSelection(ids,shouldSelect){
      if(!Array.isArray(ids)||!ids.every(isRealMemberSelectionId))
        throw new Error('全選資料包含非會員身分，已停止操作');
      const next=new Set(state.selectedIds);
      for(const id of ids){
        if(shouldSelect)next.add(id);
        else next.delete(id);
      }
      if(next.size>MAX_SELECTED_MEMBERS)
        throw new Error('最多可累積選取 5,000 位會員，請先縮小選取範圍');
      state.selectedIds=next;
    }
    async function toggleCurrentFilterSelection(shouldSelect){
      if(state.selectionBusy||state.memberFilterPending)return;
      state.selectionBusy=true;
      const generation=state.selectionGeneration;
      const key=currentMemberFilterKey(),search=state.activeSearch,rank=state.activeRank;
      showSelectedCount();
      try{
        let ids=state.currentFilterKey===key?state.currentFilterIds:null;
        if(!ids){
          const query='/api/admin/member-selection?search='+encodeURIComponent(search)+'&rank='+encodeURIComponent(rank);
          const response=await api(query);
          ids=response.ids;
          if(!Array.isArray(ids)||ids.length!==response.count||
             ids.length>MAX_SELECTED_MEMBERS||new Set(ids).size!==ids.length||
             !ids.every(isRealMemberSelectionId))
            throw new Error('中央會員選取資料不完整，請重新操作');
        }
        if(generation!==state.selectionGeneration)return; // Explicit clear/logout wins.
        const beforeCount=selectedMemberCount();
        mergeMemberSelection(ids,shouldSelect);
        const changed=Math.abs(selectedMemberCount()-beforeCount);
        if(currentMemberFilterKey()===key){
          state.currentFilterKey=key;
          state.currentFilterIds=ids;
        }
        refreshVisibleMemberChecks();
        toast((shouldSelect?'本次新增':'本次取消')+' '+changed+' 位，累積已選 '+selectedMemberCount()+' 位');
      }catch(error){
        if(generation===state.selectionGeneration)
          toast(error.message||'無法讀取完整篩選名單，原本勾選已保留',true);
      }finally{
        state.selectionBusy=false;
        refreshVisibleMemberChecks();
      }
    }
    function memberCard(member){
      const line=document.createElement('div');line.className='access-member-row';
      const check=document.createElement('input');check.type='checkbox';check.checked=selectedMember(member.id);
      check.setAttribute('aria-label','選取 '+(member.name||member.email));
      check.addEventListener('change',()=>{
        if(state.selectionBusy){check.checked=selectedMember(member.id);return;}
        try{
          mergeMemberSelection([member.id],check.checked);
          showSelectedCount();
        }catch(error){check.checked=selectedMember(member.id);toast(error.message,true);}
      });
      const b=document.createElement('button');b.className='member-item';b.type='button';b.dataset.id=member.id;
      const title=document.createElement('strong');title.textContent=member.name||'(未填姓名)';
      const details=document.createElement('span');
      details.textContent=(member.approvedRank||'未核准獎銜')+' · 直銷商中心：'+(member.center||'未填寫');
      const email=document.createElement('span');email.textContent=member.email||'';
      b.append(title,details,email);b.addEventListener('click',()=>openMember(member.id));
      line.append(check,b);return line;
    }
    async function loadMemberRanks(){
      if(state.memberRanksLoaded)return;
      try{
        const data=await api('/api/admin/member-ranks');
        const select=$('memberRankFilter');
        for(const item of data.ranks||[]){
          if(!item.rank)continue;
          const option=document.createElement('option');option.value=item.rank;option.textContent=item.rank+'（'+item.members+'）';
          select.appendChild(option);
        }
        state.memberRanksLoaded=true;
      }catch(e){toast('獎銜選項讀取失敗：'+(e.message||'稍後重試'),true);}
    }
    async function loadNextMembers(){
      if(!state.adminOpen||state.memberLoading||!state.memberHasMore)return;
      state.memberLoading=true;const token=state.memberLoadToken;
      $('memberLoadMore').textContent='正在載入會員…';showSelectedCount();
      try{
        const search=state.activeSearch,rank=state.activeRank;
        const url='/api/admin/members?search='+encodeURIComponent(search)+'&rank='+encodeURIComponent(rank)+'&offset='+state.memberOffset;
        const data=await api(url);
        if(token!==state.memberLoadToken)return;
        const batch=data.members||[];
        state.members.push(...batch);
        state.memberOffset=Number(data.nextOffset||state.memberOffset+batch.length);
        state.memberTotal=Number(data.total||0);
        state.memberHasMore=Boolean(data.hasMore);
        $('memberCount').textContent='共 '+state.memberTotal+' 人';
        const root=$('members');
        const fragment=document.createDocumentFragment();
        for(const member of batch)fragment.appendChild(memberCard(member));
        root.appendChild(fragment);
        renderMemberActive();
        $('memberLoadMore').textContent=state.memberHasMore?'繼續向下捲動載入更多會員':'已顯示全部 '+state.memberTotal+' 位會員';
      }catch(e){
        if(token===state.memberLoadToken){
          $('memberLoadMore').textContent='讀取失敗，點此重新載入';
          toast(e.message||'會員清單讀取失敗',true);
        }
      }finally{
        if(token===state.memberLoadToken){state.memberLoading=false;showSelectedCount();}
      }
    }
    async function resetMemberList(){
      ++state.memberLoadToken;
      state.activeSearch=$('memberSearch').value.trim();state.activeRank=$('memberRankFilter').value;
      state.memberFilterPending=false;
      state.memberOffset=0;state.memberTotal=0;state.memberHasMore=true;state.memberLoading=false;state.members=[];
      state.currentFilterIds=null;state.currentFilterKey='';
      $('members').replaceChildren();$('memberCount').textContent='載入中…';
      showSelectedCount(); // Keep previous selections across every filter change.
      await loadNextMembers();
    }
    $('memberLoadMore').addEventListener('click',()=>void loadNextMembers());
    const memberObserver=new IntersectionObserver(entries=>{
      if(entries.some(entry=>entry.isIntersecting))void loadNextMembers();
    },{root:null,rootMargin:'160px 0px'});
    memberObserver.observe($('memberLoadMore'));
    $('adminPanel').addEventListener('scroll',()=>{
      const panel=$('adminPanel');
      if(panel.scrollTop+panel.clientHeight>=panel.scrollHeight-120)void loadNextMembers();
    });
    window.addEventListener('scroll',()=>{
      if(window.innerWidth<761){
        const rect=$('memberLoadMore').getBoundingClientRect();
        if(rect.top<window.innerHeight+140)void loadNextMembers();
      }
    },{passive:true});

    async function openMember(id){ try{ const data=await api('/api/admin/members/'+encodeURIComponent(id)); renderProfile(data.user); }catch(e){ toast(e.message||'會員資料讀取失敗',true); } }
    function toggleAdmin(force){ if(!state.isSuperAdmin)return; state.adminOpen=typeof force==='boolean'?force:!state.adminOpen; $('adminPanel').classList.toggle('hidden',!state.adminOpen); $('memberView').classList.toggle('admin-open',state.adminOpen); if(state.adminOpen){void loadMemberRanks();void resetMemberList();} }
    $('adminBtn').addEventListener('click',()=>toggleAdmin());
    $('myCardBtn').addEventListener('click',async()=>{ if(state.session?.user){ await loadOwnVisibility(); renderProfile(state.session.user); if(window.innerWidth<761) toggleAdmin(false); } });
    $('logoutBtn').addEventListener('click',async()=>{ try{await api('/api/logout',{method:'POST',body:'{}'});}catch{} showLoggedOut(); });
    let searchTimer;
    $('memberSearch').addEventListener('input',()=>{
      state.memberFilterPending=true;showSelectedCount();
      clearTimeout(searchTimer);searchTimer=setTimeout(()=>void resetMemberList(),220);
    });
    $('memberRankFilter').addEventListener('change',()=>void resetMemberList());
    $('memberClearSelection').addEventListener('click',resetMemberSelection);
    $('memberSelectAll').addEventListener('change',()=>{
      // Header selection adds/removes only the CURRENT filter. Prior selections
      // from other filters remain untouched.
      void toggleCurrentFilterSelection($('memberSelectAll').checked);
    });
    $('bulkAccessButton').addEventListener('click',()=>{
      if(state.memberFilterPending||state.selectionBusy){
        toast('請等候目前的搜尋或全選完成',true);return;
      }
      if(!selectedMemberCount()){toast('請先選取會員',true);return;}
      // A deduplicated manual snapshot represents the UNION of every filter.
      // The bulk server revalidates the IDs and materializes auditable D1 items
      // before asking for the separate final confirmation.
      state.accessBulkSelection={scope:'manual',userIds:[...state.selectedIds]};
      const selected=selectedMemberCount();
      // Defense in depth: even a future guest entry must never enter bulk.
      if([...state.selectedIds].some(id=>!isRealMemberSelectionId(id))){
        toast('訪客不能加入會員批次權限設定',true);return;
      }
      const first=state.members.find(m=>selectedMember(m.id))?.id||state.selectedIds.values().next().value;
      if(!first){toast('沒有選取會員',true);return;}
      void showAppAccess([first],'跨篩選累積已選 '+selected+' 位會員',true);
    });
    function hideAccessPreview(){state.accessPreview=null;$('appAccessReview').classList.add('hidden');$('appAccessConfirmText').value='';$('appAccessCommitBtn').disabled=true;}
    async function ensureAccessCatalog(){
      if(state.accessApps.length)return;
      const data=await api('/api/admin/app-access/catalog');
      state.accessApps=Array.isArray(data.apps)?data.apps:[];
    }
    function renderAppChoices(memberApps=[]){
      const saved=new Map(memberApps.map(item=>[item.id,item]));
      const list=$('appAccessApps');list.replaceChildren();
      for(const app of state.accessApps){
        const row=document.createElement('label');row.className='access-app-line';
        const check=document.createElement('input');check.type='checkbox';check.value=app.id;check.className='access-app-choice';
        const current=saved.get(app.id);
        check.checked=current?.decision==='allow';
        const textBox=document.createElement('span');
        const title=document.createElement('strong');title.textContent=app.label;
        const note=document.createElement('small');
        note.textContent=current?.decision==='allow'?'已明確開放':current?.decision==='deny'?'已明確禁止':
          current?.legacyMembership==='active'?'沿用原有允許資格':'沿用既有 App 規則';
        textBox.append(title,note);row.append(check,textBox);list.appendChild(row);
        check.addEventListener('change',hideAccessPreview);
      }
    }
    function renderSingleAppChoices(memberApps){
      const target=$('appAccessSingleApps');target.replaceChildren();
      for(const app of memberApps){
        const line=document.createElement('div');line.className='access-app-line';
        const title=document.createElement('span');
        const strong=document.createElement('strong');strong.textContent=app.label;
        const hint=document.createElement('small');
        hint.textContent=app.decision==='allow'?'目前：允許':app.decision==='deny'?'目前：禁止':
          app.legacyMembership==='active'?'目前：依原有會員權限（已開放）':'目前：依原有 App 規則';
        title.append(strong,hint);
        const buttons=document.createElement('div');buttons.className='access-single-actions';
        for(const mode of ['grant','revoke']){
          const choice=document.createElement('button');choice.type='button';choice.className='access-toggle '+(mode==='grant'?'allow':'deny');
          const desired=mode==='grant'?'allow':'deny';
          choice.textContent=mode==='grant'?'允許':'禁止';
          choice.setAttribute('aria-label',app.label+(mode==='grant'?'允許使用':'禁止使用'));
          choice.disabled=app.decision===desired;
          choice.addEventListener('click',()=>void previewAccess({mode,userIds:[state.accessUserIds[0]],appIds:[app.id]}));
          buttons.appendChild(choice);
        }
        line.append(title,buttons);target.appendChild(line);
      }
    }
    async function showAppAccess(ids,label,bulk=false){
      if(!state.isSuperAdmin)return;
      const keys=[...new Set(ids)].filter(Boolean);
      if(!keys.length)return;
      const requestToken=++state.accessLoadToken;
      state.accessLastRequest={ids:keys,label,bulk};
      const panel=$('appAccessPanel');panel.classList.remove('hidden');
      $('appAccessSingle').classList.toggle('hidden',bulk);
      $('appAccessBulk').classList.toggle('hidden',!bulk);
      if(bulk)panel.open=true;
      $('appAccessScope').textContent='正在讀取 '+label+' 的權限…';
      $('appAccessError').classList.add('hidden');
      $('appAccessSingleApps').replaceChildren();
      $('appAccessApps').replaceChildren();
      $('appAccessPreviewBtn').disabled=true;
      hideAccessPreview();
      try{
        await ensureAccessCatalog();
        if(requestToken!==state.accessLoadToken)return;
        if(!state.accessApps.length)throw new Error('尚未設定任何 App，請檢查 Starry ID 應用清單');
        let current=[];
        if(keys.length===1&&!bulk){
          const record=await api('/api/admin/app-access/member/'+encodeURIComponent(keys[0]));
          if(requestToken!==state.accessLoadToken)return;
          current=record.apps||[];
        }
        state.accessUserIds=keys;
        if(bulk)renderAppChoices([]);else renderSingleAppChoices(current);
        $('appAccessPreviewBtn').disabled=false;
        $('appAccessScope').textContent=label+(bulk?'｜批次管理':'｜單一會員');
        await loadAccessHistory();
      }catch(error){
        if(requestToken!==state.accessLoadToken)return;
        const status=error?.status?'（HTTP '+error.status+'）':'';
        const reason=error?.message||'目前無法連線，請稍後重試';
        $('appAccessScope').textContent='App 權限清單未載入';
        $('appAccessErrorText').textContent='讀取 App 清單失敗'+status+'：'+reason;
        $('appAccessError').classList.remove('hidden');
        toast('App 清單讀取失敗，請查看提示或重新讀取',true);
      }
    }
    async function previewAccess(input){
      try{
        const result=await api('/api/admin/app-access/preview',{method:'POST',body:JSON.stringify(input)});
        state.accessPreview=result;
        $('appAccessDownloadPreviewBtn').classList.add('hidden');
        const labels={grant:'開放勾選的 App（其他不變）',revoke:'禁止勾選的 App（其他不變）',replace:'只開放勾選的 App，未勾選全部禁止',undo:'還原'};
        const lines=['操作：'+(labels[result.kind]||result.kind),'影響會員：'+result.memberCount+' 位','實際變更：'+result.changeCount+' 項',
          '會員：'+(result.members||[]).map(x=>x.name+' ('+x.id+')').join('、')+(result.memberCount>15?'…':''),
          '部分變更：'+(result.changes||[]).map(x=>x.appId+': '+(x.before||'原有規則')+' → '+(x.after||'原有規則')).join('；')+(result.truncated?'…':'')];
        $('appAccessReviewText').textContent=lines.join('\\n');
        $('appAccessReviewText').style.whiteSpace='pre-wrap';
        $('appAccessReview').classList.remove('hidden');
        $('appAccessConfirmText').value='';$('appAccessCommitBtn').disabled=true;
        $('appAccessReview').scrollIntoView({behavior:'smooth',block:'nearest'});
      }catch(e){hideAccessPreview();toast(e.message||'預覽失敗',true);}
    }
    function displayBulkProgress(progress){
      const node=$('appAccessBulkProgress');node.classList.remove('hidden');
      const action=progress.status==='reverting'?'正在還原':'正在設定';
      const done=progress.status==='reverting'?progress.reverted:progress.done;
      const total=progress.status==='reverting'?progress.done:progress.changeCount;
      const doneStatus={completed:'全部完成',reverted:'全部還原',conflict:'已暫停，請檢查權限',undo_conflict:'還原已暫停，請檢查權限'};
      node.textContent=(doneStatus[progress.status]||action)+'：'+done+'／'+total+' 項權限｜作業還原碼：'+progress.jobId+
        (progress.lastError?'｜'+progress.lastError:'');
    }
    async function continueBulkJob(jobId){
      if(state.bulkRunning){toast('已有一項批次作業正在執行',true);return;}
      state.bulkRunning=true;
      try{
        let progress=await api('/api/admin/app-access/bulk/status?jobId='+encodeURIComponent(jobId));
        displayBulkProgress(progress);
        while(progress.status==='running'||progress.status==='reverting'){
          progress=await api('/api/admin/app-access/bulk/step',{method:'POST',body:JSON.stringify({jobId})});
          displayBulkProgress(progress);
        }
        if(progress.status==='completed')toast('批次設定全部完成。還原碼：'+jobId);
        if(progress.status==='reverted')toast('已還原完成：'+jobId);
        if(progress.status==='conflict'||progress.status==='undo_conflict')toast('作業已暫停，請查看操作紀錄',true);
      }catch(e){
        $('appAccessBulkProgress').classList.remove('hidden');
        $('appAccessBulkProgress').textContent='執行中斷：'+(e.message||'連線不穩')+'。已完成的部分都有紀錄，可按「繼續執行」或「預覽還原」。';
        toast('可從操作紀錄恢復作業，不會重複套用已完成項目',true);
      }finally{
        state.bulkRunning=false;
        await loadAccessHistory();
      }
    }
    async function previewBulkAccess(input){
      try{
        const result=await api('/api/admin/app-access/bulk/preview',{method:'POST',body:JSON.stringify(input)});
        if(!result.changeCount){toast('所選會員的權限已符合設定，沒有需要修改的項目');return;}
        state.accessPreview={...result,kind:'bulk'};
        const labels={grant:'只開放勾選的 App（其他不變）',revoke:'只禁止勾選的 App（其他不變）',replace:'只開放勾選的 App（未勾選全部禁止）'};
        const examples=(result.examples||[]).map(x=>(x.name||x.userId)+' · '+x.appId+'：'+(x.beforeDecision||'原有規則')+' → '+x.afterDecision);
        $('appAccessReviewText').textContent=[
          '操作：'+labels[result.mode],
          '符合條件：'+result.memberCount+' 位會員',
          '實際權限變更：'+result.changeCount+' 項',
          '變更範例：'+examples.join('；'),
          '完整明細可先下載 CSV 檢查，確認後才會開始分批套用。中途離開可從操作紀錄恢復。'
        ].join(String.fromCharCode(10));
        $('appAccessReviewText').style.whiteSpace='pre-wrap';
        $('appAccessDownloadPreviewBtn').classList.remove('hidden');
        $('appAccessReview').classList.remove('hidden');
        $('appAccessConfirmText').value='';$('appAccessCommitBtn').disabled=true;
        $('appAccessReview').scrollIntoView({behavior:'smooth',block:'nearest'});
      }catch(e){hideAccessPreview();toast(e.message||'批次預覽失敗',true);}
    }
    async function previewBulkUndo(jobId){
      try{
        const data=await api('/api/admin/app-access/bulk/undo-preview',{method:'POST',body:JSON.stringify({jobId})});
        state.accessPreview={...data,kind:'bulk_undo'};
        $('appAccessReviewText').textContent='還原作業：'+jobId+String.fromCharCode(10)+
          '本次僅還原該批次已完成的 '+data.done+' 項修改，未執行的權限不變。'+String.fromCharCode(10)+
          '還原前請確認沒有其他管理員更新相同的權限。輸入「確認變更」後開始分批還原。';
        $('appAccessReviewText').style.whiteSpace='pre-wrap';
        $('appAccessDownloadPreviewBtn').classList.add('hidden');
        $('appAccessReview').classList.remove('hidden');
        $('appAccessConfirmText').value='';$('appAccessCommitBtn').disabled=true;
        $('appAccessReview').scrollIntoView({behavior:'smooth',block:'nearest'});
      }catch(e){toast(e.message||'無法預覽還原',true);}
    }
    async function downloadBulkPreview(){
      const preview=state.accessPreview;
      if(!preview||preview.kind!=='bulk')return;
      const button=$('appAccessDownloadPreviewBtn');button.disabled=true;
      const esc=value=>{
        const t=String(value===null||value===undefined?'':value);
        const safe=/^[=+@-]/.test(t)?"'"+t:t;
        return '"'+safe.replace(/"/g,'""')+'"';
      };
      try{
        let offset=0,more=true;
        const lines=[['會員ID','姓名','App','原權限','新權限'].map(esc).join(',')];
        while(more){
          const data=await api('/api/admin/app-access/bulk/details?jobId='+encodeURIComponent(preview.jobId)+'&offset='+offset);
          for(const item of data.items||[])lines.push([item.userId,item.name,item.appId,item.beforeDecision||'原有規則',item.afterDecision].map(esc).join(','));
          offset=data.nextOffset;more=data.hasMore;
        }
        const blob=new Blob([String.fromCharCode(65279)+lines.join(String.fromCharCode(13,10))],{type:'text/csv;charset=utf-8'});
        const url=URL.createObjectURL(blob);
        const link=document.createElement('a');link.href=url;link.download='Starry-ID-權限預覽-'+preview.jobId+'.csv';
        document.body.appendChild(link);link.click();link.remove();
        URL.revokeObjectURL(url);
      }catch(e){toast('完整清單下載失敗：'+(e.message||'請重試'),true);}
      finally{button.disabled=false;}
    }
    $('appAccessDownloadPreviewBtn').addEventListener('click',()=>void downloadBulkPreview());
    async function loadAccessHistory(){
      const box=$('appAccessHistory');box.replaceChildren();
      try{
        const data=await api('/api/admin/app-access/history');
        for(const item of data.history||[]){
          const line=document.createElement('div');line.className='access-history-row';
          const label=document.createElement('span');
          label.textContent=new Date(item.createdAt).toLocaleString('zh-TW')+'｜'+item.kind+'｜還原碼 '+item.id;
          line.appendChild(label);
          if(!item.revertedBy){
            const undo=document.createElement('button');undo.type='button';undo.className='btn';
            undo.textContent='預覽還原';
            undo.addEventListener('click',()=>previewAccess({kind:'undo',operationId:item.id}));
            line.appendChild(undo);
          } else {
            const done=document.createElement('span');done.textContent='已還原';line.appendChild(done);
          }
          box.appendChild(line);
        }
      }catch(e){box.textContent='無法讀取單人操作紀錄';}
      try{
        const data=await api('/api/admin/app-access/bulk/history');
        for(const item of data.jobs||[]){
          const line=document.createElement('div');line.className='access-history-row';
          const label=document.createElement('span');
          const status={running:'執行中／可續跑',reverting:'還原中／可續跑',completed:'已完成',reverted:'已還原',conflict:'已暫停',undo_conflict:'還原衝突'}[item.status]||item.status;
          label.textContent='批次 '+new Date(item.createdAt).toLocaleString('zh-TW')+'｜'+status+'｜'+item.done+'/'+item.changeCount+'｜還原碼：'+item.jobId;
          line.appendChild(label);
          if(item.status==='running'||item.status==='reverting'){
            const resume=document.createElement('button');resume.type='button';resume.className='btn';
            resume.textContent='繼續執行';resume.addEventListener('click',()=>void continueBulkJob(item.jobId));line.appendChild(resume);
          }
          if(['completed','running','conflict','undo_conflict'].includes(item.status)&&item.done>item.reverted){
            const undo=document.createElement('button');undo.type='button';undo.className='btn';
            undo.textContent='預覽還原';undo.addEventListener('click',()=>void previewBulkUndo(item.jobId));line.appendChild(undo);
          }
          box.appendChild(line);
        }
      }catch(e){toast('批次操作紀錄讀取失敗：'+(e.message||'請重試'),true);}
    }
    $('appAccessRetryBtn').addEventListener('click',()=>{
      const last=state.accessLastRequest;
      if(last)void showAppAccess(last.ids,last.label,last.bulk);
    });
    $('appAccessPreviewBtn').addEventListener('click',()=>{
      const apps=[...document.querySelectorAll('.access-app-choice:checked')].map(el=>el.value);
      if(!state.accessBulkSelection){toast('請先在左側勾選會員',true);return;}
      void previewBulkAccess({selection:state.accessBulkSelection,appIds:apps,mode:$('appAccessMode').value});
    });
    $('appAccessMode').addEventListener('change',()=>{hideAccessPreview();$('appAccessBulkHelp').textContent=$('appAccessMode').value==='replace'?'注意：未勾選的 App 全部禁止，請仔細確認勾選清單。':'只有勾選的 App 會變更，其他 App 不會受到影響。';});
    $('appAccessConfirmText').addEventListener('input',()=>{
      $('appAccessCommitBtn').disabled= $('appAccessConfirmText').value!=='確認變更'||!state.accessPreview;
    });
    $('appAccessCancelBtn').addEventListener('click',hideAccessPreview);
    $('appAccessCommitBtn').addEventListener('click',async()=>{
      const preview=state.accessPreview;if(!preview)return;
      $('appAccessCommitBtn').disabled=true;
      try{
        if(preview.kind==='bulk'||preview.kind==='bulk_undo'){
          const endpoint=preview.kind==='bulk'?'confirm':'undo-confirm';
          const done=await api('/api/admin/app-access/bulk/'+endpoint,{
            method:'POST',body:JSON.stringify({jobId:preview.jobId,confirm:true,confirmationText:$('appAccessConfirmText').value})
          });
          hideAccessPreview();
          void continueBulkJob(done.jobId);
          return;
        }
        const applied=await api('/api/admin/app-access/commit',{method:'POST',body:JSON.stringify({
          previewId:preview.previewId,confirm:true,confirmationText:$('appAccessConfirmText').value
        })});
        hideAccessPreview();
        toast('已變更 '+applied.changed+' 項權限。還原碼：'+applied.operationId);
        if(state.accessUserIds.length===1)await showAppAccess(state.accessUserIds,state.user?.name||'會員',false);
        else await loadAccessHistory();
      }catch(e){toast(e.message||'設定失敗',true);$('appAccessCommitBtn').disabled=false;}
    });
    // Guest is deliberately NOT in state.members, selectedIds, memberCount
    // or any per-member API. Guest access has its own endpoint and audit.
    function closeGuestPreview(){
      state.guestPreview=null;
      $('guestAccessPreview').classList.add('hidden');
      $('guestAccessConfirmText').value='';
      $('guestAccessCommitBtn').disabled=true;
    }
    function guestPolicyRow(app){
      const item=document.createElement('div');
      item.className='guest-policy-row';
      const info=document.createElement('div');
      const heading=document.createElement('strong');
      heading.textContent=app.label;
      const note=document.createElement('small');
      note.textContent=(app.integrated
        ?app.capability+'｜目前：'+(app.allowed?'已開放':'預設不開放')
        :'尚未接入訪客安全保護，不可開放');
      info.append(heading,note);
      const action=document.createElement('button');
      action.className='btn';
      action.type='button';
      action.textContent=!app.integrated?'尚未接入':app.allowed?'禁止訪客':'允許公開功能';
      action.disabled=!app.integrated;
      action.addEventListener('click',()=>void previewGuestChange({appId:app.id,allowed:!app.allowed}));
      item.append(info,action);
      return item;
    }
    async function openGuestAccess(){
      if(!state.isSuperAdmin)return;
      state.guestOpen=true;
      state.targetUserId=null;
      renderMemberActive();
      $('guestAccessEntry').classList.add('active');
      $('guestAccessCard').classList.remove('hidden');
      $('profileCard').classList.add('hidden');
      closeGuestPreview();
      // Click the first row, but do not insert a guest into members or totals.
      if(window.innerWidth<761)toggleAdmin(false);
      await loadGuestAccess();
    }
    // Guest GETs are read-only; abort after eight seconds rather than
    // leaving the administrator on a permanent "正在讀取" screen. Never
    // retry automatically (Cloudflare D1 usage, safe admin expectations).
    const GUEST_READ_TIMEOUT_MS=8000;
    async function guestRead(path,outerSignal){
      const controller=new AbortController();
      const onAbort=()=>controller.abort();
      if(outerSignal?.aborted)controller.abort();
      else outerSignal?.addEventListener('abort',onAbort,{once:true});
      const timeout=setTimeout(()=>controller.abort(),GUEST_READ_TIMEOUT_MS);
      try{
        const response=await fetch(path,{
          method:'GET',credentials:'same-origin',cache:'no-store',
          headers:{Accept:'application/json'},signal:controller.signal
        });
        let data;
        try{data=await response.json();}
        catch{throw new Error('權限服務回傳資料異常，請重新讀取');}
        if(!response.ok)
          throw new Error(data?.error||'權限服務回應失敗（'+response.status+'）');
        return data;
      }catch(error){
        if(controller.signal.aborted && !outerSignal?.aborted)
          throw new Error('讀取超過 8 秒，請按「重新讀取」再試一次');
        throw error;
      }finally{
        clearTimeout(timeout);
        outerSignal?.removeEventListener('abort',onAbort);
      }
    }
    async function loadGuestAccess(){
      if(!state.guestOpen)return;
      const content=$('guestAppPolicies');
      const errorBox=$('guestAccessLoadError');
      const controller=new AbortController();
      state.guestLoadController?.abort();
      state.guestLoadController=controller;
      const generation=++state.guestReadGeneration;
      const current=()=>state.guestOpen && generation===state.guestReadGeneration;
      errorBox.classList.add('hidden');
      content.setAttribute('aria-busy','true');
      content.textContent='正在讀取訪客 App 權限…';
      try{
        const data=await guestRead('/api/admin/app-access/guest',controller.signal);
        if(!current())return;
        if(data.principal!=='guest'||data.countedAsMember!==false||
           !Array.isArray(data.apps))
          throw new Error('訪客權限資料格式不正確，請重新讀取');
        const fragment=document.createDocumentFragment();
        for(const app of data.apps)fragment.appendChild(guestPolicyRow(app));
        content.replaceChildren(fragment);
        // Loading history must not block the App permission list itself.
        void loadGuestHistory(generation);
      }catch(error){
        if(!current())return;
        content.textContent='';
        $('guestAccessLoadErrorText').textContent=
          '訪客權限讀取失敗：'+(error.message||'請稍後重新讀取');
        errorBox.classList.remove('hidden');
        $('guestAccessHistory').textContent='權限清單載入完成後，才會讀取操作紀錄。';
      }finally{
        if(current())content.setAttribute('aria-busy','false');
        if(state.guestLoadController===controller)state.guestLoadController=null;
      }
    }
    async function loadGuestHistory(generation=state.guestReadGeneration){
      const root=$('guestAccessHistory');root.textContent='正在讀取操作紀錄…';
      try{
        const data=await guestRead('/api/admin/app-access/guest/history');
        if(!state.guestOpen||generation!==state.guestReadGeneration)return;
        root.replaceChildren();
        const history=data.operations||[];
        if(!history.length){root.textContent='尚無變更紀錄';return;}
        for(const event of history){
          const line=document.createElement('div');line.className='access-history-row';
          const label=document.createElement('span');
          label.textContent=new Date(event.createdAt).toLocaleString('zh-TW')+
            '｜'+event.label+'｜'+(event.afterAllowed?'開放':'禁止')+
            '｜還原碼 '+event.id+(event.undoneBy?'（已還原）':'');
          line.appendChild(label);
          if(!event.undoneBy){
            const button=document.createElement('button');
            button.className='btn';button.type='button';button.textContent='預覽還原';
            button.addEventListener('click',()=>void previewGuestChange({undoOperationId:event.id}));
            line.appendChild(button);
          }
          root.appendChild(line);
        }
      }catch(error){
        if(!state.guestOpen||generation!==state.guestReadGeneration)return;
        root.textContent='操作紀錄讀取失敗：'+(error.message||'可重新讀取');
      }
    }
    async function previewGuestChange(input){
      closeGuestPreview();
      try{
        const data=await api('/api/admin/app-access/guest/preview',{
          method:'POST',body:JSON.stringify(input)
        });
        if(!state.guestOpen)return;
        state.guestPreview=data;
        $('guestAccessPreviewText').textContent=
          data.appLabel+'｜'+(data.beforeAllowed?'已開放':'未開放')+
          ' → '+(data.afterAllowed?'允許公開功能':'禁止訪客')+
          '\\n僅影響未登入者：'+data.capability+
          '\\n不影響任何已登入會員、會員權限及私人資料。';
        $('guestAccessPreviewText').style.whiteSpace='pre-wrap';
        $('guestAccessPreview').classList.remove('hidden');
        $('guestAccessPreview').scrollIntoView({behavior:'smooth',block:'nearest'});
      }catch(error){toast(error.message||'訪客權限預覽失敗',true);}
    }
    $('guestAccessEntry').addEventListener('click',()=>void openGuestAccess());
    $('guestAccessRetryBtn').addEventListener('click',()=>void loadGuestAccess());
    $('guestAccessConfirmText').addEventListener('input',()=>{
      $('guestAccessCommitBtn').disabled=
        !state.guestPreview||$('guestAccessConfirmText').value!=='確認變更';
    });
    $('guestAccessCancelBtn').addEventListener('click',closeGuestPreview);
    $('guestAccessCommitBtn').addEventListener('click',async()=>{
      const preview=state.guestPreview;
      if(!preview)return;
      const confirmationText=$('guestAccessConfirmText').value;
      $('guestAccessCommitBtn').disabled=true;
      try{
        const saved=await api('/api/admin/app-access/guest/commit',{
          method:'POST',body:JSON.stringify({
            previewId:preview.previewId,confirm:true,confirmationText
          })
        });
        closeGuestPreview();
        toast('訪客權限設定完成。還原碼：'+saved.operationId);
        await loadGuestAccess();
      }catch(error){
        toast(error.message||'訪客權限設定失敗',true);
        $('guestAccessCommitBtn').disabled=false;
      }
    });

    loadSession();
  })();
  </script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': NOINDEX,
      'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline' https://accounts.google.com; frame-src https://accounts.google.com; connect-src 'self' https://accounts.google.com; img-src 'self' data: blob: https:; style-src 'self' 'unsafe-inline' https://accounts.google.com; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()'
    }
  });
}