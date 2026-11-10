import { describe, it, expect, vi, beforeEach } from 'vitest';
import { importData, validateStash } from './backup';

const mockSyncGet = vi.fn();
const mockSyncSet = vi.fn();
const mockSyncRemove = vi.fn();
const mockLocalSet = vi.fn();
const mockLocalRemove = vi.fn();

vi.stubGlobal('chrome', {
    storage: {
        sync: { get: mockSyncGet, set: mockSyncSet, remove: mockSyncRemove },
        local: { set: mockLocalSet, remove: mockLocalRemove }
    }
});

vi.stubGlobal('FileReader', class {
    onload: any;
    onerror: any;
    readAsText(file: File) {
        // In our tests, the mocked file is a Blob, so we can use .text()
        file.text()
            .then(text => this.onload && this.onload({ target: { result: text } }))
            .catch(err => this.onerror && this.onerror(err));
    }
});

// Helper to simulate a File object in Node/Vitest
function createMockFile(content: any): File {
    const blob = new Blob([JSON.stringify(content)]);
    return blob as any as File;
}

describe('Import & Validation', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockSyncGet.mockResolvedValue({ index: { v: 1, stashes: [] } });
    });

    it('rejects wrong app value', async () => {
        const file = createMockFile({ app: "WrongApp", stashes: [] });
        await expect(importData(file)).rejects.toThrow(/Invalid backup file format/);
    });

    it('validator drops invalid stashes but allows empty tabs', () => {
        expect(validateStash({ id: "1", name: "Valid Empty", tabs: [] })).toBe(true);
        expect(validateStash({ id: "2", name: "Missing tabs" })).toBe(false);
        expect(validateStash({ id: "3", name: "Bad tab", tabs: [{ u: "url" }] })).toBe(false); // missing 't'
    });

    it('imports into empty store', async () => {
        const file = createMockFile({
            app: "TabStash", version: 1,
            stashes: [{ id: "s1", name: "G1", tabs: [{ u: "https://a.com", t: "A" }], updatedAt: 100 }]
        });
        const res = await importData(file);
        expect(res.added).toBe(1);
    });

    it('overwrites deleted entries and removes tombstone chunks', async () => {
        mockSyncGet.mockResolvedValue({
            index: { v: 1, stashes: [{ id: "s1", name: "Old", deleted: true, store: 'sync', chunks: 1, updatedAt: 999 }] }
        });
        
        const file = createMockFile({
            app: "TabStash", version: 1,
            stashes: [{ id: "s1", name: "New", tabs: [], updatedAt: 100 }] // older timestamp, but target is deleted
        });
        
        const res = await importData(file);
        expect(mockSyncRemove).toHaveBeenCalledWith(['s_s1_0']); // validates old chunks are wiped
        expect(res.added).toBe(1);
    });

    it('skips live stashes with an older or same updatedAt', async () => {
        mockSyncGet.mockResolvedValue({
            index: { v: 1, stashes: [{ id: "s1", name: "Old", deleted: false, updatedAt: 500 }] }
        });
        
        const file = createMockFile({
            app: "TabStash", version: 1,
            stashes: [{ id: "s1", name: "New", tabs: [], updatedAt: 200 }]
        });
        
        const res = await importData(file);
        expect(res.skippedUpToDate).toBe(1);
        expect(res.updated).toBe(0);
    });

    it('updates live stashes with a newer updatedAt', async () => {
        mockSyncGet.mockResolvedValue({
            index: { v: 1, stashes: [{ id: "s1", name: "Old", deleted: false, updatedAt: 200 }] }
        });
        
        const file = createMockFile({
            app: "TabStash", version: 1,
            stashes: [{ id: "s1", name: "New", tabs: [], updatedAt: 500 }]
        });
        
        const res = await importData(file);
        expect(res.updated).toBe(1);
    });

    it('one invalid record does not stop the others', async () => {
        const file = createMockFile({
            app: "TabStash", version: 1,
            stashes: [
                { id: "s1", name: "Good", tabs: [] },
                { id: "s2", name: "Bad", tabs: null }
            ]
        });
        const res = await importData(file);
        expect(res.added).toBe(1);
        expect(res.skippedInvalid).toBe(1);
    });
});