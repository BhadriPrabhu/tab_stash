import { loadIndex } from '../storage';

async function rebuildContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'save-tab-parent',
      title: 'Save this tab to a group',
      contexts: ['page']
    });

    chrome.contextMenus.create({
      id: 'save-tab-new',
      parentId: 'save-tab-parent',
      title: 'New group...',
      contexts: ['page']
    });

    chrome.contextMenus.create({
      id: 'separator-1',
      parentId: 'save-tab-parent',
      type: 'separator',
      contexts: ['page']
    });

    loadIndex().then((index) => {
      index.stashes
        .filter(s => !s.deleted)
        .forEach(stash => {
          chrome.contextMenus.create({
            id: `save-tab-${stash.id}`,
            parentId: 'save-tab-parent',
            title: stash.name,
            contexts: ['page']
          });
        });
    }).catch(console.error);
  });
}

chrome.runtime.onInstalled.addListener(() => {
  rebuildContextMenus();
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'sync' && changes.index) {
    rebuildContextMenus();
  }
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab || !tab.id || !tab.url) return;

  if (info.menuItemId === 'save-tab-new') {
    // Open the manager or a specific UI prompt to name the new group
    chrome.tabs.create({ url: `manager.html?action=new&url=${encodeURIComponent(tab.url)}` });
  } else if (typeof info.menuItemId === 'string' && info.menuItemId.startsWith('save-tab-')) {
    const groupId = info.menuItemId.replace('save-tab-', '');
    // In Phase 5, this will trigger the appendToStash logic
    console.log(`Saving tab ${tab.id} to group ${groupId}`);
  }
});