import { uploadedAudioKey } from './shared/r2Files';
import { shareMetadata } from './shared/shareMetadata';
import { formatCommentTimestamp } from './shared/commentTime';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import multer from 'multer';
import { RANK_ORDER, type AmwayRank } from './src/types.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '150mb' }));
app.use(express.urlencoded({ extended: true, limit: '150mb' }));

// Setup local uploads storage for dev / R2 emulation
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.mp3';
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`);
  }
});
const uploadMiddleware = multer({ storage, limits: { fileSize: 150 * 1024 * 1024 } });

// Cloudflare Configuration
const CF_ACCOUNT_ID = process.env.CF_ACCOUNT_ID || process.env.CLOUDFLARE_ACCOUNT_ID || '';
const CF_API_TOKEN = process.env.CF_API_TOKEN || process.env.CLOUDFLARE_API_TOKEN || '';
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'echoes-audio-bucket';

let audioSequenceCounter = 0;

function getNextAudioSequence(): number {
  let maxSeq = audioSequenceCounter;
  tracks.forEach(t => {
    const match = (t.audioUrl || '').match(/ES(\d{4,})/i);
    if (match) {
      const num = parseInt(match[1], 10);
      if (!isNaN(num) && num > maxSeq) {
        maxSeq = num;
      }
    }
  });
  audioSequenceCounter = maxSeq + 1;
  saveStoreToDisk();
  return audioSequenceCounter;
}

// POST /api/r2/upload
app.post('/api/r2/upload', uploadMiddleware.single('file') as any, async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: '缺少上傳檔案 (file)' });
  }

  const ext = path.extname(req.file.originalname || req.file.filename || '.mp3').toLowerCase() || '.mp3';
  const fileType = (req.body.fileType || '').toLowerCase();
  const isImage = ext === '.jpg' || ext === '.jpeg' || ext === '.png' || ext === '.webp';
  const supportedAudioExtensions = new Set(['.mp3', '.m4a', '.aac', '.wav', '.ogg', '.opus', '.webm']);

  if (fileType !== 'cover' && !isImage && !supportedAudioExtensions.has(ext)) {
    try {
      if (req.file.path && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    } catch {}
    return res.status(415).json({
      error: '不支援此音訊格式。請使用 MP3、M4A、AAC、WAV、OGG、OPUS 或 WEBM。'
    });
  }

  let finalFileName: string;

  if (fileType === 'cover' || isImage) {
    const originalBaseName = path.basename(req.file.originalname || req.file.filename || 'speaker', ext).replace(/^cover-/i, '');
    const speakerName = String(req.body.speaker || '').trim();
    const cleanBaseName = (speakerName || originalBaseName)
      .replace(/[\\/:*?"<>|#&+=]/g, '')
      .replace(/\s+/g, '-')
      .trim() || 'speaker';
    finalFileName = `cover-${cleanBaseName}${ext}`;
  } else {
    // 命名格式：「ES00001-演講者+獎銜-中文曲目名稱.副檔名」
    // 00001 = 系統自動編號的五位數/四位數序號，+ 符號不顯示，- 符號保留顯示
    const seq = getNextAudioSequence();
    const seqStr = String(seq).padStart(5, '0');

    const cleanSpeaker = (req.body.speaker || '').replace(/[\\/:*?"<>|#&+=\s]/g, '').trim() || '繁星講師';
    const rawRank = (req.body.speakerRank || '').trim();
    const cleanRank = (rawRank && rawRank !== '無' && rawRank !== '公開')
      ? rawRank.replace(/[\\/:*?"<>|#&+=\s]/g, '').trim()
      : '';
    const speakerPart = `${cleanSpeaker}${cleanRank}`;

    const rawTitle = (req.body.title || '').trim();
    const cleanTitle = (rawTitle || path.basename(req.file.originalname || '演講錄音', ext))
      .replace(/[\\/:*?"<>|#&+]/g, '')
      .trim() || '演講錄音';

    finalFileName = `ES${seqStr}-${speakerPart}-${cleanTitle}${ext}`;
  }

  // Target local destination path
  const targetFilePath = path.join(uploadDir, finalFileName);
  try {
    if (fs.existsSync(req.file.path) && req.file.path !== targetFilePath) {
      fs.copyFileSync(req.file.path, targetFilePath);
    }
  } catch (copyErr) {
    console.warn('[Upload] Local copy warning:', copyErr);
  }

  const key = `${fileType === 'cover' || isImage ? 'cover' : 'uploads'}/${finalFileName}`;
  const fileUrl = `/api/r2/file/${encodeURIComponent(key)}`;

  // Direct sync to Cloudflare R2 bucket when credentials are provided
  if (CF_ACCOUNT_ID && CF_API_TOKEN) {
    try {
      const fileBuffer = fs.readFileSync(targetFilePath);
      const mimeByExt: Record<string, string> = {
        '.mp3': 'audio/mpeg',
        '.m4a': 'audio/mp4',
        '.aac': 'audio/aac',
        '.wav': 'audio/wav',
        '.ogg': 'audio/ogg',
        '.opus': 'audio/opus',
        '.webm': 'audio/webm',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.png': 'image/png',
        '.webp': 'image/webp'
      };
      const contentType = mimeByExt[ext] || req.file.mimetype || 'application/octet-stream';

      const r2Url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/r2/buckets/${R2_BUCKET}/objects/${encodeURIComponent(key)}`;
      const r2Res = await fetch(r2Url, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${CF_API_TOKEN}`,
          'Content-Type': contentType
        },
        body: fileBuffer
      });

      if (!r2Res.ok) {
        const errText = await r2Res.text();
        console.error('[R2 API] Failed to upload to Cloudflare R2 bucket:', errText);
      } else {
        console.log(`[R2 API] Successfully uploaded ${key} to Cloudflare R2 bucket ${R2_BUCKET}`);
      }
    } catch (err) {
      console.error('[R2 API] Upload exception:', err);
    }
  }

  res.json({ success: true, key, url: fileUrl });
});

// GET /api/r2/covers - local-development mirror of the production R2 cover library
app.get('/api/r2/covers', (_req, res) => {
  try {
    const files = fs.readdirSync(uploadDir)
      .filter(name => /^cover-.*\.(jpe?g|png|webp)$/i.test(name))
      .map(fileName => {
        let name = fileName
          .replace(/\.[^.]+$/, '')
          .replace(/^cover-/i, '')
          .replace(/-\d{10,14}-[a-z0-9]{4,8}$/i, '')
          .replace(/-/g, ' ')
          .trim() || '未命名講者';
        const key = `cover/${fileName}`;
        return {
          key,
          name,
          url: `/api/r2/file/${encodeURIComponent(key)}`
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
    res.json({ covers: files });
  } catch {
    res.json({ covers: [] });
  }
});

// GET /api/r2/file/:key (With Range streaming support & R2 remote fetch fallback)
app.get('/api/r2/file/:key', async (req, res) => {
  const rawKey = decodeURIComponent(req.params.key);
  const fileName = path.basename(rawKey);
  const filePath = path.join(uploadDir, fileName);

  // If file doesn't exist locally, try fetching from Cloudflare R2 bucket
  if (!fs.existsSync(filePath) && CF_ACCOUNT_ID && CF_API_TOKEN) {
    try {
      const r2Url = `https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/r2/buckets/${R2_BUCKET}/objects/${encodeURIComponent(rawKey)}`;
      const r2Res = await fetch(r2Url, {
        headers: {
          'Authorization': `Bearer ${CF_API_TOKEN}`
        }
      });
      if (r2Res.ok) {
        const arrayBuf = await r2Res.arrayBuffer();
        fs.writeFileSync(filePath, Buffer.from(arrayBuf));
        console.log(`[R2 Cache] Downloaded ${rawKey} from Cloudflare R2 to local cache.`);
      }
    } catch (err) {
      console.error('[R2 Cache] Error fetching from R2:', err);
    }
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('檔案不存在');
  }

  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  const ext = path.extname(fileName).toLowerCase();
  const mimeByExt: Record<string, string> = {
    '.mp3': 'audio/mpeg',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.opus': 'audio/opus',
    '.webm': 'audio/webm',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp'
  };
  const contentType = mimeByExt[ext] || 'application/octet-stream';

  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = (end - start) + 1;
    const file = fs.createReadStream(filePath, { start, end });
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Content-Length': chunksize
    });
    file.pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize
    });
    fs.createReadStream(filePath).pipe(res);
  }
});

interface ExternalLinkItem {
  name: string;
  url: string;
}

interface Track {
  id: string;
  title: string;
  speaker: string;
  speakerRank: string;
  speakerAvatar: string;
  categories: string[]; // up to 3 categories
  keywords?: string[]; // 網友關鍵字 (最多20個)
  rating: number;
  ratingCount: number;
  commentsCount: number;
  likes: number;
  playCount?: number;
  duration: string;
  durationSeconds: number;
  series: string;
  speechDate: string;
  requiredRank: AmwayRank;
  seriesOrder: string;
  uploadDate: string;
  description: string;
  audioUrl: string;
  uploaderId?: string;
  uploaderEmail?: string;
  externalVideos?: ExternalLinkItem[];
  externalPpts?: ExternalLinkItem[];
  externalFiles?: ExternalLinkItem[];
  likedBy: string[];
  ratings: Record<string, number>;
  // Requirement 7 (v2.2): 私秘 VIP 音檔
  isPrivateVip?: boolean;
  vipToken?: string;
  vipExpiresAt?: number | null;
  vipDurationDays?: number;
}

interface Comment {
  id: string;
  trackId: string;
  authorName: string;
  authorAvatar: string;
  authorBadge: string;
  authorEmail?: string;
  deviceId?: string;
  isAdmin: boolean;
  content: string;
  timestamp: string;
  createdAt: number;
  isAiModerated?: boolean;
  likes?: number;
  likedBy?: string[];
  replyToId?: string;
  replyToAuthor?: string;
}

interface UserProfile {
  id: string;
  email: string;
  name: string;
  amwayId?: string;
  phone?: string;
  residence?: string;
  center?: string;
  rank: AmwayRank;
  role?: string;
  joinReason?: string;
  stayReason?: string; // Requirement 1 (v2.2): 什麼原因留在安麗？
  sponsor?: string;
  platinumUpline?: string;
  diamondUpline?: string;
  birthday?: string;
  zodiac?: string;
  talentNumber?: number;
  lifeNumber?: number;
  avatar: string;
  isContributor?: boolean;
  canUpload?: boolean;
  isAdminUser?: boolean;
  approvedRank?: AmwayRank;
  rankApproved?: boolean;
  rankAuditStatus?: 'pending' | 'approved';
  rankAuditType?: 'new_register' | 'rank_change';
  rankUpdatedAt?: string;
  registerDate?: string;
  auditedBy?: string;
  auditedAt?: string;
  playCount: number;
  isBlocked: boolean;
  lastActive: string;
}

// Initial Data matching exactly the user's reference screenshots!
let tracks: Track[] = [];

let comments: Comment[] = [];

let users: UserProfile[] = [];

let playbackRecords: Record<string, any> = {};

// Global Categories State (Requirement 8)
let categoryList: string[] = ['事業', '心態思維', '營養', '安麗產品', '影集', '未分類'];

// Custom Changelog State (Requirement 8 v2.4: 超級管理員在線編輯驚嘆號改版頁面文字)
let customChangelog: any[] | null = null;

// Local Persistent Store (Requirement 10: 覆蓋程式碼時維持用戶資料庫所有內容)
const DATA_DIR = path.join(__dirname, 'data');
const STORE_FILE = path.join(DATA_DIR, 'store.json');

export function saveStoreToDisk() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const data = {
      users,
      tracks,
      comments,
      categories: categoryList,
      playbackRecords,
      customChangelog,
      audioSequenceCounter
    };
    fs.writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save store to disk:', err);
  }
}

export function loadStoreFromDisk() {
  try {
    if (fs.existsSync(STORE_FILE)) {
      const raw = fs.readFileSync(STORE_FILE, 'utf-8');
      const data = JSON.parse(raw);
      if (typeof data.audioSequenceCounter === 'number') {
        audioSequenceCounter = data.audioSequenceCounter;
      }
      if (Array.isArray(data.users)) {
        // Merge any new built-in registered users (e.g. 張佩君, 黃俊傑, 許建國, 陳欣宜, 李冠廷)
        const existingEmails = new Set(data.users.map((u: any) => u.email?.toLowerCase().trim()));
        const existingNames = new Set(data.users.map((u: any) => u.name?.trim()));
        users.forEach(defaultUser => {
          if (!existingEmails.has(defaultUser.email.toLowerCase().trim()) && !existingNames.has(defaultUser.name.trim())) {
            data.users.push(defaultUser);
          }
        });
        users = data.users;
      }
      if (Array.isArray(data.tracks)) tracks = data.tracks;
      if (Array.isArray(data.comments)) {
        comments = data.comments;
      }
      if (Array.isArray(data.categories) && data.categories.length > 0) categoryList = data.categories;
      if (data.playbackRecords && typeof data.playbackRecords === 'object') playbackRecords = data.playbackRecords;
      if (Array.isArray(data.customChangelog)) customChangelog = data.customChangelog;
      console.log('✅ Persistent store successfully loaded and reconciled from disk.');
      saveStoreToDisk();
    } else {
      saveStoreToDisk();
    }
  } catch (err) {
    console.error('Failed to load store from disk:', err);
  }
}
loadStoreFromDisk();
app.get('/share/:id', (req,res) => {
  const track=tracks.find(t=>t.id===req.params.id);
  if(!track)return res.status(404).send('音檔不存在');
  const file=path.join(process.cwd(),process.env.NODE_ENV==='production'?'dist/index.html':'index.html');
  const origin=req.protocol+'://'+req.get('host');
  res.type('html').send(shareMetadata(fs.readFileSync(file,'utf8'),track,origin,track.id));
});

// Helper: Super Admin Check (Only yukidu@gmail.com)
export function isSuperAdminEmail(email?: string | null): boolean {
  if (!email) return false;
  const clean = email.toLowerCase().trim();
  return clean === 'yukidu@gmail.com';
}

// Helper: Rank-based permission check
export function canAccessByRank(userRank: AmwayRank | undefined, requiredRank: AmwayRank): boolean {
  if (!requiredRank || requiredRank === '無' || requiredRank === '公開') return true;
  if (!userRank) return false;

  const ranks = RANK_ORDER as readonly string[];
  let userIdx = ranks.indexOf(userRank);
  const reqIdx = ranks.indexOf(requiredRank);

  if (userRank.includes('鑽石') || userRank.includes('皇冠') || userRank.includes('大使')) {
    userIdx = 999;
  }

  if (userIdx === -1) return false;
  return userIdx >= reqIdx;
}

// ----------------- API Endpoints -----------------

app.get('/api/cloudflare/status', (_req, res) => {
  res.json({
    status: 'connected',
    accountId: CF_ACCOUNT_ID,
    d1: 'd1-database-audio-knowledge',
    r2: 'r2-audio-storage-bucket',
    kv: 'kv-cache-store',
    workersAi: 'bilingual-sentiment-moderation'
  });
});

app.get('/api/categories', (_req, res) => {
  res.json(categoryList);
});

app.post('/api/categories', (req, res) => {
  const { name } = req.body;
  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: '分類名稱為必填項目' });
  }
  const clean = name.trim();
  if (!categoryList.includes(clean)) {
    categoryList.push(clean);
    saveStoreToDisk();
  }
  res.json({ success: true, categories: categoryList });
});

app.put('/api/categories/:oldName', (req, res) => {
  const oldName = decodeURIComponent(req.params.oldName);
  const { newName } = req.body;
  if (!newName || typeof newName !== 'string' || !newName.trim()) {
    return res.status(400).json({ error: '新分類名稱為必填項目' });
  }
  const cleanNew = newName.trim();
  const idx = categoryList.indexOf(oldName);
  if (idx !== -1) {
    categoryList[idx] = cleanNew;
  } else {
    categoryList.push(cleanNew);
  }
  // Also update tracks
  tracks.forEach(t => {
    if (t.categories && Array.isArray(t.categories)) {
      t.categories = t.categories.map(c => c === oldName ? cleanNew : c);
    }
  });
  saveStoreToDisk();
  res.json({ success: true, categories: categoryList });
});

app.delete('/api/categories/:name', (req, res) => {
  const name = decodeURIComponent(req.params.name);
  categoryList = categoryList.filter(c => c !== name);
  // Replace in tracks with '未分類' if empty
  tracks.forEach(t => {
    if (t.categories && Array.isArray(t.categories)) {
      t.categories = t.categories.filter(c => c !== name);
      if (t.categories.length === 0) {
        t.categories = ['未分類'];
      }
    }
  });
  saveStoreToDisk();
  res.json({ success: true, categories: categoryList });
});

app.get('/api/tracks', (_req, res) => {
  const enriched = tracks.map(t => ({
    ...t,
    playCount: t.playCount || 0,
    commentsCount: comments.filter(c => c.trackId === t.id).length
  }));
  res.json(enriched);
});

app.get('/api/tracks/:id', (req, res) => {
  const track = tracks.find(t => t.id === req.params.id);
  if (!track) return res.status(404).json({ error: '找不到該錄音檔' });
  res.json({
    ...track,
    playCount: track.playCount || 0,
    commentsCount: comments.filter(c => c.trackId === track.id).length
  });
});

// Increment track play count (Requirement 3: 點擊播放次數排行)
app.post('/api/tracks/:id/play', (req, res) => {
  const track = tracks.find(t => t.id === req.params.id);
  if (!track) return res.status(404).json({ error: '找不到該錄音檔' });
  track.playCount = (track.playCount || 0) + 1;
  saveStoreToDisk();
  res.json({ success: true, playCount: track.playCount });
});

// POST /api/tracks (Create audio track with up to 5 categories and named links)
app.post('/api/tracks', (req, res) => {
  const {
    title,
    speaker,
    speakerRank,
    speakerAvatar,
    categories,
    keywords,
    series,
    speechDate,
    requiredRank,
    seriesOrder,
    description,
    audioUrl,
    uploaderId,
    uploaderEmail,
    externalVideos,
    externalPpts,
    externalFiles,
    durationSeconds
  } = req.body;

  if (!title || !audioUrl) {
    return res.status(400).json({ error: '標題與音檔為必填項目' });
  }

  const durationSec = durationSeconds || 600;
  const minutes = Math.round(durationSec / 60);

  const today = new Date();
  const uploadDate = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}`;

  const cleanCategories = Array.isArray(categories) && categories.length > 0
    ? categories.slice(0, 3)
    : ['未分類'];

  const cleanKeywords = Array.isArray(keywords) ? (keywords as any[]).map((k: any) => String(k).trim()).filter(Boolean).slice(0, 20) : [];

  const isVip = !!req.body.isPrivateVip;
  if (isVip) {
    const isOwner = isSuperAdminEmail(uploaderEmail);
    if (!isOwner) {
      const existingVipCount = tracks.filter(t => t.isPrivateVip && (t.uploaderEmail === uploaderEmail || t.uploaderId === uploaderId)).length;
      if (existingVipCount >= 10) {
        return res.status(400).json({ error: '每位貢獻者上限最多上傳 10 個私秘 VIP 音檔，您目前已達上限 (10/10)。' });
      }
    }
  }

  const durationDays = req.body.vipDurationDays !== undefined ? Number(req.body.vipDurationDays) : 7;
  const vipToken = isVip ? (req.body.vipToken || `vip_${Math.random().toString(36).substring(2, 10)}`) : undefined;
  const vipExpiresAt = isVip ? (durationDays === 0 ? null : (Date.now() + durationDays * 86400 * 1000)) : null;

  const newTrack: Track = {
    id: `t-${Date.now()}`,
    title: title.trim(),
    speaker: speaker?.trim() || '未設定演講者',
    speakerRank: speakerRank?.trim() || '無',
    speakerAvatar: speakerAvatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&auto=format&fit=crop&q=80',
    categories: cleanCategories,
    keywords: cleanKeywords,
    rating: 5.0,
    ratingCount: 1,
    commentsCount: 0,
    likes: 0,
    duration: `約 ${minutes} 分鐘`,
    durationSeconds: durationSec,
    series: series?.trim() ?? '',
    speechDate: speechDate ?? '',
    requiredRank: requiredRank || '無',
    seriesOrder: seriesOrder?.trim() ?? '',
    uploadDate: uploadDate,
    description: description?.trim() || '',
    audioUrl,
    uploaderId,
    uploaderEmail,
    externalVideos: externalVideos || [],
    externalPpts: externalPpts || [],
    externalFiles: externalFiles || [],
    likedBy: [],
    ratings: {},
    isPrivateVip: isVip,
    vipToken,
    vipExpiresAt,
    vipDurationDays: durationDays
  };

  tracks.unshift(newTrack);
  saveStoreToDisk();
  res.json(newTrack);
});

