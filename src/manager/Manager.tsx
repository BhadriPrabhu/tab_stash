import { useState } from 'react';
import { Button, TextInput } from '../ui/components';
import { MOCK_STASHES } from '../ui/mockData';

function SiteRowWithActions({ tab }: { tab: any }) {
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const faviconUrl = `https://www.google.com/s2/favicons?domain=${tab.domain}&sz=32`;

  return (
    <div className="site-row">
      <img src={faviconUrl} alt="" className="site-row-favicon" />
      <div className="site-row-content">
        <span className="site-row-domain">{tab.domain}</span>
        <span className="site-row-url">{tab.u.replace('https://', '')}</span>
      </div>
      <div className="site-row-actions">
        <button className="action-btn">Open</button>
        <div style={{ position: 'relative' }}>
          <button className="action-btn" onClick={() => setShowMoveMenu(!showMoveMenu)}>Move to...</button>
          {showMoveMenu && (
            <div style={{ position: 'absolute', top: '100%', right: 0, background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: '4px', padding: '4px', zIndex: 10, minWidth: '120px', boxShadow: 'var(--shadow-hover)' }}>
              {MOCK_STASHES.map(g => (
                <div key={g.id} style={{ fontSize: '12px', padding: '4px 8px', cursor: 'pointer' }} className="btn-plain">
                  {g.name}
                </div>
              ))}
            </div>
          )}
        </div>
        <button className="action-btn danger">Remove</button>
      </div>
    </div>
  );
}

function GroupCard({ group }: { group: any }) {
  return (
    <div className="stash-card">
      <div className="card-top" style={{ overflowY: 'auto' }}>
        {group.tabs.length === 0 ? (
          <div style={{ fontSize: '13px', color: 'var(--color-muted)', padding: '12px 0' }}>
            No tabs in this group yet. Add tabs from the popup or context menu.
          </div>
        ) : (
          group.tabs.map((tab: any) => (
            <SiteRowWithActions key={tab.id} tab={tab} />
          ))
        )}
      </div>
      <div className="card-bottom">
        <div>
          <div className="card-title">{group.name}</div>
          <div className="text-muted">{group.tabCount} tabs</div>
        </div>
        <Button variant="solid">Open</Button>
      </div>
    </div>
  );
}

export default function Manager() {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');

  return (
    <div style={{ maxWidth: '1080px', margin: '0 auto', padding: '32px 24px' }}>
      <header style={{ display: 'flex', gap: '16px', alignItems: 'center', marginBottom: '32px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 600, marginRight: 'auto' }}>TabStash</h1>
        <div style={{ width: '240px' }}>
          <TextInput placeholder="Search groups..." />
        </div>
        <Button variant="solid" onClick={() => setIsDialogOpen(true)}>New group</Button>
      </header>
      
      <main className="manager-grid">
        {MOCK_STASHES.map(group => (
          <GroupCard key={group.id} group={group} />
        ))}
      </main>

      {isDialogOpen && (
        <div className="dialog-overlay">
          <div className="dialog-box">
            <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px' }}>Create new group</h2>
            <TextInput 
              placeholder="Group name" 
              value={newGroupName} 
              onChange={(e: any) => setNewGroupName(e.target.value)} 
            />
            <div className="dialog-footer">
              <Button variant="plain" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
              <Button variant="primary" onClick={() => setIsDialogOpen(false)}>Create</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}