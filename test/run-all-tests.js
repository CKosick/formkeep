/**
 * FormKeep - Master Test Runner
 * Executes both Unit Tests and In-Browser Integration & Performance Benchmark Tests.
 * Usage: node test/run-all-tests.js
 */

const { execSync } = require('child_process');
const path = require('path');

console.log('>>> Running Suite 1: Security & Logic Unit Tests...\n');
try {
  execSync('node ' + path.join(__dirname, 'unit-tests.js'), { stdio: 'inherit' });
} catch (err) {
  console.error('Unit tests failed.');
  process.exit(1);
}

console.log('\n>>> Running Suite 2: Chromium IndexedDB & Performance Benchmarks...\n');
try {
  execSync('node ' + path.join(__dirname, 'integration-tests.js'), { stdio: 'inherit' });
} catch (err) {
  console.error('Integration tests failed.');
  process.exit(1);
}

console.log('🎉 ALL TEST SUITES PASSED CLEANLY!\n');