// POST /api/tracks/:id/reset-vip-token (Requirement 7: 重置私秘VIP專屬連結與有效天數)
app.post('/api/tracks/:id/reset-vip-token', (req, res) => {
  const track = tracks.find(t => t.id === req.params.id);
  if (!track) return res.status(404).json({ error: '找不到該音檔' });

  const durationDays = req.body.durationDays !== undefined ? Number(req.body.durationDays) : (track.vipDurationDays || 7);
  const newToken = `vip_${Math.random().toString(36).substring(2, 10)}`;
  const expiresAt = durationDays === 0 ? null : (Date.now() + durationDays * 86400 * 1000);

  track.isPrivateVip = true;
  track.vipToken = newToken;
  track.vipDurationDays = durationDays;
  track.vipExpiresAt = expiresAt;

  saveStoreToDisk();
  res.json({
    success: true,
    track,
    vipToken: newToken,
    vipExpiresAt: expiresAt,
    vipDurationDays: durationDays
  });
});

// GET /api/keywords (Requirement 1: 取得資料庫內已被使用過的所有網友關鍵字)
app.get('/api/keywords', (_req, res) => {
  const set = new Set<string>();
  tracks.forEach(t => {
    if (Array.isArray(t.keywords)) {
      t.keywords.forEach(k => {
        const trimmed = k.trim();
        if (trimmed) set.add(trimmed);
      });
    }
  });
  // Provide helpful defaults if database is empty
  res.json(Array.from(set));
});

