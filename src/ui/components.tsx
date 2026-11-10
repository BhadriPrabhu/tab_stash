import '../styles/components.css';
import React, { useState } from 'react';

export function Button({ variant = 'solid', children, onClick, className = '', disabled }: any) {
  const btnClass = variant === 'solid' ? 'btn-solid' : variant === 'soft' ? 'btn-soft' : 'action-btn';
  
  return (
    <button className={`btn ${btnClass} ${className}`} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

export function TextInput({ placeholder, value, onChange }: any) {
  return (
    <input 
      type="text" 
      className="text-input" 
      placeholder={placeholder} 
      value={value} 
      onChange={onChange} 
    />
  );
}

export function SiteRow({ domain, url, groupColor = 'grey' }: { domain: string, url: string, groupColor?: string }) {
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
  return (
    <div className="card-site-row" style={{ borderColor: `var(--group-${groupColor}-border)` }}>
      <img src={faviconUrl} alt="" className="site-row-favicon" />
      <div className="site-row-content">
        <span className="site-row-domain">{domain}</span>
        <span className="site-row-url">{url.replace('https://', '')}</span>
      </div>
    </div>
  );
}

export function GroupCard({ group }: { group: any }) {
  // Fallback to grey if mock data doesn't have a color yet
  const colorName = group.color || 'grey';
  
  return (
    <div className="stash-card">
      {/* The 3px solid color bar */}
      <div className="card-color-bar" style={{ background: `var(--group-${colorName})` }}></div>
      
      {/* The tinted top area */}
      <div 
        className={`card-top ${group.tabs.length === 0 ? 'empty-state' : ''}`}
        style={{ background: `var(--group-${colorName}-tint)` }}
      >
        {group.tabs.length === 0 ? (
          <>
            <div>No tabs yet</div>
            <div style={{ fontSize: '11px' }}>Add tabs from the popup or context menu.</div>
          </>
        ) : (
          group.tabs.map((tab: any, i: number) => (
            <SiteRow key={i} domain={tab.domain} url={tab.u} groupColor={colorName} />
          ))
        )}
      </div>
      
      <div className="card-bottom">
        <div>
          <div className="card-title-wrapper">
            {/* The 10px footer dot */}
            <div className="card-color-dot" style={{ background: `var(--group-${colorName})` }}></div>
            <div className="card-title">{group.name}</div>
          </div>
          <div className="card-count">{group.tabCount} tabs</div>
        </div>
        {group.tabs.length > 0 && (
          <Button variant="soft">Open</Button>
        )}
      </div>
    </div>
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