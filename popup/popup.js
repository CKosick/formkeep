/**
 * FormKeep - Popup Controller
 * Manages the browser-action popup interface:
 * - Lists recent entries for current site and across all sites
 * - Real-time search and filtering
 * - One-click restore into active tab form field
 * - Per-site enable/disable toggle
 * - Instant clipboard copy and entry deletion
 */

import {
  getEntriesBySite,
  getAllRecentEntries,
  searchEntries,
  deleteEntry
} from '../shared/db.js';

let currentTab = null;
let currentHostname = '';
let activeTabMode = 'current'; // 'current' | 'all'
let allEntriesCache = [];
let siteEntriesCache = [];
let disabledSitesList = [];

// DOM Elements
const currentDomainEl = document.getElementById('currentDomain');
const siteToggle = document.getElementById('siteToggle');
const siteDisabledBanner = document.getElementById('siteDisabledBanner');
const searchInput = document.getElementById('searchInput');
const clearSearchBtn = document.getElementById('clearSearchBtn');
const tabCurrentSite = document.getElementById('tabCurrentSite');
const tabAllSites = document.getElementById('tabAllSites');
const badgeCurrentSite = document.getElementById('badgeCurrentSite');
const badgeAllSites = document.getElementById('badgeAllSites');
const entriesList = document.getElementById('entriesList');
const loadingState = document.getElementById('loadingState');
const emptyState = document.getElementById('emptyState');
const emptyStateMessage = document.getElementById('emptyStateMessage');
const btnOptions = document.getElementById('btnOptions');
const retentionNote = document.getElementById('retentionNote');

document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  await initCurrentTab();
  await loadSettings();
  await refreshData();
});

function setupEventListeners() {
  // Navigation tabs
  tabCurrentSite.addEventListener('click', () => switchTab('current'));
  tabAllSites.addEventListener('click', () => switchTab('all'));

  // Site toggle
  siteToggle.addEventListener('change', handleSiteToggleChange);

  // Search
  searchInput.addEventListener('input', handleSearchInput);
  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearSearchBtn.classList.add('hidden');
    renderCurrentView();
  });

  // Settings / Options
  btnOptions.addEventListener('click', () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      window.open(chrome.runtime.getURL('options/options.html'));
    }
  });
}

/**
 * Identify the current active tab and domain.
 */
