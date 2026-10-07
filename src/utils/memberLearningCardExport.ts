import { effectiveMemberRank } from './ranks';
import { Track, UserProfile, UserListeningRecord } from '../types';
import { calculateNumerology } from './numerology';
import { JPEG_EXPORT_QUALITY, JPEG_EXPORT_WIDTH } from '../jpegExportPolicy';
import { canonicalProgressPercent, summarizePlaybackRecords } from '../../shared/learningProgress';

type Item = { track: Track; record: UserListeningRecord };
type RuntimeRecord = UserListeningRecord & { currentTime?: number; updatedAt?: number; userIdentifier?: string };
type Stats = {
  totalCount: number;
  completedCount: number;
  unfinishedCount: number;
  listenedHours: number;
  totalMinutes: number;
  averageProgress: number;
  commentCount: number;
  shareCount: number;
};

const font = '"PingFang TC", "Microsoft JhengHei", sans-serif';
const short = (value: unknown, n: number) => {
  const text = String(value || '').trim();
  if (!text) return '-';
  return text.length > n ? `${text.slice(0, n - 1)}…` : text;
};
const date = (value: unknown) => {
  const text = String(value || '').trim();
  if (!text) return '-';
  const m = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  return m ? `${m[1]}/${m[2].padStart(2, '0')}/${m[3].padStart(2, '0')}` : text;
};
const registrationDays = (value: unknown) => {
  const m = String(value || '').trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (!m) return null;
  const registered = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  if (!Number.isFinite(registered)) return null;
  if (registered > today) return 0;
  return Math.floor((today - registered) / 86400000) + 1;
};
const timestamp = (record: UserListeningRecord) => {
  const runtime = record as RuntimeRecord;
  if (Number(runtime.updatedAt) > 0) return Number(runtime.updatedAt);
  const m = String(record.lastListenDate || record.finishDate || record.firstListenDate || '').match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  return m ? Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : 0;
};

function recordToCanonical(item: Item) {
  const { track, record } = item;
  const progressPercent = canonicalProgressPercent(record as any, {
    id: track.id,
    title: track.title,
    speaker: track.speaker,
    speakerRank: track.speakerRank,
    durationSeconds: track.durationSeconds
  });
  const duration = Math.max(0, Number(record.duration) || Number(track.durationSeconds) || 0);
  return {
    trackId: track.id,
    userIdOrDeviceId: String((record as RuntimeRecord).userIdentifier || record.userIdOrDeviceId || ''),
    firstListenDate: record.firstListenDate || '',
    lastListenDate: record.lastListenDate || '',
    finishDate: record.finishDate,
    progressPercent,
    completed: progressPercent >= 95 || Boolean(record.completed),
    currentTime: duration > 0 ? duration * progressPercent / 100 : Math.max(0, Number((record as RuntimeRecord).currentTime) || 0),
    duration,
    clickCount: record.clickCount || 1,
    isDeleted: Boolean(record.isDeleted),
    trackTitle: track.title,
    trackSpeaker: track.speaker,
    trackSpeakerRank: track.speakerRank,
    updatedAt: Number((record as RuntimeRecord).updatedAt) || 0
  };
}

function fallbackStats(items: Item[]): Stats {
  const records: Record<string, ReturnType<typeof recordToCanonical>> = {};
  for (const item of items) {
    const next = recordToCanonical(item);
    const old = records[next.trackId];
    if (!old || next.progressPercent > old.progressPercent || next.updatedAt > old.updatedAt) records[next.trackId] = next;
  }
  const summary = summarizePlaybackRecords(records as any);
  const commentCount = items.reduce((count, item) => count + (item.record.comment?.trim() ? 1 : 0), 0);
  return { ...summary, commentCount, shareCount: 0 };
}

async function loadStats(items: Item[]): Promise<Stats> {
  const fallback = fallbackStats(items);
  try {
    const response = await fetch('/api/member-learning-card-stats', { cache: 'no-store' });
    if (!response.ok) return fallback;
    const data = await response.json();
    return {
      totalCount: Number(data.totalCount) || 0,
      completedCount: Number(data.completedCount) || 0,
      unfinishedCount: Number(data.unfinishedCount) || 0,
      listenedHours: Number(data.listenedHours) || 0,
      totalMinutes: Number(data.totalMinutes) || 0,
      averageProgress: Number(data.averageProgress) || 0,
      commentCount: Number(data.commentCount) || 0,
      shareCount: Number(data.shareCount) || 0
    };
  } catch {
    return fallback;
  }
}

