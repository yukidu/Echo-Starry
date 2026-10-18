/** Converts recorded ISO upload times to Taiwan-local, human-readable text. */
export function formatSpeakerUploadDate(value?:string){
  if(!value)return '日期未設定';
  if(/^\d{4}-\d{2}-\d{2}$/.test(value))return value.replace(/-/g,'/');
  const date=new Date(value);
  if(!Number.isFinite(date.getTime()))return '日期未設定';
  const parts=new Intl.DateTimeFormat('en-GB',{
    timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',hour12:false
  }).formatToParts(date);
  const get=(key:string)=>parts.find(x=>x.type===key)?.value||'';
  return get('year')+'/'+get('month')+'/'+get('day')+' '+get('hour')+':'+get('minute');
}
