import { describe, it, expect, vi, beforeEach } from 'vitest';
import { planImport, applyImport, validateStash } from './backup';

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

function createMockFile(content: any): string {
    return JSON.stringify(content);
}

describe('Import Validation and Planning', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        mockSyncGet.mockResolvedValue({ index: { v: 1, stashes: [] } });
    });

    it('rejects wrong app value', async () => {
        const file = createMockFile({ app: "WrongApp", stashes: [] });
        const res = await planImport(file, []);
        expect(res.ok).toBe(false);
        expect(res.error).toMatch(/Invalid backup file format/);
    });

    it('validator drops invalid stashes but allows empty tabs', () => {
        expect(validateStash({ id: "1", name: "Valid Empty", tabs: [] }).valid).toBe(true);
        expect(validateStash({ id: "2", name: "Missing tabs" }).valid).toBe(false);
        expect(validateStash({ id: "3", name: "Bad tab", tabs: [{ u: "url" }] }).valid).toBe(false);
    });

    it('identifies new, same, and differing stashes properly', async () => {
        const fileContent = createMockFile({
            app: "TabStash", version: 1,
            stashes: [
                { id: "s1", name: "Differs", color: "red", tabs: [{ u: "https://a.com", t: "A" }, { u: "https://b.com", t: "B" }], updatedAt: 100 },
                { id: "s2", name: "Same", color: "blue", tabs: [{ u: "https://same.com", t: "S" }], updatedAt: 200 },
                { id: "s3", name: "New", color: "green", tabs: [], updatedAt: 300 }
            ]
        });

        const currentStashes: any[] = [
            { id: "s1", name: "Differs", color: "red", tabs: [{ u: "https://a.com", t: "A" }], deleted: false }, // missing 1
            { id: "s2", name: "Same", color: "blue", tabs: [{ u: "https://same.com", t: "S" }], deleted: false }, // identical
            { id: "s4", name: "Old", color: "grey", tabs: [], deleted: true } // tombstone, ignored by mapper
        ];

        const plan = await planImport(fileContent, currentStashes);
        
        expect(plan.ok).toBe(true);
        
        const s1 = plan.items.find(i => i.id === 's1');
        expect(s1?.status).toBe('differs');
        expect(s1?.missingHere).toBe(1);

        const s2 = plan.items.find(i => i.id === 's2');
        expect(s2?.status).toBe('same');

        const s3 = plan.items.find(i => i.id === 's3');
        expect(s3?.status).toBe('new');
    });

    it('A group that exists only as a tombstone is "new"', async () => {
        const fileContent = createMockFile({
            app: "TabStash", version: 1,
            stashes: [{ id: "t1", name: "Tombstone", tabs: [], updatedAt: 100 }]
        });
        const currentStashes: any[] = [{ id: "t1", name: "Tombstone", tabs: [], deleted: true }];
        
        const plan = await planImport(fileContent, currentStashes);
        expect(plan.items[0].status).toBe('new');
    });

    it('An old backup file (no "color" field) still imports and defaults to grey', async () => {
        const fileContent = createMockFile({
            app: "TabStash", version: 1,
            stashes: [{ id: "s1", name: "Old Backup", tabs: [] }]
        });
        const plan = await planImport(fileContent, []);
        expect(plan.items[0].color).toBe('grey');
    });
});

describe('Import Applying', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('Keep changes nothing', async () => {
        const plan = { ok: true, items: [{ id: "s1", name: "Test", color: "red" as const, tabs: [], groups: [], createdAt: 1, updatedAt: 1, status: "differs" as const }] } as any;
        const res = await applyImport(plan, 'keep');
        expect(res.kept).toBe(1);
        expect(res.restored).toBe(0);
        expect(res.replaced).toBe(0);
    });

    it('Undo states are collected correctly for merged/replaced items', async () => {
        const plan = { ok: true, items: [{ id: "s1", name: "Test", color: "red" as const, tabs: [{u:"url", t:"t"}], groups: [], createdAt: 1, updatedAt: 1, status: "differs" as const }] } as any;
        
        // Mock loadStash internally called by applyImport to capture undo state
        mockSyncGet.mockResolvedValueOnce({ index: { v: 1, stashes: [{ id: "s1", name: "Test" }] } })
                   .mockResolvedValueOnce({ s_s1_0: { groups: [], tabs: [] } });

        const res = await applyImport(plan, 'merge');
        expect(res.previousStates?.has("s1")).toBe(true);
    });
});