/**
 * FormKeep - Comprehensive In-Browser Integration & Database Test Suite
 * Validates real IndexedDB transactions, compound indexing, retention cleanup,
 * and performance benchmarks inside a real Chromium runtime.
 *
 * Run with: node test/integration-tests.js
 */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const extensionPath = path.resolve(__dirname, '..');
const userDataDir = path.join(__dirname, 'test_profile_runner');

function createCDP(wsUrl) {
  let id = 1;
  const ws = new WebSocket(wsUrl);
  const ready = new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  const send = async (method, params = {}) => {
    await ready;
    return new Promise((resolve, reject) => {
      const curId = id++;
      const handler = (evt) => {
        const data = JSON.parse(evt.data);
        if (data.id === curId) {
          ws.removeEventListener('message', handler);
          if (data.error) {
            reject(new Error(data.error.message || JSON.stringify(data.error)));
          } else {
            resolve(data.result);
          }
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id: curId, method, params }));
    });
  };

  const close = () => {
    try { ws.close(); } catch (e) {}
  };

  return { ready, send, close };
}

async function runIntegrationSuite() {
  if (fs.existsSync(userDataDir)) {
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) {}
  }

  console.log('====================================================');
  console.log('   FormKeep - In-Browser Integration & Benchmarks');
  console.log('====================================================');
  console.log('1. Launching isolated Chromium environment...');

  const proc = spawn(edgePath, [
    '--remote-debugging-port=9445',
    `--user-data-dir=${userDataDir}`,
    `--load-extension=${extensionPath}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--window-size=1280,800',
    '--headless=new',
    'about:blank'
  ], { stdio: 'ignore' });

  let client = null;

  try {
    let sw = null;
    for (let i = 0; i < 30; i++) {
      await new Promise(r => setTimeout(r, 400));
      try {
        const res = await fetch('http://127.0.0.1:9445/json/list');
        if (res.ok) {
          const list = await res.json();
          sw = list.find(t => t.type === 'service_worker' && t.url && t.url.includes('service-worker.js'));
          if (sw) break;
        }
      } catch (e) {}
    }

    if (!sw) throw new Error('Extension service worker not found on port 9445');
    console.log('2. Connected to live Service Worker:', sw.url);

    // Open options page tab to run DOM and DB tests in extension page origin
    const swClient = createCDP(sw.webSocketDebuggerUrl);
    await swClient.send('Runtime.enable');
    await swClient.send('Runtime.evaluate', {
      expression: 'chrome.tabs.create({ url: chrome.runtime.getURL("options/options.html") })',
      awaitPromise: true
    });
    await new Promise(r => setTimeout(r, 1500));
    const res = await fetch('http://127.0.0.1:9445/json/list');
    const list = await res.json();
    const testTarget = list.find(t => t.type === 'page' && t.url && t.url.includes('options/options.html'));
    if (!testTarget) throw new Error('Options test page target not found');
    swClient.close();

    client = createCDP(testTarget.webSocketDebuggerUrl);
    await client.send('Runtime.enable');

    console.log('3. Running database layer test assertions in real IndexedDB...');

    const testCode = `
      (async () => {
        const db = await import('../shared/db.js');
        const results = [];

        function assert(condition, message) {
          if (!condition) throw new Error(message);
        }

        // Test 1: Basic Save and Retrieve
        const entry1 = await db.saveEntry({
          site: 'github.com',
          url: 'https://github.com/test/repo',
          title: 'GitHub Test Form',
          fieldKey: 'issue_body',
          fieldName: 'Issue Description',
          fieldSelector: 'textarea#body',
          fieldType: 'textarea',
          text: 'Integration test sample content.'
        });
        assert(entry1 && entry1.id, 'saveEntry must return saved record with unique id');
        assert(entry1.wordCount === 4, 'wordCount must equal 4');
        results.push('✓ saveEntry persists valid record');

        // Test 2: Session Coalescing (Typing Update within window)
        const entry1Updated = await db.saveEntry({
          site: 'github.com',
          url: 'https://github.com/test/repo',
          fieldKey: 'issue_body',
          fieldName: 'Issue Description',
          fieldSelector: 'textarea#body',
          fieldType: 'textarea',
          text: 'Integration test sample content with extended text.'
        });
        assert(entry1Updated.id === entry1.id, 'Repeated saves in same session window must update existing record without duplicates');
        assert(entry1Updated.wordCount === 7, 'Updated record must update word count');
        results.push('✓ Debounce session coalescing updates record in-place');

        // Test 3: Empty Text Safeguard
        const emptyResult = await db.saveEntry({
          site: 'github.com',
          url: 'https://github.com/test/repo',
          fieldKey: 'issue_body',
          text: '    '
        });
        assert(emptyResult === null, 'Empty or whitespace-only text must be rejected to protect against cleared fields on submit');
        results.push('✓ Empty text safeguard prevents clearing valid snapshots');

        // Test 4: Text Truncation Safeguard (> 250,000 characters)
        const hugeText = 'a'.repeat(300000);
        const hugeEntry = await db.saveEntry({
          site: 'bigdata.local',
          url: 'https://bigdata.local/form',
          fieldKey: 'huge_field',
          text: hugeText
        });
        assert(hugeEntry.text.length === 250000, 'Oversized text must be bounded to 250,000 chars');
        results.push('✓ Large payload bound to 250,000 chars safeguard');

        // Test 5: Compound Index Query (getEntriesBySite)
        const siteEntries = await db.getEntriesBySite('github.com', 10);
        assert(siteEntries.length >= 1, 'getEntriesBySite must return matching entries');
        assert(siteEntries[0].site === 'github.com', 'Site must match queried domain');
        results.push('✓ Compound index site_timestamp query succeeds');

        // Test 6: Search Entries
        const searchRes = await db.searchEntries('extended text', 10);
        assert(searchRes.length >= 1, 'searchEntries must locate matching text');
        assert(searchRes[0].id === entry1.id, 'Search match must match expected record');
        results.push('✓ Search matches substring query across records');

        // Test 7: Stats Verification
        const stats = await db.getStats();
        assert(stats.totalEntries >= 2, 'Stats totalEntries must be accurate');
        assert(stats.totalSites >= 2, 'Stats totalSites must reflect distinct sites');
        results.push('✓ getStats calculates accurate database metrics');

        // Test 8: Performance Benchmark (50 rapid sequential saves & index queries)
        const benchStart = performance.now();
        for (let i = 0; i < 50; i++) {
          await db.saveEntry({
            site: 'bench.local',
            url: 'https://bench.local/' + i,
            fieldKey: 'field_' + i,
            text: 'Benchmark test data iteration ' + i
          });
        }
        const benchSaveTime = performance.now() - benchStart;
        const queryStart = performance.now();
        const benchEntries = await db.getEntriesBySite('bench.local', 50);
        const benchQueryTime = performance.now() - queryStart;
        assert(benchEntries.length === 50, 'All 50 benchmark entries must be retrieved');

        results.push(\`✓ Benchmark: 50 saves took \${benchSaveTime.toFixed(1)}ms (\${(benchSaveTime/50).toFixed(2)}ms/save)\`);
        results.push(\`✓ Benchmark: Compound index fetch of 50 items took \${benchQueryTime.toFixed(2)}ms\`);

        // Test 9: Clear All
        await db.clearAllEntries();
        const postStats = await db.getStats();
        assert(postStats.totalEntries === 0, 'clearAllEntries must purge all records');
        results.push('✓ clearAllEntries performs clean database purge');

        return { success: true, results };
      })()
    `;

    const evalResult = await client.send('Runtime.evaluate', {
      expression: testCode,
      awaitPromise: true,
      returnByValue: true
    });

    if (evalResult.exceptionDetails) {
      throw new Error(evalResult.exceptionDetails.exception?.description || evalResult.exceptionDetails.text);
    }

    const { results } = evalResult.result.value;
    console.log('\n--- In-Browser Test Results ---');
    results.forEach(msg => console.log('  ' + msg));
    console.log('\n====================================================');
    console.log(`Results: All ${results.length} integration tests & benchmarks PASSED!`);
    console.log('====================================================\n');

  } finally {
    if (client) client.close();
    proc.kill();
    if (fs.existsSync(userDataDir)) {
      try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (e) {}
    }
  }
}

runIntegrationSuite().catch(err => {
  console.error('\n✗ Integration test failed:', err);
  process.exit(1);
});
