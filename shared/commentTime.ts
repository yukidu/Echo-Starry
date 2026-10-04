export type CommentTimestampSource = {
  createdAt?: unknown;
  timestamp?: unknown;
};

function createdAtMilliseconds(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return value < 1_000_000_000_000 ? value * 1000 : value;
  }
  if (typeof value === 'string' && value.trim()) {
    const clean = value.trim();
    const numeric = Number(clean);
    if (Number.isFinite(numeric) && numeric > 0) {
      return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
    }
    const parsed = Date.parse(clean);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

const taipeiDateTime = new Intl.DateTimeFormat('zh-TW-u-ca-gregory', {
  timeZone: 'Asia/Taipei',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
});

export function formatCommentTimestamp(source: CommentTimestampSource): string {
  const createdAt = createdAtMilliseconds(source?.createdAt);
  if (createdAt !== null) {
    const parts = Object.fromEntries(
      taipeiDateTime.formatToParts(new Date(createdAt))
        .filter(part => part.type !== 'literal')
        .map(part => [part.type, part.value])
    ) as Record<string, string>;
    if (parts.year && parts.month && parts.day && parts.hour && parts.minute) {
      return `${parts.year}/${parts.month}/${parts.day} ${parts.hour}:${parts.minute}`;
    }
  }
  const legacy = String(source?.timestamp || '').trim();
  if (legacy && legacy !== '剛剛' && legacy !== '剛才') return legacy;
  return '時間未知';
}
