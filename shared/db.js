/**
 * FormKeep - IndexedDB Storage Layer
 * High-performance, 100% local form recovery database.
 * No data leaves the user's browser.
 */

const DB_NAME = 'FormKeepDB';
const DB_VERSION = 1;
const STORE_NAME = 'entries';
const SESSION_WINDOW_MS = 30 * 60 * 1000; // 30 minutes for updating active typing session
const MAX_TEXT_LENGTH = 250000; // Safeguard: 250k chars max per snapshot (~500KB)

let dbInstance = null;

/**
 * Open and initialize the FormKeep IndexedDB database.
 * @returns {Promise<IDBDatabase>}
 */
export async function getDB() {
  if (dbInstance) {
    return dbInstance;
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('site', 'site', { unique: false });
        store.createIndex('url', 'url', { unique: false });
        store.createIndex('fieldKey', 'fieldKey', { unique: false });
        store.createIndex('timestamp', 'timestamp', { unique: false });
        store.createIndex('site_timestamp', ['site', 'timestamp'], { unique: false });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      dbInstance.onversionchange = () => {
        dbInstance.close();
        dbInstance = null;
      };
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      reject(new Error(`Failed to open FormKeepDB: ${event.target.error?.message}`));
    };
  });
}

/**
 * Generate a unique ID for entries.
 */
