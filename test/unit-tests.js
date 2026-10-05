/**
 * FormKeep - Unit Test Suite
 * Comprehensive automated tests for safety heuristics, sanitization, and business logic.
 * Run with: node test/unit-tests.js
 */

const assert = require('assert');

// 1. Re-exportable logic helpers replicating content script algorithms
function isPasswordFieldMock(el) {
  if (!el) return false;

  // Check input type
  if (el.tagName === 'INPUT') {
    const type = (el.type || 'text').toLowerCase();
    if (type === 'password') return true;
    if (['hidden', 'submit', 'button', 'reset', 'file', 'checkbox', 'radio', 'image'].includes(type)) {
      return true;
    }
  }

  // Check autocomplete attributes
  const autocomplete = (el.autocomplete || '').toLowerCase();
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
  const identifier = `${el.id || ''} ${el.name || ''} ${el.placeholder || ''} ${el.ariaLabel || ''}`.toLowerCase();
  const sensitiveRegex = /(?:pass(?:word|phrase)?|pin|secret|cvv|cvc|otp|token|2fa|ssn)/i;
  if (sensitiveRegex.test(identifier)) {
    return true;
  }

  // Check parent form
  if (el.form) {
    const formId = `${el.form.id || ''} ${el.form.name || ''} ${el.form.action || ''}`.toLowerCase();
    if (formId.includes('login') || formId.includes('signin') || formId.includes('auth')) {
      if (identifier.includes('pass') || identifier.includes('code')) {
        return true;
      }
    }
  }

  return false;
}

function isEligibleFieldMock(el) {
  if (!el) return false;
  if (isPasswordFieldMock(el)) return false;

  if (el.isContentEditable) return true;
  if (el.tagName === 'TEXTAREA') return true;
  if (el.tagName === 'INPUT') {
    const type = (el.type || 'text').toLowerCase();
    return ['text', 'search', 'email', 'url', 'tel', 'number'].includes(type);
  }

  return false;
}

function countWords(str) {
  if (!str) return 0;
  const matches = str.trim().match(/\S+/g);
  return matches ? matches.length : 0;
}

function escapeHTML(str) {
  return String(str).replace(/[&<>'"]/g, 
    tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)
  );
}

