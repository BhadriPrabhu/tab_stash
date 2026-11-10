import React, { useState, useEffect, useRef } from 'react';
import { loadIndex, loadStash, deleteStash, renameStash, saveStash, setGroupColor, getNextDefaultName } from '../storage';
import { StashIndexEntry, TabRecord, GroupRecord, TabColor } from '../storage/types';
import { restoreStash } from '../tabs';
import { Favicon, plural } from '../ui/components';
import '../styles/components.css';

interface FullStash extends StashIndexEntry {
    tabs: TabRecord[];
    groups: GroupRecord[];
}

function useDismiss(open: boolean, onClose: () => void, refs: React.RefObject<HTMLElement>[]) {
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

function MoveToMenu({ sourceStash, allStashes, onClose, onMove, triggerRef }: any) {
    const menuRef = useRef<HTMLDivElement>(null);
    useDismiss(true, onClose, [triggerRef, menuRef]);

    const [activeIndex, setActiveIndex] = useState(0);
    const otherStashes = allStashes.filter((s: any) => s.id !== sourceStash.id);
    const options = [...otherStashes, { id: 'new', name: 'New group...', color: 'grey' }];

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActiveIndex(i => (i + 1) % options.length);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActiveIndex(i => (i - 1 + options.length) % options.length);
            } else if (e.key === 'Enter') {
                e.preventDefault();
                onMove(options[activeIndex].id);
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [activeIndex, options, onClose, onMove]);

    return (
        <div ref={menuRef} role="menu" style={{
            position: 'absolute', top: '100%', right: 0, zIndex: 100,
            width: '220px', maxHeight: '240px', overflowY: 'auto',
            background: 'var(--color-card)', border: '1px solid var(--color-border)',
            borderRadius: '8px', boxShadow: '0 4px 12px rgba(34,32,28,.12)',
            padding: '4px', display: 'flex', flexDirection: 'column', gap: '2px'
        }}>
            {options.map((opt, i) => (
                <React.Fragment key={opt.id}>
                    {opt.id === 'new' && <div style={{ height: '1px', background: 'var(--color-border)', margin: '4px 0' }} />}
                    <button
                        role="menuitem"
                        onClick={() => { onMove(opt.id); onClose(); }}
                        onMouseEnter={() => setActiveIndex(i)}
                        style={{
                            display: 'flex', alignItems: 'center', gap: '8px',
                            padding: '6px 8px', border: 'none', 
                            background: i === activeIndex ? 'var(--color-row-hover)' : 'transparent',
                            cursor: 'pointer', borderRadius: '4px', fontSize: '13px', 
                            color: 'var(--color-text)', textAlign: 'left'
                        }}
                    >
                        {opt.id !== 'new' && <div style={{ width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0, background: `var(--group-${opt.color})` }} />}
                        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{opt.name}</span>
                    </button>
                </React.Fragment>
            ))}
        </div>
    );
}

