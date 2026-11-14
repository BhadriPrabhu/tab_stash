import { loadIndex, loadStash, _createGroupWithTabs, addTabsToGroup } from './index';
import { StashIndexEntry, TabRecord, GroupRecord, TabColor } from './types';
import { normalizeUrl } from './urls';
import { chunkPayload } from './utils';

export interface PlanItem {
    id: string;
    name: string;
    color: TabColor;
    tabs: TabRecord[];
    groups: GroupRecord[];
    createdAt: number;
    updatedAt: number;
    status: 'new' | 'same' | 'differs' | 'invalid';
    reason?: string;
    missingHere?: number;
    extraHere?: number;
    nameChanged?: boolean;
    fileTabCount?: number;
    localTabCount?: number;
    localName?: string;
    localColor?: TabColor;
}

export interface ImportPlan {
    ok: boolean;
    error?: string;
    items: PlanItem[];
}

export interface ImportResult {
    added: number;
    restored: number;
    replaced: number;
    unchanged: number;
    kept: number;
    invalid: number;
    failed: number;
    error?: string;
    previousStates?: Map<string, { entry: StashIndexEntry, tabs: TabRecord[], groups: GroupRecord[] }>;
    addedIds?: string[];
}

export async function exportData(): Promise<void> {
    const index = await loadIndex();
    const activeStashes = index.stashes.filter(s => !s.deleted);
    
    const fullStashes = await Promise.all(
        activeStashes.map(async (entry) => {
            const { tabs, groups } = await loadStash(entry.id);
            return { ...entry, tabs, groups };
        })
    );
    
    const backup = {
        app: "TabStash",
        version: 1,
        exportedAt: Date.now(),
        stashes: fullStashes
    };
    
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const date = new Date().toISOString().split('T')[0];
    const a = document.createElement('a');
    a.href = url;
    a.download = `TabStash_Backup_${date}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
}

export function validateStash(stash: any): { valid: boolean; reason?: string } {
    if (!stash || typeof stash !== 'object') return { valid: false, reason: 'Not an object' };
    if (typeof stash.id !== 'string' || !stash.id.trim()) return { valid: false, reason: 'Missing or invalid id' };
    if (typeof stash.name !== 'string') return { valid: false, reason: 'Missing or invalid name' };
    if (!Array.isArray(stash.tabs)) return { valid: false, reason: 'Tabs must be an array' };
    for (const tab of stash.tabs) {
        if (!tab || typeof tab !== 'object' || typeof tab.u !== 'string' || typeof tab.t !== 'string') {
            return { valid: false, reason: 'Invalid tab structure (missing u or t)' };
        }
    }
    return { valid: true };
}

export async function planImport(fileText: string, currentStashes: (StashIndexEntry & { tabs: TabRecord[], groups: GroupRecord[] })[]): Promise<ImportPlan> {
    try {
        const data = JSON.parse(fileText);
        if (!data || typeof data !== 'object' || data.app !== 'TabStash' || !Array.isArray(data.stashes)) {
            return { ok: false, error: "Invalid backup file format. Must be a valid TabStash JSON backup.", items: [] };
        }

        const items: PlanItem[] = [];
        const liveMap = new Map<string, StashIndexEntry & { tabs: TabRecord[], groups: GroupRecord[] }>();
        for (const s of currentStashes) {
            if (!s.deleted) liveMap.set(s.id, s);
        }

        for (const raw of data.stashes) {
            const validation = validateStash(raw);
            if (!validation.valid) {
                items.push({
                    id: raw?.id || 'unknown', name: raw?.name || 'Invalid', color: raw?.color || 'grey',
                    tabs: [], groups: [], createdAt: Date.now(), updatedAt: Date.now(),
                    status: 'invalid', reason: validation.reason
                });
                continue;
            }

            const id = raw.id;
            const name = raw.name;
            const color = raw.color || 'grey';
            const tabs: TabRecord[] = raw.tabs || [];
            const groups: GroupRecord[] = raw.groups || [];
            const createdAt = raw.createdAt || Date.now();
            const updatedAt = raw.updatedAt || Date.now();

            const local = liveMap.get(id);
            if (!local) {
                items.push({ id, name, color, tabs, groups, createdAt, updatedAt, status: 'new' });
            } else {
                const fileNormUrls = tabs.map(t => normalizeUrl(t.u));
                const localNormUrls = local.tabs.map(t => normalizeUrl(t.u));

                const fileSet = new Set(fileNormUrls);
                const localSet = new Set(localNormUrls);

                const missingHere = fileNormUrls.filter(u => !localSet.has(u)).length;
                const extraHere = localNormUrls.filter(u => !fileSet.has(u)).length;
                const nameChanged = local.name !== name;
                const colorChanged = local.color !== color;

                const sameOrder = fileNormUrls.length === localNormUrls.length && fileNormUrls.every((u, idx) => u === localNormUrls[idx]);
                const identical = sameOrder && !nameChanged && !colorChanged;

                if (identical) {
                    items.push({ id, name, color, tabs, groups, createdAt, updatedAt, status: 'same' });
                } else {
                    items.push({
                        id, name, color, tabs, groups, createdAt, updatedAt,
                        status: 'differs',
                        missingHere,
                        extraHere,
                        nameChanged,
                        fileTabCount: tabs.length,
                        localTabCount: local.tabs.length,
                        localName: local.name,
                        localColor: local.color
                    });
                }
            }
        }

        return { ok: true, items };
    } catch (err: any) {
        return { ok: false, error: err.message || "Failed to parse JSON file.", items: [] };
    }
}

export async function replaceGroup(id: string, fileStash: PlanItem): Promise<void> {
    const currentIndex = await loadIndex();
    const entry = currentIndex.stashes.find(s => s.id === id);
    if (!entry) throw new Error("Group not found");

    const chunks = chunkPayload(fileStash.groups, fileStash.tabs);
    const newChunkCount = Object.keys(chunks).length;

    const newEntry: StashIndexEntry = {
        ...entry,
        name: fileStash.name,
        color: fileStash.color,
        tabCount: fileStash.tabs.length,
        chunks: newChunkCount,
        updatedAt: Date.now() // Forces sync bump
    };

    const payload: Record<string, any> = { index: { ...currentIndex, stashes: currentIndex.stashes.map(s => s.id === id ? newEntry : s) } };
    for (const [chunkIndex, data] of Object.entries(chunks)) {
        payload[`s_${id}_${chunkIndex}`] = data;
    }

    let finalStore = entry.store;
    try {
        await chrome.storage.sync.set(payload);
        finalStore = 'sync';
    } catch (e: any) {
        if (e.message?.includes('QUOTA_BYTES') || e.message?.includes('MAX_WRITE')) {
            newEntry.store = 'local';
            payload.index = { ...currentIndex, stashes: currentIndex.stashes.map(s => s.id === id ? newEntry : s) };
            await chrome.storage.sync.set({ index: payload.index });
            const localPayload = { ...payload };
            delete localPayload.index;
            await chrome.storage.local.set(localPayload);
            finalStore = 'local';
        } else throw e;
    }

    if (newChunkCount < entry.chunks) {
        const finalArea = finalStore === 'sync' ? chrome.storage.sync : chrome.storage.local;
        const leftoverKeys = Array.from({ length: entry.chunks - newChunkCount }, (_, i) => `s_${id}_${newChunkCount + i}`);
        await finalArea.remove(leftoverKeys);
    }
}

export async function applyImport(plan: ImportPlan, choice: 'merge' | 'replace' | 'keep'): Promise<ImportResult> {
    let added = 0, restored = 0, replaced = 0, unchanged = 0, kept = 0, invalid = 0, failed = 0;
    let firstError: string | undefined = undefined;
    
    const previousStates = new Map<string, { entry: StashIndexEntry, tabs: TabRecord[], groups: GroupRecord[] }>();
    const addedIds: string[] = [];

    const currentIndex = await loadIndex();

    for (const item of plan.items) {
        if (item.status === 'invalid') {
            invalid++;
            continue;
        }

        if (item.status === 'same') {
            unchanged++;
            continue;
        }

        if (item.status === 'new') {
            try {
                // Wipe tombstones explicitly
                const existing = currentIndex.stashes.find(s => s.id === item.id);
                if (existing && existing.deleted) {
                    const keysToRemove = Array.from({ length: existing.chunks || 0 }, (_, i) => `s_${existing.id}_${i}`);
                    if (existing.store === 'sync') await chrome.storage.sync.remove(keysToRemove);
                    else await chrome.storage.local.remove(keysToRemove);
                    
                    currentIndex.stashes = currentIndex.stashes.filter(s => s.id !== item.id);
                    await chrome.storage.sync.set({ index: currentIndex });
                }

                await _createGroupWithTabs(item.name, item.tabs, item.groups, item.color, item.id);
                
                // Override timestamps natively to match file exactly
                const updatedIndex = await loadIndex();
                const entryIndex = updatedIndex.stashes.findIndex(s => s.id === item.id);
                if (entryIndex > -1) {
                    updatedIndex.stashes[entryIndex].createdAt = item.createdAt;
                    updatedIndex.stashes[entryIndex].updatedAt = item.updatedAt;
                    await chrome.storage.sync.set({ index: updatedIndex });
                }
                
                addedIds.push(item.id);
                added++;
            } catch (err: any) {
                failed++;
                if (!firstError) firstError = err.message;
            }
            continue;
        }

        if (item.status === 'differs') {
            if (choice === 'keep') {
                kept++;
                continue;
            }

            try {
                const { tabs, groups, entry } = await loadStash(item.id);
                previousStates.set(item.id, { entry: { ...entry }, tabs: [...tabs], groups: [...groups] });

                if (choice === 'merge') {
                    // Safe append. Overwrites groups only if existing has none.
                    await addTabsToGroup(item.id, item.tabs);
                    
                    if (groups.length === 0 && item.groups.length > 0) {
                       const fresh = await loadStash(item.id);
                       const chunks = chunkPayload(item.groups, fresh.tabs);
                       // Update payload internally to add missing groups
                       const pPayload: Record<string, any> = {};
                       for (const [ci, d] of Object.entries(chunks)) { pPayload[`s_${item.id}_${ci}`] = d; }
                       if (fresh.entry.store === 'sync') await chrome.storage.sync.set(pPayload);
                       else await chrome.storage.local.set(pPayload);
                    }
                    
                    restored++;
                } else if (choice === 'replace') {
                    await replaceGroup(item.id, item);
                    replaced++;
                }
            } catch (err: any) {
                failed++;
                if (!firstError) firstError = err.message;
            }
        }
    }

    return { added, restored, replaced, unchanged, kept, invalid, failed, error: firstError, previousStates, addedIds };
}