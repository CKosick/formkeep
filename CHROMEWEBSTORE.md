# Chrome Web Store Listing — FormKeep

> Last Updated: 2026-10-05

## Store Listing

**Extension Name** [REQUIRED]
FormKeep - Automatic Form Recovery

**Short Description** [REQUIRED]
<!-- Max 132 characters. Shown in search results and tiles. Be specific about function. -->
Silently saves text as you type into web forms. Restore lost writing with one click if a tab crashes, closes, or submit fails.

**Detailed Description** [REQUIRED]
<!-- Max 16,000 characters. Line 1: One-sentence summary. Paragraph 2: Key features. Paragraph 3: How to use. Paragraph 4: Privacy/permissions note. Paragraph 5: Support info. -->
FormKeep silently protects what you type into web forms, long emails, and post editors so you never lose your writing to a browser crash, closed tab, or failed submission.

Features:
• Automatic Silent Capture: Watches standard text inputs, textareas, and rich contenteditable editors (including Gmail compose and Reddit) and saves debounced local snapshots as you type.
• One-Click Restore: Click any saved snapshot in the popup to restore it directly into your active form field with full undo history intact.
• Context Menu & Shortcut: Right-click any text field and choose "FormKeep: Restore text" or press Alt+Shift+R to recover previous drafts.
• 100% Local Storage: All data is saved inside your browser's private IndexedDB. Zero data leaves your computer.
• Zero Telemetry: No analytics, no tracking SDKs, no external network requests, and no third-party scripts.
• Strict Password Exclusion: Automatically detects and ignores password fields, PIN inputs, 2FA tokens, and sensitive authentication forms.
• Per-Site Toggle: Easily pause FormKeep on any domain with a single click.
• Automated 7-Day Cleanup: Automatically purges snapshots older than your retention setting (default 7 days) once daily to keep your database lean.

How to use FormKeep:
1. Type normally into any form, message box, or editor on the web. FormKeep silently saves snapshots locally after a short pause in typing.
2. If your browser crashes, tab closes, or form submission fails, navigate back to the page.
3. Click the FormKeep icon in your Chrome toolbar (or right-click the field and select "FormKeep: Restore text", or press Alt+Shift+R).
4. Click "Restore" next to your saved snapshot. Your text is immediately placed back into the field.

Privacy & Trust:
FormKeep is open source under the MIT License. It does not use any cloud servers, does not have user accounts, and makes zero outbound network requests. Verify our network activity at any time using Chrome DevTools.

Support & Feedback:
FormKeep is completely free with no paywalls or license keys. If you encounter issues or have suggestions, please visit our open source GitHub repository: https://github.com/CKosick/formkeep

**Category** [REQUIRED]
Productivity

**Single Purpose** [REQUIRED]
Silently saves text typed into web forms and restores it with one click if a page crashes or submission fails.

**Primary Language** [REQUIRED]
English

---

## Graphics & Assets

| Asset | Dimensions | Status | Filename |
|-------|-----------|--------|----------|
| Store Icon [REQUIRED] | 128×128 PNG | ✅ Ready | `icons/icon-128.png` |
| Small Icon | 16×16 PNG | ✅ Ready | `icons/icon-16.png` |
| Medium Icon | 48×48 PNG | ✅ Ready | `icons/icon-48.png` |
| Screenshot 1 [REQUIRED] | 1280×800 | ✅ Ready | `assets/screenshot-1.png` |
| Screenshot 2 [RECOMMENDED] | 1280×800 | ✅ Ready | `assets/screenshot-2.png` |
| Screenshot 3 [RECOMMENDED] | 1280×800 | ✅ Ready | `assets/screenshot-3.png` |

### Screenshot Notes
• Screenshot 1: FormKeep popup showing recent saved drafts grouped by site with one-click restore and per-site toggle.
• Screenshot 2: Form recovery in action on a web form after simulating tab closure.
• Screenshot 3: Settings page showing configurable retention period (1-30 days) and 100% local storage trust indicators.

---

## Permissions Justification

| Permission | Type | Justification |
|------------|------|---------------|
| `storage` | permissions | Required to store user configuration, including per-site enable/disable preferences and retention period settings. |
| `contextMenus` | permissions | Required to provide a right-click "FormKeep: Restore text" action directly inside editable form fields. |
| `alarms` | permissions | Required to schedule daily automated cleanup of snapshots older than the user-configured retention period (default 7 days). |
| `activeTab` | permissions | Required to communicate with the active tab when the user opens the popup or triggers the keyboard shortcut to restore text into the focused field. |
| `http://*/*`, `https://*/*` | content_scripts | Required for the content script to run on web pages where users type forms, articles, and emails to detect typing and restore text when requested. |

---

## Privacy & Data Use

### Data Collection

**Does the extension collect user data?** No

FormKeep does NOT collect, transmit, or share any user data off the device. All data is saved exclusively in the browser's local IndexedDB.

| Data Type | Collected? | Transmitted Off-Device? | Purpose | Shared with Third Parties? |
|-----------|-----------|------------------------|---------|---------------------------|
| Personally identifiable info | No | No | N/A | No |
| Health info | No | No | N/A | No |
| Financial info | No | No | N/A | No |
| Authentication info (Passwords) | No | No | Strictly excluded | No |
| Personal communications | No | No | Stored locally only for recovery | No |
| Location | No | No | N/A | No |
| Web history | No | No | N/A | No |
| User activity | No | No | N/A | No |
| Website content | No | No | N/A | No |

### Data Use Certification
- [x] Data is NOT sold to third parties
- [x] Data is NOT used for purposes unrelated to the extension's core functionality
- [x] Data is NOT used for creditworthiness or lending purposes

---

## Privacy Policy

**Privacy Policy URL** [REQUIRED]
`https://cliff.github.io/formkeep/privacy.html` (Local mirror in `docs/privacy.html` and `PRIVACY.md`)

---

## Distribution

**Visibility**: Public  
**Regions**: All regions  
**Pricing**: Free  

---

## Developer Info

**Publisher Name**: Cliff  
**Contact Email**: support@formkeep.local  
**Homepage URL**: https://github.com/CKosick/formkeep  

---

## Version History

| Version | Date | Changes | Status |
|---------|------|---------|--------|
| 1.0.0 | 2026-10-05 | Initial release of FormKeep Manifest V3. Local IndexedDB storage, one-click restore, context menu, keyboard shortcuts, retention alarms, and password exclusion. | Ready for Submission |
