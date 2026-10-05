/**
 * FormKeep - Content Script
 * Watches inputs, textareas, and contenteditable fields.
 * Debounces and securely forwards form snapshots to local IndexedDB.
 * Completely excludes password and sensitive fields.
 * Handles one-click restores via execCommand("insertText").
 */

(function () {
  // Prevent duplicate injection in the same frame
  if (window.__formkeep_initialized) return;
  window.__formkeep_initialized = true;

  const currentHostname = window.location.hostname.toLowerCase();
  let isSiteDisabled = false;
  let lastFocusedElement = null;
  let contextMenuElement = null;
  const pendingDebounces = new WeakMap(); // element -> timer (WeakMap prevents memory leaks on detached DOM elements)

  // Track active picker UI element
  let activePickerEl = null;

  /**
   * Initialize settings and storage listeners.
   */
  async function initSettings() {
    try {
      if (chrome.runtime?.id) {
        const { disabledSites = [] } = await chrome.storage.local.get('disabledSites');
        updateDisabledState(disabledSites);

        chrome.storage.onChanged.addListener((changes, area) => {
          if (area === 'local' && changes.disabledSites) {
            updateDisabledState(changes.disabledSites.newValue || []);
          }
        });
      }
    } catch (e) {
      // Extension context invalidated or inactive
    }
  }

  function updateDisabledState(disabledSites) {
    isSiteDisabled = disabledSites.some(
      (site) => site.toLowerCase() === currentHostname || currentHostname.endsWith('.' + site.toLowerCase())
    );
  }

  /**
   * Determine if an element is a password or sensitive field.
   * STRICT SAFETY: Never capture passwords, PINs, tokens, CVVs, or secret codes.
   */
  function isPasswordField(el) {
    if (!el || !(el instanceof HTMLElement)) return false;

    // Check input type
    if (el.tagName === 'INPUT') {
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      if (type === 'password') return true;
      if (['hidden', 'submit', 'button', 'reset', 'file', 'checkbox', 'radio', 'image'].includes(type)) {
        return true;
      }
    }

    // Check autocomplete attributes
    const autocomplete = (el.getAttribute('autocomplete') || '').toLowerCase();
    if (
      autocomplete.includes('password') ||
      autocomplete.includes('current-password') ||
      autocomplete.includes('new-password') ||
      autocomplete.includes('one-time-code') ||
      autocomplete.includes('cc-')
    ) {
      return true;
    }

    // Check attributes for sensitive patterns
    const identifier = `${el.id || ''} ${el.name || ''} ${el.placeholder || ''} ${el.getAttribute('aria-label') || ''}`.toLowerCase();
    const sensitiveRegex = /(?:pass(?:word|phrase)?|pin|secret|cvv|cvc|otp|token|2fa|ssn)/i;
    if (sensitiveRegex.test(identifier)) {
      return true;
    }

    // Check parent form
    const form = el.closest('form');
    if (form) {
      const formId = `${form.id || ''} ${form.name || ''} ${form.action || ''}`.toLowerCase();
      if (formId.includes('login') || formId.includes('signin') || formId.includes('auth')) {
        if (identifier.includes('pass') || identifier.includes('code')) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Verify if element is a capture-eligible text field or rich editor.
   */
  function isEligibleField(el) {
    if (!el || !(el instanceof HTMLElement)) return false;
    if (isPasswordField(el)) return false;

    if (el.isContentEditable) return true;
    if (el.tagName === 'TEXTAREA') return true;
    if (el.tagName === 'INPUT') {
      const type = (el.getAttribute('type') || 'text').toLowerCase();
      return ['text', 'search', 'email', 'url', 'tel', 'number'].includes(type);
    }

    return false;
  }

  /**
   * Get user-friendly field label or identifier.
   */
  function getFieldLabel(el) {
    if (!el) return 'Form field';

    // 1. Check aria-label or aria-labelledby
    const ariaLabel = el.getAttribute('aria-label');
    if (ariaLabel && ariaLabel.trim()) return ariaLabel.trim();

    const ariaLabelledBy = el.getAttribute('aria-labelledby');
    if (ariaLabelledBy) {
      const labelEl = document.getElementById(ariaLabelledBy);
      if (labelEl && labelEl.innerText.trim()) return labelEl.innerText.trim();
    }

    // 2. Check associated <label>
    if (el.id) {
      const label = document.querySelector(`label[for="${CSS.escape(el.id)}"]`);
      if (label && label.innerText.trim()) return label.innerText.trim();
    }
    const parentLabel = el.closest('label');
    if (parentLabel && parentLabel.innerText.trim()) {
      return parentLabel.innerText.trim();
    }

    // 3. Placeholder
    if (el.placeholder && el.placeholder.trim()) {
      return el.placeholder.trim();
    }

    // 4. Name or ID
    if (el.name && el.name.trim()) return el.name.trim();
    if (el.id && el.id.trim()) return el.id.trim();

    if (el.isContentEditable) return 'Rich text editor';
    return el.tagName === 'TEXTAREA' ? 'Text area' : 'Input field';
  }

  /**
   * Generate a stable CSS selector for restoring text.
   */
  function getFieldSelector(el) {
    if (!el) return '';
    if (el.id) return `#${CSS.escape(el.id)}`;
    if (el.name) {
      return `${el.tagName.toLowerCase()}[name="${CSS.escape(el.name)}"]`;
    }

    // Role-based selector (e.g. Gmail compose)
    const role = el.getAttribute('role');
    const ariaLabel = el.getAttribute('aria-label');
    if (role && ariaLabel) {
      return `[role="${CSS.escape(role)}"][aria-label="${CSS.escape(ariaLabel)}"]`;
    }

    // Generate hierarchy path
    const path = [];
    let curr = el;
    while (curr && curr !== document.body && curr !== document.documentElement) {
      let selector = curr.tagName.toLowerCase();
      if (curr.id) {
        selector = `#${CSS.escape(curr.id)}`;
        path.unshift(selector);
        break;
      }
      let sibling = curr;
      let nth = 1;
      while ((sibling = sibling.previousElementSibling)) {
        if (sibling.tagName === curr.tagName) nth++;
      }
      selector += `:nth-of-type(${nth})`;
      path.unshift(selector);
      curr = curr.parentElement;
    }
    return path.join(' > ');
  }

  /**
   * Extract current text value.
   */
  function getFieldText(el) {
    if (!el) return '';
    if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
      return el.value || '';
    }
    if (el.isContentEditable) {
      return el.innerText || el.textContent || '';
    }
    return el.value || '';
  }

  /**
   * Debounced save trigger.
   */
  function queueSnapshot(el, immediate = false) {
    if (isSiteDisabled || !isEligibleField(el)) return;

    if (pendingDebounces.has(el)) {
      clearTimeout(pendingDebounces.get(el));
      pendingDebounces.delete(el);
    }

    const captureTask = () => {
      pendingDebounces.delete(el);
      const text = getFieldText(el);
      if (!text || !text.trim()) return;

      const fieldName = getFieldLabel(el);
      const fieldSelector = getFieldSelector(el);
      const fieldKey = `${el.tagName.toLowerCase()}_${el.id || el.name || fieldSelector}`;
      const fieldType = el.isContentEditable ? 'contenteditable' : el.tagName.toLowerCase();

      try {
        if (chrome.runtime?.id) {
          chrome.runtime.sendMessage({
            type: 'FORMKEEP_SAVE_ENTRY',
            payload: {
              site: currentHostname,
              url: window.location.href,
              title: document.title || currentHostname,
              fieldKey,
              fieldName,
              fieldSelector,
              fieldType,
              text
            }
          });
        }
      } catch (e) {
        // Context invalidated
      }
    };

    if (immediate) {
      captureTask();
    } else {
      const timer = setTimeout(captureTask, 600);
      pendingDebounces.set(el, timer);
    }
  }

  /**
   * Restore text into a field using execCommand("insertText") pattern.
   * Fallback to direct assignment with input/change events.
   */
  function restoreTextIntoField(field, text) {
    if (!field || typeof text !== 'string') return false;

    try {
      field.focus();

      if (field.isContentEditable) {
        // Contenteditable restoration
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(field);
        selection.removeAllRanges();
        selection.addRange(range);

        const success = document.execCommand('insertText', false, text);
        if (!success || (field.innerText !== text && field.textContent !== text)) {
          field.innerText = text;
          field.dispatchEvent(new Event('input', { bubbles: true }));
          field.dispatchEvent(new Event('change', { bubbles: true }));
        }
      } else {
        // Input or Textarea restoration
        field.select();
        const success = document.execCommand('insertText', false, text);
        if (!success || field.value !== text) {
          field.value = text;
          field.dispatchEvent(new Event('input', { bubbles: true }));
          field.dispatchEvent(new Event('change', { bubbles: true }));
        }
      }

      showToast(`Restored ${text.length} characters`);
      return true;
    } catch (err) {
      console.warn('[FormKeep] Restore attempt error:', err);
      return false;
    }
  }

  /**
   * Subtle notification toast.
   */
  function showToast(message) {
    const existing = document.querySelector('.formkeep-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'formkeep-toast';
    toast.innerHTML = `<span class="formkeep-toast-icon">✓</span><span>${escapeHTML(message)}</span>`;
    document.body.appendChild(toast);

    setTimeout(() => {
      if (toast.parentNode) {
        toast.style.transition = 'opacity 0.25s ease';
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 250);
      }
    }, 2500);
  }

  function escapeHTML(str) {
    return String(str).replace(/[&<>'"]/g, 
      tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
    );
  }

  /**
   * Floating restore dropdown when multiple snapshots exist.
   */
  function showRestorePicker(field, entries) {
    dismissRestorePicker();
    if (!entries || entries.length === 0) return;

    const rect = field.getBoundingClientRect();
    const picker = document.createElement('div');
    picker.className = 'formkeep-picker';
    picker.style.top = `${window.scrollY + rect.bottom + 6}px`;
    picker.style.left = `${Math.min(window.scrollX + rect.left, window.innerWidth - 340)}px`;

    let itemsHTML = '';
    entries.forEach((item, index) => {
      const timeStr = formatRelativeTime(item.timestamp);
      itemsHTML += `
        <div class="formkeep-picker-item" data-index="${index}">
          <div class="formkeep-picker-item-meta">
            <span class="formkeep-picker-item-time">${escapeHTML(timeStr)}</span>
            <span>${item.charCount || item.text.length} chars</span>
          </div>
          <div class="formkeep-picker-item-preview">${escapeHTML(item.text.substring(0, 140))}</div>
        </div>
      `;
    });

    picker.innerHTML = `
      <div class="formkeep-picker-header">
        <span class="formkeep-picker-title">
          <span>🛡️ FormKeep</span>
          <span>• Restore Snapshot</span>
        </span>
        <button class="formkeep-picker-close" aria-label="Close">&times;</button>
      </div>
      <div class="formkeep-picker-list">
        ${itemsHTML}
      </div>
    `;

    // Event listeners for picker items
    picker.querySelector('.formkeep-picker-close').addEventListener('click', (e) => {
      e.stopPropagation();
      dismissRestorePicker();
    });

    picker.querySelectorAll('.formkeep-picker-item').forEach((itemEl) => {
      itemEl.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(itemEl.getAttribute('data-index'), 10);
        const selected = entries[idx];
        if (selected) {
          restoreTextIntoField(field, selected.text);
        }
        dismissRestorePicker();
      });
    });

    document.body.appendChild(picker);
    activePickerEl = picker;

    // Dismiss on outside click or Esc
    const handleOutside = (e) => {
      if (!picker.contains(e.target) && e.target !== field) {
        dismissRestorePicker();
        document.removeEventListener('click', handleOutside, true);
      }
    };
    setTimeout(() => document.addEventListener('click', handleOutside, true), 10);
  }

  function dismissRestorePicker() {
    if (activePickerEl) {
      activePickerEl.remove();
      activePickerEl = null;
    }
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

  /**
   * Global Event Listeners for Input Capture.
   * Uses { capture: true, passive: true } for optimal compositor performance.
   */
  document.addEventListener('input', (event) => {
    const target = event.target;
    if (isEligibleField(target)) {
      queueSnapshot(target, false);
    }
  }, { capture: true, passive: true });

  document.addEventListener('focusin', (event) => {
    const target = event.target;
    if (isEligibleField(target)) {
      lastFocusedElement = target;
    }
  }, { capture: true, passive: true });

  document.addEventListener('blur', (event) => {
    const target = event.target;
    if (isEligibleField(target)) {
      // Flush any pending debounce immediately on blur
      queueSnapshot(target, true);
    }
  }, { capture: true, passive: true });

  document.addEventListener('contextmenu', (event) => {
    const target = event.target;
    if (isEligibleField(target)) {
      contextMenuElement = target;
      lastFocusedElement = target;
    }
  }, true);

  // Close picker on Escape key
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && activePickerEl) {
      dismissRestorePicker();
    }
  });

  /**
   * Listen for messages from popup, context menu, or commands.
   */
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message || !message.type) return;

    if (message.type === 'FORMKEEP_RESTORE_TEXT') {
      let target = lastFocusedElement || contextMenuElement;
      if (!target && message.fieldSelector) {
        target = document.querySelector(message.fieldSelector);
      }
      if (!target) {
        // Try currently focused element or first eligible field on page
        const active = document.activeElement;
        target = isEligibleField(active) ? active : document.querySelector('textarea, input[type="text"], [contenteditable="true"]');
      }

      if (target) {
        const ok = restoreTextIntoField(target, message.text);
        sendResponse({ success: ok });
      } else {
        showToast('No form field selected to restore into');
        sendResponse({ success: false, error: 'No target field' });
      }
      return true;
    }

    if (message.type === 'FORMKEEP_TRIGGER_RESTORE') {
      const target = contextMenuElement || lastFocusedElement || document.activeElement;
      if (!target || !isEligibleField(target)) {
        showToast('Click into a form field first to restore');
        sendResponse({ success: false, error: 'No field active' });
        return true;
      }

      // Fetch entries for this site
      chrome.runtime.sendMessage(
        { type: 'FORMKEEP_GET_SITE_ENTRIES', site: currentHostname },
        (response) => {
          const entries = response?.entries || [];
          if (entries.length === 0) {
            showToast('No FormKeep snapshots found for this site');
            sendResponse({ success: false });
            return;
          }

          if (entries.length === 1) {
            restoreTextIntoField(target, entries[0].text);
            sendResponse({ success: true });
          } else {
            showRestorePicker(target, entries);
            sendResponse({ success: true });
          }
        }
      );
      return true;
    }

    if (message.type === 'FORMKEEP_GET_STATUS') {
      sendResponse({
        site: currentHostname,
        isSiteDisabled,
        hasActiveField: !!(lastFocusedElement && isEligibleField(lastFocusedElement))
      });
      return true;
    }
  });

  // Start initialization
  initSettings();
})();
