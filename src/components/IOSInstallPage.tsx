import React from 'react';
import { Share, SquarePlus, ArrowLeft } from 'lucide-react';
export function IOSInstallPage({onBack}:{onBack:()=>void}) {
 return <section aria-labelledby="ios-install-title" className="min-h-[70dvh] text-slate-800 dark:text-slate-100 space-y-6"><button type="button" onClick={onBack} className="flex items-center gap-2"><ArrowLeft className="w-5 h-5"/>回首頁</button><h1 id="ios-install-title" className="text-2xl font-bold" style={{color:'var(--color-primary)'}}>安裝到桌面</h1><div className="p-5 rounded-2xl bg-white dark:bg-slate-800 space-y-5"><p>在 iPhone 或 iPad 將繁星回聲加入主畫面：</p><ol className="list-decimal pl-5 space-y-5"><li>使用 Safari 開啟繁星回聲網站。如果目前在通訊軟體內，請先選擇「以 Safari 開啟」。</li><li>點選瀏覽器的 <Share className="inline w-5 h-5"/> 分享按鈕。</li><li>在分享選單中向下捲動，選擇 <SquarePlus className="inline w-5 h-5"/>「加入主畫面」。</li><li>確認名稱後點選「加入」，之後就能從主畫面的圖示開啟。</li></ol></div></section>;
}
