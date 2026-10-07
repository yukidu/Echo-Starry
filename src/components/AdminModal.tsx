import { effectiveMemberRank } from '../utils/ranks';
import { UplineManagement } from './UplineManagement';
import { ThemedSelect } from './ThemedSelect';
import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck,
  Users,
  Music,
  Trash2,
  Edit2,
  Lock,
  Unlock,
  AlertTriangle,
  Server,
  X,
  Check,
  CheckCircle,
  UserCheck,
  CheckSquare,
  Square,
  Eye,
  Share2,
  Filter,
  RotateCcw,
  Download,
  FileSpreadsheet,
  Search,
  Tag,
  Plus,
  BarChart3,
  Crown,
  ChevronLeft,
  ChevronRight,
  GripVertical
} from 'lucide-react';
import {
  Track,
  UserProfile,
  Comment,
  AmwayRank,
  RANK_ORDER,
  RESIDENCE_OPTIONS,
  CENTER_OPTIONS,
  JOIN_REASONS,
  JoinReason
} from '../types';
import { calculateNumerology } from '../utils/numerology';
import { MemberPreviewModal } from './MemberPreviewModal';
import { MemberExportModal } from './MemberExportModal';
import { DataCenterTab } from './DataCenterTab';
import { KeywordsTab } from './KeywordsTab';
import { VipTracksTab } from './VipTracksTab';

interface AdminModalProps {
  isOpen: boolean;
  presentation?: 'modal' | 'page';
  onClose: () => void;
  isAdmin: boolean;
  currentUser?: UserProfile | null;
  comments?: Comment[];
  users: UserProfile[];
  tracks: Track[];
  onUpdateUserFull: (userId: string, updated: Partial<UserProfile>) => Promise<void>;
  onBatchUpdateUsers?: (userIds: string[], updates: Partial<UserProfile>) => Promise<void>;
  onToggleContributor: (userId: string) => Promise<void>;
  onToggleAdminUser?: (userId: string) => Promise<void>;
  onToggleBlockUser: (userId: string) => Promise<void>;
  onDeleteTrack: (trackId: string) => Promise<void>;
  onEditTrack: (track: Track) => void;
  onUpdateTrack?: (
    trackId: string,
    updates: Partial<Track>,
    options?: { persist?: boolean }
  ) => Promise<void> | void;
  onSwitchToAdmin: () => void;
  onUplinesChanged?: () => void;
  onCategoriesUpdated?: (categories?: string[], change?: { oldName: string; newName?: string }) => void;
}

