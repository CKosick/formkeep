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
          sendResponse({ success: true, entry });
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

        case 'FORMKEEP_OPEN_OPTIONS': {
          const tab = await chrome.tabs.create({ url: chrome.runtime.getURL('options/options.html') });
          sendResponse({ success: true, tabId: tab.id });
          break;
        }

        case 'FORMKEEP_OPEN_POPUP': {
          const tab = await chrome.tabs.create({ url: chrome.runtime.getURL('popup/popup.html') });
          sendResponse({ success: true, tabId: tab.id });
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