function formatRelativeTime(timestamp, now = Date.now()) {
  const diff = Math.max(0, now - timestamp);
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return 'Just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// -------------------------------------------------------------
// Test Execution Engine
// -------------------------------------------------------------
let totalTests = 0;
let passedTests = 0;

function it(desc, fn) {
  totalTests++;
  try {
    fn();
    passedTests++;
    console.log(`  ✓ ${desc}`);
  } catch (err) {
    console.error(`  ✗ ${desc}`);
    console.error(`    ${err.message}`);
  }
}

function describe(suiteName, fn) {
  console.log(`\n--- ${suiteName} ---`);
  fn();
}

console.log('====================================================');
console.log('   FormKeep - Comprehensive Unit Test Suite');
console.log('====================================================');

describe('Security & Sensitive Field Exclusion Heuristics', () => {
  it('strictly excludes <input type="password">', () => {
    assert.strictEqual(isPasswordFieldMock({ tagName: 'INPUT', type: 'password' }), true);
    assert.strictEqual(isEligibleFieldMock({ tagName: 'INPUT', type: 'password' }), false);
  });

  it('strictly excludes autocomplete="current-password" and "new-password"', () => {
    assert.strictEqual(isPasswordFieldMock({ tagName: 'INPUT', type: 'text', autocomplete: 'current-password' }), true);
    assert.strictEqual(isPasswordFieldMock({ tagName: 'INPUT', type: 'text', autocomplete: 'new-password' }), true);
  });

  it('strictly excludes one-time codes and 2FA autocomplete', () => {
    assert.strictEqual(isPasswordFieldMock({ tagName: 'INPUT', type: 'text', autocomplete: 'one-time-code' }), true);
  });

  it('strictly excludes credit card numbers, expiration, and CVVs', () => {
    assert.strictEqual(isPasswordFieldMock({ tagName: 'INPUT', type: 'text', autocomplete: 'cc-number' }), true);
    assert.strictEqual(isPasswordFieldMock({ tagName: 'INPUT', type: 'text', autocomplete: 'cc-csc' }), true);
    assert.strictEqual(isPasswordFieldMock({ tagName: 'INPUT', type: 'text', id: 'txt_cvv' }), true);
    assert.strictEqual(isPasswordFieldMock({ tagName: 'INPUT', type: 'text', name: 'card_cvc' }), true);
  });

  it('strictly excludes identifiers containing pin, secret, otp, token, ssn', () => {
    assert.strictEqual(isPasswordFieldMock({ tagName: 'INPUT', type: 'text', name: 'user_pin' }), true);
    assert.strictEqual(isPasswordFieldMock({ tagName: 'INPUT', type: 'text', id: 'client_secret' }), true);
    assert.strictEqual(isPasswordFieldMock({ tagName: 'INPUT', type: 'text', placeholder: 'Enter OTP sent to phone' }), true);
    assert.strictEqual(isPasswordFieldMock({ tagName: 'INPUT', type: 'text', ariaLabel: 'Social Security Number (SSN)' }), true);
  });

  it('strictly excludes sensitive inputs inside login and auth forms', () => {
    const loginForm = { id: 'login-form', action: '/auth/login' };
    assert.strictEqual(isPasswordFieldMock({ tagName: 'INPUT', type: 'text', name: 'auth_code', form: loginForm }), true);
  });

  it('excludes non-text inputs (hidden, submit, button, checkbox, file)', () => {
    assert.strictEqual(isPasswordFieldMock({ tagName: 'INPUT', type: 'hidden' }), true);
    assert.strictEqual(isPasswordFieldMock({ tagName: 'INPUT', type: 'submit' }), true);
    assert.strictEqual(isPasswordFieldMock({ tagName: 'INPUT', type: 'button' }), true);
    assert.strictEqual(isPasswordFieldMock({ tagName: 'INPUT', type: 'file' }), true);
    assert.strictEqual(isPasswordFieldMock({ tagName: 'INPUT', type: 'checkbox' }), true);
  });

  it('allows standard user-facing form inputs and editors', () => {
    assert.strictEqual(isEligibleFieldMock({ tagName: 'TEXTAREA' }), true);
    assert.strictEqual(isEligibleFieldMock({ tagName: 'INPUT', type: 'text', name: 'comments' }), true);
    assert.strictEqual(isEligibleFieldMock({ tagName: 'INPUT', type: 'search', id: 'site_search' }), true);
    assert.strictEqual(isEligibleFieldMock({ tagName: 'INPUT', type: 'email', name: 'contact_email' }), true);
    assert.strictEqual(isEligibleFieldMock({ tagName: 'DIV', isContentEditable: true }), true);
  });
});

describe('Sanitization & Utility Functions', () => {
  it('correctly calculates word counts across edge cases', () => {
    assert.strictEqual(countWords(''), 0);
    assert.strictEqual(countWords('   '), 0);
    assert.strictEqual(countWords('hello world'), 2);
    assert.strictEqual(countWords('  multi \t line \n\n paragraph  words '), 4);
  });

  it('escapes dangerous HTML characters to prevent XSS in UI', () => {
    assert.strictEqual(escapeHTML('<script>alert("xss")</script>'), '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    assert.strictEqual(escapeHTML("Tom & Jerry's"), 'Tom &amp; Jerry&#39;s');
  });

  it('formats relative timestamps accurately', () => {
    const base = 1000000000000;
    assert.strictEqual(formatRelativeTime(base, base + 20000), 'Just now');
    assert.strictEqual(formatRelativeTime(base, base + 120000), '2m ago');
    assert.strictEqual(formatRelativeTime(base, base + 7200000), '2h ago');
    assert.strictEqual(formatRelativeTime(base, base + 172800000), '2d ago');
  });
});

console.log(`\n====================================================`);
console.log(`Results: ${passedTests}/${totalTests} tests passed.`);
console.log('====================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
}
