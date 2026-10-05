# FormKeep - Automatic Form Recovery (Manifest V3)

> **Trust is the product.** 100% Local • Zero Telemetry • Zero Outbound Requests • Free & Open Source

FormKeep silently saves what you type into web forms as you type. When a browser crashes, a tab closes, or a form submit fails, one click restores your lost text with full undo history intact.

Replaces abandoned extensions like Typio Form Recovery and Lazarus with a clean, modern Manifest V3 architecture.

---

## Features

- **Silent Local Capture:** Automatically captures text inputs, textareas, and rich-text contenteditable editors (including Gmail compose and Reddit) using debounced snapshots.
- **100% Local IndexedDB:** Saves all history directly to your browser's private IndexedDB storage. No 10MB quota limits, and web pages cannot read or access it.
- **Strict Password Exclusion:** Passwords, PINs, 2FA tokens, and sensitive authentication forms are automatically recognized and strictly excluded from capture.
- **One-Click Restore:** Focus the field and restore text using `execCommand("insertText")` so undo history and site JavaScript frameworks (React, Vue, Angular) respond naturally.
- **Context Menu & Shortcut:** Right-click any editable field to restore text, or press `Alt+Shift+R`.
- **Per-Site Disable:** Easily pause or disable FormKeep on specific websites with a single click.
- **Automated Retention Cleanup:** Automatically purges snapshots older than 7 days (configurable 1–30 days) once daily.
- **Zero Outbound Requests:** Verify with Chrome DevTools Network panel anytime. Zero telemetry, zero analytics, zero external scripts.

---

## Architecture & Code Seam

FormKeep is architected with a clean, decoupled design:

```
formkeep/
├── manifest.json              # Manifest V3 specification
├── background/
│   └── service-worker.js      # Event-driven worker: alarms, context menus, retention
├── shared/
│   └── db.js                  # Shared IndexedDB access layer & retention engine
├── content/
│   ├── content.js             # Form input watcher, debouncer & restore executor
│   └── content.css            # In-page toast notifications & restore picker
├── popup/
│   ├── popup.html             # Browser action popup UI
│   ├── popup.css              # Modern UI styling
│   └── popup.js               # Popup controller & site manager
├── options/
│   ├── options.html           # Settings & Retention controls
│   ├── options.css            # Options styling
│   └── options.js             # Options logic
├── icons/                     # Crisp icons (16px, 32px, 48px, 128px)
├── test/
│   └── test-page.html         # Test harness for form capture, crash recovery & passwords
├── docs/
│   └── privacy.html           # Publicly hostable privacy policy
├── CHROMEWEBSTORE.md          # Chrome Web Store metadata & permission justifications
└── PRIVACY.md                 # Plain-language privacy guarantee
```

### Pro Seam Architecture (Future Phase)
FormKeep is designed so that future Pro capabilities (such as encrypted cloud backup or advanced custom regex filtering) can be cleanly toggled via feature flags in `shared/db.js` and `options/options.js` without rewriting core capture logic. **No license keys, account systems, or monetization code are included in this MVP.**

---

## Installation & Development

1. Clone or download this repository.
2. Open Google Chrome and navigate to `chrome://extensions/`.
3. Enable **Developer mode** via the toggle switch in the top right corner.
4. Click **Load unpacked** and select the `formkeep` folder.
5. FormKeep will load with zero errors.

---

## Testing & Verification

### Automated Test Suite
Run the full unit and integration test suite:
```bash
node test/run-all-tests.js
```
- **Unit Tests (`test/unit-tests.js`):** Validates password/sensitive field exclusion heuristics, HTML escaping, word counting, and relative timestamps.
- **Chromium Integration Tests (`test/integration-tests.js`):** Tests real IndexedDB transactions, compound index queries (`site_timestamp`), debounce coalescing, text size safeguards, and performance benchmarks inside a live browser instance.

### Manual Verification
1. Open `test/test-page.html` in Chrome.
2. Type in the message textarea or rich compose box.
3. Click **"Simulate Crash (Clear Fields)"**.
4. Click the FormKeep toolbar icon and click **"Restore"**, or right-click the field and select **"FormKeep: Restore text"**, or press `Alt+Shift+R`.
5. Observe the text restored completely.
6. Open Chrome DevTools -> **Network** tab to confirm zero outbound requests during capture and restore.
7. Open Chrome DevTools -> **Application** tab -> **IndexedDB** -> `FormKeepDB` to verify that passwords and PINs are excluded.

---

## License

MIT License. Free to use, modify, and distribute.
