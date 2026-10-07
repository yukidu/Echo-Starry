import { effectiveMemberRank } from '../utils/ranks';
import { ThemedSelect } from './ThemedSelect';
import React, { useState, useMemo } from 'react';
import {
  BarChart3,
  Download,
  Share2,
  FileSpreadsheet,
  FileText,
  Filter,
  Users,
  RotateCcw,
  CheckSquare,
  Square,
  Sparkles,
  MapPin,
  Award,
  Calendar,
  Compass,
  Check,
  ChevronDown
} from 'lucide-react';
import {
  UserProfile,
  RANK_ORDER,
  CENTER_OPTIONS,
  RESIDENCE_OPTIONS,
  JOIN_REASONS,
  STAY_REASONS
} from '../types';
import {
  exportDataCenterCsv,
  exportDataCenterPdf,
  shareOrDownloadDataCenterFile,
  DataCenterStats
} from '../utils/dataCenterExport';

const ZODIAC_OPTIONS = [
  '牡羊座', '金牛座', '雙子座', '巨蟹座',
  '獅子座', '處女座', '天秤座', '天蠍座',
  '射手座', '摩羯座', '水瓶座', '雙魚座'
];

interface DataCenterTabProps {
  users: UserProfile[];
}

export const DataCenterTab: React.FC<DataCenterTabProps> = ({ users }) => {
  // Center selection: multi-select, single-select, or select all
  const [selectedCenters, setSelectedCenters] = useState<string[]>(() => [...CENTER_OPTIONS]);
  const [isCenterDropdownOpen, setIsCenterDropdownOpen] = useState(false);

  // Filters
  const [selectedJoinReason, setSelectedJoinReason] = useState<string>('全部');
  const [selectedStayReason, setSelectedStayReason] = useState<string>('全部');
  const [sponsorInput, setSponsorInput] = useState<string>('');
  const [platinumInput, setPlatinumInput] = useState<string>('');
  const [diamondInput, setDiamondInput] = useState<string>('');
  const [selectedBirthYear, setSelectedBirthYear] = useState<string>('全部');
  const [selectedZodiac, setSelectedZodiac] = useState<string>('全部');
  const [selectedLifeNumber, setSelectedLifeNumber] = useState<string>('全部');
  const [selectedResidence, setSelectedResidence] = useState<string>('全部');

  // Autocomplete suggestion states
  const [showSponsorSuggestions, setShowSponsorSuggestions] = useState(false);
  const [showPlatinumSuggestions, setShowPlatinumSuggestions] = useState(false);
  const [showDiamondSuggestions, setShowDiamondSuggestions] = useState(false);

  // Export states
  const [isExporting, setIsExporting] = useState<null | 'pdf' | 'excel'>(null);
  const [showExportModal, setShowExportModal] = useState(false);

  // Extract unique suggestions from database
  const existingSponsors = useMemo(() => {
    const set = new Set<string>();
    users.forEach(u => {
      if (u.sponsor && u.sponsor.trim() && u.sponsor !== '無') set.add(u.sponsor.trim());
    });
    return Array.from(set);
  }, [users]);

  const existingPlatinums = useMemo(() => {
    const set = new Set<string>();
    users.forEach(u => {
      if (u.platinumUpline && u.platinumUpline.trim() && u.platinumUpline !== '無') {
        set.add(u.platinumUpline.trim());
      }
    });
    return Array.from(set);
  }, [users]);

  const existingDiamonds = useMemo(() => {
    const set = new Set<string>();
    users.forEach(u => {
      if (u.diamondUpline && u.diamondUpline.trim() && u.diamondUpline !== '無') {
        set.add(u.diamondUpline.trim());
      }
    });
    return Array.from(set);
  }, [users]);

  // Available birth years from users
  const birthYears = useMemo(() => {
    const years = new Set<string>();
    for (let y = 2015; y >= 1950; y--) {
      years.add(String(y));
    }
    return Array.from(years);
  }, []);

  // Filtered Users (Strictly aggregate counts only, no individual user names shown)
  const filteredUsers = useMemo(() => {
    return users.filter(u => {
      // 1. Center check: strictly match selected centers; if none selected, match nothing
      const userCenter = u.center || '無';
      if (!selectedCenters.includes(userCenter)) {
        return false;
      }

      // 2. Join reason (初次如何認識安麗？)
      if (selectedJoinReason !== '全部' && u.joinReason !== selectedJoinReason) {
        return false;
      }

      // 2.1 Stay reason (什麼原因留在安麗？)
      if (selectedStayReason !== '全部' && (u as any).stayReason !== selectedStayReason) {
        return false;
      }

      // 3. Sponsor
      if (sponsorInput.trim() && (!u.sponsor || !u.sponsor.toLowerCase().includes(sponsorInput.trim().toLowerCase()))) {
        return false;
      }

      // 4. Platinum upline
      if (platinumInput.trim() && (!u.platinumUpline || !u.platinumUpline.toLowerCase().includes(platinumInput.trim().toLowerCase()))) {
        return false;
      }

      // 5. Diamond upline
      if (diamondInput.trim() && (!u.diamondUpline || !u.diamondUpline.toLowerCase().includes(diamondInput.trim().toLowerCase()))) {
        return false;
      }

      // 6. Birth year
      if (selectedBirthYear !== '全部') {
        const year = u.birthday ? u.birthday.split('-')[0] : '';
        if (year !== selectedBirthYear) return false;
      }

      // 7. Zodiac
      if (selectedZodiac !== '全部') {
        if (u.zodiac !== selectedZodiac) return false;
      }

      // 8. Life Number (1-9)
      if (selectedLifeNumber !== '全部') {
        if (String(u.lifeNumber) !== selectedLifeNumber) return false;
      }

      // 9. Residence
      if (selectedResidence !== '全部') {
        if (u.residence !== selectedResidence) return false;
      }

      return true;
    });
  }, [
    users,
    selectedCenters,
    selectedJoinReason,
    selectedStayReason,
    sponsorInput,
    platinumInput,
    diamondInput,
    selectedBirthYear,
    selectedZodiac,
    selectedLifeNumber,
    selectedResidence
  ]);

  const totalCount = filteredUsers.length;

  // 1. 各階層獎銜人數（高獎銜擺在最前面）
  const rankStats = useMemo(() => {
    const reversedRanks = [...RANK_ORDER].reverse();
    const map: Record<string, number> = {};
    reversedRanks.forEach(r => { map[r] = 0; });

    filteredUsers.forEach(u => {
      const r = effectiveMemberRank(u);
      map[r] = (map[r] || 0) + 1;
    });

    return reversedRanks.map(name => ({
      name,
      count: map[name] || 0
    }));
  }, [filteredUsers]);

  // 2. 初次如何認識安麗？ (原加入原因)
  const joinReasonStats = useMemo(() => {
    const map: Record<string, number> = {};
    JOIN_REASONS.forEach(r => { map[r] = 0; });

    filteredUsers.forEach(u => {
      const reason = u.joinReason || '未填寫';
      map[reason] = (map[reason] || 0) + 1;
    });

    return Object.entries(map)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [filteredUsers]);

  // 2.1 什麼原因留在安麗？ (Requirement 1)
  const stayReasonStats = useMemo(() => {
    const map: Record<string, number> = {};
    STAY_REASONS.forEach(r => { map[r] = 0; });

    filteredUsers.forEach(u => {
      const reason = (u as any).stayReason || '未填寫';
      map[reason] = (map[reason] || 0) + 1;
    });

    return Object.entries(map)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [filteredUsers]);

  // 3. 星座
  const zodiacStats = useMemo(() => {
    const map: Record<string, number> = {};
    ZODIAC_OPTIONS.forEach(z => { map[z] = 0; });

    filteredUsers.forEach(u => {
      const z = u.zodiac || '未填寫';
      map[z] = (map[z] || 0) + 1;
    });

    return Object.entries(map)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [filteredUsers]);

  // 4. 生命靈數 1-9
  const lifeNumberStats = useMemo(() => {
    const counts: Record<number, number> = {
      1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0
    };

    filteredUsers.forEach(u => {
      if (u.lifeNumber && u.lifeNumber >= 1 && u.lifeNumber <= 9) {
        counts[u.lifeNumber] = (counts[u.lifeNumber] || 0) + 1;
      }
    });

    return [1, 4, 7, 2, 5, 8, 3, 6, 9].map(num => ({
      num,
      count: counts[num] || 0
    }));
  }, [filteredUsers]);

  // 5. 居住地
  const residenceStats = useMemo(() => {
    const map: Record<string, number> = {};
    RESIDENCE_OPTIONS.forEach(r => { map[r] = 0; });

    filteredUsers.forEach(u => {
      const r = u.residence || '未填寫';
      map[r] = (map[r] || 0) + 1;
    });

    return Object.entries(map)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
  }, [filteredUsers]);

  // Helper for center selection
  const handleToggleCenter = (center: string) => {
    setSelectedCenters(prev =>
      prev.includes(center) ? prev.filter(c => c !== center) : [...prev, center]
    );
  };

  const handleSelectAllCenters = () => {
    setSelectedCenters([...CENTER_OPTIONS]);
  };

  const handleClearAllCenters = () => {
    setSelectedCenters([]);
  };

  const handleResetFilters = () => {
    setSelectedCenters([...CENTER_OPTIONS]);
    setSelectedJoinReason('全部');
    setSelectedStayReason('全部');
    setSponsorInput('');
    setPlatinumInput('');
    setDiamondInput('');
    setSelectedBirthYear('全部');
    setSelectedZodiac('全部');
    setSelectedLifeNumber('全部');
    setSelectedResidence('全部');
  };

  // Build filter summary description
  const filterSummary = useMemo(() => {
    const centersText =
      selectedCenters.length === CENTER_OPTIONS.length
        ? '全部中心'
        : selectedCenters.length === 0
        ? '未勾選任何中心'
        : selectedCenters.join('、');

    return {
      '所選直銷商中心': centersText,
      '初次如何認識安麗？': selectedJoinReason,
      '什麼原因留在安麗？': selectedStayReason,
      '推薦人': sponsorInput.trim() || '不限',
      '上手白金': platinumInput.trim() || '不限',
      '上手鑽石': diamondInput.trim() || '不限',
      '西元出生年份': selectedBirthYear,
      '星座': selectedZodiac,
      '生命靈數': selectedLifeNumber !== '全部' ? `${selectedLifeNumber} 號人` : '不限',
      '居住地': selectedResidence
    };
  }, [
    selectedCenters,
    selectedJoinReason,
    selectedStayReason,
    sponsorInput,
    platinumInput,
    diamondInput,
    selectedBirthYear,
    selectedZodiac,
    selectedLifeNumber,
    selectedResidence
  ]);

  const currentStats: DataCenterStats = {
    totalCount,
    rankStats,
    joinReasonStats,
    stayReasonStats,
    zodiacStats,
    lifeNumberStats,
    residenceStats,
    selectedCenters
  };

  // Trigger export
  const handleExport = async (format: 'pdf' | 'excel') => {
    setIsExporting(format);
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    try {
      if (format === 'excel') {
        const blob = exportDataCenterCsv(filterSummary, totalCount, currentStats);
        await shareOrDownloadDataCenterFile(
          blob,
          `繁星回聲_數據中心分析_${dateStr}.csv`,
          '繁星回聲數據中心統計分析 Excel 檔'
        );
      } else {
        const blob = await exportDataCenterPdf(filterSummary, totalCount, currentStats);
        await shareOrDownloadDataCenterFile(
          blob,
          `繁星回聲_數據中心分析_${dateStr}.pdf`,
          '繁星回聲數據中心統計分析 PDF 檔'
        );
      }
      setShowExportModal(false);
    } catch (err) {
      console.error('Export failed:', err);
      alert('匯出時發生錯誤，請稍後再試。');
    } finally {
      setIsExporting(null);
    }
  };

  return (
    <div className="space-y-4 text-slate-800 dark:text-slate-100">
      {/* Top Header Card */}
      <div className="p-3 sm:p-4 rounded-2xl bg-gradient-to-r from-rose-50/80 via-white to-amber-50/80 dark:from-slate-800 dark:via-slate-900 dark:to-slate-800 border border-rose-200/60 dark:border-slate-700 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-rose-500 text-white flex items-center justify-center shadow-xs">
              <BarChart3 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-extrabold text-base sm:text-lg text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span>數據中心</span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-rose-100 dark:bg-rose-950 text-rose-700 dark:text-rose-300 font-bold border border-rose-200 dark:border-rose-900">
                  白金以上專屬
                </span>
              </h3>

            </div>
          </div>
        </div>

        {/* Export Buttons */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={handleResetFilters}
            className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-1 transition-colors text-slate-600 dark:text-slate-300"
            title="重設全部篩選"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>重設</span>
          </button>

          <button
            type="button"
            onClick={() => setShowExportModal(true)}
            className="flex-1 sm:flex-none px-4 py-1.5 rounded-xl text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-xs hover:opacity-95 active:scale-95 transition-all"
            style={{ backgroundColor: 'var(--color-primary, #c06c84)' }}
          >
            <Download className="w-3.5 h-3.5" />
            <span>匯出報表 (PDF / Excel)</span>
          </button>
        </div>
      </div>

      {/* FILTER SECTION */}
      <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700 space-y-3 shadow-2xs">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-700/80 pb-2">
          <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-rose-500" />
            <span>統計篩選維度</span>
          </span>
          <div className="flex items-center gap-1 text-[11px]">
            <span className="text-slate-400">符合條件總人數：</span>
            <span className="text-base font-extrabold font-mono text-[var(--color-primary,#c06c84)]">
              {totalCount}
            </span>
            <span className="text-slate-500">人</span>
          </div>
        </div>

        {/* 1. 直銷商中心單選/複選/全選 */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
              <span>直銷商中心篩選</span>
              <span className="text-[10px] font-normal text-slate-400">
                (已選 {selectedCenters.length} / {CENTER_OPTIONS.length} 個中心)
              </span>
            </label>
            <div className="flex items-center gap-1 text-[11px]">
              <button
                type="button"
                onClick={handleSelectAllCenters}
                className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200 hover:bg-slate-200 font-semibold"
              >
                全選
              </button>
              <button
                type="button"
                onClick={handleClearAllCenters}
                className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-200 hover:bg-slate-200 font-semibold"
              >
                清空
              </button>
            </div>
          </div>

          {/* Quick Clickable Centers Pills */}
          <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto p-1.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200/50 dark:border-slate-800">
            {CENTER_OPTIONS.map(center => {
              const isSelected = selectedCenters.includes(center);
              return (
                <button
                  key={center}
                  type="button"
                  onClick={() => handleToggleCenter(center)}
                  className={`text-[11px] px-2 py-0.5 rounded-lg font-medium transition-all ${
                    isSelected
                      ? 'bg-rose-500 text-white shadow-2xs font-bold'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200/60 dark:border-slate-700 hover:border-rose-300'
                  }`}
                >
                  {center}
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. 多欄位篩選器 Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5 text-xs">
          {/* 初次如何認識安麗？ (下拉選單) */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-0.5">
              初次如何認識安麗？
            </label>
            <ThemedSelect
              value={selectedJoinReason}
              onChange={e => setSelectedJoinReason(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-hidden"
            >
              <option value="全部">全部原因</option>
              {JOIN_REASONS.map(r => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </ThemedSelect>
          </div>

          {/* 什麼原因留在安麗？ (下拉選單 - Requirement 1) */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-0.5">
              什麼原因留在安麗？
            </label>
            <ThemedSelect
              value={selectedStayReason}
              onChange={e => setSelectedStayReason(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-hidden"
            >
              <option value="全部">全部原因</option>
              {STAY_REASONS.map(r => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </ThemedSelect>
          </div>

          {/* 推薦人 (手動輸入，自動帶出同欄位已有的類似姓名) */}
          <div className="relative">
            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-0.5">
              推薦人 (自動提示)
            </label>
            <input
              type="text"
              placeholder="輸入推薦人姓名..."
              value={sponsorInput}
              onFocus={() => setShowSponsorSuggestions(true)}
              onChange={e => {
                setSponsorInput(e.target.value);
                setShowSponsorSuggestions(true);
              }}
              className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-hidden"
            />
            {showSponsorSuggestions && sponsorInput.trim() && (
              <div className="absolute top-full left-0 right-0 z-20 mt-1 max-h-36 overflow-y-auto rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-lg p-1">
                {existingSponsors
                  .filter(s => s.toLowerCase().includes(sponsorInput.trim().toLowerCase()))
                  .map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setSponsorInput(s);
                        setShowSponsorSuggestions(false);
                      }}
                      className="w-full text-left px-2 py-1 rounded-lg text-xs hover:bg-rose-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200"
                    >
                      {s}
                    </button>
                  ))}
                <button
                  type="button"
                  onClick={() => setShowSponsorSuggestions(false)}
                  className="w-full text-center text-[10px] text-slate-400 py-0.5 hover:text-slate-600"
                >
                  關閉建議
                </button>
              </div>
            )}
          </div>

          {/* 上手白金 (手動輸入，自動帶出同欄位已有的類似姓名) */}
          <div className="relative">
            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-0.5">
              上手白金 (自動提示)
            </label>
            <input
              type="text"
              placeholder="輸入上手白金..."
              value={platinumInput}
              onFocus={() => setShowPlatinumSuggestions(true)}
              onChange={e => {
                setPlatinumInput(e.target.value);
                setShowPlatinumSuggestions(true);
              }}
              className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-hidden"
            />
            {showPlatinumSuggestions && platinumInput.trim() && (
              <div className="absolute top-full left-0 right-0 z-20 mt-1 max-h-36 overflow-y-auto rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-lg p-1">
                {existingPlatinums
                  .filter(s => s.toLowerCase().includes(platinumInput.trim().toLowerCase()))
                  .map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setPlatinumInput(s);
                        setShowPlatinumSuggestions(false);
                      }}
                      className="w-full text-left px-2 py-1 rounded-lg text-xs hover:bg-rose-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200"
                    >
                      {s}
                    </button>
                  ))}
                <button
                  type="button"
                  onClick={() => setShowPlatinumSuggestions(false)}
                  className="w-full text-center text-[10px] text-slate-400 py-0.5 hover:text-slate-600"
                >
                  關閉建議
                </button>
              </div>
            )}
          </div>

          {/* 上手鑽石 (手動輸入，自動帶出同欄位已有的類似姓名) */}
          <div className="relative">
            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-0.5">
              上手鑽石 (自動提示)
            </label>
            <input
              type="text"
              placeholder="輸入上手鑽石..."
              value={diamondInput}
              onFocus={() => setShowDiamondSuggestions(true)}
              onChange={e => {
                setDiamondInput(e.target.value);
                setShowDiamondSuggestions(true);
              }}
              className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-hidden"
            />
            {showDiamondSuggestions && diamondInput.trim() && (
              <div className="absolute top-full left-0 right-0 z-20 mt-1 max-h-36 overflow-y-auto rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-lg p-1">
                {existingDiamonds
                  .filter(s => s.toLowerCase().includes(diamondInput.trim().toLowerCase()))
                  .map(s => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        setDiamondInput(s);
                        setShowDiamondSuggestions(false);
                      }}
                      className="w-full text-left px-2 py-1 rounded-lg text-xs hover:bg-rose-50 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200"
                    >
                      {s}
                    </button>
                  ))}
                <button
                  type="button"
                  onClick={() => setShowDiamondSuggestions(false)}
                  className="w-full text-center text-[10px] text-slate-400 py-0.5 hover:text-slate-600"
                >
                  關閉建議
                </button>
              </div>
            )}
          </div>

          {/* 西元出生年份 (下拉選單) */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-0.5">
              西元出生年份
            </label>
            <ThemedSelect
              value={selectedBirthYear}
              onChange={e => setSelectedBirthYear(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-hidden"
            >
              <option value="全部">全部年份</option>
              {birthYears.map(y => (
                <option key={y} value={y}>
                  {y} 年
                </option>
              ))}
            </ThemedSelect>
          </div>

          {/* 星座 (下拉選單) */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-0.5">
              星座
            </label>
            <ThemedSelect
              value={selectedZodiac}
              onChange={e => setSelectedZodiac(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-hidden"
            >
              <option value="全部">全部星座</option>
              {ZODIAC_OPTIONS.map(z => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </ThemedSelect>
          </div>

          {/* 生命靈數 (下拉選單 1-9) */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-0.5">
              生命靈數
            </label>
            <ThemedSelect
              value={selectedLifeNumber}
              onChange={e => setSelectedLifeNumber(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-hidden"
            >
              <option value="全部">全部靈數 (1~9)</option>
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(n => (
                <option key={n} value={String(n)}>
                  {n} 號人
                </option>
              ))}
            </ThemedSelect>
          </div>

          {/* 居住地 (下拉選單) */}
          <div>
            <label className="block text-[11px] font-bold text-slate-600 dark:text-slate-300 mb-0.5">
              居住地
            </label>
            <ThemedSelect
              value={selectedResidence}
              onChange={e => setSelectedResidence(e.target.value)}
              className="w-full px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-100 outline-hidden"
            >
              <option value="全部">全部縣市</option>
              {RESIDENCE_OPTIONS.map(r => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </ThemedSelect>
          </div>
        </div>
      </div>

      {/* STATS CHARTS & GRAPHS SECTION */}
      {/* 1. 各階層獎銜人數（高獎銜擺在最前面） */}
      <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700 space-y-3 shadow-2xs">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
            <Award className="w-4 h-4 text-amber-500" />
            <span>各階層最高獎銜人數（高獎銜排列在前）</span>
          </span>
          <span className="text-[11px] text-slate-400">
            共 {totalCount} 位符合
          </span>
        </div>

        {totalCount === 0 ? (
          <div className="text-center py-6 text-xs text-slate-400">目前無符合篩選條件的成員</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            {rankStats.map(({ name, count }) => {
              const pct = totalCount > 0 ? (count / totalCount) * 100 : 0;
              return (
                <div
                  key={name}
                  className="p-2 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2"
                >
                  <span className="font-bold text-slate-700 dark:text-slate-200 w-24 truncate">
                    {name}
                  </span>
                  <div className="flex-1 h-3 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden mx-1">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: 'var(--color-primary, #c06c84)'
                      }}
                    />
                  </div>
                  <span className="font-mono font-bold text-slate-800 dark:text-slate-200 w-16 text-right">
                    {count} 人 <span className="text-[10px] text-slate-400 font-normal">({pct.toFixed(0)}%)</span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 2. 雙欄/三欄圖表：初次認識、留在安麗原因 & 星座分佈 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {/* 初次如何認識安麗？原因分佈 */}
        <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700 space-y-2.5 shadow-2xs">
          <span className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
            <Compass className="w-4 h-4 text-blue-500" />
            <span>初次如何認識安麗？分佈人數</span>
          </span>

          {totalCount === 0 ? (
            <div className="text-center py-6 text-xs text-slate-400">目前無符合篩選條件的成員</div>
          ) : (
            <div className="space-y-1.5 text-xs max-h-48 overflow-y-auto pr-1">
              {joinReasonStats.map(({ name, count }) => {
                const pct = totalCount > 0 ? (count / totalCount) * 100 : 0;
                return (
                  <div key={name} className="flex items-center justify-between gap-2">
                    <span className="text-slate-600 dark:text-slate-300 w-24 truncate" title={name}>{name}</span>
                    <div className="flex-1 h-2.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-blue-500 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="font-mono text-[11px] font-bold text-slate-700 dark:text-slate-300 w-12 text-right">
                      {count} 人
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 什麼原因留在安麗？分佈 (Requirement 1) */}
        <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700 space-y-2.5 shadow-2xs">
          <span className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-pink-500" />
            <span>什麼原因留在安麗？分佈人數</span>
          </span>

          {totalCount === 0 ? (
            <div className="text-center py-6 text-xs text-slate-400">目前無符合篩選條件的成員</div>
          ) : (
            <div className="space-y-1.5 text-xs max-h-48 overflow-y-auto pr-1">
              {stayReasonStats.map(({ name, count }) => {
                const pct = totalCount > 0 ? (count / totalCount) * 100 : 0;
                return (
                  <div key={name} className="flex items-center justify-between gap-2">
                    <span className="text-slate-600 dark:text-slate-300 w-24 truncate" title={name}>{name}</span>
                    <div className="flex-1 h-2.5 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-pink-500 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="font-mono text-[11px] font-bold text-slate-700 dark:text-slate-300 w-12 text-right">
                      {count} 人
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 成員星座分佈 */}
        <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700 space-y-2.5 shadow-2xs">
          <span className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-purple-500" />
            <span>成員星座分佈人數</span>
          </span>

          {totalCount === 0 ? (
            <div className="text-center py-6 text-xs text-slate-400">目前無符合篩選條件的成員</div>
          ) : (
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
              {zodiacStats.map(({ name, count }) => {
                const pct = totalCount > 0 ? (count / totalCount) * 100 : 0;
                return (
                  <div key={name} className="flex items-center justify-between gap-1.5">
                    <span className="text-slate-600 dark:text-slate-300 truncate w-14">{name}</span>
                    <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-purple-500 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="font-mono text-[10px] font-bold text-slate-700 dark:text-slate-300 w-8 text-right">
                      {count}人
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 3. 雙欄圖表：生命靈數 (1-9) & 居住地區 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* 生命靈數 (1-9號人) */}
        <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700 space-y-2.5 shadow-2xs">
          <span className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-emerald-500" />
            <span>生命靈數（1-9 號人）總人數分佈</span>
          </span>

          {totalCount === 0 ? (
            <div className="text-center py-6 text-xs text-slate-400">目前無符合篩選條件的成員</div>
          ) : (
            <div className="grid grid-cols-3 gap-2 text-xs">
              {lifeNumberStats.map(({ num, count }) => (
                <div
                  key={num}
                  className="p-2 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 text-center space-y-0.5"
                >
                  <span className="text-[10px] text-slate-400 block font-semibold">{num} 號人</span>
                  <span className="text-sm font-extrabold font-mono text-emerald-600 dark:text-emerald-400">
                    {count}
                  </span>
                  <span className="text-[10px] text-slate-500 ml-0.5">人</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 居住地區分佈 (前 8 大地區) */}
        <div className="p-3.5 rounded-2xl bg-white dark:bg-slate-800/80 border border-slate-200/70 dark:border-slate-700 space-y-2.5 shadow-2xs">
          <span className="text-xs font-bold text-slate-800 dark:text-slate-100 flex items-center gap-1.5">
            <MapPin className="w-4 h-4 text-amber-500" />
            <span>居住地分佈（前 8 大地區）</span>
          </span>

          {totalCount === 0 ? (
            <div className="text-center py-6 text-xs text-slate-400">目前無符合篩選條件的成員</div>
          ) : (
            <div className="space-y-1.5 text-xs">
              {residenceStats.slice(0, 8).map(({ name, count }) => {
                const pct = totalCount > 0 ? (count / totalCount) * 100 : 0;
                return (
                  <div key={name} className="flex items-center justify-between gap-2">
                    <span className="text-slate-600 dark:text-slate-300 w-16 truncate">{name}</span>
                    <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-amber-500 transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="font-mono text-[11px] font-bold text-slate-700 dark:text-slate-300 w-12 text-right">
                      {count} 人
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Export Format Selection Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 w-full max-w-sm border border-rose-100 dark:border-slate-800 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-bold text-base text-slate-800 dark:text-slate-100 flex items-center gap-2">
                <Download className="w-4 h-4 text-rose-500" />
                <span>匯出數據中心報表</span>
              </h4>
              <button
                type="button"
                onClick={() => setShowExportModal(false)}
                className="text-slate-400 hover:text-slate-600 text-sm"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
              將依據當前選取的 <strong className="text-slate-800 dark:text-slate-200">{totalCount} 人</strong> 與篩選條件產生報表。行動裝置會自動開啟系統原生分享選單，或提供直接下載。
            </p>

            <div className="space-y-2 pt-1">
              <button
                type="button"
                disabled={isExporting !== null}
                onClick={() => handleExport('pdf')}
                className="w-full p-3 rounded-2xl border border-rose-200 dark:border-rose-900/60 bg-rose-50/70 dark:bg-rose-950/40 hover:bg-rose-100 transition-colors flex items-center gap-3 text-left group"
              >
                <div className="w-9 h-9 rounded-xl bg-rose-500 text-white flex items-center justify-center shadow-xs shrink-0">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h5 className="font-bold text-xs text-slate-900 dark:text-slate-100 group-hover:text-rose-600 transition-colors">
                    {isExporting === 'pdf' ? '繪製 PDF 報表中...' : '匯出為 PDF 報表檔'}
                  </h5>
                  <p className="text-[11px] text-slate-500">適合列印、分享或作為會議圖表文件</p>
                </div>
              </button>

              <button
                type="button"
                disabled={isExporting !== null}
                onClick={() => handleExport('excel')}
                className="w-full p-3 rounded-2xl border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/40 hover:bg-emerald-100 transition-colors flex items-center gap-3 text-left group"
              >
                <div className="w-9 h-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs shrink-0">
                  <FileSpreadsheet className="w-5 h-5" />
                </div>
                <div>
                  <h5 className="font-bold text-xs text-slate-900 dark:text-slate-100 group-hover:text-emerald-600 transition-colors">
                    {isExporting === 'excel' ? '產生 Excel 檔中...' : '匯出為 Excel 檔案 (.csv)'}
                  </h5>
                  <p className="text-[11px] text-slate-500">含完整數值與佔比，支援 Excel / Numbers</p>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
