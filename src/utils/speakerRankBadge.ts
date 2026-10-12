export type SpeakerRankBadge = {
  rank: string;
  fileName: string;
  key: string;
  url: string;
};

const RANK_BADGE_FILES: Record<string, string> = {
  '銅章': '01銅章.png',
  '銀章': '02銀章.png',
  '金章': '03金章.png',
  '白金': '04白金.png',
  '紅寶石': '05紅寶石.png',
  '創辦人白金': '06創辦人白金.png',
  '創辦人紅寶石': '07創辦人紅寶石.png',
  '明珠': '08明珠.png',
  '藍寶石': '09藍寶石.png',
  '創辦人藍寶石': '10創辦人藍寶石.png',
  '翡翠': '11翡翠.png',
  '創辦人翡翠': '12創辦人翡翠.png',
  '鑽石': '13鑽石.png',
  '創辦人鑽石': '14創辦人鑽石.png',
  '執行專才鑽石': '15 EDC.png',
  '創辦人執行專才鑽石': '16創辦人EDC.png',
  '雙鑽石': '17雙鑽石.png',
  '創辦人雙鑽石': '18創辦人雙鑽石.png',
  '參鑽石': '19參鑽石.png',
  '創辦人參鑽石': '20創辦人參鑽石.png',
  '皇冠': '21皇冠.png',
  '創辦人皇冠': '22創辦人皇冠.png',
  '皇冠大使': '23皇冠大使.png',
  '創辦人皇冠大使': '24創辦人皇冠大使.png'
};

export const normalizeSpeakerRankForBadge = (value: string) =>
  String(value || '')
    .trim()
    .replace(/^GAR\s*/i, '')
    .replace(/\s*GAR全球獎銜\s*$/i, '')
    .replace(/\s*全球獎銜\s*$/i, '')
    .trim();

export const speakerRankBadge = (value: string): SpeakerRankBadge | null => {
  const rank = normalizeSpeakerRankForBadge(value);
  const fileName = RANK_BADGE_FILES[rank];
  if (!fileName) return null;
  const key = `Pin-Level/${fileName}`;
  return {
    rank,
    fileName,
    key,
    url: `/api/r2/file/${encodeURIComponent(key)}`
  };
};

export const SPEAKER_RANK_BADGE_FILES = RANK_BADGE_FILES;
