// 실제 브라우저(헤드리스 Chrome)에서 게임을 눌러 보며 오류와 상태를 점검한다.
// 사용법: node tools/ui-check.js [스크린샷을 저장할 폴더(생략하면 저장 안 함)]
// 탭 공격 모션, 강화·상점 구매(결제 창), 강화 초기화, 도감 창, 10초 전투 안정성, 브라우저 오류를 확인한다.
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const G = require('../game.js');
const ROOT = path.resolve(__dirname, '..');
const OUT = process.argv[2] && path.resolve(process.argv[2]);
if (OUT) fs.mkdirSync(OUT, { recursive: true });
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-'));
  const chrome = spawn(CHROME,
    ['--headless=new', '--disable-gpu', '--allow-file-access-from-files', '--remote-debugging-port=9334', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
  const errors = [], fails = [];
  try {
    let target;
    for (let i = 0; i < 50 && !target; i++) { await sleep(200); try { target = (await (await fetch('http://127.0.0.1:9334/json')).json()).find((t) => t.type === 'page'); } catch (e) {} }
    const ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((r) => (ws.onopen = r));
    let id = 0; const pend = new Map();
    ws.onmessage = (e) => { const m = JSON.parse(e.data);
      if (m.id && pend.has(m.id)) { pend.get(m.id)(m); pend.delete(m.id); }
      if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
      if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value || a.description).join(' ')); };
    const send = (method, params = {}) => new Promise((r) => { pend.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
    const ev = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); return r.result.result?.value; };
    const shot = async (name) => { if (!OUT) return; const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 80 }); fs.writeFileSync(path.join(OUT, name + '.jpg'), Buffer.from(r.result.data, 'base64')); };
    const check = (name, ok, extra = '') => { console.log((ok ? '  통과  ' : '  실패  ') + name + (ok ? '' : '  ' + extra)); if (!ok) fails.push(name); };

    await send('Runtime.enable'); await send('Page.enable');
    await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 1, mobile: true });

    // 저장 데이터: 스테이지 20 근처, 증표 20개, 골드 넉넉히
    const s = G.createState(0); s.tokens = 20; s.gold = 5e4; s.level = 22; s.stage = 21; s.runBest = s.bestStage = 21;
    s.cls = 'mage'; s.adv = 'pyromancer'; s.mastered.pyromancer = true; s.dex.pyromancer = { best: 24, kills: 300, runs: 1 };
    s.hp = G.maxHp(s);
    const save = G.serialize(s, Date.now());
    fs.writeFileSync(path.join(profile, 'seed.html'), '<!doctype html><title>s</title>');
    await send('Page.navigate', { url: 'file://' + path.join(profile, 'seed.html') }); await sleep(300);
    await ev(`localStorage.setItem('goblin-idle-save-v1', ${JSON.stringify(save)})`);
    await send('Page.navigate', { url: 'file://' + ROOT + '/index.html' }); await sleep(1500);

    console.log('탭 공격 모션');
    const before = await ev(`document.getElementById('monsterHpText').textContent`);
    await ev(`(() => { const r = document.getElementById('scene').getBoundingClientRect(); document.getElementById('scene').dispatchEvent(new PointerEvent('pointerdown', { clientX: r.left + r.width*0.68, clientY: r.top + r.height*0.6, bubbles: true, cancelable: true })); })()`);
    await ev(`window.__probe = document.querySelector('#floatLayer .fx')`);
    const fxNow = await ev(`document.querySelectorAll('#floatLayer .fx').length`);
    const heroAnims = await ev(`document.getElementById('hero').getAnimations().length`);
    const monAnims = await ev(`document.getElementById('monster').getAnimations().length`);
    check('탭 직후 이펙트 요소(파문·베기·불꽃·동전)가 생긴다', fxNow >= 3, `fx ${fxNow}개`);
    check('탭 직후 고블린 돌진 애니메이션이 재생된다', heroAnims >= 1, `${heroAnims}개`);
    check('탭 직후 몬스터 피격 애니메이션이 재생된다', monAnims >= 1, `${monAnims}개`);
    await sleep(70); await shot('m1');
    await sleep(110); await shot('m2');
    await sleep(1400);
    check('처음 생긴 이펙트 요소는 끝나면 스스로 사라진다', (await ev(`window.__probe && !document.contains(window.__probe)`)) === true);
    await sleep(900);

    console.log('강화 구매');
    const lvBefore = await ev(`document.querySelector('.up[data-key="weapon"] .lv').textContent`);
    await ev(`document.querySelector('.up[data-key="weapon"] .up__btn').click()`); await sleep(200);
    const lvAfter = await ev(`document.querySelector('.up[data-key="weapon"] .lv').textContent`);
    check('강화 버튼을 누르면 레벨이 오른다', lvBefore !== lvAfter, `${lvBefore} → ${lvAfter}`);

    console.log('상점 구매 (결제 창)');
    await ev(`document.querySelector('[data-go="shop"]').click()`); await sleep(400);
    check('상점 탭이 열린다', await ev(`!document.querySelector('.tab[data-tab="shop"]').hidden`));
    check('쓸 수 있는 증표가 20개로 보인다', (await ev(`document.getElementById('shopTokens').textContent`)) === '20');
    await ev(`document.querySelector('[data-perk="might"]').click()`); await sleep(300);
    check('구매 확인 창이 열린다', await ev(`!document.getElementById('modal').hidden && document.getElementById('modalTitle').textContent === '구매할까요?'`));
    await shot('shopmodal');
    await ev(`document.querySelector('#modalActions .btn--gold').click()`); await sleep(400);
    check('구매하면 용사의 힘이 Lv.1이 된다', (await ev(`document.querySelector('.perk[data-id="might"] .lv').textContent`)).includes('Lv.1'));
    check('증표가 1개 줄어든다', (await ev(`document.getElementById('shopTokens').textContent`)) === '19');
    check('상단 증표 표시도 19개', (await ev(`document.getElementById('tokens').textContent`)) === '19');
    check('잠긴 강화(강타)는 구매 버튼이 없다', (await ev(`!document.querySelector('.perk[data-id="click"] [data-perk]') || document.querySelector('.perk[data-id="click"] [data-perk]').disabled`)));

    // 힘을 3까지 올려 강타를 연다
    for (let i = 0; i < 2; i++) { await ev(`document.querySelector('[data-perk="might"]').click()`); await sleep(150); await ev(`document.querySelector('#modalActions .btn--gold').click()`); await sleep(250); }
    check('힘 Lv.3에서 강타가 열린다', await ev(`!!document.querySelector('.perk[data-id="click"] [data-perk]:not(:disabled)')`));
    await shot('shop2');

    console.log('초기화');
    await ev(`document.getElementById('respecBtn').click()`); await sleep(250);
    await ev(`document.querySelector('#modalActions .btn--blue').click()`); await sleep(350);
    check('초기화하면 증표 20개를 되돌려받는다', (await ev(`document.getElementById('shopTokens').textContent`)) === '20');

    console.log('도감');
    await ev(`document.querySelector('[data-go="class"]').click()`); await sleep(400);
    await ev(`document.querySelector('.dexcard.is-on').click()`); await sleep(300);
    check('도감 카드를 누르면 상세 창이 열린다', await ev(`!document.getElementById('modal').hidden && document.getElementById('modalTitle').textContent === '화염술사'`));
    await shot('dexmodal');
    await ev(`document.querySelector('#modalActions .btn').click()`); await sleep(200);
    await ev(`document.querySelector('.dexcard.is-off').click()`); await sleep(300);
    check('미달성 카드는 힌트 창이 열린다', await ev(`document.getElementById('modalTitle').textContent === '???'`));
    await ev(`document.querySelector('#modalActions .btn').click()`);

    console.log('오래 돌려도 안정적인가 (전투 10초)');
    await ev(`document.querySelector('[data-go="upgrade"]').click()`);
    await sleep(10000);
    check('이펙트 요소가 쌓이지 않는다 (40개 이하)', (await ev(`document.getElementById('floatLayer').children.length`)) <= 40);
    await shot('after10s');
    ws.close();
  } finally {
    const closed = new Promise((r) => chrome.once('exit', r)); chrome.kill(); await Promise.race([closed, sleep(3000)]);
    try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch (e) {}
  }
  console.log('\n브라우저 오류: ' + (errors.length ? '\n' + errors.join('\n') : '없음'));
  console.log(fails.length ? '실패 ' + fails.length + '개: ' + fails.join(', ') : '모든 점검 통과');
  process.exitCode = errors.length || fails.length ? 1 : 0;
})();
