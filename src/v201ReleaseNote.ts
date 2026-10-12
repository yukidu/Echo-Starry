type ChangelogEntry = {version:string;date:string;isLatest?:boolean;summary:string;added:string[];modified:string[];removed:string[]};
const V201_RELEASE:ChangelogEntry={
  version:'v201',date:'2026/10/13',isLatest:true,
  summary:'調整首頁音檔卡片選單、白金以上會員貼紙／下線工具、基本資料自動補完，以及上手白金／鑽石關聯詞來源。',
  added:[
    '白金以上會員的「我的貼紙」會依正式或舊制既有獎銜自動顯示「人工加貼紙」與「綁定成為我下線」；明確等待獎銜審核者仍不會提前取得權限。',
    '超級管理員可在人工加貼紙頁看到舊規則曾漏開的白金以上會員檢查名單。',
    '上手白金／上手鑽石的關聯詞改為直接讀取「後台管理 > 上手名單」的正式詞庫。'
  ],
  modified:[
    '首頁音檔卡片「…」選單改為「詳細內容」、「加入收藏」與「不喜歡他」，並統一選項字級。',
    '剛註冊的新會員，以及基本資料仍有任一必填欄位未完成的會員，登入後會直接進入基本資料修改模式；Email 不列入完整度判斷。',
    '下線綁定在伺服器端新增限制：已是白金或白金以上的會員不能再被綁定為下線。'
  ],
  removed:['移除以整份會員名單推測上手關聯詞的做法，避免關聯詞與後台上手名單不同步。']
};
const runtime=window as Window&typeof globalThis&{__ECHOSTARS_V201_RELEASE_PATCH__?:boolean};
function isChangelogGet(input:Parameters<typeof fetch>[0],init?:Parameters<typeof fetch>[1]){const method=String(init?.method||(input instanceof Request?input.method:'GET')).toUpperCase();if(method!=='GET')return false;try{const raw=input instanceof Request?input.url:String(input);const url=new URL(raw,window.location.origin);return url.origin===window.location.origin&&url.pathname==='/api/changelog';}catch{return false;}}
function merge(data:unknown){const list=Array.isArray(data)?data.filter(item=>item&&typeof item==='object') as ChangelogEntry[]:[];return[V201_RELEASE,...list.filter(item=>item.version!==V201_RELEASE.version).map(item=>({...item,isLatest:false}))];}
if(!runtime.__ECHOSTARS_V201_RELEASE_PATCH__){runtime.__ECHOSTARS_V201_RELEASE_PATCH__=true;const previousFetch=window.fetch.bind(window);window.fetch=(async(...args:Parameters<typeof fetch>)=>{const[input,init]=args;if(!isChangelogGet(input,init))return previousFetch(...args);try{const response=await previousFetch(...args);const data=response.ok?await response.clone().json().catch(()=>[]):[];const headers=new Headers(response.headers);headers.set('Content-Type','application/json; charset=utf-8');headers.delete('Content-Length');headers.delete('Content-Encoding');return new Response(JSON.stringify(merge(data)),{status:200,statusText:'OK',headers});}catch{return new Response(JSON.stringify(merge([])),{status:200,headers:{'Content-Type':'application/json; charset=utf-8'}});}}) as typeof window.fetch;}
