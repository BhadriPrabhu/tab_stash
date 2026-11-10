import React, { useState, useEffect, useRef } from 'react';
import { TabColor } from '../storage/types';
import { IconChevronDown } from './icons';

export function Wordmark({ size = 'default' }: { size?: 'sm' | 'default' }) {
    return (
        <span className={`wordmark ${size === 'sm' ? 'wordmark--sm' : ''}`}>
            <span className="wordmark__tab">Tab</span>
            <span className="wordmark__stash">Stash</span>
        </span>
    );
}

export function plural(n: number, word: string) {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

export function Favicon({ url, size = 16 }: { url: string, size?: number }) {
  const [error, setError] = useState(false);
  const faviconUrl = `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(url)}&size=32`;

  if (error) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, color: 'var(--color-muted)' }}>
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="2" y1="12" x2="22" y2="12"></line>
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
      </svg>
    );
  }

  let hostname = '';
  try { hostname = new URL(url).hostname; } catch (e) {}
  const isGithub = hostname === 'github.com' || hostname.endsWith('.github.com');
  const imgClass = isGithub ? "site-row-favicon favicon--mono" : "site-row-favicon";

  return (
    <img
      src={faviconUrl}
      alt=""
      width={size}
      height={size}
      className={imgClass}
      style={{ width: size, height: size, flexShrink: 0, display: 'block' }}
      onError={() => setError(true)}
    />
  );
}

export function TriStateCheckbox({ checked, indeterminate, onChange, label }: any) {
  const ref = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', margin: 0 }}>
      <input
        ref={ref}
        type="checkbox"
        className="custom-checkbox"
        checked={checked}
        onChange={onChange}
      />
      <span style={{ fontSize: '13px', fontWeight: 500 }}>{label}</span>
    </label>
  );
}

export function useDismiss(open: boolean, onClose: () => void, refs: React.RefObject<HTMLElement>[]) {
    useEffect(() => {
        if (!open) return;

        const handlePointerDown = (e: PointerEvent) => {
            const target = e.target as Node;
            if (refs.every(ref => ref.current && !ref.current.contains(target))) {
                onClose();
            }
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
                if (refs[0]?.current) {
                    refs[0].current.focus();
                }
            }
        };

        const handleBlur = () => {
            if (!document.hasFocus()) onClose();
        };

        const handleScroll = (e: Event) => {
            const target = e.target as Node;
            if (refs.some(ref => ref.current && ref.current.contains(target))) return;
            onClose();
        };

        document.addEventListener('pointerdown', handlePointerDown, true);
        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('blur', handleBlur);
        window.addEventListener('scroll', handleScroll, true);
        window.addEventListener('resize', onClose);

        return () => {
            document.removeEventListener('pointerdown', handlePointerDown, true);
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('blur', handleBlur);
            window.removeEventListener('scroll', handleScroll, true);
            window.removeEventListener('resize', onClose);
        };
    }, [open, onClose, refs]);
}

const COLORS: { id: TabColor, name: string }[] = [
    { id: "blue", name: "Blue" },
    { id: "red", name: "Red" },
    { id: "yellow", name: "Yellow" },
    { id: "green", name: "Green" },
    { id: "pink", name: "Pink" },
    { id: "cyan", name: "Cyan" },
    { id: "orange", name: "Orange" },
    { id: "grey", name: "Grey" },
];

export function ColorMenu({ value, onChange, compact }: { value: TabColor, onChange: (c: TabColor) => void, compact?: boolean }) {
    const [open, setOpen] = useState(false);
    const [activeIndex, setActiveIndex] = useState(0);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    
    useDismiss(open, () => setOpen(false), [triggerRef, menuRef]);

    useEffect(() => {
        if (!open) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIndex(i => (i + 1) % COLORS.length);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIndex(i => (i - 1 + COLORS.length) % COLORS.length);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                onChange(COLORS[activeIndex].id);
                setOpen(false);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [open, activeIndex, onChange]);

    return (
        <div style={{ position: 'relative' }}>
            <button 
                ref={triggerRef}
                onClick={() => { setOpen(!open); setActiveIndex(COLORS.findIndex(c => c.id === value)); }}
                aria-label={compact ? "Group colour" : undefined}
                className="action action--outline"
            >
                <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: `var(--group-${value})` }} />
                {!compact && <span>Color</span>}
                <IconChevronDown size={12} />
            </button>

            {open && (
                <div ref={menuRef} role="listbox" style={{
                    position: 'absolute', top: '100%', right: 0, marginTop: '4px', zIndex: 100,
                    width: '180px',
                    background: 'var(--color-card)', border: '1px solid var(--color-border)',
                    borderRadius: '8px', boxShadow: '0 4px 12px rgba(34,32,28,.12)',
                    padding: '4px', display: 'flex', flexDirection: 'column', gap: '2px'
                }}>
                    {COLORS.map((c, i) => (
                        <button
                            key={c.id}
                            role="option"
                            aria-selected={value === c.id}
                            onClick={() => { onChange(c.id); setOpen(false); }}
                            onMouseEnter={() => setActiveIndex(i)}
                            style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                height: '36px', padding: '0 10px', border: 'none', 
                                background: i === activeIndex ? 'var(--color-row-hover)' : 'transparent',
                                cursor: 'pointer', borderRadius: '4px'
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: `var(--group-${c.id})` }} />
                                <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text)' }}>{c.name}</span>
                            </div>
                            {value === c.id && (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-text)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12"></polyline>
                                </svg>
                            )}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}