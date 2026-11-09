import '../styles/components.css';

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