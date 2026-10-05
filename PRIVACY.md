# Privacy Policy for FormKeep

**Last Updated:** October 5, 2026  
**Effective Date:** October 5, 2026  

FormKeep is built on a simple premise: **Trust is our product.**

We believe software that assists you with typing and writing should respect your privacy unconditionally. FormKeep is 100% private, 100% local, and contains zero tracking code.

---

## 1. Zero Data Collection & Zero Telemetry

- **No Remote Servers:** FormKeep has no backend servers, databases, or cloud infrastructure.
- **Zero Telemetry / Analytics:** FormKeep contains no Google Analytics, Sentry, Mixpanel, Segment, or any other tracking, monitoring, or advertising SDKs.
- **No Outbound Network Requests:** FormKeep makes zero network requests (`fetch`, `XMLHttpRequest`, or WebSockets). You can inspect this at any time in the Chrome DevTools Network panel.
- **No User Accounts:** You do not need to log in, register, or provide an email address to use FormKeep.

---

## 2. What We Store & Where It Stays

All form recovery history captured by FormKeep is stored **exclusively on your local computer** within your browser's private `IndexedDB` storage:

- **Captured Content:** FormKeep silently saves debounced snapshots of text that you type into standard HTML inputs, textareas, and rich-text editors (`contenteditable`).
- **Metadata:** Along with your text snapshot, FormKeep stores the webpage title, URL domain, field name/identifier, and timestamp so you can identify and restore the exact text you need.
- **Local Isolation:** Form recovery data is isolated within the extension's private security origin. Websites you browse cannot inspect or read your FormKeep history.

---

## 3. Strict Password & Sensitive Field Exclusion

FormKeep enforces strict, automatic safeguards to prevent sensitive credentials from ever being saved:

- FormKeep **never captures or stores** input from `<input type="password">` fields.
- FormKeep explicitly detects and ignores fields with authentication or security attributes, including `current-password`, `new-password`, `one-time-code`, `cc-csc`, security PINs, 2FA codes, and authentication tokens.

---

## 4. Retention & User Control

- **Automatic Cleanup:** By default, FormKeep automatically purges form history older than 7 days once daily.
- **Configurable Retention:** You can change your retention period to 1 day, 3 days, 7 days, 14 days, or 30 days in the extension Settings.
- **Per-Site Disable:** You can disable FormKeep on any domain using the one-click toggle in the extension popup or the Settings page. FormKeep will never capture or store text on disabled domains.
- **Individual Deletion:** You can delete individual text snapshots directly from the popup.
- **Complete Erasure:** You can wipe your entire FormKeep history at any time with the "Clear All Data" button in Settings.

---

## 5. Third-Party Sharing

FormKeep **does not sell, rent, transfer, or share** your data with any third party under any circumstances. Since no data leaves your computer, there is no data to share.

---

## 6. Open Source Verification

FormKeep is open source under the MIT License. Anyone can audit the complete codebase on GitHub to verify our security and privacy claims.

---

## 7. Contact & Inquiries

If you have questions about FormKeep's privacy architecture or wish to report an issue, please contact us:

- **GitHub Issues:** [https://github.com/CKosick/formkeep/issues](https://github.com/CKosick/formkeep/issues)
- **Email:** support@formkeep.local