export const AdminModal: React.FC<AdminModalProps> = ({
  isOpen,
  presentation = 'modal',
  onClose,
  isAdmin,
  currentUser,
  comments = [],
  users,
  tracks,
  onUpdateUserFull,
  onBatchUpdateUsers,
  onToggleContributor,
  onToggleAdminUser,
  onToggleBlockUser,
  onDeleteTrack,
  onEditTrack,
  onUpdateTrack,
  onSwitchToAdmin,
  onCategoriesUpdated,
  onUplinesChanged
}) => {
  // Requirement 4 & 5: Check permissions (Yukidu is always super admin)
  const cleanEmail = currentUser?.email?.toLowerCase().trim();
  const tabsContainerRef = useRef<HTMLDivElement>(null);
  const handleScrollTabs = (direction: 'left' | 'right') => {
    if (tabsContainerRef.current) {
      tabsContainerRef.current.scrollBy({
        left: direction === 'left' ? -120 : 120,
        behavior: 'smooth'
      });
    }
  };
  const isEffectiveAdmin =
    isAdmin ||
    cleanEmail === 'yukidu@gmail.com' ||
    currentUser?.role === '超級管理員' ||
    currentUser?.id === 'u-admin';
  // Destructive member deletion is intentionally stricter than the broader admin UI.
  // Only the single verified super-admin email may even see the control.
  const isSuperAdminAccount = cleanEmail === 'yukidu@gmail.com';

  const userRank = currentUser ? effectiveMemberRank(currentUser, '') : '';
  const isDiamondOrAbove = userRank.includes('鑽石') || userRank.includes('皇冠') || userRank.includes('大使');
  // Requirement 2: 「白金」含白金以上可以使用「數據中心」
  const isPlatinumOrAbove = isEffectiveAdmin || isDiamondOrAbove || (() => {
    if (!userRank) return false;
    if (
      userRank.includes('白金') ||
      userRank.includes('翡翠') ||
      userRank.includes('明珠') ||
      userRank.includes('紅寶石') ||
      userRank.includes('藍寶石')
    ) {
      return true;
    }
    const idx = (RANK_ORDER as readonly string[]).indexOf(userRank);
    return idx >= 26; // index of '白金'
  })();
  const isDiamondOnly = isDiamondOrAbove && !isEffectiveAdmin;
  const isContributorOnly = currentUser?.isContributor === true && !isEffectiveAdmin && !isDiamondOrAbove;

  // Requirement 1, 2, 4 & 6: Tabs: 數據中心, 會員, 音檔, 分類標籤, 網友關鍵字, 私秘VIP, 權限
  const [activeTab, setActiveTab] = useState<'data-center' | 'users' | 'tracks' | 'categories' | 'keywords' | 'vip' | 'permissions' | 'uplines'>(
    isContributorOnly ? 'tracks' : 'data-center'
  );

  // Quick preview member modal state (Requirement 2)
  const [previewUser, setPreviewUser] = useState<UserProfile | null>(null);

  // Deletion confirm state without window.confirm (Requirement 17)
  const [deletingTrackId, setDeletingTrackId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [isDeletingUser, setIsDeletingUser] = useState(false);

  // Single user editing state
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [userForm, setUserForm] = useState<Partial<UserProfile>>({});

  // Requirement 5: 學員搜尋功能 (鑽石權限亦可使用)
  const [userSearchQuery, setUserSearchQuery] = useState('');

  // Requirement 6: Selection & Export State
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  // Batch Update State
  const [isBatchApplying, setIsBatchApplying] = useState(false);
  const [batchCenter, setBatchCenter] = useState('');
  const [batchRank, setBatchRank] = useState('');
  const [batchDiamondUpline, setBatchDiamondUpline] = useState('');
  const [batchContributor, setBatchContributor] = useState<'grant' | 'revoke' | ''>('');

  // Requirement 8: 分類標籤管理狀態
  const [categoryList, setCategoryList] = useState<string[]>([]);
  const [newCatName, setNewCatName] = useState('');
  const [editingCatOld, setEditingCatOld] = useState<string | null>(null);
  const [editingCatNew, setEditingCatNew] = useState('');
  const [isCatSubmitting, setIsCatSubmitting] = useState(false);

  // v3.7: category order is shared with the homepage category dropdown.
  // Mobile requires a long-press before dragging so normal page scrolling is not
  // accidentally converted into a reorder gesture. Only pointer-up persists to D1.
  const [draggingCategory, setDraggingCategory] = useState<string | null>(null);
  const [isCategoryOrderSaving, setIsCategoryOrderSaving] = useState(false);
  const categoryListRef = useRef<string[]>([]);
  const categoryDragTimerRef = useRef<number | null>(null);
  const categoryDragNameRef = useRef<string | null>(null);
  const categoryDragActiveRef = useRef(false);
  const categoryDragPointerIdRef = useRef<number | null>(null);
  const categoryDragStartPointRef = useRef<{ x: number; y: number } | null>(null);
  const categoryOrderBeforeDragRef = useRef<string[]>([]);
  const categoryDragOrderRef = useRef<string[]>([]);

  useEffect(() => {
    categoryListRef.current = categoryList;
  }, [categoryList]);

  const clearCategoryDragTimer = () => {
    if (categoryDragTimerRef.current !== null) {
      window.clearTimeout(categoryDragTimerRef.current);
      categoryDragTimerRef.current = null;
    }
  };

  const persistCategoryOrder = async (order: string[], fallbackOrder: string[]) => {
    setIsCategoryOrderSaving(true);
    try {
      const res = await fetch('/api/categories/order', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categories: order })
      });
      if (!res.ok) throw new Error(`分類排序儲存失敗：${res.status}`);

      const data = await res.json().catch(() => ({}));
      const savedOrder = Array.isArray(data?.categories) ? data.categories : order;
      categoryListRef.current = savedOrder;
      setCategoryList(savedOrder);
      onCategoriesUpdated?.(savedOrder);
    } catch (error) {
      console.error(error);
      window.alert('分類排序儲存失敗，已還原原順序。請重新開啟分類標籤後再試。');
      categoryListRef.current = fallbackOrder;
      setCategoryList(fallbackOrder);
      onCategoriesUpdated?.(fallbackOrder);
    } finally {
      setIsCategoryOrderSaving(false);
    }
  };

  const handleCategoryDragPointerDown = (
    cat: string,
    event: React.PointerEvent<HTMLButtonElement>
  ) => {
    if (event.pointerType === 'touch' || !event.isPrimary || event.button !== 0) return;
    if (isCategoryOrderSaving || isCatSubmitting || editingCatOld !== null || cat === '全部') return;

    clearCategoryDragTimer();
    categoryDragPointerIdRef.current = event.pointerId;
    categoryDragNameRef.current = cat;
    categoryDragStartPointRef.current = { x: event.clientX, y: event.clientY };
    categoryOrderBeforeDragRef.current = [...categoryListRef.current];
    categoryDragOrderRef.current = [...categoryListRef.current];

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is best-effort; elementFromPoint still handles the move.
    }

    categoryDragActiveRef.current = true;
    setDraggingCategory(cat);
  };

  const handleCategoryTouchStart = (cat: string, event: React.TouchEvent<HTMLButtonElement>) => {
    if (event.touches.length !== 1 || isCategoryOrderSaving || isCatSubmitting || editingCatOld !== null || cat === '全部') return;
    clearCategoryDragTimer();
    const touch = event.touches[0];
    categoryDragNameRef.current = cat;
    categoryDragStartPointRef.current = { x: touch.clientX, y: touch.clientY };
    categoryOrderBeforeDragRef.current = [...categoryListRef.current];
    categoryDragOrderRef.current = [...categoryListRef.current];
    categoryDragTimerRef.current = window.setTimeout(() => {
      categoryDragTimerRef.current = null;
      categoryDragActiveRef.current = true;
      setDraggingCategory(cat);
      navigator.vibrate?.(18);
    }, 420);
  };

  const handleCategoryDragPointerMove = (
    event: { clientX: number; clientY: number; preventDefault: () => void }
  ) => {
    const start = categoryDragStartPointRef.current;
    if (!categoryDragActiveRef.current) {
      if (
        start &&
        Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10
      ) {
        clearCategoryDragTimer();
      }
      return;
    }

    event.preventDefault();
    const dragged = categoryDragNameRef.current;
    if (!dragged) return;

    const targetElement = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>('[data-category-name]');
    const target = targetElement?.dataset.categoryName;
    if (!target || target === dragged) return;

    const targetRect = targetElement.getBoundingClientRect();
    const centerX = targetRect.left + targetRect.width / 2;
    const centerY = targetRect.top + targetRect.height / 2;
    const after =
      Math.abs(event.clientY - centerY) > targetRect.height * 0.3
        ? event.clientY > centerY
        : event.clientX > centerX;

    const prev = categoryListRef.current;
    const fromIndex = prev.indexOf(dragged);
    const targetIndex = prev.indexOf(target);
    if (fromIndex < 0 || targetIndex < 0) return;

    const next = prev.filter(item => item !== dragged);
    const targetIndexAfterRemoval = next.indexOf(target);
    const insertAt = Math.max(
      0,
      Math.min(
        next.length,
        targetIndexAfterRemoval + (after ? 1 : 0)
      )
    );
    next.splice(insertAt, 0, dragged);

    if (next.join('\u0000') === prev.join('\u0000')) return;
    categoryDragOrderRef.current = next;
    categoryListRef.current = next;
    setCategoryList(next);
  };

  const finishCategoryDrag = (cancelled = false) => {
    clearCategoryDragTimer();
    categoryDragPointerIdRef.current = null;
    categoryDragStartPointRef.current = null;

    const wasActive = categoryDragActiveRef.current;
    categoryDragActiveRef.current = false;
    setDraggingCategory(null);

    if (!wasActive) {
      categoryDragNameRef.current = null;
      return;
    }

    const before = categoryOrderBeforeDragRef.current;
    const next = categoryDragOrderRef.current;
    categoryDragNameRef.current = null;

    if (
      before.length === next.length &&
      before.join('\u0000') === next.join('\u0000')
    ) {
      return;
    }

    if (cancelled) {
      categoryListRef.current = before;
      setCategoryList(before);
      return;
    }
    void persistCategoryOrder(next, before);
  };

  useEffect(() => {
    const move = (event: TouchEvent) => {
      if (!categoryDragNameRef.current) return;
      if (event.touches.length !== 1) {
        finishCategoryDrag(true);
        return;
      }
      const touch = event.touches[0];
      handleCategoryDragPointerMove({
        clientX: touch.clientX, clientY: touch.clientY,
        preventDefault: () => event.preventDefault()
      });
    };
    const end = () => finishCategoryDrag();
    const cancel = () => finishCategoryDrag(true);
    // Keyed rows move in the DOM during sorting, which can release pointer
    // capture. Document listeners still receive the final pointer-up.
    const pointerMove = (event: PointerEvent) => {
      if (event.pointerId === categoryDragPointerIdRef.current) handleCategoryDragPointerMove(event);
    };
    const pointerEnd = (event: PointerEvent) => {
      if (event.pointerId === categoryDragPointerIdRef.current) finishCategoryDrag(event.type === 'pointercancel');
    };
    document.addEventListener('pointermove', pointerMove);
    document.addEventListener('pointerup', pointerEnd);
    document.addEventListener('pointercancel', pointerEnd);
    document.addEventListener('touchmove', move, { passive: false });
    document.addEventListener('touchend', end);
    document.addEventListener('touchcancel', cancel);
    return () => {
      document.removeEventListener('pointermove', pointerMove);
      document.removeEventListener('pointerup', pointerEnd);
      document.removeEventListener('pointercancel', pointerEnd);
      document.removeEventListener('touchmove', move);
      document.removeEventListener('touchend', end);
      document.removeEventListener('touchcancel', cancel);
    };
  });

  useEffect(() => {
    finishCategoryDrag(true);
    return () => {
      clearCategoryDragTimer();
    };
  }, [isOpen, activeTab]);

  const loadCategories = async () => {
    try {
      const res = await fetch('/api/categories');
      if (res.ok) {
        const data = await res.json();
        setCategoryList(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadCategories();
    }
  }, [isOpen]);

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName.trim() || isCatSubmitting || isCategoryOrderSaving || categoryDragNameRef.current) return;
    setIsCatSubmitting(true);
    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newCatName.trim() })
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || '儲存失敗，請稍後再試');
      }
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        if (Array.isArray(data?.categories)) setCategoryList(data.categories);
        setNewCatName('');
        if (onCategoriesUpdated) onCategoriesUpdated(Array.isArray(data?.categories) ? data.categories : undefined);
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : '儲存失敗，請稍後再試');
    } finally {
      setIsCatSubmitting(false);
    }
  };

  const handleRenameCategory = async (oldName: string) => {
    if (isCategoryOrderSaving || categoryDragNameRef.current) return;
    if (!editingCatNew.trim() || editingCatNew.trim() === oldName) {
      setEditingCatOld(null);
      return;
    }
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
        const data = await res.json().catch(() => ({}));
        if (Array.isArray(data?.categories)) setCategoryList(data.categories);
        setEditingCatOld(null);
        if (onCategoriesUpdated) onCategoriesUpdated(Array.isArray(data?.categories) ? data.categories : undefined, { oldName, newName: editingCatNew.trim() });
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : '儲存失敗，請稍後再試');
    }
  };

  const handleDeleteCategory = async (catName: string) => {
    if (isCategoryOrderSaving || categoryDragNameRef.current) return;
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
        if (onCategoriesUpdated) onCategoriesUpdated(Array.isArray(data?.categories) ? data.categories : undefined, { oldName: catName });
      }
    } catch (error) {
      alert(error instanceof Error ? error.message : '儲存失敗，請稍後再試');
    }
  };

  // Requirement 3: 5 Member Filter States
  const [filterCenter, setFilterCenter] = useState<string>('全部');
  const [filterRank, setFilterRank] = useState<string>('全部');
  const [filterDiamondUpline, setFilterDiamondUpline] = useState<string>('全部');
  const [filterContributor, setFilterContributor] = useState<string>('全部');
  const [filterLifeNumber, setFilterLifeNumber] = useState<string>('全部');

  // Filtered users calculation based on search query & 5 filters
  const filteredUsers = users.filter(u => {
    if (userSearchQuery.trim()) {
      const q = userSearchQuery.trim().toLowerCase();
      const matchName = u.name?.toLowerCase().includes(q);
      const matchEmail = u.email?.toLowerCase().includes(q);
      const matchAmwayId = u.amwayId?.toLowerCase().includes(q);
      const matchPhone = u.phone?.toLowerCase().includes(q);
      const matchCenter = u.center?.toLowerCase().includes(q);
      const matchSponsor = u.sponsor?.toLowerCase().includes(q);
      const matchDiamond = u.diamondUpline?.toLowerCase().includes(q);
      if (!matchName && !matchEmail && !matchAmwayId && !matchPhone && !matchCenter && !matchSponsor && !matchDiamond) {
        return false;
      }
    }
    if (filterCenter !== '全部' && (u.center || '無') !== filterCenter) return false;
    if (filterRank !== '全部' && effectiveMemberRank(u) !== filterRank) return false;
    if (filterDiamondUpline !== '全部' && (u.diamondUpline || '無') !== filterDiamondUpline) return false;
    if (filterContributor === '是' && !u.isContributor) return false;
    if (filterContributor === '否' && u.isContributor) return false;
    if (filterLifeNumber !== '全部') {
      const calc = calculateNumerology(u.birthday || '');
      const num = u.lifeNumber || calc?.lifeNumber;
      if (String(num) !== filterLifeNumber) return false;
    }
    return true;
  });

  const centerFilterOptions = ['全部', ...Array.from(new Set(users.map(u => u.center || '無').filter(Boolean)))];
  const rankFilterOptions = ['全部', ...RANK_ORDER];
  const diamondUplineFilterOptions = ['全部', ...Array.from(new Set(users.map(u => u.diamondUpline || '無').filter(Boolean)))];

  const hasActiveFilters =
    filterCenter !== '全部' ||
    filterRank !== '全部' ||
    filterDiamondUpline !== '全部' ||
    filterContributor !== '全部' ||
    filterLifeNumber !== '全部';

  const handleResetFilters = () => {
    setFilterCenter('全部');
    setFilterRank('全部');
    setFilterDiamondUpline('全部');
    setFilterContributor('全部');
    setFilterLifeNumber('全部');
  };

  if (!isOpen) return null;

  const handleStartEditUser = (user: UserProfile) => {
    setEditingUserId(user.id);
    setUserForm({
      name: user.name,
      amwayId: user.amwayId || '',
      phone: user.phone || '',
      residence: user.residence || '臺北',
      center: user.center || '無',
      rank: user.rank || '無',
      joinReason: user.joinReason || '事業',
      sponsor: user.sponsor || '',
      platinumUpline: user.platinumUpline || '',
      diamondUpline: user.diamondUpline || '',
      birthday: user.birthday || ''
    });
  };

  const handleSaveUserForm = async () => {
    if (!editingUserId) return;
    const calc = calculateNumerology(userForm.birthday || '');
    try {
      await onUpdateUserFull(editingUserId, {
        ...userForm,
        zodiac: calc?.zodiac,
        talentNumber: calc?.talentNumber,
        lifeNumber: calc?.lifeNumber
      });
      setEditingUserId(null);
    } catch (error) {
      alert(error instanceof Error ? error.message : '會員儲存失敗');
    }
  };

  const handleDeleteUser = async (user: UserProfile) => {
    if (!isSuperAdminAccount || isDeletingUser) return;
    if (user.email?.toLowerCase().trim() === 'yukidu@gmail.com') return;
    setIsDeletingUser(true);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(user.id)}`, {
        method: 'DELETE',
        cache: 'no-store'
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || '刪除會員失敗');
      setDeletingUserId(null);
      window.location.reload();
    } catch (error) {
      alert(error instanceof Error ? error.message : '刪除會員失敗，請稍後再試');
    } finally {
      setIsDeletingUser(false);
    }
  };

  // Batch Selection Handlers
  const handleToggleSelectAll = () => {
    if (selectedUserIds.length === users.length) {
      setSelectedUserIds([]);
    } else {
      setSelectedUserIds(users.map(u => u.id));
    }
  };

  const handleToggleSelectUser = (userId: string) => {
    setSelectedUserIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleApplyBatchUpdate = async () => {
    if (selectedUserIds.length === 0) return;
    setIsBatchApplying(true);

    const updates: Partial<UserProfile> = {};
    if (batchCenter) updates.center = batchCenter;
    if (batchRank) updates.rank = batchRank as AmwayRank;
    if (batchDiamondUpline.trim()) updates.diamondUpline = batchDiamondUpline.trim();
    if (batchContributor === 'grant') updates.isContributor = true;
    if (batchContributor === 'revoke') updates.isContributor = false;

    try {
      if (onBatchUpdateUsers) {
        await onBatchUpdateUsers(selectedUserIds, updates);
      } else {
        await Promise.all(selectedUserIds.map(id => onUpdateUserFull(id, updates)));
      }
      setSelectedUserIds([]);
      setBatchCenter('');
      setBatchRank('');
      setBatchDiamondUpline('');
      setBatchContributor('');
    } catch (error) {
      alert(error instanceof Error ? error.message : '批次儲存失敗');
    } finally {
      setIsBatchApplying(false);
    }
  };

  const isPagePresentation = presentation === 'page';

  return (
    <div className={isPagePresentation ? 'w-full' : 'app-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-xs overflow-y-auto'}>
      <div className={isPagePresentation
        ? 'bg-white dark:bg-slate-900 rounded-3xl w-full overflow-hidden border border-rose-100/60 dark:border-slate-800'
        : 'bg-white dark:bg-slate-900 rounded-3xl w-full max-w-4xl overflow-hidden shadow-2xl border border-rose-100/60 dark:border-slate-800 my-8'}>
        {/* Header - Requirement 20: 統一底色與麥克風相同色 */}
        <div
          className="p-4 sm:p-5 flex items-center justify-between text-white"
          style={{ backgroundColor: 'var(--color-primary, #c06c84)' }}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center text-white">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white flex items-center gap-2">
                <span>後台管理中心</span>

              </h3>
            </div>
          </div>
          {editingUserId && <div className="flex justify-end gap-2 text-xs">
                    <button
                      onClick={() => setEditingUserId(null)}
                      className="px-3 py-1 rounded-lg border border-slate-200 text-white"
                    >
                      取消
                    </button>
                    <button
                      onClick={handleSaveUserForm}
                      className="px-3 py-1 rounded-lg text-white font-bold"
                      style={{ backgroundColor: 'var(--color-primary, #c06c84)' }}
                    >
                      儲存
                    </button>
                  </div>}
          <button
            onClick={onClose}
            className="p-1.5 text-white/80 hover:text-white rounded-lg hover:bg-white/20"
            title={isPagePresentation ? '返回首頁' : '關閉'}
            aria-label={isPagePresentation ? '返回首頁' : '關閉'}
          >
            {isPagePresentation ? <ChevronLeft className="w-5 h-5" /> : <X className="w-5 h-5" />}
          </button>
        </div>

        {!isEffectiveAdmin && (
          <div className="p-3 bg-amber-50 dark:bg-amber-950/60 border-b border-amber-200 dark:border-amber-900 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
              <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600" />
              <span>尚未登入超級管理員帳號 (yukidu@gmail.com)</span>
            </div>
            <button
              onClick={onSwitchToAdmin}
              className="px-3 py-1 rounded-xl bg-amber-600 text-white font-bold shrink-0 hover:bg-amber-700"
            >
              使用 Google 登入
            </button>
          </div>
        )}

        {/* Navigation Tabs - Requirement 7: 後台管理中心的分頁標籤，左右文字排列要更緊密；Requirement 3: 左右二側增加 < > 符號 */}
        <div className="flex items-center border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 px-1 pt-1.5 gap-1">
          <button
            type="button"
            onClick={() => handleScrollTabs('left')}
            className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors shrink-0 cursor-pointer"
            title="向左移動標籤"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <div
            ref={tabsContainerRef}
            className="flex-1 flex items-center gap-0.5 sm:gap-1 text-[11px] sm:text-xs overflow-x-auto scrollbar-none scroll-smooth px-0.5"
          >
            {/* 1. 數據中心 */}
            {isPlatinumOrAbove && (
              <button
                onClick={() => setActiveTab('data-center')}
                className={`pb-1.5 px-1.5 sm:px-2 font-bold border-b-2 flex items-center gap-0.5 transition-colors shrink-0 ${
                  activeTab === 'data-center'
                    ? 'border-[var(--color-primary,#c06c84)] text-[var(--color-primary,#c06c84)]'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5 text-rose-500" />
                <span>數據中心</span>
              </button>
            )}

            {/* 2. 會員 */}
            {!isContributorOnly && (
              <button
                onClick={() => setActiveTab('users')}
                className={`pb-1.5 px-1.5 sm:px-2 font-bold border-b-2 flex items-center gap-0.5 transition-colors shrink-0 ${
                  activeTab === 'users'
                    ? 'border-[var(--color-primary,#c06c84)] text-[var(--color-primary,#c06c84)]'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>會員</span>
              </button>
            )}

            {/* 3. 音檔 */}
            {!isDiamondOnly && (
              <button
                onClick={() => setActiveTab('tracks')}
                className={`pb-1.5 px-1.5 sm:px-2 font-bold border-b-2 flex items-center gap-0.5 transition-colors shrink-0 ${
                  activeTab === 'tracks'
                    ? 'border-[var(--color-primary,#c06c84)] text-[var(--color-primary,#c06c84)]'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
                }`}
              >
                <Music className="w-3.5 h-3.5" />
                <span>音檔</span>
              </button>
            )}

            {/* 4. 私秘音檔 (Requirement 2 & 6: 原本名稱是：私秘VIP) */}
            {(isEffectiveAdmin || currentUser?.isContributor === true) && (
              <button
                onClick={() => setActiveTab('vip')}
                className={`pb-1.5 px-1.5 sm:px-2 font-bold border-b-2 flex items-center gap-0.5 transition-colors shrink-0 ${
                  activeTab === 'vip'
                    ? 'border-purple-600 text-purple-600 dark:text-purple-400'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
                }`}
              >
                <Crown className="w-3.5 h-3.5 text-purple-500" />
                <span>私秘音檔</span>
              </button>
            )}

            {/* 5. 分類標籤 */}
            {!isContributorOnly && (
              <button
                onClick={() => setActiveTab('categories')}
                className={`pb-1.5 px-1.5 sm:px-2 font-bold border-b-2 flex items-center gap-0.5 transition-colors shrink-0 ${
                  activeTab === 'categories'
                    ? 'border-[var(--color-primary,#c06c84)] text-[var(--color-primary,#c06c84)]'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
                }`}
              >
                <Tag className="w-3.5 h-3.5" />
                <span>分類標籤</span>
              </button>
            )}

            {/* 6. 網友關鍵字 */}
            {!isDiamondOnly && (
              <button
                onClick={() => setActiveTab('keywords')}
                className={`pb-1.5 px-1.5 sm:px-2 font-bold border-b-2 flex items-center gap-0.5 transition-colors shrink-0 ${
                  activeTab === 'keywords'
                    ? 'border-[var(--color-primary,#c06c84)] text-[var(--color-primary,#c06c84)]'
                    : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
                }`}
              >
                <Tag className="w-3.5 h-3.5 text-amber-500" />
                <span>網友關鍵字</span>
              </button>
            )}

            {(isEffectiveAdmin || currentUser?.isAdminUser || currentUser?.role==='管理員') && <button onClick={()=>setActiveTab('uplines')} className="pb-1.5 px-2 font-bold shrink-0" style={{color:activeTab==='uplines'?'var(--color-primary)':undefined}}>上手名單</button>}
            {/* 7. 權限表 (Requirement 2: 改為權限表) */}
            <button
              onClick={() => setActiveTab('permissions')}
              className={`pb-1.5 px-1.5 sm:px-2 font-bold border-b-2 flex items-center gap-0.5 transition-colors shrink-0 ${
                activeTab === 'permissions'
                  ? 'border-[var(--color-primary,#c06c84)] text-[var(--color-primary,#c06c84)]'
                  : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
              <span>權限表</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => handleScrollTabs('right')}
            className="p-1 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 transition-colors shrink-0 cursor-pointer"
            title="向右移動標籤"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Content */}
        <div className={isPagePresentation ? 'p-4 sm:p-5 space-y-3.5 text-xs' : 'p-4 sm:p-5 max-h-[65vh] overflow-y-auto space-y-3.5 text-xs'}>
          {activeTab==='uplines' && <UplineManagement onChanged={onUplinesChanged}/>}
          {/* TAB: 數據中心 (Requirement 2: 白金以上專屬) */}
          {activeTab === 'data-center' && isPlatinumOrAbove && (
            <DataCenterTab users={users} />
          )}

          {/* TAB 1: Member List, Search (Requirement 5), Filters & Export (Requirement 6) */}
          {activeTab === 'users' && (
            <div className="space-y-3">
              {/* Requirement 5: 新增「搜尋」功能，此功能「鑽石」權限也可以使用 */}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={userSearchQuery}
                  onChange={e => setUserSearchQuery(e.target.value)}
                  placeholder="搜尋學員姓名、Email、安麗編號、中心、上手鑽石、推薦人..."
                  className="w-full pl-9 pr-8 py-2 rounded-2xl text-xs bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 outline-hidden focus:ring-1 focus:ring-[var(--color-primary,#c06c84)]"
                />
                {userSearchQuery && (
                  <button
                    onClick={() => setUserSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {/* Requirement 3: 5 Member Filter Dropdowns (所屬直銷商中心、獎銜、上手鑽石、貢獻者、生命命數) */}
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700 space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200">
                    <Filter className="w-3.5 h-3.5 text-[var(--color-primary,#c06c84)]" />
                    <span>學員名冊篩選</span>
                    <span className="text-[11px] text-slate-500 font-normal">
                      (共 {filteredUsers.length} / {users.length} 位)
                    </span>
                  </div>
                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={handleResetFilters}
                      className="flex items-center gap-1 text-[11px] text-rose-600 dark:text-rose-400 hover:underline font-semibold"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>重設篩選</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5">
                  {/* 1. 所屬直銷商中心 */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                      所屬直銷商中心
                    </label>
                    <ThemedSelect
                      value={filterCenter}
                      onChange={e => setFilterCenter(e.target.value)}
                      className="w-full px-2 py-1 rounded-xl text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                    >
                      {centerFilterOptions.map(c => (
                        <option key={c} value={c}>
                          {c === '全部' ? '全部中心' : c}
                        </option>
                      ))}
                    </ThemedSelect>
                  </div>

                  {/* 2. 獎銜 */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                      獎銜
                    </label>
                    <ThemedSelect
                      value={filterRank}
                      onChange={e => setFilterRank(e.target.value)}
                      className="w-full px-2 py-1 rounded-xl text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                    >
                      {rankFilterOptions.map(r => (
                        <option key={r} value={r}>
                          {r === '全部' ? '全部獎銜' : r}
                        </option>
                      ))}
                    </ThemedSelect>
                  </div>

                  {/* 3. 上手鑽石 */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                      上手鑽石
                    </label>
                    <ThemedSelect
                      value={filterDiamondUpline}
                      onChange={e => setFilterDiamondUpline(e.target.value)}
                      className="w-full px-2 py-1 rounded-xl text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                    >
                      {diamondUplineFilterOptions.map(d => (
                        <option key={d} value={d}>
                          {d === '全部' ? '全部上手' : d}
                        </option>
                      ))}
                    </ThemedSelect>
                  </div>

                  {/* 4. 貢獻者 */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                      貢獻者
                    </label>
                    <ThemedSelect
                      value={filterContributor}
                      onChange={e => setFilterContributor(e.target.value)}
                      className="w-full px-2 py-1 rounded-xl text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                    >
                      <option value="全部">全部身份</option>
                      <option value="是">僅貢獻者</option>
                      <option value="否">非貢獻者</option>
                    </ThemedSelect>
                  </div>

                  {/* 5. 生命命數 */}
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                      生命命數
                    </label>
                    <ThemedSelect
                      value={filterLifeNumber}
                      onChange={e => setFilterLifeNumber(e.target.value)}
                      className="w-full px-2 py-1 rounded-xl text-xs border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
                    >
                      <option value="全部">全部命數</option>
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                        <option key={n} value={String(n)}>
                          {n} 號人
                        </option>
                      ))}
                    </ThemedSelect>
                  </div>
                </div>
              </div>

              {/* Requirement 6 & 3: Batch Action & Export Bar (開放給白金以上與管理員) */}
              {(isEffectiveAdmin || isPlatinumOrAbove) && (
                <div className="bg-slate-50 dark:bg-slate-800/60 p-3 rounded-2xl border border-slate-200/70 dark:border-slate-700 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleToggleSelectAll}
                        className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-100 hover:text-rose-600"
                      >
                        {selectedUserIds.length === filteredUsers.length && filteredUsers.length > 0 ? (
                          <CheckSquare className="w-4 h-4 text-rose-600" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-400" />
                        )}
                        <span>
                          {selectedUserIds.length === filteredUsers.length && filteredUsers.length > 0
                            ? '取消全選'
                            : `批次全選 (${filteredUsers.length})`}
                        </span>
                      </button>
                      {selectedUserIds.length > 0 && (
                        <span className="px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 font-bold">
                          已勾選 {selectedUserIds.length} 位
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {selectedUserIds.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setSelectedUserIds([])}
                          className="text-slate-400 hover:text-slate-600"
                        >
                          清除勾選
                        </button>
                      )}

                      {/* Requirement 6: 匯出按鈕（可指定欄位，匯出 PDF/Excel） */}
                      <button
                        type="button"
                        onClick={() => setIsExportModalOpen(true)}
                        className="px-3 py-1.5 rounded-xl text-white font-bold text-xs flex items-center gap-1.5 shadow-2xs hover:brightness-105 active:scale-95 transition-all"
                        style={{ backgroundColor: 'var(--color-primary, #c06c84)' }}
                        title="自訂欄位匯出 Excel 或 PDF"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>
                          {selectedUserIds.length > 0
                            ? `匯出已勾選 (${selectedUserIds.length}位)`
                            : `匯出名冊 (${filteredUsers.length}位)`}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Batch Edit Form (Only visible to Admin yukidu when at least 1 user is checked) */}
                  {isEffectiveAdmin && selectedUserIds.length > 0 && (
                    <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700 grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-0.5">
                          批次修改：所屬直銷商中心
                        </label>
                        <ThemedSelect
                          value={batchCenter}
                          onChange={e => setBatchCenter(e.target.value)}
                          className="w-full px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                        >
                          <option value="">不修改</option>
                          {CENTER_OPTIONS.map(c => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </ThemedSelect>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-0.5">
                          批次修改：最高獎銜
                        </label>
                        <ThemedSelect
                          value={batchRank}
                          onChange={e => setBatchRank(e.target.value)}
                          className="w-full px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                        >
                          <option value="">不修改</option>
                          {RANK_ORDER.map(r => (
                            <option key={r} value={r}>
                              {r}
                            </option>
                          ))}
                        </ThemedSelect>
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-0.5">
                          批次修改：上手鑽石
                        </label>
                        <input
                          type="text"
                          placeholder="例：王鑽石 (留空不修改)"
                          value={batchDiamondUpline}
                          onChange={e => setBatchDiamondUpline(e.target.value)}
                          className="w-full px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-0.5">
                          批次授權：協作者上傳權限
                        </label>
                        <ThemedSelect
                          value={batchContributor}
                          onChange={e => setBatchContributor(e.target.value as 'grant' | 'revoke' | '')}
                          className="w-full px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                        >
                          <option value="">不修改</option>
                          <option value="grant">批次設為協作者 (開啟上傳權限)</option>
                          <option value="revoke">批次取消協作者權限</option>
                        </ThemedSelect>
                      </div>

                      <div className="sm:col-span-3 flex justify-end pt-1">
                        <button
                          type="button"
                          disabled={isBatchApplying || (!batchCenter && !batchRank && !batchDiamondUpline.trim() && !batchContributor)}
                          onClick={handleApplyBatchUpdate}
                          className="px-4 py-1.5 rounded-xl text-white font-bold shadow-xs hover:opacity-95 disabled:opacity-50 transition-all"
                          style={{ backgroundColor: 'var(--color-primary, #c06c84)' }}
                        >
                          {isBatchApplying ? '套用中...' : `套用批次修改 (${selectedUserIds.length} 位)`}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {editingUserId ? (
                /* Admin editing user form */
                <div className="bg-white dark:bg-slate-800 p-4 rounded-2xl border-2 border-[var(--color-primary,#c06c84)] space-y-3 shadow-md">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-700">
                    <span className="font-bold text-slate-800 dark:text-slate-100">
                      代會員修改基本資料 ({userForm.name})
                    </span>
                    <button
                      onClick={() => setEditingUserId(null)}
                      className="p-1 text-slate-400 hover:text-slate-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-slate-500 mb-0.5">姓名或暱稱</label>
                      <input
                        type="text"
                        value={userForm.name || ''}
                        onChange={e => setUserForm({ ...userForm, name: e.target.value })}
                        className="w-full p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-500 mb-0.5">繁星卡號 / 直銷商編號</label>
                      <input
                        type="text"
                        value={userForm.amwayId || ''}
                        onChange={e => setUserForm({ ...userForm, amwayId: e.target.value })}
                        className="w-full p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-500 mb-0.5">手機號碼</label>
                      <input
                        type="text"
                        value={userForm.phone || ''}
                        onChange={e => setUserForm({ ...userForm, phone: e.target.value })}
                        className="w-full p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-500 mb-0.5">居住地</label>
                      <ThemedSelect
                        value={userForm.residence || '臺北'}
                        onChange={e => setUserForm({ ...userForm, residence: e.target.value })}
                        className="w-full p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                      >
                        {RESIDENCE_OPTIONS.map(r => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </ThemedSelect>
                    </div>
                    <div>
                      <label className="block text-slate-500 mb-0.5">所屬直銷商中心</label>
                      <ThemedSelect
                        value={userForm.center || '無'}
                        onChange={e => setUserForm({ ...userForm, center: e.target.value })}
                        className="w-full p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                      >
                        {CENTER_OPTIONS.map(c => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </ThemedSelect>
                    </div>
                    <div>
                      <label className="block text-slate-500 mb-0.5">最高獎銜</label>
                      <ThemedSelect
                        value={userForm.rank || '無'}
                        onChange={e => setUserForm({ ...userForm, rank: e.target.value as AmwayRank })}
                        className="w-full p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                      >
                        {RANK_ORDER.map(r => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </ThemedSelect>
                    </div>
                    <div>
                      <label className="block text-slate-500 mb-0.5">加入原因</label>
                      <ThemedSelect
                        value={userForm.joinReason || '事業'}
                        onChange={e => setUserForm({ ...userForm, joinReason: e.target.value as JoinReason })}
                        className="w-full p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                      >
                        {JOIN_REASONS.map(j => (
                          <option key={j} value={j}>
                            {j}
                          </option>
                        ))}
                      </ThemedSelect>
                    </div>
                    <div>
                      <label className="block text-slate-500 mb-0.5">推薦人姓名</label>
                      <input
                        type="text"
                        value={userForm.sponsor || ''}
                        onChange={e => setUserForm({ ...userForm, sponsor: e.target.value })}
                        className="w-full p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-500 mb-0.5">上手白金</label>
                      <input
                        type="text"
                        value={userForm.platinumUpline || ''}
                        onChange={e => setUserForm({ ...userForm, platinumUpline: e.target.value })}
                        className="w-full p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-500 mb-0.5">上手鑽石</label>
                      <input
                        type="text"
                        value={userForm.diamondUpline || ''}
                        onChange={e => setUserForm({ ...userForm, diamondUpline: e.target.value })}
                        className="w-full p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-slate-500 mb-0.5">西元生日</label>
                      <input
                        type="date"
                        value={userForm.birthday || ''}
                        onChange={e => setUserForm({ ...userForm, birthday: e.target.value })}
                        className="w-full p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                      />
                    </div>
                  </div>


                </div>
              ) : null}

              {/* User cards list - Requirement 2 & 15: 點擊整個框框任意處快速彈出預覽視窗，底色統一 */}
              <div className="space-y-2">
                <p className="text-[11px] text-slate-400 px-1">
                  💡 點擊任一會員框框可快速彈出詳細檔案預覽，並可匯出黑白學習卡分享
                </p>
                {filteredUsers.length === 0 ? (
                  <div className="text-center py-8 text-slate-400 bg-slate-50 dark:bg-slate-800/40 rounded-2xl">
                    查無符合篩選條件的學員
                  </div>
                ) : (
                  filteredUsers.map(u => {
                    const isSelected = selectedUserIds.includes(u.id);
                    return (
                      <div
                        key={u.id}
                        onClick={() => setPreviewUser(u)}
                        style={{ backgroundColor: 'var(--color-primary, #c06c84)' }}
                        className={`p-3 rounded-2xl border transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 cursor-pointer text-white shadow-2xs hover:brightness-105 hover:shadow-md ${
                          isSelected
                            ? 'ring-2 ring-white border-white'
                            : 'border-white/20'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          {/* Checkbox for batch select (Accessible to Platinum, Diamond and Admin - Requirement 3) */}
                          {(isEffectiveAdmin || isPlatinumOrAbove) && (
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation();
                                handleToggleSelectUser(u.id);
                              }}
                              className="p-1 text-white/80 hover:text-white"
                            >
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-white fill-white/20" />
                              ) : (
                                <Square className="w-4 h-4 text-white/70" />
                              )}
                            </button>
                          )}

                          <img
                            src={u.avatar}
                            alt={u.name}
                            className="w-10 h-10 rounded-xl object-cover shrink-0 ring-1 ring-white/30"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-white text-sm">
                                {u.name}
                              </span>
                              <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-white/25 text-white font-semibold">
                                {effectiveMemberRank(u)}
                              </span>
                              {u.isContributor && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-amber-400 text-slate-900 font-extrabold">
                                  貢獻者
                                </span>
                              )}
                              {u.isBlocked && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded-md bg-black/40 text-rose-200 font-bold">
                                  已封鎖
                                </span>
                              )}
                            </div>
                            <p className="text-[10px] text-white/80 truncate mt-0.5">
                              {u.email} • 編號: {u.amwayId || '-'} • 中心: {u.center || '無'} • 上手鑽石: {u.diamondUpline || '-'}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                          {/* Requirement 5: 鑽石級以上只能瀏覽+匯出功能，封鎖功能、設定貢獻者功能、代改資料都直接隱藏 */}
                          {isDiamondOnly ? (
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation();
                                setPreviewUser(u);
                              }}
                              className="px-2.5 py-1 rounded-xl bg-white text-[var(--color-primary,#c06c84)] font-bold text-[11px] flex items-center gap-1 shadow-2xs hover:bg-white/90 active:scale-95 transition-all"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>檔案預覽與匯出</span>
                            </button>
                          ) : (
                            <>
                              {/* Edit Full Profile - Admin only (Requirement 5) */}
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  handleStartEditUser(u);
                                }}
                                className="px-2 py-1 rounded-lg bg-white/20 hover:bg-white/30 text-white flex items-center gap-1 text-[11px] font-semibold transition-colors"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                                <span>代改資料</span>
                              </button>

                              {/* Designate Administrator - Super Admin only (Requirement 11) */}
                              {isEffectiveAdmin && u.email?.toLowerCase().trim() !== 'yukidu@gmail.com' && (
                                <button
                                  onClick={e => {
                                    e.stopPropagation();
                                    onToggleAdminUser && onToggleAdminUser(u.id);
                                  }}
                                  title="切換獎銜審核員權限（獎銜審核員具備鑽石瀏覽權限，並可在通知頁審核獎銜）"
                                  className={`px-2 py-1 rounded-lg flex items-center gap-1 text-[11px] font-semibold transition-all ${
                                    u.isAdminUser || u.role === '獎銜審核員' || u.role === '管理員'
                                      ? 'bg-purple-500 text-white font-bold ring-1 ring-white/50'
                                      : 'bg-white/20 text-white hover:bg-white/30'
                                  }`}
                                >
                                  <ShieldCheck className="w-3.5 h-3.5" />
                                  <span>{u.isAdminUser || u.role === '獎銜審核員' || u.role === '管理員' ? '已是獎銜審核員' : '+設為獎銜審核員'}</span>
                                </button>
                              )}

                              {/* Designate Contributor - Admin only (Requirement 5) */}
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  onToggleContributor(u.id);
                                }}
                                title="切換貢獻者權限（貢獻者可上傳與編輯自己音檔）"
                                className={`px-2 py-1 rounded-lg flex items-center gap-1 text-[11px] font-semibold transition-all ${
                                  u.isContributor
                                    ? 'bg-amber-400 text-slate-900 font-bold'
                                    : 'bg-white/20 text-white hover:bg-white/30'
                                }`}
                              >
                                <UserCheck className="w-3.5 h-3.5" />
                                <span>{u.isContributor ? '已是貢獻者' : '+設為貢獻者'}</span>
                              </button>

                              {/* Block/Unblock - Admin only (Requirement 5) */}
                              <button
                                onClick={e => {
                                  e.stopPropagation();
                                  onToggleBlockUser(u.id);
                                }}
                                className={`px-2 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1 transition-colors ${
                                  u.isBlocked
                                    ? 'bg-emerald-500 text-white font-bold'
                                    : 'bg-white/20 text-white hover:bg-white/30'
                                }`}
                              >
                                {u.isBlocked ? <Unlock className="w-3.5 h-3.5" /> : <Lock className="w-3.5 h-3.5" />}
                                <span>{u.isBlocked ? '解鎖' : '封鎖'}</span>
                              </button>

                              {/* Permanent member deletion - exact super-admin account only. */}
                              {isSuperAdminAccount && u.email?.toLowerCase().trim() !== 'yukidu@gmail.com' && (
                                deletingUserId === u.id ? (
                                  <div
                                    className="flex items-center gap-1 bg-rose-950/55 p-1 rounded-xl border border-white/30"
                                    onClick={e => e.stopPropagation()}
                                  >
                                    <span className="text-[10px] text-white font-black">確定刪除會員？</span>
                                    <button
                                      type="button"
                                      disabled={isDeletingUser}
                                      onClick={e => {
                                        e.stopPropagation();
                                        void handleDeleteUser(u);
                                      }}
                                      className="px-2 py-0.5 rounded-lg bg-rose-700 hover:bg-rose-800 text-white text-[10px] font-black disabled:opacity-50"
                                    >
                                      {isDeletingUser ? '刪除中…' : '確認'}
                                    </button>
                                    <button
                                      type="button"
                                      disabled={isDeletingUser}
                                      onClick={e => {
                                        e.stopPropagation();
                                        setDeletingUserId(null);
                                      }}
                                      className="px-1.5 py-0.5 rounded-lg bg-white/20 text-white text-[10px] font-bold disabled:opacity-50"
                                    >
                                      取消
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={e => {
                                      e.stopPropagation();
                                      setDeletingUserId(u.id);
                                    }}
                                    title="永久刪除此會員帳號（僅超級管理員）"
                                    className="px-2 py-1 rounded-lg bg-rose-700 hover:bg-rose-800 text-white flex items-center gap-1 text-[11px] font-black transition-colors"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>刪除</span>
                                  </button>
                                )
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* TAB 2: Tracks Management (Requirement 5: 貢獻者只能修改刪除自己上傳的錄音檔；管理員無限制) */}
          {activeTab === 'tracks' && (
            <div className="space-y-2.5">
              {tracks
                .filter(t => (isContributorOnly ? t.uploaderEmail === currentUser?.email : true))
                .map(t => {
                  const badgeText = t.requiredRank === '無' ? '公開' : t.requiredRank;
                  const canManageThisTrack = isEffectiveAdmin || (isContributorOnly && t.uploaderEmail === currentUser?.email);

                  return (
                    <div
                      key={t.id}
                      className="p-3 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-100 dark:border-slate-700 flex items-center justify-between gap-2.5"
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <img
                          src={t.speakerAvatar}
                          alt={t.speaker}
                          className="w-10 h-10 rounded-xl object-cover shrink-0 ring-1 ring-slate-200 dark:ring-slate-700"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300 font-semibold">
                              {badgeText}
                            </span>
                            {t.categories?.map((cat, i) => (
                              <span key={i} className="text-[10px] text-slate-400">
                                {cat}
                              </span>
                            ))}
                          </div>
                          <h4 className="font-bold text-xs text-slate-800 dark:text-slate-100 truncate mt-0.5">
                            {t.title}
                          </h4>
                          <p className="text-[10px] text-slate-400">
                            {t.speaker} • 上傳者: {t.uploaderEmail || '管理員'}
                          </p>
                        </div>
                      </div>

                      {canManageThisTrack && (
                        <div className="flex items-center gap-1 shrink-0">
                          {/* Requirement 17: 修改按鈕正常開啟修改視窗 */}
                          <button
                            onClick={() => onEditTrack(t)}
                            title="修改錄音檔資料"
                            className="p-1.5 rounded-lg text-slate-500 hover:text-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-1"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                            <span className="text-[11px] hidden sm:inline">修改</span>
                          </button>

                          {/* Requirement 17: 刪除按鈕安全確認 (不呼叫 window.confirm 以免 iframe 阻擋) */}
                          {deletingTrackId === t.id ? (
                            <div className="flex items-center gap-1 bg-rose-50 dark:bg-rose-950 p-1 rounded-xl border border-rose-200 dark:border-rose-900">
                              <span className="text-[10px] text-rose-600 dark:text-rose-400 font-bold">
                                確定刪除？
                              </span>
                              <button
                                disabled={isDeleting}
                                onClick={async () => {
                                  setIsDeleting(true);
                                  try {
                                    await onDeleteTrack(t.id);
                                    setDeletingTrackId(null);
                                  } catch (error) {
                                    alert(error instanceof Error ? error.message : '刪除失敗，請稍後再試');
                                  } finally {
                                    setIsDeleting(false);
                                  }
                                }}
                                className="px-2 py-0.5 rounded-lg bg-rose-600 text-white text-[10px] font-bold hover:bg-rose-700 disabled:opacity-50"
                              >
                                {isDeleting ? '刪除中...' : '確認'}
                              </button>
                              <button
                                onClick={() => setDeletingTrackId(null)}
                                className="px-1.5 py-0.5 rounded-lg bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-[10px]"
                              >
                                取消
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setDeletingTrackId(t.id)}
                              title="刪除錄音檔"
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
            </div>
          )}

          {/* TAB: Categories Management */}
          {activeTab === 'categories' && (
            <div className="space-y-4">
              <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-700">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-rose-100 dark:bg-rose-950 text-rose-600 dark:text-rose-300 flex items-center justify-center">
                      <Tag className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-bold text-xs text-slate-800 dark:text-slate-100">
                        新增與管理音檔分類標籤
                      </h4>

                    </div>
                  </div>
                  <div className="text-right">
                    <span className="block text-xs font-mono font-bold text-slate-500">
                      目前共 {categoryList.length} 個分類
                    </span>
                    <span className="block text-[10px] font-semibold text-slate-400">
                      {isCategoryOrderSaving ? '排序同步中…' : '長按拖曳排序・首頁同步'}
                    </span>
                  </div>
                </div>

                {/* Add new category input */}
                <form onSubmit={handleAddCategory} className="flex gap-2">
                  <input
                    type="text"
                    value={newCatName}
                    onChange={e => setNewCatName(e.target.value)}
                    placeholder="輸入新分類名稱 (例如: 心態、營養、產品故事)"
                    className="flex-1 px-3 py-2 rounded-xl text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-100 outline-hidden focus:ring-1 focus:ring-rose-500"
                  />
                  <button
                    type="submit"
                    disabled={isCatSubmitting || !newCatName.trim()}
                    className="px-4 py-2 rounded-xl bg-[var(--color-primary,#c06c84)] text-white text-xs font-bold hover:opacity-90 disabled:opacity-50 flex items-center gap-1 shadow-xs"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>新增標籤</span>
                  </button>
                </form>

                {/* Categories list - Requirement 3 (v2.5): 排版改成緊密左右排列，不要一行只有一個標籤 */}
                <div className="flex flex-wrap items-center gap-2 pt-2">
                  {categoryList.map(cat => {
                    const isEditing = editingCatOld === cat;
                    const catTrackCount = tracks.filter(t => t.categories?.includes(cat) || (t as any).category === cat).length;

                    if (isEditing) {
                      return (
                        <div
                          key={cat}
                          className="inline-flex items-center gap-1.5 py-1 px-2.5 rounded-xl bg-white dark:bg-slate-800 border-2 border-rose-400 dark:border-rose-500 shadow-xs"
                        >
                          <input
                            type="text"
                            autoFocus
                            value={editingCatNew}
                            onChange={e => setEditingCatNew(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleRenameCategory(cat);
                              } else if (e.key === 'Escape') {
                                setEditingCatOld(null);
                              }
                            }}
                            className="w-28 sm:w-36 px-1.5 py-0.5 text-xs bg-transparent outline-hidden text-slate-900 dark:text-slate-100 font-bold"
                            placeholder="新分類名稱"
                          />
                          <button
                            type="button"
                            onClick={() => handleRenameCategory(cat)}
                            className="p-1 rounded-md bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] font-bold flex items-center justify-center shadow-xs cursor-pointer"
                            title="儲存分類名稱"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditingCatOld(null)}
                            className="p-1 rounded-md bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 text-slate-700 dark:text-slate-300 text-[11px] cursor-pointer"
                            title="取消"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={cat}
                        data-category-name={cat}
                        className={`inline-flex items-center gap-1.5 py-1.5 px-2 rounded-xl bg-slate-50 dark:bg-slate-900/80 border transition-all shadow-2xs group select-none ${
                          draggingCategory === cat
                            ? 'border-[var(--color-primary,#c06c84)] ring-2 ring-[var(--color-primary,#c06c84)]/25 scale-[1.03] opacity-90'
                            : 'border-slate-200/80 dark:border-slate-800 hover:border-rose-300 dark:hover:border-rose-800'
                        }`}
                      >
                        <button
                          type="button"
                          aria-label={`拖曳「${cat}」調整排序`}
                          title="手機長按後拖曳；桌機按住即可拖曳"
                          disabled={isCategoryOrderSaving || isCatSubmitting || editingCatOld !== null || cat === '全部'}
                          onPointerDown={event => handleCategoryDragPointerDown(cat, event)}
                          onTouchStart={event => handleCategoryTouchStart(cat, event)}
                          onContextMenu={event => event.preventDefault()}
                          className="p-1 -ml-0.5 rounded-md text-slate-400 hover:text-[var(--color-primary,#c06c84)] hover:bg-white dark:hover:bg-slate-800 disabled:opacity-40 cursor-grab active:cursor-grabbing shrink-0"
                          style={{ touchAction: 'auto', WebkitTouchCallout: 'none' }}
                        >
                          <GripVertical className="w-4 h-4" />
                        </button>
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="w-2 h-2 rounded-full bg-rose-400 shrink-0" />
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                            {cat}
                          </span>
                          <span
                            className="text-[10px] px-1.5 py-0.2 rounded-md bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 font-mono font-bold border border-slate-200/60 dark:border-slate-700/60"
                            title={`共有 ${catTrackCount} 首音檔包含此標籤`}
                          >
                            {catTrackCount}
                          </span>
                        </div>

                        <div className="flex items-center gap-0.5 border-l border-slate-200 dark:border-slate-700 pl-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCatOld(cat);
                              setEditingCatNew(cat);
                            }}
                            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 cursor-pointer transition-colors"
                            title="修改名稱"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteCategory(cat)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950 cursor-pointer transition-colors"
                            title="刪除標籤"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
          {/* TAB: 網友關鍵字 (Requirement 2) */}
          {activeTab === 'keywords' && (
            <KeywordsTab userEmail={currentUser?.email}
              tracks={tracks}
              onUpdateTrack={onUpdateTrack}
              onEditTrack={onEditTrack}
            />
          )}

          {/* TAB: 私秘VIP (Requirement 6) */}
          {activeTab === 'vip' && (
            <VipTracksTab
              tracks={tracks}
              currentUser={currentUser}
              isAdmin={isEffectiveAdmin}
              onUpdateTrack={onUpdateTrack}
              onDeleteTrack={onDeleteTrack}
              onEditTrack={onEditTrack}
            />
          )}

          {/* TAB 5: 權限表 (Requirement 2 & 3: 改為權限表，登入者擁有之權限改為主色系同色，其他黑色豆豆改灰色) */}
          {activeTab === 'permissions' && (() => {
            // 判定登入者所屬身分之欄位索引 (0: 訪客, 1: 一般會員, 2: 翡翠/白金, 3: 鑽石以上, 4: 獎銜審核員, 5: 貢獻者, 6: 超級管理員)
            const currentUserColIdx: number = (() => {
              if (!currentUser || (currentUser as any).isVisitor || !currentUser.email || currentUser.email === 'guest') {
                return 0; // 訪客
              }
              if (isEffectiveAdmin) {
                return 6; // 超級管理員
              }
              if (currentUser.isAdminUser || currentUser.role === '獎銜審核員' || currentUser.role === '管理員') {
                return 4; // 獎銜審核員
              }
              if (currentUser.isContributor) {
                return 5; // 貢獻者
              }
              if (isDiamondOrAbove) {
                return 3; // 鑽石以上
              }
              if (isPlatinumOrAbove) {
                return 2; // 翡翠/白金
              }
              return 1; // 一般會員 (未審核)
            })();

            const PERMISSIONS_COLUMNS = [
              { name: '訪客', sub: '', width: 'w-[9%]' },
              { name: '一般會員', sub: '(未審核)', width: 'w-[11%]' },
              { name: '翡翠/白金', sub: '', width: 'w-[10%]' },
              { name: '鑽石以上', sub: '', width: 'w-[10%]' },
              { name: '獎銜審核員', sub: '', width: 'w-[11%]' },
              { name: '貢獻者', sub: '', width: 'w-[10%]' },
              { name: '超級管理員', sub: '', width: 'w-[12%]' }
            ];

            const PERMISSION_SECTIONS = [
              {
                category: '【 收聽與學習資源 】',
                items: [
                  { name: '聆聽公開級別錄音檔', perms: [true, true, true, true, true, true, true] },
                  { name: '聆聽指定/鑽石權限音檔', perms: [false, false, 'partial', true, true, true, true], partialTitle: '依已審核通過之獎銜等級' },
                  { name: '背景懸浮球 / 底部連續播放', perms: [true, true, true, true, true, true, true] },
                  { name: '查看詳細資訊與外部教材連結', perms: [true, true, true, true, true, true, true] },
                  { name: '匯出黑白資訊圖卡與分享', perms: [true, true, true, true, true, true, true] },
                  { name: '個人收聽進度記憶與時長累計', perms: [false, true, true, true, true, true, true] }
                ]
              },
              {
                category: '【 評價與互動 】',
                items: [
                  { name: '1~5 星評分與心得按讚', perms: [true, true, true, true, true, true, true] },
                  { name: '發表心得與即時討論', perms: [true, true, true, true, true, true, true] },
                  { name: '編輯或刪除自己發布的心得', perms: [false, true, true, true, true, true, true] },
                  { name: '管理/刪除他人違規心得', perms: [false, false, false, false, false, false, true] }
                ]
              },
              {
                category: '【 會員與獎銜審核 】',
                items: [
                  { name: '填寫與更新個人基本資料', perms: [false, true, true, true, true, true, true] },
                  { name: '通知頁審核通過會員獎銜', perms: [false, false, false, false, true, false, true] },
                  { name: '通知頁修改並批准獎銜', perms: [false, false, false, false, true, false, true] },
                  { name: '任命 / 取消獎銜審核員', perms: [false, false, false, false, false, false, true] },
                  { name: '封鎖或解封違規學員帳號', perms: [false, false, false, false, false, false, true] }
                ]
              },
              {
                category: '【 後台中心與數據管理 】',
                items: [
                  { name: '瀏覽後台數據中心統計圖表', perms: [false, false, true, true, true, true, true] },
                  { name: '瀏覽會員名單庫與搜尋資料', perms: [false, false, true, true, true, false, true] },
                  { name: '批次變更獎銜與批次匯出名單', perms: [false, false, true, true, true, false, true] },
                  { name: '上傳全新音檔至平台', perms: [false, false, false, false, false, true, true] },
                  { name: '編輯自己上傳的音檔與教材', perms: [false, false, false, false, false, true, true] },
                  { name: '編輯或刪除全站任意音檔', perms: [false, false, false, false, false, false, true] },
                  { name: '分類標籤新增、修改與刪除', perms: [false, false, false, false, false, false, true] }
                ]
              }
            ];

            const renderDot = (colIdx: number, val: boolean | string, partialTitle?: string) => {
              const isMyCol = colIdx === currentUserColIdx;
              if (!val) {
                return <span className="text-slate-300 dark:text-slate-600 font-bold text-xs select-none">－</span>;
              }
              if (val === 'partial') {
                return (
                  <span
                    className={`font-black text-sm select-none inline-block ${
                      isMyCol ? 'scale-110 drop-shadow-xs' : 'text-slate-400 dark:text-slate-500'
                    }`}
                    style={isMyCol ? { color: 'var(--color-primary, #c06c84)' } : undefined}
                    title={partialTitle || (isMyCol ? '您的身分具備部分權限' : '部分/限本人')}
                  >
                    ◐
                  </span>
                );
              }
              // 黑色豆豆改灰色，登入者有權限的豆豆改成網站LOGO同色 (var(--color-primary, #c06c84))
              return (
                <span
                  className={`font-black text-sm select-none inline-block transition-transform ${
                    isMyCol ? 'scale-125 drop-shadow-xs font-black' : 'text-slate-400 dark:text-slate-500'
                  }`}
                  style={isMyCol ? { color: 'var(--color-primary, #c06c84)' } : undefined}
                  title={isMyCol ? '您的登入身分擁有此權限' : undefined}
                >
                  ●
                </span>
              );
            };

            return (
              <div className="space-y-4 animate-in fade-in duration-200">
                {/* Header Card */}
                <div className="p-4 rounded-2xl bg-gradient-to-r from-rose-50/80 via-white to-amber-50/80 dark:from-slate-800 dark:to-slate-800/80 border border-rose-100 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                  <div>
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="w-5 h-5 text-rose-500 dark:text-rose-400" />
                      <h3 className="font-extrabold text-sm sm:text-base text-slate-800 dark:text-slate-100">
                        各角色系統功能權限表
                      </h3>
                    </div>

                  </div>

                  {/* Legend - Requirement 3: 登入者有權限的豆豆改為主色系同色，其餘改為灰色 */}
                  <div className="flex items-center gap-2.5 sm:gap-3 bg-white/90 dark:bg-slate-900/90 px-3 py-1.5 rounded-xl border border-rose-100 dark:border-slate-700 shrink-0 text-[11px] shadow-2xs">
                    <span className="flex items-center gap-1 font-bold">
                      <span className="font-black text-sm" style={{ color: 'var(--color-primary, #c06c84)' }}>●</span>
                      <span style={{ color: 'var(--color-primary, #c06c84)' }}>您的權限</span>
                    </span>
                    <span className="flex items-center gap-1 font-bold text-slate-400 dark:text-slate-500">
                      <span className="font-black text-sm text-slate-400 dark:text-slate-500">●</span>
                      <span>其他身分</span>
                    </span>
                    <span className="flex items-center gap-1 font-bold text-slate-400 dark:text-slate-500">
                      <span className="font-black text-sm text-slate-400 dark:text-slate-500">◐</span>
                      <span>部分/限本人</span>
                    </span>
                    <span className="flex items-center gap-1 font-bold text-slate-300 dark:text-slate-600">
                      <span className="font-bold text-xs text-slate-300 dark:text-slate-600">－</span>
                      <span>無權限</span>
                    </span>
                  </div>
                </div>

                {/* Dot Matrix Table */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-xs w-full">
                  <div className="w-full">
                    <table className="w-full text-left border-collapse text-[11px] sm:text-xs table-fixed">
                      <thead>
                        <tr className="bg-slate-100/90 dark:bg-slate-800/90 border-b border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 font-bold">
                          <th className="py-2.5 px-2 bg-slate-100 dark:bg-slate-800 w-[27%] text-xs">
                            系統功能項目
                          </th>
                          {PERMISSIONS_COLUMNS.map((col, idx) => {
                            const isMyCol = idx === currentUserColIdx;
                            return (
                              <th
                                key={idx}
                                className={`py-2 px-1 text-center ${col.width} text-[11px] transition-colors ${
                                  isMyCol
                                    ? 'bg-[var(--color-light-pill,#fae8ed)] dark:bg-slate-800 text-[var(--color-primary,#c06c84)] font-black ring-1 ring-[var(--color-primary,#c06c84)]/30'
                                    : 'text-slate-700 dark:text-slate-200'
                                }`}
                              >
                                <div className="leading-tight">
                                  <span>{col.name}</span>
                                  {col.sub && <span className="block text-[9px] text-slate-400 font-normal">{col.sub}</span>}
                                  {isMyCol && (
                                    <span
                                      className="inline-block mt-0.5 px-1 py-0.2 rounded-full text-[8.5px] font-black text-white shadow-2xs"
                                      style={{ backgroundColor: 'var(--color-primary, #c06c84)' }}
                                    >
                                      目前身分
                                    </span>
                                  )}
                                </div>
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {PERMISSION_SECTIONS.map((sec, sIdx) => (
                          <React.Fragment key={sIdx}>
                            <tr className="bg-slate-50/60 dark:bg-slate-800/40">
                              <td colSpan={8} className="py-1.5 px-3.5 font-extrabold text-[11px] text-slate-600 dark:text-slate-400 tracking-wider">
                                {sec.category}
                              </td>
                            </tr>
                            {sec.items.map((item, iIdx) => (
                              <tr key={iIdx} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors">
                                <td className="py-2 px-3.5 sticky left-0 bg-white dark:bg-slate-900 z-10 font-medium text-slate-800 dark:text-slate-200">
                                  {item.name}
                                </td>
                                {item.perms.map((p, colIdx) => (
                                  <td
                                    key={colIdx}
                                    className={`py-2 px-2 text-center transition-colors ${
                                      colIdx === currentUserColIdx
                                        ? 'bg-[var(--color-light-pill,#fae8ed)]/35 dark:bg-[var(--color-primary,#c06c84)]/10 font-bold'
                                        : ''
                                    }`}
                                  >
                                    {renderDot(colIdx, p, (item as any).partialTitle)}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Requirement 2: Member Quick Preview Modal */}
      <MemberPreviewModal
        isOpen={!!previewUser}
        onClose={() => setPreviewUser(null)}
        user={previewUser}
        tracks={tracks}
        comments={comments}
      />

      {/* Requirement 6: Member Custom Export Modal (PDF / Excel with field selection) */}
      <MemberExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        users={
          selectedUserIds.length > 0
            ? users.filter(u => selectedUserIds.includes(u.id))
            : filteredUsers
        }
      />
    </div>
  );
};
