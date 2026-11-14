import { StashIndex, StashIndexEntry, TabRecord, GroupRecord, TabColor } from './types';
import { chunkPayload, getNextColor } from './utils';
import { normalizeUrl } from './urls';

// ==========================================
// WRITE QUEUE (Serialization)
// ==========================================
let writeQueue: Promise<any> = Promise.resolve();

function enqueue<T>(task: () => Promise<T>): Promise<T> {
    const promise = writeQueue.then(task, task); // run regardless of previous failure
    writeQueue = promise.catch(() => {});
    return promise;
}

// ==========================================
// READ OPERATIONS
// ==========================================
export async function loadIndex(): Promise<StashIndex> {
    const res = await chrome.storage.sync.get('index');
    const index: StashIndex = res.index || { v: 1, stashes: [] };

    let needsSave = false;
    const order: TabColor[] = ["blue", "red", "yellow", "green", "pink", "cyan", "orange", "grey"];
    
    const usedColors = new Set(index.stashes.map(stash => stash.color).filter(Boolean));
    for (const stash of index.stashes) {
        if (!stash.color) {
            const nextColor = order.find(c => !usedColors.has(c)) || "grey";
            stash.color = nextColor;
            usedColors.add(nextColor);
            needsSave = true;
        }
    }

    if (needsSave) {
        await chrome.storage.sync.set({ index });
    }
    return index;
}

export async function loadStash(id: string) {
    const index = await loadIndex();
    const entry = index.stashes.find(s => s.id === id);
    if (!entry) throw new Error('Stash not found in index.');

    const storageArea = entry.store === 'sync' ? chrome.storage.sync : chrome.storage.local;
    const keys = Array.from({ length: entry.chunks }, (_, i) => `s_${id}_${i}`);
    const data = await storageArea.get(keys);
    
    let tabs: TabRecord[] = [];
    let groups: GroupRecord[] = [];

    for (let i = 0; i < entry.chunks; i++) {
        const chunk = data[`s_${id}_${i}`];
        if (!chunk) continue;
        if (i === 0) {
            groups = chunk.groups || [];
            tabs.push(...(chunk.tabs || []));
        } else {
            tabs.push(...chunk);
        }
    }
    return { tabs, groups, entry };
}

export async function getNextDefaultName(): Promise<string> {
    const index = await loadIndex();
    const existingNames = new Set(index.stashes.filter(s => !s.deleted).map(s => s.name.toLowerCase()));
    if (!existingNames.has('new group')) return 'New group';
    let i = 2;
    while (existingNames.has(`new group ${i}`)) { i++; }
    return `New group ${i}`;
}

// ==========================================
// WRITE OPERATIONS (Queued)
// ==========================================

export const createGroupWithTabs = (name: string, tabs: TabRecord[], groups: GroupRecord[], color?: TabColor, existingId?: string) => 
    enqueue(() => _createGroupWithTabs(name, tabs, groups, color, existingId));

export const saveStash = (name: string, tabs: TabRecord[], groups: GroupRecord[], existingId?: string) =>
    enqueue(() => _saveStash(name, tabs, groups, existingId));

