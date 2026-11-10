import { TabRecord, GroupRecord, StashIndex, TabColor } from './types';

const MAX_BYTES = 7000;
const ORDERED_COLORS: TabColor[] = ["blue", "red", "yellow", "green", "pink", "cyan", "orange", "grey"];

export function getNextColor(existingColors: Set<TabColor>): TabColor {
  for (const color of ORDERED_COLORS) {
    if (!existingColors.has(color)) return color;
  }
  return "grey";
}

export function chunkPayload(groups: GroupRecord[], tabs: TabRecord[]): Record<number, any> {
  const encoder = new TextEncoder();
  const chunks: Record<number, any> = {};
  let currentChunk = 0;
  let currentTabs: TabRecord[] = [];

  for (const tab of tabs) {
    currentTabs.push(tab);
    
    // Chunk 0 contains the group metadata; subsequent chunks are just tab arrays
    const payload = currentChunk === 0 ? { groups, tabs: currentTabs } : currentTabs;
    const size = encoder.encode(JSON.stringify(payload)).length;

    if (size > MAX_BYTES) {
      currentTabs.pop(); // Remove the tab that pushed us over the limit
      
      // Edge case: A single URL is larger than 7000 bytes
      if (currentTabs.length === 0) {
        currentTabs.push(tab);
      }
      
      chunks[currentChunk] = currentChunk === 0 ? { groups, tabs: currentTabs } : currentTabs;
      currentChunk++;
      
      // Start the next chunk with the removed tab (unless it was a forced oversized URL)
      currentTabs = (currentTabs.length === 1 && currentTabs[0] === tab) ? [] : [tab];
    }
  }
  
  if (currentTabs.length > 0 || currentChunk === 0) {
    chunks[currentChunk] = currentChunk === 0 ? { groups, tabs: currentTabs } : currentTabs;
  }

  return chunks;
}

export function mergeIndexes(indexA: StashIndex | undefined, indexB: StashIndex | undefined): StashIndex {
  const merged = new Map<string, any>();
  const aStashes = indexA?.stashes || [];
  const bStashes = indexB?.stashes || [];

  for (const s of aStashes) merged.set(s.id, s);
  
  for (const s of bStashes) {
    const existing = merged.get(s.id);
    // Conflict resolution: newer updatedAt wins
    if (!existing || s.updatedAt > existing.updatedAt) {
      merged.set(s.id, s);
    }
  }

  return { v: 1, stashes: Array.from(merged.values()) };
}