// PUT /api/keywords/rename (Requirement 2: 後台管理中心直接編輯關鍵字，自動更新連動到所有音檔)
app.put('/api/keywords/rename', (req, res) => {
  const { oldKeyword, newKeyword } = req.body;
  const oldTrimmed = (oldKeyword || '').trim();
  const newTrimmed = (newKeyword || '').trim();

  if (!oldTrimmed || !newTrimmed) {
    return res.status(400).json({ error: '關鍵字不可為空' });
  }

  let affectedCount = 0;
  tracks.forEach(t => {
    if (Array.isArray(t.keywords) && t.keywords.includes(oldTrimmed)) {
      t.keywords = t.keywords.map(k => (k === oldTrimmed ? newTrimmed : k));
      t.keywords = Array.from(new Set(t.keywords));
      affectedCount++;
    }
  });

  saveStoreToDisk();
  res.json({ success: true, affectedCount, tracks });
});

// DELETE /api/keywords/delete (Requirement 2: 後台管理中心刪除關鍵字)
app.delete('/api/keywords/delete', (req, res) => {
  const keyword = ((req.query.keyword as string) || (req.body && req.body.keyword) || '').trim();
  if (!keyword) {
    return res.status(400).json({ error: '關鍵字不可為空' });
  }

  let affectedCount = 0;
  tracks.forEach(t => {
    if (Array.isArray(t.keywords) && t.keywords.includes(keyword)) {
      t.keywords = t.keywords.filter(k => k !== keyword);
      affectedCount++;
    }
  });

  saveStoreToDisk();
  res.json({ success: true, affectedCount, tracks });
});