function wrapText(ctx: CanvasRenderingContext2D, value: unknown, maxWidth: number): string[] {
  const text = String(value || '').trim() || '-';
  const lines: string[] = [];
  let line = '';
  for (const char of Array.from(text)) {
    const next = line + char;
    if (line && ctx.measureText(next).width > maxWidth) {
      lines.push(line);
      line = char;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : ['-'];
}

function drawGrid(ctx: CanvasRenderingContext2D, user: UserProfile, x: number, y: number, w: number, h: number) {
  const numerology = user.birthday ? calculateNumerology(user.birthday) : null;
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(x, y, w, h);
  ctx.font = `bold 16px ${font}`;
  ctx.fillStyle = '#000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('生命靈數九宮格', x + w / 2, y + 17);

  const layout = [[1, 4, 7], [2, 5, 8], [3, 6, 9]];
  const cell = Math.floor(Math.min((w - 14) / 3, (h - 32) / 3));
  const sx = x + (w - cell * 3) / 2;
  const sy = y + 30;

  layout.forEach((row, r) => row.forEach((num, c) => {
    const cx = sx + c * cell;
    const cy = sy + r * cell;
    const mx = cx + cell / 2;
    const my = cy + cell / 2;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.strokeRect(cx, cy, cell, cell);

    if (!numerology) {
      ctx.font = `bold 20px ${font}`;
      ctx.fillStyle = '#cbd5e1';
      ctx.fillText(String(num), mx, my + 1);
      return;
    }

    const birth = numerology.digitCounts[num] || 0;
    const birthday = num === numerology.birthdayNumber;
    const zodiac = num === numerology.zodiacNumber;
    const talent = numerology.talentDigits.filter(d => d === num).length;
    const life = num === numerology.lifeNumber;
    // Match the web NumerologyGrid: congenital black, birthday amber,
    // zodiac purple, talent lime, life red.
    const rings: Array<{ color: string; width: number }> = [
      ...Array.from({ length: birth }, () => ({ color: '#0f172a', width: 1.5 })),
      ...(birthday ? [{ color: '#fbbf24', width: 2 }] : []),
      ...(zodiac ? [{ color: '#9333ea', width: 2 }] : []),
      ...Array.from({ length: talent }, () => ({ color: '#84cc16', width: 2 })),
      ...(life ? [{ color: '#ef4444', width: 2.2 }] : [])
    ];

    rings.forEach((ring, i) => {
      const radius = rings.length === 1
        ? cell * 0.27
        : cell * (0.19 + i * (0.17 / Math.max(1, rings.length - 1)));
      ctx.beginPath();
      ctx.arc(mx, my, radius, 0, Math.PI * 2);
      ctx.strokeStyle = ring.color;
      ctx.lineWidth = rings.length > 8 ? Math.min(1.2, ring.width) : ring.width;
      ctx.stroke();
    });

    ctx.font = `bold 20px ${font}`;
    ctx.fillStyle = life ? '#dc2626' : rings.length ? '#0f172a' : '#cbd5e1';
    ctx.fillText(String(num), mx, my + 1);
  }));

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
}

function recordTitle(item: Item, no: number) {
  const rank = item.track.speakerRank && !['無', '公開'].includes(item.track.speakerRank) ? item.track.speakerRank : '';
  return `${no}. ${item.track.speaker}${rank ? ` ${rank}` : ''} ${item.track.title}`.trim();
}

function measureRecordHeight(ctx: CanvasRenderingContext2D, item: Item, no: number, w: number) {
  ctx.font = `bold 14.5px ${font}`;
  const titleLines = wrapText(ctx, recordTitle(item, no), w - 20);
  const comment = String(item.record.comment || '').trim();
  ctx.font = `12px ${font}`;
  const commentLines = comment ? wrapText(ctx, `心得：${comment}`, w - 20) : [];
  return 10 + titleLines.length * 17 + 16 + 16 + (commentLines.length ? commentLines.length * 15 + 2 : 0) + 7;
}

function drawRecord(ctx: CanvasRenderingContext2D, item: Item, no: number, x: number, y: number, w: number) {
  const { track, record } = item;
  ctx.font = `bold 14.5px ${font}`;
  const titleLines = wrapText(ctx, recordTitle(item, no), w - 20);
  const comment = String(record.comment || '').trim();
  ctx.font = `12px ${font}`;
  const commentLines = comment ? wrapText(ctx, `心得：${comment}`, w - 20) : [];
  const h = 10 + titleLines.length * 17 + 16 + 16 + (commentLines.length ? commentLines.length * 15 + 2 : 0) + 7;

  ctx.strokeStyle = '#d6d6d6';
  ctx.lineWidth = 1;
  ctx.strokeRect(x, y, w, h);
  ctx.fillStyle = '#000';
  ctx.font = `bold 14.5px ${font}`;
  titleLines.forEach((line, index) => ctx.fillText(line, x + 10, y + 17 + index * 17));

  let cursor = y + 17 + titleLines.length * 17;
  const progress = Math.round(canonicalProgressPercent(record as any, {
    id: track.id,
    title: track.title,
    speaker: track.speaker,
    speakerRank: track.speakerRank,
    durationSeconds: track.durationSeconds
  }));
  const done = progress >= 95 || Boolean(record.completed || record.finishDate);

  ctx.font = `12px ${font}`;
  ctx.fillStyle = '#333';
  ctx.fillText(`首次：${date(record.firstListenDate)}   最近：${date(record.lastListenDate)}   ${done ? '已聽完' : '未聽完'}`, x + 10, cursor);
  cursor += 16;

  const rating = record.rating && record.rating > 0
    ? '★'.repeat(Math.min(5, Math.max(0, Math.round(record.rating))))
    : '未評價';
  ctx.fillText(`進度：${done ? 100 : progress}%   評價：${rating}`, x + 10, cursor);
  cursor += 16;

  if (commentLines.length) {
    ctx.fillStyle = '#555';
    commentLines.forEach((line, index) => ctx.fillText(line, x + 10, cursor + index * 15));
  }
  return h;
}

export async function exportMemberLearningCard(user: UserProfile, items: Item[]): Promise<Blob> {
  const calc = calculateNumerology(user.birthday || '');
  const resolved = {
    ...user,
    zodiac: calc?.zodiac,
    talentNumber: calc?.talentNumber,
    lifeNumber: calc?.lifeNumber
  };

  const records = [...items].sort((a, b) => {
    const ac = Boolean(a.record.comment?.trim());
    const bc = Boolean(b.record.comment?.trim());
    return ac !== bc ? (bc ? 1 : -1) : timestamp(b.record) - timestamp(a.record);
  }).slice(0, 50);
  const stats = await loadStats(items);

  const W = 800;
  const pad = 26;
  const gap = 10;
  const profileY = 92;
  const profileH = 250;
  const leftW = 432;
  const rightX = pad + leftW + gap;
  const rightW = W - pad * 2 - leftW - gap;
  const statsY = 354;
  const statsH = 78;
  const headingY = 457;
  const startY = 470;
  const footer = 42;
  const colGap = 12;
  const colW = (W - pad * 2 - colGap) / 2;

  const probe = document.createElement('canvas');
  const probeCtx = probe.getContext('2d')!;
  let rowsH = records.length ? 0 : 62;
  for (let i = 0; i < records.length; i += 2) {
    const leftH = measureRecordHeight(probeCtx, records[i], i + 1, colW);
    const rightH = records[i + 1] ? measureRecordHeight(probeCtx, records[i + 1], i + 2, colW) : 0;
    rowsH += Math.max(leftH, rightH) + 8;
  }

  const H = startY + rowsH + footer;
  const scale = JPEG_EXPORT_WIDTH / W;
  const canvas = document.createElement('canvas');
  canvas.width = JPEG_EXPORT_WIDTH;
  canvas.height = Math.round(H * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.scale(scale, scale);

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 3;
  ctx.strokeRect(12, 12, W - 24, H - 24);
  ctx.fillStyle = '#000';
  ctx.fillRect(26, 26, W - 52, 4);

  const resolvedRank = effectiveMemberRank(resolved);
  const titleRank = resolvedRank !== '無' ? ` ${resolvedRank}` : '';
  ctx.font = `bold 28px ${font}`;
  ctx.fillStyle = '#000';
  ctx.fillText(`${resolved.name}${titleRank} 個人學習卡`, pad, 61);
  ctx.font = `13px ${font}`;
  ctx.fillStyle = '#555';
  ctx.fillText(`繁星回聲 • 個人學習進度  |  匯出日期：${date(new Date().toISOString())}`, pad, 81);

  // Basic profile: remove the duplicated name/rank row; keep only useful details.
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(pad, profileY, leftW, profileH);
  const lx = pad + 14;
  const joinedDays = registrationDays(resolved.registerDate);
  const joinedSuffix = joinedDays === null ? '' : `（已 ${joinedDays} 天）`;
  ctx.font = `14px ${font}`;
  ctx.fillStyle = '#111';
  ctx.fillText(`會員編號：${resolved.amwayId || '-'}   |   中心：${resolved.center || '無'}`, lx, profileY + 34);
  ctx.fillText(`會員註冊日期：${date(resolved.registerDate)}${joinedSuffix}`, lx, profileY + 62);
  ctx.fillText(`推薦人：${short(resolved.sponsor, 11)}   |   上手白金：${short(resolved.platinumUpline, 11)}`, lx, profileY + 90);
  ctx.fillText(`上手鑽石：${short(resolved.diamondUpline, 16)}   |   居住地區：${resolved.residence || '-'}`, lx, profileY + 118);
  ctx.fillText(`星座：${resolved.zodiac || '-'}   |   天賦數：${resolved.talentNumber || '-'}   |   命數：${resolved.lifeNumber || '-'}`, lx, profileY + 146);
  ctx.fillText(`初次認識安麗：${short(resolved.joinReason, 21)}`, lx, profileY + 177);
  ctx.fillText(`留在安麗：${short(resolved.stayReason, 24)}`, lx, profileY + 205);

  // Enlarged numerology grid fills the right panel instead of leaving empty margins.
  drawGrid(ctx, resolved, rightX, profileY, rightW, profileH);

  ctx.strokeStyle = '#000';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(pad, statsY, W - pad * 2, statsH);
  ctx.font = `bold 15px ${font}`;
  ctx.fillStyle = '#000';
  ctx.fillText('個人學習數據統計', pad + 12, statsY + 22);
  ctx.font = `13px ${font}`;
  ctx.fillText(`已聽完：${stats.completedCount} 部   |   未聽完：${stats.unfinishedCount} 部   |   累計聆聽：約 ${stats.listenedHours.toFixed(1)} 小時`, pad + 12, statsY + 45);
  ctx.fillText(`平均進度：${stats.averageProgress}%   |   本人留言（含回覆）：${stats.commentCount} 篇   |   分享錄音檔：${stats.shareCount} 次`, pad + 12, statsY + 66);

  ctx.font = `bold 16px ${font}`;
  ctx.fillText(`聆聽錄音學習紀錄（最近 ${records.length} 則${items.length > 50 ? `／全部 ${items.length} 則` : ''}）`, pad, headingY);

  if (!records.length) {
    ctx.font = `italic 14px ${font}`;
    ctx.fillStyle = '#888';
    ctx.fillText('尚無已聆聽的音檔紀錄', pad, startY + 28);
  } else {
    let y = startY;
    for (let i = 0; i < records.length; i += 2) {
      const leftH = drawRecord(ctx, records[i], i + 1, pad, y, colW);
      const rightH = records[i + 1]
        ? drawRecord(ctx, records[i + 1], i + 2, pad + colW + colGap, y, colW)
        : 0;
      y += Math.max(leftH, rightH) + 8;
    }
  }

  ctx.font = `bold 12px ${font}`;
  ctx.fillStyle = '#333';
  ctx.fillText('繁星回聲 • 個人學習卡', pad, H - 20);
  return new Promise(resolve => canvas.toBlob(blob => resolve(blob!), 'image/jpeg', JPEG_EXPORT_QUALITY));
}
