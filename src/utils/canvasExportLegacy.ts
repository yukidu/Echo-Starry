import { effectiveMemberRank } from './ranks';
import { Track, Comment, UserProfile, UserListeningRecord } from '../types';
import { calculateNumerology } from './numerology';

export async function exportMemberProfileAndListeningImage(
  user: UserProfile,
  records: Array<{ track: Track; record: UserListeningRecord }>
): Promise<Blob> {
  const calculated = calculateNumerology(user.birthday || '');
  user = { ...user, zodiac: calculated?.zodiac, talentNumber: calculated?.talentNumber, lifeNumber: calculated?.lifeNumber };
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  const width = 800;
  const padding = 36;
  const topSectionHeight = 295;
  const footerHeight = 45;

  // Calculate items dynamic compact height (Requirement 7 & 13)
  const itemsHeight = records.length === 0
    ? 60
    : records.reduce((acc, item) => acc + (item.record.comment ? 82 : 62), 0);

  const totalHeight = topSectionHeight + itemsHeight + footerHeight;
  canvas.width = width;
  canvas.height = totalHeight;

  // Background: Crisp high-contrast white
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, totalHeight);

  // Border frame
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#000000';
  ctx.strokeRect(14, 14, width - 28, totalHeight - 28);

  // Top Accent Bar
  ctx.fillStyle = '#000000';
  ctx.fillRect(28, 28, width - 56, 4);

  // Header Title
  ctx.font = 'bold 26px "PingFang TC", "Microsoft JhengHei", sans-serif';
  ctx.fillStyle = '#000000';
  ctx.fillText('學員學習檔案卡', padding, 62);

  ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#666666';
  ctx.fillText(`繁星回聲 • 學習與聆聽檔案  |  匯出日期：${new Date().toLocaleDateString('zh-TW')}`, padding, 82);

  // Top Section: Two-column layout (Requirement 13: 九宮格移至頂端右側，與左側基本資料對齊)
  const profileBoxY = 96;
  const profileBoxH = 175;
  const leftColW = 516;
  const rightColX = padding + leftColW + 14;
  const rightColW = width - padding * 2 - leftColW - 14; // 198px

  // Left Column: Member Basic Profile Box
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(padding, profileBoxY, leftColW, profileBoxH);

  ctx.font = 'bold 14px "PingFang TC", "Microsoft JhengHei", sans-serif';
  ctx.fillStyle = '#000000';
  ctx.fillText(`姓名：${user.name}  |  獎銜：${effectiveMemberRank(user)}  |  編號：${user.amwayId || '-'}  |  中心：${user.center || '無'}`, padding + 12, profileBoxY + 26);

  ctx.font = '12px "PingFang TC", "Microsoft JhengHei", sans-serif';
  ctx.fillStyle = '#222222';
  ctx.fillText(`推薦人：${user.sponsor || '-'}   上手白金：${user.platinumUpline || '-'}   上手鑽石：${user.diamondUpline || '-'}`, padding + 12, profileBoxY + 54);

  ctx.fillText(`居住地區：${user.residence || '-'}   所屬中心：${user.center || '無'}`, padding + 12, profileBoxY + 78);

  ctx.fillStyle = '#444444';
  ctx.fillText(`所屬星座：${user.zodiac || '-'}   天賦數：${user.talentNumber || '-'}   主命數：${user.lifeNumber ? `${user.lifeNumber} 號人` : '-'}`, padding + 12, profileBoxY + 104);

  const cleanJoin = user.joinReason ? (user.joinReason.length > 28 ? user.joinReason.substring(0, 28) + '...' : user.joinReason) : '-';
  ctx.fillText(`初次認識安麗：${cleanJoin}`, padding + 12, profileBoxY + 130);

  const cleanStay = user.stayReason ? (user.stayReason.length > 28 ? user.stayReason.substring(0, 28) + '...' : user.stayReason) : '-';
  ctx.fillText(`留在安麗原因：${cleanStay}`, padding + 12, profileBoxY + 154);

  // Right Column: Numerology 3x3 Grid Box (Requirement 13: 刪除鑽石、皇冠與右側圖例文字)
  const numerology = user.birthday ? calculateNumerology(user.birthday) : null;
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(rightColX, profileBoxY, rightColW, profileBoxH);

  // Box Title
  ctx.font = 'bold 12px "PingFang TC", sans-serif';
  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('生命靈數九宮格', rightColX + rightColW / 2, profileBoxY + 14);

  // 3x3 Grid geometry
  const gridLayout = [
    [1, 4, 7],
    [2, 5, 8],
    [3, 6, 9]
  ];
  const cellSize = 44;
  const gridStartX = rightColX + (rightColW - cellSize * 3) / 2;
  const gridStartY = profileBoxY + 28;

  gridLayout.forEach((row, rIdx) => {
    row.forEach((num, cIdx) => {
      const cellX = gridStartX + cIdx * cellSize;
      const cellY = gridStartY + rIdx * cellSize;

      // Draw cell border
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1;
      ctx.strokeRect(cellX, cellY, cellSize, cellSize);

      // Print center digit
      ctx.font = 'bold 14px "PingFang TC", sans-serif';
      ctx.fillStyle = '#000000';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(num), cellX + cellSize / 2, cellY + cellSize / 2 + 1);

      if (numerology) {
        // Circles: count of congenital digits + birthday number + zodiac number
        const birthCount = numerology.digitCounts[num] || 0;
        const isBirthday = num === numerology.birthdayNumber;
        const isZodiac = num === numerology.zodiacNumber;
        const totalCircles = birthCount + (isBirthday ? 1 : 0) + (isZodiac ? 1 : 0);

        for (let c = 0; c < totalCircles; c++) {
          ctx.beginPath();
          ctx.arc(cellX + cellSize / 2, cellY + cellSize / 2, 10 + c * 3, 0, Math.PI * 2);
          ctx.lineWidth = 1.1;
          ctx.strokeStyle = '#000000';
          ctx.stroke();
        }
      }
    });
  });

  // Reset text baseline and alignment
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  // Section 2: Listened Tracks Title
  ctx.font = 'bold 15px "PingFang TC", "Microsoft JhengHei", sans-serif';
  ctx.fillStyle = '#000000';
  ctx.fillText(`已聆聽錄音檔學習進度清單（共 ${records.length} 部）`, padding, 290);

  // List of tracks (Requirement 7: 包含進度、評價、心得，排版緊密)
  let y = 302;

  if (records.length === 0) {
    ctx.font = 'italic 13px sans-serif';
    ctx.fillStyle = '#888888';
    ctx.fillText('尚無已聆聽的音檔紀錄', padding, y + 25);
  } else {
    records.forEach((item, index) => {
      const { track, record } = item;
      const itemH = record.comment ? 82 : 62;

      // Index & Title
      ctx.font = 'bold 14px "PingFang TC", "Microsoft JhengHei", sans-serif';
      ctx.fillStyle = '#000000';
      const cleanTitle = track.title.length > 32 ? track.title.substring(0, 32) + '...' : track.title;
      ctx.fillText(`${index + 1}. 《${cleanTitle}》`, padding, y + 18);

      // Speaker & Dates
      ctx.font = '11.5px sans-serif';
      ctx.fillStyle = '#333333';
      const finishText = record.finishDate ? `已聽完 (${record.finishDate})` : '未聽完';
      ctx.fillText(
        `主講：${track.speaker}${track.speakerRank ? `·${track.speakerRank}` : ''}  |  首次聆聽：${record.firstListenDate || '-'}  |  最近聆聽：${record.lastListenDate || '-'}  |  ${finishText}`,
        padding + 12,
        y + 36
      );

      // Progress %, Click count, Rating
      ctx.font = '11.5px sans-serif';
      ctx.fillStyle = '#111111';
      const stars = (record.rating && record.rating > 0) ? '★'.repeat(record.rating) + '☆'.repeat(5 - record.rating) + ` (${record.rating}星)` : '未評價';
      ctx.fillText(
        `聆聽進度：${record.progressPercent || 0}%  |  點擊次數：${record.clickCount || 1}次  |  給予評價：${stars}`,
        padding + 12,
        y + 54
      );

      // User Comment
      if (record.comment) {
        ctx.font = '11.5px "PingFang TC", "Microsoft JhengHei", sans-serif';
        ctx.fillStyle = '#555555';
        const cleanComment = record.comment.length > 42 ? record.comment.substring(0, 42) + '...' : record.comment;
        ctx.fillText(`學員心得：“ ${cleanComment} ”`, padding + 12, y + 72);
      }

      // Divider line
      ctx.beginPath();
      ctx.strokeStyle = '#e8e8e8';
      ctx.lineWidth = 1;
      ctx.moveTo(padding, y + itemH - 4);
      ctx.lineTo(width - padding, y + itemH - 4);
      ctx.stroke();

      y += itemH;
    });
  }

  // Footer
  ctx.font = 'bold 11px sans-serif';
  ctx.fillStyle = '#333333';
  ctx.fillText('繁星回聲 • 學員學習檔案卡', padding, totalHeight - 22);

  return new Promise(resolve => {
    canvas.toBlob(blob => resolve(blob!), 'image/jpeg', 0.95);
  });
}

