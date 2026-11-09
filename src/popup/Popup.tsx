import { useState, MouseEvent } from 'react';
import { Button, TextInput } from '../ui/components';
import { MOCK_TABS, MOCK_STASHES } from '../ui/mockData';

export default function Popup() {
  const [saveTarget, setSaveTarget] = useState('new');
  const [newGroupName, setNewGroupName] = useState('');
  const [selectedTabs, setSelectedTabs] = useState<Set<string>>(new Set(MOCK_TABS.map(t => t.id)));
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);

  const handleCheck = (e: MouseEvent<HTMLInputElement>, index: number, id: string) => {
    const newSelected = new Set(selectedTabs);
    
    if (e.shiftKey && lastSelectedIndex !== null) {
      const start = Math.min(lastSelectedIndex, index);
      const end = Math.max(lastSelectedIndex, index);
      const isChecking = !selectedTabs.has(id);
      
      for (let i = start; i <= end; i++) {
        if (isChecking) newSelected.add(MOCK_TABS[i].id);
        else newSelected.delete(MOCK_TABS[i].id);
      }
    } else {
      if (newSelected.has(id)) newSelected.delete(id);
      else newSelected.add(id);
      setLastSelectedIndex(index);
    }
    setSelectedTabs(newSelected);
  };

  const selectAll = () => setSelectedTabs(new Set(MOCK_TABS.map(t => t.id)));
  const selectNone = () => setSelectedTabs(new Set());

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', padding: '16px' }}>
      
      {/* Top: Save Target */}
      <div style={{ marginBottom: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <select 
          className="select-input" 
          value={saveTarget} 
          onChange={(e) => setSaveTarget(e.target.value)}
        >
          <option value="new">New group...</option>
          {MOCK_STASHES.map(g => (
            <option key={g.id} value={g.id}>{g.name}</option>
          ))}
        </select>
        {saveTarget === 'new' && (
          <TextInput 
            placeholder="Name this group" 
            value={newGroupName} 
            onChange={(e: any) => setNewGroupName(e.target.value)} 
          />
        )}
      </div>

      {/* List Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button className="text-link" onClick={selectAll}>Select all</button>
          <button className="text-link" onClick={selectNone}>Select none</button>
        </div>
        <span className="text-muted" style={{ fontSize: '12px' }}>
          {selectedTabs.size} of {MOCK_TABS.length} selected
        </span>
      </div>

      {/* Scrollable Tab List */}
      <div style={{ flex: 1, overflowY: 'auto', margin: '0 -16px', padding: '0 16px', borderTop: '1px solid var(--color-border)', borderBottom: '1px solid var(--color-border)' }}>
        {MOCK_TABS.map((tab, index) => {
          const isSelected = selectedTabs.has(tab.id);
          const faviconUrl = `https://www.google.com/s2/favicons?domain=${tab.domain}&sz=32`;
          return (
            <label key={tab.id} className="tab-list-row">
              <input 
                type="checkbox" 
                className="tab-checkbox"
                checked={isSelected}
                onClick={(e) => handleCheck(e, index, tab.id)}
                readOnly
              />
              <img src={faviconUrl} alt="" style={{ width: '16px', height: '16px' }} />
              <div className="tab-list-content">
                <div className="tab-list-title">{tab.title}</div>
                <div className="tab-list-domain">{tab.domain}</div>
              </div>
            </label>
          );
        })}
      </div>

      {/* Fixed Bottom */}
      <div style={{ paddingTop: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer' }}>
          <input type="checkbox" defaultChecked className="tab-checkbox" />
          Close saved tabs
        </label>
        <Button 
          variant="solid" 
          style={{ width: '100%' }} 
          disabled={selectedTabs.size === 0}
        >
          {selectedTabs.size === 0 ? 'Save tabs' : `Save ${selectedTabs.size} tabs`}
        </Button>
        <div style={{ textAlign: 'center', marginTop: '4px' }}>
          <a href="/manager.html" target="_blank" className="text-link">Open manager</a>
        </div>
      </div>
    </div>
  );
}