async function initCurrentTab() {
  try {
    const searchParams = new URLSearchParams(window.location.search);
    if (searchParams.get('site')) {
      currentHostname = searchParams.get('site').toLowerCase();
      currentDomainEl.textContent = currentHostname;
      return;
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTab = tab;

    if (tab?.url) {
      try {
        const url = new URL(tab.url);
        if (url.protocol === 'http:' || url.protocol === 'https:') {
          currentHostname = url.hostname.toLowerCase();
          currentDomainEl.textContent = currentHostname;
          return;
        }
      } catch (e) {}
    }

    // Fallback: request domain from content script
    if (tab?.id) {
      try {
        const status = await chrome.tabs.sendMessage(tab.id, { type: 'FORMKEEP_GET_STATUS' });
        if (status?.site) {
          currentHostname = status.site.toLowerCase();
          currentDomainEl.textContent = currentHostname;
          return;
        }
      } catch (e) {}
    }

    currentDomainEl.textContent = 'All Sites Overview';
    document.getElementById('siteControlCard').style.opacity = '0.9';
    siteToggle.disabled = true;
    switchTab('all');
  } catch (err) {
    currentDomainEl.textContent = 'Unavailable';
  }
}

/**
 * Load settings and disabled sites.
 */
async function loadSettings() {
  try {
    const { disabledSites = [], retentionDays = 7 } = await chrome.storage.local.get([
      'disabledSites',
      'retentionDays'
    ]);
    disabledSitesList = disabledSites;

    if (currentHostname) {
      const isDisabled = disabledSitesList.some(
        (site) => site.toLowerCase() === currentHostname || currentHostname.endsWith('.' + site.toLowerCase())
      );
      siteToggle.checked = !isDisabled;
      updateDisabledBanner(isDisabled);
    }

    retentionNote.textContent = `Auto-cleans older than ${retentionDays} days`;
  } catch (err) {
    console.warn('[FormKeep] Error loading settings:', err);
  }
}

function updateDisabledBanner(isDisabled) {
  if (isDisabled) {
    siteDisabledBanner.classList.remove('hidden');
  } else {
    siteDisabledBanner.classList.add('hidden');
  }
}

/**
 * Handle user toggling capture on current domain.
 */
async function handleSiteToggleChange() {
  if (!currentHostname) return;

  const isEnabled = siteToggle.checked;
  let updatedList = [...disabledSitesList];

  if (!isEnabled) {
    // Add to disabled list
    if (!updatedList.includes(currentHostname)) {
      updatedList.push(currentHostname);
    }
  } else {
    // Remove from disabled list
    updatedList = updatedList.filter(
      (site) => site.toLowerCase() !== currentHostname && !currentHostname.endsWith('.' + site.toLowerCase())
    );
  }

  disabledSitesList = updatedList;
  await chrome.storage.local.set({ disabledSites: updatedList });
  updateDisabledBanner(!isEnabled);
}

/**
 * Switch tabs between "This Site" and "All Recent".
 */
function switchTab(mode) {
  activeTabMode = mode;
  if (mode === 'current') {
    tabCurrentSite.classList.add('active');
    tabAllSites.classList.remove('active');
  } else {
    tabAllSites.classList.add('active');
    tabCurrentSite.classList.remove('active');
  }
  renderCurrentView();
}

/**
 * Refresh data from IndexedDB.
 */
async function refreshData() {
  showLoading(true);
  try {
    if (currentHostname) {
      siteEntriesCache = await getEntriesBySite(currentHostname, 60);
      badgeCurrentSite.textContent = siteEntriesCache.length;
    } else {
      siteEntriesCache = [];
      badgeCurrentSite.textContent = '0';
    }

    allEntriesCache = await getAllRecentEntries(100);
    badgeAllSites.textContent = allEntriesCache.length;

    renderCurrentView();
  } catch (err) {
    console.error('[FormKeep] Error refreshing data:', err);
    showEmptyState('Error accessing local database');
  } finally {
    showLoading(false);
  }
}

/**
 * Render the current active tab view.
 */
function renderCurrentView() {
  const query = searchInput.value.trim().toLowerCase();
  clearSearchBtn.classList.toggle('hidden', query.length === 0);

  let entries = [];
  if (activeTabMode === 'current') {
    entries = siteEntriesCache;
  } else {
    entries = allEntriesCache;
  }

  if (query) {
    entries = entries.filter((item) => {
      return (
        (item.text && item.text.toLowerCase().includes(query)) ||
        (item.site && item.site.toLowerCase().includes(query)) ||
        (item.fieldName && item.fieldName.toLowerCase().includes(query)) ||
        (item.title && item.title.toLowerCase().includes(query))
      );
    });
  }

  if (entries.length === 0) {
    if (query) {
      showEmptyState(`No matches for "${escapeHTML(query)}"`);
    } else if (activeTabMode === 'current') {
      showEmptyState(`No snapshots saved for ${currentHostname || 'this page'} yet.`);
    } else {
      showEmptyState('No snapshots saved yet. Start typing in any form!');
    }
    entriesList.innerHTML = '';
    return;
  }

  hideEmptyState();

  if (activeTabMode === 'all' && !query) {
    // Group by site
    renderGroupedEntries(entries);
  } else {
    // Flat list
    renderFlatEntries(entries);
  }
}

/**
 * Render flat entries list.
 */
function renderFlatEntries(entries) {
  entriesList.innerHTML = '';
  entries.forEach((entry) => {
    entriesList.appendChild(createEntryCard(entry));
  });
}

/**
 * Render grouped entries by site.
 */
function renderGroupedEntries(entries) {
  entriesList.innerHTML = '';
  const groups = new Map();

  for (const entry of entries) {
    const site = entry.site || 'unknown';
    if (!groups.has(site)) {
      groups.set(site, []);
    }
    groups.get(site).push(entry);
  }

  for (const [site, siteEntries] of groups.entries()) {
    const header = document.createElement('div');
    header.className = 'site-group-header';
    header.innerHTML = `<span>🌐 ${escapeHTML(site)}</span><span class="site-group-badge">${siteEntries.length}</span>`;
    entriesList.appendChild(header);

    for (const entry of siteEntries) {
      entriesList.appendChild(createEntryCard(entry, false));
    }
  }
}

/**
 * Create a single entry DOM card.
 */
function createEntryCard(entry, showSite = true) {
  const card = document.createElement('div');
  card.className = 'entry-card';
  card.id = `card-${entry.id}`;

  const timeStr = formatRelativeTime(entry.timestamp);
  const wordCount = entry.wordCount || countWords(entry.text);
  const charCount = entry.charCount || entry.text.length;
  const fieldTypeTag = entry.fieldType || 'text';

  card.innerHTML = `
    <div class="entry-header">
      <div class="entry-title-wrap">
        <span class="entry-field-name" title="${escapeHTML(entry.fieldName || 'Field')}">
          ${escapeHTML(entry.fieldName || 'Form Field')}
        </span>
        <span class="entry-type-tag">${escapeHTML(fieldTypeTag)}</span>
      </div>
      <span class="entry-time">${escapeHTML(timeStr)}</span>
    </div>
    ${showSite && activeTabMode === 'all' ? `<div style="font-size:10px;color:#64748b;margin-top:-4px;">🌐 ${escapeHTML(entry.site)}</div>` : ''}
    <div class="entry-preview" title="Click to expand/collapse">${escapeHTML(entry.text)}</div>
    <div class="entry-footer">
      <span class="entry-stats">${wordCount} words • ${charCount} chars</span>
      <div class="entry-actions">
        <button class="action-btn action-btn-primary btn-restore" title="Restore into field">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
          Restore
        </button>
        <button class="action-btn action-btn-secondary btn-copy" title="Copy to clipboard">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          Copy
        </button>
        <button class="action-btn-icon btn-delete" title="Delete snapshot" aria-label="Delete">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      </div>
    </div>
  `;

  // Toggle preview expand
  const preview = card.querySelector('.entry-preview');
  preview.addEventListener('click', () => {
    preview.classList.toggle('expanded');
  });

  // Action: Restore
  const restoreBtn = card.querySelector('.btn-restore');
  restoreBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await handleRestoreClick(entry, restoreBtn);
  });

  // Action: Copy
  const copyBtn = card.querySelector('.btn-copy');
  copyBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(entry.text);
      copyBtn.innerHTML = `<span>✓ Copied</span>`;
      setTimeout(() => {
        copyBtn.innerHTML = `
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
          Copy
        `;
      }, 1500);
    } catch (err) {
      console.warn('Copy failed:', err);
    }
  });

  // Action: Delete
  const deleteBtn = card.querySelector('.btn-delete');
  deleteBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await handleDeleteClick(entry.id, card);
  });

  return card;
}