export async function exportRatedTracksImage(
  ratedTracks: { track: Track; rating: number }[],
  userName: string,
  userRank: string
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  const width = 800;
  const padding = 60;
  const itemHeight = 110;
  const headerHeight = 220;
  const footerHeight = 120;

  const totalHeight = headerHeight + Math.max(1, ratedTracks.length) * itemHeight + footerHeight;
  canvas.width = width;
  canvas.height = totalHeight;

  // Background: Crisp high-contrast white
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, totalHeight);

  // Border frame
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#000000';
  ctx.strokeRect(20, 20, width - 40, totalHeight - 40);

  // Top Accent Bar
  ctx.fillStyle = '#000000';
  ctx.fillRect(40, 40, width - 80, 6);

  // Header Title
  ctx.font = 'bold 36px "PingFang TC", "Microsoft JhengHei", sans-serif';
  ctx.fillStyle = '#000000';
  ctx.fillText('繁星回聲', padding, 95);

  ctx.font = '14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#666666';
  ctx.fillText('AUDIO KNOWLEDGE REPOSITORY • 學習紀錄卡', padding, 120);

  // Member info
  ctx.font = 'bold 18px "PingFang TC", "Microsoft JhengHei", sans-serif';
  ctx.fillStyle = '#111111';
  ctx.fillText(`會員學員：${userName} (${userRank})`, padding, 160);

  ctx.font = '14px sans-serif';
  ctx.fillStyle = '#666666';
  ctx.fillText(`已評價錄音檔：共 ${ratedTracks.length} 首 | 匯出日期：${new Date().toLocaleDateString('zh-TW')}`, padding, 185);

  // Separator
  ctx.beginPath();
  ctx.strokeStyle = '#e0e0e0';
  ctx.lineWidth = 1;
  ctx.moveTo(padding, 205);
  ctx.lineTo(width - padding, 205);
  ctx.stroke();

  // List of tracks
  let y = headerHeight + 20;

  if (ratedTracks.length === 0) {
    ctx.font = 'italic 16px sans-serif';
    ctx.fillStyle = '#888888';
    ctx.fillText('尚無已評價的錄音檔紀錄', padding, y + 30);
    y += itemHeight;
  } else {
    ratedTracks.forEach((item, index) => {
      // index circle or number
      ctx.font = 'bold 16px sans-serif';
      ctx.fillStyle = '#000000';
      ctx.fillText(`${index + 1}.`, padding, y + 24);

      // Title
      ctx.font = 'bold 20px "PingFang TC", "Microsoft JhengHei", sans-serif';
      ctx.fillStyle = '#000000';
      const title = item.track.title.length > 20 ? item.track.title.substring(0, 20) + '...' : item.track.title;
      ctx.fillText(title, padding + 30, y + 24);

      // Speaker & Category
      ctx.font = '15px sans-serif';
      ctx.fillStyle = '#444444';
      const catText = item.track.categories?.join(', ') || item.track.category || '未分類';
      ctx.fillText(`主講：${item.track.speaker} (${item.track.speakerRank})  •  分類：[${catText}]`, padding + 30, y + 50);

      // Stars
      const stars = '★'.repeat(item.rating) + '☆'.repeat(5 - item.rating);
      ctx.font = 'bold 18px sans-serif';
      ctx.fillStyle = '#000000';
      ctx.fillText(`我的評分：${stars} (${item.rating}分)`, padding + 30, y + 76);

      // Bottom item divider
      ctx.beginPath();
      ctx.strokeStyle = '#eeeeee';
      ctx.lineWidth = 1;
      ctx.moveTo(padding, y + 95);
      ctx.lineTo(width - padding, y + 95);
      ctx.stroke();

      y += itemHeight;
    });
  }

  // Footer
  ctx.font = 'bold 13px sans-serif';
  ctx.fillStyle = '#000000';
  ctx.fillText('每一段好聲音，都是通往成功的階梯。', padding, totalHeight - 65);

  ctx.font = '12px sans-serif';
  ctx.fillStyle = '#888888';
  ctx.fillText('繁星回聲 • 專屬音訊知識庫互動平台', padding, totalHeight - 45);

  return new Promise(resolve => {
    canvas.toBlob(blob => resolve(blob!), 'image/jpeg', 0.95);
  });
}