function generateId() {
  return `fk_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Calculate word count.
 */
function countWords(str) {
  if (!str) return 0;
  const matches = str.trim().match(/\S+/g);
  return matches ? matches.length : 0;
}

/**
 * Save or update a debounced snapshot into IndexedDB.
 * Updates the existing entry if user is actively typing in the same field/session.
 *
 * @param {Object} data
 * @returns {Promise<Object>}
 */
export async function saveEntry(data) {
  let text = (data.text || '').trim();
  if (!text) {
    // Never overwrite with empty text - safeguard against cleared fields on submit
    return null;
  }
  if (text.length > MAX_TEXT_LENGTH) {
    text = text.substring(0, MAX_TEXT_LENGTH);
  }

  const db = await getDB();
  const now = Date.now();
  const site = (data.site || 'unknown').toLowerCase();
  const fieldKey = data.fieldKey || 'default';
  const url = data.url || '';

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME], 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    // Look for an existing entry for this site + url + fieldKey in the recent session window
    const index = store.index('site');
    const request = index.getAll(site);

    request.onsuccess = () => {
      const existing = (request.result || []).find(
        (item) => item.fieldKey === fieldKey && item.url === url && (now - item.timestamp) < SESSION_WINDOW_MS
      );

      let record;
      if (existing) {
        // Update existing snapshot
        record = {
          ...existing,
          title: data.title || existing.title || '',
          fieldName: data.fieldName || existing.fieldName || 'Form field',
          fieldSelector: data.fieldSelector || existing.fieldSelector || '',
          fieldType: data.fieldType || existing.fieldType || 'text',
          text: text, // preserve full text with leading/trailing spaces as typed
          charCount: text.length,
          wordCount: countWords(text),
          timestamp: now
        };
      } else {
        // Create new entry
        record = {
          id: generateId(),
          site: site,
          url: url,
          title: data.title || '',
          fieldKey: fieldKey,
          fieldName: data.fieldName || 'Form field',
          fieldSelector: data.fieldSelector || '',
          fieldType: data.fieldType || 'text',
          text: text,
          charCount: text.length,
          wordCount: countWords(text),
          createdAt: now,
          timestamp: now
        };
      }

      const putReq = store.put(record);
      putReq.onsuccess = () => resolve(record);
      putReq.onerror = () => reject(putReq.error);
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * Retrieve recent entries for a specific website hostname.
 * Optimized to use the compound site_timestamp index for reverse chronological ordering.
 *
 * @param {string} site
 * @param {number} limit
 * @returns {Promise<Array>}
 */
export async function getEntriesBySite(site, limit = 50) {
  const db = await getDB();
  const normalizedSite = (site || '').toLowerCase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME], 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const results = [];

    if (store.indexNames.contains('site_timestamp')) {
      const index = store.index('site_timestamp');
      const range = IDBKeyRange.bound(
        [normalizedSite, 0],
        [normalizedSite, Number.MAX_SAFE_INTEGER]
      );
      const cursorReq = index.openCursor(range, 'prev');
      cursorReq.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor && results.length < limit) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };
      cursorReq.onerror = () => reject(cursorReq.error);
    } else {
      const index = store.index('site');
      const request = index.getAll(normalizedSite);
      request.onsuccess = () => {
        const list = request.result || [];
        list.sort((a, b) => b.timestamp - a.timestamp);
        resolve(list.slice(0, limit));
      };
      request.onerror = () => reject(request.error);
    }
  });
}

/**
 * Retrieve all recent entries across all sites.
 *
 * @param {number} limit
 * @returns {Promise<Array>}
 */
export async function getAllRecentEntries(limit = 100) {
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME], 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('timestamp');
    const request = index.openCursor(null, 'prev');
    const results = [];

    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor && results.length < limit) {
        results.push(cursor.value);
        cursor.continue();
      } else {
        resolve(results);
      }
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * Search entries by text content, field name, title, or site.
 *
 * @param {string} query
 * @param {number} limit
 * @returns {Promise<Array>}
 */
export async function searchEntries(query, limit = 50) {
  const db = await getDB();
  const q = (query || '').toLowerCase().trim();
  if (!q) return getAllRecentEntries(limit);

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME], 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('timestamp');
    const request = index.openCursor(null, 'prev');
    const results = [];

    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor && results.length < limit) {
        const item = cursor.value;
        const match =
          (item.text && item.text.toLowerCase().includes(q)) ||
          (item.site && item.site.toLowerCase().includes(q)) ||
          (item.fieldName && item.fieldName.toLowerCase().includes(q)) ||
          (item.title && item.title.toLowerCase().includes(q));

        if (match) {
          results.push(item);
        }
        cursor.continue();
      } else {
        resolve(results);
      }
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * Get an entry by its unique ID.
 *
 * @param {string} id
 * @returns {Promise<Object|null>}
 */
export async function getEntryById(id) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME], 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(id);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete an entry by ID.
 *
 * @param {string} id
 * @returns {Promise<boolean>}
 */
export async function deleteEntry(id) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME], 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete all entries for a specific site.
 *
 * @param {string} site
 * @returns {Promise<number>}
 */
export async function deleteEntriesForSite(site) {
  const db = await getDB();
  const normalizedSite = (site || '').toLowerCase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME], 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('site');
    const request = index.getAllKeys(normalizedSite);

    request.onsuccess = () => {
      const keys = request.result || [];
      for (const key of keys) {
        store.delete(key);
      }
      resolve(keys.length);
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * Clear the entire database.
 *
 * @returns {Promise<boolean>}
 */
export async function clearAllEntries() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME], 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const request = store.clear();

    request.onsuccess = () => resolve(true);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Clean up entries older than the retention period.
 *
 * @param {number} retentionDays
 * @returns {Promise<number>} Number of deleted entries
 */
export async function cleanupOldEntries(retentionDays = 7) {
  const days = Math.max(1, parseInt(retentionDays, 10) || 7);
  const cutoff = Date.now() - (days * 24 * 60 * 60 * 1000);
  const db = await getDB();

  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME], 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const index = store.index('timestamp');
    const range = IDBKeyRange.upperBound(cutoff);
    const request = index.openCursor(range);
    let count = 0;

    request.onsuccess = (event) => {
      const cursor = event.target.result;
      if (cursor) {
        cursor.delete();
        count++;
        cursor.continue();
      } else {
        resolve(count);
      }
    };

    request.onerror = () => reject(request.error);
  });
}

/**
 * Get summary stats for the extension options and popup.
 *
 * @returns {Promise<Object>}
 */
export async function getStats() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([STORE_NAME], 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const countReq = store.count();

    countReq.onsuccess = () => {
      const totalEntries = countReq.result;
      const index = store.index('site');
      const allSitesReq = index.getAll();

      allSitesReq.onsuccess = () => {
        const uniqueSites = new Set((allSitesReq.result || []).map((item) => item.site));
        resolve({
          totalEntries,
          totalSites: uniqueSites.size
        });
      };
      allSitesReq.onerror = () => resolve({ totalEntries, totalSites: 0 });
    };

    countReq.onerror = () => reject(countReq.error);
  });
}
