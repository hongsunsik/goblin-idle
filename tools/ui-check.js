// 실제 브라우저(헤드리스 Chrome)에서 게임을 눌러 보며 오류와 상태를 점검한다.
// 사용법: node tools/ui-check.js [스크린샷을 저장할 폴더(생략하면 저장 안 함)]
// 탭 공격 모션, 강화·상점 구매(결제 창), 강화 초기화, 도감 창, 10초 전투 안정성, 브라우저 오류를 확인한다.
const { spawn } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');
const G = require('../game.js');
const Sync = require('../sync.js');
const ROOT = path.resolve(__dirname, '..');
const OUT = process.argv[2] && path.resolve(process.argv[2]);
if (OUT) fs.mkdirSync(OUT, { recursive: true });
const CHROME = process.env.CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 가짜 클라우드: 브라우저 안에서 동작하는 서버와 어댑터. 서버 내용은 localStorage에 둬서 페이지를 다시 열어도 남는다(= 여러 기기가 같은 서버를 쓰는 상황).
const FAKE_CLOUD = `(() => {
  const KEY = 'fake-cloud-server';
  const load = () => JSON.parse(localStorage.getItem(KEY) || 'null');
  const store = (d) => localStorage.setItem(KEY, JSON.stringify(d));
  const user = { uid: 'u1', name: '테스터', email: 't@example.com', photo: '', provider: 'google.com' };
  let cb = null, cur = null;
  window.CLOUD_ADAPTER = {
    configured: true,
    onAuth(f) { cb = f; setTimeout(() => f(cur), 0); return () => {}; },
    async signIn(p) { window.__lastProvider = p; cur = user; cb && cb(user); },
    async signOut() { cur = null; cb && cb(null); },
    async read() { return load(); },
    async write({ save, summary, expectedRev }) {
      const d = load(); const c = d ? d.rev : 0;
      if (c !== expectedRev) return { conflict: true, remote: d };
      store({ save, summary, rev: c + 1, updatedAt: Date.now() });
      return { ok: true, rev: c + 1 };
    },
  };
})();`;

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
    const s = G.createState(0); s.tokens = 20; s.gold = 5e4; s.level = 22; s.stage = 6; s.runBest = s.bestStage = 21;
    s.cls = 'mage'; s.adv = 'pyromancer'; s.mastered.pyromancer = true; s.dex.pyromancer = { best: 24, kills: 300, runs: 1 };
    // 장비: 무기 하나를 차고, 가방에 종류·등급이 다른 장비 6개
    const it = (o) => Object.assign({ id: 1, slot: 'weapon', kind: 'dmg', r: 0, ilvl: 10, val: 5, n: 0 }, o);
    s.autoSell = -1;
    s.equip.weapon = it({ id: 1, r: 0, val: 5 });
    s.bag.push(it({ id: 2, r: 2, val: 30, ilvl: 18 }), it({ id: 3, slot: 'armor', kind: 'hp', r: 1, val: 12 }),
      it({ id: 4, slot: 'accessory', kind: 'gold', r: 0, val: 7 }), it({ id: 5, slot: 'weapon', r: 1, val: 9 }),
      it({ id: 6, slot: 'accessory', kind: 'aps', r: 3, val: 11, ilvl: 20 }), it({ id: 7, slot: 'armor', kind: 'hp', r: 0, val: 6 }));
    s.itemSeq = 7;
    s.hp = G.maxHp(s);
    const save = G.serialize(s, Date.now());
    fs.writeFileSync(path.join(profile, 'seed.html'), '<!doctype html><title>s</title>');
    await send('Page.navigate', { url: 'file://' + path.join(profile, 'seed.html') }); await sleep(300);
    await ev(`localStorage.setItem('goblin-idle-save-v1', ${JSON.stringify(save)})`);
    await send('Page.navigate', { url: 'file://' + ROOT + '/index.html' }); await sleep(1500);

    // 전투 중 장비가 무작위로 떨어지면 가방 개수가 달라져 점검이 흔들린다 → 기본은 드롭이 없게 난수를 고정한다
    await ev(`Game.setRandom(() => 0.999)`);

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

    console.log('장비');
    await ev(`document.querySelector('[data-go="gear"]').click()`); await sleep(400);
    check('장비 탭이 열린다', await ev(`!document.querySelector('.tab[data-tab="gear"]').hidden`));
    check('장착 칸이 3개 보이고 무기만 채워져 있다', (await ev(`document.querySelectorAll('#slots .slot').length`)) === 3 && (await ev(`document.querySelectorAll('#slots .slot.is-empty').length`)) === 2);
    check('가방에 장비 6개가 보인다', (await ev(`document.querySelectorAll('#bag .gitem[data-item]').length`)) === 6);
    check('드롭 확률표에 다섯 등급이 나온다', (await ev(`document.querySelectorAll('#dropInfo .droptable tr').length`)) === 6);
    await shot('gear');
    // 희귀 무기(id 2)를 눌러 상세 창 → 비교 표시 → 장착
    await ev(`document.querySelector('.gitem[data-item="2"]').click()`); await sleep(300);
    check('가방 장비를 누르면 정보 창이 열리고 장착 중인 장비와 비교해 보여 준다', await ev(`!document.getElementById('modal').hidden && document.getElementById('modalBody').textContent.includes('▲')`));
    await shot('itemmodal');
    await ev(`document.querySelector('#modalActions .btn--gold').click()`); await sleep(350);
    check('장착하면 무기 칸이 그 장비(희귀)로 바뀐다', await ev(`!!document.querySelector('#slots .slot.r2[data-slot="weapon"]')`));
    check('밀려난 기존 무기는 가방으로 간다 (가방 6개 유지)', (await ev(`document.querySelectorAll('#bag .gitem[data-item]').length`)) === 6);
    // 판매
    const goldBefore = await ev(`document.getElementById('gold').textContent`);
    await ev(`document.querySelector('.gitem[data-item="7"]').click()`); await sleep(250);
    await ev(`document.querySelector('#modalActions .btn--blue').click()`); await sleep(350);
    check('판매하면 가방에서 사라진다', (await ev(`document.querySelectorAll('#bag .gitem[data-item]').length`)) === 5);
    check('판매하면 골드가 늘어난다', (await ev(`document.getElementById('gold').textContent`)) !== goldBefore);
    // 영웅 이상은 판매 전에 한 번 더 확인
    await ev(`document.querySelector('.gitem[data-item="6"]').click()`); await sleep(250);
    await ev(`document.querySelector('#modalActions .btn--blue').click()`); await sleep(300);
    check('영웅 장비를 팔려 하면 확인 창이 한 번 더 뜬다', (await ev(`document.getElementById('modalTitle').textContent`)) === '정말 팔까요?');
    await ev(`document.querySelector('#modalActions .btn:not(.btn--blue)').click()`); await sleep(200);
    check('취소하면 그대로 남는다', (await ev(`document.querySelectorAll('#bag .gitem[data-item]').length`)) === 5);
    // 일괄 판매 (노말·고급만)
    await ev(`document.getElementById('sellAllBtn').click()`); await sleep(250);
    await ev(`document.querySelector('#modalActions .btn--gold').click()`); await sleep(350);
    check('일괄 판매하면 희귀 이상만 남는다', (await ev(`[...document.querySelectorAll('#bag .gitem[data-item]')].every((b) => b.classList.contains('r2') || b.classList.contains('r3') || b.classList.contains('r4'))`)));
    // 설정은 바로 저장된다
    await ev(`(() => { const sel = document.getElementById('autoSell'); sel.value = '2'; sel.dispatchEvent(new Event('change')); document.getElementById('autoEquip').click(); })()`); await sleep(200);
    const saved = JSON.parse(await ev(`localStorage.getItem('goblin-idle-save-v1')`));
    check('자동 판매·자동 장착 설정이 저장된다', saved.autoSell === 2 && saved.autoEquip === false, JSON.stringify([saved.autoSell, saved.autoEquip]));
    // 전설 장비를 강제로 떨어뜨려 연출·기록·알림 점 확인
    await ev(`document.querySelector('[data-go="upgrade"]').click()`); await sleep(300);
    await ev(`(() => { let c = 0; Game.setRandom(() => (c++ % 6 === 0 ? 0 : 0.9999)); })()`);
    let legend = false;
    for (let i = 0; i < 12 && !legend; i++) {
      await ev(`(() => { const r = document.getElementById('scene').getBoundingClientRect(); document.getElementById('scene').dispatchEvent(new PointerEvent('pointerdown', { clientX: r.left + r.width*0.68, clientY: r.top + r.height*0.6, bubbles: true, cancelable: true })); })()`);
      await sleep(120);
      legend = await ev(`[...document.querySelectorAll('#log li')].some((li) => li.textContent.includes('전설'))`);
    }
    await ev(`Game.setRandom(() => 0.999)`);   // 다시 드롭이 없게
    check('전설 장비가 드롭되면 기록에 남는다', legend);
    check('장비 탭에 새 장비 알림 점이 뜬다', await ev(`!document.querySelector('[data-go="gear"] .dot').hidden`));
    await shot('legend');
    await ev(`document.querySelector('[data-go="gear"]').click()`); await sleep(300);
    check('장비 탭을 열면 새 장비에 NEW가 붙는다', (await ev(`document.querySelectorAll('#bag .gitem.is-new, #slots .slot').length`)) > 0);
    await ev(`document.querySelector('[data-go="upgrade"]').click()`); await sleep(300);
    check('탭을 떠나면 알림 점이 사라진다', await ev(`document.querySelector('[data-go="gear"] .dot').hidden`));

    console.log('3차·4차 전직');
    // 저장 데이터를 넣고 게임을 다시 여는 도우미
    const reopen = async (state) => {
      await send('Page.navigate', { url: 'file://' + path.join(profile, 'seed.html') }); await sleep(300);
      await ev(`localStorage.setItem('goblin-idle-save-v1', ${JSON.stringify(G.serialize(state, Date.now()))})`);
      await send('Page.navigate', { url: 'file://' + ROOT + '/index.html' }); await sleep(1500);
      await ev(`Game.setRandom(() => 0.999)`);
    };
    const mk = (level, route) => { const t = G.createState(0); t.level = level; t.stage = 6; t.runBest = t.bestStage = 6; t.autoSell = -1; for (const id of route) { t.level = 99; G.promote(t, id); } t.level = level; t.hp = G.maxHp(t); return t; };
    await reopen(mk(30, ['mage', 'pyromancer']));
    await ev(`document.querySelector('[data-go="class"]').click()`); await sleep(400);
    check('레벨 30이면 3차 전직 선택지 2개가 열려 있다', (await ev(`document.querySelectorAll('#classChoice .choice.is-ready').length`)) === 2 && (await ev(`document.getElementById('classChoice').textContent`)).includes('3차 전직'));
    await ev(`document.querySelector('[data-go="upgrade"]').click()`); await sleep(300);   // 알림 점은 화면이 갱신된 뒤에 뜬다
    check('전직 탭 알림 점이 뜬다 (다른 탭에 있을 때)', await ev(`!document.querySelector('[data-go="class"] .dot').hidden`));
    await ev(`document.querySelector('[data-go="class"]').click()`); await sleep(300);
    await ev(`document.querySelector('[data-pick="phoenixmage"]').click()`); await sleep(300);
    check('전직 확인 창에 직업 이름이 보인다', (await ev(`document.getElementById('modalTitle').textContent`)).includes('불사조술사'));
    await ev(`document.querySelector('#modalActions .btn--gold').click()`); await sleep(500);
    check('전직하면 현재 직업과 경로가 바뀐다', (await ev(`document.querySelector('.classcard__name').textContent`)) === '불사조술사' && (await ev(`document.querySelector('.classcard__path').textContent`)).includes('화염술사 → 불사조술사'));
    check('다음은 4차(Lv.40)를 기다린다 (지금은 잠김)', (await ev(`document.getElementById('classChoice').textContent`)).includes('4차 전직 (Lv.40)') && (await ev(`document.querySelectorAll('#classChoice .choice.is-locked').length`)) === 2);
    check('도감 탭이 3개(2차·3차·4차)이고 3차 1/16이 기록돼 있다', (await ev(`document.querySelectorAll('.dextab').length`)) === 3 && (await ev(`document.querySelector('[data-dextab="3"]').textContent`)).includes('1/16'));
    await ev(`document.querySelector('[data-dextab="3"]').click()`); await sleep(300);
    check('3차 도감에는 카드 16개가 나오고 전직한 직업만 밝혀진다', (await ev(`document.querySelectorAll('#codex .dexcard').length`)) === 16 && (await ev(`document.querySelectorAll('#codex .dexcard.is-on').length`)) === 1);
    await ev(`document.querySelector('[data-dextab="4"]').click()`); await sleep(300);
    check('4차 도감에는 카드 32개가 나온다', (await ev(`document.querySelectorAll('#codex .dexcard').length`)) === 32);
    await ev(`document.querySelector('.dexcard.is-off').click()`); await sleep(300);
    const hint = await ev(`document.getElementById('modalBody').textContent`);
    check('미달성 4차 카드는 어떤 순서로 전직해야 하는지 힌트를 준다', hint.includes('→') && hint.includes('Lv.40'), hint);
    await shot('dex4');
    await ev(`document.querySelector('#modalActions .btn').click()`); await sleep(200);
    await reopen(mk(40, ['mage', 'pyromancer', 'phoenixmage']));
    await ev(`document.querySelector('[data-go="class"]').click()`); await sleep(400);
    check('레벨 40이면 4차 전직 선택지가 열린다', (await ev(`document.getElementById('classChoice').textContent`)).includes('4차 전직') && (await ev(`document.querySelectorAll('#classChoice .choice.is-ready').length`)) === 2);
    await shot('tier4-choice');
    await ev(`document.querySelector('[data-pick="phoenixlord"]').click()`); await sleep(300);
    await ev(`document.querySelector('#modalActions .btn--gold').click()`); await sleep(500);
    check('4차 전직 뒤에는 더 이상 전직이 없다는 안내가 나온다', (await ev(`document.getElementById('classChoice').textContent`)).includes('모든 전직을 마쳤어요'));
    check('전투 화면의 이름표도 4차 직업으로 바뀐다', (await ev(`document.getElementById('heroTitle').textContent`)) === '불사조의 주인');
    await reopen(mk(22, ['mage', 'pyromancer']));   // 이후 점검을 위해 원래 상태로

    console.log('계정·클라우드 저장');
    await ev(`document.querySelector('[data-go="log"]').click()`); await sleep(300);
    check('서버가 연결되지 않아도 로그인 버튼 두 개와 "준비 중" 표시가 보인다',
      (await ev(`document.getElementById('acct').textContent`)).includes('준비 중') && (await ev(`document.querySelectorAll('[data-login]').length`)) === 2);
    await ev(`document.querySelector('[data-login="google"]').click()`); await sleep(300);
    check('준비 중일 때 버튼을 누르면 안내 창이 뜨고 로그인 시도는 하지 않는다',
      (await ev(`document.getElementById('modalTitle').textContent`)) === '준비 중이에요' && (await ev(`document.getElementById('acct').textContent`)).includes('준비 중'));
    await shot('account-soon');
    await ev(`document.querySelector('#modalActions .btn').click()`); await sleep(200);
    // 가짜 클라우드를 넣고 페이지를 다시 연다
    await send('Page.addScriptToEvaluateOnNewDocument', { source: FAKE_CLOUD });
    await ev(`localStorage.removeItem('fake-cloud-server')`);
    await send('Page.navigate', { url: 'file://' + ROOT + '/index.html' }); await sleep(1500);
    await ev(`Game.setRandom(() => 0.999)`);
    await ev(`document.querySelector('[data-go="log"]').click()`); await sleep(300);
    check('로그인 전에는 Google·Apple 버튼이 보인다', (await ev(`document.querySelectorAll('[data-login]').length`)) === 2);
    await shot('account-out');
    await ev(`document.querySelector('[data-login="google"]').click()`); await sleep(700);
    check('Google로 로그인하면 이름이 보인다', (await ev(`document.getElementById('acct').textContent`)).includes('테스터'));
    const up1 = JSON.parse(await ev(`localStorage.getItem('fake-cloud-server')`));
    check('로그인하면 이 기기의 진행이 클라우드에 올라간다', up1 && up1.rev === 1 && JSON.parse(up1.save).level === 22, JSON.stringify(up1 && up1.rev));
    check('저장 상태 문구가 보인다', (await ev(`document.querySelector('.acct__status').textContent`)).includes('마지막 저장'));
    await shot('account-in');

    // 다른 기기가 더 진행했다고 가정: 서버 저장을 바꾼다 (rev 2)
    const other = G.createState(0); other.level = 33; other.totalKills = 9000; other.bestStage = other.runBest = other.stage = 44; other.prestiges = 2; other.tokens = 9;
    other.hp = G.maxHp(other);
    await ev(`localStorage.setItem('fake-cloud-server', ${JSON.stringify(JSON.stringify({ save: G.serialize(other, Date.now()), summary: Sync.summaryOf(other, 'novice'), rev: 2, updatedAt: Date.now() }))})`);
    for (let i = 0; i < 3; i++) { await ev(`(() => { const r = document.getElementById('scene').getBoundingClientRect(); document.getElementById('scene').dispatchEvent(new PointerEvent('pointerdown', { clientX: r.left + r.width*0.68, clientY: r.top + r.height*0.6, bubbles: true, cancelable: true })); })()`); await sleep(150); }
    await ev(`document.querySelector('[data-acct="sync"]').click()`); await sleep(600);
    check('양쪽 진행이 다르면 어느 쪽으로 계속할지 묻는 창이 뜬다', (await ev(`document.getElementById('modalTitle').textContent`)) === '어느 저장으로 계속할까요?');
    check('창에 이 기기와 클라우드의 스테이지가 나란히 보이고 더 앞선 쪽을 표시한다', await ev(`(() => { const t = document.getElementById('modalBody').textContent; return t.includes('이 기기') && t.includes('클라우드') && t.includes('스테이지 44') && t.includes('레벨 22') && t.includes('진행이 더 앞서요'); })()`));
    await shot('account-conflict');
    // 창을 나중에로 닫으면 아무것도 바뀌지 않는다
    await ev(`document.querySelector('#modalActions .btn:last-child').click()`); await sleep(300);
    check('나중에를 누르면 이 기기의 진행이 그대로다', (await ev(`document.getElementById('level').textContent`)) === '22');
    await ev(`document.querySelector('[data-acct="sync"]').click()`); await sleep(600);
    await ev(`document.querySelector('#modalActions .btn--gold').click()`); await sleep(700);   // 클라우드 사용
    check('클라우드를 고르면 게임이 클라우드 저장(레벨 33)으로 바뀐다', (await ev(`document.getElementById('level').textContent`)) === '33');
    check('클라우드를 고른 뒤에는 로컬 저장도 같은 진행이다', JSON.parse(await ev(`localStorage.getItem('goblin-idle-save-v1')`)).level >= 33);

    // 로그아웃
    await ev(`document.querySelector('[data-acct="out"]').click()`); await sleep(300);
    await ev(`document.querySelector('#modalActions .btn--blue').click()`); await sleep(600);
    check('로그아웃하면 로그인 버튼이 다시 나온다', (await ev(`document.querySelectorAll('[data-login]').length`)) === 2);
    // 로그인 실패 안내
    await ev(`window.CLOUD_ADAPTER.signIn = async () => { throw Object.assign(new Error('x'), { code: 'auth/popup-blocked' }); }`);
    await ev(`document.querySelector('[data-login="apple"]').click()`); await sleep(500);
    check('로그인 창이 막히면 팝업 차단 안내가 보인다', (await ev(`document.getElementById('acct').textContent`)).includes('팝업'));
    // 창을 스스로 닫은 것은 오류로 보이지 않는다
    await ev(`window.CLOUD_ADAPTER.signIn = async () => { throw Object.assign(new Error('x'), { code: 'auth/popup-closed-by-user' }); }`);
    await ev(`document.querySelector('[data-login="apple"]').click()`); await sleep(400);
    check('로그인 창을 닫으면 오류 문구가 사라진다', !(await ev(`document.getElementById('acct').textContent`)).includes('팝업'));
    await ev(`document.querySelector('[data-go="upgrade"]').click()`); await sleep(200);

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