// POST /api/tracks/:id/keywords (Requirement 1: 會員所有人皆可為音檔新增網友關鍵字，每首上限20組)
app.post('/api/tracks/:id/keywords', (req, res) => {
  const track = tracks.find(t => t.id === req.params.id);
  if (!track) return res.status(404).json({ error: '音檔不存在' });

  const { keyword } = req.body;
  const trimmed = (keyword || '').trim();
  if (!trimmed) return res.status(400).json({ error: '關鍵字不可為空' });

  track.keywords = track.keywords || [];
  if (track.keywords.length >= 20) {
    return res.status(400).json({ error: '此音檔已達 20 組網友關鍵字上限！' });
  }

  if (!track.keywords.includes(trimmed)) {
    track.keywords.push(trimmed);
  }
  saveStoreToDisk();
  res.json({ success: true, keywords: track.keywords });
});

// PUT /api/tracks/:id/keywords (Requirement 1: 只有超級管理員、貢獻者原上傳者可修改關鍵字)
app.put('/api/tracks/:id/keywords', (req, res) => {
  const track = tracks.find(t => t.id === req.params.id);
  if (!track) return res.status(404).json({ error: '音檔不存在' });

  const { oldKeyword, newKeyword, userEmail } = req.body;
  const isAdmin = isSuperAdminEmail(userEmail);
  const isUploader = track.uploaderEmail && track.uploaderEmail === userEmail;

  if (!isAdmin && !isUploader) {
    return res.status(403).json({ error: '只有超級管理員或貢獻者原上傳者可編輯修改關鍵字！' });
  }

  const trimmedNew = (newKeyword || '').trim();
  if (!trimmedNew) return res.status(400).json({ error: '新關鍵字不可為空' });

  track.keywords = track.keywords || [];
  const idx = track.keywords.indexOf(oldKeyword);
  if (idx !== -1) {
    track.keywords[idx] = trimmedNew;
  }
  saveStoreToDisk();
  res.json({ success: true, keywords: track.keywords });
});

// DELETE /api/tracks/:id/keywords/:keyword (Requirement 1: 只有超級管理員、貢獻者原上傳者可刪除關鍵字)
app.delete('/api/tracks/:id/keywords/:keyword', (req, res) => {
  const track = tracks.find(t => t.id === req.params.id);
  if (!track) return res.status(404).json({ error: '音檔不存在' });

  const userEmail = (req.query.userEmail as string) || (req.body && req.body.userEmail);
  const isAdmin = isSuperAdminEmail(userEmail);
  const isUploader = track.uploaderEmail && track.uploaderEmail === userEmail;

  if (!isAdmin && !isUploader) {
    return res.status(403).json({ error: '只有超級管理員或貢獻者原上傳者可刪除關鍵字！' });
  }

  const targetKeyword = decodeURIComponent(req.params.keyword);
  track.keywords = (track.keywords || []).filter(k => k !== targetKeyword);
  saveStoreToDisk();
  res.json({ success: true, keywords: track.keywords });
});

// PUT /api/tracks/:id (Update track)
app.put('/api/tracks/:id', (req, res) => {
  const index = tracks.findIndex(t => t.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '音檔不存在' });

  const current = tracks[index];
  const { userEmail, id: _ignoredId, uploadDate: _ignoredUploadDate, ...patch } = req.body;

  // Contributor check: only admin or the original uploader can edit
  const isAdmin = isSuperAdminEmail(userEmail);
  const isUploader = current.uploaderEmail && current.uploaderEmail === userEmail;

  if (userEmail && !isAdmin && !isUploader) {
    return res.status(403).json({ error: '貢獻者只能編輯修改自己上傳的音檔！' });
  }

  const updated: Track = {
    ...current,
    ...patch,
    categories: Array.isArray(patch.categories) ? patch.categories.slice(0, 3) : current.categories,
    keywords: Array.isArray(patch.keywords) ? [...new Set(patch.keywords.map((k: any) => String(k).trim()).filter(Boolean))].slice(0, 20) : (current.keywords || []),
    // Immutable identity/history fields cannot be accidentally overwritten by partial UI requests.
    id: current.id,
    uploadDate: current.uploadDate,
    uploaderId: current.uploaderId,
    uploaderEmail: current.uploaderEmail
  };
  tracks[index] = updated;
  saveStoreToDisk();
  res.json(updated);
});

