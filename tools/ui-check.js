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
    // 친선 랭킹·서버 출석 (서버 규칙은 흉내 내지 않고, 화면이 올바르게 부르는지만 본다)
    async rankSubmit(e) { const d = JSON.parse(localStorage.getItem('fake-ranks') || '{}'); d[user.uid] = e; localStorage.setItem('fake-ranks', JSON.stringify(d)); },
    async rankTop(field, n) {
      const d = Object.assign({ x1: { name: '고수', best: 120, tokens: 300, ach: 60, prestiges: 30, level: 90, look: 'mage' }, x2: { name: '뉴비', best: 12, tokens: 0, ach: 3, prestiges: 0, level: 8, look: 'novice' } }, JSON.parse(localStorage.getItem('fake-ranks') || '{}'));
      return Object.keys(d).map((k) => Object.assign({ me: k === user.uid }, d[k])).sort((a, b) => b[field] - a[field]).slice(0, n);
    },
    async rankRemove() { const d = JSON.parse(localStorage.getItem('fake-ranks') || '{}'); delete d[user.uid]; localStorage.setItem('fake-ranks', JSON.stringify(d)); },
    async attendGet() { return JSON.parse(localStorage.getItem('fake-attend') || 'null'); },
    async attendCheckIn(today) {
      const prev = JSON.parse(localStorage.getItem('fake-attend') || 'null');
      const next = window.GoblinSocial.nextAttend(prev, today);
      if (!next) return { already: true, rec: prev };
      localStorage.setItem('fake-attend', JSON.stringify(next));
      return { ok: true, rec: next };
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
    await send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.CLOUD_ADAPTER = null; Math.random = () => 0.999;' });   // 클라우드 기능을 끄고 시작 (가짜 서버는 아래 계정 구역에서 따로 넣는다)
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
    check('드롭 확률표에 일곱 등급(노말~신화)이 나온다', (await ev(`document.querySelectorAll('#dropInfo .droptable tr').length`)) === 8 && (await ev(`document.getElementById('dropInfo').textContent`)).includes('신화') && (await ev(`document.getElementById('dropInfo').textContent`)).includes('유니크'));
    check('자동 판매 선택지에 영웅 이하·전설 이하가 있다', (await ev(`[...document.querySelectorAll('#autoSell option')].map((o) => o.value).join(',')`)) === '-1,0,1,2,3,4');
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
    check('정리 창에 6가지 선택지(등급 5 + 약한 장비)가 보이고 개수·골드를 미리 알려 준다', (await ev(`document.querySelectorAll('.tidy__opt').length`)) === 6 && (await ev(`document.getElementById('modalBody').textContent`)).includes('골드') === false);
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

    console.log('3~5차 전직·초월');
    // 저장 데이터를 넣고 게임을 다시 여는 도우미
    const reopen = async (state) => {
      await send('Page.navigate', { url: 'file://' + path.join(profile, 'seed.html') }); await sleep(300);
      await ev(`localStorage.setItem('goblin-idle-save-v1', ${JSON.stringify(G.serialize(state, Date.now()))})`);
      await send('Page.navigate', { url: 'file://' + ROOT + '/index.html' }); await sleep(1500);
      await ev(`Game.setRandom(() => 0.999)`);
    };
    const mk = (level, route) => { const t = G.createState(0); t.level = level; t.stage = 6; t.runBest = t.bestStage = 6; t.autoSell = -1; for (const id of route) { t.level = 99999; G.promote(t, id); } t.level = level; t.hp = G.maxHp(t); return t; };
    const LV3 = G.PROMO_LEVEL.adv3, LV4 = G.PROMO_LEVEL.adv4, LV5 = G.PROMO_LEVEL.adv5;
    await reopen(mk(LV3, ['mage', 'pyromancer']));
    await ev(`document.querySelector('[data-go="class"]').click()`); await sleep(400);
    check('3차 전직 레벨이 되면 선택지 2개가 열려 있다', (await ev(`document.querySelectorAll('#classChoice .choice.is-ready').length`)) === 2 && (await ev(`document.getElementById('classChoice').textContent`)).includes('3차 전직'));
    await ev(`document.querySelector('[data-go="upgrade"]').click()`); await sleep(300);   // 알림 점은 화면이 갱신된 뒤에 뜬다
    check('전직 탭 알림 점이 뜬다 (다른 탭에 있을 때)', await ev(`!document.querySelector('[data-go="class"] .dot').hidden`));
    await ev(`document.querySelector('[data-go="class"]').click()`); await sleep(300);
    await ev(`document.querySelector('[data-pick="phoenixmage"]').click()`); await sleep(300);
    check('전직 확인 창에 직업 이름이 보인다', (await ev(`document.getElementById('modalTitle').textContent`)).includes('불사조술사'));
    await ev(`document.querySelector('#modalActions .btn--gold').click()`); await sleep(500);
    check('전직하면 현재 직업과 경로가 바뀐다', (await ev(`document.querySelector('.classcard__name').textContent`)) === '불사조술사' && (await ev(`document.querySelector('.classcard__path').textContent`)).includes('화염술사 → 불사조술사'));
    check('다음은 4차(Lv.' + LV4 + ')를 기다린다 (지금은 잠김)', (await ev(`document.getElementById('classChoice').textContent`)).includes(`4차 전직 (Lv.${LV4})`) && (await ev(`document.querySelectorAll('#classChoice .choice.is-locked').length`)) === 2);
    check('도감 탭이 4개(2·3·4·5차)이고 3차 1/16이 기록돼 있다', (await ev(`document.querySelectorAll('.dextab').length`)) === 4 && (await ev(`document.querySelector('[data-dextab="3"]').textContent`)).includes('1/16'));
    await ev(`document.querySelector('[data-dextab="3"]').click()`); await sleep(300);
    check('3차 도감에는 카드 16개가 나오고 전직한 직업만 밝혀진다', (await ev(`document.querySelectorAll('#codex .dexcard').length`)) === 16 && (await ev(`document.querySelectorAll('#codex .dexcard.is-on').length`)) === 1);
    await ev(`document.querySelector('[data-dextab="4"]').click()`); await sleep(300);
    check('4차 도감에는 카드 32개가 나온다', (await ev(`document.querySelectorAll('#codex .dexcard').length`)) === 32);
    await ev(`document.querySelector('.dexcard.is-off').click()`); await sleep(300);
    const hint = await ev(`document.getElementById('modalBody').textContent`);
    check('미달성 4차 카드는 어떤 순서로 전직해야 하는지 힌트를 준다', hint.includes('→') && hint.includes(`Lv.${LV4}`), hint);
    await shot('dex4');
    await ev(`document.querySelector('#modalActions .btn').click()`); await sleep(200);
    await ev(`document.querySelector('[data-dextab="5"]').click()`); await sleep(300);
    check('5차 도감에는 카드 64개가 나온다', (await ev(`document.querySelectorAll('#codex .dexcard').length`)) === 64);
    await reopen(mk(LV4, ['mage', 'pyromancer', 'phoenixmage']));
    await ev(`document.querySelector('[data-go="class"]').click()`); await sleep(400);
    check('4차 전직 레벨이 되면 선택지가 열린다', (await ev(`document.getElementById('classChoice').textContent`)).includes('4차 전직') && (await ev(`document.querySelectorAll('#classChoice .choice.is-ready').length`)) === 2);
    await shot('tier4-choice');
    await ev(`document.querySelector('[data-pick="phoenixlord"]').click()`); await sleep(300);
    await ev(`document.querySelector('#modalActions .btn--gold').click()`); await sleep(500);
    check('4차 전직 뒤에는 5차(Lv.' + LV5 + ')를 기다린다', (await ev(`document.getElementById('classChoice').textContent`)).includes(`5차 전직 (Lv.${LV5})`));
    check('전투 화면의 이름표도 4차 직업으로 바뀐다', (await ev(`document.getElementById('heroTitle').textContent`)) === '불사조의 주인');
    await reopen(mk(LV5, ['mage', 'pyromancer', 'phoenixmage', 'phoenixlord']));
    await ev(`document.querySelector('[data-go="class"]').click()`); await sleep(400);
    check('5차 전직 레벨이 되면 선택지가 열린다', (await ev(`document.getElementById('classChoice').textContent`)).includes('5차 전직') && (await ev(`document.querySelectorAll('#classChoice .choice.is-ready').length`)) === 2);
    await ev(`document.querySelector('[data-pick="rebirthlord"]').click()`); await sleep(300);
    await ev(`document.querySelector('#modalActions .btn--gold').click()`); await sleep(500);
    check('5차 전직 뒤에는 갈래 없이 초월 UI가 뜬다', (await ev(`document.getElementById('classChoice').textContent`)).includes('초월'));
    check('전투 화면의 이름표도 5차 직업으로 바뀐다', (await ev(`document.getElementById('heroTitle').textContent`)) === '재생의 군주');
    await reopen(mk(G.TRANSCEND_LEVEL[0], ['mage', 'pyromancer', 'phoenixmage', 'phoenixlord', 'rebirthlord']));
    await ev(`document.querySelector('[data-go="class"]').click()`); await sleep(400);
    check('초월 1랭크 레벨이 되면 초월할 수 있다', (await ev(`document.querySelectorAll('#classChoice button[data-ascend]:not(:disabled)').length`)) === 1);
    await ev(`document.querySelector('button[data-ascend]').click()`); await sleep(300);
    await ev(`document.querySelector('#modalActions .btn--gold').click()`); await sleep(500);
    check('초월하면 이름 옆에 별이 붙고 다음 초월(2랭크)을 기다린다', (await ev(`document.querySelector('.classcard__name').textContent`)).includes('★') && (await ev(`document.getElementById('classChoice').textContent`)).includes('초월 2랭크'));
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

    console.log('크리스탈 상점 (결제·광고는 시연)');
    const click = (sel) => ev(`document.querySelector(${JSON.stringify(sel)}).click()`);
    const txt = (sel) => ev(`(document.querySelector(${JSON.stringify(sel)}) || {}).textContent || ''`);
    const only = mk(30, ['mage', 'pyromancer']); only.crystals = 0;
    await reopen(only);
    await ev(`Game.STORE.AD_SECONDS = 1`);   // 시연 광고를 1초로 줄인다 (점검이 길어지지 않게)
    await click('[data-go="store"]'); await sleep(400);
    check('증표 탭 이름이 "증표"이고 새 "상점"·"던전" 탭이 따로 있다', (await ev(`[...document.querySelectorAll('.tabnav__btn span')].map((x) => x.textContent).join(',')`)) === '강화,장비,전직,환생,증표,상점,던전,기록');
    check('상점 탭이 열리고 크리스탈은 0이다', (await ev(`!document.querySelector('.tab[data-tab="store"]').hidden`)) && (await txt('#crystalBal')) === '0');
    check('시연 결제·광고라는 안내가 보인다', (await txt('#demoNote')).includes('실제 돈은 청구되지 않고'));
    check('크리스탈이 없으면 모든 구매 버튼이 잠긴다', (await ev(`[...document.querySelectorAll('#gearShop [data-gbuy], #boxList [data-buy], #utilList [data-buy]')].every((b) => b.disabled)`)) && (await ev(`document.querySelectorAll('#gearShop .gshop').length`)) === 6);
    check('물약은 상점에서 팔지 않는다 (광고 보상으로만 받는다)', (await ev(`!document.getElementById('potionList')`)) && (await txt('#adCard')).includes('랜덤 물약'));
    check('장비 상점에 특별 옵션 6개가 보이고 갱신 시각 안내가 있다', (await ev(`document.querySelectorAll('#gearShop .relic__opts b').length`)) === 6 && (await txt('#gshopTimer')).length > 0);
    check('장비 상자에 등급 확률이 그대로 공개된다', (await txt('#boxList')).includes('전설 90%') && (await txt('#boxList')).includes('신화 1%') && (await txt('#boxList')).includes('영웅 85%'));
    // 충전: 취소하면 그대로
    await click('#chargeBtn'); await sleep(250);
    check('충전 창에 상품 5개와 시연 안내가 보인다', (await ev(`document.querySelectorAll('#modalBody [data-pack]').length`)) === 5 && (await txt('#modalBody')).includes('실제 돈은 청구되지 않아요'));
    await click('#modalBody [data-pack="c330"]'); await sleep(250);
    check('결제 확인 창은 "시연"이고 청구되지 않는다고 알린다', (await txt('#modalTitle')).includes('시연') && (await txt('#modalBody')).includes('청구되지 않아요'));
    await click('#modalActions .btn'); await sleep(250);   // 취소
    check('결제를 취소하면 크리스탈이 늘지 않는다', (await txt('#crystalBal')) === '0');
    await click('#chargeBtn'); await sleep(250);
    await click('#modalBody [data-pack="c330"]'); await sleep(250);
    await click('#modalActions .btn--gold'); await sleep(350);
    check('시연 결제를 마치면 크리스탈 330개가 들어온다', (await txt('#crystalBal')) === '330');
    await shot('store');
    // 장비 상자
    await click('#boxList [data-buy="box_fine"]'); await sleep(250);
    check('확인 창에도 등급 확률이 보인다', (await txt('#modalBody')).includes('고급 60%'));
    await click('#modalActions .btn--gold'); await sleep(350);
    check('고급 장비 상자를 열면 장비 3개가 결과 창에 나오고 크리스탈 230', (await ev(`document.querySelectorAll('#modalBody .got').length`)) === 3 && (await txt('#crystalBal')) === '230');
    await click('#modalActions .btn'); await sleep(200);
    // 가방 확장
    await click('[data-go="gear"]'); await sleep(300);
    const cap0 = Number((await txt('#bagCount')).split('/')[1]);
    await click('[data-go="store"]'); await sleep(300);
    await click('#utilList [data-buy="bag"]'); await sleep(250);
    await click('#modalActions .btn--gold'); await sleep(350);
    await click('#modalActions .btn'); await sleep(200);
    await click('[data-go="gear"]'); await sleep(300);
    check('가방 확장을 사면 가방이 6칸 늘어난다', Number((await txt('#bagCount')).split('/')[1]) === cap0 + 6, await txt('#bagCount'));
    await click('[data-go="store"]'); await sleep(300);
    check('가방 확장(80) 뒤 크리스탈이 150이다', (await txt('#crystalBal')) === '150');
    // 광고
    check('광고는 오늘 3번 남아 있다', (await txt('#adCard')).includes('3/3'));
    const bal0 = Number(await txt('#crystalBal'));
    await click('#adCard [data-ad]'); await sleep(300);
    check('광고 화면이 열리고 카운트다운이 끝나기 전에는 보상 버튼이 잠긴다', await ev(`!document.getElementById('adOverlay').hidden && document.getElementById('adClaim').disabled`));
    await click('#adCancel'); await sleep(200);
    check('광고를 중간에 그만두면 횟수가 줄지 않는다', (await txt('#adCard')).includes('3/3') && Number(await txt('#crystalBal')) === bal0);
    for (let i = 1; i <= 3; i++) {
      await click('#adCard [data-ad]'); await sleep(1500);
      const ready = await ev(`!document.getElementById('adClaim').disabled`);
      if (!ready) check(`광고 ${i}: 1초 뒤 보상 버튼이 열린다`, false);
      await click('#adClaim'); await sleep(400);
      if (i === 1) check('광고 보상 창에 크리스탈과 받은 물약이 나오고', (await txt('#modalTitle')).includes('광고 보상') && (await txt('#modalBody')).includes('크리스탈 +10') && /물약|비약/.test(await txt('#modalBody')));
      if (i === 1) check('물약이 적용돼 장면에 남은 시간이 뜬다', await ev(`!document.getElementById('potionbar').hidden && document.querySelectorAll('#potionbar .pchip').length === 1`));
      await click('#modalActions .btn'); await sleep(150);
      check(`광고 ${i}번째: 크리스탈이 정확히 10개 늘고 남은 횟수가 ${3 - i}번`, Number(await txt('#crystalBal')) === bal0 + 10 * i && (await txt('#adCard')).includes(`${3 - i}/3`), `크리스탈 ${await txt('#crystalBal')}, ${await txt('#adCard')}`);
    }
    check('하루 3번을 다 쓰면 광고 버튼이 잠긴다', await ev(`document.querySelector('#adCard [data-ad]').disabled`));
    await shot('store-ad');
    // 새로 열어도 유지 (크리스탈·물약·광고 횟수)
    await sleep(600);
    await send('Page.navigate', { url: 'file://' + ROOT + '/index.html' }); await sleep(1500);
    await click('[data-go="store"]'); await sleep(400);
    check('다시 열어도 크리스탈 180(150+광고 30)·광고 횟수·물약이 유지된다', (await txt('#crystalBal')) === '180' && (await ev(`document.querySelector('#adCard [data-ad]').disabled`)) && (await ev(`!document.getElementById('potionbar').hidden`)));

    // 기기 시계를 바꿔서 광고 횟수를 늘리려는 시도
    await ev(`(() => { window.__realNow = Date.now; window.__realFetch = window.fetch; Date.now = () => window.__realNow() + 2 * 864e5; })()`);   // 기기 시계를 이틀 앞으로
    await sleep(600);
    check('기기 시계를 이틀 앞으로 돌려도(서버 시각을 못 받는 상태) 광고 횟수가 다시 열리지 않는다', (await txt('#adCard')).includes('0/3') && (await ev(`document.querySelector('#adCard [data-ad]').disabled`)));
    await ev(`(() => { window.__srv = () => window.__realNow(); window.fetch = async () => new Response(null, { headers: { Date: new Date(window.__srv()).toUTCString() } }); document.dispatchEvent(new Event('visibilitychange')); })()`);   // 서버는 "지금은 오늘"이라고 답한다
    await sleep(600);
    check('서버가 아직 같은 날이라고 답하면 시계가 앞서 있어도 광고 횟수는 그대로 0/3', (await txt('#adCard')).includes('0/3') && (await ev(`document.querySelector('#adCard [data-ad]').disabled`)));
    await ev(`(() => { window.__srv = () => window.__realNow() + 2 * 864e5; document.dispatchEvent(new Event('visibilitychange')); })()`);   // 서버 시각이 실제로 이틀 지남
    await sleep(600);
    check('서버 시각이 실제로 다음 날이 되면 광고 횟수가 다시 3/3이 된다', (await txt('#adCard')).includes('3/3') && (await ev(`!document.querySelector('#adCard [data-ad]').disabled`)));
    await ev(`(() => { window.__srv = () => window.__realNow(); document.dispatchEvent(new Event('visibilitychange')); })()`);   // 서버가 예전 시각을 답해도 날짜는 뒤로 가지 않는다
    await sleep(600);
    check('서버가 예전 날짜를 말해도 날짜가 뒤로 가서 횟수가 늘지 않는다 (여전히 3/3)', (await txt('#adCard')).includes('3/3'));
    await ev(`(() => { Date.now = window.__realNow; window.fetch = window.__realFetch; })()`);

    console.log('업적 보상 · 유물 · 환생 안내 · 증표 4단계');
    const t1 = G.createState(0); t1.totalKills = 1200; t1.bestStage = t1.runBest = t1.stage = 12; t1.level = 12; t1.crystals = 4000; t1.tokens = 30; t1.runT = 100; t1.autoSell = -1;
    G.checkAchievements(t1); t1.hp = G.maxHp(t1);
    const rewardSum = G.unclaimedAchievements(t1).reduce((a, x) => a + x.reward, 0), rewardN = G.unclaimedAchievements(t1).length;
    await reopen(t1);
    check('받을 업적 보상이 있으면 기록 탭에 알림 점이 뜬다', await ev(`!document.querySelector('[data-go="log"] .dot').hidden`));
    await click('[data-go="log"]'); await sleep(400);
    check('기록 탭에 일일·주간·월간·업적·랭킹 분류 단추가 있고 일일이 먼저 열려 있다', (await ev(`[...document.querySelectorAll('#logSeg button')].map((b) => b.dataset.seg).join(',')`)) === 'daily,weekly,monthly,ach,rank' && (await ev(`document.querySelector('#logSeg .is-on').dataset.seg`)) === 'daily');
    check('일일 퀘스트 5개가 보이고 "접속하기"는 이미 끝나 받을 수 있다', (await ev(`document.querySelectorAll('#qList .ach').length`)) === 5 && (await txt('#qList')).includes('오늘 접속하기') && (await ev(`!!document.querySelector('#qList [data-qclaim="daily:attend"]')`)));
    check('퀘스트 화면에 초기화까지 남은 시간(또는 서버 시각 안내)과 완료 보너스 칸이 있다', (await txt('#qHead')).length > 5 && (await txt('#qBonus')).includes('모두 완료 보너스'));
    for (const seg of ['weekly', 'monthly']) { await click(`#logSeg [data-seg="${seg}"]`); await sleep(200); check(`${seg === 'weekly' ? '주간' : '월간'} 퀘스트가 ${seg === 'weekly' ? 5 : 4}개 보인다`, (await ev(`document.querySelectorAll('#qList .ach').length`)) === (seg === 'weekly' ? 5 : 4)); }
    await click('#logSeg [data-seg="ach"]'); await sleep(300);
    check('업적이 분류별로 묶여 보이고 "받을 보상"이 표시된다', (await ev(`document.querySelectorAll('.achgroup').length`)) >= 9 && !(await ev(`document.getElementById('achClaim').hidden`)) && (await txt('#achClaimText')).includes(`${rewardN}개`), await txt('#achClaimText'));
    check('받을 보상이 있는 분류는 펼쳐져 있고 카드에 진행도 숫자(예: 12 / 20)와 보상이 보인다', (await ev(`[...document.querySelectorAll('.ach__num')].some((x) => /\\d+ \\/ \\d+/.test(x.textContent))`)) && (await ev(`document.querySelectorAll('#achv .ach__rw').length`)) > 0);
    check('업적이 150개 넘게 있다고 표시된다', /\/ 1[5-9]\d/.test(await txt('#achieveBonus')), await txt('#achieveBonus'));
    const collapsed = await ev(`(() => { const g = [...document.querySelectorAll('.achgroup')].find((x) => x.textContent.includes('▸')); return g ? g.dataset.grp : ''; })()`);
    if (collapsed) { await click(`.achgroup[data-grp="${collapsed}"]`); await sleep(200); check('접힌 분류를 누르면 펼쳐진다', (await ev(`document.querySelector('.achgroup[data-grp="${collapsed}"]').textContent.includes('▾')`))); }
    await shot('achievements2');
    await click('#achv [data-claim]'); await sleep(300);
    check('업적 하나를 받으면 받을 보상이 1개 줄어든다', (await txt('#achClaimText')).includes(`${rewardN - 1}개`), await txt('#achClaimText'));
    await click('#achClaimAll'); await sleep(300);
    check('모두 받기를 누르면 받을 보상 안내가 사라지고 알림 점도 꺼진다', (await ev(`document.getElementById('achClaim').hidden`)) && (await ev(`document.querySelectorAll('#achv [data-claim]').length`)) === 0);
    await click('[data-go="store"]'); await sleep(400);
    check(`받은 보상이 크리스탈에 합쳐진다 (4,000 + ${rewardSum})`, (await txt('#crystalBal')) === G.fmt(4000 + rewardSum), await txt('#crystalBal'));
    await click('[data-go="log"]'); await sleep(300);
    await click('#logSeg [data-seg="daily"]'); await sleep(250);
    await click('#qList [data-qclaim="daily:attend"]'); await sleep(300);
    check('접속하기 보상을 받으면 "받음"이 되고 크리스탈이 2개 늘어난다', (await ev(`!document.querySelector('#qList [data-qclaim="daily:attend"]')`)) && (await txt('#qList')).includes('받음'));
    await click('[data-go="store"]'); await sleep(300);
    check(`퀘스트 보상 2개가 크리스탈에 합쳐진다`, (await txt('#crystalBal')) === G.fmt(4000 + rewardSum + 2), await txt('#crystalBal'));
    check('장비 상점 새로고침 단추에 그림 코드가 글자로 보이지 않는다', !(await txt('#gshopReroll')).includes('<svg') && !(await txt('#gshopReroll')).includes('href') && (await txt('#gshopReroll')).includes('새로고침') && (await ev(`!!document.querySelector('#gshopReroll svg, #gshopReroll img')`)), await txt('#gshopReroll'));
    // 유물
    check('유물 9종이 특별 옵션과 함께 보인다', (await ev(`document.querySelectorAll('#relicList .relic').length`)) === 9 && (await txt('#relicList')).includes('환생 증표 획득 +15%') && (await txt('#relicList')).includes('스킬 쿨타임 -25%'));
    await click('#relicList [data-buy="relic_seal"]'); await sleep(250);
    check('유물 구매 확인 창에 특별 옵션이 보인다', (await txt('#modalBody')).includes('환생 증표 획득 +15%') && (await txt('#modalBody')).includes('1200'));
    await click('#modalActions .btn--gold'); await sleep(350);
    check('구매하면 바로 장착되고 크리스탈이 1,200 줄어든다', (await txt('#modalBody')).includes('바로 장착') && (await ev(`document.querySelectorAll('#relicList .relic.is-on').length`)) === 1 && (await txt('#crystalBal')) === G.fmt(4000 + rewardSum - 1200));
    await click('#modalActions .btn'); await sleep(200);
    await click('[data-go="gear"]'); await sleep(300);
    check('장비 탭에 장착한 유물이 보인다', (await ev(`document.querySelectorAll('#relicBar .rslot.is-full').length`)) === 1 && (await txt('#relicBar')).includes('왕의 인장'));
    await click('[data-go="store"]'); await sleep(300);
    for (const id of ['relic_horn', 'relic_scholar']) { await click(`#relicList [data-buy="${id}"]`); await sleep(250); await click('#modalActions .btn--gold'); await sleep(300); await click('#modalActions .btn'); await sleep(200); }
    check('유물은 2개까지만 자동 장착되고 셋째는 "가득 찼어요"로 안내된다', (await ev(`document.querySelectorAll('#relicList .relic.is-on').length`)) === 2);
    await click('#relicList [data-relic="relic_scholar"]'); await sleep(250);
    check('가득 찬 상태에서 셋째를 끼우려 하면 안내 창이 뜬다', (await txt('#modalTitle')).includes('가득'));
    await click('#modalActions .btn'); await sleep(200);
    await click('#relicList [data-relic="relic_horn"]'); await sleep(300);   // 해제
    await click('#relicList [data-relic="relic_scholar"]'); await sleep(300);   // 장착
    check('하나를 해제하면 다른 유물을 낄 수 있다', (await txt('#relicList')).includes('장착 중') && (await ev(`document.querySelectorAll('#relicList .relic.is-on').length`)) === 2 && (await ev(`!!document.querySelector('#relicList [data-relic="relic_horn"]')`)));
    await ev(`document.getElementById('relicList').scrollIntoView()`); await sleep(300);
    await shot('relics');
    // 장비 상점 구매
    await click('[data-go="store"]'); await sleep(300);
    const gcrystal0 = await txt('#crystalBal');
    await click('#gearShop [data-gbuy="0"]'); await sleep(250);
    check('장비 상점 구매 확인 창에 등급·특별 옵션·가격이 보인다', (await txt('#modalBody')).includes('★') === false && (await ev(`document.querySelectorAll('#modalBody .relic__opts b').length`)) === 1 && /(450|1300)/.test(await txt('#modalBody')));
    await click('#modalActions .btn--gold'); await sleep(350);
    check('구매하면 "구매 완료" 창에 옵션이 보이고 그 칸이 "판매 완료"가 된다', (await txt('#modalTitle')).includes('구매 완료') && (await ev(`!!document.querySelector('#gearShop .gshop.is-sold')`)));
    await click('#modalActions .btn'); await sleep(200);
    check('크리스탈이 줄어든다', (await txt('#crystalBal')) !== gcrystal0, `${gcrystal0} → ${await txt('#crystalBal')}`);
    await click('[data-go="gear"]'); await sleep(300);
    check('장비 탭에 특별 옵션(★)이 붙은 장비가 보인다', (await ev(`document.querySelectorAll('#slots .slot__sp, #bag .gitem__sp').length`)) >= 1);
    await click('[data-go="store"]'); await sleep(300);
    await click('#gshopReroll'); await sleep(250);
    check('새로고침 확인 창에 비용과 남은 횟수가 보인다', (await txt('#modalBody')).includes('40') && (await txt('#modalBody')).includes('3번'));
    const gshopBefore = await txt('#gearShop');
    await click('#modalActions .btn--gold'); await sleep(350);
    check('새로고침하면 진열이 바뀌고 산 칸 표시가 사라진다', (await txt('#gearShop')) !== gshopBefore && (await ev(`!document.querySelector('#gearShop .gshop.is-sold')`)) && (await txt('#gshopReroll')).includes('2/3'));
    await ev(`document.getElementById('gearShop').scrollIntoView()`); await sleep(300);
    await shot('gearshop');
    // 환생 안내
    await click('[data-go="prestige"]'); await sleep(400);
    check('환생 화면에 판을 키운 시간과 100% 조건이 안내된다', (await txt('#prestigeHint')).includes('10분') && (await txt('#prestigeHint')).includes('키웠어요'), await txt('#prestigeHint'));
    check('환생 화면에 전직과 증표의 관계(직업 공명)가 안내된다', (await txt('#prestigeNote')).includes('전직할 때마다') && (await txt('#prestigeNote')).includes('직업 각성'));
    check('환생 버튼은 시간에 따라 줄어든 증표를 보여 준다 (스테이지 12, 100초 → 1개)', (await txt('#prestigeBtn')).includes('증표 +1'));
    await click('#prestigeBtn'); await sleep(250);
    check('일찍 환생하면 확인 창에서 더 키우면 몇 개를 받는지 알려 준다', (await txt('#modalBody')).includes('더 키우면'), await txt('#modalBody'));
    await click('#modalActions .btn'); await sleep(200);
    // 증표 4단계
    await click('[data-go="shop"]'); await sleep(400);
    check('증표 탭에 4단계(직업 강화)가 있고 직업 각성·도감 공명이 보인다', (await txt('#perks')).includes('4단계') && (await ev(`!!document.querySelector('.perk[data-id="awaken"]') && !!document.querySelector('.perk[data-id="codex"]')`)));
    check('직업 각성은 왕의 위엄이 필요해서 잠겨 있다', await ev(`document.querySelector('.perk[data-id="awaken"]').classList.contains('is-locked')`));

    console.log('자리를 비운 시간 (서버 시각 기준)');
    // 서버 시각을 흉내 낸다: 서버 시각 = 진짜 지금 + __srvShift. 기기 시계(Date.now)는 아래에서 일부러 튀게 한다.
    const injId = (await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__realNow = Date.now.bind(Date); window.__srvShift = 0; window.fetch = async () => new Response(null, { headers: { Date: new Date(window.__realNow() + window.__srvShift).toUTCString() } });` })).result.identifier;
    const openAway = async (wallAgoMs, srvAgoMs) => {   // 저장 시각이 wallAgoMs(기기 시계)·srvAgoMs(서버 시각) 전인 저장으로 게임을 연다
      const t = G.createState(0); t.level = 20; t.hp = G.maxHp(t);
      const nowMs = Date.now();
      const text = G.serialize(t, nowMs - wallAgoMs, srvAgoMs === null ? undefined : nowMs - srvAgoMs);
      await send('Page.navigate', { url: 'file://' + path.join(profile, 'seed.html') }); await sleep(300);
      await ev(`localStorage.setItem('goblin-idle-save-v1', ${JSON.stringify(text)})`);
      await send('Page.navigate', { url: 'file://' + ROOT + '/index.html' }); await sleep(1800);
      await ev(`Game.setRandom(() => 0.999)`);
    };
    const modalText = async () => ((await ev(`document.getElementById('modal').hidden`)) ? '' : (await txt('#modalTitle')) + ' ' + (await txt('#modalBody')));
    const H = 3600e3;
    await openAway(2 * H + 20e3, 2 * H + 20e3);   // 열리는 데 걸리는 시간이 있어서 20초 여유를 둔다
    let m = await modalText();
    check('창을 닫았다 열면 서버 시각으로 잰 2시간 보상 창이 뜬다', m.includes('자리를 비운 사이에') && m.includes('2시간') && m.includes('서버 시각'), m);
    await openAway(10 * H, 5 * 60e3 + 20e3);
    m = await modalText();
    check('기기 시계가 10시간 지났다고 해도 서버가 5분이라고 하면 5분만 받고 이유를 알려 준다', m.includes('5분') && !m.includes('8시간') && m.includes('크게 달라서'), m);
    await openAway(3 * H, null);
    m = await modalText();
    check('저장 때 서버 시각을 몰랐던 저장은 기기 시계로 3시간을 재고 그렇게 알려 준다', m.includes('3시간') && m.includes('기기 시계 기준'), m);
    await openAway(20 * H + 20e3, 20 * H + 20e3);
    m = await modalText();
    check('20시간을 비워도 8시간까지만 받고 실제 비운 시간과 한도를 알려 준다', m.includes('8시간') && /(19시간 5|20시간)/.test(m) && m.includes('최대 8시간'), m);
    await openAway(5000, 5000);
    check('5초만 비웠다면 보상 창이 뜨지 않는다', (await modalText()) === '');
    // 켜 둔 채 자리를 비운 경우(기기 절전·백그라운드): 시계가 튀면 서버 시각으로 다시 잰다
    await ev(`(() => { Date.now = () => window.__realNow() + 3600e3 + 20e3; window.__srvShift = 3600e3 + 20e3; })()`);
    await sleep(1800);
    m = await modalText();
    check('켜 둔 채 1시간이 지나(기기·서버 모두) 깨어나면 1시간 보상이 한 번 뜬다', m.includes('자리를 비운 사이에') && /1시간/.test(m) && m.includes('서버 시각'), m);
    await click('#modalActions .btn'); await sleep(200);
    await ev(`(() => { Date.now = () => window.__realNow() + 10 * 3600e3; window.__srvShift = 3600e3 + 20e3 + 300e3; })()`);   // 기기 시계만 10시간 튀고 서버는 5분 지남
    await sleep(1800);
    m = await modalText();
    check('켜 둔 채 기기 시계만 10시간 앞으로 튀어도 서버 기준 5분만 받는다', m.includes('5분') && !m.includes('8시간') && !/[1-9]시간 \d+분 동안/.test(m), m);
    await click('#modalActions .btn'); await sleep(200);
    // 화면을 벗어난 동안: 조용히 모으고 돌아왔을 때 한 번만 알린다
    await ev(`(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); })()`);
    await sleep(300);
    await ev(`(() => { Date.now = () => window.__realNow() + 10 * 3600e3 + 2 * 3600e3; window.__srvShift = 3600e3 + 20e3 + 300e3 + 2 * 3600e3; })()`);
    await sleep(1800);
    check('화면을 벗어난 동안에는 보상 창이 뜨지 않고 조용히 쌓는다', (await modalText()) === '');
    await ev(`(() => { Date.now = () => window.__realNow() + 10 * 3600e3 + 3 * 3600e3; window.__srvShift = 3600e3 + 20e3 + 300e3 + 3 * 3600e3; })()`);
    await sleep(1800);
    await ev(`(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); })()`);
    await sleep(900);
    m = await modalText();
    check('돌아오면 밖에 있던 시간을 합쳐 한 번만 알린다 (약 2시간 이상)', m.includes('자리를 비운 사이에') && /[23]시간/.test(m), m);
    await ev(`(() => { delete Date.now; Date.now = window.__realNow; })()`);
    await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: injId });
    await click('#modalActions .btn'); await sleep(200);
    await click('[data-go="log"]'); await sleep(300);
    check('기록 탭에 오프라인 보상 한도와 시간 기준 안내가 있다', (await txt('#awayNote')).includes('최대 8시간') && (await txt('#awayNote')).includes('기준'));

    console.log('서버 출석 · 친선 랭킹 (가짜 서버)');
    const injS = (await send('Page.addScriptToEvaluateOnNewDocument', { source: `window.__realNow = Date.now.bind(Date); window.fetch = async () => new Response(null, { headers: { Date: new Date(window.__realNow()).toUTCString() } });` })).result.identifier;
    await ev(`localStorage.removeItem('fake-attend'); localStorage.removeItem('fake-ranks')`);
    const fresh = G.createState(0);
    await reopen(fresh);
    await click('[data-go="log"]'); await sleep(400);
    check('일일 화면 위에 출석 카드가 있고, 로그인 전에는 연동 안내가 나온다', !(await ev(`document.getElementById('attendCard').hidden`)) && (await txt('#attendCard')).includes('계정을 연동') && (await ev(`document.querySelectorAll('#attendCard .attend__day').length`)) === 7);
    await ev(`window.CLOUD_ADAPTER.signIn('google')`); await sleep(1200);
    check('로그인하면 출석 체크 단추가 켜진다', await ev(`!!document.querySelector('#attendCard [data-attend="check"]:not(:disabled)')`), await txt('#attendCard'));
    await click('#attendCard [data-attend="check"]'); await sleep(500);
    check('출석 체크를 하면 1일차 보상 3개 창이 뜨고 카드가 "오늘 완료"·1일 연속이 된다', (await txt('#modalTitle')).includes('출석') && (await txt('#modalBody')).includes('+3') && (await txt('#attendCard')).includes('오늘 완료') && (await txt('#attendCard')).includes('1일 연속') && (await ev(`document.querySelectorAll('#attendCard .attend__day.is-done').length`)) === 1, await txt('#attendCard'));
    await click('#modalActions .btn'); await sleep(200);
    await click('#logSeg [data-seg="rank"]'); await sleep(400);
    check('랭킹 화면에 "보상 없는 친선 랭킹" 안내가 있고, 닉네임이 없으면 참여 단추가 나온다', (await txt('#segRank')).includes('보상은 없어요') && !!(await ev(`document.querySelector('[data-rank="nick"]')`)));
    await click('[data-rank="nick"]'); await sleep(250);
    await ev(`document.getElementById('nickInput').value = '<>!!'`); await click('#modalActions .btn--gold'); await sleep(300);
    check('쓸 수 없는 닉네임이면 다시 안내하고 저장하지 않는다', (await txt('#modalTitle')).includes('닉네임') && (await ev(`!!document.querySelector('[data-rank="nick"]')`)));
    await click('#modalActions .btn'); await sleep(250);
    await ev(`document.getElementById('nickInput').value = '테스트 고블린'`); await click('#modalActions .btn--gold'); await sleep(900);
    check('닉네임을 저장하면 랭킹 3줄(고수·뉴비·나)이 높은 순으로 보이고 내 줄이 표시된다', (await ev(`document.querySelectorAll('#rankBody .rankrow').length`)) >= 3 && (await ev(`document.querySelectorAll('#rankBody .rankrow.is-me').length`)) >= 1 && (await txt('#rankBody .rankrow')).includes('고수'), await txt('#rankBody'));
    check('종류 단추 3개(최고 스테이지·누적 증표·업적)가 있다', (await ev(`document.querySelectorAll('#rankBody .rankchips button').length`)) === 3);
    await click('#rankBody [data-board="ach"]'); await sleep(500);
    check('종류를 바꾸면 그 기준으로 다시 정렬해 보여 준다', (await ev(`document.querySelector('#rankBody .rankchips .is-on').dataset.board`)) === 'ach' && (await txt('#rankBody .rankrow')).includes('고수'));
    await click('[data-rank="remove"]'); await sleep(250);
    await click('#modalActions .btn--blue'); await sleep(600);
    check('내 기록 지우기를 하면 닉네임이 비워져 참여 화면으로 돌아간다', !!(await ev(`document.querySelector('[data-rank="nick"]')`)) && (await txt('#rankBody')).includes('닉네임을 정해'));
    await send('Page.removeScriptToEvaluateOnNewDocument', { identifier: injS });

    console.log('일일·주간·월간 던전');
    const dg = mk(60, ['mage', 'necromancer', 'lich', 'lichking']);
    for (const k of G.UPGRADE_KEYS) dg.upgrades[k] = 200;   // 어떤 던전도 여유 있게 물리칠 초당 피해
    dg.hp = G.maxHp(dg);
    await reopen(dg);
    await click('[data-go="dungeon"]'); await sleep(400);
    check('던전 탭에 일일·주간·월간 카드 3개가 보인다', (await ev(`document.querySelectorAll('#dungeonList .dungeon').length`)) === 3);
    check('카드마다 보스 이름과 도전권 표시가 있다', (await txt('#dungeonList')).includes('일일 던전') && (await txt('#dungeonList')).includes('주간 던전') && (await txt('#dungeonList')).includes('월간 던전'));
    await click('[data-dchallenge="weekly"]'); await sleep(300);
    check('도전 확인 창에 보스 이름과 미니게임 이름이 보인다', (await txt('#modalTitle')).includes('주간 던전') && (await txt('#modalBody')).includes('타이밍 게이지'));
    await click('#modalActions .btn--gold'); await sleep(300);
    check('도전하면 그 던전의 미니게임 창이 뜬다 (주간=타이밍 게이지)', !(await ev(`document.getElementById('mgModal').hidden`)) && !!(await ev(`document.getElementById('mgTrack')`)));
    await click('#mgSkip'); await sleep(400);
    check('미니게임을 건너뛰어도 충분히 강하면 파동을 모두 물리치고 완주 결과 창이 뜬다', (await txt('#modalTitle')).includes('완주'));
    await click('#modalActions .btn'); await sleep(300);
    check('완주하면 파동 진행 점이 모두 켜진 채로 표시된다', (await ev(`document.querySelectorAll('#dungeonList .dungeon')[1].querySelectorAll('.dwave.is-on').length`)) === 3);
    check('완주 보상을 받았다는 표시가 남는다', (await txt('#dungeonList')).includes('완주 보상 받음'));
    await click('[data-dchallenge="daily"]'); await sleep(300);
    await click('#modalActions .btn--gold'); await sleep(300);
    check('일일 던전 미니게임은 두더지 잡기 그리드다', !!(await ev(`document.getElementById('mgGrid')`)));
    await click('#mgSkip'); await sleep(400);
    await click('#modalActions .btn'); await sleep(300);
    check('일일 던전은 하루 3번까지라, 한 번 쓰면 2/3로 준다', (await txt('#dungeonList')).includes('2/3'));
    await click('[data-dchallenge="monthly"]'); await sleep(300);
    await click('#modalActions .btn--gold'); await sleep(300);
    check('월간 던전 미니게임은 패턴 회피·반격 레인이다', !!(await ev(`document.getElementById('mgLane')`)));
    await click('#mgSkip'); await sleep(400);
    await click('#modalActions .btn'); await sleep(300);

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