async function _saveStash(name: string, tabs: TabRecord[], groups: GroupRecord[], existingId?: string): Promise<string> {
    const index = await loadIndex();
    const existingEntry = existingId ? index.stashes.find(stash => stash.id === existingId) : undefined;
    if (!existingEntry) {
        return _createGroupWithTabs(name, tabs, groups, undefined, existingId);
    }

    const uniqueTabs: TabRecord[] = [];
    const seenUrls = new Set<string>();
    for (const tab of tabs) {
        const normalizedUrl = normalizeUrl(tab.u);
        if (!seenUrls.has(normalizedUrl)) {
            seenUrls.add(normalizedUrl);
            uniqueTabs.push(tab);
        }
    }

    const chunks = chunkPayload(groups, uniqueTabs);
    const chunkCount = Object.keys(chunks).length;
    const updatedEntry: StashIndexEntry = {
        ...existingEntry,
        name: name.trim() ? name : await getNextDefaultName(),
        updatedAt: Date.now(),
        tabCount: uniqueTabs.length,
        chunks: chunkCount,
        store: 'sync',
    };
    const payload: Record<string, any> = {
        index: {
            ...index,
            stashes: index.stashes.map(stash => stash.id === existingEntry.id ? updatedEntry : stash),
        },
    };
    for (const [chunkIndex, data] of Object.entries(chunks)) {
        payload[`s_${existingEntry.id}_${chunkIndex}`] = data;
    }

    const previousStorageArea = existingEntry.store === 'sync' ? chrome.storage.sync : chrome.storage.local;
    let finalStorageArea: typeof chrome.storage.sync | typeof chrome.storage.local;
    try {
        await chrome.storage.sync.set(payload);
        finalStorageArea = chrome.storage.sync;
    } catch (error: any) {
        if (!error.message?.includes('QUOTA_BYTES') && !error.message?.includes('MAX_WRITE')) {
            throw error;
        }

        updatedEntry.store = 'local';
        payload.index = {
            ...index,
            stashes: index.stashes.map(stash => stash.id === existingEntry.id ? updatedEntry : stash),
        };
        const localPayload = { ...payload };
        delete localPayload.index;
        await chrome.storage.local.set(localPayload);
        await chrome.storage.sync.set({ index: payload.index });
        finalStorageArea = chrome.storage.local;
    }

    if (previousStorageArea !== finalStorageArea) {
        const previousKeys = Array.from({ length: existingEntry.chunks }, (_, i) => `s_${existingEntry.id}_${i}`);
        await previousStorageArea.remove(previousKeys);
    } else if (chunkCount < existingEntry.chunks) {
        const leftoverKeys = Array.from(
            { length: existingEntry.chunks - chunkCount },
            (_, i) => `s_${existingEntry.id}_${chunkCount + i}`,
        );
        await finalStorageArea.remove(leftoverKeys);
    }

    return existingEntry.id;
}

export async function _createGroupWithTabs(name: string, tabs: TabRecord[], groups: GroupRecord[], color?: TabColor, existingId?: string): Promise<string> {
    const id = existingId || crypto.randomUUID();
    const currentIndex = await loadIndex();
    if (currentIndex.stashes.some(s => s.id === id)) {
        throw new Error("Group ID already exists");
    }

    const seen = new Set<string>();
    const uniqueTabs: TabRecord[] = [];
    for (const t of tabs) {
        const norm = normalizeUrl(t.u);
        if (!seen.has(norm)) {
            seen.add(norm);
            uniqueTabs.push(t);
        }
    }

    const now = Date.now();
    const existingColors = new Set(currentIndex.stashes.map(s => s.color).filter(Boolean) as TabColor[]);
    const groupColor = color || getNextColor(existingColors);
    const finalName = name.trim() ? name : await getNextDefaultName();

    const chunks = chunkPayload(groups, uniqueTabs);
    const chunkCount = Object.keys(chunks).length;

    const newEntry: StashIndexEntry = {
        id, name: finalName, createdAt: now, updatedAt: now, tabCount: uniqueTabs.length,
        store: 'sync', chunks: chunkCount, color: groupColor,
    };

    const payload: Record<string, any> = { index: { ...currentIndex, stashes: [...currentIndex.stashes, newEntry] } };
    for (const [chunkIndex, data] of Object.entries(chunks)) {
        payload[`s_${id}_${chunkIndex}`] = data;
    }

    try {
        await chrome.storage.sync.set(payload);
    } catch (error: any) {
        if (error.message?.includes('QUOTA_BYTES') || error.message?.includes('MAX_WRITE')) {
            newEntry.store = 'local';
            payload.index = { ...currentIndex, stashes: [...currentIndex.stashes, newEntry] };
            await chrome.storage.sync.set({ index: payload.index });
            
            const localPayload = { ...payload };
            delete localPayload.index;
            await chrome.storage.local.set(localPayload);
        } else throw error;
    }
    return id;
}

export const addTabsToGroup = (id: string, incomingTabs: TabRecord[]) => 
    enqueue(() => _addTabsToGroup(id, incomingTabs));

