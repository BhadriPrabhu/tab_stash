import { StashIndex, StashIndexEntry, TabRecord, GroupRecord, TabColor } from './types';
import { chunkPayload, getNextColor } from './utils';
import { normalizeUrl } from './urls';

export async function loadIndex(): Promise<StashIndex> {
  const res = await chrome.storage.sync.get('index');
  const index: StashIndex = res.index || { v: 1, stashes: [] };

  let needsSave = false;
  const order: TabColor[] = ["blue", "red", "yellow", "green", "pink", "cyan", "orange", "grey"];
  
  for (const stash of index.stashes) {
    if (!stash.color) {
      const usedColors = new Set(index.stashes.map(s => s.color).filter(Boolean));
      const nextColor = order.find(c => !usedColors.has(c)) || "grey";
      stash.color = nextColor;
      needsSave = true;
    }
  }

  if (needsSave) {
    await chrome.storage.sync.set({ index });
  }

  return index;
}

export async function getNextDefaultName(): Promise<string> {
  const index = await loadIndex();
  const existingNames = new Set(index.stashes.filter(s => !s.deleted).map(s => s.name.toLowerCase()));
  
  if (!existingNames.has('new group')) return 'New group';
  
  let i = 2;
  while (existingNames.has(`new group ${i}`)) {
    i++;
  }
  return `New group ${i}`;
}

export async function saveStash(
  name: string, 
  tabs: TabRecord[], 
  groups: GroupRecord[], 
  existingId?: string
): Promise<string> {
  const id = existingId || crypto.randomUUID();
  const now = Date.now();
  const index = await loadIndex();
  
  const existingEntry = index.stashes.find(s => s.id === id);
  const existingColors = new Set(index.stashes.map(s => s.color).filter(Boolean) as TabColor[]);
  const color = existingEntry?.color || getNextColor(existingColors);

  const finalName = name.trim() ? name : await getNextDefaultName();

  const chunks = chunkPayload(groups, tabs);
  const chunkCount = Object.keys(chunks).length;

  const newEntry: StashIndexEntry = {
    id,
    name: finalName,
    createdAt: existingEntry?.createdAt || now,
    updatedAt: now,
    tabCount: tabs.length,
    store: 'sync',
    chunks: chunkCount,
    color,
  };

  const payload: Record<string, any> = { index: { v: 1, stashes: [...index.stashes.filter(s => s.id !== id), newEntry] } };
  for (const [chunkIndex, data] of Object.entries(chunks)) {
    payload[`s_${id}_${chunkIndex}`] = data;
  }

  try {
    await chrome.storage.sync.set(payload);
  } catch (error: any) {
    if (error.message?.includes('QUOTA_BYTES') || error.message?.includes('MAX_WRITE')) {
      newEntry.store = 'local';
      payload.index = { v: 1, stashes: [...index.stashes.filter(s => s.id !== id), newEntry] };
      await chrome.storage.sync.set({ index: payload.index });
      
      const localPayload = { ...payload };
      delete localPayload.index;
      await chrome.storage.local.set(localPayload);
    } else {
      throw error;
    }
  }
  
  return id;
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

export async function renameStash(id: string, newName: string) {
  if (!newName.trim()) return;
  const index = await loadIndex();
  const entryIndex = index.stashes.findIndex(s => s.id === id);
  if (entryIndex === -1) return;

  index.stashes[entryIndex].name = newName;
  index.stashes[entryIndex].updatedAt = Date.now();
  await chrome.storage.sync.set({ index });
}

export async function setGroupColor(id: string, color: TabColor) {
  const index = await loadIndex();
  const entryIndex = index.stashes.findIndex(s => s.id === id);
  if (entryIndex === -1) return;

  index.stashes[entryIndex].color = color;
  index.stashes[entryIndex].updatedAt = Date.now();
  await chrome.storage.sync.set({ index });
}

export async function deleteStash(id: string, soft = true) {
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
}

export async function moveTab(fromId: string, toId: string, tabIndex: number): Promise<{ status: 'duplicate' | 'moved' | 'error', message?: string, targetName?: string }> {
    try {
        const source = await loadStash(fromId);
        if (!source.tabs[tabIndex]) return { status: 'error', message: 'Tab not found in source' };
        
        const tabToMove = source.tabs[tabIndex];
        const normalizedMovingUrl = normalizeUrl(tabToMove.u);
        
        let targetName = 'New group';
        let targetGroups = source.groups;

        if (toId === 'new') {
            targetName = await getNextDefaultName();
            await saveStash(targetName, [tabToMove], targetGroups);
        } else {
            const target = await loadStash(toId);
            targetName = target.entry.name;
            
            // Duplicate Check
            if (target.tabs.some(t => normalizeUrl(t.u) === normalizedMovingUrl)) {
                return { status: 'duplicate', targetName };
            }
            
            const updatedTargetTabs = [...target.tabs, tabToMove];
            await saveStash(target.entry.name, updatedTargetTabs, target.groups, target.entry.id);
        }

        // Copy succeeded, remove from source
        const updatedSourceTabs = source.tabs.filter((_, i) => i !== tabIndex);
        await saveStash(source.entry.name, updatedSourceTabs, source.groups, source.entry.id);
        
        return { status: 'moved', targetName };
    } catch (e: any) {
        return { status: 'error', message: e.message };
    }
}