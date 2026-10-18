import React from 'react';
import './AiBadge.css';

/** Unified small AI emblem: uppercase AI and a smoothly rotating rainbow frame. */
export const AiBadge: React.FC<{className?:string}> = ({className=''}) => (
  <span className={`starry-ai-badge ${className}`} role="img" aria-label="AI">
    <span className="starry-ai-badge-text" aria-hidden="true">AI</span>
  </span>
);