export async function exportTrackCommentsImage(
  track: Track,
  trackComments: Comment[]
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  const width = 800;
  const padding = 60;
  const itemHeight = 100;
  const headerHeight = 250;
  const footerHeight = 120;

  const totalHeight = headerHeight + Math.max(1, trackComments.length) * itemHeight + footerHeight;
  canvas.width = width;
  canvas.height = totalHeight;

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, totalHeight);

  // Border frame
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#000000';
  ctx.strokeRect(20, 20, width - 40, totalHeight - 40);

  // Top Bar
  ctx.fillStyle = '#000000';
  ctx.fillRect(40, 40, width - 80, 6);

  // Title
  ctx.font = 'bold 36px "PingFang TC", "Microsoft JhengHei", sans-serif';
  ctx.fillStyle = '#000000';
  ctx.fillText('繁星回聲', padding, 95);

  ctx.font = '14px sans-serif';
  ctx.fillStyle = '#666666';
  ctx.fillText('AUDIO KNOWLEDGE REPOSITORY • 演講心得全覽', padding, 120);

  // Track info
  ctx.font = 'bold 22px "PingFang TC", "Microsoft JhengHei", sans-serif';
  ctx.fillStyle = '#111111';
  ctx.fillText(`《${track.title}》`, padding, 160);

  ctx.font = '15px sans-serif';
  ctx.fillStyle = '#444444';
  const trackCat = track.categories?.join(', ') || track.category || '未分類';
  ctx.fillText(`主講人：${track.speaker} (${track.speakerRank})  |  分類：${trackCat}  |  評分：★ ${track.rating}`, padding, 190);

  ctx.font = '13px sans-serif';
  ctx.fillStyle = '#777777';
  ctx.fillText(`心得總數：共 ${trackComments.length} 則心得 • 匯出時間：${new Date().toLocaleDateString('zh-TW')}`, padding, 215);

  // Line
  ctx.beginPath();
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2;
  ctx.moveTo(padding, 235);
  ctx.lineTo(width - padding, 235);
  ctx.stroke();

  // Comments
  let y = headerHeight + 20;

  if (trackComments.length === 0) {
    ctx.font = 'italic 16px sans-serif';
    ctx.fillStyle = '#888888';
    ctx.fillText('目前本篇錄音檔尚無心得。', padding, y + 30);
    y += itemHeight;
  } else {
    trackComments.forEach((c) => {
      // Author header
      ctx.font = 'bold 16px "PingFang TC", "Microsoft JhengHei", sans-serif';
      ctx.fillStyle = '#000000';
      const authorText = c.isAdmin ? `[管理員] ${c.authorName}` : `${c.authorAvatar} ${c.authorName}`;
      ctx.fillText(authorText, padding, y + 20);

      ctx.font = '12px sans-serif';
      ctx.fillStyle = '#888888';
      ctx.fillText(c.timestamp || '近期', padding + 220, y + 20);

      // Comment content
      ctx.font = '15px "PingFang TC", "Microsoft JhengHei", sans-serif';
      ctx.fillStyle = '#222222';
      const cleanContent = c.content.length > 35 ? c.content.substring(0, 35) + '...' : c.content;
      ctx.fillText(`“ ${cleanContent} ”`, padding + 10, y + 50);

      // Divider
      ctx.beginPath();
      ctx.strokeStyle = '#e5e5e5';
      ctx.lineWidth = 1;
      ctx.moveTo(padding, y + 80);
      ctx.lineTo(width - padding, y + 80);
      ctx.stroke();

      y += itemHeight;
    });
  }

  // Footer
  ctx.font = 'bold 16px sans-serif';
  ctx.fillStyle = '#000000';
  ctx.fillText('繁星回聲', padding, totalHeight - 65);

  ctx.font = '12px sans-serif';
  ctx.fillStyle = '#888888';
  ctx.fillText('本圖由系統原生排版繪製學習分享卡', padding, totalHeight - 45);

  return new Promise(resolve => {
    canvas.toBlob(blob => resolve(blob!), 'image/jpeg', 0.95);
  });
}

