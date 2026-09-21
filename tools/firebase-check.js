// 실제 Firebase 연결 진단: node tools/firebase-check.js
// 게임을 http://localhost 로 열어서 (file:// 에서는 로그인이 안 되므로) 진짜 Firebase SDK를 불러오고,
// 설정이 들어갔는지, 계정 카드가 켜졌는지, Google 로그인을 눌렀을 때 Firebase가 무슨 응답을 주는지 본다.
// 사람이 직접 로그인 창에서 계정을 고르는 단계까지는 자동으로 할 수 없다. 필요: macOS의 Google Chrome, 인터넷.
const http = require('http');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const WEB_PORT = 8765, DEBUG_PORT = 9335;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png', '.json': 'application/json' };

(async () => {
  const server = http.createServer((req, res) => {
    const file = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html'));
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    fs.createReadStream(file).pipe(res);
  }).listen(WEB_PORT);

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'fb-check-'));
  const chrome = spawn(CHROME, ['--headless=new', '--disable-gpu', `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
  const fails = [];
  const errors = [];
  const check = (name, ok, extra) => { console.log((ok ? '  통과  ' : '  실패  ') + name + (extra ? '\n        ' + extra : '')); if (!ok) fails.push(name); };
  try {
    let target;
    for (let i = 0; i < 50 && !target; i++) { await sleep(200); try { target = (await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`)).json()).find((t) => t.type === 'page'); } catch (e) { /* 준비 중 */ } }
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r) => (ws.onopen = r));
    let id = 0; const pend = new Map();
    ws.onmessage = (e) => {
      const m = JSON.parse(e.data);
      if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
      if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value || a.description).join(' '));
    };
    const send = (method, params = {}) => new Promise((r) => { pend.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
    const ev = async (expression) => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.result?.value;
    await send('Runtime.enable'); await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 1, mobile: true });

    console.log('Firebase 설정');
    await send('Page.navigate', { url: `http://localhost:${WEB_PORT}/index.html` });
    await sleep(6000);   // 게임을 열고 Firebase SDK(인터넷)를 불러올 시간
    const cfg = await ev('window.FIREBASE_CONFIG ? JSON.stringify({ projectId: window.FIREBASE_CONFIG.projectId, authDomain: window.FIREBASE_CONFIG.authDomain, hasKey: !!window.FIREBASE_CONFIG.apiKey }) : null');
    check('firebase-config.js에 설정 값이 들어 있다', !!cfg, cfg || '값이 null이에요');
    check('게임 화면이 오류 없이 열린다', errors.length === 0, errors.slice(0, 3).join('\n        '));
    await ev(`document.getElementById('settingsBtn').click()`); await sleep(400);
    const acct = await ev(`document.getElementById('acct').textContent`);
    check('계정 카드에서 "준비 중"이 사라졌다', !!acct && !acct.includes('준비 중'), acct);
    check('Google 연동 버튼만 보인다', (await ev(`document.querySelectorAll('[data-login]').length`)) === 1 && (await ev(`document.querySelectorAll('[data-login="apple"]').length`)) === 0);

    console.log('Firebase 응답 (Google 로그인 시도)');
    // JS의 click()은 '사용자가 누른 것'으로 인정되지 않아 팝업이 막힌다. 실제 마우스 클릭 이벤트를 보낸다.
    const box = JSON.parse(await ev(`(() => { const r = document.querySelector('[data-login="google"]').getBoundingClientRect(); return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 }); })()`));
    for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
      await send('Input.dispatchMouseEvent', { type, x: box.x, y: box.y, button: 'left', buttons: type === 'mousePressed' ? 1 : 0, clickCount: 1 });
    }
    let popup, msg = '';
    const seenUrls = [];   // 로그인 창이 거치는 주소들 (계정 선택 요청이 실렸는지 보려고 모아 둔다)
    for (let i = 0; i < 100 && !popup && !msg; i++) {
      await sleep(100);
      const targets = (await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`)).json()).filter((t) => t.type === 'page');
      for (const t of targets) if (!seenUrls.includes(t.url)) seenUrls.push(t.url);
      popup = targets.find((t) => /firebaseapp\.com\/__\/auth|accounts\.google\.com/.test(t.url));
      msg = await ev(`(document.querySelector('.acct__err') || {}).textContent || ''`);
    }
    if (popup) {
      await sleep(4000);   // 인증 처리 페이지가 구글 로그인 화면으로 넘어갈 시간
      for (const t of (await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`)).json())) if (t.type === 'page' && !seenUrls.includes(t.url)) seenUrls.push(t.url);
      const dec = (u) => { let x = u; for (let i = 0; i < 4; i++) x = decodeURIComponent(x.replace(/\+/g, ' ')); return x; };
      const wantsChooser = seenUrls.some((u) => { try { return /select_account/.test(dec(u)); } catch (e) { return /select_account/.test(u); } });
      check('로그인 창 요청에 "계정 선택(select_account)" 옵션이 실려 있다', wantsChooser, wantsChooser ? '' : '거친 주소: ' + seenUrls.map((u) => u.slice(0, 110)).join(' → '));
      const now = (await (await fetch(`http://127.0.0.1:${DEBUG_PORT}/json`)).json()).filter((t) => t.type === 'page').find((t) => /firebaseapp\.com\/__\/auth|accounts\.google\.com/.test(t.url));
      const url = (now || popup).url;
      console.log('  로그인 창 주소: ' + url.split('?')[0]);
      check('Google 로그인이 켜져 있어서 구글 계정 선택 화면까지 간다 (계정 선택은 사람이 해야 함)', /accounts\.google\.com/.test(url), url.slice(0, 200));
    } else {
      console.log('  Firebase 응답: ' + (msg || '(응답 없음)'));
      check('Google 로그인 창이 열린다', false, msg || '로그인 창도 오류 문구도 나오지 않았어요');
    }
    ws.close();
  } finally {
    const closed = new Promise((r) => chrome.once('exit', r)); chrome.kill(); await Promise.race([closed, sleep(3000)]);
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch (e) { /* 임시 폴더 */ }
    server.close();
  }
  console.log(fails.length ? `\n실패 ${fails.length}개: ${fails.join(', ')}` : '\n모든 진단 통과');
  process.exitCode = fails.length ? 1 : 0;
})();
