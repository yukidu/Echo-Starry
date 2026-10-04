import React, { useLayoutEffect, useRef, useState } from 'react';

interface CollapsibleCommentTextProps {
  children: React.ReactNode;
  className?: string;
  lines?: number;
  resetKey?: React.Key;
  moreLabel?: string;
  lessLabel?: string;
}

export const CollapsibleCommentText: React.FC<CollapsibleCommentTextProps> = ({
  children,
  className = '',
  lines = 3,
  resetKey,
  moreLabel = '更多',
  lessLabel = '收起'
}) => {
  const contentRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [canToggle, setCanToggle] = useState(false);
  const [collapsedHeight, setCollapsedHeight] = useState<number | null>(null);

  useLayoutEffect(() => {
    setExpanded(false);
  }, [resetKey]);

  useLayoutEffect(() => {
    const element = contentRef.current;
    if (!element || typeof window === 'undefined') return;

    const measure = () => {
      const style = window.getComputedStyle(element);
      const parsedLineHeight = Number.parseFloat(style.lineHeight);
      const fontSize = Number.parseFloat(style.fontSize) || 14;
      const lineHeight = Number.isFinite(parsedLineHeight) ? parsedLineHeight : fontSize * 1.5;
      const limit = Math.max(1, lines) * lineHeight;
      setCollapsedHeight(limit);
      setCanToggle(element.scrollHeight > limit + 1);
    };

    measure();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    observer?.observe(element);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [children, lines, expanded]);

  return (
    <div className="min-w-0">
      <div
        ref={contentRef}
        className={className}
        style={!expanded && collapsedHeight !== null ? { maxHeight: `${collapsedHeight}px`, overflow: 'hidden' } : undefined}
      >
        {children}
      </div>
      {canToggle && (
        <button
          type="button"
          onClick={() => setExpanded(value => !value)}
          className="mt-1 ml-auto block w-fit text-xs font-extrabold text-[var(--color-primary,#c06c84)] hover:underline cursor-pointer"
          aria-expanded={expanded}
        >
          {expanded ? lessLabel : moreLabel}
        </button>
      )}
    </div>
  );
};
