import { loadIndex, loadStash, saveStash, setGroupColor } from './index';
import { StashIndexEntry, TabRecord, GroupRecord } from './types';
import { normalizeUrl } from './urls';

interface BackupFormat {
    app: string;
    version: number;
    exportedAt: number;
    stashes: (StashIndexEntry & { tabs: TabRecord[], groups: GroupRecord[] })[];
}

export interface ImportResult {
    added: number;
    updated: number;
    skippedUpToDate: number;
    skippedInvalid: number;
    failed: number;
    error?: string;
}

export async function exportData(): Promise<void> {
    const index = await loadIndex();
    const activeStashes = index.stashes.filter(s => !s.deleted);
    
    // loadStash inherently reads from either sync or local based on entry.store
    const fullStashes = await Promise.all(
        activeStashes.map(async (entry) => {
            const { tabs, groups } = await loadStash(entry.id);
            return { ...entry, tabs, groups };
        })
    );
    
    const backup: BackupFormat = {
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

// 3. VALIDATOR
export function validateStash(stash: any): boolean {
    if (!stash || typeof stash !== 'object') return false;
    if (typeof stash.id !== 'string' || typeof stash.name !== 'string') return false;
    if (!Array.isArray(stash.tabs)) return false;
    for (const tab of stash.tabs) {
        if (!tab || typeof tab !== 'object' || typeof tab.u !== 'string' || typeof tab.t !== 'string') {
            return false;
        }
    }
    return true;
}

// 2 & 4. IMPORT, MERGE, AND WRITING LOGIC
export async function importData(file: File): Promise<ImportResult> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        
        reader.onload = async (e) => {
            try {
                const text = e.target?.result as string;
                const data = JSON.parse(text);
                
                // Strict file-level validation
                if (!data || typeof data !== 'object' || data.app !== 'TabStash' || !Array.isArray(data.stashes)) {
                    throw new Error("Invalid backup file format. Must be a valid TabStash JSON backup.");
                }
                
                const currentIndex = await loadIndex();
                let added = 0;
                let updated = 0;
                let skippedUpToDate = 0;
                let skippedInvalid = 0;
                let failed = 0;
                let firstError: string | undefined = undefined;
                
                for (const rawStash of data.stashes) {
                    if (!validateStash(rawStash)) {
                        skippedInvalid++;
                        continue;
                    }
                    
                    const existing = currentIndex.stashes.find(s => s.id === rawStash.id);
                    
                    // Merge Rules: If live and file is same/older -> SKIP
                    if (existing && !existing.deleted && existing.updatedAt >= (rawStash.updatedAt || 0)) {
                        skippedUpToDate++;
                        continue;
                    }
                    
                    // Merge Rules: If tombstoned -> Remove leftover chunks to start fresh
                    if (existing && existing.deleted) {
                        const keysToRemove = Array.from({ length: existing.chunks || 0 }, (_, i) => `s_${existing.id}_${i}`);
                        if (existing.store === 'sync') await chrome.storage.sync.remove(keysToRemove);
                        else await chrome.storage.local.remove(keysToRemove);
                        
                        currentIndex.stashes = currentIndex.stashes.filter(s => s.id !== rawStash.id);
                        await chrome.storage.sync.set({ index: currentIndex });
                    }
                    
                    try {
                        const now = Date.now();
                        const createdAt = rawStash.createdAt || now;
                        const updatedAt = rawStash.updatedAt || now;
                        
                        // Deduplicate imported tabs within this stash using normalizeUrl
                        const seenUrls = new Set<string>();
                        const uniqueTabs: TabRecord[] = [];
                        for (const tab of rawStash.tabs) {
                            const norm = normalizeUrl(tab.u);
                            if (!seenUrls.has(norm)) {
                                seenUrls.add(norm);
                                uniqueTabs.push({ ...tab });
                            }
                        }

                        // Re-chunk utilizing existing logic
                        await saveStash(rawStash.name, uniqueTabs, rawStash.groups || [], rawStash.id);
                        
                        if (rawStash.color) {
                            await setGroupColor(rawStash.id, rawStash.color);
                        }
                        
                        // Restore exact original timestamps
                        const updatedIndex = await loadIndex();
                        const entryIndex = updatedIndex.stashes.findIndex(s => s.id === rawStash.id);
                        if (entryIndex > -1) {
                            updatedIndex.stashes[entryIndex].createdAt = createdAt;
                            updatedIndex.stashes[entryIndex].updatedAt = updatedAt;
                            await chrome.storage.sync.set({ index: updatedIndex });
                        }
                        
                        if (existing && !existing.deleted) updated++;
                        else added++;
                        
                    } catch (err: any) {
                        failed++;
                        if (!firstError) firstError = err.message;
                    }
                }
                
                resolve({ added, updated, skippedUpToDate, skippedInvalid, failed, error: firstError });
            } catch (err: any) {
                reject(new Error(err.message || "Failed to parse file."));
            }
        };
        
        reader.onerror = () => reject(new Error("Failed to read file."));
        reader.readAsText(file);
    });
}