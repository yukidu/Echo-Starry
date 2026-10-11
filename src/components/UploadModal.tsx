import { ThemedSelect } from './ThemedSelect';
import React, { useState, useRef } from 'react';
import {
  UploadCloud,
  FileAudio,
  Image as ImageIcon,
  Plus,
  Trash2,
  CheckCircle,
  AlertCircle,
  X,
  Sparkles,
  Link,
  FileText,
  Youtube,
  Edit2,
  Check,
  Tag,
  Crown,
  Search,
  RefreshCw
} from 'lucide-react';
import { Track, CategoryType, AmwayRank, RANK_ORDER, ExternalLinkItem, SocialLinkItem, SocialPlatform, UserProfile, SPEAKER_RANK_OPTIONS, GAR_ELIGIBLE_RANKS } from '../types';
import { parseID3Tags } from '../utils/id3Parser';

interface CoverLibraryItem {
  key: string;
  name: string;
  url: string;
  size?: number;
  uploaded?: string | null;
}

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newTrack: Track) => void;
  currentUser: UserProfile | null;
  isAdmin: boolean;
  trackToEdit?: Track | null;
  onCategoriesUpdated?: (categories?: string[], change?: { oldName: string; newName?: string }) => void;
  tracks?: Track[];
}

const ALL_CATEGORIES: CategoryType[] = [
  '事業',
  '心態思維',
  '營養',
  '安麗產品',
  '影集',
  '未分類'
];

const SUPPORTED_AUDIO_EXTENSIONS = ['mp3', 'm4a', 'aac', 'wav', 'ogg', 'opus', 'webm'] as const;
const SUPPORTED_AUDIO_ACCEPT = [
  '.mp3', '.m4a', '.aac', '.wav', '.ogg', '.opus', '.webm',
  'audio/mpeg', 'audio/mp4', 'audio/aac', 'audio/wav',
  'audio/ogg', 'audio/opus', 'audio/webm'
].join(',');

const COVER_LIBRARY_CACHE_KEY = 'echostars_cover_library_v3_6';
const SOCIAL_PLATFORM_OPTIONS: SocialPlatform[] = ['IG', 'FB', 'Youtube', 'Threads(脆)', '抖音', '自訂文字'];

