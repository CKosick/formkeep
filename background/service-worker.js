/**
 * FormKeep - Service Worker (Manifest V3)
 * Event-driven background coordinator:
 * - Manages IndexedDB persistence requests from content scripts
 * - Context menu item registration and handling
 * - Keyboard shortcut commands
 * - Retention alarms and automatic cleanup
 * - Zero network requests, 100% local operation
 */

import {
  saveEntry,
  getEntriesBySite,
  getAllRecentEntries,
  cleanupOldEntries,
  deleteEntry,
  clearAllEntries
} from '../shared/db.js';

const CLEANUP_ALARM_NAME = 'formkeep-daily-cleanup';
const DEFAULT_RETENTION_DAYS = 7;
const BADGE_COLOR = '#4F46E5';

/**
 * Badge text for a snapshot count: empty when there is nothing saved,
 * the count itself up to 99, then a capped label.
 */
function badgeTextForCount(count) {
  if (!count || count <= 0) return '';
  return count > 99 ? '99+' : String(count);
}

/**
 * Mirror of the content script's per-site disable matching, so the badge
 * respects the same paused state the page itself uses.
 */
function isSiteDisabledFor(hostname, disabledSites) {
  const site = String(hostname || '').toLowerCase();
  if (!site) return false;
  return (disabledSites || []).some((entry) => {
    const disabled = String(entry || '').toLowerCase();
    return disabled && (site === disabled || site.endsWith('.' + disabled));
  });
}

/**
 * Refresh the toolbar badge for one tab so it shows how many snapshots are
 * saved for the site in that tab. Cleared when the site is paused or has no
 * snapshots. The site is learned from the tab's content script (the
 * FORMKEEP_GET_STATUS round trip), because the badge must work without
 * reading tab URLs directly. Best effort: unscriptable tabs are skipped.
 */
async function refreshBadgeForTab(tabId, knownSite) {
  if (!tabId) return;
  try {
    let site = knownSite;
    if (!site) {
      const status = await chrome.tabs
        .sendMessage(tabId, { type: 'FORMKEEP_GET_STATUS' })
        .catch(() => null);
      site = status?.site;
    }
    if (!site) return;
    site = String(site).toLowerCase();

    const { disabledSites = [] } = await chrome.storage.local.get('disabledSites');
    let text = '';
    if (!isSiteDisabledFor(site, disabledSites)) {
      const entries = await getEntriesBySite(site, 500);
      text = badgeTextForCount(entries.length);
    }

    await chrome.action.setBadgeText({ tabId, text });
    if (text) {
      try {
        await chrome.action.setBadgeBackgroundColor({ tabId, color: BADGE_COLOR });
      } catch (err) {
        // Background color is cosmetic; the count itself already applied.
      }
    }
  } catch (err) {
    // Tab closed or not scriptable; badge refresh is best effort.
  }
}

/**
 * Refresh badges on every open tab (used after the paused-sites list changes).
 */
async function refreshAllTabBadges() {
  try {
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      if (tab.id) {
        refreshBadgeForTab(tab.id);
      }
    }
  } catch (err) {
    // Best effort only.
  }
}

/**
 * Extension installation and update lifecycle.
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  // Ensure default settings exist in chrome.storage.local
  const { retentionDays, disabledSites } = await chrome.storage.local.get([
    'retentionDays',
    'disabledSites'
  ]);

  const updates = {};
  if (typeof retentionDays !== 'number') {
    updates.retentionDays = DEFAULT_RETENTION_DAYS;
  }
  if (!Array.isArray(disabledSites)) {
    updates.disabledSites = [];
  }

  if (Object.keys(updates).length > 0) {
    await chrome.storage.local.set(updates);
  }

  // Create context menu for editable fields
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'formkeep-restore-menu',
      title: 'FormKeep: Restore text',
      contexts: ['editable']
    });
  });

  // Setup periodic daily cleanup alarm
  chrome.alarms.create(CLEANUP_ALARM_NAME, {
    periodInMinutes: 1440 // 24 hours
  });

  // Run an initial cleanup check
  const activeRetention = updates.retentionDays || retentionDays || DEFAULT_RETENTION_DAYS;
  try {
    await cleanupOldEntries(activeRetention);
  } catch (err) {
    console.warn('[FormKeep] Initial cleanup error:', err);
  }

  // First-run welcome page: open exactly once, on a genuine install only.
  // onInstalled also fires for extension updates and browser updates, and it
  // never fires on browser restart, so gating on reason 'install' gives the
  // page a single showing per profile.
  if (details.reason === 'install') {
    try {
      await chrome.tabs.create({ url: chrome.runtime.getURL('welcome/welcome.html') });
    } catch (err) {
      console.warn('[FormKeep] Could not open welcome page:', err);
    }
  }
});

/**
 * Ensure alarm is created on browser startup if missing.
 */
