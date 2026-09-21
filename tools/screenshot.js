// README용 스크린샷 촬영: 진행된 저장 데이터를 넣고 Chrome(헤드리스)으로 게임 화면을 찍는다.
// 사용법: node tools/screenshot.js [출력 폴더(기본 docs)]
// 필요: macOS의 Google Chrome, Node 22 이상 (내장 WebSocket 사용). 설치할 패키지는 없다.
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const G = require('../game.js');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'docs'));
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const PORT = 9333;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 씨앗이 있는 난수: 장비 드롭이 무작위라도 스크린샷이 매번 같게 나오도록 한다
function seeded(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// 봇이 강화를 사면서 플레이한 것처럼 진행시켜 보기 좋은 저장 데이터를 만든다.
// until(s)이 참이 되는 순간에서 멈추고, 전직은 레벨 조건을 채웠을 때만 한다 (불가능한 상태를 만들지 않음).
function makeSave({ until, cls, adv, promoteAdv = true, tokens = 0, prestiges = 0, mastered = [], dex = {}, perks = {}, autoSell = 0, seed = 11 }) {
  G.setRandom(seeded(seed));
  const s = G.createState(0);
  s.autoSell = autoSell;
  s.tokens = tokens;
  s.prestiges = prestiges;
  s.perks = perks;
  Object.assign(s.dex, dex);
  for (const m of mastered) s.mastered[m] = true;
  for (let t = 0; t < 4 * 3600 && !until(s); t++) {
    G.simulate(s, 1);
    for (;;) {
      let best = null, bestCost = Infinity;
      for (const k of G.UPGRADE_KEYS) {
        if (G.canBuy(s, k) && G.upgradeCost(s, k) < bestCost) { best = k; bestCost = G.upgradeCost(s, k); }
      }
      if (!best) break;
      G.buy(s, best);
    }
    if (G.promoStage(s) === 'base') G.promote(s, cls);
    else if (G.promoStage(s) === 'adv' && promoteAdv) G.promote(s, adv);
  }
  s.hp = G.maxHp(s);
  return G.serialize(s, Date.now());
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'goblin-shot-'));
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, 'about:blank',
  ], { stdio: 'ignore' });

  try {
    let target;
    for (let i = 0; i < 50 && !target; i++) {
      await sleep(200);
      try {
        const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
        target = list.find((t) => t.type === 'page');
      } catch (e) { /* Chrome이 아직 준비 중 */ }
    }
    if (!target) throw new Error('Chrome에 연결하지 못했습니다');

    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let id = 0;
    const pending = new Map();
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    };
    const send = (method, params = {}) => new Promise((res) => {
      pending.set(++id, res);
      ws.send(JSON.stringify({ id, method, params }));
    });
    const evalJs = (expression) => send('Runtime.evaluate', { expression, awaitPromise: true });

    // 화면 코드에서 난 오류를 모아 마지막에 알려 준다 (정지 화면만 봐서는 놓치기 쉽다)
    const errors = [];
    const onError = (m) => {
      if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value || a.description).join(' '));
    };
    ws.addEventListener('message', (e) => onError(JSON.parse(e.data)));
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 2, mobile: true });
    const url = 'file://' + path.join(ROOT, 'index.html');

    // 게임은 페이지를 떠날 때 자동 저장하므로, 게임 페이지에서 저장 데이터를 넣으면 덮어써진다.
    // 게임과 무관한 빈 페이지(같은 file:// 저장소)에서 넣은 뒤 게임을 연다.
    const seedPage = 'file://' + path.join(profile, 'seed.html');
    fs.writeFileSync(path.join(profile, 'seed.html'), '<!doctype html><title>seed</title>');

    async function shot(name, save, { tab, scroll, wait = 1800 } = {}) {
      await send('Page.navigate', { url: seedPage });
      await sleep(400);
      await evalJs(`localStorage.setItem('goblin-idle-save-v1', ${JSON.stringify(save)})`);
      await send('Page.navigate', { url });
      await sleep(wait);
      if (tab) { await evalJs(`document.querySelector('[data-go="${tab}"]').click()`); await sleep(500); }
      if (scroll) { await evalJs(`document.querySelector('${scroll}').scrollIntoView()`); await sleep(300); }
      const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 85, captureBeyondViewport: false });
      fs.writeFileSync(path.join(OUT, name + '.jpg'), Buffer.from(r.result.data, 'base64'));
      console.log('저장:', path.join(path.relative(ROOT, OUT), name + '.jpg'));
    }

    // 지역마다 몬스터 색이 바뀌는지 볼 수 있도록 여러 지역을 찍는다
    const mage = { cls: 'mage', adv: 'pyromancer', mastered: ['knight', 'sniper'] };
    await shot('battle', makeSave({ until: (s) => s.stage >= 15, ...mage, tokens: 2 }));        // 어둠의 동굴 보스
    await shot('battle-ice', makeSave({ until: (s) => s.stage >= 33, ...mage, tokens: 4 }));    // 얼음 산맥
    await shot('class', makeSave({ until: (s) => s.level >= 20, ...mage, promoteAdv: false, tokens: 2 }), { tab: 'class' });
    await shot('achievements', makeSave({ until: (s) => s.stage >= 36, ...mage, tokens: 4, prestiges: 1 }), { tab: 'log' });
    await shot('gear', makeSave({ until: (s) => s.stage >= 40, ...mage, tokens: 4, autoSell: -1, seed: 21 }), { tab: 'gear' });
    await shot('shop', makeSave({ until: (s) => s.stage >= 20, ...mage, tokens: 24, perks: { might: 4, greed: 3, vitality: 2, click: 1 } }), { tab: 'shop' });
    await shot('codex', makeSave({
      until: (s) => s.level >= 20, ...mage, tokens: 8, mastered: ['knight', 'sniper', 'necromancer'],
      dex: { knight: { best: 41, kills: 2310, runs: 3 }, sniper: { best: 22, kills: 604, runs: 1 }, necromancer: { best: 57, kills: 5120, runs: 4 } },
    }), { tab: 'class', scroll: '#codex' });
    await shot('prestige', makeSave({ until: (s) => s.stage >= 25, ...mage, tokens: 4 }), { tab: 'prestige' });
    ws.close();
    if (errors.length) { console.error('\n화면 코드 오류:\n' + errors.join('\n')); process.exitCode = 1; }
  } finally {
    const closed = new Promise((res) => chrome.once('exit', res));
    chrome.kill();
    await Promise.race([closed, sleep(3000)]);   // Chrome이 파일을 다 쓰고 끝난 뒤에 임시 폴더를 지운다
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch (e) { /* 임시 폴더라 남아도 무방 */ }
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
