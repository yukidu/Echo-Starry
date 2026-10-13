import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Camera, Check, Crop, RefreshCw, X } from 'lucide-react';

interface AvatarCropModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCropComplete: (compressedBase64: string) => void;
  currentUploadCount: number;
  maxMonthlyUploads?: number;
}

type CropBox = {
  x: number;
  y: number;
  size: number;
};

type DragState = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  startCropX: number;
  startCropY: number;
} | null;

const DEFAULT_CROP_RATIO = 0.82;
const MIN_CROP_RATIO = 0.35;
const OUTPUT_SIZE = 200;

export const AvatarCropModal: React.FC<AvatarCropModalProps> = ({
  isOpen,
  onClose,
  onCropComplete,
  currentUploadCount,
  maxMonthlyUploads = 5
}) => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [cropBox, setCropBox] = useState<CropBox | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imageObjRef = useRef<HTMLImageElement | null>(null);
  const previewImageRef = useRef<HTMLImageElement | null>(null);
  const dragStateRef = useRef<DragState>(null);

  const remainingUploads = Math.max(0, maxMonthlyUploads - currentUploadCount);

  const buildCenteredCrop = (img: HTMLImageElement, ratio = DEFAULT_CROP_RATIO): CropBox => {
    const maxSize = Math.min(img.naturalWidth || img.width, img.naturalHeight || img.height);
    const size = Math.max(1, maxSize * ratio);
    return {
      x: ((img.naturalWidth || img.width) - size) / 2,
      y: ((img.naturalHeight || img.height) - size) / 2,
      size
    };
  };

  const clampCrop = (next: CropBox, img: HTMLImageElement): CropBox => {
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    const maxSize = Math.min(width, height);
    const size = Math.min(maxSize, Math.max(1, next.size));
    return {
      size,
      x: Math.min(Math.max(0, next.x), Math.max(0, width - size)),
      y: Math.min(Math.max(0, next.y), Math.max(0, height - size))
    };
  };

  const resetCrop = () => {
    const img = imageObjRef.current;
    if (!img) return;
    setCropBox(buildCenteredCrop(img));
  };

  useEffect(() => {
    if (!isOpen) {
      setSelectedImage(null);
      setCropBox(null);
      setErrorMessage(null);
      setIsProcessing(false);
      imageObjRef.current = null;
      dragStateRef.current = null;
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setErrorMessage('請選擇圖片檔案。');
      event.target.value = '';
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      setErrorMessage('檔案大小超過 10MB 限制，請選擇較小的圖片！');
      event.target.value = '';
      return;
    }

    if (remainingUploads <= 0) {
      setErrorMessage(`本月修改次數已達上限 (${maxMonthlyUploads} 次)，下個月將重置次數。`);
      event.target.value = '';
      return;
    }

    setErrorMessage(null);
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const img = new Image();
      img.onload = () => {
        imageObjRef.current = img;
        setSelectedImage(result);
        setCropBox(buildCenteredCrop(img));
      };
      img.onerror = () => setErrorMessage('圖片讀取失敗，請重新選擇。');
      img.src = result;
    };
    reader.onerror = () => setErrorMessage('圖片讀取失敗，請重新選擇。');
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const handleCropPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!cropBox) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startCropX: cropBox.x,
      startCropY: cropBox.y
    };
  };

  const handleCropPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragStateRef.current;
    const img = imageObjRef.current;
    const preview = previewImageRef.current;
    const currentCrop = cropBox;
    if (!drag || drag.pointerId !== event.pointerId || !img || !preview || !currentCrop) return;

    event.preventDefault();
    const rect = preview.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;

    const naturalWidth = img.naturalWidth || img.width;
    const naturalHeight = img.naturalHeight || img.height;
    const deltaX = (event.clientX - drag.startClientX) * (naturalWidth / rect.width);
    const deltaY = (event.clientY - drag.startClientY) * (naturalHeight / rect.height);

    setCropBox(clampCrop({
      x: drag.startCropX + deltaX,
      y: drag.startCropY + deltaY,
      size: currentCrop.size
    }, img));
  };

  const handleCropPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragStateRef.current?.pointerId !== event.pointerId) return;
    dragStateRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleCropRatioChange = (ratio: number) => {
    const img = imageObjRef.current;
    if (!img || !cropBox) return;

    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    const maxSize = Math.min(width, height);
    const nextSize = maxSize * ratio;
    const centerX = cropBox.x + cropBox.size / 2;
    const centerY = cropBox.y + cropBox.size / 2;

    setCropBox(clampCrop({
      x: centerX - nextSize / 2,
      y: centerY - nextSize / 2,
      size: nextSize
    }, img));
  };

  const handleConfirmCrop = () => {
    const img = imageObjRef.current;
    const canvas = canvasRef.current;
    if (!img || !canvas || !cropBox) return;

    setIsProcessing(true);
    setErrorMessage(null);

    try {
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('瀏覽器無法建立裁切畫布');

      ctx.clearRect(0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
      ctx.drawImage(
        img,
        cropBox.x,
        cropBox.y,
        cropBox.size,
        cropBox.size,
        0,
        0,
        OUTPUT_SIZE,
        OUTPUT_SIZE
      );

      const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
      onCropComplete(compressedDataUrl);
      onClose();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '裁切壓縮處理失敗');
    } finally {
      setIsProcessing(false);
    }
  };

  const cropStyle = (() => {
    const img = imageObjRef.current;
    if (!img || !cropBox) return undefined;
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    return {
      left: `${(cropBox.x / width) * 100}%`,
      top: `${(cropBox.y / height) * 100}%`,
      width: `${(cropBox.size / width) * 100}%`,
      height: `${(cropBox.size / height) * 100}%`
    };
  })();

  const cropRatio = (() => {
    const img = imageObjRef.current;
    if (!img || !cropBox) return DEFAULT_CROP_RATIO;
    const maxSize = Math.min(img.naturalWidth || img.width, img.naturalHeight || img.height);
    return maxSize > 0 ? cropBox.size / maxSize : DEFAULT_CROP_RATIO;
  })();

  return (
    <div className="app-modal-overlay fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl border border-rose-100/60 dark:border-slate-800">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <div className="w-8 h-8 shrink-0 rounded-lg bg-rose-100 dark:bg-rose-950 flex items-center justify-center text-rose-600 dark:text-rose-300">
              <Crop className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100">裁切大頭照</h3>
              <p className="text-[11px] text-slate-400">
                本月剩餘額度：<span className={remainingUploads > 0 ? 'text-emerald-600 font-bold' : 'text-red-500 font-bold'}>{remainingUploads} / {maxMonthlyUploads} 次</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
            aria-label="關閉裁切視窗"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {errorMessage && (
            <div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-950/60 border border-red-200 text-xs text-red-600 dark:text-red-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {!selectedImage ? (
            <div className="text-center py-8 px-4 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
              <Camera className="w-10 h-10 text-slate-400 mx-auto mb-2" />
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">上傳大頭照（支援最大 10MB）</p>
              <p className="text-[11px] text-slate-400 mt-1">選圖後直接框選要保留的正方形範圍</p>

              <button
                type="button"
                disabled={remainingUploads <= 0}
                onClick={() => fileInputRef.current?.click()}
                className={`mt-4 px-4 py-2 rounded-xl text-white text-xs font-bold shadow-xs transition-all ${
                  remainingUploads > 0
                    ? 'hover:opacity-95 active:scale-95'
                    : 'opacity-50 cursor-not-allowed'
                }`}
                style={{ backgroundColor: 'var(--color-primary, #c06c84)' }}
              >
                {remainingUploads > 0 ? '選擇圖片' : '本月次數已達上限'}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>
          ) : (
            <div className="space-y-3">
              <div className="rounded-xl bg-slate-50 dark:bg-slate-800/70 px-3 py-2 text-[11px] leading-5 text-slate-500 dark:text-slate-300">
                拖曳白色裁切框選擇要保留的範圍。照片本身不再移動或放大；下方只調整裁切框大小。
              </div>

              <div className="flex justify-center overflow-hidden rounded-2xl bg-slate-950/95 p-2">
                <div className="relative inline-block max-w-full select-none">
                  <img
                    ref={previewImageRef}
                    src={selectedImage}
                    alt="大頭照裁切預覽"
                    draggable={false}
                    className="block max-h-[320px] max-w-full select-none rounded-xl object-contain"
                  />
                  {cropStyle && (
                    <div
                      data-avatar-crop-frame="true"
                      className="absolute cursor-move touch-none border-2 border-white rounded-lg shadow-[0_0_0_9999px_rgba(15,23,42,0.58)]"
                      style={cropStyle}
                      onPointerDown={handleCropPointerDown}
                      onPointerMove={handleCropPointerMove}
                      onPointerUp={handleCropPointerEnd}
                      onPointerCancel={handleCropPointerEnd}
                    >
                      <span className="absolute left-1/3 top-0 bottom-0 border-l border-white/50 pointer-events-none" />
                      <span className="absolute left-2/3 top-0 bottom-0 border-l border-white/50 pointer-events-none" />
                      <span className="absolute top-1/3 left-0 right-0 border-t border-white/50 pointer-events-none" />
                      <span className="absolute top-2/3 left-0 right-0 border-t border-white/50 pointer-events-none" />
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-1.5 px-1">
                <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-300">
                  <span className="font-semibold">裁切框大小</span>
                  <button
                    type="button"
                    onClick={resetCrop}
                    className="flex items-center gap-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                  >
                    <RefreshCw className="w-3 h-3" /> 重設裁切
                  </button>
                </div>
                <input
                  aria-label="裁切框大小"
                  type="range"
                  min={MIN_CROP_RATIO}
                  max="1"
                  step="0.01"
                  value={cropRatio}
                  onChange={event => handleCropRatioChange(Number(event.target.value))}
                  className="w-full h-1.5 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-rose-500"
                />
              </div>

              <canvas ref={canvasRef} className="hidden" />

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={isProcessing}
                  onClick={() => {
                    setSelectedImage(null);
                    setCropBox(null);
                    imageObjRef.current = null;
                  }}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-50"
                >
                  重新選擇
                </button>
                <button
                  type="button"
                  disabled={isProcessing || !cropBox}
                  onClick={handleConfirmCrop}
                  className="flex-1 py-2.5 rounded-xl text-white text-xs font-bold shadow-xs flex items-center justify-center gap-1 hover:opacity-95 disabled:opacity-50"
                  style={{ backgroundColor: 'var(--color-primary, #c06c84)' }}
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{isProcessing ? '裁切中...' : '確認裁切'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};