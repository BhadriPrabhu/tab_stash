import React, { useState, useEffect, useRef } from 'react';
import { loadIndex, loadStash, deleteStash, renameStash, saveStash, setGroupColor, getNextDefaultName, moveTab } from '../storage';
import { normalizeUrl } from '../storage/urls';
import { StashIndexEntry, TabRecord, GroupRecord, TabColor } from '../storage/types';
import { restoreStash } from '../tabs';
import { Favicon, plural, useDismiss, ColorMenu, Wordmark } from '../ui/components';
import { IconExternal, IconMoveTo, IconPencil, IconTrash } from '../ui/icons';
import '@fontsource-variable/bricolage-grotesque';
import '../styles/components.css';

interface FullStash extends StashIndexEntry {
    tabs: TabRecord[];
    groups: GroupRecord[];
}

function MoveToMenu({ sourceStash, tabUrl, allStashes, onClose, onMove, triggerRef }: any) {
    const menuRef = useRef<HTMLDivElement>(null);
    useDismiss(true, onClose, [triggerRef, menuRef]);

    const normalizedMovingUrl = normalizeUrl(tabUrl);
    const otherStashes = allStashes.filter((s: any) => s.id !== sourceStash.id);
    const options = [...otherStashes, { id: 'new', name: 'New group...', color: 'grey', tabs: [] }];

    const firstValidIndex = options.findIndex(opt => opt.id === 'new' || !opt.tabs.some((t: any) => normalizeUrl(t.u) === normalizedMovingUrl));
    const [activeIndex, setActiveIndex] = useState(firstValidIndex > -1 ? firstValidIndex : 0);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIndex(i => {
                    let next = (i + 1) % options.length;
                    while (options[next].id !== 'new' && options[next].tabs.some((t: any) => normalizeUrl(t.u) === normalizedMovingUrl) && next !== i) {
                        next = (next + 1) % options.length;
                    }
                    return next;
                });
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIndex(i => {
                    let prev = (i - 1 + options.length) % options.length;
                    while (options[prev].id !== 'new' && options[prev].tabs.some((t: any) => normalizeUrl(t.u) === normalizedMovingUrl) && prev !== i) {
                        prev = (prev - 1 + options.length) % options.length;
                    }
                    return prev;
                });
            } else if (e.key === 'Enter') {
                e.preventDefault();
                const opt = options[activeIndex];
                const isDuplicate = opt.id !== 'new' && opt.tabs.some((t: any) => normalizeUrl(t.u) === normalizedMovingUrl);
                if (!isDuplicate) {
                    onMove(opt.id);
                    onClose();
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeIndex, options, onClose, onMove, normalizedMovingUrl]);

    return (
        <div ref={menuRef} role="menu" style={{
            position: 'absolute', top: '100%', right: 0, zIndex: 100,
            width: '220px', maxHeight: '240px', overflowY: 'auto',
            background: 'var(--color-card)', border: '1px solid var(--color-border)',
            borderRadius: '8px', boxShadow: '0 4px 12px rgba(34,32,28,.12)',
            padding: '4px', display: 'flex', flexDirection: 'column', gap: '2px'
        }}>
            {options.map((opt, i) => {
                const isDuplicate = opt.id !== 'new' && opt.tabs.some((t: any) => normalizeUrl(t.u) === normalizedMovingUrl);
                return (
                    <React.Fragment key={opt.id}>
                        {opt.id === 'new' && <div style={{ height: '1px', background: 'var(--color-border)', margin: '4px 0' }} />}
                        <button
                            role="menuitem"
                            aria-disabled={isDuplicate}
                            onClick={() => { if (!isDuplicate) { onMove(opt.id); onClose(); } }}
                            onMouseEnter={() => { if (!isDuplicate) setActiveIndex(i); }}
                            style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px',
                                padding: '6px 8px', border: 'none', 
                                background: i === activeIndex && !isDuplicate ? 'var(--color-row-hover)' : 'transparent',
                                cursor: isDuplicate ? 'not-allowed' : 'pointer', borderRadius: '4px', 
                                textAlign: 'left',
                                color: isDuplicate ? 'var(--color-muted)' : 'var(--color-text)'
                            }}
                        >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                                {opt.id !== 'new' && <div style={{ width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0, background: isDuplicate ? 'var(--color-border)' : `var(--group-${opt.color})` }} />}
                                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontSize: '13px' }}>{opt.name}</span>
                            </div>
                            {isDuplicate && <span style={{ fontSize: '12px', flexShrink: 0 }}>Already there</span>}
                        </button>
                    </React.Fragment>
                );
            })}
        </div>
    );
}

