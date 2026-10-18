/**
 * Recordings can store ISO UTC timestamps, local date strings, or Unix times.
 * Display readable Taiwan local dates and never expose a raw ISO value in UI.
 */
export function formatSpeakerRecordingDate(value:unknown):string {
  if(value===null||value===undefined||value==='')return '日期未設定';
  const input=String(value).trim();
  if(!input)return '日期未設定';
  const plain=input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if(plain)return `${plain[1]}/${plain[2]}/${plain[3]}`;
  const timestamp=typeof value==='number'?value:Number.NaN;
  const date=Number.isFinite(timestamp)
    ? new Date(timestamp<1e11?timestamp*1000:timestamp)
    : new Date(input);
  if(Number.isNaN(date.getTime()))return '日期未設定';
  const parts=new Intl.DateTimeFormat('en-US',{
    timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit',
    hour:'2-digit',minute:'2-digit',hourCycle:'h23'
  }).formatToParts(date);
  const part=(type:string)=>parts.find(p=>p.type===type)?.value??'';
  return `${part('year')}/${part('month')}/${part('day')} ${part('hour')}:${part('minute')}`;
}
