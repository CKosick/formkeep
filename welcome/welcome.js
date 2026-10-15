/**
 * FormKeep - Welcome Page Helpers
 * Capture and restore on this page are handled by the real content script
 * (content/content.js), which this page loads the same way a web page would.
 * This file only wires the page's own controls to those same code paths.
 */

(function () {
  const restoreBtn = document.getElementById('btnSelfTestRestore');
  const testBox = document.getElementById('selfTestBox');

  // If the page is reloaded or closed while a field is focused, blur it first.
  // The content script flushes a final snapshot on blur, so a typed sentence
  // is saved even when the user reloads immediately after typing.
  window.addEventListener('pagehide', () => {
    const active = document.activeElement;
    if (active && active !== document.body && typeof active.blur === 'function') {
      active.blur();
    }
  });

  restoreBtn.addEventListener('click', async () => {
    // Focus the self-test box so the restore path targets it, mirroring how a
    // user clicks into a field before restoring on any other page.
    if (testBox) testBox.focus();

    try {
      const tab = await chrome.tabs.getCurrent();
      if (tab?.id) {
        // Send the same tab message the service worker sends for the
        // right-click menu and the Alt+Shift+R shortcut, so the self-test
        // restore runs through the identical content script handler.
        await chrome.tabs.sendMessage(tab.id, {
          type: 'FORMKEEP_TRIGGER_RESTORE',
          source: 'welcomePage'
        });
      }
    } catch (err) {
      console.warn('[FormKeep] Welcome page restore failed:', err);
    }
  });
})();
