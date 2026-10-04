import React, { useEffect, useState } from 'react';

export interface TutorialTargetSpec {
  key: string;
  selector: string;
  text: string;
}

interface TutorialSpotlightProps {
  active: boolean;
  targets: TutorialTargetSpec[];
  neverRemind: boolean;
  onNeverRemindChange: (checked: boolean) => void;
  onDismiss: () => void;
  opacity?: number;
  zIndex?: number;
}

type SpotlightRect = {
  top: number;
  left: number;
  right: number;
  bottom: number;
};

type ViewportSize = {
  width: number;
  height: number;
};

type CalloutPlacement = {
  left: number;
  top: number;
  width: number;
  height: number;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), Math.max(min, max));

const overlaps = (
  a: { left: number; top: number; right: number; bottom: number },
  b: { left: number; top: number; right: number; bottom: number },
  gap = 0
) =>
  !(
    a.right + gap <= b.left ||
    b.right + gap <= a.left ||
    a.bottom + gap <= b.top ||
    b.bottom + gap <= a.top
  );

const findVisibleTarget = (selector: string) => {
  const elements = Array.from(document.querySelectorAll<HTMLElement>(selector));
  return elements.find(element => {
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      rect.width > 0 &&
      rect.height > 0
    );
  }) || null;
};