export async function exportTrackFullCardImage(
  track: Track,
  trackComments: Comment[]
): Promise<Blob> {
  const width = 800;
  const padding = 45;
  const contentWidth = width - padding * 2;

  // Measurement context
  const testCanvas = document.createElement('canvas');
  const testCtx = testCanvas.getContext('2d')!;

  const wrapText = (text: string, font: string, maxWidth: number): string[] => {
    testCtx.font = font;
    const lines: string[] = [];
    const paragraphs = (text || '').split('\n');
    for (const para of paragraphs) {
      if (!para.trim()) {
        lines.push('');
        continue;
      }
      let currentLine = '';
      for (let i = 0; i < para.length; i++) {
        const char = para[i];
        const testLine = currentLine + char;
        const testWidth = testCtx.measureText(testLine).width;
        if (testWidth > maxWidth && currentLine.length > 0) {
          lines.push(currentLine);
          currentLine = char;
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) lines.push(currentLine);
    }
    return lines;
  };

  // 1. Title wrapped lines
  const titleLines = wrapText(track.title, 'bold 24px "PingFang TC", "Microsoft JhengHei", sans-serif', contentWidth - 20);

  // 2. Description wrapped lines
  const descText = track.description?.trim() || '';
  const descLines = wrapText(descText, '14px "PingFang TC", "Microsoft JhengHei", sans-serif', contentWidth - 30);

  // 3. External resources
  const hasVideos = track.externalVideos && track.externalVideos.length > 0;
  const hasPpts = track.externalPpts && track.externalPpts.length > 0;
  const hasFiles = track.externalFiles && track.externalFiles.length > 0;
  const hasResources = hasVideos || hasPpts || hasFiles;
  let resourcesCount = 0;
  if (track.externalVideos) resourcesCount += track.externalVideos.length;
  if (track.externalPpts) resourcesCount += track.externalPpts.length;
  if (track.externalFiles) resourcesCount += track.externalFiles.length;

  // 4. Comments wrapped lines
  const preparedComments = trackComments.map(c => {
    const lines = wrapText(c.content, '14px "PingFang TC", "Microsoft JhengHei", sans-serif', contentWidth - 40);
    return {
      comment: c,
      lines
    };
  });

  // Calculate dynamic heights
  const headerHeight = 110 + titleLines.length * 32 + 105;
  const descHeight = 45 + descLines.length * 22 + 25;
  const resourcesHeight = hasResources ? 40 + resourcesCount * 26 + 20 : 0;

  let commentsSectionHeight = 50;
  if (preparedComments.length === 0) {
    commentsSectionHeight += 45;
  } else {
    for (const pc of preparedComments) {
      commentsSectionHeight += 36 + pc.lines.length * 21 + 18;
    }
  }

  const footerHeight = 85;
  const totalHeight = headerHeight + descHeight + resourcesHeight + commentsSectionHeight + footerHeight;

  // Real canvas
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = totalHeight;
  const ctx = canvas.getContext('2d')!;

  // Background: Pure White
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, totalHeight);

  // Outer Double Frame Border
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 3;
  ctx.strokeRect(16, 16, width - 32, totalHeight - 32);
  ctx.lineWidth = 1;
  ctx.strokeRect(21, 21, width - 42, totalHeight - 42);

  // Top Black Solid Bar
  ctx.fillStyle = '#000000';
  ctx.fillRect(35, 35, width - 70, 5);

  let currentY = 65;

  // Brand Subtitle & Date
  ctx.font = 'bold 12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#444444';
  ctx.fillText('繁星回聲 • 專屬音訊知識庫  |  資訊圖卡', padding, currentY);

  ctx.font = '12px sans-serif';
  ctx.fillStyle = '#666666';
  const dateStr = new Date().toLocaleDateString('zh-TW');
  ctx.fillText(`匯出日期：${dateStr}`, width - padding - 130, currentY);

  currentY += 28;

  // Title
  ctx.font = 'bold 24px "PingFang TC", "Microsoft JhengHei", sans-serif';
  ctx.fillStyle = '#000000';
  for (const line of titleLines) {
    ctx.fillText(`《${line}》`, padding, currentY);
    currentY += 32;
  }

  currentY += 6;

  // Metadata Box (Speaker, Rank, Category, Duration, Date, Permission)
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(padding, currentY, contentWidth, 90);

  ctx.font = 'bold 15px "PingFang TC", "Microsoft JhengHei", sans-serif';
  ctx.fillStyle = '#000000';
  const speakerText = `主講人：${track.speaker}${track.speakerRank ? `（${track.speakerRank}）` : ''}`;
  const cats = track.categories && track.categories.length > 0 ? track.categories.join('、') : (track.category || '未分類');
  ctx.fillText(`${speakerText}   |   分類：[${cats}]`, padding + 15, currentY + 28);

  ctx.font = '13px "PingFang TC", "Microsoft JhengHei", sans-serif';
  ctx.fillStyle = '#333333';
  const durationText = `時長：${track.duration || '約 10 分鐘'}   |   演講日期：${track.speechDate || '近期'}   |   權限級別：${track.requiredRank === '無' ? '公開' : track.requiredRank}`;
  ctx.fillText(durationText, padding + 15, currentY + 54);

  const seriesText = `系列：${track.series ? `${track.series} (${track.seriesOrder || '第 1 集'})` : '單篇講座'}   |   評分：★ ${track.rating || 0} (${track.ratingCount || 0}人)   |   讚數：${track.likes || 0}   |   心得：${trackComments.length}則`;
  ctx.fillText(seriesText, padding + 15, currentY + 76);

  currentY += 105;

  // Section 1: Description & Notes
  ctx.font = 'bold 15px "PingFang TC", "Microsoft JhengHei", sans-serif';
  ctx.fillStyle = '#000000';
  ctx.fillText('【 演講簡介與重點備註 】', padding, currentY);
  currentY += 18;

  // Description content box
  const descBoxHeight = descLines.length * 22 + 16;
  ctx.fillStyle = '#f8f8f8';
  ctx.fillRect(padding, currentY, contentWidth, descBoxHeight);
  ctx.strokeStyle = '#cccccc';
  ctx.lineWidth = 1;
  ctx.strokeRect(padding, currentY, contentWidth, descBoxHeight);

  ctx.font = '14px "PingFang TC", "Microsoft JhengHei", sans-serif';
  ctx.fillStyle = '#222222';
  let descLineY = currentY + 18;
  for (const line of descLines) {
    ctx.fillText(line, padding + 12, descLineY);
    descLineY += 22;
  }

  currentY += descBoxHeight + 20;

  // Section 2: External Resources (if any)
  if (hasResources) {
    ctx.font = 'bold 15px "PingFang TC", "Microsoft JhengHei", sans-serif';
    ctx.fillStyle = '#000000';
    ctx.fillText('【 相關學習補充教材與連結 】', padding, currentY);
    currentY += 22;

    if (track.externalVideos) {
      for (const v of track.externalVideos) {
        ctx.font = '13px sans-serif';
        ctx.fillStyle = '#111111';
        ctx.fillText(`• [影片] ${v.name || '影片資源'}: ${v.url}`, padding + 12, currentY);
        currentY += 24;
      }
    }
    if (track.externalPpts) {
      for (const p of track.externalPpts) {
        ctx.font = '13px sans-serif';
        ctx.fillStyle = '#111111';
        ctx.fillText(`• [簡報] ${p.name || 'PPT簡報'}: ${p.url}`, padding + 12, currentY);
        currentY += 24;
      }
    }
    if (track.externalFiles) {
      for (const f of track.externalFiles) {
        ctx.font = '13px sans-serif';
        ctx.fillStyle = '#111111';
        ctx.fillText(`• [教材] ${f.name || '教材檔案'}: ${f.url}`, padding + 12, currentY);
        currentY += 24;
      }
    }
    currentY += 15;
  }

  // Section 3: Netizens Comments Section
  ctx.font = 'bold 15px "PingFang TC", "Microsoft JhengHei", sans-serif';
  ctx.fillStyle = '#000000';
  ctx.fillText(`【 網友心得回饋與互動 】（共 ${trackComments.length} 則）`, padding, currentY);
  currentY += 20;

  if (trackComments.length === 0) {
    ctx.font = 'italic 13px sans-serif';
    ctx.fillStyle = '#777777';
    ctx.fillText('本篇演講目前尚無心得。', padding + 12, currentY + 15);
    currentY += 40;
  } else {
    for (let i = 0; i < preparedComments.length; i++) {
      const { comment, lines } = preparedComments[i];

      // Comment Author & Timestamp
      ctx.font = 'bold 14px "PingFang TC", "Microsoft JhengHei", sans-serif';
      ctx.fillStyle = '#000000';
      const roleBadge = comment.authorRank ? `[${comment.authorRank}] ` : '';
      const replyBadge = comment.replyToAuthor ? ` (回覆 @${comment.replyToAuthor})` : '';
      ctx.fillText(`#${i + 1}  ${roleBadge}${comment.authorName}${replyBadge}`, padding + 8, currentY);

      ctx.font = '12px sans-serif';
      ctx.fillStyle = '#777777';
      ctx.fillText(comment.timestamp || '近期', width - padding - 120, currentY);

      currentY += 20;

      // Comment Lines
      ctx.font = '14px "PingFang TC", "Microsoft JhengHei", sans-serif';
      ctx.fillStyle = '#222222';
      for (const line of lines) {
        ctx.fillText(line, padding + 20, currentY);
        currentY += 21;
      }

      // Divider Line between comments
      ctx.beginPath();
      ctx.strokeStyle = '#e0e0e0';
      ctx.lineWidth = 1;
      ctx.moveTo(padding + 5, currentY + 8);
      ctx.lineTo(width - padding - 5, currentY + 8);
      ctx.stroke();

      currentY += 18;
    }
  }

  // Footer Accent Bar
  ctx.fillStyle = '#000000';
  ctx.fillRect(35, totalHeight - 55, width - 70, 2);

  ctx.font = 'bold 12px sans-serif';
  ctx.fillStyle = '#000000';
  ctx.fillText('繁星回聲 • 專屬音訊知識庫互動平台', padding, totalHeight - 34);

  ctx.font = '11px sans-serif';
  ctx.fillStyle = '#666666';
  ctx.fillText('每一段好聲音，都是通往成功的階梯', width - padding - 210, totalHeight - 34);

  return new Promise(resolve => {
    canvas.toBlob(blob => resolve(blob!), 'image/jpeg', 0.95);
  });
}