const COLORS: TabColor[] = ["blue", "red", "yellow", "green", "pink", "cyan", "orange", "grey"];

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

    const [toast, setToast] = useState<{ id: string, message: string, timer: any } | null>(null);
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [moveMenuIndex, setMoveMenuIndex] = useState<number | null>(null);
    
    const triggerRefs = useRef<{ [key: number]: HTMLButtonElement | null }>({});

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
        await deleteStash(id, true);
        setStashes(prev => prev.filter(s => s.id !== id));
        if (selectedStash?.id === id) setSelectedStash(null);

        if (toast) clearTimeout(toast.timer);

        const timer = setTimeout(async () => {
            await deleteStash(id, false);
            setToast(null);
        }, 10000);

        setToast({ id, message: 'Group deleted', timer });
    };

    const handleUndo = async () => {
        if (!toast) return;
        clearTimeout(toast.timer);

        const index = await loadIndex();
        const entryIndex = index.stashes.findIndex(s => s.id === toast.id);
        if (entryIndex > -1) {
            index.stashes[entryIndex].deleted = false;
            await chrome.storage.sync.set({ index });
            await fetchStashes();
        }
        setToast(null);
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

    const handleMoveTab = async (stash: FullStash, tabIndex: number, targetStashId: string) => {
        const tabToMove = stash.tabs[tabIndex];
        const updatedSourceTabs = stash.tabs.filter((_, i) => i !== tabIndex);
        
        let targetName = 'New group';

        if (targetStashId === 'new') {
            const defName = await getNextDefaultName();
            targetName = defName;
            await saveStash(defName, [tabToMove], stash.groups);
        } else {
            const targetStash = stashes.find(s => s.id === targetStashId);
            if (targetStash) {
                targetName = targetStash.name;
                const updatedTargetTabs = [...targetStash.tabs, tabToMove];
                await saveStash(targetStash.name, updatedTargetTabs, targetStash.groups, targetStash.id);
            }
        }

        await saveStash(stash.name, updatedSourceTabs, stash.groups, stash.id);
        await fetchStashes();
        setSelectedStash({ ...stash, tabs: updatedSourceTabs, tabCount: updatedSourceTabs.length });
        
        if (toast) clearTimeout(toast.timer);
        setToast({ 
            id: 'move', 
            message: `Moved to ${targetName}`, 
            timer: setTimeout(() => setToast(null), 4000) 
        });
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
            <div style={{ maxWidth: '800px', margin: '0 auto', padding: '32px 24px' }}>
                <button className="text-link" onClick={() => setSelectedStash(null)} style={{ marginBottom: '24px', display: 'inline-block' }}>&larr; Back to groups</button>

                <header style={{ marginBottom: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                        {editingTitle ? (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <input type="text" className="text-input" autoFocus value={newTitle} onChange={e => { setNewTitle(e.target.value); setRenameError(false); }} onBlur={handleRenameSave} onKeyDown={e => e.key === 'Enter' && handleRenameSave()} style={{ fontSize: '20px', fontWeight: 600, maxWidth: '400px', borderColor: renameError ? 'var(--color-danger)' : undefined }} />
                                {renameError && <span style={{ color: 'var(--color-danger)', fontSize: '13px' }}>Give the group a name</span>}
                            </div>
                        ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: `var(--group-${selectedStash.color})`, marginLeft: '10px' }}></div>
                                <h1 style={{ fontSize: '20px', fontWeight: 600 }}>{selectedStash.name}</h1>
                                <button className="action-btn" onClick={() => { setNewTitle(selectedStash.name); setEditingTitle(true); }}>Rename</button>
                            </div>
                        )}

                        <div style={{ display: 'flex', gap: '12px', position: 'relative' }}>
                            <button className="action-btn danger" onClick={() => handleDelete(selectedStash.id)}>Delete group</button>
                            <div style={{ position: 'relative' }}>
                                <button className="btn btn-solid" onClick={() => setOpenMenuId(openMenuId === selectedStash.id ? null : selectedStash.id)}>Open group</button>
                                {openMenuId === selectedStash.id && (
                                    <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: '4px', background: 'var(--color-card)', border: '1px solid var(--color-border)', borderRadius: '6px', padding: '4px', zIndex: 10, boxShadow: 'var(--shadow-card-hover)', display: 'flex', flexDirection: 'column', minWidth: '140px' }}>
                                        <button className="action-btn" style={{ padding: '8px', textAlign: 'left' }} onClick={() => { restoreStash(selectedStash.id, 'current'); setOpenMenuId(null); }}>Open here</button>
                                        <button className="action-btn" style={{ padding: '8px', textAlign: 'left' }} onClick={() => { restoreStash(selectedStash.id, 'new'); setOpenMenuId(null); }}>Open in new window</button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px', paddingLeft: '10px' }}>
                        {COLORS.map(c => (
                            <button 
                                key={c}
                                onClick={() => handleColorSelect(c)}
                                style={{
                                    width: '16px', height: '16px', borderRadius: '50%', background: `var(--group-${c})`,
                                    border: 'none', cursor: 'pointer', padding: 0,
                                    boxShadow: selectedStash.color === c ? '0 0 0 2px var(--color-page), 0 0 0 4px var(--color-text)' : 'none'
                                }}
                            />
                        ))}
                    </div>
                </header>

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
                                    <div className="site-row-actions" style={{ display: moveMenuIndex === i ? 'flex' : undefined }}>
                                        <button className="action-btn" onClick={() => chrome.tabs.create({ url: tab.u })}>Open</button>
                                        <button 
                                            className="action-btn" 
                                            ref={el => triggerRefs.current[i] = el}
                                            onClick={() => setMoveMenuIndex(moveMenuIndex === i ? null : i)}
                                        >
                                            Move to...
                                        </button>
                                        <button className="action-btn danger" onClick={() => handleRemoveTab(selectedStash, i)}>Remove</button>
                                        
                                        {moveMenuIndex === i && (
                                            <MoveToMenu 
                                                sourceStash={selectedStash} 
                                                allStashes={stashes} 
                                                triggerRef={{ current: triggerRefs.current[i] }}
                                                onClose={() => setMoveMenuIndex(null)} 
                                                onMove={(targetId: string) => handleMoveTab(selectedStash, i, targetId)} 
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
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', padding: '32px 24px' }}>
            <header className="manager-header">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginRight: 'auto' }}>
                    <svg width="24" height="24" viewBox="0 0 16 16" fill="var(--color-accent)"><rect x="2" y="2" width="12" height="4" rx="2" /><rect x="2" y="7" width="10" height="4" rx="2" /><rect x="2" y="12" width="8" height="4" rx="2" /></svg>
                    <h1 style={{ fontSize: '20px', fontWeight: 600 }}>TabStash</h1>
                </div>
                <div className="manager-search" style={{ position: 'relative' }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--color-muted)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', left: '10px', top: '10px' }}><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                    <input type="text" className="text-input" placeholder="Search groups and tabs" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} style={{ paddingLeft: '32px' }} />
                </div>
                <button className="btn btn-solid" onClick={async () => { const n = await getNextDefaultName(); saveStash(n, [], []).then(fetchStashes); }}>New group</button>
            </header>
            <div style={{ color: 'var(--color-muted)', fontSize: '13px', marginBottom: '32px', maxWidth: '1120px', margin: '0 auto 32px auto', width: '100%' }}>{plural(stashes.length, 'group')} · {plural(totalTabs, 'tab')}</div>

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
                                    {/* <span className="group-dot"></span> */}
                                    <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                                        <div className="group-card__title">{stash.name}</div>
                                        <div className="text-muted" style={{ fontSize: '12px' }}>{plural(stash.tabCount, "tab")} {stash.store === 'local' && '· Local'}</div>
                                    </div>
                                </div>
                                {stash.tabs.length > 0 && (
                                    <div onClick={e => e.stopPropagation()}>
                                        <button className="btn btn-soft" style={{ flexShrink: 0 }} onClick={() => restoreStash(stash.id, 'current')}>Open</button>
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
                    <button className="action-btn" style={{ color: 'var(--color-accent-tint)', fontWeight: 600 }} onClick={handleUndo}>Undo</button>
                </div>
            )}
        </div>
    );
}