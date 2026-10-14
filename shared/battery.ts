export const BATTERY_SCALE = 10;
export const INITIAL_BATTERY_UNITS = 6 * BATTERY_SCALE;

export function batteriesToUnits(value: unknown): number {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number * BATTERY_SCALE);
}

export function unitsToBatteries(units: unknown): number {
  const number = Number(units);
  if (!Number.isFinite(number)) return 0;
  return Math.round(number) / BATTERY_SCALE;
}

export function formatBatteryAmount(value: unknown): string {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0';
  const rounded = Math.round(number * BATTERY_SCALE) / BATTERY_SCALE;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function normalizeMemberName(value: unknown): string {
  return String(value || '').trim().replace(/\s+/g, '').toLocaleLowerCase('zh-Hant');
}

export const RANK_ORDER_FOR_BATTERY = [
  '無', '3%', '6%', '9%', '12%', '12%初階', '15%', '15%銅章', '18%', '21%',
  '銀章', '金章', '白金', '紅寶石', '創辦人白金', '創辦人紅寶石', '藍寶石',
  '創辦人藍寶石', '明珠', '翡翠', '創辦人翡翠', '鑽石級以上'
] as const;

export function isPlatinumOrAboveRank(value: unknown): boolean {
  const rank = String(value || '').trim();
  if (!rank) return false;
  if (/鑽石|皇冠|大使/.test(rank)) return true;
  const index = (RANK_ORDER_FOR_BATTERY as readonly string[]).indexOf(rank);
  const platinumIndex = (RANK_ORDER_FOR_BATTERY as readonly string[]).indexOf('白金');
  return index >= platinumIndex && platinumIndex >= 0;
}

export function isPlatinumToolsEligible(member: any): boolean {
  if (!member) return false;
  const rankApproved = Boolean(member.rankApproved);
  const auditStatus = String(member.rankAuditStatus || '').trim().toLowerCase();
  if (rankApproved) return isPlatinumOrAboveRank(member.approvedRank || member.rank);
  if (auditStatus === 'pending') return false;
  return isPlatinumOrAboveRank(member.rank) || isPlatinumOrAboveRank(member.approvedRank);
}

export function vipPasswordForTrack(trackId: string): string {
  if (typeof window === 'undefined') return '';
  try {
    const saved = JSON.parse(localStorage.getItem('sq_vip_passwords') || '{}')[trackId];
    if (/^\d{4,12}$/.test(String(saved || ''))) return String(saved);
  } catch {}
  const raw = window.location.search.replace(/^\?/, '');
  return /^\d{4,12}$/.test(raw) ? raw : '';
}
