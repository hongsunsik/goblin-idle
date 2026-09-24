// 성능 측정: 헤드리스 Chrome에서 CPU를 느리게(폰 비슷하게) 걸고, 탭마다 몇 초씩 게임을 돌리며 CPU 사용량을 잰다.
// 사용법: node tools/perf.js [초(기본 8)] [CPU 감속 배율(기본 4)]
// 출력: 탭별 스크립트·레이아웃·스타일 계산에 쓴 시간(1초당 ms)과 DOM 노드 수. 1초당 스크립트+레이아웃이 작을수록 폰 배터리·발열에 좋다.
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const G = require('../game.js');
const ROOT = path.resolve(__dirname, '..');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const SECS = +process.argv[2] || 8, SLOW = +process.argv[3] || 4;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 중반 캐릭터: 4차 직업·강화 여러 개·가방에 장비
function midState() {
  const s = G.createState(0);
  s.level = 99999;
  for (const id of ['mage', 'necromancer', 'lich', 'lichking']) G.promote(s, id);
  s.level = 70; s.stage = 85; s.runBest = s.bestStage = 85;
  for (const k of G.UPGRADE_KEYS) s.upgrades[k] = 60;
  s.hp = G.maxHp(s); s.gold = 1e15;
  return s;
}

(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'perf-'));
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', '--allow-file-access-from-files', '--remote-debugging-port=9335', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
  try {
    let target;
    for (let i = 0; i < 50 && !target; i++) { await sleep(200); try { target = (await (await fetch('http://127.0.0.1:9335/json')).json()).find((t) => t.type === 'page'); } catch (e) {} }
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r) => (ws.onopen = r));
    let id = 0; const pend = new Map();
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); } };
    const send = (method, params = {}) => new Promise((r) => { pend.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
    const ev = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true })).result.result?.value;
    await send('Page.enable'); await send('Performance.enable');
    await send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.CLOUD_ADAPTER = null;' });
    await send('Emulation.setDeviceMetricsOverride', { width: 400, height: 860, deviceScaleFactor: 2, mobile: true });
    fs.writeFileSync(path.join(profile, 'seed.html'), '<html></html>');
    await send('Page.navigate', { url: 'file://' + path.join(profile, 'seed.html') }); await sleep(300);
    await ev(`localStorage.setItem('goblin-idle-save-v1', ${JSON.stringify(G.serialize(midState(), Date.now()))})`);
    await send('Page.navigate', { url: 'file://' + ROOT + '/index.html' }); await sleep(2000);
    await send('Emulation.setCPUThrottlingRate', { rate: SLOW });
    const metrics = async () => Object.fromEntries((await send('Performance.getMetrics')).result.metrics.map((m) => [m.name, m.value]));
    console.log(`CPU ${SLOW}배 감속, 탭마다 ${SECS}초 (1초당 ms)`);
    console.log('탭'.padEnd(10) + '스크립트  레이아웃  스타일  전체작업  DOM노드');
    for (const tab of ['upgrade', 'gear', 'class', 'shop', 'store', 'dungeon', 'log', 'prestige']) {
      await ev(`document.querySelector('[data-go="${tab}"]').click()`); await sleep(500);
      const a = await metrics(); await sleep(SECS * 1000); const b = await metrics();
      const per = (k) => (((b[k] - a[k]) * 1000) / SECS).toFixed(0).padStart(6);
      console.log(tab.padEnd(10) + per('ScriptDuration') + '    ' + per('LayoutDuration') + '  ' + per('RecalcStyleDuration') + '    ' + per('TaskDuration') + '   ' + String(b.Nodes).padStart(6));
    }
  } finally { chrome.kill(); }
})();