function formatUrl(url: string) {
    let clean = url.replace(/^https?:\/\//, '').replace(/^www\./, '');
    if (clean.endsWith('/')) clean = clean.slice(0, -1);
    return clean;
}

export default function Manager() {
    const [stashes, setStashes] = useState<FullStash[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [selectedStash, setSelectedStash] = useState<FullStash | null>(null);
    const [editingTitle, setEditingTitle] = useState(false);
    const [newTitle, setNewTitle] = useState('');
    const [renameError, setRenameError] = useState(false);

    const [toast, setToast] = useState<{ id: string, message: string, timer: any, undoable: boolean } | null>(null);
    // const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [moveMenuIndex, setMoveMenuIndex] = useState<number | null>(null);
    
    const triggerRefs = useRef<{ [key: number]: HTMLButtonElement | null }>({});
    const undoBackupRef = useRef<{ index: any } | null>(null);

    const fetchStashes = async () => {
        try {
            const index = await loadIndex();
            const activeStashes = index.stashes.filter(s => !s.deleted);
            const fullData = await Promise.all(
                activeStashes.map(async (entry) => {
                    const { tabs, groups } = await loadStash(entry.id);
                    return { ...entry, tabs, groups };
                })
            );
            setStashes(fullData.sort((a, b) => b.updatedAt - a.updatedAt));
        } catch (err: any) {
            setError(err.message || 'Failed to load stashes.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStashes();
    }, []);

    const handleDelete = async (id: string) => {
        const indexBackup = await chrome.storage.sync.get('index');
        undoBackupRef.current = { index: indexBackup.index };

        await deleteStash(id, true);
        setStashes(prev => prev.filter(s => s.id !== id));
        if (selectedStash?.id === id) setSelectedStash(null);

        if (toast) clearTimeout(toast.timer);
        const timer = setTimeout(async () => {
            await deleteStash(id, false);
            setToast(null);
            undoBackupRef.current = null;
        }, 10000);

        setToast({ id, message: 'Group deleted', timer, undoable: true });
    };

    const handleUndo = async () => {
        if (!toast || !toast.undoable || !undoBackupRef.current) return;
        clearTimeout(toast.timer);
        
        await chrome.storage.sync.set({ index: undoBackupRef.current.index });
        await fetchStashes();
        setToast(null);
        undoBackupRef.current = null;
    };

    const handleRenameSave = async () => {
        if (!newTitle.trim()) {
            setRenameError(true);
            return;
        }
        if (!selectedStash || newTitle === selectedStash.name) {
            setEditingTitle(false);
            setRenameError(false);
            return;
        }
        await renameStash(selectedStash.id, newTitle);
        await fetchStashes();
        setSelectedStash(prev => prev ? { ...prev, name: newTitle } : null);
        setEditingTitle(false);
        setRenameError(false);
    };

    const handleRemoveTab = async (stash: FullStash, tabIndex: number) => {
        const updatedTabs = stash.tabs.filter((_, i) => i !== tabIndex);
        await saveStash(stash.name, updatedTabs, stash.groups, stash.id);
        await fetchStashes();
        setSelectedStash({ ...stash, tabs: updatedTabs, tabCount: updatedTabs.length });
    };

    const handleMoveTabExec = async (stash: FullStash, tabIndex: number, targetStashId: string) => {
        const indexBackup = await chrome.storage.sync.get('index');
        undoBackupRef.current = { index: indexBackup.index };

        const result = await moveTab(stash.id, targetStashId, tabIndex);
        
        if (result.status === 'duplicate') {
            if (toast) clearTimeout(toast.timer);
            setToast({ 
                id: 'move-err', 
                message: `Already in ${result.targetName}`, 
                timer: setTimeout(() => setToast(null), 4000),
                undoable: false
            });
            setMoveMenuIndex(null);
            return;
        }

        if (result.status === 'moved') {
            await fetchStashes();
            const updatedSourceStash = await loadStash(stash.id);
            setSelectedStash(prev => prev ? { ...prev, tabs: updatedSourceStash.tabs, tabCount: updatedSourceStash.tabs.length } : null);
            setMoveMenuIndex(null);
            
            if (toast) clearTimeout(toast.timer);
            setToast({ 
                id: 'move', 
                message: `Moved to ${result.targetName}`, 
                timer: setTimeout(() => setToast(null), 4000),
                undoable: true
            });
        }
    };

    const handleColorSelect = async (color: TabColor) => {
        if (!selectedStash) return;
        await setGroupColor(selectedStash.id, color);
        await fetchStashes();
        setSelectedStash(prev => prev ? { ...prev, color } : null);
    };

    const filteredStashes = stashes.filter(s => {
        const q = searchQuery.toLowerCase();
        if (s.name.toLowerCase().includes(q)) return true;
        return s.tabs.some(t => t.t.toLowerCase().includes(q) || t.u.toLowerCase().includes(q));
    });

    const totalTabs = stashes.reduce((acc, s) => acc + s.tabCount, 0);

    if (loading) return <div style={{ padding: '32px', color: 'var(--color-muted)' }}>Loading your stashes...</div>;
    if (error) return <div style={{ padding: '32px', color: 'var(--color-danger)' }}>{error}</div>;

    if (selectedStash) {
        return (
            <div className="page">
                <div style={{ paddingTop: '20px' }}>
                    <button className="link link--back" onClick={() => setSelectedStash(null)}>
                        <svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6"/></svg>
                        Back to groups
                    </button>
                </div>

                <div className="detail-head">
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            {editingTitle ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                                    <input type="text" className="text-input" autoFocus value={newTitle} onChange={e => { setNewTitle(e.target.value); setRenameError(false); }} onBlur={handleRenameSave} onKeyDown={e => e.key === 'Enter' && handleRenameSave()} style={{ fontSize: '20px', fontWeight: 600, maxWidth: '400px', borderColor: renameError ? 'var(--color-danger)' : undefined }} />
                                    {renameError && <span style={{ color: 'var(--color-danger)', fontSize: '13px', whiteSpace: 'nowrap' }}>Give the group a name</span>}
                                </div>
                            ) : (
                                <>
                                    <h1 style={{ fontSize: '22px', fontWeight: 600, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                                        {selectedStash.name}
                                    </h1>
                                    <button className="action action--ghost action--sm" onClick={() => { setNewTitle(selectedStash.name); setEditingTitle(true); }}>
                                        <IconPencil />
                                        <span>Rename</span>
                                    </button>
                                </>
                            )}
                        </div>
                        <div style={{ marginTop: '4px', fontSize: '13px', color: 'var(--color-muted)' }}>
                            {plural(selectedStash.tabCount, "tab")}
                        </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                        <ColorMenu value={selectedStash.color} onChange={handleColorSelect} />
                        <button className="action action--outline action--danger" onClick={() => handleDelete(selectedStash.id)}>
                            <IconTrash />
                            <span>Delete group</span>
                        </button>
                        <button className="btn-solid" onClick={() => restoreStash(selectedStash.id, 'current')} style={{ height: '34px', gap: '6px' }}>
                            <IconExternal size={14} />
                            Open group
                        </button>
                    </div>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {selectedStash.tabs.length === 0 ? (
                        <div style={{ padding: '32px', textAlign: 'center', color: 'var(--color-muted)', background: 'var(--color-card)', borderRadius: '8px', border: '1px solid var(--color-border)' }}>No tabs in this group.</div>
                    ) : (
                        selectedStash.tabs.map((tab, i) => {
                            return (
                                <div key={i} className="site-row" style={{ zIndex: moveMenuIndex === i ? 10 : 1 }}>
                                    <Favicon url={tab.u} size={16} />
                                    <div className="site-row-content">
                                        <span className="site-row-domain">{tab.t}</span>
                                        <span className="site-row-url">{formatUrl(tab.u)}</span>
                                    </div>
                                    <div className="tab-row__actions">
                                        <button className="action action--ghost action--sm" onClick={() => chrome.tabs.create({ url: tab.u })} title="Open" aria-label="Open">
                                            <IconExternal />
                                            <span className="action__label">Open</span>
                                        </button>
                                        <button 
                                            className="action action--ghost action--sm" 
                                            ref={el => triggerRefs.current[i] = el}
                                            onClick={() => setMoveMenuIndex(moveMenuIndex === i ? null : i)}
                                            title="Move to..." 
                                            aria-label="Move to..."
                                            aria-haspopup="menu"
                                            aria-expanded={moveMenuIndex === i}
                                        >
                                            <IconMoveTo />
                                            <span className="action__label">Move to&hellip;</span>
                                        </button>
                                        <button className="action action--ghost action--sm action--danger" onClick={() => handleRemoveTab(selectedStash, i)} title="Remove" aria-label="Remove">
                                            <IconTrash />
                                            <span className="action__label">Remove</span>
                                        </button>
                                        
                                        {moveMenuIndex === i && (
                                            <MoveToMenu 
                                                sourceStash={selectedStash} 
                                                tabUrl={tab.u}
                                                allStashes={stashes} 
                                                triggerRef={{ current: triggerRefs.current[i] }}
                                                onClose={() => setMoveMenuIndex(null)} 
                                                onMove={(targetId: string) => handleMoveTabExec(selectedStash, i, targetId)} 
                                            />
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="page">
            <header className="app-header">
                <div className="app-header__brand">
                    <svg width="24" height="24" viewBox="0 0 16 16" fill="var(--color-accent)"><rect x="2" y="2" width="12" height="4" rx="2" /><rect x="2" y="7" width="10" height="4" rx="2" /><rect x="2" y="12" width="8" height="4" rx="2" /></svg>
                    <Wordmark />
                </div>
                <div className="app-header__actions">
                    <div style={{ position: 'relative', width: '260px' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: '10px', top: '10px' }}><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                        <input type="text" className="text-input" placeholder="Search groups and tabs" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ paddingLeft: '32px' }} />
                    </div>
                    <button className="btn-solid" onClick={async () => { const n = await getNextDefaultName(); saveStash(n, [], []).then(fetchStashes); }}>New group</button>
                </div>
            </header>
            <div className="app-summary">{plural(stashes.length, 'group')} · {plural(totalTabs, 'tab')}</div>

            {stashes.length === 0 ? (
                <div style={{ padding: '64px 24px', textAlign: 'center' }}>
                    <p style={{ color: 'var(--color-muted)', marginBottom: '16px' }}>No groups yet. Create one, or save tabs from the popup.</p>
                </div>
            ) : (
                <main className="group-grid">
                    {filteredStashes.map(stash => (
                        <article key={stash.id} className="group-card" data-color={stash.color} onClick={() => setSelectedStash(stash)}>
                            <div className="group-card__preview">
                                {stash.tabs.length === 0 ? (
                                    <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--color-muted)', fontSize: '13px' }}>
                                        No tabs yet<br/><span style={{ fontSize: '11px' }}>Add tabs from the popup or context menu.</span>
                                    </div>
                                ) : (
                                    stash.tabs.slice(0, 3).map((tab, i) => {
                                        return (
                                            <div key={i} className="site-row">
                                                <Favicon url={tab.u} size={16} />
                                                <div className="site-row-content">
                                                    <span className="site-row-domain">{tab.t}</span>
                                                    <span className="site-row-url">{formatUrl(tab.u)}</span>
                                                </div>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                            <div className="group-card__footer">
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
                                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                                        <div className="group-card__title">{stash.name}</div>
                                        <div className="text-muted" style={{ fontSize: '12px' }}>{plural(stash.tabCount, "tab")} {stash.store === 'local' && '· Local'}</div>
                                    </div>
                                </div>
                                {stash.tabs.length > 0 && (
                                    <div onClick={e => e.stopPropagation()}>
                                        <button className="btn-soft" style={{ flexShrink: 0 }} onClick={() => restoreStash(stash.id, 'current')}>Open</button>
                                    </div> 
                                )}
                            </div>
                        </article>
                    ))}
                </main>
            )}

            {toast && (
                <div style={{ position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)', background: 'var(--color-text)', color: 'var(--color-page)', padding: '10px 16px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '16px', fontSize: '14px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 1000 }}>
                    <span>{toast.message}</span>
                    {toast.undoable && <button className="action-btn" style={{ color: 'var(--color-accent-tint-hover)', fontWeight: 600 }} onClick={handleUndo}>Undo</button>}
                </div>
            )}
        </div>
    );
}