chrome.runtime.onStartup.addListener(async () => {
  const alarm = await chrome.alarms.get(CLEANUP_ALARM_NAME);
  if (!alarm) {
    chrome.alarms.create(CLEANUP_ALARM_NAME, {
      periodInMinutes: 1440
    });
  }

  const { retentionDays = DEFAULT_RETENTION_DAYS } = await chrome.storage.local.get('retentionDays');
  try {
    await cleanupOldEntries(retentionDays);
  } catch (err) {
    console.warn('[FormKeep] Startup cleanup error:', err);
  }
});

/**
 * Handle alarm triggers for retention cleanup.
 */
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === CLEANUP_ALARM_NAME) {
    try {
      const { retentionDays = DEFAULT_RETENTION_DAYS } = await chrome.storage.local.get('retentionDays');
      const removed = await cleanupOldEntries(retentionDays);
      if (removed > 0) {
        console.log(`[FormKeep] Automated retention cleanup removed ${removed} old entries.`);
      }
    } catch (err) {
      console.warn('[FormKeep] Alarm cleanup failed:', err);
    }
  }
});

/**
 * Context menu click handler.
 */
chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === 'formkeep-restore-menu' && tab?.id) {
    try {
      await chrome.tabs.sendMessage(tab.id, {
        type: 'FORMKEEP_TRIGGER_RESTORE',
        source: 'contextMenu'
      });
    } catch (err) {
      // Tab might not be scriptable or not ready
      console.warn('[FormKeep] Could not send restore message to tab:', err);
    }
  }
});

/**
 * Keyboard shortcuts handler.
 */
chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'restore-text') {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id) {
      try {
        await chrome.tabs.sendMessage(tab.id, {
          type: 'FORMKEEP_TRIGGER_RESTORE',
          source: 'keyboardShortcut'
        });
      } catch (err) {
        console.warn('[FormKeep] Could not send shortcut restore message to tab:', err);
      }
    }
  }
});

/**
 * Keep the toolbar badge in step with the tab the user is looking at:
 * switching tabs or finishing a page load re-reads that tab's site count.
 */
chrome.tabs.onActivated.addListener(({ tabId }) => {
  refreshBadgeForTab(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'complete') {
    refreshBadgeForTab(tabId);
  }
});

/**
 * Pausing or resuming a site from the popup or options page must update the
 * badge right away (a paused site shows no count).
 */
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes.disabledSites) {
    refreshAllTabBadges();
  }
});

/**
 * Central runtime message listener for content scripts and popup.
 * Always returns true for asynchronous sendResponse.
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!message || !message.type) {
    return false;
  }

  (async () => {
    try {
      switch (message.type) {
        case 'FORMKEEP_SAVE_ENTRY': {
          const entry = await saveEntry(message.payload);
          let showFirstSaveToast = false;
          if (entry) {
            // Visible pulse part 1: the saving tab's badge now shows the
            // snapshot count for its site.
            if (sender.tab?.id) {
              await refreshBadgeForTab(sender.tab.id, entry.site);
            }
            // Visible pulse part 2: the very first save on a site earns a
            // one-time page toast (sent back to the content script, which
            // owns the toast UI). Later saves on that site stay silent.
            const { firstSaveToastSites = [] } = await chrome.storage.local.get('firstSaveToastSites');
            if (!firstSaveToastSites.includes(entry.site)) {
              firstSaveToastSites.push(entry.site);
              await chrome.storage.local.set({ firstSaveToastSites });
              showFirstSaveToast = true;
            }
          }
          sendResponse({ success: true, entry, showFirstSaveToast });
          break;
        }

        case 'FORMKEEP_PAGE_READY': {
          // A content script has loaded on a page: sync that tab's badge.
          if (sender.tab?.id && message.site) {
            await refreshBadgeForTab(sender.tab.id, message.site);
          }
          sendResponse({ success: true });
          break;
        }

        case 'FORMKEEP_GET_SITE_ENTRIES': {
          const entries = await getEntriesBySite(message.site, message.limit || 50);
          sendResponse({ success: true, entries });
          break;
        }

        case 'FORMKEEP_GET_ALL_RECENT': {
          const entries = await getAllRecentEntries(message.limit || 100);
          sendResponse({ success: true, entries });
          break;
        }

        case 'FORMKEEP_DELETE_ENTRY': {
          await deleteEntry(message.id);
          sendResponse({ success: true });
          break;
        }

        case 'FORMKEEP_CLEAR_ALL': {
          await clearAllEntries();
          sendResponse({ success: true });
          break;
        }

        case 'FORMKEEP_RUN_CLEANUP': {
          const { retentionDays = DEFAULT_RETENTION_DAYS } = await chrome.storage.local.get('retentionDays');
          const removed = await cleanupOldEntries(message.retentionDays || retentionDays);
          sendResponse({ success: true, removed });
          break;
        }

        default:
          sendResponse({ success: false, error: 'Unknown message type' });
          break;
      }
    } catch (err) {
      console.error(`[FormKeep] Error handling message ${message.type}:`, err);
      sendResponse({ success: false, error: err.message });
    }
  })();

  return true; // Keeps the message channel open for async response
});
