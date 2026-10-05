export const STICKER_SCALE = 10;
export const INITIAL_STICKER_UNITS = 6 * STICKER_SCALE;

export function stickersToUnits(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * STICKER_SCALE);
}

export function unitsToStickers(units: unknown): number {
  const number = Number(units);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number) / STICKER_SCALE;
}

export function formatStickerAmount(value: unknown): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0';
  const rounded = Math.round(number * STICKER_SCALE) / STICKER_SCALE;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function normalizeMemberName(value: unknown): string {
  return String(value || '').trim().replace(/\s+/g, '').toLocaleLowerCase('zh-Hant');
}

export const RANK_ORDER_FOR_STICKERS = [
  '無', '3%', '6%', '9%', '12%', '12%初階', '15%', '15%銅章', '18%', '21%',
  '銀章', '金章', '白金', '紅寶石', '創辦人白金', '創辦人紅寶石', '藍寶石',
  '創辦人藍寶石', '明珠', '翡翠', '創辦人翡翠', '鑽石級以上'
] as const;

export function isPlatinumOrAboveRank(value: unknown): boolean {
  const rank = String(value || '').trim();
  if (!rank) return false;
  if (/鑽石|皇冠|大使/.test(rank)) return true;
  const index = (RANK_ORDER_FOR_STICKERS as readonly string[]).indexOf(rank);
  const platinumIndex = (RANK_ORDER_FOR_STICKERS as readonly string[]).indexOf('白金');
  return index >= platinumIndex && platinumIndex >= 0;
}
