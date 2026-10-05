/**
 * FormKeep - Settings & Options Controller
 */

import { getStats, clearAllEntries } from '../shared/db.js';

let disabledSites = [];

const retentionSelect = document.getElementById('retentionSelect');
const btnRunCleanup = document.getElementById('btnRunCleanup');
const cleanupStatus = document.getElementById('cleanupStatus');
const newSiteInput = document.getElementById('newSiteInput');
const btnAddSite = document.getElementById('btnAddSite');
const siteError = document.getElementById('siteError');
const disabledSitesList = document.getElementById('disabledSitesList');
const emptyDisabledSites = document.getElementById('emptyDisabledSites');
const statTotalEntries = document.getElementById('statTotalEntries');
const statTotalSites = document.getElementById('statTotalSites');
const btnClearAll = document.getElementById('btnClearAll');

document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  await loadSettings();
  await refreshStats();
});

function setupEventListeners() {
  // Retention change
  retentionSelect.addEventListener('change', async () => {
    const days = parseInt(retentionSelect.value, 10);
    await chrome.storage.local.set({ retentionDays: days });
    showCleanupStatus(`Saved: History will be kept for ${days} day${days > 1 ? 's' : ''}.`);
  });

  // Run cleanup now
  btnRunCleanup.addEventListener('click', async () => {
    btnRunCleanup.disabled = true;
    btnRunCleanup.textContent = 'Cleaning...';
    try {
      const response = await chrome.runtime.sendMessage({
        type: 'FORMKEEP_RUN_CLEANUP',
        retentionDays: parseInt(retentionSelect.value, 10)
      });
      const removed = response?.removed || 0;
      showCleanupStatus(`Cleanup complete: Removed ${removed} old snapshot${removed === 1 ? '' : 's'}.`);
      await refreshStats();
    } catch (err) {
      showCleanupStatus(`Cleanup failed: ${err.message}`, true);
    } finally {
      btnRunCleanup.disabled = false;
      btnRunCleanup.textContent = 'Run Cleanup Now';
    }
  });

  // Add disabled site
  btnAddSite.addEventListener('click', handleAddSite);
  newSiteInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') handleAddSite();
  });

  // Clear all data
  btnClearAll.addEventListener('click', async () => {
    const confirmed = window.confirm(
      'Are you sure you want to permanently delete all FormKeep recovery snapshots? This cannot be undone.'
    );
    if (!confirmed) return;

    try {
      await clearAllEntries();
      await refreshStats();
      alert('All FormKeep snapshots have been permanently erased from your local database.');
    } catch (err) {
      alert(`Error clearing data: ${err.message}`);
    }
  });
}

async function loadSettings() {
  const { retentionDays = 7, disabledSites: sites = [] } = await chrome.storage.local.get([
    'retentionDays',
    'disabledSites'
  ]);

  retentionSelect.value = String(retentionDays);
  disabledSites = sites;
  renderDisabledSites();
}

async function refreshStats() {
  try {
    const stats = await getStats();
    statTotalEntries.textContent = stats.totalEntries.toLocaleString();
    statTotalSites.textContent = stats.totalSites.toLocaleString();
  } catch (err) {
    console.warn('Failed to load stats:', err);
  }
}

function showCleanupStatus(msg, isError = false) {
  cleanupStatus.textContent = msg;
  cleanupStatus.style.color = isError ? '#ef4444' : '#10b981';
  cleanupStatus.classList.remove('hidden');
  setTimeout(() => cleanupStatus.classList.add('hidden'), 4000);
}

function handleAddSite() {
  siteError.classList.add('hidden');
  let domain = newSiteInput.value.trim().toLowerCase();

  // Strip protocol if user pasted a URL
  try {
    if (domain.startsWith('http://') || domain.startsWith('https://')) {
      domain = new URL(domain).hostname.toLowerCase();
    }
  } catch (e) {}

  // Strip path or port
  domain = domain.split('/')[0].split(':')[0].trim();

  if (!domain || !domain.includes('.')) {
    siteError.textContent = 'Please enter a valid website domain (e.g. bank.com)';
    siteError.classList.remove('hidden');
    return;
  }

  if (disabledSites.includes(domain)) {
    siteError.textContent = `${domain} is already disabled.`;
    siteError.classList.remove('hidden');
    return;
  }

  disabledSites.push(domain);
  chrome.storage.local.set({ disabledSites });
  newSiteInput.value = '';
  renderDisabledSites();
}

function renderDisabledSites() {
  disabledSitesList.innerHTML = '';
  if (disabledSites.length === 0) {
    emptyDisabledSites.classList.remove('hidden');
    return;
  }

  emptyDisabledSites.classList.add('hidden');
  disabledSites.forEach((site) => {
    const li = document.createElement('li');
    li.className = 'disabled-item';
    li.innerHTML = `
      <span>🌐 ${escapeHTML(site)}</span>
      <button class="btn-remove" data-site="${escapeHTML(site)}">Re-enable</button>
    `;

    li.querySelector('.btn-remove').addEventListener('click', () => {
      disabledSites = disabledSites.filter((s) => s !== site);
      chrome.storage.local.set({ disabledSites });
      renderDisabledSites();
    });

    disabledSitesList.appendChild(li);
  });
}

function escapeHTML(str) {
  return String(str).replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}