async function _addTabsToGroup(id: string, incomingTabs: TabRecord[]): Promise<{ added: number, duplicates: number, total: number }> {
    const currentIndex = await loadIndex();
    const existingEntry = currentIndex.stashes.find(s => s.id === id);
    if (!existingEntry) throw new Error("Group not found");

    const storageArea = existingEntry.store === 'sync' ? chrome.storage.sync : chrome.storage.local;
    const existingKeys = Array.from({ length: existingEntry.chunks }, (_, i) => `s_${id}_${i}`);
    const existingData = await storageArea.get(existingKeys);

    const backupIndex = { index: currentIndex };
    const backupChunks = existingData;

    let existingTabs: TabRecord[] = [];
    let existingGroups: GroupRecord[] = [];
    for (let i = 0; i < existingEntry.chunks; i++) {
        const chunk = existingData[`s_${id}_${i}`];
        if (!chunk) continue;
        if (i === 0) {
            existingGroups = chunk.groups || [];
            existingTabs.push(...(chunk.tabs || []));
        } else {
            existingTabs.push(...chunk);
        }
    }

    const existingUrls = new Set(existingTabs.map(t => normalizeUrl(t.u)));
    const filteredIncoming: TabRecord[] = [];
    let duplicates = 0;
    const incomingSeen = new Set<string>();

    for (const t of incomingTabs) {
        const norm = normalizeUrl(t.u);
        if (existingUrls.has(norm) || incomingSeen.has(norm)) {
            duplicates++;
        } else {
            incomingSeen.add(norm);
            filteredIncoming.push(t);
        }
    }

    const newTabs = [...existingTabs, ...filteredIncoming];
    const chunks = chunkPayload(existingGroups, newTabs);
    const newChunkCount = Object.keys(chunks).length;

    const newEntry = { ...existingEntry, tabCount: newTabs.length, chunks: newChunkCount, updatedAt: Date.now() };
    const payload: Record<string, any> = { index: { ...currentIndex, stashes: currentIndex.stashes.map(s => s.id === id ? newEntry : s) } };
    
    for (const [chunkIndex, data] of Object.entries(chunks)) {
        payload[`s_${id}_${chunkIndex}`] = data;
    }

    let finalStore = existingEntry.store;
    try {
        await chrome.storage.sync.set(payload);
        finalStore = 'sync';
    } catch (err: any) {
        if (err.message?.includes('QUOTA_BYTES') || err.message?.includes('MAX_WRITE')) {
            finalStore = 'local';
            newEntry.store = 'local';
            payload.index = { ...currentIndex, stashes: currentIndex.stashes.map(s => s.id === id ? newEntry : s) };
            await chrome.storage.sync.set({ index: payload.index });
            
            const localPayload = { ...payload };
            delete localPayload.index;
            await chrome.storage.local.set(localPayload);
        } else throw err;
    }

    if (newChunkCount < existingEntry.chunks) {
        const finalArea = finalStore === 'sync' ? chrome.storage.sync : chrome.storage.local;
        const leftoverKeys = Array.from({ length: existingEntry.chunks - newChunkCount }, (_, i) => `s_${id}_${newChunkCount + i}`);
        await finalArea.remove(leftoverKeys);
    }

    // SAFETY CHECK
    const checkIndex = await loadIndex();
    const checkEntry = checkIndex.stashes.find(s => s.id === id);
    let safe = false;
    
    if (checkEntry && checkEntry.tabCount === newTabs.length) {
        const finalStorageArea = checkEntry.store === 'sync' ? chrome.storage.sync : chrome.storage.local;
        const checkKeys = Array.from({ length: checkEntry.chunks }, (_, i) => `s_${id}_${i}`);
        const checkData = await finalStorageArea.get(checkKeys);
        
        let checkTabs: TabRecord[] = [];
        for (let i = 0; i < checkEntry.chunks; i++) {
            const chunk = checkData[`s_${id}_${i}`];
            if (chunk) {
                checkTabs.push(...(i === 0 ? (chunk.tabs || []) : chunk));
            }
        }
        
        const checkUrls = new Set(checkTabs.map(t => normalizeUrl(t.u)));
        const allOldPresent = existingTabs.every(t => checkUrls.has(normalizeUrl(t.u)));
        if (allOldPresent && checkTabs.length === newTabs.length) safe = true;
    }

    if (!safe) {
        await chrome.storage.sync.set(backupIndex);
        await storageArea.set(backupChunks);
        throw new Error("Could not save. Your group was not changed.");
    }

    return { added: filteredIncoming.length, duplicates, total: newTabs.length };
}

