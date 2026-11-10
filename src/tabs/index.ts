import { TabRecord, GroupRecord } from '../storage/types';
import { loadStash } from '../storage';

interface CaptureResult {
  tabs: TabRecord[];
  groups: GroupRecord[];
  skippedCount: number;
  tabIdsToClose: number[];
}

export async function captureWindow(
  windowId: number = chrome.windows.WINDOW_ID_CURRENT,
  selectiveTabIds?: Set<number>
): Promise<CaptureResult> {
  const allTabs = await chrome.tabs.query({ windowId });
  const uniqueGroupIds = new Set<number>();
  const tabsToSave: TabRecord[] = [];
  const tabIdsToClose: number[] = [];
  let skippedCount = 0;

  for (const tab of allTabs) {
    // If selective saving is used, skip unselected tabs completely
    if (selectiveTabIds && tab.id && !selectiveTabIds.has(tab.id)) {
      continue;
    }

    // Skip unrestorable or empty URLs
    if (
      !tab.url ||
      tab.url === 'chrome://newtab/' ||
      tab.url.startsWith('chrome://') ||
      tab.url.startsWith('chrome-extension://') ||
      tab.url.startsWith('about:') ||
      tab.url.startsWith('edge://')
    ) {
      skippedCount++;
      continue;
    }

    tabsToSave.push({
      u: tab.url,
      t: tab.title?.substring(0, 80) || 'Untitled', // Limit title to 80 chars
      p: tab.pinned,
      g: tab.groupId && tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE ? tab.groupId : -1
    });

    if (tab.id) tabIdsToClose.push(tab.id);
    if (tab.groupId !== chrome.tabGroups.TAB_GROUP_ID_NONE) uniqueGroupIds.add(tab.groupId);
  }

  const groups: GroupRecord[] = [];
  for (const gId of uniqueGroupIds) {
    try {
      const groupInfo = await chrome.tabGroups.get(gId);
      groups.push({
        i: gId,
        title: groupInfo.title || '',
        color: groupInfo.color,
        collapsed: groupInfo.collapsed
      });
    } catch (e) {
      console.warn(`Failed to fetch group ${gId}`, e);
    }
  }

  return { tabs: tabsToSave, groups, skippedCount, tabIdsToClose };
}

export async function closeTabsSafely(tabIds: number[], windowId: number = chrome.windows.WINDOW_ID_CURRENT): Promise<void> {
  if (tabIds.length === 0) return;

  try {
    const remainingTabs = await chrome.tabs.query({ windowId });
    const remainingIds = new Set(remainingTabs.map(t => t.id).filter(id => id !== undefined));
    
    // Check if we are about to close every single tab in the window
    const willCloseWindow = tabIds.every(id => remainingIds.has(id)) && tabIds.length === remainingIds.size;

    if (willCloseWindow) {
      await chrome.tabs.create({ windowId, url: 'chrome://newtab/' });
    }

    await chrome.tabs.remove(tabIds);
  } catch (error) {
    console.error('Failed to close tabs safely:', error);
    throw new Error('Failed to close some tabs.');
  }
}

export async function restoreStash(id: string, mode: 'current' | 'new'): Promise<void> {
  const { tabs, groups } = await loadStash(id);
  if (tabs.length === 0) return;

  let targetWindowId: number;

  if (mode === 'new') {
    const newWin = await chrome.windows.create({ focused: true });
    targetWindowId = newWin.id!;
  } else {
    targetWindowId = chrome.windows.WINDOW_ID_CURRENT;
  }

  // Map old group IDs to new group IDs
  const groupMap = new Map<number, number[]>(); // oldGroupId -> newTabIds[]

  for (let i = 0; i < tabs.length; i++) {
    const tabData = tabs[i];
    try {
      const createdTab = await chrome.tabs.create({
        windowId: targetWindowId,
        url: tabData.u,
        pinned: tabData.p,
        active: i === 0 // Only steal focus for the very first tab
      });

      if (createdTab.id && tabData.g !== -1) {
        const ids = groupMap.get(tabData.g) || [];
        ids.push(createdTab.id);
        groupMap.set(tabData.g, ids);
      }
    } catch (error) {
      console.warn(`Failed to restore tab: ${tabData.u}`, error);
    }
  }

  // Reconstruct Tab Groups
  for (const oldGroupId of groupMap.keys()) {
    const tabIds = groupMap.get(oldGroupId);
    if (!tabIds || tabIds.length === 0) continue;

    const groupMeta = groups.find(g => g.i === oldGroupId);
    if (!groupMeta) continue;

    try {
      const newGroupId = await chrome.tabs.group({ tabIds, createProperties: { windowId: targetWindowId } });
      await chrome.tabGroups.update(newGroupId, {
        title: groupMeta.title,
        color: groupMeta.color as chrome.tabGroups.ColorEnum,
        collapsed: groupMeta.collapsed
      });
    } catch (error) {
      console.warn(`Failed to reconstruct group ${groupMeta.title}`, error);
    }
  }

  // If we created a new window, Chrome automatically makes a blank tab initially. Clean it up.
  if (mode === 'new') {
    const allInNew = await chrome.tabs.query({ windowId: targetWindowId });
    const emptyTab = allInNew.find(t => t.url === 'chrome://newtab/' || t.url === '');
    if (emptyTab && emptyTab.id) {
      await chrome.tabs.remove(emptyTab.id);
    }
  }
}