import React, { useState, useEffect, useRef } from 'react';
import { loadIndex, loadStash, deleteStash, renameStash, saveStash, setGroupColor, getNextDefaultName, moveTab } from '../storage';
import { normalizeUrl } from '../storage/urls';
import { StashIndexEntry, TabRecord, GroupRecord, TabColor } from '../storage/types';
import { exportData, planImport, applyImport, ImportPlan } from '../storage/backup';
import { restoreStash } from '../tabs';
import { Favicon, plural, useDismiss, ColorMenu, Wordmark, ConfirmDialog } from '../ui/components';
import { IconExternal, IconMoveTo, IconPencil, IconTrash, IconDownload, IconUpload } from '../ui/icons';
import '@fontsource-variable/instrument-sans';
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

function ImportDialog({ plan, onConfirm, onCancel }: { plan: ImportPlan | null, onConfirm: (choice: 'merge' | 'replace' | 'keep') => void, onCancel: () => void }) {
    const dialogRef = useRef<HTMLDialogElement>(null);
    const [choice, setChoice] = useState<'merge' | 'replace' | 'keep'>('merge');

    useEffect(() => {
        if (!dialogRef.current) return;
        if (plan) {
            dialogRef.current.showModal();
            setChoice('merge');
        } else {
            dialogRef.current.close();
        }
    }, [plan]);

    useEffect(() => {
        if (!dialogRef.current) return;
        const handleCancel = (e: Event) => {
            e.preventDefault();
            onCancel();
        };
        const el = dialogRef.current;
        el.addEventListener('cancel', handleCancel);
        return () => el.removeEventListener('cancel', handleCancel);
    }, [onCancel]);

    const handleBackdropClick = (e: React.MouseEvent) => {
        if (e.target === dialogRef.current) onCancel();
    };

    if (!plan) return null;

    const diffItems = plan.items.filter(i => i.status === 'differs');
    const newCount = plan.items.filter(i => i.status === 'new').length;
    const sameCount = plan.items.filter(i => i.status === 'same').length;

    let confirmLabel = "Add missing tabs";
    if (choice === 'replace') confirmLabel = "Replace groups";
    if (choice === 'keep') confirmLabel = "Import";

    return (
        <dialog ref={dialogRef} className="dialog" onClick={handleBackdropClick} aria-labelledby="import-title" aria-describedby="import-desc">
            <div className="dialog__body">
                <h2 id="import-title" className="dialog__title">Some groups differ from your backup</h2>
                <p id="import-desc" className="dialog__text" style={{ marginBottom: '16px' }}>Choose what to do with these groups. Nothing has been changed yet.</p>
                
                <div style={{ maxHeight: '200px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                    {diffItems.map((item, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px', border: '1px solid var(--color-border)', borderRadius: '6px', background: 'var(--color-row-hover)', minWidth: 0 }}>
                            <div style={{ width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0, background: `var(--group-${item.localColor})` }}></div>
                            <div style={{ minWidth: 0, flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <div style={{ fontSize: '13px', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.localName}</div>
                                <div style={{ fontSize: '12px', color: 'var(--color-muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    Backup has {plural(item.fileTabCount || 0, 'tab')}, you have {item.localTabCount}
                                    {item.extraHere! > 0 ? ` · ${item.extraHere} only in your copy` : ''}
                                    {item.nameChanged ? ` · name differs` : ''}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>

                <fieldset style={{ margin: 0, padding: 0, border: 'none', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    <legend style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px', padding: 0 }}>For these groups</legend>
                    
                    <label style={{ display: 'flex', gap: '10px', cursor: 'pointer' }}>
                        <input type="radio" name="import-choice" value="merge" checked={choice === 'merge'} onChange={() => setChoice('merge')} style={{ marginTop: '2px', accentColor: 'var(--color-accent)' }} />
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '13px', fontWeight: 500 }}>Add missing tabs from the backup</span>
                            <span style={{ fontSize: '12px', color: 'var(--color-muted)' }}>Keeps what you have. Nothing is removed.</span>
                        </div>
                    </label>

                    <label style={{ display: 'flex', gap: '10px', cursor: 'pointer' }}>
                        <input type="radio" name="import-choice" value="replace" checked={choice === 'replace'} onChange={() => setChoice('replace')} style={{ marginTop: '2px', accentColor: 'var(--color-accent)' }} />
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '13px', fontWeight: 500 }}>Replace with the backup version</span>
                            <span style={{ fontSize: '12px', color: 'var(--color-muted)' }}>Your current version of these groups is overwritten.</span>
                        </div>
                    </label>

                    <label style={{ display: 'flex', gap: '10px', cursor: 'pointer' }}>
                        <input type="radio" name="import-choice" value="keep" checked={choice === 'keep'} onChange={() => setChoice('keep')} style={{ marginTop: '2px', accentColor: 'var(--color-accent)' }} />
                        <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: '13px', fontWeight: 500 }}>Keep my current version</span>
                            <span style={{ fontSize: '12px', color: 'var(--color-muted)' }}>Skip these groups.</span>
                        </div>
                    </label>
                </fieldset>

                <div style={{ marginTop: '16px', fontSize: '12px', color: 'var(--color-muted)' }}>
                    {newCount} new {plural(newCount, 'group').replace(/^\d+ /, '')} will be added. {sameCount} are already identical.
                </div>
            </div>
            <div className="dialog__actions">
                <button className="action action--outline" onClick={onCancel} autoFocus={choice === 'replace'}>Cancel</button>
                <button className={choice === 'replace' ? 'action action--solid-danger' : 'btn-solid'} onClick={() => onConfirm(choice)} autoFocus={choice !== 'replace'}>
                    {confirmLabel}
                </button>
            </div>
        </dialog>
    );
}

function formatUrl(url: string) {
    let clean = url.replace(/^https?:\/\//, '').replace(/^www\./, '');
    if (clean.endsWith('/')) clean = clean.slice(0, -1);
    return clean;
}

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

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
    const [moveMenuIndex, setMoveMenuIndex] = useState<number | null>(null);

    const [deleteGroupDialog, setDeleteGroupDialog] = useState<FullStash | null>(null);
    const [removeTabDialog, setRemoveTabDialog] = useState<{ stash: FullStash, tabIndex: number } | null>(null);
    const [moveTabDialog, setMoveTabDialog] = useState<{ sourceStash: FullStash, tabIndex: number, targetId: string, targetName: string, targetColor: string } | null>(null);
    const [importPlanDialog, setImportPlanDialog] = useState<ImportPlan | null>(null);

    const [isImporting, setIsImporting] = useState(false);
    const [isExporting, setIsExporting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const triggerRefs = useRef<{ [key: number]: HTMLButtonElement | null }>({});
    
    const undoBackupRef = useRef<{ 
        index?: any,
        previousStates?: Map<string, { entry: StashIndexEntry, tabs: TabRecord[], groups: GroupRecord[] }>,
        addedIds?: string[]
    } | null>(null);

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
            const sorted = fullData.sort((a, b) => b.updatedAt - a.updatedAt);
            setStashes(sorted);
            setSelectedStash(prev => prev ? sorted.find(s => s.id === prev.id) || null : null);
        } catch (err: any) {
            setError(err.message || 'Failed to load stashes.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchStashes();

        const handleStorageChange = (changes: { [key: string]: chrome.storage.StorageChange }) => {
            if (changes.index) {
                fetchStashes();
            }
        };
        chrome.storage.onChanged.addListener(handleStorageChange);
        return () => chrome.storage.onChanged.removeListener(handleStorageChange);
    }, []);

    const handleExport = async () => {
        setIsExporting(true);
        try {
            await exportData();
            if (toast) clearTimeout(toast.timer);
            setToast({ id: 'export', message: 'Backup exported', timer: setTimeout(() => setToast(null), 3000), undoable: false });
            await delay(3000);
        } catch (err: any) {
            if (toast) clearTimeout(toast.timer);
            setToast({ id: 'export-err', message: 'Export failed', timer: setTimeout(() => setToast(null), 3000), undoable: false });
            await delay(3000);
        } finally {
            setIsExporting(false);
        }
    };

    const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsImporting(true);
        try {
            const text = await file.text();
            const plan = await planImport(text, stashes);

            if (!plan.ok) {
                if (toast) clearTimeout(toast.timer);
                setToast({ id: 'import-err', message: plan.error || 'Import failed', timer: setTimeout(() => setToast(null), 5000), undoable: false });
                setIsImporting(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
                return;
            }

            const differs = plan.items.filter(i => i.status === 'differs');
            if (differs.length > 0) {
                setImportPlanDialog(plan); 
            } else {
                await executeImportPlan(plan, 'merge'); 
            }
        } catch (err: any) {
            if (toast) clearTimeout(toast.timer);
            setToast({ id: 'import-err', message: err.message, timer: setTimeout(() => setToast(null), 5000), undoable: false });
            setIsImporting(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const executeImportPlan = async (plan: ImportPlan, choice: 'merge' | 'replace' | 'keep') => {
        setImportPlanDialog(null);
        try {
            const res = await applyImport(plan, choice);
            
            if (res.failed > 0 && res.error) {
                if (toast) clearTimeout(toast.timer);
                setToast({ id: 'import-err', message: `Import error: ${res.error}`, timer: setTimeout(() => setToast(null), 5000), undoable: false });
            } else {
                let msgParts = [];
                if (res.added > 0) msgParts.push(`${res.added} added`);
                if (res.restored > 0) {
                    const restoredTabs = plan.items.filter(i => i.status === 'differs').reduce((acc, curr) => acc + (curr.missingHere || 0), 0);
                    msgParts.push(`${res.restored} restored (${plural(restoredTabs, 'tab')} added)`);
                }
                if (res.replaced > 0) msgParts.push(`${res.replaced} replaced`);
                if (res.unchanged > 0) msgParts.push(`${res.unchanged} unchanged`);
                if (res.kept > 0) msgParts.push(`${res.kept} kept as it was`);
                if (res.invalid > 0) msgParts.push(`${res.invalid} invalid`);
                
                if (msgParts.length === 0) msgParts.push("Nothing to import. Your groups already match this backup.");
                
                const hasChanges = res.added > 0 || res.restored > 0 || res.replaced > 0;
                
                if (hasChanges) {
                    undoBackupRef.current = { previousStates: res.previousStates, addedIds: res.addedIds };
                }

                if (toast) clearTimeout(toast.timer);
                setToast({ 
                    id: 'import', 
                    message: msgParts.join(', '), 
                    timer: setTimeout(() => { setToast(null); undoBackupRef.current = null; }, 15000), 
                    undoable: hasChanges 
                });
            }
            await fetchStashes();
        } catch (err: any) {
            if (toast) clearTimeout(toast.timer);
            setToast({ id: 'import-err', message: err.message, timer: setTimeout(() => setToast(null), 5000), undoable: false });
        } finally {
            setIsImporting(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    const handleImportCancel = () => {
        setImportPlanDialog(null);
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const executeDelete = async () => {
        if (!deleteGroupDialog) return;
        const id = deleteGroupDialog.id;

        const indexBackup = await chrome.storage.sync.get('index');
        undoBackupRef.current = { index: indexBackup.index };

        await deleteStash(id, true);
        setStashes(prev => prev.filter(s => s.id !== id));
        if (selectedStash?.id === id) setSelectedStash(null);
        setDeleteGroupDialog(null);

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

        if (undoBackupRef.current.index) {
            await chrome.storage.sync.set({ index: undoBackupRef.current.index });
        }
        
        if (undoBackupRef.current.addedIds) {
            for (const id of undoBackupRef.current.addedIds) {
                await deleteStash(id, false); 
            }
        }
        
        if (undoBackupRef.current.previousStates) {
            for (const [id, state] of undoBackupRef.current.previousStates.entries()) {
                const chunks = require('../storage/utils').chunkPayload(state.groups, state.tabs);
                const payload: Record<string, any> = {};
                for (const [chunkIndex, data] of Object.entries(chunks)) {
                    payload[`s_${id}_${chunkIndex}`] = data;
                }
                
                const currentIndex = await loadIndex();
                const newEntry = { ...state.entry, updatedAt: Date.now() };
                payload.index = { ...currentIndex, stashes: currentIndex.stashes.map(s => s.id === id ? newEntry : s) };
                
                const finalStore = state.entry.store === 'sync' ? chrome.storage.sync : chrome.storage.local;
                await finalStore.set(payload);
            }
        }

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

    const executeRemoveTab = async () => {
        if (!removeTabDialog) return;
        const { stash, tabIndex } = removeTabDialog;
        const indexBackup = await chrome.storage.sync.get('index');
        undoBackupRef.current = { index: indexBackup.index };

        const updatedTabs = stash.tabs.filter((_, i) => i !== tabIndex);
        await saveStash(stash.name, updatedTabs, stash.groups, stash.id);
        await fetchStashes();
        setSelectedStash({ ...stash, tabs: updatedTabs, tabCount: updatedTabs.length });
        setRemoveTabDialog(null);

        if (toast) clearTimeout(toast.timer);
        setToast({ id: 'remove', message: 'Tab removed', timer: setTimeout(() => setToast(null), 4000), undoable: true });
    };

    const confirmMoveTab = async (targetId: string) => {
        if (!selectedStash || moveMenuIndex === null) return;
        const sourceStash = selectedStash;
        const tabIndex = moveMenuIndex;
        setMoveMenuIndex(null);

        if (targetId === 'new') {
            const targetName = await getNextDefaultName();
            const newId = await saveStash(targetName, [], sourceStash.groups);
            await fetchStashes();
            setMoveTabDialog({ sourceStash, tabIndex, targetId: newId, targetName, targetColor: 'grey' });
        } else {
            const targetStash = stashes.find(s => s.id === targetId);
            if (targetStash) {
                setMoveTabDialog({ sourceStash, tabIndex, targetId: targetStash.id, targetName: targetStash.name, targetColor: targetStash.color });
            }
        }
    };

    const executeMoveTab = async () => {
        if (!moveTabDialog) return;
        const { sourceStash, tabIndex, targetId, targetName } = moveTabDialog;

        const indexBackup = await chrome.storage.sync.get('index');
        undoBackupRef.current = { index: indexBackup.index };

        const result = await moveTab(sourceStash.id, targetId, tabIndex);

        if (result.status === 'duplicate') {
            setMoveTabDialog(null);
            if (toast) clearTimeout(toast.timer);
            setToast({
                id: 'move-err',
                message: `Already in ${targetName}`,
                timer: setTimeout(() => setToast(null), 4000),
                undoable: false
            });
            return;
        }

        if (result.status === 'error') {
            throw new Error(result.message);
        }

        if (result.status === 'moved') {
            await fetchStashes();
            const updatedSourceStash = await loadStash(sourceStash.id);
            setSelectedStash(prev => prev ? { ...prev, tabs: updatedSourceStash.tabs, tabCount: updatedSourceStash.tabs.length } : null);
            setMoveTabDialog(null);

            if (toast) clearTimeout(toast.timer);
            setToast({
                id: 'move',
                message: `Moved to ${targetName}`,
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
                        <svg viewBox="0 0 24 24"><path d="M15 18l-6-6 6-6" /></svg>
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
                        <button className="action action--outline action--danger" onClick={() => setDeleteGroupDialog(selectedStash)}>
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
                                        <button className="action action--ghost action--sm action--danger" onClick={() => setRemoveTabDialog({ stash: selectedStash, tabIndex: i })} title="Remove" aria-label="Remove">
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
                                                onMove={(targetId: string) => confirmMoveTab(targetId)}
                                            />
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                <ConfirmDialog
                    open={!!removeTabDialog}
                    title="Remove this tab?"
                    tone="danger"
                    confirmLabel="Remove tab"
                    onConfirm={executeRemoveTab}
                    onCancel={() => setRemoveTabDialog(null)}
                >
                    {removeTabDialog && (
                        <>
                            It will be removed from {removeTabDialog.stash.name}.
                            <div className="dialog__item">
                                <Favicon url={removeTabDialog.stash.tabs[removeTabDialog.tabIndex].u} size={16} />
                                <div className="dialog__item-text">
                                    <div className="dialog__item-title">{removeTabDialog.stash.tabs[removeTabDialog.tabIndex].t}</div>
                                    <div className="dialog__item-sub">{formatUrl(removeTabDialog.stash.tabs[removeTabDialog.tabIndex].u)}</div>
                                </div>
                            </div>
                        </>
                    )}
                </ConfirmDialog>

                <ConfirmDialog
                    open={!!deleteGroupDialog}
                    title={`Delete ${deleteGroupDialog?.name.length! > 30 ? deleteGroupDialog?.name.slice(0, 30) + '...' : deleteGroupDialog?.name}?`}
                    tone="danger"
                    confirmLabel="Delete group"
                    onConfirm={executeDelete}
                    onCancel={() => setDeleteGroupDialog(null)}
                >
                    {deleteGroupDialog && (
                        <>
                            Its {plural(deleteGroupDialog.tabCount, "tab")} will be removed from your saved groups. You can undo this for 10 seconds.
                        </>
                    )}
                </ConfirmDialog>

                <ConfirmDialog
                    open={!!moveTabDialog}
                    title={`Move this tab to ${moveTabDialog?.targetName}?`}
                    tone="primary"
                    confirmLabel="Move tab"
                    onConfirm={executeMoveTab}
                    onCancel={() => setMoveTabDialog(null)}
                >
                    {moveTabDialog && (
                        <>
                            <div className="dialog__item" style={{ marginBottom: '8px' }}>
                                <Favicon url={moveTabDialog.sourceStash.tabs[moveTabDialog.tabIndex].u} size={16} />
                                <div className="dialog__item-text">
                                    <div className="dialog__item-title">{moveTabDialog.sourceStash.tabs[moveTabDialog.tabIndex].t}</div>
                                    <div className="dialog__item-sub">{formatUrl(moveTabDialog.sourceStash.tabs[moveTabDialog.tabIndex].u)}</div>
                                </div>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', color: 'var(--color-muted)' }}>
                                From <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: `var(--group-${moveTabDialog.sourceStash.color})` }} /> {moveTabDialog.sourceStash.name}
                                &nbsp;to&nbsp; <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: `var(--group-${moveTabDialog.targetColor})` }} /> {moveTabDialog.targetName}
                            </div>
                        </>
                    )}
                </ConfirmDialog>
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
                    <button
                        className="action action--outline"
                        onClick={handleExport}
                        disabled={isExporting}
                        title="Download a backup file"
                        aria-label="Export"
                    >
                        <IconDownload />
                        <span className="action__label">{isExporting ? 'Exporting...' : 'Export'}</span>
                    </button>
                    <button
                        className="action action--outline"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isImporting}
                        title="Restore from a backup file"
                        aria-label="Import"
                    >
                        <IconUpload />
                        <span className="action__label">{isImporting ? 'Importing...' : 'Import'}</span>
                    </button>
                    <input type="file" accept=".json,application/json" style={{ display: 'none' }} ref={fileInputRef} onChange={handleImportFile} />

                    <div className="app-header__search">
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
                                        No tabs yet<br /><span style={{ fontSize: '11px' }}>Add tabs from the popup or context menu.</span>
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

            <ImportDialog 
                plan={importPlanDialog} 
                onConfirm={(c) => executeImportPlan(importPlanDialog!, c)} 
                onCancel={handleImportCancel} 
            />

            {toast && (
                <div style={{ position: 'fixed', bottom: '24px', left: '50%', transform: 'translateX(-50%)', background: 'var(--color-text)', color: 'var(--color-page)', padding: '10px 16px', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '16px', fontSize: '14px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', zIndex: 1000 }}>
                    <span>{toast.message}</span>
                    {toast.undoable && (
                        <button
                            onClick={handleUndo}
                            style={{
                                background: 'var(--color-page)',
                                color: 'var(--color-text)',
                                border: 'none',
                                padding: '4px 10px',
                                borderRadius: '4px',
                                fontSize: '13px',
                                fontWeight: 600,
                                cursor: 'pointer'
                            }}
                        >
                            Undo
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}