export async function shareOrDownloadImage(blob: Blob, filename: string, title: string) {
  if (typeof navigator !== 'undefined' && typeof navigator.canShare === 'function') {
    try {
      const file = new File([blob], filename, { type: 'image/jpeg' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title,
          text: '來自繁星回聲的演講完整資訊圖卡'
        });
        return;
      }
    } catch {
      // fallback to download if cancelled or fails
    }
  }

  // Fallback: download
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Requirement 10: 匯出個人圖卡 (黑白圖、緊密簡易排版、所有資料、包含生命靈數圖表、呼叫行動裝置選單)
 */
export async function exportPersonalProfileCard(user: UserProfile): Promise<Blob> {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d')!;

  const width = 760;
  const padding = 36;
  const totalHeight = 840;

  canvas.width = width;
  canvas.height = totalHeight;

  // 1. Black & White high-contrast background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, totalHeight);

  // Outer frame
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#000000';
  ctx.strokeRect(14, 14, width - 28, totalHeight - 28);

  // Top header bar
  ctx.fillStyle = '#000000';
  ctx.fillRect(28, 28, width - 56, 4);

  // Title: 繁星回聲 • 個人學員檔案圖卡
  ctx.font = 'bold 26px "PingFang TC", "Microsoft JhengHei", sans-serif';
  ctx.fillStyle = '#000000';
  ctx.fillText('繁星回聲 • 個人學員檔案圖卡', padding, 64);

  ctx.font = '12px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  ctx.fillStyle = '#555555';
  const now = new Date();
  const dateStr = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;
  ctx.fillText(`製表日期：${dateStr}  |  身分識別檔案  |  繁星團隊專屬學習卡`, padding, 86);

  // Top divider line
  ctx.beginPath();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#000000';
  ctx.moveTo(padding, 100);
  ctx.lineTo(width - padding, 100);
  ctx.stroke();

  // Section 1: 基本資料 (緊密簡易排版)
  ctx.font = 'bold 16px "PingFang TC", "Microsoft JhengHei", sans-serif';
  ctx.fillStyle = '#000000';
  ctx.fillText('【 學員基本檔案資料 】', padding, 126);

  // Profile Data Box
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1;
  ctx.strokeRect(padding, 138, width - padding * 2, 286);

  // Row 1: 姓名 & 獎銜
  const rowH = 34;
  let py = 164;
  const col1 = padding + 16;
  const col2 = padding + (width - padding * 2) / 2 + 10;

  ctx.font = 'bold 15px "PingFang TC", "Microsoft JhengHei", sans-serif';
  ctx.fillStyle = '#000000';
  ctx.fillText(`學員姓名：${user.name || '-'}`, col1, py);
  ctx.fillText(`最高獎銜：${effectiveMemberRank(user)}`, col2, py);

  // Horizontal divider
  py += 10;
  ctx.beginPath();
  ctx.strokeStyle = '#e2e8f0';
  ctx.moveTo(padding + 10, py);
  ctx.lineTo(width - padding - 10, py);
  ctx.stroke();

  // Row 2: 安麗編號 & 所屬中心
  py += 24;
  ctx.font = '13px "PingFang TC", "Microsoft JhengHei", sans-serif';
  ctx.fillStyle = '#111111';
  ctx.fillText(`安麗編號：${user.amwayId || '-'}`, col1, py);
  ctx.fillText(`所屬中心：${user.center || '無'}`, col2, py);

  // Divider
  py += 10;
  ctx.beginPath();
  ctx.moveTo(padding + 10, py);
  ctx.lineTo(width - padding - 10, py);
  ctx.stroke();

  // Row 3: 居住地區 & 推薦人
  py += 24;
  ctx.fillText(`居住地區：${user.residence || '-'}`, col1, py);
  ctx.fillText(`推薦人：${user.sponsor || '-'}`, col2, py);

  // Divider
  py += 10;
  ctx.beginPath();
  ctx.moveTo(padding + 10, py);
  ctx.lineTo(width - padding - 10, py);
  ctx.stroke();

  // Row 4: 初次認識 & 留在安麗原因
  py += 24;
  ctx.fillText(`初次認識：${user.joinReason || '事業'} • 留安麗：${(user as any).stayReason || '事業'}`, col1, py);
  ctx.fillText(`上手白金：${user.platinumUpline || '-'}`, col2, py);

  // Divider
  py += 10;
  ctx.beginPath();
  ctx.moveTo(padding + 10, py);
  ctx.lineTo(width - padding - 10, py);
  ctx.stroke();

  // Row 5: 上手鑽石 & 註冊日期
  py += 24;
  ctx.fillText(`上手鑽石：${user.diamondUpline || '-'}`, col1, py);
  ctx.fillText(`註冊日期：${user.registerDate || '-'}`, col2, py);

  // Divider
  py += 10;
  ctx.beginPath();
  ctx.moveTo(padding + 10, py);
  ctx.lineTo(width - padding - 10, py);
  ctx.stroke();

  // Row 6: 所屬星座 & 主命數
  py += 24;
  ctx.fillText(`所屬星座：${user.zodiac || '-'}`, col1, py);
  ctx.fillText(`主命數：${user.lifeNumber ? `${user.lifeNumber} 號人` : '-'}`, col2, py);

  // Divider
  py += 10;
  ctx.beginPath();
  ctx.moveTo(padding + 10, py);
  ctx.lineTo(width - padding - 10, py);
  ctx.stroke();

  // Row 7: 電子信箱
  py += 24;
  ctx.fillText(`綁定信箱：${user.email || '-'}`, col1, py);
  ctx.fillText(`系統權限：${user.role || (user.isContributor ? '貢獻者' : '繁星家人')}`, col2, py);

  // Section 2: 生命靈數圖表 (Numerology Chart & 3x3 Grid)
  const numY = 448;
  ctx.font = 'bold 16px "PingFang TC", "Microsoft JhengHei", sans-serif';
  ctx.fillStyle = '#000000';
  ctx.fillText('【 生命靈數與九宮格命盤圖表 】', padding, numY);

  const numResult = calculateNumerology(user.birthday || '');
  const talentNum = numResult?.talentNumber || user.talentNumber || '-';
  const lifeNum = numResult?.lifeNumber || user.lifeNumber || '-';
  const zodiacStr = numResult?.zodiac || user.zodiac || '-';
  const zodiacNum = numResult?.zodiacNumber || '-';
  const birthdayNum = numResult?.birthdayNumber || '-';
  const digitCounts = numResult?.digitCounts || { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 };

  // Numerology Outer Box
  const boxTop = numY + 12;
  const boxHeight = 290;
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1;
  ctx.strokeRect(padding, boxTop, width - padding * 2, boxHeight);

  // Left column: Numerology attributes
  const leftX = padding + 20;
  ctx.font = 'bold 14px "PingFang TC", "Microsoft JhengHei", sans-serif';
  ctx.fillStyle = '#000000';
  ctx.fillText(`西方星座：${zodiacStr} (星座數：${zodiacNum})`, leftX, boxTop + 40);

  ctx.font = 'bold 14px "PingFang TC", "Microsoft JhengHei", sans-serif';
  ctx.fillText(`生日數 (Birthday)：${birthdayNum} (日期相加至個位)`, leftX, boxTop + 75);

  ctx.font = 'bold 14px "PingFang TC", "Microsoft JhengHei", sans-serif';
  ctx.fillText(`天賦數 (Talent)：${talentNum}`, leftX, boxTop + 110);

  ctx.font = 'bold 16px "PingFang TC", "Microsoft JhengHei", sans-serif';
  ctx.fillText(`加總主命數：${lifeNum} 號人`, leftX, boxTop + 150);

  ctx.font = '12px "PingFang TC", "Microsoft JhengHei", sans-serif';
  ctx.fillStyle = '#444444';
  ctx.fillText(`命盤核心：${lifeNum} 數代表本質天賦與人生課題`, leftX, boxTop + 185);
  ctx.fillText(`九宮格包含先天數黑圈、生日數、星座數`, leftX, boxTop + 215);
  ctx.fillText(`天賦數綠圈與主命數紅圈完整解析圖盤`, leftX, boxTop + 245);

  // Vertical separator between left info and 3x3 grid
  ctx.beginPath();
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1;
  ctx.moveTo(padding + 295, boxTop);
  ctx.lineTo(padding + 295, boxTop + boxHeight);
  ctx.stroke();

  // Right column: 3x3 Numerology Grid
  const gridStartX = padding + 325;
  const gridStartY = boxTop + 25;
  const cellSize = 72;

  // Draw 3x3 Grid Outline
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(gridStartX, gridStartY, cellSize * 3, cellSize * 3);

  // Draw inner lines
  ctx.beginPath();
  ctx.lineWidth = 1;
  ctx.strokeStyle = '#000000';
  // Vertical lines
  ctx.moveTo(gridStartX + cellSize, gridStartY);
  ctx.lineTo(gridStartX + cellSize, gridStartY + cellSize * 3);
  ctx.moveTo(gridStartX + cellSize * 2, gridStartY);
  ctx.lineTo(gridStartX + cellSize * 2, gridStartY + cellSize * 3);
  // Horizontal lines
  ctx.moveTo(gridStartX, gridStartY + cellSize);
  ctx.lineTo(gridStartX + cellSize * 3, gridStartY + cellSize);
  ctx.moveTo(gridStartX, gridStartY + cellSize * 2);
  ctx.lineTo(gridStartX + cellSize * 3, gridStartY + cellSize * 2);
  ctx.stroke();

  // Grid Layout standard:
  // row 0: 1, 4, 7
  // row 1: 2, 5, 8
  // row 2: 3, 6, 9
  const gridLayout = [
    [1, 4, 7],
    [2, 5, 8],
    [3, 6, 9]
  ];

  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      const num = gridLayout[r][c];
      const count = digitCounts[num] || 0;
      const isLife = Number(lifeNum) === num;
      const isBirthday = Number(birthdayNum) === num;
      const isZodiac = Number(zodiacNum) === num;
      const cellCenterX = gridStartX + c * cellSize + cellSize / 2;
      const cellCenterY = gridStartY + r * cellSize + cellSize / 2;

      // Draw number in center
      ctx.font = 'bold 22px "PingFang TC", "Microsoft JhengHei", sans-serif';
      ctx.fillStyle = count > 0 || isLife || isBirthday || isZodiac ? '#000000' : '#bbbbbb';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(num), cellCenterX, cellCenterY);

      let rRadius = 18;

      // If present in birth date (先天數), draw rings or count
      if (count > 0) {
        for (let i = 0; i < Math.min(count, 3); i++) {
          ctx.beginPath();
          ctx.lineWidth = 1;
          ctx.strokeStyle = '#000000';
          ctx.arc(cellCenterX, cellCenterY, rRadius, 0, Math.PI * 2);
          ctx.stroke();
          rRadius += 3.5;
        }
        ctx.font = 'bold 10px sans-serif';
        ctx.fillStyle = '#000000';
        ctx.fillText(`(${count})`, cellCenterX + 22, cellCenterY - 18);
      }

      // If Birthday number, draw ring
      if (isBirthday) {
        ctx.beginPath();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#333333';
        ctx.arc(cellCenterX, cellCenterY, rRadius, 0, Math.PI * 2);
        ctx.stroke();
        rRadius += 3.5;
      }

      // If Zodiac number, draw ring
      if (isZodiac) {
        ctx.beginPath();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#555555';
        ctx.arc(cellCenterX, cellCenterY, rRadius, 0, Math.PI * 2);
        ctx.stroke();
        rRadius += 3.5;
      }

      // If life number, draw prominent bold outer circle
      if (isLife) {
        ctx.beginPath();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = '#000000';
        ctx.arc(cellCenterX, cellCenterY, Math.max(rRadius, 25), 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  // Reset text alignment
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  // Bottom Footer
  ctx.fillStyle = '#000000';
  ctx.fillRect(28, totalHeight - 48, width - 56, 2);

  ctx.font = 'bold 12px sans-serif';
  ctx.fillStyle = '#000000';
  ctx.fillText('繁星回聲 • 團隊專屬學習成長平台', padding, totalHeight - 26);

  ctx.font = '11px sans-serif';
  ctx.fillStyle = '#666666';
  ctx.fillText('精準學習 · 實戰傳承 · 邁向卓越', width - padding - 180, totalHeight - 26);

  return new Promise(resolve => {
    canvas.toBlob(blob => resolve(blob!), 'image/jpeg', 0.92);
  });
}

/**
 * Requirement 10: 呼叫行動裝置選單匯出個人圖卡 (JPEG 檔案)
 */
export async function shareOrDownloadProfileCard(blob: Blob, userName: string) {
  const filename = `繁星回聲_${userName || '學員'}_個人圖卡.jpg`;
  const file = new File([blob], filename, { type: 'image/jpeg' });

  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({
        files: [file],
        title: '繁星回聲 - 個人學員檔案圖卡',
        text: `${userName} 的個人學員檔案圖卡（繁星回聲）`
      });
      return;
    } catch {
      // User cancelled share or aborted, fallback to direct download
    }
  }

  // Fallback: direct download
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