export const replaceGroupTabs = (id: string, tabs: TabRecord[]) => enqueue(() => _replaceGroupTabs(id, tabs));

async function _replaceGroupTabs(id: string, tabs: TabRecord[]): Promise<void> {
    const currentIndex = await loadIndex();
    const entry = currentIndex.stashes.find(s => s.id === id);
    if (!entry) throw new Error("Group not found");
    
    const { groups } = await loadStash(id);
    const chunks = chunkPayload(groups, tabs);
    const newChunkCount = Object.keys(chunks).length;
    
    const newEntry = { ...entry, tabCount: tabs.length, chunks: newChunkCount, updatedAt: Date.now() };
    const payload: Record<string, any> = { index: { ...currentIndex, stashes: currentIndex.stashes.map(s => s.id === id ? newEntry : s) } };
    for (const [chunkIndex, data] of Object.entries(chunks)) {
        payload[`s_${id}_${chunkIndex}`] = data;
    }
    
    let finalStore = entry.store;
    try {
        await chrome.storage.sync.set(payload);
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

export const renameStash = (id: string, newName: string) => enqueue(async () => {
    if (!newName.trim()) return;
    const index = await loadIndex();
    const entryIndex = index.stashes.findIndex(s => s.id === id);
    if (entryIndex === -1) return;
    index.stashes[entryIndex].name = newName;
    index.stashes[entryIndex].updatedAt = Date.now();
    await chrome.storage.sync.set({ index });
});

export const setGroupColor = (id: string, color: TabColor) => enqueue(async () => {
    const index = await loadIndex();
    const entryIndex = index.stashes.findIndex(s => s.id === id);
    if (entryIndex === -1) return;
    index.stashes[entryIndex].color = color;
    index.stashes[entryIndex].updatedAt = Date.now();
    await chrome.storage.sync.set({ index });
});

export const deleteStash = (id: string, soft = true) => enqueue(async () => {
    const index = await loadIndex();
    const entryIndex = index.stashes.findIndex(s => s.id === id);
    if (entryIndex === -1) return;
    if (soft) {
        index.stashes[entryIndex].deleted = true;
        index.stashes[entryIndex].updatedAt = Date.now();
        await chrome.storage.sync.set({ index });
    } else {
        const entry = index.stashes[entryIndex];
        index.stashes.splice(entryIndex, 1);
        await chrome.storage.sync.set({ index });
        const keys = Array.from({ length: entry.chunks }, (_, i) => `s_${id}_${i}`);
        if (entry.store === 'sync') await chrome.storage.sync.remove(keys);
        else await chrome.storage.local.remove(keys);
    }
});

export const moveTab = (fromId: string, toId: string, tabIndex: number) => enqueue(async (): Promise<{ status: 'duplicate' | 'moved' | 'error', message?: string, targetName?: string }> => {
    try {
        const source = await loadStash(fromId);
        if (!source.tabs[tabIndex]) return { status: 'error', message: 'Tab not found in source' };
        
        const tabToMove = source.tabs[tabIndex];
        
        let targetName = 'New group';
        if (toId === 'new') {
            targetName = await getNextDefaultName();
            await _createGroupWithTabs(targetName, [tabToMove], source.groups);
        } else {
            const target = await loadStash(toId);
            targetName = target.entry.name;
            const res = await _addTabsToGroup(toId, [tabToMove]);
            if (res.added === 0 && res.duplicates > 0) return { status: 'duplicate', targetName };
        }

        const updatedSourceTabs = source.tabs.filter((_, i) => i !== tabIndex);
        await _replaceGroupTabs(source.entry.id, updatedSourceTabs);
        
        return { status: 'moved', targetName };
    } catch (e: any) {
        return { status: 'error', message: e.message };
    }
});