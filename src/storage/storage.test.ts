import { describe, it, expect, vi, beforeEach } from 'vitest';
import { chunkPayload, mergeIndexes } from './utils';
import { saveStash } from './index';
import { TabRecord, StashIndex } from './types';

// Mock Chrome API globally
const mockSyncSet = vi.fn();
const mockSyncGet = vi.fn();
const mockLocalSet = vi.fn();

vi.stubGlobal('chrome', {
  storage: {
    sync: { set: mockSyncSet, get: mockSyncGet },
    local: { set: mockLocalSet }
  }
});

describe('Storage Layer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSyncGet.mockResolvedValue({ index: { v: 1, stashes: [] } });
  });

  it('chunks a 200-tab stash strictly under 7000 bytes per chunk', () => {
    const tabs: TabRecord[] = Array.from({ length: 200 }, (_, i) => ({
      u: `https://example.com/page/${i}`,
      t: `Example Page ${i}`,
      p: false,
      g: -1
    }));
    
    const chunks = chunkPayload([], tabs);
    const encoder = new TextEncoder();
    
    // Ensure every chunk evaluates to < 7000 bytes
    for (const data of Object.values(chunks)) {
      expect(encoder.encode(JSON.stringify(data)).length).toBeLessThanOrEqual(7000);
    }
    
    // Ensure all 200 tabs are preserved
    const totalTabs = Object.values(chunks).reduce((acc, c) => {
      if (c.tabs) return acc + c.tabs.length;
      return acc + c.length;
    }, 0);
    expect(totalTabs).toBe(200);
  });

  it('handles a single extremely long URL safely', () => {
    const hugeUrl = `https://example.com/` + 'a'.repeat(8000);
    const tabs = [{ u: hugeUrl, t: 'Huge', p: false, g: -1 }];
    const chunks = chunkPayload([], tabs);
    
    // It should force it into its own single array to let the quota fallback catch it
    expect(chunks[0].tabs.length).toBe(1);
  });

  it('falls back to chrome.storage.local on QUOTA_BYTES error', async () => {
    // Simulate quota exhaustion
    mockSyncSet.mockRejectedValueOnce(new Error('QUOTA_BYTES_PER_ITEM exceeded'));
    mockSyncSet.mockResolvedValue(undefined); // Success on second call (index only)

    await saveStash('Oversized Stash', [{ u: 'x', t: 'x', p: false, g: -1 }], []);

    // Sync should be called twice (1: payload fail, 2: index fallback update)
    expect(mockSyncSet).toHaveBeenCalledTimes(2);
    // Local should receive the actual chunks
    expect(mockLocalSet).toHaveBeenCalledTimes(1);
    
    // Index passed to sync on fallback should mark store as 'local'
    const finalIndexSetCall = mockSyncSet.mock.calls[1][0];
    expect(finalIndexSetCall.index.stashes[0].store).toBe('local');
  });

  it('merges two indexes prioritizing the newer updatedAt', () => {
    const indexA: StashIndex = {
      v: 1, stashes: [{ id: '1', name: 'Old', createdAt: 10, updatedAt: 10, tabCount: 1, store: 'sync', chunks: 1, color: 'blue' }]
    };
    const indexB: StashIndex = {
      v: 1, stashes: [{ id: '1', name: 'Newer', createdAt: 10, updatedAt: 20, tabCount: 2, store: 'sync', chunks: 1, color: 'blue' }]
    };

    const merged = mergeIndexes(indexA, indexB);
    expect(merged.stashes.length).toBe(1);
    expect(merged.stashes[0].name).toBe('Newer');
    expect(merged.stashes[0].tabCount).toBe(2);
  });
});