/**
 * Handle restoring text into the active tab.
 */
async function handleRestoreClick(entry, button) {
  if (!currentTab?.id) {
    button.innerHTML = `<span>No tab</span>`;
    return;
  }

  try {
    button.innerHTML = `<span>Restoring...</span>`;
    const response = await chrome.tabs.sendMessage(currentTab.id, {
      type: 'FORMKEEP_RESTORE_TEXT',
      text: entry.text,
      fieldSelector: entry.fieldSelector
    });

    if (response?.success) {
      button.innerHTML = `<span>✓ Restored!</span>`;
      setTimeout(() => {
        button.innerHTML = `
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
          Restore
        `;
      }, 1500);
    } else {
      // In case no field was focused, fallback to copying to clipboard
      await navigator.clipboard.writeText(entry.text);
      button.innerHTML = `<span>Copied to clip!</span>`;
      setTimeout(() => {
        button.innerHTML = `
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
          Restore
        `;
      }, 2000);
    }
  } catch (err) {
    // If content script is not running on this tab, copy to clipboard as fallback
    try {
      await navigator.clipboard.writeText(entry.text);
      button.innerHTML = `<span>Copied to clip!</span>`;
    } catch (clipErr) {
      button.innerHTML = `<span>Error</span>`;
    }
    setTimeout(() => {
      button.innerHTML = `
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="1 4 1 10 7 10"></polyline><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"></path></svg>
        Restore
      `;
    }, 1500);
  }
}

/**
 * Handle deleting an entry.
 */
async function handleDeleteClick(id, cardEl) {
  try {
    cardEl.style.opacity = '0';
    cardEl.style.transform = 'scale(0.95)';
    cardEl.style.transition = 'all 0.2s ease';

    await deleteEntry(id);

    setTimeout(() => {
      cardEl.remove();
      siteEntriesCache = siteEntriesCache.filter((item) => item.id !== id);
      allEntriesCache = allEntriesCache.filter((item) => item.id !== id);
      badgeCurrentSite.textContent = siteEntriesCache.length;
      badgeAllSites.textContent = allEntriesCache.length;

      if (entriesList.children.length === 0) {
        showEmptyState('No snapshots found');
      }
    }, 200);
  } catch (err) {
    console.error('Failed to delete entry:', err);
  }
}

function handleSearchInput() {
  renderCurrentView();
}

function showLoading(isLoading) {
  if (isLoading) {
    loadingState.classList.remove('hidden');
    emptyState.classList.add('hidden');
  } else {
    loadingState.classList.add('hidden');
  }
}

function showEmptyState(msg) {
  emptyStateMessage.textContent = msg;
  emptyState.classList.remove('hidden');
}

function hideEmptyState() {
  emptyState.classList.add('hidden');
}

function countWords(str) {
  if (!str) return 0;
  const matches = str.trim().match(/\S+/g);
  return matches ? matches.length : 0;
}

function formatRelativeTime(timestamp) {
  const diff = Math.max(0, Date.now() - timestamp);
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return 'Just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function escapeHTML(str) {
  return String(str).replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}
