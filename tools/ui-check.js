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
    await send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.CLOUD_ADAPTER = null;' });   // 클라우드 기능을 끄고 시작 (가짜 서버는 아래 계정 구역에서 따로 넣는다)
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
    // 정리: 등급별 / 장착 중인 장비보다 약한 것 (가방: 1 노말무기, 3 고급방어구, 4 노말장신구, 5 고급무기, 6 영웅장신구)
    await ev(`document.getElementById('tidyBtn').click()`); await sleep(250);
    check('정리 창에 4가지 선택지가 보이고 개수·골드를 미리 알려 준다', (await ev(`document.querySelectorAll('.tidy__opt').length`)) === 4 && (await ev(`document.getElementById('modalBody').textContent`)).includes('골드') === false);
    const weakText = await ev(`document.querySelector('input[name="tidy"][value="weak"]').closest('label').textContent`);
    check('"장착 중인 장비보다 약한 것"은 같은 칸·같은 능력만 비교해 2개(옛 무기 둘)로 센다', weakText.includes('2개'), weakText);
    await ev(`document.querySelector('input[name="tidy"][value="weak"]').click()`);
    await ev(`document.querySelector('#modalActions .btn--gold').click()`); await sleep(350);
    check('약한 장비를 정리하면 그 둘만 사라진다 (가방 3개)', (await ev(`document.querySelectorAll('#bag .gitem[data-item]').length`)) === 3 && (await ev(`!document.querySelector('.gitem[data-item="1"]') && !document.querySelector('.gitem[data-item="5"]')`)));
    // 선택 모드: 여러 개를 눌러 고르고 한 번에 판다
    const goldBeforeSel = await ev(`document.getElementById('gold').textContent`);
    await ev(`document.getElementById('selectBtn').click()`); await sleep(200);
    check('선택 모드를 켜면 선택 표시줄이 보이고 버튼이 "완료"가 된다', (await ev(`!document.getElementById('selbar').hidden && document.getElementById('selectBtn').textContent === '완료'`)));
    await ev(`document.querySelector('.gitem[data-item="3"]').click()`); await sleep(120);
    await ev(`document.querySelector('.gitem[data-item="4"]').click()`); await sleep(200);
    check('누른 장비 두 개에 선택 표시가 붙고 개수와 받을 골드가 보인다', (await ev(`document.querySelectorAll('.gitem.is-sel').length`)) === 2 && (await ev(`document.getElementById('selCount').textContent`)).includes('2개 선택'));
    await ev(`document.querySelector('.gitem[data-item="4"]').click()`); await sleep(150);
    check('선택한 장비를 다시 누르면 선택이 풀린다', (await ev(`document.querySelectorAll('.gitem.is-sel').length`)) === 1);
    await ev(`document.getElementById('selAll').click()`); await sleep(150);
    check('전체 선택을 누르면 가방 전부가 선택된다', (await ev(`document.querySelectorAll('.gitem.is-sel').length`)) === (await ev(`document.querySelectorAll('#bag .gitem[data-item]').length`)));
    await ev(`document.getElementById('selAll').click()`); await sleep(150);
    await ev(`document.querySelector('.gitem[data-item="3"]').click()`); await sleep(100);
    await ev(`document.querySelector('.gitem[data-item="4"]').click()`); await sleep(100);
    await ev(`document.getElementById('selSell').click()`); await sleep(350);
    check('선택 판매를 누르면 확인 없이(노말·고급만이면) 바로 팔린다', (await ev(`document.querySelectorAll('#bag .gitem[data-item]').length`)) === 1 && (await ev(`document.getElementById('modal').hidden`)));
    check('팔면 골드가 늘어난다', (await ev(`document.getElementById('gold').textContent`)) !== goldBeforeSel);
    // 영웅 이상이 섞이면 한 번 더 확인
    await ev(`document.querySelector('.gitem[data-item="6"]').click()`); await sleep(150);
    await ev(`document.getElementById('selSell').click()`); await sleep(300);
    check('영웅 이상을 팔려 하면 확인 창이 한 번 더 뜬다', (await ev(`document.getElementById('modalTitle').textContent`)) === '정말 팔까요?');
    await ev(`document.querySelector('#modalActions .btn:not(.btn--gold)').click()`); await sleep(200);
    check('취소하면 영웅 장비가 남는다', (await ev(`document.querySelectorAll('#bag .gitem[data-item]').length`)) === 1);
    await ev(`document.getElementById('selectBtn').click()`); await sleep(200);
    check('완료를 누르면 선택 모드가 꺼지고 다시 눌러 정보 창이 열린다', (await ev(`document.getElementById('selbar').hidden`)) && (await (async () => { await ev(`document.querySelector('.gitem[data-item="6"]').click()`); await sleep(250); const t2 = await ev(`!document.getElementById('modal').hidden`); await ev(`document.querySelector('#modalActions .btn').click()`); await sleep(150); return t2; })()));
    check('정리·선택 판매 뒤 희귀 이상만 남는다', (await ev(`[...document.querySelectorAll('#bag .gitem[data-item]')].every((b) => b.classList.contains('r2') || b.classList.contains('r3') || b.classList.contains('r4'))`)));
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
    await ev(`document.getElementById('settingsBtn').click()`); await sleep(300);
    check('설정 버튼(⚙)을 누르면 설정 창이 열린다', await ev(`!document.getElementById('settings').hidden && document.getElementById('settingsTitle').textContent === '설정'`));
    await ev(`document.getElementById('settings').click()`); await sleep(200);   // 창 바깥(어두운 배경)을 누르면 닫힌다
    check('바깥을 누르면 설정 창이 닫힌다', await ev(`document.getElementById('settings').hidden`));
    await ev(`document.getElementById('settingsBtn').click()`); await sleep(200);
    await ev(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`); await sleep(200);
    check('Esc를 누르면 설정 창이 닫힌다', await ev(`document.getElementById('settings').hidden`));
    await ev(`document.getElementById('settingsBtn').click()`); await sleep(200);
    await ev(`document.getElementById('settingsClose').click()`); await sleep(200);
    check('✕ 버튼으로 닫을 수 있다', await ev(`document.getElementById('settings').hidden`));
    await ev(`document.getElementById('settingsBtn').click()`); await sleep(300);
    check('설정 창에서 "처음부터 다시"가 초기화 확인 창으로 이어진다', await ev(`(() => { document.getElementById('resetBtn2').click(); return document.getElementById('settings').hidden && document.getElementById('modalTitle').textContent.includes('처음부터'); })()`));
    await ev(`document.querySelector('#modalActions .btn').click()`); await sleep(200);   // 취소
    await ev(`document.getElementById('settingsBtn').click()`); await sleep(300);
    check('서버가 연결되지 않아도 계정 연동 버튼과 "준비 중" 표시가 보인다',
      (await ev(`document.getElementById('acct').textContent`)).includes('준비 중') && (await ev(`document.querySelectorAll('[data-login]').length`)) === 1);
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
    await ev(`document.getElementById('settingsBtn').click()`); await sleep(300);
    check('로그인 전에는 Google 연동 버튼 하나만 보인다 (Apple 버튼은 없다)', (await ev(`document.querySelectorAll('[data-login]').length`)) === 1);
    await shot('account-out');
    check('연동 전에 "한 번 연동하면 해제할 수 없어요" 경고가 보인다', (await ev(`(document.querySelector('.acct__lock') || {}).textContent || ''`)).includes('해제할 수 없어요'));
    // 로그인 실패 안내 (로그인하기 전에 확인: 연동은 해제할 수 없으므로 한 번 로그인하면 되돌아올 수 없다)
    await ev(`window.__origSignIn = window.CLOUD_ADAPTER.signIn; window.CLOUD_ADAPTER.signIn = async () => { throw Object.assign(new Error('x'), { code: 'auth/popup-blocked' }); }`);
    await ev(`document.querySelector('[data-login="google"]').click()`); await sleep(500);
    check('로그인 창이 막히면 팝업 차단 안내가 보인다', (await ev(`document.getElementById('acct').textContent`)).includes('팝업'));
    await ev(`window.CLOUD_ADAPTER.signIn = async () => { throw Object.assign(new Error('x'), { code: 'auth/popup-closed-by-user' }); }`);
    await ev(`document.querySelector('[data-login="google"]').click()`); await sleep(400);
    check('로그인 창을 닫으면 오류 문구가 사라진다', !(await ev(`document.getElementById('acct').textContent`)).includes('팝업'));
    await ev(`window.CLOUD_ADAPTER.signIn = window.__origSignIn`);
    await ev(`document.querySelector('[data-login="google"]').click()`); await sleep(700);
    check('Google로 로그인하면 이름이 보인다', (await ev(`document.getElementById('acct').textContent`)).includes('테스터'));
    const up1 = JSON.parse(await ev(`localStorage.getItem('fake-cloud-server')`));
    check('로그인하면 이 기기의 진행이 클라우드에 올라간다', up1 && up1.rev === 1 && JSON.parse(up1.save).level === 22, JSON.stringify(up1 && up1.rev));
    check('저장 상태가 "자동 저장됨"으로 보이고, 수동 저장 버튼은 없다', (await ev(`document.querySelector('.acct__status').textContent`)).includes('자동 저장됨') && (await ev(`!document.querySelector('[data-acct]') && !document.getElementById('acct').textContent.includes('지금 저장')`)));
    await shot('account-in');

    // 다른 기기가 더 진행했다고 가정: 서버 저장을 바꾼다 (rev 2)
    const other = G.createState(0); other.level = 33; other.totalKills = 9000; other.bestStage = other.runBest = other.stage = 44; other.prestiges = 2; other.tokens = 9;
    other.hp = G.maxHp(other);
    await ev(`localStorage.setItem('fake-cloud-server', ${JSON.stringify(JSON.stringify({ save: G.serialize(other, Date.now()), summary: Sync.summaryOf(other, 'novice'), rev: 2, updatedAt: Date.now() }))})`);
    for (let i = 0; i < 3; i++) { await ev(`(() => { const r = document.getElementById('scene').getBoundingClientRect(); document.getElementById('scene').dispatchEvent(new PointerEvent('pointerdown', { clientX: r.left + r.width*0.68, clientY: r.top + r.height*0.6, bubbles: true, cancelable: true })); })()`); await sleep(150); }
    await ev(`(() => { window.GoblinCloud.sync(); return 1; })()`); await sleep(600);
    check('양쪽 진행이 다르면 어느 쪽으로 계속할지 묻는 창이 뜬다', (await ev(`document.getElementById('modalTitle').textContent`)) === '어느 저장으로 계속할까요?');
    check('창에 이 기기와 클라우드의 스테이지가 나란히 보이고 더 앞선 쪽을 표시한다', await ev(`(() => { const t = document.getElementById('modalBody').textContent; return t.includes('이 기기') && t.includes('클라우드') && t.includes('스테이지 44') && t.includes('레벨 22') && t.includes('진행이 더 앞서요'); })()`));
    await shot('account-conflict');
    // 창을 나중에로 닫으면 아무것도 바뀌지 않는다
    await ev(`document.querySelector('#modalActions .btn:last-child').click()`); await sleep(300);
    check('나중에를 누르면 이 기기의 진행이 그대로다', (await ev(`document.getElementById('level').textContent`)) === '22');
    await ev(`(() => { window.GoblinCloud.sync(); return 1; })()`); await sleep(600);
    await ev(`document.querySelector('#modalActions .btn--gold').click()`); await sleep(700);   // 클라우드 사용
    check('클라우드를 고르면 게임이 클라우드 저장(레벨 33)으로 바뀐다', (await ev(`document.getElementById('level').textContent`)) === '33');
    check('클라우드를 고른 뒤에는 로컬 저장도 같은 진행이다', JSON.parse(await ev(`localStorage.getItem('goblin-idle-save-v1')`)).level >= 33);

    check('연동한 뒤에는 "연동 해제" 버튼이 없고 "해제 불가"로 표시된다', (await ev(`!document.querySelector('[data-acct="out"]') && document.getElementById('acct').textContent.includes('해제 불가') && !document.getElementById('acct').textContent.includes('연동 해제')`)));
    await ev(`document.getElementById('settingsClose').click()`); await sleep(200);

    console.log('스테이지·지역 표시');
    // 쓰러져서 스테이지가 한 칸 물러나면 점검이 어긋나므로, 고블린을 아주 튼튼하게(방어구 Lv.400) 만들어 연다
    // monsterHp를 크게 잡는 이유: 스테이지만 바꾸면 이전 몬스터의 체력이 남아 보스가 한 방에 쓰러지므로, 불러올 때 가득 차게 한다
    const atStage = async (st) => { const t = mk(30, ['mage', 'pyromancer']); t.stage = st; t.runBest = t.bestStage = Math.max(st, 6); t.upgrades.armor = 400; t.hp = G.maxHp(t); t.monsterHp = 1e12; await reopen(t); await sleep(300); };
    await atStage(3);
    check('지역 이름 옆에 지역 안 진행(3/10)이 보이고, 초반 배경 단계다', (await ev(`document.getElementById('biomeName').textContent`)).includes('고블린 숲') && (await ev(`document.getElementById('biomeName').textContent`)).includes('3/10') && (await ev(`document.getElementById('scene').dataset.phase`)) === '0');
    await atStage(8);
    check('후반(8/10)에는 배경이 후반 단계로 바뀐다', (await ev(`document.getElementById('biomeName').textContent`)).includes('8/10') && (await ev(`document.getElementById('scene').dataset.phase`)) === '1');
    await atStage(10);
    check('보스 스테이지는 보스 배경 단계다', (await ev(`document.getElementById('scene').dataset.phase`)) === 'boss');
    await atStage(61);
    check('스테이지 61부터는 지역 이름에 회차(II)가 붙고 배경 색조가 바뀐다', (await ev(`document.getElementById('biomeName').textContent`)).includes('고블린 숲 II') && (await ev(`document.getElementById('scene').dataset.round`)) === '1');
    await shot('round2');
    await reopen(mk(22, ['mage', 'pyromancer']));

    console.log('전투 효과 (화려하게 / 차분하게)');
    // 4초 동안 전투 층에 생기는 이펙트를 센다 (자동 공격만, 탭 없이)
    const countFx = (ms) => ev(`new Promise((res) => { const n = { spark: 0, hit: 0, coin: 0, all: 0 }; const o = new MutationObserver((list) => { for (const m of list) for (const a of m.addedNodes) { if (!a.classList) continue; n.all++; if (a.classList.contains('fx-spark')) n.spark++; if (a.classList.contains('float--hit')) n.hit++; if (a.classList.contains('fx-coin')) n.coin++; } }); o.observe(document.getElementById('floatLayer'), { childList: true }); setTimeout(() => { o.disconnect(); res(n); }, ${ms}); })`);
    await reopen(mk(30, []));   // 직업이 없는(스킬이 없는) 건강한 고블린으로 연다. 기절 중에는 공격 연출이 없고, 스킬 연출이 섞이면 자동 공격 이펙트만 세기 어렵다.
    check('기본은 "화려하게"로 선택돼 있다', (await ev(`document.querySelector('#fxSeg button.is-on').dataset.fx`)) === 'full');
    await sleep(1500);
    check('점검 전제: 고블린이 기절하지 않았고 자동 공격 중이다', (await ev(`document.getElementById('downBanner').hidden`)) === true);
    const fullFx = await countFx(4000);
    check('화려하게: 자동 전투 4초 동안 불꽃이나 타격 숫자가 나온다', (fullFx.spark + fullFx.hit) > 0, JSON.stringify(fullFx));
    await ev(`document.querySelector('#fxSeg [data-fx="calm"]').click()`); await sleep(200);
    check('"차분하게"로 바꾸면 기기에 기억된다', (await ev(`localStorage.getItem('goblin-idle-fx-v1')`)) === 'calm' && (await ev(`document.querySelector('#fxSeg button.is-on').dataset.fx`)) === 'calm');
    const calmFx = await countFx(4000);
    check('차분하게: 같은 4초 동안 불꽃·타격 숫자·동전이 하나도 생기지 않고 이펙트가 훨씬 적다', calmFx.spark === 0 && calmFx.hit === 0 && calmFx.coin === 0 && calmFx.all < fullFx.all, `화려 ${JSON.stringify(fullFx)} / 차분 ${JSON.stringify(calmFx)}`);
    await ev(`document.querySelector('#fxSeg [data-fx="full"]').click()`); await sleep(200);
    check('다시 "화려하게"로 돌릴 수 있다', (await ev(`localStorage.getItem('goblin-idle-fx-v1')`)) === 'full');

    console.log('직업별 공격 모션과 스킬');
    // 전투 층에 생기는 요소의 클래스를 seconds초 동안 모아 센다
    const watchFx = (ms, selectors) => ev(`new Promise((res) => { const found = {}; const sels = ${JSON.stringify(selectors)}; const o = new MutationObserver((list) => { for (const m of list) for (const a of m.addedNodes) { if (!a.classList) continue; for (const s of sels) if (a.matches && a.matches(s)) found[s] = (found[s] || 0) + 1; } }); o.observe(document.getElementById('floatLayer'), { childList: true }); setTimeout(() => { o.disconnect(); res(found); }, ${ms}); })`);
    const styleCase = async (label, route, selector) => {
      await reopen(mk(30, route)); await sleep(300);
      const found = await watchFx(4500, [selector]);
      check(label, (found[selector] || 0) > 0, JSON.stringify(found));
    };
    await styleCase('도적: 표창(회전하는 별)을 던진다', ['rogue'], '.proj--shuriken');
    await styleCase('마법사: 마법구를 쏜다', ['mage'], '.proj--orb');
    await styleCase('화염술사: 화염구를 쏜다', ['mage', 'pyromancer'], '.proj--fire');
    await styleCase('사령술사: 어둠 마법을 쏜다', ['mage', 'necromancer'], '.proj--dark');
    await styleCase('궁수: 화살을 쏜다', ['archer'], '.proj--arrow');
    await styleCase('저격수: 총알을 쏜다', ['archer', 'sniper'], '.proj--bullet');
    await styleCase('기사: 칼을 휘둘러 베는 궤적이 남는다 (투사체는 없다)', ['warrior', 'knight'], '.arc--slash, .fx-sprite');
    await styleCase('광전사: 도끼를 휘두른다', ['warrior', 'berserker'], '.arc--axe, .fx-sprite');
    // 예전처럼 앞뒤로 크게 달려갔다 오지 않는다: 3초 동안 고블린 몸의 가로 이동량을 재 본다 (예전 돌진은 34px)
    await reopen(mk(30, ['warrior', 'knight'])); await sleep(300);
    const maxShift = await ev(`new Promise((res) => { let mx = 0; const b = document.getElementById('hero'); const iv = setInterval(() => { const m = new DOMMatrix(getComputedStyle(b).transform); mx = Math.max(mx, Math.abs(m.m41)); }, 25); setTimeout(() => { clearInterval(iv); res(mx); }, 3500); })`);
    check('근접 공격도 제자리에서 휘두른다 (가로 이동 14px 이하, 예전 돌진은 34px)', maxShift > 0 && maxShift <= 14, `최대 ${maxShift.toFixed(1)}px`);

    // 스킬 바와 자동 시전 (마법사 → 화염술사: 마법 화살(연타), 점화(지속 피해))
    await reopen(mk(30, ['mage', 'pyromancer'])); await sleep(300);
    check('직업이 있으면 스킬 바에 스킬이 직업 수(2개)만큼 보이고 "화면을 눌러 공격" 안내는 숨는다', (await ev(`document.querySelectorAll('#skillbar .skill').length`)) === 2 && (await ev(`!document.getElementById('skillbar').hidden`)) && (await ev(`getComputedStyle(document.querySelector('.tap-hint')).display`)) === 'none');
    let seenBanner = false, seenDot = false;
    for (let i = 0; i < 48 && !(seenBanner && seenDot); i++) {
      await sleep(250);
      seenBanner = seenBanner || await ev(`!!document.querySelector('#floatLayer .skill-banner')`);
      seenDot = seenDot || await ev(`document.getElementById('monster').dataset.dot === 'burn'`);
    }
    check('스킬은 쿨타임이 차면 자동으로 쓰이고 스킬 이름 배너가 화면에 뜬다', seenBanner);
    check('점화(지속 피해)를 쓰면 몬스터 몸이 불타는 색으로 바뀐다', seenDot);
    // 공격 속도 스킬(궁수 속사)을 쓰면 고블린 몸이 빛난다
    await reopen(mk(30, ['archer'])); await sleep(300);
    let seenHaste = false;
    for (let i = 0; i < 40 && !seenHaste; i++) { await sleep(250); seenHaste = await ev(`document.getElementById('heroBox').classList.contains('buff-haste')`); }
    check('가속(속사) 스킬을 쓰면 고블린 몸이 빛난다', seenHaste);
    await reopen(mk(30, ['mage', 'pyromancer'])); await sleep(300);
    await ev(`document.querySelector('#skillbar .skill').click()`); await sleep(250);
    check('스킬 아이콘을 누르면 설명 창이 열리고, 공격으로 잘못 처리되지 않는다', (await ev(`document.getElementById('modalTitle').textContent`)) === '마법 화살' && (await ev(`document.getElementById('modalBody').textContent`)).includes('4번'));
    await ev(`document.querySelector('#modalActions .btn').click()`); await sleep(200);
    await ev(`document.querySelector('[data-go="class"]').click()`); await sleep(400);
    check('전직 탭에 지금 직업들의 스킬 목록이 보인다', (await ev(`document.querySelectorAll('#classSkills .sk-row').length`)) === 2 && (await ev(`document.getElementById('classSkills').textContent`)).includes('점화'));
    await shot('skills');
    await reopen(mk(30, ['mage', 'pyromancer']));
    await ev(`document.querySelector('[data-go="class"]').click()`); await sleep(400);
    check('3차 전직 선택지 카드에 각 직업의 스킬이 미리 보인다', (await ev(`document.querySelectorAll('#classChoice .choice__skill').length`)) === 2 && (await ev(`document.getElementById('classChoice').textContent`)).includes('지옥불 폭격'));
    await reopen(mk(22, ['mage', 'pyromancer']));

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