const saveCoverLibraryCache = (covers: CoverLibraryItem[]) => {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(
      COVER_LIBRARY_CACHE_KEY,
      JSON.stringify({ covers, savedAt: Date.now() })
    );
  } catch {
    // Session cache is best-effort only.
  }
};

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  currentUser,
  isAdmin,
  trackToEdit,
  onCategoriesUpdated,
  tracks = []
}) => {
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [audioDurationSeconds, setAudioDurationSeconds] = useState<number | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [coverPreview, setCoverPreview] = useState<string>('');
  const [coverLibrary, setCoverLibrary] = useState<CoverLibraryItem[]>([]);
  const [isCoverLibraryLoading, setIsCoverLibraryLoading] = useState(false);
  const [coverSearch, setCoverSearch] = useState('');

  const [title, setTitle] = useState('');
  const [speaker, setSpeaker] = useState('');
  const [baseSpeakerRank, setBaseSpeakerRank] = useState<string>('無');
  const [isGarRank, setIsGarRank] = useState(false);

  const speakerRank = React.useMemo(() => {
    if (baseSpeakerRank === '無') return '無';
    if (isGarRank && GAR_ELIGIBLE_RANKS.includes(baseSpeakerRank)) {
      return `GAR${baseSpeakerRank}`;
    }
    return baseSpeakerRank;
  }, [baseSpeakerRank, isGarRank]);

  const handleBaseRankChange = (newRank: string) => {
    setBaseSpeakerRank(newRank);
    if (!GAR_ELIGIBLE_RANKS.includes(newRank)) {
      setIsGarRank(false);
    }
  };
  const [selectedCategories, setSelectedCategories] = useState<CategoryType[]>(['事業']);
  const [series, setSeries] = useState('');
  const [speechDate, setSpeechDate] = useState(new Date().toISOString().split('T')[0].replace(/-/g, '/'));
  const [seriesOrder, setSeriesOrder] = useState('第 1 集');
  const [guestVisible, setGuestVisible] = useState(false);
  const [authorizedOnlyVisible, setAuthorizedOnlyVisible] = useState(false);
  const [requiredRank, setRequiredRank] = useState<AmwayRank>('無');
  const [stickerUnlockCost, setStickerUnlockCost] = useState(0);
  const [commentStickerReward, setCommentStickerReward] = useState(0);
  const [description, setDescription] = useState('');
  // Requirement 6 & 12: 私秘 VIP 音檔，預設永久有效
  const [isPrivateVip, setIsPrivateVip] = useState(false);
  const [vipDurationDays, setVipDurationDays] = useState<number>(0);

  // Named external links (新增自訂名稱)
  const [externalVideos, setExternalVideos] = useState<ExternalLinkItem[]>([
    { name: '', url: '' }
  ]);
  const [externalPpts, setExternalPpts] = useState<ExternalLinkItem[]>([
    { name: '', url: '' }
  ]);
  const [externalFiles, setExternalFiles] = useState<ExternalLinkItem[]>([
    { name: '', url: '' }
  ]);
  const [socialLinks, setSocialLinks] = useState<SocialLinkItem[]>([
    { platform: 'IG', name: 'IG', url: '' }
  ]);

  const [isParsingId3, setIsParsingId3] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadStatusText, setUploadStatusText] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Requirement 8: 分類標籤動態管理 (新增、修改、刪除)
  const [categoryList, setCategoryList] = useState<string[]>(ALL_CATEGORIES);
  const [newCatInput, setNewCatInput] = useState('');
  const [editingCatOld, setEditingCatOld] = useState<string | null>(null);
  const [editingCatNew, setEditingCatNew] = useState('');
  const [isCatLoading, setIsCatLoading] = useState(false);

  // Requirement 1: 網友關鍵字 (最多 20 組)
  const [keywords, setKeywords] = useState<string[]>([]);
  const [newKeywordInput, setNewKeywordInput] = useState('');
  const [dbKeywords, setDbKeywords] = useState<string[]>([]);

  const loadCategories = async () => {
    try {
      const res = await fetch('/api/categories');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          setCategoryList(data);
        }
      }
    } catch {
      // fallback
    }
  };

  const loadDbKeywords = async () => {
    try {
      const res = await fetch('/api/keywords');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setDbKeywords(data);
        }
      }
    } catch {
      // fallback
    }
  };

  const loadCoverLibrary = async (force = false) => {
    // First open reuses a session cache to save R2 list requests. Manual refresh is
    // different: it must always ask the Worker/R2 again and replace the local list.
    if (!force && typeof sessionStorage !== 'undefined') {
      try {
        const cached = JSON.parse(sessionStorage.getItem(COVER_LIBRARY_CACHE_KEY) || 'null');
        if (cached && Array.isArray(cached.covers)) {
          setCoverLibrary(cached.covers);
          return;
        }
      } catch {}
    }

    if (force && typeof sessionStorage !== 'undefined') {
      try { sessionStorage.removeItem(COVER_LIBRARY_CACHE_KEY); } catch {}
    }

    setIsCoverLibraryLoading(true);
    try {
      const requestUrl = force
        ? `/api/r2/covers?refresh=${Date.now()}`
        : '/api/r2/covers';
      const res = await fetch(requestUrl, force ? {
        cache: 'no-store',
        headers: {
          Accept: 'application/json',
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache'
        }
      } : { headers: { Accept: 'application/json' } });
      if (!res.ok) {
        if (force) setErrorMessage('R2 照片同步失敗，請稍後再試。');
        return;
      }
      const data = await res.json();
      const covers = (Array.isArray(data?.covers) ? data.covers : [])
        .map((item: any): CoverLibraryItem | null => {
          const key = typeof item?.key === 'string' ? item.key.trim() : '';
          const url = typeof item?.url === 'string' ? item.url.trim() : '';
          if (!key || !url) return null;
          return {
            key,
            url,
            name: typeof item?.name === 'string' && item.name.trim() ? item.name.trim() : '未命名講者',
            size: typeof item?.size === 'number' ? item.size : undefined,
            uploaded: typeof item?.uploaded === 'string' ? item.uploaded : null
          };
        })
        .filter((item: CoverLibraryItem | null): item is CoverLibraryItem => item !== null);
      setCoverLibrary(covers);
      saveCoverLibraryCache(covers);
      if (force) setErrorMessage(null);
    } catch {
      if (force) setErrorMessage('R2 照片同步失敗，請檢查網路連線。');
    } finally {
      setIsCoverLibraryLoading(false);
    }
  };

  const filteredCoverLibrary = React.useMemo(() => {
    const q = coverSearch.trim().toLocaleLowerCase('zh-Hant');
    if (!q) return coverLibrary;
    return coverLibrary.filter(item =>
      item.name.toLocaleLowerCase('zh-Hant').includes(q) ||
      item.key.toLocaleLowerCase('zh-Hant').includes(q)
    );
  }, [coverLibrary, coverSearch]);

  const coverSearchSuggestions = React.useMemo(
    () => filteredCoverLibrary.slice(0, 6),
    [filteredCoverLibrary]
  );


  React.useEffect(() => {
    if (isOpen) {
      loadCategories();
      loadCoverLibrary();
    }
  }, [isOpen]);

  const handleAddKeyword = (kw: string) => {
    const trimmed = kw.trim();
    if (!trimmed) return;
    if (keywords.includes(trimmed)) return;
    if (keywords.length >= 20) {
      setErrorMessage('每首音檔最多只能設定 20 個網友關鍵字！');
      return;
    }
    setErrorMessage(null);
    setKeywords(prev => [...prev, trimmed]);
    setNewKeywordInput('');
  };

  const canRemoveKeyword = (kw: string) => !trackToEdit?.keywords?.includes(kw) || currentUser?.email?.trim().toLowerCase() === 'yukidu@gmail.com' || Boolean(currentUser && trackToEdit?.keywordMeta?.[kw]?.creatorId === currentUser.id);
  const handleRemoveKeyword = (kw: string) => {
    if (!canRemoveKeyword(kw)) return;
    setKeywords(prev => prev.filter(k => k !== kw));
  };

  const handleCreateCategory = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!newCatInput.trim() || isCatLoading) return;
    setIsCatLoading(true);
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCatInput.trim() })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '儲存失敗，請稍後再試');
      }
      if (res.ok) {
        const addedName = newCatInput.trim();
        const data = await res.json().catch(() => ({}));
        if (Array.isArray(data?.categories)) setCategoryList(data.categories);
        setNewCatInput('');
        // auto select newly created category if under limit (max 3)
        if (selectedCategories.length < 3) {
          setSelectedCategories(prev => [...prev, addedName as CategoryType]);
        }
        if (onCategoriesUpdated) onCategoriesUpdated(Array.isArray(data?.categories) ? data.categories : undefined);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '儲存失敗，請稍後再試');
    } finally {
      setIsCatLoading(false);
    }
  };

  const handleUpdateCategory = async (oldName: string) => {
    if (!editingCatNew.trim() || editingCatNew.trim() === oldName || isCatLoading) {
      setEditingCatOld(null);
      return;
    }
    setIsCatLoading(true);
    try {
      const res = await fetch(`/api/categories/${encodeURIComponent(oldName)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newName: editingCatNew.trim() })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '儲存失敗，請稍後再試');
      }
      if (res.ok) {
        const updated = editingCatNew.trim();
        const data = await res.json().catch(() => ({}));
        if (Array.isArray(data?.categories)) setCategoryList(data.categories);
        setSelectedCategories(prev => prev.map(c => (c === oldName ? (updated as CategoryType) : c)));
        setEditingCatOld(null);
        if (onCategoriesUpdated) onCategoriesUpdated(Array.isArray(data?.categories) ? data.categories : undefined, { oldName, newName: editingCatNew.trim() });
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '儲存失敗，請稍後再試');
    } finally {
      setIsCatLoading(false);
    }
  };

  const handleDeleteCategoryTag = async (catName: string) => {
    setIsCatLoading(true);
    try {
      const res = await fetch(`/api/categories/${encodeURIComponent(catName)}`, {
        method: 'DELETE'
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '儲存失敗，請稍後再試');
      }
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (Array.isArray(data?.categories)) setCategoryList(data.categories);
        setSelectedCategories(prev => {
          const next = prev.filter(c => c !== catName);
          return next.length > 0 ? next : (['未分類'] as CategoryType[]);
        });
        if (onCategoriesUpdated) onCategoriesUpdated(Array.isArray(data?.categories) ? data.categories : undefined, { oldName: catName });
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '儲存失敗，請稍後再試');
    } finally {
      setIsCatLoading(false);
    }
  };

  const audioInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  // When trackToEdit changes or modal opens, initialize fields
  React.useEffect(() => {
    if (trackToEdit) {
      setTitle(trackToEdit.title || '');
      setSpeaker(trackToEdit.speaker || '');
      const rawRank = (trackToEdit.speakerRank || '無').trim();
      const hasGar = rawRank.startsWith('GAR');
      const cleanRank = hasGar ? rawRank.replace(/^GAR/, '').trim() : rawRank;
      const matched = hasGar && !GAR_ELIGIBLE_RANKS.includes(cleanRank) ? rawRank : (cleanRank || '無');
      setBaseSpeakerRank(matched);
      setIsGarRank(hasGar && GAR_ELIGIBLE_RANKS.includes(matched));
      setSelectedCategories(Array.isArray(trackToEdit.categories) ? trackToEdit.categories.slice(0, 3) : ['未分類']);
      setKeywords(Array.isArray(trackToEdit.keywords) ? [...trackToEdit.keywords] : []);
      setSeries(trackToEdit.series || '');
      setSpeechDate(trackToEdit.speechDate || '');
      setSeriesOrder(trackToEdit.seriesOrder ?? '');
      setRequiredRank(trackToEdit.requiredRank || '無');
      setAuthorizedOnlyVisible(Boolean(trackToEdit.authorizedOnlyVisible));
      setGuestVisible(Boolean(trackToEdit.guestVisible) && !Boolean(trackToEdit.authorizedOnlyVisible));
      setStickerUnlockCost(Math.max(0, Number(trackToEdit.stickerUnlockCost || 0)));
      setCommentStickerReward(Math.max(0, Number(trackToEdit.commentStickerReward || 0)));
      setDescription(trackToEdit.description || '');
      setIsPrivateVip(Boolean(trackToEdit.isPrivateVip));
      setVipDurationDays(trackToEdit.vipDurationDays !== undefined ? trackToEdit.vipDurationDays : 0);
      setCoverFile(null);
      setCoverPreview(trackToEdit.speakerAvatar || '');
      setCoverSearch('');
      setExternalVideos(trackToEdit.externalVideos && trackToEdit.externalVideos.length > 0 ? trackToEdit.externalVideos : [{ name: '', url: '' }]);
      setExternalPpts(trackToEdit.externalPpts && trackToEdit.externalPpts.length > 0 ? trackToEdit.externalPpts : [{ name: '', url: '' }]);
      setExternalFiles(trackToEdit.externalFiles && trackToEdit.externalFiles.length > 0 ? trackToEdit.externalFiles : [{ name: '', url: '' }]);
      setSocialLinks(trackToEdit.socialLinks && trackToEdit.socialLinks.length > 0 ? trackToEdit.socialLinks.map(link => ({ ...link })) : [{ platform: 'IG', name: 'IG', url: '' }]);
      setAudioFile(null);
      setAudioDurationSeconds(null);
    } else {
      setTitle('');
      setSpeaker('');
      setBaseSpeakerRank('無');
      setIsGarRank(false);
      setSelectedCategories(['事業']);
      setKeywords([]);
      setSeries('');
      setSpeechDate(new Date().toISOString().split('T')[0].replace(/-/g, '/'));
      setSeriesOrder('第 1 集');
      setRequiredRank('無');
      setGuestVisible(false);
      setAuthorizedOnlyVisible(false);
      setStickerUnlockCost(0);
      setCommentStickerReward(0);
      setDescription('');
      setIsPrivateVip(false);
      setVipDurationDays(0);
      setCoverFile(null);
      setCoverPreview('');
      setCoverSearch('');
      setExternalVideos([{ name: '', url: '' }]);
      setExternalPpts([{ name: '', url: '' }]);
      setExternalFiles([{ name: '', url: '' }]);
      setSocialLinks([{ platform: 'IG', name: 'IG', url: '' }]);
      setAudioFile(null);
      setAudioDurationSeconds(null);
    }
  }, [trackToEdit, isOpen]);

  if (!isOpen) return null;

  // Unmodifiable today upload date
  const today = new Date();
  const todayUploadDate = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}`;

  const toggleCategory = (cat: CategoryType) => {
    if (selectedCategories.includes(cat)) {
      if (selectedCategories.length === 1) return; // at least 1
      setSelectedCategories(selectedCategories.filter(c => c !== cat));
      setErrorMessage(null);
    } else {
      if (selectedCategories.length >= 3) {
        setErrorMessage('分類標籤限制最多只能選 3 個！');
        return;
      }
      setErrorMessage(null);
      setSelectedCategories([...selectedCategories, cat]);
    }
  };

  const readAudioDurationSeconds = (file: File): Promise<number> =>
    new Promise((resolve, reject) => {
      const audio = document.createElement('audio');
      const objectUrl = URL.createObjectURL(file);
      audio.preload = 'metadata';
      const cleanup = () => {
        audio.removeAttribute('src');
        URL.revokeObjectURL(objectUrl);
      };
      audio.onloadedmetadata = () => {
        const seconds = Number.isFinite(audio.duration) ? Math.round(audio.duration) : 0;
        cleanup();
        seconds > 0 ? resolve(seconds) : reject(new Error('無法讀取音檔長度'));
      };
      audio.onerror = () => {
        cleanup();
        reject(new Error('無法讀取音檔長度'));
      };
      audio.src = objectUrl;
    });

  const formatDurationLabel = (seconds?: number | null) => {
    if (!seconds || !Number.isFinite(seconds) || seconds <= 0) return '時間待確認';
    return `約 ${Math.max(1, Math.round(seconds / 60))} 分鐘`;
  };

  const handleAudioSelected = async (file: File) => {
    const extension = file.name.split('.').pop()?.toLowerCase() || '';
    if (!SUPPORTED_AUDIO_EXTENSIONS.includes(extension as (typeof SUPPORTED_AUDIO_EXTENSIONS)[number])) {
      setAudioFile(null);
      setAudioDurationSeconds(null);
      setErrorMessage('不支援此音訊格式。請使用 MP3、M4A、AAC、WAV、OGG、OPUS 或 WEBM。');
      return;
    }
    if (file.size === 0) {
      setErrorMessage('無效檔案：檔案大小為 0 byte，已被系統阻擋！');
      return;
    }
    if (file.size > 100 * 1024 * 1024) {
      setErrorMessage('音檔大小不可超過 100MB！');
      return;
    }

    setErrorMessage(null);
    setAudioFile(file);

    // Duration is read locally in the browser. This costs zero Cloudflare requests
    // and lets us persist the real duration instead of the old 10-minute placeholder.
    const durationPromise = readAudioDurationSeconds(file)
      .then(seconds => {
        setAudioDurationSeconds(seconds);
        return seconds;
      })
      .catch(() => {
        setAudioDurationSeconds(null);
        return 0;
      });

    setIsParsingId3(true);
    try {
      const id3 = await parseID3Tags(file);
      if (id3.title && !title) setTitle(id3.title);
      if (id3.artist && !speaker) setSpeaker(id3.artist);
      if (id3.album && !series) setSeries(id3.album);
      if (id3.year && !speechDate) setSpeechDate(id3.year);
      if (id3.track && !seriesOrder) setSeriesOrder(`第 ${id3.track} 集`);
      if (id3.pictureBlob && !coverPreview) {
        if (id3.pictureBlob.size <= 10 * 1024 * 1024) {
          const extension = id3.pictureExtension || 'jpg';
          const embeddedCoverFile = new File(
            [id3.pictureBlob],
            `embedded-cover.${extension}`,
            { type: id3.pictureMimeType || id3.pictureBlob.type || 'image/jpeg' }
          );
          setCoverFile(embeddedCoverFile);
          setCoverPreview(id3.pictureUrl || URL.createObjectURL(embeddedCoverFile));
        } else {
          setErrorMessage('音檔內嵌封面超過 10MB，請另外選擇較小的封面圖。');
        }
      } else if (id3.pictureUrl && !coverPreview) {
        // Backward-compatible preview path if an older parser only returns a URL.
        setCoverPreview(id3.pictureUrl);
      }
    } catch {
      // ignore
    } finally {
      await durationPromise;
      setIsParsingId3(false);
    }
  };

  const handleCoverSelected = (file: File) => {
    if (file.size === 0) {
      setErrorMessage('封面檔案大小為 0 byte！');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage('封面圖檔不可超過 10MB！');
      return;
    }
    setErrorMessage(null);
    setCoverFile(file);
    const url = URL.createObjectURL(file);
    setCoverPreview(url);
  };

  const handleSelectCoverFromLibrary = (item: CoverLibraryItem) => {
    const nextUrl = typeof item?.url === 'string' ? item.url.trim() : '';
    if (!nextUrl) {
      setErrorMessage('這張 R2 封面已失效，請按「同步 R2」重新整理照片清單。');
      return;
    }
    setErrorMessage(null);
    setCoverFile(null);
    setCoverPreview(nextUrl);
    const nextName = typeof item?.name === 'string' ? item.name.trim() : '';
    if (!speaker.trim() && nextName) setSpeaker(nextName);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isUploading) return;
    if (!audioFile && !trackToEdit) {
      setErrorMessage('請務必提供音訊檔案！');
      return;
    }
    if (!title.trim()) {
      setErrorMessage('請填寫演講主題！');
      return;
    }

    setIsUploading(true);
    setErrorMessage(null);
    setUploadStatusText('準備上傳中...');
    const resolvedSpeaker = speaker.trim() || '特邀講師';

    try {
      if (isPrivateVip && !trackToEdit?.isPrivateVip && currentUser) {
        const preflight = await fetch('/api/stickers/vip-preflight', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ trackId: trackToEdit?.id, isPrivateVip: true })
        });
        if (!preflight.ok) {
          const data = await preflight.json().catch(() => ({}));
          throw new Error(data.error || '貼紙不足，無法建立私秘VIP');
        }
      }

      let finalAudioUrl = trackToEdit?.audioUrl || '';

      // Direct upload audio file to Cloudflare R2
      if (audioFile) {
        setUploadStatusText('正在直傳音訊至 Cloudflare R2 儲存桶...');
        const audioFormData = new FormData();
        audioFormData.append('file', audioFile);
        audioFormData.append('title', title.trim());
        audioFormData.append('speaker', resolvedSpeaker);
        audioFormData.append('speakerRank', speakerRank.trim());
        audioFormData.append('fileType', 'audio');
        const uploadAudioRes = await fetch('/api/r2/upload', {
          method: 'POST',
          body: audioFormData
        });

        if (!uploadAudioRes.ok) {
          const errData = await uploadAudioRes.json().catch(() => ({}));
          throw new Error(errData.error || `音檔直傳 R2 失敗 (HTTP ${uploadAudioRes.status})`);
        }

        const uploadAudioData = await uploadAudioRes.json();
        if (!uploadAudioData.url) {
          throw new Error('R2 伺服器未回傳檔案存取網址');
        }
        finalAudioUrl = uploadAudioData.url;
      }

      let finalCoverUrl =
        trackToEdit ? (trackToEdit.speakerAvatar ?? '') :
        'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=600&auto=format&fit=crop&q=80';

      // Direct upload cover file to Cloudflare R2
      if (coverFile) {
        setUploadStatusText('正在上傳講師封面至 Cloudflare R2...');
        const coverFormData = new FormData();
        coverFormData.append('file', coverFile);
        coverFormData.append('title', title.trim());
        coverFormData.append('speaker', resolvedSpeaker);
        coverFormData.append('speakerRank', speakerRank.trim());
        coverFormData.append('fileType', 'cover');
        const uploadCoverRes = await fetch('/api/r2/upload', {
          method: 'POST',
          body: coverFormData
        });
        if (!uploadCoverRes.ok) {
          const data = await uploadCoverRes.json().catch(() => ({}));
          throw new Error(data.error || '封面上傳失敗，音檔資訊尚未儲存');
        }
        if (uploadCoverRes.ok) {
          const uploadCoverData = await uploadCoverRes.json();
          if (!uploadCoverData.url) throw new Error('封面上傳未回傳圖片網址，請重試');
          if (uploadCoverData.url) {
            finalCoverUrl = uploadCoverData.url;
            const nextItem: CoverLibraryItem = {
              key: uploadCoverData.key || '',
              name: resolvedSpeaker,
              url: uploadCoverData.url
            };
            setCoverLibrary(prev => {
              const next = [nextItem, ...prev.filter(item => item.url !== nextItem.url)];
              saveCoverLibraryCache(next);
              return next;
            });
          }
        }
      } else if (coverPreview && !coverPreview.startsWith('blob:')) {
        finalCoverUrl = coverPreview;
      }

      setUploadStatusText('正在儲存錄音檔資訊至雲端資料庫...');

      const cleanVideos = externalVideos.filter(v => v.url.trim());
      const cleanPpts = externalPpts.filter(p => p.url.trim());
      const cleanFiles = externalFiles.filter(f => f.url.trim());
      const cleanSocialLinks = socialLinks
        .filter(link => link.url.trim())
        .map(link => ({
          platform: link.platform,
          name: link.platform === '自訂文字' ? (link.name.trim() || '自訂連結') : link.platform,
          url: link.url.trim()
        }));

      let resolvedDurationSeconds = trackToEdit?.durationSeconds || 0;
      if (audioFile) {
        resolvedDurationSeconds = audioDurationSeconds || await readAudioDurationSeconds(audioFile).catch(() => 0);
      }
      const resolvedDurationLabel = audioFile
        ? formatDurationLabel(resolvedDurationSeconds)
        : (trackToEdit?.duration || formatDurationLabel(resolvedDurationSeconds));

      const payload = {
        title: title.trim(),
        speaker: resolvedSpeaker,
        speakerRank: speakerRank.trim() || '無',
        speakerAvatar: finalCoverUrl,
        categories: selectedCategories.slice(0, 3),
        keywords: keywords.slice(0, 20),
        series: series.trim(),
        speechDate: speechDate.trim(),
        requiredRank,
        authorizedOnlyVisible,
        guestVisible: authorizedOnlyVisible ? false : guestVisible,
        stickerUnlockCost,
        commentStickerReward,
        stickerOperationId: crypto.randomUUID(),
        seriesOrder: seriesOrder.trim(),
        description: description.trim(),
        audioUrl: finalAudioUrl,
        uploaderId: trackToEdit ? trackToEdit.uploaderId : currentUser?.id,
        uploaderEmail: trackToEdit ? trackToEdit.uploaderEmail : (currentUser?.email || (isAdmin ? 'yukidu@gmail.com' : 'contributor')),
        userEmail: currentUser?.email || (isAdmin ? 'yukidu@gmail.com' : ''),
        externalVideos: cleanVideos,
        externalPpts: cleanPpts,
        externalFiles: cleanFiles,
        socialLinks: cleanSocialLinks,
        duration: resolvedDurationLabel,
        durationSeconds: resolvedDurationSeconds,
        isPrivateVip,
        vipDurationDays: isPrivateVip ? vipDurationDays : 0,
        vipToken: trackToEdit?.vipToken
      };

      const url = trackToEdit ? `/api/tracks/${encodeURIComponent(trackToEdit.id)}` : '/api/tracks';
      const method = trackToEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(trackToEdit
          ? Object.fromEntries(Object.entries(payload).filter(([key, value]) => key === 'userEmail' || JSON.stringify(value) !== JSON.stringify((trackToEdit as any)[key])))
          : payload)
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || '伺服器處理失敗');
      }

      const resData = await res.json();
      const trackObj = (resData && typeof resData === 'object' && ('track' in resData)) ? resData.track : resData;
      const normalizedTrack = {
        ...trackObj,
        ratings: (trackObj && typeof trackObj.ratings === 'object' && trackObj.ratings !== null) ? trackObj.ratings : {},
        likedBy: Array.isArray(trackObj?.likedBy) ? trackObj.likedBy : [],
        categories: Array.isArray(trackObj?.categories) ? trackObj.categories : (selectedCategories.length > 0 ? selectedCategories.slice(0, 3) : ['未分類']),
        keywords: Array.isArray(trackObj?.keywords) ? trackObj.keywords : (keywords.length > 0 ? keywords.slice(0, 20) : []),
        rating: typeof trackObj?.rating === 'number' ? trackObj.rating : 5.0,
        ratingCount: typeof trackObj?.ratingCount === 'number' ? trackObj.ratingCount : 1,
        commentsCount: typeof trackObj?.commentsCount === 'number' ? trackObj.commentsCount : 0,
        likes: typeof trackObj?.likes === 'number' ? trackObj.likes : 0,
        playCount: typeof trackObj?.playCount === 'number' ? trackObj.playCount : 0,
        stickerUnlockCost: Number(trackObj?.stickerUnlockCost ?? stickerUnlockCost ?? 0),
        commentStickerReward: Number(trackObj?.commentStickerReward ?? commentStickerReward ?? 0),
        authorizedOnlyVisible: Boolean(trackObj?.authorizedOnlyVisible ?? authorizedOnlyVisible),
        guestVisible: Boolean(trackObj?.guestVisible ?? (authorizedOnlyVisible ? false : guestVisible)),
        socialLinks: Array.isArray(trackObj?.socialLinks) ? trackObj.socialLinks : cleanSocialLinks
      };
      if (!trackObj?.id || (trackToEdit && trackObj.id !== trackToEdit.id)) {
        throw new Error('伺服器未回傳已儲存的音檔，請重試。');
      }
      onSuccess(normalizedTrack);
      window.dispatchEvent(new CustomEvent('echostars:sticker-changed'));
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || '上傳失敗，請檢查網路連線');
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="upload-modal-overlay upload-page">
      <div className="w-full bg-white dark:bg-slate-900">
        {/* Header - Requirement 20: 統一底色與麥克風相同色 */}
        <div
          className="p-4 sm:p-5 flex items-center justify-between text-white"
          style={{ backgroundColor: 'var(--color-primary, #c06c84)' }}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center text-white">
              <UploadCloud className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white">
                {trackToEdit ? '編輯音檔' : '上傳音檔'}
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-2"><button form="track-upload-form" type="submit" disabled={isUploading} className="px-3 py-2 rounded-lg bg-white/20 text-sm">{isUploading?'儲存中…':'儲存'}</button><button type="button" onClick={onClose} disabled={isUploading} className="px-2 py-2 text-sm">取消</button></div>
          <button
            onClick={onClose}
            className="p-1.5 text-white/80 hover:text-white rounded-lg hover:bg-white/20"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form id="track-upload-form" onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-4 text-xs">
          {errorMessage && (
            <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/60 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 rounded-2xl border border-amber-200/70 dark:border-slate-700 bg-amber-50/50 dark:bg-slate-800/50 p-3">
            <label className="font-bold text-slate-700 dark:text-slate-200">
              解鎖本錄音所需貼紙
              <ThemedSelect value={stickerUnlockCost} onChange={e => setStickerUnlockCost(Number(e.target.value))} className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                {Array.from({ length: 51 }, (_, i) => i).map(value => <option key={value} value={value}>{value === 0 ? '0（免貼紙）' : `${value} 張`}</option>)}
              </ThemedSelect>
            </label>
            <label className="font-bold text-slate-700 dark:text-slate-200">
              聽完後留言心得獲得貼紙
              <ThemedSelect value={commentStickerReward} onChange={e => setCommentStickerReward(Number(e.target.value))} className="mt-1 w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                {Array.from({ length: 21 }, (_, i) => i).map(value => <option key={value} value={value}>{value === 0 ? '0（不發放）' : `${value} 張`}</option>)}
              </ThemedSelect>
            </label>
          </div>

          {/* 1. Audio Drag and Drop Area */}
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
              音訊檔案 * (上限 100MB，防護 0 byte)
            </label>
            <div
              onClick={() => audioInputRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => {
                e.preventDefault();
                if (e.dataTransfer.files?.[0]) handleAudioSelected(e.dataTransfer.files[0]);
              }}
              className={`border-2 border-dashed rounded-2xl p-4 text-center cursor-pointer transition-all ${
                audioFile
                  ? 'border-emerald-400 bg-emerald-50/50 dark:bg-emerald-950/30'
                  : 'border-slate-200 dark:border-slate-700 hover:border-rose-300 bg-slate-50/50 dark:bg-slate-800/40'
              }`}
            >
              <input
                ref={audioInputRef}
                type="file"
                accept={SUPPORTED_AUDIO_ACCEPT}
                className="hidden"
                onChange={e => {
                  if (e.target.files?.[0]) handleAudioSelected(e.target.files[0]);
                }}
              />
              {audioFile ? (
                <div className="flex items-center justify-center gap-2 text-emerald-700 dark:text-emerald-300">
                  <CheckCircle className="w-5 h-5" />
                  <div className="text-left">
                    <p className="font-bold text-xs">{audioFile.name}</p>
                    <p className="text-[11px] opacity-75">
                      {(audioFile.size / 1024 / 1024).toFixed(2)} MB • {audioDurationSeconds ? formatDurationLabel(audioDurationSeconds) : '讀取長度中…'} • 直傳 Cloudflare R2
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-slate-500">
                  <FileAudio className="w-6 h-6 text-rose-400 mb-1" />
                  <p className="font-semibold text-slate-700 dark:text-slate-200">
                    點擊選取或拖曳音訊檔至此
                  </p>
                  <p className="text-slate-400 text-[10px]">
                    支援 MP3、M4A、AAC、WAV、OGG、OPUS、WEBM（可用時自動抓取 ID3 標籤）
                  </p>
                </div>
              )}
            </div>
            {isParsingId3 && (
              <p className="text-rose-600 mt-1 flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 animate-spin" />
                正在自動解析 ID3 標籤與講者資訊...
              </p>
            )}
          </div>

          {/* 2. Cover Photo Area */}
          <div className="space-y-2">
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
              主講者封面照片 (上限 10MB)
            </label>
            <div className="flex items-center gap-3">
              <div
                onClick={() => coverInputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; }}
                onDrop={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  if (e.dataTransfer.files?.[0]) handleCoverSelected(e.dataTransfer.files[0]);
                }}
                className="w-16 h-16 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center overflow-hidden cursor-pointer hover:border-rose-400 bg-slate-50 dark:bg-slate-800 shrink-0"
                title="點擊選擇或拖曳照片到此"
              >
                <input
                  ref={coverInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => {
                    if (e.target.files?.[0]) handleCoverSelected(e.target.files[0]);
                  }}
                />
                {coverPreview ? (
                  <img src={coverPreview} alt="預覽封面" className="w-full h-full object-cover" />
                ) : (
                  <ImageIcon className="w-5 h-5 text-slate-400" />
                )}
              </div>
              <div className="text-[11px] text-slate-500">
                <p className="font-semibold text-slate-700 dark:text-slate-300">
                  {coverFile ? coverFile.name : (coverPreview ? '已選用 R2 現有封面' : '未選擇照片 (使用預設精美頭像)')}
                </p>
                <p className="text-slate-400">
                  可點擊或拖曳上傳；若音檔內含封面會自動擷取。R2 檔名仍使用「演講人名字.副檔名」，同名自動加數字編號
                </p>
              </div>
            </div>

            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800/40 p-2.5">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="font-bold text-slate-700 dark:text-slate-200">
                  R2 已有演講者照片
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-400">
                    {isCoverLibraryLoading ? '同步中…' : `${coverLibrary.length} 張`}
                  </span>
                  <button
                    type="button"
                    onClick={() => void loadCoverLibrary(true)}
                    disabled={isCoverLibraryLoading}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-bold text-slate-600 hover:border-rose-300 hover:text-rose-600 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                    title="直接重新讀取 R2 cover/，同步已新增或已刪除的封面"
                  >
                    <RefreshCw className={`h-3 w-3 ${isCoverLibraryLoading ? 'animate-spin' : ''}`} />
                    同步 R2
                  </button>
                </div>
              </div>
              <div className="relative mb-2">
                <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={coverSearch}
                  onChange={e => setCoverSearch(e.target.value)}
                  placeholder="搜尋演講者照片..."
                  className="w-full pl-8 pr-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-hidden focus:border-rose-400 text-xs"
                />
                {coverSearch && coverSearchSuggestions.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {coverSearchSuggestions.map(item => (
                      <button
                        key={`suggest-${item.key}`}
                        type="button"
                        onClick={() => setCoverSearch(item.name)}
                        className="px-2 py-0.5 rounded-lg text-[10px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                      >
                        {item.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {isCoverLibraryLoading ? (
                <div className="py-4 text-center text-slate-400 text-[11px]">正在讀取 R2 cover/ 圖庫…</div>
              ) : filteredCoverLibrary.length > 0 ? (
                <div className="grid grid-cols-5 sm:grid-cols-8 gap-1.5 max-h-40 overflow-y-auto pr-1">
                  {filteredCoverLibrary.map(item => {
                    const selected = coverPreview === item.url;
                    return (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => handleSelectCoverFromLibrary(item)}
                        className={`p-1 rounded-lg border text-left transition-all cursor-pointer ${
                          selected
                            ? 'border-rose-500 bg-rose-50 dark:bg-rose-950/40 ring-1 ring-rose-400'
                            : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:border-rose-300'
                        }`}
                        title={`使用 ${item.name} 的照片`}
                      >
                        <img
                          src={item.url}
                          alt={item.name}
                          loading="lazy"
                          className="w-full aspect-square rounded-md object-cover bg-slate-100 dark:bg-slate-800"
                        />
                        <span className="block mt-0.5 text-[9px] font-bold text-slate-700 dark:text-slate-200 truncate">
                          {selected ? '✓ ' : ''}{item.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div className="py-3 text-center text-slate-400 text-[11px]">
                  R2 cover/ 目前沒有可選照片，可直接點上方方框新增。
                </div>
              )}
            </div>
          </div>

          {/* 3. Categories Selection (Requirement 5: 限制最多只能選三個) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block font-bold text-slate-700 dark:text-slate-300">
                分類標籤 (最多可選 3 個，已選 {selectedCategories.length}/3)
              </label>
              <span className="text-[10px] text-slate-400">
                點擊標籤選取；右側按鈕可編輯或刪除標籤
              </span>
            </div>

            {/* Existing Categories List with Inline Edit & Delete */}
            <div className="flex flex-wrap gap-1.5 p-2 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/60 dark:border-slate-800">
              {categoryList.map(cat => {
                const isSelected = selectedCategories.includes(cat as CategoryType);
                const isEditing = editingCatOld === cat;

                if (isEditing) {
                  return (
                    <div
                      key={cat}
                      className="inline-flex items-center gap-1 bg-white dark:bg-slate-800 px-2 py-0.5 rounded-lg border border-rose-300 shadow-2xs"
                    >
                      <input
                        type="text"
                        value={editingCatNew}
                        onChange={e => setEditingCatNew(e.target.value)}
                        className="text-xs px-1 py-0.5 w-20 bg-transparent text-slate-900 dark:text-white outline-hidden font-bold"
                        autoFocus
                      />
                      <button
                        type="button"
                        onClick={() => handleUpdateCategory(cat)}
                        className="p-1 rounded-md bg-emerald-500 text-white"
                        title="確認儲存"
                      >
                        <Check className="w-3 h-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingCatOld(null)}
                        className="p-1 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300"
                        title="取消"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  );
                }

                return (
                  <div
                    key={cat}
                    className={`group inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-xs font-semibold border transition-all ${
                      isSelected
                        ? 'bg-rose-500 text-white border-rose-500 shadow-2xs'
                        : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:border-rose-300'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => toggleCategory(cat as CategoryType)}
                      className="cursor-pointer"
                    >
                      {isSelected ? `✓ ${cat}` : `+ ${cat}`}
                    </button>

                    {/* Edit Tag Name */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingCatOld(cat);
                        setEditingCatNew(cat);
                      }}
                      className={`p-0.5 rounded-md hover:bg-black/10 dark:hover:bg-white/10 ${
                        isSelected ? 'text-white/80 hover:text-white' : 'text-slate-400 hover:text-slate-600'
                      }`}
                      title="修改標籤名稱"
                    >
                      <Edit2 className="w-2.5 h-2.5" />
                    </button>

                    {/* Delete Tag */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteCategoryTag(cat);
                      }}
                      className={`p-0.5 rounded-md hover:bg-rose-600/30 ${
                        isSelected ? 'text-white/80 hover:text-white' : 'text-slate-400 hover:text-rose-600'
                      }`}
                      title="刪除此標籤"
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* Quick Add New Category Input */}
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={newCatInput}
                onChange={e => setNewCatInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleCreateCategory();
                  }
                }}
                placeholder="輸入新標籤名稱 (例如: 心態、營養、產品故事)..."
                className="flex-1 px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-hidden focus:border-rose-400"
              />
              <button
                type="button"
                disabled={isCatLoading || !newCatInput.trim()}
                onClick={() => handleCreateCategory()}
                className="px-3 py-1.5 rounded-xl bg-slate-800 dark:bg-slate-700 hover:bg-rose-600 dark:hover:bg-rose-600 text-white text-xs font-bold disabled:opacity-50 flex items-center gap-1 transition-colors shrink-0 shadow-2xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>新增標籤</span>
              </button>
            </div>
          </div>

          {/* 4. Text Fields Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-0.5">
                演講主題 (title) *
              </label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="例：把目標變成業績的關鍵心法"
                className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-hidden focus:border-rose-400"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-0.5">
                演講人 (TPE1)
              </label>
              <input
                type="text"
                value={speaker}
                onChange={e => setSpeaker(e.target.value)}
                placeholder="例：陳志豪"
                className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-hidden focus:border-rose-400"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-0.5">
                <label className="block font-bold text-slate-700 dark:text-slate-300">
                  講師獎銜
                </label>
                {speakerRank !== '無' && (
                  <span className="text-[11px] font-bold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/60 px-2 py-0.5 rounded-md border border-rose-200/60 dark:border-rose-900/60">
                    目前標記：{speakerRank}
                  </span>
                )}
              </div>
              <ThemedSelect
                value={baseSpeakerRank}
                onChange={e => handleBaseRankChange(e.target.value)}
                className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-hidden focus:border-rose-400 font-medium cursor-pointer"
              >
                {Array.from(new Set([baseSpeakerRank, ...SPEAKER_RANK_OPTIONS])).map(opt => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </ThemedSelect>

              {/* 執行專才鑽石包含之後的獎銜，出現「GAR全球獎銜」勾選選項 */}
              {GAR_ELIGIBLE_RANKS.includes(baseSpeakerRank) && (
                <label className="flex items-center gap-2 mt-2 px-3 py-2 rounded-xl bg-gradient-to-r from-amber-50 to-rose-50 dark:from-amber-950/30 dark:to-rose-950/30 border border-amber-300/80 dark:border-amber-800/60 cursor-pointer shadow-2xs hover:brightness-95 transition-all">
                  <input
                    type="checkbox"
                    checked={isGarRank}
                    onChange={e => setIsGarRank(e.target.checked)}
                    className="w-4 h-4 rounded text-rose-600 focus:ring-rose-500 accent-rose-500 cursor-pointer"
                  />
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs sm:text-sm font-black text-amber-900 dark:text-amber-200">
                      GAR全球獎銜
                    </span>
                    <span className="text-[11px] text-amber-700 dark:text-amber-400 font-semibold">
                      (勾選後儲存與檔案名稱將加上 GAR，顯示為：GAR{baseSpeakerRank})
                    </span>
                  </div>
                </label>
              )}
            </div>

            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-0.5">
                系列 (TALB)
              </label>
              <input
                type="text"
                value={series}
                onChange={e => setSeries(e.target.value)}
                placeholder="例：事業進階系列"
                className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-hidden focus:border-rose-400"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-0.5">
                演講日期 (TDRC)
              </label>
              <input
                type="text"
                value={speechDate}
                onChange={e => setSpeechDate(e.target.value)}
                placeholder="YYYY/MM/DD"
                className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-hidden focus:border-rose-400"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-0.5">
                系列順序 (TRCK)
              </label>
              <input
                type="text"
                value={seriesOrder}
                onChange={e => setSeriesOrder(e.target.value)}
                placeholder="例：第 1 集"
                className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-hidden focus:border-rose-400"
              />
            </div>

            {/* 瀏覽清單可見性 */}
            <div data-upload-guest-visibility="true" className="sm:col-span-2 rounded-xl border border-slate-200 dark:border-slate-700 p-3">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                <label className={`flex items-center gap-2 font-bold ${authorizedOnlyVisible ? 'text-slate-400 cursor-not-allowed' : 'text-slate-700 dark:text-slate-300'}`}>
                  <input type="checkbox" checked={guestVisible} disabled={authorizedOnlyVisible} onChange={event => setGuestVisible(event.target.checked)} />
                  訪客可見
                </label>
                <label className="flex items-center gap-2 font-bold text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input type="checkbox" checked={authorizedOnlyVisible} onChange={event => { const checked = event.target.checked; setAuthorizedOnlyVisible(checked); if (checked) setGuestVisible(false); }} />
                  只對有權限者顯示
                </label>
              </div>
              <p className="mt-1 text-xs text-slate-500">勾選「只對有權限者顯示」後，未達瀏覽權限的會員與所有訪客都不會在首頁看到此音檔；「訪客可見」會自動取消並鎖定。</p>
            </div>
            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-0.5">
                瀏覽權限最低門檻獎銜（含該獎銜以上皆可收聽）
              </label>
              <ThemedSelect
                value={requiredRank}
                onChange={e => setRequiredRank(e.target.value as AmwayRank)}
                className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-hidden focus:border-rose-400"
              >
                {!['無', '3%', '9%', '15%', '銀章', '白金', '翡翠', '鑽石級以上'].includes(requiredRank) && <option value={requiredRank}>{requiredRank}</option>}
                <option value="無">公開</option>
                <option value="3%">3%</option>
                <option value="9%">9%</option>
                <option value="15%">15%</option>
                <option value="銀章">銀章</option>
                <option value="白金">白金級</option>
                <option value="翡翠">翡翠級</option>
                <option value="鑽石級以上">鑽石級</option>
              </ThemedSelect>
            </div>

            {/* Requirement 6: 私秘VIP 獨立選項 */}
            <div className="col-span-1 sm:col-span-2 p-3 sm:p-3.5 rounded-2xl bg-gradient-to-r from-purple-50/90 via-white to-amber-50/70 dark:from-purple-950/40 dark:via-slate-900 dark:to-slate-900 border-2 border-purple-200 dark:border-purple-900/60 space-y-2">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isPrivateVip}
                    onChange={e => {
                      const cleanEmail = currentUser?.email?.toLowerCase().trim();
                      const isOwner = isAdmin || cleanEmail === 'yukidu@gmail.com';
                      const myVipTracksCount = tracks ? tracks.filter(t => t.isPrivateVip && (t.uploaderEmail === cleanEmail || t.uploaderId === currentUser?.id)).length : 0;
                      if (e.target.checked && !isOwner && myVipTracksCount >= 10 && !trackToEdit?.isPrivateVip) {
                        setErrorMessage('每位貢獻者上限最多上傳 10 個私秘 VIP 音檔，您目前已達上限 (10/10)。');
                        return;
                      }
                      setErrorMessage(null);
                      setIsPrivateVip(e.target.checked);
                    }}
                    className="w-4 h-4 text-purple-600 rounded-md border-purple-300 focus:ring-purple-500 cursor-pointer"
                  />
                  <span className="font-extrabold text-sm text-purple-900 dark:text-purple-200 flex items-center gap-1.5">
                    <Crown className="w-4 h-4 text-amber-500" />
                    <span>私秘 VIP 專屬音檔</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300 font-bold">
                      獨立限定
                    </span>
                  </span>
                </label>

                <span className="text-[11px] font-mono font-bold text-purple-700 dark:text-purple-300">
                  {isAdmin || currentUser?.email === 'yukidu@gmail.com' ? '超級管理員 (無上限)' : `貢獻者配額：${tracks ? tracks.filter(t => t.isPrivateVip && (t.uploaderEmail === currentUser?.email || t.uploaderId === currentUser?.id)).length : 0}/10 首`}
                </span>
              </div>

              <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                勾選「私秘VIP」後，只有擁有專屬 VIP 連結者方可瀏覽與聆聽該音檔（訪客未登入持有連結亦可直接收聽）。此音檔同時也會顯示在首頁清單。
              </p>

              {isPrivateVip && (
                <div className="pt-2 border-t border-purple-200/60 dark:border-purple-900/40 flex flex-wrap items-center gap-3 text-xs animate-in fade-in">
                  <label className="font-bold text-purple-900 dark:text-purple-200 shrink-0">
                    專屬連結有效天數：
                  </label>
                  <ThemedSelect
                    value={vipDurationDays}
                    onChange={e => setVipDurationDays(Number(e.target.value))}
                    className="px-2.5 py-1.5 rounded-xl border border-purple-300 dark:border-purple-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 font-bold outline-hidden"
                  >
                    <option value={0}>永久有效 (預設)</option>
                    <option value={3}>3 天後失效</option>
                    <option value={7}>7 天後失效</option>
                    <option value={14}>14 天後失效</option>
                    <option value={30}>30 天後失效</option>
                  </ThemedSelect>
                  <span className="text-[10px] text-slate-400">
                    發布後可至「後台管理中心 &gt; 私秘VIP」重置連結或隨時刪除
                  </span>
                </div>
              )}
            </div>

            <div>
              <label className="block font-bold text-slate-700 dark:text-slate-300 mb-0.5">
                今天上傳日期 (系統自動產生，不可修改)
              </label>
              <input
                type="text"
                value={todayUploadDate}
                disabled
                className="w-full px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/50 text-slate-400 cursor-not-allowed"
              />
            </div>
          </div>

          {/* 社群連結（可多個） */}
          <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between gap-2">
              <label className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1"><Link className="w-3.5 h-3.5"/><span>社群連結（可新增多個網址）</span></label>
              <button type="button" onClick={() => setSocialLinks([...socialLinks, { platform: 'IG', name: 'IG', url: '' }])} className="text-rose-600 dark:text-rose-400 hover:underline flex items-center gap-0.5 text-[11px]"><Plus className="w-3 h-3"/>新增社群連結</button>
            </div>
            {socialLinks.map((link, i) => (
              <div key={i} className="grid grid-cols-[8rem_1fr_auto] gap-2 items-center">
                <ThemedSelect value={link.platform} onChange={e => { const platform=e.target.value as SocialPlatform; setSocialLinks(prev => prev.map((item,idx)=>idx===i?{...item,platform,name:platform==='自訂文字'?'':platform}:item)); }} className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
                  {SOCIAL_PLATFORM_OPTIONS.map(platform => <option key={platform} value={platform}>{platform}</option>)}
                </ThemedSelect>
                <div className="min-w-0 flex gap-2">
                  {link.platform === '自訂文字' && <input type="text" value={link.name} onChange={e=>setSocialLinks(prev=>prev.map((item,idx)=>idx===i?{...item,name:e.target.value}:item))} placeholder="自訂顯示名稱" className="w-1/3 min-w-24 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"/>}
                  <input type="url" value={link.url} onChange={e=>setSocialLinks(prev=>prev.map((item,idx)=>idx===i?{...item,url:e.target.value}:item))} placeholder="https://..." className="flex-1 min-w-0 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"/>
                </div>
                <button type="button" onClick={()=>setSocialLinks(prev=>prev.length===1?[{ platform: 'IG', name: 'IG', url: '' }]:prev.filter((_,idx)=>idx!==i))} className="p-1 text-slate-400 hover:text-rose-600" title="刪除此社群連結"><Trash2 className="w-3.5 h-3.5"/></button>
              </div>
            ))}
          </div>

          {/* 5. 外部影片連結（可多個，自訂名稱） */}
          <div className="space-y-1.5 pt-1 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                <Youtube className="w-3.5 h-3.5 text-red-500" />
                <span>外部影片連結（可多個，可自訂名稱）</span>
              </label>
              <button
                type="button"
                onClick={() => setExternalVideos([...externalVideos, { name: '', url: '' }])}
                className="text-rose-600 dark:text-rose-400 hover:underline flex items-center gap-0.5 text-[11px]"
              >
                <Plus className="w-3 h-3" /> 新增影片
              </button>
            </div>
            {externalVideos.map((v, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="自訂連結名稱 (例: 產品示範精華)"
                  value={v.name}
                  onChange={e => {
                    const next = [...externalVideos];
                    next[i].name = e.target.value;
                    setExternalVideos(next);
                  }}
                  className="w-1/3 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
                <input
                  type="text"
                  placeholder="YouTube 網址 (https://...)"
                  value={v.url}
                  onChange={e => {
                    const next = [...externalVideos];
                    next[i].url = e.target.value;
                    setExternalVideos(next);
                  }}
                  className="flex-1 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
                {externalVideos.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setExternalVideos(externalVideos.filter((_, idx) => idx !== i))}
                    className="p-1 text-slate-400 hover:text-rose-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* 6. 外部 PPT 簡報連結（可多個，自訂名稱） */}
          <div className="space-y-1.5 pt-1 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <label className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                <FileText className="w-3.5 h-3.5 text-amber-500" />
                <span>外部 PPT 簡報檔連結（可多個，可自訂名稱）</span>
              </label>
              <button
                type="button"
                onClick={() => setExternalPpts([...externalPpts, { name: '', url: '' }])}
                className="text-rose-600 dark:text-rose-400 hover:underline flex items-center gap-0.5 text-[11px]"
              >
                <Plus className="w-3 h-3" /> 新增 PPT
              </button>
            </div>
            {externalPpts.map((p, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="自訂 PPT 名稱 (例: 事業商機簡報檔)"
                  value={p.name}
                  onChange={e => {
                    const next = [...externalPpts];
                    next[i].name = e.target.value;
                    setExternalPpts(next);
                  }}
                  className="w-1/3 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
                <input
                  type="text"
                  placeholder="簡報連結 (https://docs.google.com/... 或雲端)"
                  value={p.url}
                  onChange={e => {
                    const next = [...externalPpts];
                    next[i].url = e.target.value;
                    setExternalPpts(next);
                  }}
                  className="flex-1 px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800"
                />
                {externalPpts.length > 1 && (
                  <button
                    type="button"
                    onClick={() => setExternalPpts(externalPpts.filter((_, idx) => idx !== i))}
                    className="p-1 text-slate-400 hover:text-rose-600"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Description */}
          <div>
            <label className="block font-bold text-slate-700 dark:text-slate-300 mb-0.5">
              內容簡介
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={5}
              placeholder="輸入演講重點與摘要..."
              className="w-full min-h-32 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-hidden resize-y"
            />
          </div>

          <div className="flex justify-end gap-3 pb-6">
            <button type="button" onClick={onClose} disabled={isUploading} className="px-4 py-3">取消</button>
            <button type="submit" disabled={isUploading} className="rounded-xl px-5 py-3 text-white" style={{backgroundColor:'var(--color-primary,#c06c84)'}}>{isUploading ? '儲存中…' : '儲存音檔'}</button>
          </div>
        </form>
      </div>
    </div>
  );
};