export const TutorialSpotlight: React.FC<TutorialSpotlightProps> = ({
  active,
  targets,
  neverRemind,
  onNeverRemindChange,
  onDismiss,
  opacity = 0.92,
  zIndex = 80
}) => {
  const [rects, setRects] = useState<Record<string, SpotlightRect>>({});
  const [viewport, setViewport] = useState<ViewportSize>({ width: 0, height: 0 });

  useEffect(() => {
    if (!active || typeof window === 'undefined' || typeof document === 'undefined') {
      setRects({});
      return;
    }

    let frame = 0;
    let resizeObserver: ResizeObserver | null = null;

    const update = () => {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(() => {
        const next: Record<string, SpotlightRect> = {};
        const observed: HTMLElement[] = [];

        targets.forEach(target => {
          const element = findVisibleTarget(target.selector);
          if (!element) return;

          const bounds = element.getBoundingClientRect();
          const padding = 6;
          next[target.key] = {
            top: Math.max(0, bounds.top - padding),
            left: Math.max(0, bounds.left - padding),
            right: Math.min(window.innerWidth, bounds.right + padding),
            bottom: Math.min(window.innerHeight, bounds.bottom + padding)
          };
          observed.push(element);
        });

        setViewport({ width: window.innerWidth, height: window.innerHeight });
        setRects(next);

        resizeObserver?.disconnect();
        if (typeof ResizeObserver !== 'undefined') {
          resizeObserver = new ResizeObserver(update);
          observed.forEach(element => resizeObserver?.observe(element));
        }
      });
    };

    update();
    const delayed = window.setTimeout(update, 180);
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    window.addEventListener('scroll', update, true);

    const mutationObserver = new MutationObserver(update);
    mutationObserver.observe(document.body, { childList: true, subtree: true });

    return () => {
      window.clearTimeout(delayed);
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
      window.removeEventListener('scroll', update, true);
      mutationObserver.disconnect();
      resizeObserver?.disconnect();
    };
  }, [active, targets]);

  if (!active || viewport.width <= 0 || viewport.height <= 0) return null;

  const visibleTargets = targets.filter(target => rects[target.key]);
  if (visibleTargets.length === 0) return null;

  const isPhone = viewport.width < 560;
  const isTablet = viewport.width >= 560 && viewport.width < 980;
  const edge = isPhone ? 8 : 12;

  const widthFor = (key: string) => {
    if (key === 'visitor') return isPhone ? 226 : isTablet ? 250 : 286;
    return isPhone ? 134 : isTablet ? 154 : 170;
  };

  const heightFor = (key: string) => {
    if (key === 'visitor') return isPhone ? 176 : isTablet ? 160 : 150;
    return isPhone ? 54 : 56;
  };

  // All devices use the same visual rule:
  // every explanation box sits at the lower-right of its target.
  const positions = visibleTargets.map(target => {
    const rect = rects[target.key];
    const width = Math.min(widthFor(target.key), viewport.width - edge * 2);
    const height = heightFor(target.key);

    const targetCenterX = (rect.left + rect.right) / 2;

    return {
      target,
      rect,
      position: {
        // The logo instruction is centered directly under 「繁星回聲」.
        // Other instructions keep the requested lower-right placement.
        left: target.key === 'logo'
          ? clamp(
              targetCenterX - width / 2,
              edge,
              viewport.width - width - edge
            )
          : clamp(
              rect.right - width * 0.22,
              edge,
              viewport.width - width - edge
            ),
        top: clamp(
          rect.bottom + (target.key === 'logo' ? 42 : 34),
          edge,
          viewport.height - height - edge
        ),
        width,
        height
      } as CalloutPlacement
    };
  });

  const controlWidth = Math.min(isPhone ? 278 : 286, viewport.width - 24);
  const controlHeight = isPhone ? 134 : 124;

  let controlTop = viewport.height / 2 - controlHeight / 2;

  // On phones the shared control follows the photo instruction instead of
  // sticking to the bottom of the viewport. Resize/orientation updates above
  // recalculate both positions together whenever the visible height changes.
  if (isPhone) {
    const photo = positions.find(item => item.target.key === 'photo');
    if (photo) {
      const belowPhotoCallout = photo.position.top + photo.position.height + 16;
      const abovePhotoCallout = photo.position.top - controlHeight - 16;
      const roomBelow = belowPhotoCallout + controlHeight <= viewport.height - 12;
      controlTop = clamp(
        roomBelow ? belowPhotoCallout : abovePhotoCallout,
        12,
        viewport.height - controlHeight - 12
      );
    } else {
      controlTop = clamp(
        viewport.height * 0.56,
        12,
        viewport.height - controlHeight - 12
      );
    }
  }

  const arrowPoints = (
    targetKey: string,
    rect: SpotlightRect,
    position: CalloutPlacement
  ) => {
    if (targetKey === 'logo') {
      const centerX = (rect.left + rect.right) / 2;
      const startY = rect.bottom + 7;
      // Logo arrow is always a short, perfectly vertical downward arrow.
      return {
        x1: centerX,
        y1: startY,
        x2: centerX,
        y2: Math.min(position.top - 5, startY + 30)
      };
    }

    const targetX = clamp(rect.right - 10, 10, viewport.width - 10);
    const targetY = clamp(rect.bottom - 4, 10, viewport.height - 10);
    const boxX = clamp(
      targetX + 18,
      position.left + 18,
      position.left + position.width - 18
    );
    const boxY = position.top;

    const dx = boxX - targetX;
    const dy = boxY - targetY;
    const distance = Math.max(1, Math.hypot(dx, dy));
    const ux = dx / distance;
    const uy = dy / distance;

    return {
      x1: targetX + ux * 34,
      y1: targetY + uy * 34,
      x2: targetX + ux * 4,
      y2: targetY + uy * 4
    };
  };

  return (
    <>
      <svg
        aria-hidden="true"
        className="fixed inset-0 w-full h-full pointer-events-none"
        style={{ zIndex }}
        viewBox={`0 0 ${viewport.width} ${viewport.height}`}
        preserveAspectRatio="none"
      >
        <defs>
          <mask id="echostars-tutorial-mask">
            <rect width={viewport.width} height={viewport.height} fill="white" />
            {visibleTargets.map(target => {
              const rect = rects[target.key];
              return (
                <rect
                  key={target.key}
                  x={rect.left}
                  y={rect.top}
                  width={Math.max(0, rect.right - rect.left)}
                  height={Math.max(0, rect.bottom - rect.top)}
                  rx="16"
                  ry="16"
                  fill="black"
                />
              );
            })}
          </mask>
          <marker
            id="echostars-tutorial-arrow"
            markerWidth="12"
            markerHeight="12"
            refX="10.5"
            refY="6"
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <path d="M0,0 L12,6 L0,12 z" fill="var(--color-primary, #c06c84)" />
          </marker>
        </defs>

        <rect
          width={viewport.width}
          height={viewport.height}
          fill={`rgba(0,0,0,${opacity})`}
          mask="url(#echostars-tutorial-mask)"
        />

        {visibleTargets.map(target => {
          const rect = rects[target.key];
          return (
            <rect
              key={`outline-${target.key}`}
              x={rect.left}
              y={rect.top}
              width={Math.max(0, rect.right - rect.left)}
              height={Math.max(0, rect.bottom - rect.top)}
              rx="16"
              ry="16"
              fill="none"
              stroke="rgba(255,255,255,0.94)"
              strokeWidth="2"
            />
          );
        })}

        {positions.map(({ target, rect, position }) => {
          const points = arrowPoints(target.key, rect, position);
          return (
            <line
              key={`arrow-${target.key}`}
              x1={points.x1}
              y1={points.y1}
              x2={points.x2}
              y2={points.y2}
              stroke="var(--color-primary, #c06c84)"
              strokeWidth="2.8"
              strokeLinecap="round"
              markerEnd="url(#echostars-tutorial-arrow)"
            />
          );
        })}
      </svg>

      {positions.map(({ target, position }) => (
        <div
          key={`callout-${target.key}`}
          role="status"
          className="fixed pointer-events-none flex items-center justify-center rounded-xl sm:rounded-2xl border border-white/90 bg-[var(--color-primary)] text-white px-2.5 py-2 shadow-xl"
          style={{
            left: position.left,
            top: position.top,
            width: position.width,
            height: position.height,
            zIndex: zIndex + 10
          }}
        >
          <p
            className="font-black text-center"
            style={{
              fontSize: isPhone ? 13 : 14,
              lineHeight: 1.3,
              whiteSpace: 'pre-line',
              wordBreak: 'keep-all',
              overflowWrap: 'break-word'
            }}
          >
            {target.text}
          </p>
        </div>
      ))}

      <div
        className="fixed left-1/2 -translate-x-1/2 z-[110] rounded-3xl border border-white/30 bg-slate-950/96 text-white px-3.5 py-3.5 shadow-2xl"
        style={{ width: controlWidth, top: controlTop }}
        role="dialog"
        aria-modal="true"
        aria-label="首頁新手教學"
      >
        <label className="flex items-center justify-center gap-3 rounded-xl bg-white/10 px-3 py-2.5 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={neverRemind}
            onChange={event => onNeverRemindChange(event.target.checked)}
            className="w-8 h-8 rounded-lg border-white/70 accent-white cursor-pointer shrink-0"
          />
          <span className="font-black text-sm sm:text-base">打勾不再顯示新手教學</span>
        </label>
        <button
          type="button"
          onClick={onDismiss}
          className="mt-2.5 w-full rounded-xl bg-white text-slate-950 px-4 py-2.5 font-black shadow-md"
        >
          知道了
        </button>
      </div>
    </>
  );
};