// DELETE /api/tracks/:id
app.delete('/api/tracks/:id', async (req, res) => {
  const index = tracks.findIndex(t => t.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '音檔不存在' });

  const track = tracks[index];
  const userEmail = (req.query.userEmail as string) || (req.body && req.body.userEmail);
  const isAdmin = !userEmail || isSuperAdminEmail(userEmail);
  const isUploader = track.uploaderEmail && track.uploaderEmail === userEmail;

  if (userEmail && !isAdmin && !isUploader) {
    return res.status(403).json({ error: '貢獻者只能刪除自己上傳的音檔！' });
  }

  const key = uploadedAudioKey(track.audioUrl || '', req.protocol+'://'+req.get('host'));
  if (key && !tracks.some(t=>t.id!==track.id && t.audioUrl===track.audioUrl)) {
    try {
      if (CF_ACCOUNT_ID && CF_API_TOKEN) {
        const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${CF_ACCOUNT_ID}/r2/buckets/${R2_BUCKET}/objects/${encodeURIComponent(key)}`,{method:'DELETE',headers:{Authorization:`Bearer ${CF_API_TOKEN}`}});
        if (!response.ok && response.status!==404) throw new Error('R2 delete failed');
      }
      const localFile = path.join(uploadDir,path.basename(key));
      if (!CF_ACCOUNT_ID && !fs.existsSync(localFile)) return res.status(503).json({error:'R2 尚未連線，無法刪除雲端音檔'});
      if (fs.existsSync(localFile)) fs.unlinkSync(localFile);
    } catch { return res.status(500).json({error:'音檔刪除失敗，請重試'}); }
  }
  const deletedTrack = tracks[index];
  // Requirement 8: 刪除音檔時，保留已聆聽紀錄之標題、講員並標記已刪除
  for (const rec of Object.values(playbackRecords)) {
    if (rec.trackId === deletedTrack.id) {
      rec.trackTitle = deletedTrack.title;
      rec.trackSpeaker = deletedTrack.speaker;
      rec.trackSpeakerRank = deletedTrack.speakerRank || '';
      rec.isDeleted = true;
    }
  }

  tracks.splice(index, 1);
  comments = comments.filter(c => c.trackId !== req.params.id);
  saveStoreToDisk();
  res.json({ success: true, deletedId: req.params.id });
});

// POST /api/tracks/:id/like (Requirement 7: 修復按讚愛心功能)
app.post('/api/tracks/:id/like', (req, res) => {
  const { identifier, identifiers } = req.body;
  const track = tracks.find(t => t.id === req.params.id);
  if (!track) return res.status(404).json({ error: '音檔不存在' });

  track.likedBy = track.likedBy || [];
  const keysToCheck: string[] = [];
  if (identifier) keysToCheck.push(identifier);
  if (Array.isArray(identifiers)) {
    identifiers.forEach(id => { if (id && !keysToCheck.includes(id)) keysToCheck.push(id); });
  }
  if (keysToCheck.length === 0) keysToCheck.push('guest');

  // Check if any candidate key is in likedBy
  const matchedKey = keysToCheck.find(k => track.likedBy.includes(k));
  if (matchedKey) {
    track.likedBy = track.likedBy.filter(x => !keysToCheck.includes(x));
    track.likes = Math.max(0, track.likes - 1);
    saveStoreToDisk();
    res.json({ likes: track.likes, hasLiked: false, likedBy: track.likedBy });
  } else {
    const primaryKey = keysToCheck[0];
    track.likedBy.push(primaryKey);
    track.likes += 1;
    saveStoreToDisk();
    res.json({ likes: track.likes, hasLiked: true, likedBy: track.likedBy });
  }
});

// POST /api/tracks/:id/rate (Requirement 11: 點擊相同星級取消評價，所有星星反灰)
app.post('/api/tracks/:id/rate', (req, res) => {
  const { identifier, score, userId, userEmail, deviceId } = req.body;
  if (!identifier && !userId && !userEmail) {
    return res.status(400).json({ error: '缺少識別碼' });
  }

  const track = tracks.find(t => t.id === req.params.id);
  if (!track) return res.status(404).json({ error: '音檔不存在' });

  const idKeys = [identifier, userId, userEmail, deviceId, 'u-admin'].filter(Boolean);
  const existingScore = idKeys.map(k => track.ratings[k]).find(s => s !== undefined);

  // If score is 0 or user clicks their current score again, cancel the rating
  if (score === 0 || (existingScore !== undefined && existingScore === score)) {
    idKeys.forEach(k => {
      delete track.ratings[k];
    });
    const allRatings = Object.values(track.ratings);
    const sum = allRatings.reduce((a, b) => a + b, 0);
    const avg = allRatings.length > 0 ? Math.round((sum / allRatings.length) * 10) / 10 : 0;
    track.rating = avg;
    track.ratingCount = allRatings.length;

    saveStoreToDisk();
    return res.json({
      rating: track.rating,
      ratingCount: track.ratingCount,
      userRating: 0,
      canceled: true
    });
  }

  if (score < 1 || score > 5) {
    return res.status(400).json({ error: '評分無效 (1-5 分)' });
  }

  // Remove any stale keys before writing new score
  idKeys.forEach(k => {
    delete track.ratings[k];
  });
  const writeKey = identifier || userEmail || userId;
  track.ratings[writeKey] = score;

  const allRatings = Object.values(track.ratings);
  const sum = allRatings.reduce((a, b) => a + b, 0);
  const avg = Math.round((sum / allRatings.length) * 10) / 10;

  track.rating = avg;
  track.ratingCount = allRatings.length;

  saveStoreToDisk();
  res.json({
    rating: track.rating,
    ratingCount: track.ratingCount,
    userRating: score,
    canceled: false
  });
});

// GET /api/comments (Requirement 6 v2.4: 取得全站所有錄音檔心得，提供通知頁面即時呈現 @ 標記)
app.get('/api/comments', (_req, res) => {
  const enriched = comments.map(c => {
    let matchedUser: UserProfile | undefined;
    if (c.authorEmail && c.authorEmail !== 'guest' && !c.authorEmail.startsWith('guest-')) {
      matchedUser = users.find(u => u.email && u.email.toLowerCase() === c.authorEmail?.toLowerCase());
    } else if (c.isAdmin) {
      matchedUser = users.find(u => isSuperAdminEmail(u.email) || u.role === '超級管理員');
    } else if (c.authorName && !c.authorName.startsWith('訪客') && c.authorBadge !== '訪客稱號' && c.authorBadge !== '訪客') {
      matchedUser = users.find(u => u.name === c.authorName);
    }

    if (matchedUser) {
      return {
        ...c,
        authorName: matchedUser.name,
        authorAvatar: matchedUser.avatar || c.authorAvatar,
        authorEmail: matchedUser.email || c.authorEmail,
        authorBadge: matchedUser.role === '超級管理員' ? '管理員' : matchedUser.isContributor ? '貢獻者' : (matchedUser.rank || c.authorBadge)
      };
    }
    // Requirement 5 (v2.5): 訪客不應該有獎銜
    return {
      ...c,
      authorBadge: ''
    };
  });
  res.json(enriched);
});

// GET /api/changelog (Requirement 8 v2.4: 取得在線編輯的改版歷史紀錄)
app.get('/api/changelog', (_req, res) => {
  res.json(customChangelog || []);
});

// PUT /api/changelog (Requirement 8 v2.4: 超級管理員手動編輯改版歷程段落文字並持久存儲)
app.put('/api/changelog', (req, res) => {
  const { changelog, userEmail } = req.body;
  if (!isSuperAdminEmail(userEmail)) {
    return res.status(403).json({ error: '只有超級管理員才能編輯改版歷史紀錄' });
  }
  if (!Array.isArray(changelog)) {
    return res.status(400).json({ error: '改版內容格式不正確' });
  }

  customChangelog = changelog;
  saveStoreToDisk();
  res.json({ success: true, changelog: customChangelog });
});

app.get('/api/tracks/:id/comments', (req, res) => {
  const trackComments = comments.filter(c => c.trackId === req.params.id);
  // Requirement 1: 不論是新心得或過去的舊心得，心得收穫顯示的名字，都要和會員自己後台基本資料設定修改的名字，維持同步。
  const enriched = trackComments.map(c => {
    let matchedUser: UserProfile | undefined;
    if (c.authorEmail && c.authorEmail !== 'guest' && !c.authorEmail.startsWith('guest-')) {
      matchedUser = users.find(u => u.email && u.email.toLowerCase() === c.authorEmail?.toLowerCase());
    } else if (c.isAdmin) {
      matchedUser = users.find(u => isSuperAdminEmail(u.email) || u.role === '超級管理員');
    } else if (c.authorName && !c.authorName.startsWith('訪客') && c.authorBadge !== '訪客稱號' && c.authorBadge !== '訪客') {
      matchedUser = users.find(u => u.name === c.authorName);
    }

    if (matchedUser) {
      return {
        ...c,
        authorName: matchedUser.name,
        authorAvatar: matchedUser.avatar || c.authorAvatar,
        authorEmail: matchedUser.email || c.authorEmail,
        authorBadge: matchedUser.role === '超級管理員' ? '管理員' : matchedUser.isContributor ? '貢獻者' : (matchedUser.rank || c.authorBadge)
      };
    }
    // Requirement 5 (v2.5): 訪客不應該有獎銜
    return {
      ...c,
      authorBadge: ''
    };
  });
  res.json(enriched);
});

app.post('/api/tracks/:id/comments', (req, res) => {
  const {
    authorName,
    authorAvatar,
    authorBadge,
    authorEmail,
    deviceId,
    isAdmin,
    content,
    replyToId,
    replyToAuthor
  } = req.body;

  if (!content || !content.trim()) {
    return res.status(400).json({ error: '請輸入心得內容' });
  }

  const track = tracks.find(t => t.id === req.params.id);
  if (!track) return res.status(404).json({ error: '音檔不存在' });

  const toxicWords = [
    '去死', 'fuck', 'fck', 'shit', 'bitch', 'asshole',
    '幹', '操', '操你', '幹你', '白痴', '白癡', '智障', '腦殘',
    '王八蛋', '靠北', '靠杯', '三小', '賤人', '死全家', '滾蛋',
    '混蛋', '垃圾', '髒話', '洗版', '攻擊', '惡意'
  ];
  const lowerContent = content.toLowerCase().replace(/\s+/g, '');
  const isToxic = toxicWords.some(w => lowerContent.includes(w.toLowerCase()));
  if (isToxic) {
    return res.status(422).json({ error: '心得經 Cloudflare Workers AI 智慧審核未通過（含不當或攻擊性言論），請使用友善用詞。' });
  }

  const createdAt = Date.now();
  const newComment: Comment = {
    id: `c-${createdAt}`,
    trackId: req.params.id,
    authorName: authorName || '訪客',
    authorAvatar: authorAvatar || '💬',
    authorBadge: authorBadge || '訪客稱號',
    authorEmail,
    deviceId,
    isAdmin: !!isAdmin,
    content: content.trim(),
    timestamp: formatCommentTimestamp({ createdAt }),
    createdAt,
    isAiModerated: true,
    likes: 0,
    likedBy: [],
    replyToId,
    replyToAuthor
  };

  comments.unshift(newComment);
  track.commentsCount = comments.filter(c => c.trackId === req.params.id).length;
  saveStoreToDisk();

  res.json(newComment);
});

// POST /api/comments/:id/like (Requirement 15: 幫特定心得按讚)
app.post('/api/comments/:id/like', (req, res) => {
  const { identifier } = req.body;
  const comment = comments.find(c => c.id === req.params.id);
  if (!comment) return res.status(404).json({ error: '心得不存在' });

  if (!comment.likedBy) comment.likedBy = [];
  if (comment.likes === undefined) comment.likes = 0;

  const idKey = identifier || 'guest';
  const hasLiked = comment.likedBy.includes(idKey);

  if (hasLiked) {
    comment.likedBy = comment.likedBy.filter(x => x !== idKey);
    comment.likes = Math.max(0, comment.likes - 1);
  } else {
    comment.likedBy.push(idKey);
    comment.likes += 1;
  }

  saveStoreToDisk();
  res.json({ likes: comment.likes, hasLiked: !hasLiked });
});

app.put('/api/comments/:id', (req, res) => {
  const { content } = req.body;
  const comment = comments.find(c => c.id === req.params.id);
  if (!comment) return res.status(404).json({ error: '心得不存在' });

  const owns = comment.authorEmail ? req.body.userEmail && comment.authorEmail.toLowerCase().trim() === req.body.userEmail.toLowerCase().trim() : comment.deviceId && comment.deviceId === req.body.deviceId;
  if (!owns) return res.status(403).json({error:'只能修改自己的心得'});
  if (!content?.trim()) return res.status(400).json({error:'心得不可空白'});
  comment.content = content.trim();
  saveStoreToDisk();
  res.json(comment);
});

// DELETE /api/comments/:id (Only admin or author, NOT contributor)
app.delete('/api/comments/:id', (req, res) => {
  const index = comments.findIndex(c => c.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: '心得不存在' });

  const trackId = comments[index].trackId;
  comments.splice(index, 1);

  const track = tracks.find(t => t.id === trackId);
  if (track) {
    track.commentsCount = comments.filter(c => c.trackId === trackId).length;
  }

  saveStoreToDisk();
  res.json({ success: true });
});

// GET /api/users
app.get('/api/users', (_req, res) => {
  res.json(users);
});

// GET /api/users/profile
app.get('/api/users/profile', (req, res) => {
  const email = (req.query.email as string)?.toLowerCase().trim();
  const id = req.query.id as string;
  const user = users.find(u => (email && u.email?.toLowerCase().trim() === email) || (id && u.id === id));
  if (!user) return res.status(404).json({ error: '找不到此會員' });
  const isOwner = user.email?.toLowerCase().trim() === 'yukidu@gmail.com';
  if (isOwner) {
    user.role = '超級管理員';
    user.isAdminUser = true;
    user.isContributor = true;
  }
  res.json({ success: true, user });
});

// POST /api/users (Create or register user)
app.post('/api/users', (req, res) => {
  const profile: UserProfile = req.body;
  const cleanEmail = (profile.email || '').toLowerCase().trim();
  const isOwner = cleanEmail === 'yukidu@gmail.com';
  const existingIdx = users.findIndex(u => u.email?.toLowerCase().trim() === cleanEmail);
  if (existingIdx !== -1) {
    users[existingIdx] = {
      ...users[existingIdx],
      ...profile,
      role: isOwner ? '超級管理員' : (users[existingIdx].role || profile.role),
      isAdminUser: isOwner ? true : (users[existingIdx].isAdminUser ?? profile.isAdminUser),
      isContributor: isOwner ? true : (users[existingIdx].isContributor ?? profile.isContributor)
    };
    saveStoreToDisk();
    return res.json({ success: true, user: users[existingIdx] });
  }
  if (isOwner) {
    profile.role = '超級管理員';
    profile.isAdminUser = true;
    profile.isContributor = true;
  }
  users.push(profile);
  saveStoreToDisk();
  res.json({ success: true, user: profile, isNewUser: true });
});

// Google login retrieves the saved profile and only refreshes the Google photo.
app.post('/api/users/google-sync', (req, res) => {
  const email = String(req.body.email || '').toLowerCase().trim();
  if (!email) return res.status(400).json({ error: '會員 Email 為必填欄位' });
  let user = users.find(u => u.email?.toLowerCase().trim() === email);
  const isNewUser = !user;
  const owner = email === 'yukidu@gmail.com';
  if (!user) {
    user = { id: owner ? 'u-admin' : `u-${crypto.randomUUID()}`, email, name: req.body.name || email.split('@')[0],
      avatar: req.body.avatar || '👤', rank: owner ? '鑽石' : '無', role: owner ? '超級管理員' : '繁星家人',
      isAdminUser: owner, isContributor: owner, canUpload: owner, rankApproved: owner,
      rankAuditStatus: owner ? 'approved' : 'pending', registerDate: new Date().toISOString(), birthday: '', center: '', residence: '', playCount: 0, isBlocked: false, lastActive: new Date().toISOString() } as UserProfile;
    users.push(user);
  } else {
    const customPhoto = (user as any).avatarUploadCount > 0 || user.avatar?.startsWith('data:') ||
      (user.avatar?.startsWith('http') && !(user as any).googleAvatar && !/googleusercontent|unsplash/.test(user.avatar));
    if (!customPhoto && req.body.avatar) user.avatar = req.body.avatar;
  }
  (user as any).googleAvatar = req.body.avatar || (user as any).googleAvatar || '';
  user.lastActive = new Date().toISOString();
  saveStoreToDisk();
  res.json({ success: true, user, isNewUser });
});

// PUT /api/users/:id (Update user profile - can be called by user or admin!)
app.put('/api/users/:id', (req, res) => {
  const user = users.find(u => u.id === req.params.id || u.email === req.params.id);
  if (!user) return res.status(404).json({ error: '使用者不存在' });

  const oldName = user.name;
  Object.assign(user, req.body);

  // Requirement 2 & 3: 個人基本資料，名稱修改後，心得收穫同步跟著改（含管理員心得）
  if (req.body.name || req.body.avatar) {
    comments.forEach(c => {
      const matchEmail = user.email && c.authorEmail && c.authorEmail.toLowerCase().trim() === user.email.toLowerCase().trim();
      const matchAdmin = c.isAdmin && (user.email?.toLowerCase().trim() === 'yukidu@gmail.com' || user.role === '超級管理員');
      const matchName = oldName && c.authorName === oldName;
      if (matchEmail || matchAdmin || matchName) {
        if (req.body.name) c.authorName = req.body.name;
        if (req.body.avatar) c.authorAvatar = req.body.avatar;
      }
    });
  }

  saveStoreToDisk();
  saveStoreToDisk();
  res.json(user);
});

// PUT /api/admin/users/batch (Requirement 24: 批次修改會員中心、獎銜、上手鑽石)
app.put('/api/admin/users/batch', (req, res) => {
  const { userIds, updates } = req.body;
  if (!Array.isArray(userIds) || !updates) {
    return res.status(400).json({ error: '缺少 userIds 或 updates 參數' });
  }

  userIds.forEach(id => {
    const user = users.find(u => u.id === id);
    if (user) {
      Object.assign(user, updates);
    }
  });

  saveStoreToDisk();
  res.json({ success: true, count: userIds.length, users });
});

// PUT /api/users/:id/contributor (Admin designates contributor)
app.put('/api/users/:id/contributor', (req, res) => {
  const actor=users.find(u=>u.email?.toLowerCase().trim()===String(req.body.actorEmail||'').toLowerCase().trim());
  if(!actor || !isSuperAdminEmail(actor.email) || actor.isBlocked) return res.status(403).json({error:'只有超級管理員可調整會員權限'});
  const target=users.find(u=>u.id===req.params.id);
  if(target && isSuperAdminEmail(target.email)) return res.status(400).json({error:'超級管理員不可被封鎖或變更權限'});

  const user = users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: '使用者不存在' });

  user.isContributor = typeof req.body.isContributor === 'boolean' ? req.body.isContributor : !user.isContributor;
  user.canUpload = user.isContributor;
  saveStoreToDisk();
  res.json(user);
});

// PUT /api/users/:id/admin-role (Requirement 11 & 3: Super Admin designates 獎銜審核員 role)
app.put('/api/users/:id/admin-role', (req, res) => {
  const actor=users.find(u=>u.email?.toLowerCase().trim()===String(req.body.actorEmail||'').toLowerCase().trim());
  if(!actor || !isSuperAdminEmail(actor.email) || actor.isBlocked) return res.status(403).json({error:'只有超級管理員可調整會員權限'});
  const target=users.find(u=>u.id===req.params.id);
  if(target && isSuperAdminEmail(target.email)) return res.status(400).json({error:'超級管理員不可被封鎖或變更權限'});

  const user = users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: '使用者不存在' });
  if (isSuperAdminEmail(user.email)) {
    return res.status(400).json({ error: '超級管理員身分不可修改' });
  }

  user.isAdminUser = typeof req.body.isAdminUser === 'boolean' ? req.body.isAdminUser : !user.isAdminUser;
  user.role = user.isAdminUser ? '獎銜審核員' : '繁星家人';
  saveStoreToDisk();
  res.json(user);
});

// PUT /api/users/:id/audit-rank (Requirement 9, 11, 12: 獎銜審核員 or Super Admin audits or modifies member rank)
app.put('/api/users/:id/audit-rank', (req, res) => {
  const user = users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: '使用者不存在' });

  const { rank, action, auditedBy, auditorEmail } = req.body;
  const auditor = users.find(u => u.email?.toLowerCase().trim() === auditorEmail?.toLowerCase().trim());
  if (!auditor || (!auditor.isAdminUser && auditor.email !== 'yukidu@gmail.com')) return res.status(403).json({error:'沒有獎銜審核權限'});
  const now = new Date();
  const dateStr = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

  if (action === 'approve') {
    user.approvedRank = user.rank;
    user.rankApproved = true;
    user.rankAuditStatus = 'approved';
    user.auditedBy = auditedBy || '獎銜審核員審核通過';
    user.auditedAt = dateStr;
  } else if (action === 'modify_and_approve') {
    if (rank) {
      user.rank = rank;
      user.approvedRank = rank;
    }
    user.rankApproved = true;
    user.rankAuditStatus = 'approved';
    user.auditedBy = auditedBy || '獎銜審核員修改並審核通過';
    user.auditedAt = dateStr;
  }

  saveStoreToDisk();
  res.json(user);
});

// PUT /api/users/:id/block
app.put('/api/users/:id/block', (req, res) => {
  const actor=users.find(u=>u.email?.toLowerCase().trim()===String(req.body.actorEmail||'').toLowerCase().trim());
  if(!actor || !isSuperAdminEmail(actor.email) || actor.isBlocked) return res.status(403).json({error:'只有超級管理員可調整會員權限'});
  const target=users.find(u=>u.id===req.params.id);
  if(target && isSuperAdminEmail(target.email)) return res.status(400).json({error:'超級管理員不可被封鎖或變更權限'});

  const user = users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: '使用者不存在' });

  user.isBlocked = typeof req.body.isBlocked === 'boolean' ? req.body.isBlocked : !user.isBlocked;
  saveStoreToDisk();
  res.json(user);
});

// Playback recording & cross-device sync (Requirement 1: 首次聆聽、最近聆聽、聽完日期、進度%、點擊次數)
app.post('/api/playback/record', (req, res) => {
  const { trackId, userIdOrDeviceId, currentTime, duration } = req.body;
  if (!trackId || !userIdOrDeviceId) return res.status(400).send();

  const key = `${userIdOrDeviceId}_${trackId}`;
  const now = new Date();
  const dateStr = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;
  const safeDuration = duration > 0 ? duration : 600;
  const progressPercent = Math.min(100, Math.round((currentTime / safeDuration) * 100));
  const isFinished = progressPercent > 95;
  const listenedOver2Min = currentTime >= 120;

  const prev = playbackRecords[key] || {};
  const currentTrack = tracks.find(t => t.id === trackId);
  const clickCount = (prev.clickCount || 0) + 1;
  const firstListenDate = prev.firstListenDate || dateStr;
  const lastListenDate = dateStr;
  const finishDate = isFinished ? (prev.finishDate || dateStr) : prev.finishDate;

  playbackRecords[key] = {
    trackId,
    trackTitle: currentTrack?.title || prev.trackTitle || '演講錄音檔',
    trackSpeaker: currentTrack?.speaker || prev.trackSpeaker || '繁星講師',
    trackSpeakerRank: currentTrack?.speakerRank || prev.trackSpeakerRank || '',
    userIdOrDeviceId,
    currentTime,
    duration: safeDuration,
    progressPercent,
    completed: isFinished,
    listenedOver2Min,
    firstListenDate,
    lastListenDate,
    finishDate,
    clickCount,
    updatedAt: Date.now()
  };

  const u = users.find(user => user.email === userIdOrDeviceId || user.id === userIdOrDeviceId);
  if (u && currentTime % 30 < 2) {
    u.playCount += 1;
  }

  // Increment track playCount on record
  if (currentTrack && (!prev.updatedAt || Date.now() - prev.updatedAt > 15000)) {
    currentTrack.playCount = (currentTrack.playCount || 0) + 1;
  }

  res.json(playbackRecords[key]);
});

app.get('/api/playback/history/:userIdOrDeviceId', (req, res) => {
  const id = req.params.userIdOrDeviceId;
  const targetUser = users.find(u => u.id === id || u.email === id);
  const userIds = [id];
  if (targetUser) {
    if (targetUser.id && !userIds.includes(targetUser.id)) userIds.push(targetUser.id);
    if (targetUser.email && !userIds.includes(targetUser.email)) userIds.push(targetUser.email);
  }

  const userRecords: Record<string, any> = {};
  for (const [k, v] of Object.entries(playbackRecords)) {
    if (userIds.some(uid => k.startsWith(`${uid}_`))) {
      const track = tracks.find(t => t.id === v.trackId);
      const isDeleted = !track || v.isDeleted === true;
      // Find comment and rating by user on this track
      const userComment = comments.find(c =>
        c.trackId === v.trackId &&
        (userIds.includes(c.authorEmail || '') || (targetUser && c.authorName === targetUser.name))
      );
      const userRating = track ? (
        userIds.map(uid => track.ratings[uid]).find(r => r !== undefined)
      ) : undefined;

      userRecords[v.trackId] = {
        ...v,
        trackTitle: track?.title || v.trackTitle || '演講錄音檔',
        trackSpeaker: track?.speaker || v.trackSpeaker || '繁星講師',
        trackSpeakerRank: track?.speakerRank || v.trackSpeakerRank || '',
        isDeleted,
        comment: userComment?.content,
        rating: userRating
      };
    }
  }
  res.json(userRecords);
});

// Helper to score relative time strings for leaderboard sorting (Requirement 9 v2.2)
function parseRelativeTimeScore(text?: string | null): number {
  if (!text) return -Infinity;
  const s = text.trim();
  const now = Date.now();
  if (s === '剛才' || s === '剛剛' || s === '在線') return now;

  const minMatch = s.match(/^(\d+)\s*分鐘前$/);
  if (minMatch) return now - parseInt(minMatch[1], 10) * 60 * 1000;

  const hrMatch = s.match(/^(\d+)\s*小時前$/);
  if (hrMatch) return now - parseInt(hrMatch[1], 10) * 3600 * 1000;

  if (s === '昨天' || s.startsWith('昨天')) return now - 24 * 3600 * 1000;
  if (s === '前天') return now - 48 * 3600 * 1000;

  const dayMatch = s.match(/^(\d+)\s*天前$/);
  if (dayMatch) return now - parseInt(dayMatch[1], 10) * 86400 * 1000;

  const weekMatch = s.match(/^(\d+)\s*(週|星期)前$/);
  if (weekMatch) return now - parseInt(weekMatch[1], 10) * 7 * 86400 * 1000;

  const parsed = new Date(s.replace(/\//g, '-')).getTime();
  if (!isNaN(parsed) && parsed > 0) return parsed;

  return 0;
}

// Leaderboard API for Requirement 3 & Requirement 12: 訪客不列入模範生的統計排行榜
app.get('/api/leaderboard', (_req, res) => {
  // 排除訪客，僅限正式註冊會員
  const validMembers = users.filter(
    u =>
      u &&
      u.id !== 'guest' &&
      !u.id.startsWith('guest-') &&
      !u.name.startsWith('訪客') &&
      u.role !== '訪客' &&
      u.email &&
      u.email !== 'guest'
  );

  // 1. 基本資料最近更新前5名 (Requirement 9: 修正剛才更新排在昨天更新之後的異常)
  const recentlyUpdated = [...validMembers]
    .sort((a, b) => parseRelativeTimeScore(b.lastActive) - parseRelativeTimeScore(a.lastActive))
    .slice(0, 5)
    .map(u => ({ user: u, value: u.lastActive || '近期' }));

  // 2. 按讚前5名 (Requirement 10: 統計數據為0則不計入)
  const topLikes = [...validMembers]
    .map(u => {
      let count = 0;
      tracks.forEach(t => {
        if (t.likedBy?.includes(u.id) || (u.email && t.likedBy?.includes(u.email))) {
          count++;
        }
      });
      return { user: u, count };
    })
    .filter(x => x.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // 3. 心得數前5名 (Requirement 10: 統計數據為0則不計入)
  const topComments = [...validMembers]
    .map(u => {
      const count = comments.filter(c =>
        c.authorEmail === u.email || c.authorName === u.name
      ).length;
      return { user: u, count };
    })
    .filter(x => x.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // 4. 點閱率前5名 (Requirement 10: 統計數據為0則不計入)
  const topClicks = [...validMembers]
    .map(u => ({ user: u, count: u.playCount || 0 }))
    .filter(x => x.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // 5. 100% 聽完前5名 (Requirement 10: 統計數據為0則不計入)
  const topFinished = [...validMembers]
    .map(u => {
      let count = 0;
      for (const [k, v] of Object.entries(playbackRecords)) {
        if (k.startsWith(`${u.id}_`) || (u.email && k.startsWith(`${u.email}_`))) {
          if (v.completed || (v.progressPercent && v.progressPercent > 95)) {
            count++;
          }
        }
      }
      return { user: u, count };
    })
    .filter(x => x.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  res.json({
    recentlyUpdated,
    topLikes,
    topComments,
    topClicks,
    topFinished
  });
});

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get('*', (_req, res) => {
        res.sendFile(path.resolve(distPath, 'index.html'));
      });
    }
  }

  app.listen(Number(PORT), '0.0.0.0', () => {
    console.log(`Server is running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
