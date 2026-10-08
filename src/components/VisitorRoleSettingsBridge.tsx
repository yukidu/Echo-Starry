import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  DEFAULT_VISITOR_ROLE_TEXT,
  VISITOR_ROLE_MAX_LENGTH,
  hydrateVisitorRoleText,
  readCachedVisitorRoleText,
  saveVisitorRoleText
} from '../visitorRoleSettings';
import '../v136GuestMenu.css';

const HOST_ID = 'echostars-visitor-role-settings-host';

function findRulesForm() {
  return Array.from(document.querySelectorAll<HTMLFormElement>('.sticker-page form'))
    .find(form => form.textContent?.includes('好手氣提示文字') && form.textContent?.includes('儲存貼紙規則')) || null;
}

export const VisitorRoleSettingsBridge: React.FC = () => {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const [value, setValue] = useState(readCachedVisitorRoleText);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    void hydrateVisitorRoleText().then(setValue);

    let ownedHost: HTMLElement | null = null;
    const syncHost = () => {
      const form = findRulesForm();
      if (!form) {
        setHost(null);
        return;
      }
      let nextHost = form.querySelector<HTMLElement>(`#${HOST_ID}`);
      if (!nextHost) {
        nextHost = document.createElement('div');
        nextHost.id = HOST_ID;
        const submit = form.querySelector<HTMLButtonElement>('button[type="submit"]');
        if (submit) form.insertBefore(nextHost, submit);
        else form.appendChild(nextHost);
        ownedHost = nextHost;
      }
      setHost(nextHost);
    };

    syncHost();
    const observer = new MutationObserver(syncHost);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      observer.disconnect();
      if (ownedHost?.isConnected) ownedHost.remove();
    };
  }, []);

  useEffect(() => {
    if (!host) return;
    setNotice('');
    setError('');
    void hydrateVisitorRoleText(true).then(setValue);
  }, [host]);

  if (!host) return null;

  const save = async () => {
    const clean = value.trim();
    if (!clean) {
      setError('訪客顯示文字不可空白');
      return;
    }
    setSaving(true);
    setNotice('');
    setError('');
    try {
      const saved = await saveVisitorRoleText(clean);
      setValue(saved || DEFAULT_VISITOR_ROLE_TEXT);
      setNotice('訪客身分顯示文字已儲存');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '無法儲存訪客顯示文字');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-3 space-y-2">
      <div>
        <h3 className="font-bold text-sm">訪客身分顯示文字</h3>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          只控制未登入訪客的身分名稱，和「繁星解答／好手氣提示文字」是不同設定。
        </p>
      </div>
      <div className="flex items-center gap-2">
        <input
          aria-label="訪客身分顯示文字"
          value={value}
          onChange={event => setValue(Array.from(event.target.value).slice(0, VISITOR_ROLE_MAX_LENGTH).join(''))}
          maxLength={VISITOR_ROLE_MAX_LENGTH}
          className="min-w-0 flex-1 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100"
          placeholder={DEFAULT_VISITOR_ROLE_TEXT}
        />
        <button
          type="button"
          disabled={saving || !value.trim()}
          onClick={() => void save()}
          className="shrink-0 rounded-xl px-3 py-2 text-white text-xs font-bold disabled:opacity-50"
          style={{ backgroundColor: 'var(--color-primary,#c06c84)' }}
        >
          {saving ? '儲存中…' : '儲存訪客文字'}
        </button>
      </div>
      <p className="text-[11px] text-slate-400">最多 {VISITOR_ROLE_MAX_LENGTH} 個字。</p>
      {notice && <p role="status" className="text-xs font-bold text-emerald-600">{notice}</p>}
      {error && <p role="alert" className="text-xs font-bold text-rose-600">{error}</p>}
    </div>,
    host
  );
};
