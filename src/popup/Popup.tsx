import { useState, useEffect, MouseEvent } from 'react';
import { captureWindow, closeTabsSafely, restoreStash } from '../tabs';
import { createGroupWithTabs, addTabsToGroup, loadIndex, getNextDefaultName } from '../storage';
import { StashIndexEntry, TabRecord, TabColor } from '../storage/types';
import { TriStateCheckbox, plural, ColorMenu, Wordmark } from '../ui/components';
import '@fontsource-variable/instrument-sans';
import '../styles/components.css';

const COLORS: TabColor[] = ["blue", "red", "yellow", "green", "pink", "cyan", "orange", "grey"];

export default function Popup() {
  const [stashes, setStashes] = useState<StashIndexEntry[]>([]);
  const [windowTabs, setWindowTabs] = useState<TabRecord[]>([]);
  const [tabIds, setTabIds] = useState<number[]>([]);
  const [selectedTabs, setSelectedTabs] = useState<Set<number>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  
  const [saveTarget, setSaveTarget] = useState('new');
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupColor, setNewGroupColor] = useState<TabColor>('grey');
  const [closeAfter, setCloseAfter] = useState(false);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saveNotice, setSaveNotice] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
      try {
        const [index, capture] = await Promise.all([
          loadIndex(),
          captureWindow()
        ]);
        
        const sortedStashes = index.stashes
          .filter(s => !s.deleted)
          .sort((a, b) => b.updatedAt - a.updatedAt);
        
        setStashes(sortedStashes);
        setWindowTabs(capture.tabs);
        setTabIds(capture.tabIdsToClose);
        setSelectedTabs(new Set(capture.tabs.map((_, i) => i)));

        const usedColors = new Set(sortedStashes.map(s => s.color).filter(Boolean));
        const nextColor = COLORS.find(c => !usedColors.has(c)) || 'grey';
        setNewGroupColor(nextColor);
      } catch (err: any) {
        setError(err.message || 'Failed to load popup data.');
      } finally {
        setLoading(false);
      }
    }
    init();
  }, []);

  const handleCheck = (e: MouseEvent<HTMLInputElement>, index: number) => {
    const newSelected = new Set(selectedTabs);
    
    if (e.shiftKey && lastSelectedIndex !== null) {
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      const isChecking = !selectedTabs.has(index);
      
      for (let i = start; i <= end; i++) {
        if (isChecking) newSelected.add(i);
        else newSelected.delete(i);
      }
    } else {
      if (newSelected.has(index)) newSelected.delete(index);
      else newSelected.add(index);
      setLastSelectedIndex(index);
    }
    setSelectedTabs(newSelected);
  };

  const handleSave = async () => {
    if (selectedTabs.size === 0) return;
    setLoading(true);
    setError(null);
    
    try {
      const targetTabs = windowTabs.filter((_, i) => selectedTabs.has(i));
      const targetTabIds = tabIds.filter((_, i) => selectedTabs.has(i));
      const capture = await captureWindow();
      
      let addedCount = 0;
      let duplicateCount = 0;
      let targetNameDisplay = 'New group';
      
      if (saveTarget === 'new') {
         targetNameDisplay = newGroupName.trim() ? newGroupName : await getNextDefaultName();
         await createGroupWithTabs(targetNameDisplay, targetTabs, capture.groups, newGroupColor);
         addedCount = targetTabs.length;
      } else {
         targetNameDisplay = stashes.find(s => s.id === saveTarget)?.name || 'Updated Group';
         const res = await addTabsToGroup(saveTarget, targetTabs);
         addedCount = res.added;
         duplicateCount = res.duplicates;
      }
      
      const newIndex = await loadIndex();
      const updatedEntry = newIndex.stashes.find(s => s.name === targetNameDisplay && !s.deleted);
      if (updatedEntry?.store === 'local') {
        setSaveNotice('Saved on this computer only. Sync storage is full.');
        setTimeout(() => setSaveNotice(null), 5000);
      }

      if (closeAfter && (addedCount > 0 || duplicateCount > 0)) {
        await closeTabsSafely(targetTabIds);
      }
      
      const sortedStashes = newIndex.stashes.filter(s => !s.deleted).sort((a, b) => b.updatedAt - a.updatedAt);
      setStashes(sortedStashes);
      
      if (saveTarget !== 'new' && addedCount === 0 && duplicateCount > 0) {
          setSaveNotice(`All selected tabs are already in ${targetNameDisplay}`);
          setTimeout(() => setSaveNotice(null), 5000);
      } else if (saveTarget !== 'new' && addedCount > 0 && duplicateCount > 0) {
          setSaveNotice(`${addedCount} saved, ${duplicateCount} already in ${targetNameDisplay}`);
          setTimeout(() => setSaveNotice(null), 5000);
      } else {
          setSaveNotice(`${addedCount} ${plural(addedCount, 'tab')} saved to ${targetNameDisplay}`);
          setTimeout(() => setSaveNotice(null), 5000);
      }

      setNewGroupName('');
      setSaveTarget('new');

      const usedColors = new Set(sortedStashes.map(s => s.color).filter(Boolean));
      const nextColor = COLORS.find(c => !usedColors.has(c)) || 'grey';
      setNewGroupColor(nextColor);
    } catch (err: any) {
      setError(err.message || 'Failed to save tabs.');
    } finally {
      setLoading(false);
    }
  };

  if (loading && windowTabs.length === 0) {
    return <div style={{ padding: '16px', color: 'var(--color-muted)' }}>Loading tabs...</div>;
  }

  const displayColor = saveTarget === 'new' ? newGroupColor : (stashes.find(s => s.id === saveTarget)?.color || 'grey');

  return (
    <>
      <header className="popup-header" style={{ padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="var(--color-accent)"><rect x="2" y="2" width="12" height="4" rx="2"/><rect x="2" y="7" width="10" height="4" rx="2"/><rect x="2" y="12" width="8" height="4" rx="2"/></svg>
          <Wordmark size="sm" />
        </div>
        <a href="/manager.html" target="_blank" className="link link--external" style={{ marginRight: '-8px' }}>
            Open manager
            <svg viewBox="0 0 24 24"><path d="M7 17L17 7M17 7H7M17 7V17"/></svg>
        </a>
      </header>

      <div className="popup-saveto" style={{ padding: '0 16px 12px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {error && <div style={{ color: 'var(--color-danger)', fontSize: '13px' }}>{error}</div>}
        {saveNotice && <div style={{ color: 'var(--color-muted)', fontSize: '12px', background: 'var(--color-card)', padding: '8px', border: '1px solid var(--color-border)', borderRadius: '6px' }}>{saveNotice}</div>}

        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <div style={{ position: 'absolute', left: '12px', width: '10px', height: '10px', borderRadius: '50%', background: `var(--group-${displayColor})`, pointerEvents: 'none' }} />
          <select className="select-input" value={saveTarget} onChange={(e) => setSaveTarget(e.target.value)} style={{ paddingLeft: '32px' }}>
            <option value="new">New group...</option>
            {stashes.map(g => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>
        
        {saveTarget === 'new' && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
              <input type="text" className="text-input" placeholder="Group name" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} style={{ flex: 1 }} />
              <ColorMenu value={newGroupColor} onChange={setNewGroupColor} compact={true} />
          </div>
        )}
      </div>

      <div className="popup-toolbar" style={{
        height: '36px',
        borderBottom: '1px solid var(--color-border)',
        borderTop: '1px solid var(--color-border)',
        background: 'var(--color-card)',
        padding: '0 12px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <TriStateCheckbox
          checked={selectedTabs.size === windowTabs.length && windowTabs.length > 0}
          indeterminate={selectedTabs.size > 0 && selectedTabs.size < windowTabs.length}
          onChange={() => {
            if (selectedTabs.size > 0 && selectedTabs.size < windowTabs.length) {
              setSelectedTabs(new Set(windowTabs.map((_, i) => i)));
            } else if (selectedTabs.size === windowTabs.length) {
              setSelectedTabs(new Set());
            } else {
              setSelectedTabs(new Set(windowTabs.map((_, i) => i)));
            }
          }}
          label="Select all"
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="text-muted" style={{ fontSize: '12px' }}>
            {selectedTabs.size} of {plural(windowTabs.length, 'tab')} selected
          </span>
          {selectedTabs.size > 0 && (
             <button onClick={() => setSelectedTabs(new Set())} className="link">Clear</button>
          )}
        </div>
      </div>

      <div className="popup-list" style={{ padding: '0 16px' }}>
        {windowTabs.length === 0 ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--color-muted)', fontSize: '13px' }}>
            No tabs to save in this window.
          </div>
        ) : (
          windowTabs.map((tab, index) => {
            const isSelected = selectedTabs.has(index);
            const faviconUrl = `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent(tab.u)}&size=32`;
            let hostname = '';
            try { hostname = new URL(tab.u).hostname; } catch (e) {}
            const isGithub = hostname === 'github.com' || hostname.endsWith('.github.com');
            
            return (
              <label key={index} className={`tab-list-row ${isSelected ? 'selected' : ''}`} style={{ borderLeft: isSelected ? '3px solid var(--color-accent)' : '3px solid transparent', marginLeft: '-16px', marginRight: '-16px', paddingLeft: '13px', paddingRight: '16px' }}>
                <input type="checkbox" className="custom-checkbox" checked={isSelected} onClick={(e) => handleCheck(e, index)} readOnly />
                <img src={faviconUrl} alt="" className={isGithub ? 'favicon--mono' : ''} style={{ width: '16px', height: '16px' }} />
                <div className="tab-list-content">
                  <div className="tab-list-title">{tab.t}</div>
                  <div className="tab-list-domain">{hostname.replace(/^www\./, '')}</div>
                </div>
              </label>
            );
          })
        )}
      </div>

      <div className="popup-footer" style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--color-border)', background: 'var(--color-card)' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', margin: 0 }}>
          <input type="checkbox" className="custom-checkbox" checked={closeAfter} onChange={(e) => setCloseAfter(e.target.checked)} />
          Close saved tabs
        </label>
        <button className="btn-solid" onClick={handleSave} disabled={selectedTabs.size === 0 || loading}>
          {loading ? 'Saving...' : `Save ${plural(selectedTabs.size, 'tab')}`}
        </button>
      </div>
      
      {stashes.length > 0 && (
        <div className="popup-recent" style={{ borderTop: '1px solid var(--color-border)', padding: '12px 16px', background: 'var(--color-page)' }}>
          <div style={{ fontSize: '12px', color: 'var(--color-muted)', marginBottom: '8px' }}>Recent groups</div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {stashes.slice(0, 2).map(stash => (
              <div key={stash.id} style={{ height: '36px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0', border: 'none', margin: '0' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: `var(--group-${stash.color})` }}></div>
                  <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text)' }}>{stash.name}</div>
                  <div style={{ fontSize: '12px', color: 'var(--color-muted)' }}>{plural(stash.tabCount, 'tab')}</div>
                </div>
                <button className="btn-soft" onClick={() => restoreStash(stash.id, 'current')}>Open</button>
              </div>
            ))}
            {stashes.length > 2 && (
              <div style={{ marginTop: '8px' }}>
                <a href="/manager.html" target="_blank" className="link link--forward" style={{ paddingLeft: 0, paddingRight: 0 }}>
                    See all in manager
                    <svg viewBox="0 0 24 24"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </a>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}