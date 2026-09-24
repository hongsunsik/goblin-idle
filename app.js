(function () {
  const G = window.Game;
  const A = window.Art;
  const Mini = window.Mini;
  A.setParents(G.parentOf);   // 그림이 없는 3~5차 직업은 윗단계 직업 그림으로 대신 그린다
  const SAVE_KEY = 'goblin-idle-save-v1';
  const $ = (id) => document.getElementById(id);

  // 아이콘 스프라이트를 페이지에 한 번 넣어 두면 <use href="#i-이름">으로 어디서든 쓸 수 있다
  document.body.insertAdjacentHTML('afterbegin', A.sprite());
  A.applyStatic(document);   // images/ 폴더에 그림이 있으면 아이콘·배경을 이미지로 교체

  const BIOMES = ['고블린 숲', '어둠의 동굴', '불타는 사막', '얼음 산맥', '화산 지대', '저주받은 성'];
  const STAT_LABEL = { dmg: '공격력', hp: '체력', aps: '공격 속도', gold: '골드', comp: '동료', regen: '회복', click: '직접 공격' };
  const COIN = A.icon('coin');
  const GEM = A.icon('gem');

  // ---- 저장소 (막혀 있어도 게임은 동작해야 하므로 전부 try/catch) ----
  function loadSave() {
    try {
      const text = localStorage.getItem(SAVE_KEY);
      return text ? G.deserialize(text) : null;
    } catch (e) { return null; }
  }
  let booting = true;   // 시작할 때 비운 시간을 계산하기 전에는 저장하지 않는다 (저장하면 '마지막 저장 시각'이 지금으로 바뀌어 비운 시간이 사라진다)
  function writeSave() {
    if (booting) return;
    try {
      localStorage.setItem(SAVE_KEY, G.serialize(state, Date.now(), serverNow()));
      setText('saveInfo', '자동 저장됨');
    } catch (e) {
      setText('saveInfo', '저장할 수 없어요 (브라우저 설정 확인)');
    }
  }
  function clearSave() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* 무시 */ }
  }

  let state = loadSave() || G.createState(Date.now());

  // 서버 시각: 광고 횟수·장비 상점 갱신·자리를 비운 시간을 재는 데 쓴다. 기기 시계는 사용자가 바꿀 수 있고 어긋나기도 해서, 이 사이트를 내려 주는 서버의 응답 시각을 기준으로 삼는다.
  // 서버 시각은 이 사이트를 내려 주는 서버의 응답 시각(Date 헤더)이다. 받지 못하면(오프라인·로컬 파일) 새 하루로 넘어가지 않는다.
  let srvBase = null, perfBase = 0;
  async function fetchServerTime(timeoutMs) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs || 4000);
    try {
      const res = await fetch(location.href.split('#')[0].split('?')[0], { method: 'HEAD', cache: 'no-store', signal: ctl.signal });
      const date = Date.parse(res.headers.get('Date') || ''), age = Number(res.headers.get('Age') || 0);
      if (Number.isFinite(date)) { srvBase = date + (Number.isFinite(age) ? age : 0) * 1000; perfBase = performance.now(); return true; }
    } catch (e) { /* 서버 시각을 못 받으면 마지막으로 확인된 날짜에 머문다 */ }
    finally { clearTimeout(timer); }
    return false;
  }
  // 받아 둔 서버 시각에서 흐른 시간은 기기 시계가 아니라 performance.now()로 잰다 (도중에 시계를 바꿔도 영향이 없다)
  const serverNow = () => (srvBase === null ? null : srvBase + (performance.now() - perfBase));
  setInterval(() => { if (!document.hidden) fetchServerTime(); }, 10 * 60 * 1000);   // 오래 켜 둬도 서버 시각이 어긋나지 않게 가끔 다시 받는다

  // ---- 바뀐 값만 화면에 쓴다 (초당 10번 갱신하므로 불필요한 그리기를 줄임) ----
  const cache = {};
  function setText(id, v) {
    v = String(v);
    if (cache['t' + id] === v) return;
    cache['t' + id] = v;
    $(id).textContent = v;
  }
  // innerHTML도 바뀔 때만 쓴다 (매 프레임 같은 HTML을 다시 쓰면 매번 파싱·스타일 계산을 새로 한다)
  function setHtml(id, v) {
    if (cache['h' + id] === v) return;
    cache['h' + id] = v;
    $(id).innerHTML = v;
  }
  function setWidth(id, pct) {
    const v = Math.max(0, Math.min(100, pct)).toFixed(1) + '%';
    if (cache['w' + id] === v) return;
    cache['w' + id] = v;
    $(id).style.width = v;
  }

  // ---- 기록 (종류마다 아이콘) ----
  const logs = [];
  function addLog(text, cls, icon) {
    logs.unshift({ text, cls, icon });
    if (logs.length > 10) logs.pop();
    const ul = $('log');
    ul.innerHTML = '';
    for (const l of logs) {
      const li = document.createElement('li');
      if (l.cls) li.className = l.cls;
      li.innerHTML = A.icon(l.icon || 'scroll');
      const span = document.createElement('span');
      span.textContent = l.text;
      li.appendChild(span);
      ul.appendChild(li);
    }
  }

  // ---- 연출 (모션) ----
  // 움직임은 Web Animations(el.animate)로 넣는다. transform·opacity·filter만 움직여서 휴대폰에서도 부드럽다.
  // '동작 줄이기' 설정을 켠 사람에게는 움직임을 넣지 않는다 (숫자와 상태는 그대로 보인다).
  const reduceMotion = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const layer = $('floatLayer');
  const sceneEl = $('scene');
  // 전투 효과 강도: 'full'(기본, 화려하게) / 'calm'(차분하게: 꼭 필요한 움직임만). 설정 창에서 바꾸고 기기에 기억한다.
  const FX_KEY = 'goblin-idle-fx-v1';
  let fxMode = 'full';
  try {
    const saved = localStorage.getItem(FX_KEY);
    if (saved === 'calm') fxMode = 'calm';
    // 직접 고른 적이 없으면 저사양 기기(코어 4개 이하 또는 메모리 3GB 이하)는 차분하게로 시작한다 — 화려하게는 CPU를 약 2배 쓴다 (tools/perf.js 실측)
    else if (saved === null && ((navigator.hardwareConcurrency || 8) <= 4 || (navigator.deviceMemory || 8) <= 3)) fxMode = 'calm';
  } catch (e) { /* 저장소를 못 써도 기본값 */ }
  const calm = () => fxMode === 'calm';
  const MAX_FX = 110;   // 화면에 한꺼번에 떠 있는 이펙트 수 제한 (빠르게 싸울 때 과부하 방지)

  function anim(el, keyframes, opts) {
    if (reduceMotion || !el || !el.animate) return null;
    return el.animate(keyframes, opts);
  }
  // 고블린 몸(#hero)은 공격 동작·몬스터에게 맞는 움찔거림이 서로 다른 곳에서 겹쳐 걸릴 수 있다.
  // 겹치면 두 애니메이션이 transform을 동시에 다투면서 뚝뚝 끊겨 보이므로, 새로 걸기 전에 하던 것부터 지운다.
  function animHero(keyframes, opts) {
    const el = $('hero');
    if (el && el.getAnimations) for (const a of el.getAnimations()) a.cancel();
    return anim(el, keyframes, opts);
  }
  // 요소의 계산된 filter 값 (없으면 빈 문자열). 기존 그림자·지역 색 필터 뒤에 효과를 이어 붙일 때 쓴다.
  function baseFilter(el) {
    const f = getComputedStyle(el).filter;
    return f && f !== 'none' ? f : '';
  }
  // 장면 안에서 el의 (가로 fx, 세로 fy 비율) 지점 좌표
  function spot(el, fx, fy) {
    const s = sceneEl.getBoundingClientRect(), r = el.getBoundingClientRect();
    return { x: r.left - s.left + r.width * fx, y: r.top - s.top + r.height * fy, l: r.left - s.left, t: r.top - s.top, w: r.width, h: r.height };
  }
  function addFx(cls, x, y) {
    if (layer.children.length > MAX_FX) return null;
    const el = document.createElement('div');
    el.className = 'fx ' + cls;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    layer.appendChild(el);
    return el;
  }
  // 이펙트를 재생하고 끝나면 지운다
  function playFx(el, keyframes, opts) {
    if (!el) return;
    const a = anim(el, keyframes, Object.assign({ fill: 'forwards' }, opts));
    if (a) a.onfinish = () => el.remove(); else el.remove();
  }
  const rand = (a, b) => a + Math.random() * (b - a);

  // ---- 화면에 떠오르는 숫자: 살짝 튀어 오르며 옆으로 흩어진다 ----
  const FLOAT_AREA = { hero: [10, 14, 56, 10], center: [34, 16, 34, 14], enemy: [56, 16, 44, 12], hit: [58, 12, 62, 8], gold: [72, 12, 52, 8], comp: [44, 12, 60, 8] };
  function floatText(text, cls, where, color) {
    if (layer.children.length > MAX_FX) return;
    const el = document.createElement('div');
    el.className = 'float ' + cls;
    el.textContent = text;
    if (color) el.style.color = color;
    // 종류마다 뜨는 자리를 나눠서 숫자끼리 겹치지 않게 한다 [가로 시작%, 가로 폭, 세로 시작%, 세로 폭]
    const [x0, xw, y0, yw] = FLOAT_AREA[where] || FLOAT_AREA.enemy;
    el.style.left = x0 + Math.random() * xw + '%';
    el.style.top = y0 + Math.random() * yw + '%';
    layer.appendChild(el);
    const big = /float--(tap|lv|drop)/.test(cls);
    const dx = rand(-20, 20);
    const a = anim(el, [
      { transform: 'translate(0, 8px) scale(0.55)', opacity: 0 },
      { transform: `translate(${dx * 0.3}px, -12px) scale(${big ? 1.4 : 1.18})`, opacity: 1, offset: 0.16 },
      { transform: `translate(${dx * 0.65}px, -30px) scale(1)`, opacity: 1, offset: 0.6 },
      { transform: `translate(${dx}px, -54px) scale(0.92)`, opacity: 0 },
    ], { duration: big ? 1150 : 900, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' });
    if (a) a.onfinish = () => el.remove(); else setTimeout(() => el.remove(), 900);
  }

  // ---- 몬스터 피격: 밀려났다가 되돌아오고, 순간 하얗게 번쩍인다 ----
  function monsterHit(strong, delay, soft) {
    const body = $('monster'), img = body.firstElementChild;
    if (soft) {   // 차분하게: 밀려나지 않고 살짝 밝아지기만 한다
      if (img) { const base = baseFilter(img); anim(img, [{ filter: base + ' brightness(1.6)' }, { filter: base }], { duration: 180, delay, easing: 'ease-out' }); }
      return;
    }
    const push = strong ? 16 : 9;
    anim(body, [
      { transform: 'translate(0, 0) scale(1, 1)' },
      { transform: `translate(${push}px, 0) scale(0.92, 1.07)`, offset: 0.25 },
      { transform: `translate(${-push * 0.25}px, 0) scale(1.03, 0.97)`, offset: 0.6 },
      { transform: 'translate(0, 0) scale(1, 1)' },
    ], { duration: strong ? 300 : 240, delay, easing: 'ease-out' });
    if (img) {
      const base = baseFilter(img);
      anim(img, [{ filter: base + ' brightness(2.5) saturate(0.5)' }, { filter: base }], { duration: 190, delay, easing: 'ease-out' });
    }
  }

  // 몬스터가 있는 곳에 튀는 불꽃과 (탭할 때는) 베는 선을 그린다
  function impactFx(strong, delay) {
    const p = spot($('monsterSprite'), 0.5, 0.5);
    const spark = calm() && !strong ? null : addFx('fx-spark', p.x + rand(-18, 10), p.y + rand(-22, 14));
    playFx(spark, [
      { transform: `scale(0.3) rotate(${rand(-30, 30)}deg)`, opacity: 1 },
      { transform: `scale(${strong ? 2.3 : 1.7}) rotate(${rand(-30, 30)}deg)`, opacity: 0 },
    ], { duration: 260, delay, easing: 'ease-out' });
  }

  // ---- 몬스터가 쓰러질 때: 복제본이 튕겨 날아가며 사라지고, 새 몬스터가 통통 튀며 등장한다 ----
  function killFx(boss) {
    const mSprite = $('monsterSprite');
    const p = spot(mSprite, 0.5, 0.5);
    if (calm()) {   // 차분하게: 부드럽게 사라지고 새 몬스터가 스르륵 나타난다. 동전·고리는 보스만.
      const g = addFx('fx-dying', p.l, p.t);
      if (g) {
        g.style.width = p.w + 'px'; g.style.height = p.h + 'px';
        g.innerHTML = $('monster').innerHTML;
        playFx(g, [{ transform: 'scale(1)', opacity: 1 }, { transform: 'scale(0.9) translateY(-6px)', opacity: 0 }], { duration: 260, easing: 'ease-out' });
      }
      if (boss) {
        for (let i = 0; i < 5; i++) {
          const c = addFx('fx-coin', p.x, p.y);
          const dx = rand(-50, 50);
          playFx(c, [{ transform: 'translate(0, 0)', opacity: 1 }, { transform: `translate(${dx}px, ${rand(-46, -20)}px)`, opacity: 0 }], { duration: 600, delay: rand(0, 80), easing: 'ease-out' });
        }
        const ring = addFx('fx-ring', p.x, p.y);
        playFx(ring, [{ transform: 'scale(0.3)', opacity: 0.9 }, { transform: 'scale(2.6)', opacity: 0 }], { duration: 520, easing: 'ease-out' });
      }
      anim($('monster'), [{ opacity: 0 }, { opacity: 1 }], { duration: 240, delay: 120, easing: 'ease-out', fill: 'backwards' });
      anim(document.querySelector('.plate'), [{ transform: 'scale(1)' }, { transform: 'scale(1.1)', offset: 0.4 }, { transform: 'scale(1)' }], { duration: 220, easing: 'ease-out' });
      return;
    }
    const ghost = addFx('fx-dying', p.l, p.t);
    if (ghost) {
      ghost.style.width = p.w + 'px';
      ghost.style.height = p.h + 'px';
      ghost.innerHTML = $('monster').innerHTML;
      playFx(ghost, [
        { transform: 'translate(0, 0) scale(1, 1) rotate(0deg)', opacity: 1, filter: 'brightness(1)' },
        { transform: 'translate(10px, -16px) scale(1.1, 0.92) rotate(7deg)', opacity: 1, filter: 'brightness(2.3)', offset: 0.2 },
        { transform: `translate(${boss ? 40 : 30}px, -50px) scale(0.7) rotate(26deg)`, opacity: 0, filter: 'brightness(2.6)' },
      ], { duration: boss ? 700 : 520, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' });
    }
    // 동전이 사방으로 튀었다가 떨어진다
    const n = boss ? 11 : 4;
    for (let i = 0; i < n; i++) {
      const c = addFx('fx-coin', p.x, p.y);
      const dx = rand(-70, 70) * (boss ? 1.3 : 1), up = rand(28, 62) * (boss ? 1.3 : 1);
      playFx(c, [
        { transform: 'translate(0, 0) scale(0.6)', opacity: 1 },
        { transform: `translate(${dx * 0.6}px, ${-up}px) scale(1)`, opacity: 1, offset: 0.45, easing: 'ease-in' },
        { transform: `translate(${dx}px, ${rand(6, 22)}px) scale(0.8)`, opacity: 0 },
      ], { duration: rand(520, 760), delay: rand(0, 90), easing: 'ease-out' });
    }
    if (boss) {
      const ring = addFx('fx-ring', p.x, p.y);
      playFx(ring, [{ transform: 'scale(0.3)', opacity: 1 }, { transform: 'scale(3.6)', opacity: 0 }], { duration: 620, easing: 'ease-out' });
      shakeScene(7);
    }
    // 새 몬스터 등장
    anim($('monster'), [
      { transform: 'translateY(16px) scale(0.6, 0.5)', opacity: 0 },
      { transform: 'translateY(-6px) scale(1.06, 1.08)', opacity: 1, offset: 0.65 },
      { transform: 'translateY(0) scale(1, 1)', opacity: 1 },
    ], { duration: 400, delay: 150, easing: 'ease-out', fill: 'backwards' });
    // 골드 표시가 톡 튄다
    anim(document.querySelector('.plate'), [{ transform: 'scale(1)' }, { transform: 'scale(1.16)', offset: 0.35 }, { transform: 'scale(1)' }], { duration: 260, easing: 'ease-out' });
  }

  // 화면 전체가 짧게 흔들린다 (세기가 점점 줄어든다)
  function shakeScene(power) {
    if (calm()) return;   // 차분하게: 화면 흔들림 없음
    anim(sceneEl, [
      { transform: 'translate(0, 0)' },
      { transform: `translate(${-power}px, ${power * 0.4}px)`, offset: 0.15 },
      { transform: `translate(${power * 0.8}px, ${-power * 0.3}px)`, offset: 0.35 },
      { transform: `translate(${-power * 0.45}px, ${power * 0.2}px)`, offset: 0.6 },
      { transform: `translate(${power * 0.2}px, 0)`, offset: 0.82 },
      { transform: 'translate(0, 0)' },
    ], { duration: 380, easing: 'ease-out' });
  }

  // 보스 등장: 화면이 붉게 번쩍이고 흔들린다
  function bossIntro() {
    anim($('flash'), [{ opacity: 0 }, { opacity: calm() ? 0.45 : 1, offset: 0.2 }, { opacity: 0 }], { duration: 700, easing: 'ease-out' });
    shakeScene(6);
    floatText('BOSS!', 'float--tap', 'center');
  }

  // 레벨업: 발밑에서 금빛 고리가 퍼지고 몸이 반짝인다
  let lastLvFx = 0;
  function levelUpFx() {
    const now = Date.now();
    if (now - lastLvFx < 700) return;   // 연달아 오를 때는 한 번만
    lastLvFx = now;
    const p = spot($('heroSprite'), 0.5, 0.95);
    const ring = addFx('fx-lv', p.x, p.y);
    playFx(ring, [
      { transform: 'scale(0.3) translateY(0)', opacity: 1 },
      { transform: 'scale(1.7) translateY(-46px)', opacity: 0 },
    ], { duration: 720, easing: 'ease-out' });
    floatText('LEVEL UP!', 'float--lv', 'hero');
    const img = $('hero').firstElementChild;
    if (img && !calm()) {
      const base = baseFilter(img);
      anim(img, [{ filter: base + ' brightness(1.9) saturate(1.3)' }, { filter: base }], { duration: 520, easing: 'ease-out' });
    }
  }

  // 몬스터도 가끔 달려들고, 고블린은 맞는 순간 움찔하며 붉게 번쩍인다
  let enemyAtkT = 0;
  function enemyAttackFx(dt) {
    if (calm()) return;   // 차분하게: 몬스터가 달려드는 연출은 없다
    if (state.downT > 0) { enemyAtkT = 0; return; }
    enemyAtkT += dt;
    const period = G.isBossStage(state.stage) ? 1.5 : 1.15;
    if (enemyAtkT < period) return;
    enemyAtkT = 0;
    anim($('monster'), [
      { transform: 'translate(0, 0) scale(1, 1)' },
      { transform: 'translate(8px, 0) scale(1.05, 0.94)', offset: 0.28, easing: 'cubic-bezier(0.5, 0, 1, 0.6)' },
      { transform: 'translate(-40px, -2px) scale(0.94, 1.06)', offset: 0.5, easing: 'ease-out' },
      { transform: 'translate(-34px, 0) scale(1, 1)', offset: 0.62 },
      { transform: 'translate(0, 0) scale(1, 1)' },
    ], { duration: 460 });
    const heroBody = $('hero');
    animHero([
      { transform: 'translate(0, 0) scale(1, 1)' },
      { transform: 'translate(-9px, 0) scale(1.04, 0.96) rotate(-3deg)', offset: 0.3 },
      { transform: 'translate(0, 0) scale(1, 1)' },
    ], { duration: 280, delay: 220, easing: 'ease-out' });
    const img = heroBody.firstElementChild;
    if (img) {
      const base = baseFilter(img);
      anim(img, [{ filter: base + ' brightness(1.5) sepia(1) saturate(4) hue-rotate(-40deg)' }, { filter: base }], { duration: 260, delay: 220, easing: 'ease-out' });
    }
  }

  // 영웅·전설 장비가 떨어지면 등급 색 고리가 퍼지고 (전설은 화면도 번쩍이며 흔들린다)
  function rareDropFx(rarity) {
    const color = G.RARITIES[rarity].color;
    const p = spot($('monsterSprite'), 0.5, 0.5);
    for (let i = 0; i < (calm() ? 1 : 2); i++) {
      const ring = addFx('fx-ring', p.x, p.y);
      if (ring) ring.style.borderColor = color;
      playFx(ring, [{ transform: 'scale(0.3)', opacity: 1 }, { transform: `scale(${3.2 + i * 1.6})`, opacity: 0 }], { duration: 620 + i * 200, delay: i * 120, easing: 'ease-out' });
    }
    if (rarity >= 4 && !calm()) {
      const flash = $('flash');
      const glow = rarity >= 6 ? 'rgba(57, 240, 255, 0.8)' : rarity >= 5 ? 'rgba(255, 93, 154, 0.75)' : 'rgba(255, 201, 58, 0.7)';
      flash.style.background = `radial-gradient(ellipse at 50% 55%, transparent 30%, ${glow})`;
      const a = anim(flash, [{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 0 }], { duration: rarity >= 5 ? 1200 : 800, easing: 'ease-out' });
      if (a) a.onfinish = () => { flash.style.background = ''; };
      else flash.style.background = '';
      shakeScene(rarity >= 6 ? 9 : rarity >= 5 ? 6 : 4);
      if (rarity >= 5) for (let i = 0; i < (rarity >= 6 ? 3 : 2); i++) ringFx(p.x, p.y, color, 4.4 + i * 1.8, 900 + i * 220, 160 + i * 140);
    }
  }

  // 카드가 빛나며 살짝 커졌다 돌아온다 (구매 성공 표시)
  function pulse(el) {
    anim(el, [
      { boxShadow: '0 0 0 0 rgba(255, 212, 121, 0)', transform: 'scale(1)' },
      { boxShadow: '0 0 18px 3px rgba(255, 212, 121, 0.65)', transform: 'scale(1.015)', offset: 0.35 },
      { boxShadow: '0 0 0 0 rgba(255, 212, 121, 0)', transform: 'scale(1)' },
    ], { duration: 460, easing: 'ease-out' });
  }
  function popIn(el) {
    anim(el, [{ transform: 'scale(1.7)', opacity: 0.4 }, { transform: 'scale(0.92)', offset: 0.6 }, { transform: 'scale(1)', opacity: 1 }], { duration: 300, easing: 'ease-out' });
  }

  // 고블린이 한 번 때릴 때마다 부르는 연출 (여러 번 때린 프레임에도 한 번만)
  // ---- 스프라이트 이펙트 ----
  // images/vfx/<이름>.webp 그림을 크기·회전·투명도로 움직인다. 그림이 없으면 null을 돌려주고, 부른 쪽이 CSS 이펙트로 대신 그린다.
  function sprite(name, x, y, o) {
    o = o || {};
    const url = A.vfx(name);
    if (!url) return null;
    const size = o.size || 90;
    const el = addFx('fx-sprite', x, y);
    if (!el) return null;
    el.style.width = el.style.height = size + 'px';
    el.style.margin = `${-size / 2}px 0 0 ${-size / 2}px`;
    el.style.backgroundImage = `url("${url}")`;
    if (o.screen) el.style.mixBlendMode = 'screen';
    if (o.filter) el.style.filter = o.filter;
    const r0 = o.rot !== undefined ? o.rot : rand(-20, 20), r1 = o.rot2 !== undefined ? o.rot2 : r0 + rand(-25, 25);
    const s0 = o.from || 0.4, s1 = o.to || 1.2, op = o.opacity || 1;
    const x0 = o.dx0 || 0, y0 = o.dy0 || 0, x1 = o.dx1 || 0, y1 = o.dy1 || 0;
    playFx(el, [
      { transform: `translate(${x0}px, ${y0}px) scale(${s0}) rotate(${r0}deg)`, opacity: 0 },
      { transform: `translate(${(x0 + x1) / 2}px, ${(y0 + y1) / 2}px) scale(${(s0 + s1) / 2}) rotate(${(r0 + r1) / 2}deg)`, opacity: op, offset: 0.25 },
      { transform: `translate(${x1}px, ${y1}px) scale(${s1}) rotate(${r1}deg)`, opacity: 0 },
    ], { duration: o.dur || 420, delay: o.delay || 0, easing: 'ease-out' });
    return el;
  }
  // 그림이 없을 때 대신 쓰는 색 고리
  function ringFx(x, y, color, scale, dur, delay) {
    const ring = addFx('fx-ring', x, y);
    if (ring) ring.style.borderColor = color;
    playFx(ring, [{ transform: 'scale(0.4)', opacity: 1 }, { transform: `scale(${scale || 2.4})`, opacity: 0 }], { duration: dur || 600, delay: delay || 0, easing: 'ease-out' });
  }

  // ---- 직업별 공격 모션 ----
  // 근접 직업(기사·광전사 등)은 제자리에서 무기를 휘두르고 몬스터 쪽에 베는 궤적이 남는다.
  // 원거리 직업은 표창·화살·마법구·총알 같은 것을 날려 보낸다. 예전처럼 앞으로 달려갔다 돌아오지 않는다.
  const ARC_CLASS = { slash: 'arc--slash', axe: 'arc--axe', holy: 'arc--holy', dagger: 'arc--dagger' };
  const FLIGHT_MS = { bullet: 110, arrow: 190, bolt: 170, shuriken: 210, coin: 230, orb: 240, fire: 260, dark: 260 };
  // 무기마다 실제 그림에서 쥐고 있는 위치가 달라서, 종류별로 손(무기) 자리를 따로 잡는다 (그림을 보고 눈대중으로 맞춤).
  const HAND_SPOT = {
    slash: [0.74, 0.58], axe: [0.72, 0.56], hammer: [0.7, 0.54], holy: [0.76, 0.58], dagger: [0.72, 0.62],
    arrow: [0.74, 0.55], bolt: [0.7, 0.56], bullet: [0.86, 0.46],
    shuriken: [0.7, 0.64], coin: [0.76, 0.62],
    orb: [0.8, 0.26], fire: [0.78, 0.24], dark: [0.78, 0.26],
  };
  // 손 자리에 무기 모양(#heroWeapon)을 하나 붙여 둔다. #hero의 자식이라서 몸이 흔들리면 무기도 그대로 따라 흔들리고,
  // 공격할 때는 여기에 무기 자신의 회전도 함께 걸어서(WEAPON_ANIM) 몸보다 더 크게 휘두르는 것처럼 보이게 한다.
  // 원거리는 이 무기의 실제 화면 위치에서 투사체가 나가서, 몸이 움직인 뒤의 진짜 손 위치와 항상 맞는다.
  const WEAPON_ANIM = {
    slash:    { origin: '82% 62%', dur: 300, kf: [{ transform: 'rotate(0deg)', opacity: 0 }, { transform: 'rotate(-42deg)', opacity: 1, offset: 0.18 }, { transform: 'rotate(48deg)', opacity: 1, offset: 0.55 }, { transform: 'rotate(0deg)', opacity: 0, offset: 0.8 }] },
    axe:      { origin: '78% 68%', dur: 420, kf: [{ transform: 'rotate(0deg)', opacity: 0 }, { transform: 'rotate(-58deg)', opacity: 1, offset: 0.22 }, { transform: 'rotate(52deg)', opacity: 1, offset: 0.62 }, { transform: 'rotate(0deg)', opacity: 0, offset: 0.85 }] },
    hammer:   { origin: '72% 74%', dur: 440, kf: [{ transform: 'rotate(0deg)', opacity: 0 }, { transform: 'rotate(-62deg)', opacity: 1, offset: 0.2 }, { transform: 'rotate(46deg)', opacity: 1, offset: 0.6 }, { transform: 'rotate(0deg)', opacity: 0, offset: 0.85 }] },
    holy:     { origin: '82% 66%', dur: 400, kf: [{ transform: 'rotate(0deg) scale(1)', opacity: 0 }, { transform: 'rotate(-34deg) scale(1.08)', opacity: 1, offset: 0.2 }, { transform: 'rotate(42deg) scale(1)', opacity: 1, offset: 0.68 }, { transform: 'rotate(0deg) scale(1)', opacity: 0, offset: 0.88 }] },
    dagger:   { origin: '78% 60%', dur: 280, kf: [{ transform: 'rotate(0deg)', opacity: 0 }, { transform: 'rotate(32deg)', opacity: 1, offset: 0.2 }, { transform: 'rotate(4deg)', opacity: 1, offset: 0.45 }, { transform: 'rotate(32deg)', opacity: 1, offset: 0.7 }, { transform: 'rotate(0deg)', opacity: 0, offset: 0.9 }] },
    arrow:    { origin: '100% 50%', dur: 460, kf: [{ transform: 'rotate(0deg) scaleX(1)', opacity: 0 }, { transform: 'rotate(0deg) scaleX(1)', opacity: 1, offset: 0.08 }, { transform: 'rotate(-5deg) scaleX(0.8)', opacity: 1, offset: 0.55 }, { transform: 'rotate(4deg) scaleX(1.08)', opacity: 1, offset: 0.64 }, { transform: 'rotate(0deg) scaleX(1)', opacity: 0, offset: 0.85 }] },
    bolt:     { origin: '90% 50%', dur: 260, kf: [{ transform: 'rotate(0deg)', opacity: 0 }, { transform: 'rotate(0deg)', opacity: 1, offset: 0.08 }, { transform: 'rotate(-16deg)', opacity: 1, offset: 0.35 }, { transform: 'rotate(11deg)', opacity: 1, offset: 0.55 }, { transform: 'rotate(0deg)', opacity: 0, offset: 0.8 }] },
    bullet:   { origin: '15% 50%', dur: 220, kf: [{ transform: 'rotate(0deg)', opacity: 0 }, { transform: 'rotate(0deg)', opacity: 1, offset: 0.05 }, { transform: 'rotate(4deg)', opacity: 1, offset: 0.15 }, { transform: 'rotate(-12deg)', opacity: 1, offset: 0.4 }, { transform: 'rotate(0deg)', opacity: 0, offset: 0.75 }] },
    shuriken: { origin: '50% 50%', dur: 320, kf: [{ transform: 'rotate(0deg)', opacity: 0 }, { transform: 'rotate(45deg)', opacity: 1, offset: 0.22 }, { transform: 'rotate(-60deg)', opacity: 1, offset: 0.6 }, { transform: 'rotate(0deg)', opacity: 0, offset: 0.85 }] },
    coin:     { origin: '50% 100%', dur: 300, kf: [{ transform: 'rotate(0deg) translateY(0)', opacity: 0 }, { transform: 'rotate(-18deg) translateY(3px)', opacity: 1, offset: 0.25 }, { transform: 'rotate(22deg) translateY(-8px)', opacity: 1, offset: 0.65 }, { transform: 'rotate(0deg) translateY(0)', opacity: 0, offset: 0.88 }] },
    orb:      { origin: '50% 100%', dur: 300, kf: [{ transform: 'translateY(0) scale(0.6)', opacity: 0 }, { transform: 'translateY(-5px) scale(1.15)', opacity: 1, offset: 0.5 }, { transform: 'translateY(0) scale(0.6)', opacity: 0, offset: 0.9 }] },
    fire:     { origin: '50% 100%', dur: 420, kf: [{ transform: 'translateY(0) scale(0.6)', opacity: 0 }, { transform: 'translateY(2px) scale(0.5)', opacity: 1, offset: 0.5 }, { transform: 'translateY(-4px) scale(1.3)', opacity: 1, offset: 0.76 }, { transform: 'translateY(0) scale(0.6)', opacity: 0, offset: 0.92 }] },
    dark:     { origin: '50% 100%', dur: 420, kf: [{ transform: 'translateY(0) scale(0.6)', opacity: 0 }, { transform: 'translateY(3px) scale(0.5)', opacity: 1, offset: 0.5 }, { transform: 'translateY(-5px) scale(1.25)', opacity: 1, offset: 0.76 }, { transform: 'translateY(0) scale(0.6)', opacity: 0, offset: 0.92 }] },
  };
  // 직업이 바뀔 때 무기 모양·자리를 다시 잡는다 (render()에서 그림을 새로 그릴 때 함께 부른다)
  function setupHeroWeapon() {
    const el = $('heroWeapon');
    if (!el) return;
    const style = G.attackStyle(state);
    const [fx, fy] = HAND_SPOT[style] || [0.78, 0.42];
    el.className = 'hero-weapon hw--' + style;
    // 근접은 무기 모양을 겹쳐 그리지 않는다: AI 그림마다 무기를 든 손·위치가 달라서(기사는 왼손, 산의 지배자는 맨손)
    // 가짜 무기가 엉뚱한 곳(방패 앞·배)에서 휘둘러졌다. 대신 몸 앞쪽에 휘두르는 궤적(heroTrail)을 그린다.
    el.hidden = G.MELEE_STYLES.includes(style);
    el.style.left = (fx * 100) + '%';
    el.style.top = (fy * 100) + '%';
    const wa = WEAPON_ANIM[style];
    el.style.transformOrigin = wa ? wa.origin : '50% 50%';
  }
  function animWeapon(style) {
    const el = $('heroWeapon'), wa = WEAPON_ANIM[style];
    if (!el || !wa) return;
    if (el.getAnimations) for (const a of el.getAnimations()) a.cancel();
    anim(el, wa.kf, { duration: wa.dur });
  }
  // 무기 자리: #heroWeapon이 있으면 지금 실제 화면 위치(공격 중이면 흔들린 뒤 위치)를 쓰고, 없으면 눈대중 비율을 쓴다.
  const handPos = (style) => {
    const el = $('heroWeapon');
    if (el) { const r = el.getBoundingClientRect(), s = sceneEl.getBoundingClientRect(); return { x: r.left - s.left + r.width / 2, y: r.top - s.top + r.height / 2 }; }
    const [fx, fy] = HAND_SPOT[style] || [0.78, 0.42];
    return spot($('heroSprite'), fx, fy);
  };
  const targetPos = () => spot($('monsterSprite'), 0.42, 0.5);  // 몬스터의 몸통

  // 근접: 몸을 살짝 젖혔다가 휘두르고 돌아온다. 몬스터에 닿는 시각(ms)을 돌려준다.
  function swingBody(style, soft) {
    const k = soft ? 0.6 : 1;
    let kf, dur, hit;
    if (style === 'hammer') {   // 망치: 위로 들어 올렸다가 내리찍는다
      dur = 440; hit = 0.6;
      kf = [{ transform: 'translate(0, 0) rotate(0deg)' }, { transform: `translate(-4px, ${-10 * k}px) rotate(${-8 * k}deg)`, offset: 0.35, easing: 'ease-in' },
        { transform: `translate(${9 * k}px, ${2 * k}px) rotate(${9 * k}deg)`, offset: 0.6 }, { transform: 'translate(0, 0) rotate(0deg)' }];
    } else if (style === 'dagger') {   // 단검: 빠르게 두 번 찌른다
      dur = 280; hit = 0.3;
      kf = [{ transform: 'translate(0, 0)' }, { transform: `translate(${8 * k}px, 0) rotate(${5 * k}deg)`, offset: 0.25 }, { transform: 'translate(0, 0)', offset: 0.45 },
        { transform: `translate(${8 * k}px, 0) rotate(${5 * k}deg)`, offset: 0.7 }, { transform: 'translate(0, 0)' }];
    } else if (style === 'axe') {   // 도끼: 크게 뒤로 들어 올렸다가 대각선으로 무겁게 내려찍는다
      dur = 420; hit = 0.62;
      kf = [{ transform: 'translate(0, 0) rotate(0deg)' }, { transform: `translate(${-3 * k}px, ${-9 * k}px) rotate(${-18 * k}deg)`, offset: 0.4, easing: 'cubic-bezier(0.6, 0, 1, 0.5)' },
        { transform: `translate(${10 * k}px, ${4 * k}px) rotate(${14 * k}deg)`, offset: 0.62, easing: 'ease-out' }, { transform: 'translate(0, 0) rotate(0deg)' }];
    } else if (style === 'holy') {   // 성검: 잠깐 들어 올려 빛을 모았다가 우아하게 내려친다
      dur = 400; hit = 0.65;
      kf = [{ transform: 'translate(0, 0) rotate(0deg) scale(1, 1)' }, { transform: `translate(0, ${-6 * k}px) rotate(${-6 * k}deg) scale(${1 + 0.02 * k}, 1)`, offset: 0.45, easing: 'ease-in' },
        { transform: `translate(${8 * k}px, 0) rotate(${9 * k}deg) scale(1, 1)`, offset: 0.68, easing: 'ease-out' }, { transform: 'translate(0, 0) rotate(0deg) scale(1, 1)' }];
    } else {   // 칼(기본): 짧게 젖혔다가 빠르게 휘두른다
      dur = 300; hit = 0.5;
      kf = [{ transform: 'translate(0, 0) rotate(0deg)' }, { transform: `translate(${-4 * k}px, 0) rotate(${-9 * k}deg)`, offset: 0.3, easing: 'cubic-bezier(0.5, 0, 1, 0.6)' },
        { transform: `translate(${11 * k}px, 1px) rotate(${10 * k}deg)`, offset: 0.55, easing: 'ease-out' }, { transform: 'translate(0, 0) rotate(0deg)' }];
    }
    animHero(kf, { duration: dur });
    heroTrail(style, dur, hit, soft);
    return dur * hit;
  }
  // 근접 궤적: 몸 앞쪽(몬스터 쪽)에 휘두름 궤적 그림(images/vfx/swing_*)을 고정 방향으로 놓고,
  // 무기가 지나가는 방향(위→아래, 단검은 뒤→앞)으로 '그려지듯' 드러났다가 사라지게 한다.
  // 예전에는 초승달 테두리를 빙글 돌려서 로딩 스피너처럼 보였다 — 절대 회전시키지 않는다.
  const TRAIL = {
    slash:  { img: 'swing_sword',   fx: 0.96, fy: 0.4,  size: 118, wipe: 'down' },
    holy:   { img: 'swing_holy',    fx: 0.96, fy: 0.4,  size: 124, wipe: 'down' },
    axe:    { img: 'swing_axe',     fx: 1.02, fy: 0.4,  size: 124, wipe: 'down' },
    hammer: { img: 'swing_hammer',  fx: 1.0,  fy: 0.62, size: 128, wipe: 'down', flip: true },   // 그림이 오른쪽 위→왼쪽 아래라 좌우를 뒤집어 쓴다
    dagger: { img: 'thrust_dagger', fx: 0.95, fy: 0.5,  size: 92,  wipe: 'right' },
  };
  function heroTrail(style, dur, hit, soft) {
    const hero = $('heroSprite'), t = TRAIL[style];
    if (!hero || !t) return;
    const url = A.vfx(t.img);
    if (!url) return;
    const sc = soft ? 0.85 : 1, size = t.size * sc;
    const p = spot(hero, t.fx, t.fy);
    const hidden = t.wipe === 'right' ? 'inset(0 100% 0 0)' : 'inset(0 0 100% 0)';
    const shown = 'inset(0 0 0 0)';
    const flip = t.flip ? ' scaleX(-1)' : '';
    const play = (delay, span) => {
      const el = addFx('fx-sprite fx-swing', p.x, p.y);
      if (!el) return;
      el.style.width = el.style.height = size + 'px';
      el.style.margin = `${-size / 2}px 0 0 ${-size / 2}px`;
      el.style.backgroundImage = `url("${url}")`;
      const dx = t.wipe === 'right' ? 14 : 4;
      playFx(el, [
        { clipPath: hidden, transform: `translate(0, 0)${flip}`, opacity: 1 },
        { clipPath: shown, transform: `translate(${dx * 0.6}px, 0)${flip}`, opacity: 1, offset: 0.45 },
        { clipPath: shown, transform: `translate(${dx}px, 0)${flip}`, opacity: 0 },
      ], { duration: span, delay, easing: 'cubic-bezier(0.3, 0, 0.3, 1)' });
    };
    if (style === 'dagger') { play(dur * 0.12, dur * 0.4); play(dur * 0.5, dur * 0.4); return; }   // 두 번 찌른다
    const span = Math.max(160, dur * 0.5);
    play(Math.max(0, dur * hit - span * 0.45), span);   // 궤적이 다 그려지는 순간이 몬스터에 닿는 순간과 맞게
  }
  // 근접: 몬스터 위에 베는 궤적(호)이나 내리찍는 충격파를 그린다
  function arcFx(style, strong, delay) {
    const p = targetPos();
    if (style === 'hammer') {
      if (!calm() || strong) sprite('explosion_fire', p.x, p.y + 8, { size: strong ? 190 : 130, delay, dur: 420, from: 0.4, to: 1.1, screen: true });
      const ring = addFx('fx-ring', p.x, p.y + 12);
      playFx(ring, [{ transform: 'scale(0.3, 0.15)', opacity: 1 }, { transform: `scale(${strong ? 2.4 : 1.7}, ${strong ? 1.1 : 0.8})`, opacity: 0 }], { duration: 380, delay, easing: 'ease-out' });
      return;
    }
    // 화려하게: 궤적 그림을 크게 그린다 (그림이 없으면 아래 CSS 궤적)
    const ARC_SPRITE = { slash: 'slash_white', axe: 'slash_fire', holy: 'slash_gold', dagger: 'claw_slash' };
    if (!calm() || strong) {
      const sp = sprite(ARC_SPRITE[style] || 'slash_white', p.x, p.y, { size: strong ? 190 : 130, delay, dur: 320, from: 0.5, to: 1.15, screen: style !== 'dagger' });
      if (sp) return;
    }
    const strokes = style === 'dagger' ? 2 : 1;
    for (let i = 0; i < strokes; i++) {
      const el = addFx('fx-arc ' + (ARC_CLASS[style] || 'arc--slash'), p.x + i * 6, p.y + i * 8);
      const rot = rand(-25, 25) + i * 40;
      playFx(el, [
        { transform: `rotate(${rot - 60}deg) scale(0.5)`, opacity: 0 },
        { transform: `rotate(${rot}deg) scale(${strong ? 1.3 : 1})`, opacity: 1, offset: 0.35 },
        { transform: `rotate(${rot + 35}deg) scale(1.1)`, opacity: 0 },
      ], { duration: 250, delay: delay + i * 90, easing: 'ease-out' });
    }
  }
  // 원거리: 무기마다 다른 동작 (총 반동, 활 당김-발사, 석궁 들어올림, 표창 몸을 틀어 던지기, 동전 튕기기, 마법 시전).
  // 몸동작이 끝나고 실제로 손을 떠나는 시각(ms)을 돌려준다 (투사체는 이 시각에 맞춰 날아간다).
  function shootBody(style, soft) {
    const k = soft ? 0.6 : 1;
    let kf, dur, release;
    switch (style) {
      case 'bullet':   // 총: 거의 즉시 쏘고 짧게 반동한다
        dur = 220; release = 0.15;
        kf = [{ transform: 'translate(0, 0) rotate(0deg)' },
          { transform: `translate(${1 * k}px, 0) rotate(${-1 * k}deg)`, offset: 0.15 },
          { transform: `translate(${-8 * k}px, ${1 * k}px) rotate(${5 * k}deg)`, offset: 0.4, easing: 'ease-out' },
          { transform: 'translate(0, 0) rotate(0deg)' }];
        break;
      case 'arrow':   // 활: 시위를 당겨 버티다가 놓는다
        dur = 460; release = 0.6;
        kf = [{ transform: 'translate(0, 0) rotate(0deg)' },
          { transform: `translate(${-8 * k}px, 0) rotate(${-7 * k}deg)`, offset: 0.55, easing: 'cubic-bezier(0.4, 0, 0.2, 1)' },
          { transform: `translate(${7 * k}px, 0) rotate(${6 * k}deg)`, offset: 0.72, easing: 'ease-out' },
          { transform: 'translate(0, 0) rotate(0deg)' }];
        break;
      case 'bolt':   // 석궁: 짧게 들어 올렸다가 바로 쏜다
        dur = 260; release = 0.4;
        kf = [{ transform: 'translate(0, 0) rotate(0deg)' },
          { transform: `translate(0, ${-4 * k}px) rotate(${-4 * k}deg)`, offset: 0.35 },
          { transform: `translate(${4 * k}px, 0) rotate(${3 * k}deg)`, offset: 0.55, easing: 'ease-out' },
          { transform: 'translate(0, 0) rotate(0deg)' }];
        break;
      case 'shuriken':   // 표창: 팔을 크게 젖혔다가 몸을 틀며 던진다
        dur = 320; release = 0.45;
        kf = [{ transform: 'translate(0, 0) rotate(0deg)' },
          { transform: `translate(${6 * k}px, 0) rotate(${11 * k}deg)`, offset: 0.35, easing: 'ease-in' },
          { transform: `translate(${-9 * k}px, 0) rotate(${-15 * k}deg)`, offset: 0.6, easing: 'ease-out' },
          { transform: 'translate(0, 0) rotate(0deg)' }];
        break;
      case 'coin':   // 동전: 살짝 숙였다가 튕겨 던진다
        dur = 300; release = 0.5;
        kf = [{ transform: 'translate(0, 0) rotate(0deg)' },
          { transform: `translate(0, ${4 * k}px) rotate(${-4 * k}deg)`, offset: 0.4, easing: 'ease-in' },
          { transform: `translate(0, ${-6 * k}px) rotate(${7 * k}deg)`, offset: 0.65, easing: 'ease-out' },
          { transform: 'translate(0, 0) rotate(0deg)' }];
        break;
      case 'fire':   // 화염: 크게 힘을 모았다가 내지른다
        dur = 420; release = 0.68;
        kf = [{ transform: 'translate(0, 0) scale(1, 1)' },
          { transform: `translate(${-4 * k}px, 0) scale(${1 + 0.05 * k}, ${1 - 0.03 * k})`, offset: 0.55, easing: 'ease-in' },
          { transform: `translate(${6 * k}px, 0) scale(1, 1)`, offset: 0.76, easing: 'ease-out' },
          { transform: 'translate(0, 0) scale(1, 1)' }];
        break;
      case 'dark':   // 어둠: 안으로 웅크렸다가 뿜어낸다
        dur = 420; release = 0.68;
        kf = [{ transform: 'translate(0, 0) scale(1, 1)' },
          { transform: `translate(0, ${3 * k}px) scale(${1 - 0.04 * k}, ${1 + 0.03 * k})`, offset: 0.55, easing: 'ease-in' },
          { transform: `translate(0, ${-4 * k}px) scale(1, 1)`, offset: 0.76, easing: 'ease-out' },
          { transform: 'translate(0, 0) scale(1, 1)' }];
        break;
      default:   // orb(마법구) 등: 살짝 떠올라 시전한다
        dur = 300; release = 0.55;
        kf = [{ transform: 'translateY(0) scale(1, 1)' }, { transform: `translateY(${-5 * k}px) scale(1.03, 0.98)`, offset: 0.5 }, { transform: 'translateY(0) scale(1, 1)' }];
    }
    animHero(kf, { duration: dur });
    animWeapon(style);
    return dur * release;
  }
  // 원거리: 손에서 몬스터까지 날아가는 것. 도착까지 걸리는 시간(ms)을 돌려준다.
  // delay가 있으면 그만큼 기다렸다가(= 무기를 놓는 순간) 손 위치를 읽고 쏜다. 공격 시작 순간 위치로 쏘면 스윙 중 움직임이 반영되지 않는다.
  function projectile(style, delay, big) {
    const flight = FLIGHT_MS[style] || 200;
    if (delay > 0) { setTimeout(() => fireProjectile(style, big), delay); return flight; }
    fireProjectile(style, big);
    return flight;
  }
  function fireProjectile(style, big) {
    const delay = 0;
    const a = handPos(style), b = targetPos();
    const dx = b.x - a.x, dy = b.y - a.y + rand(-8, 8);
    const ang = (Math.atan2(dy, dx) * 180) / Math.PI;
    const flight = FLIGHT_MS[style] || 200;
    const spin = style === 'shuriken' || style === 'coin';
    const sc = big ? 1.5 : 1;
    const easing = style === 'orb' || style === 'fire' || style === 'dark' ? 'ease-in' : 'linear';
    // 본체 하나와 (화려하게일 때) 뒤따르는 잔상 세 개: 같은 궤적을 조금씩 늦게, 흐리게 따라간다
    const copies = calm() ? 1 : 4;
    for (let i = 0; i < copies; i++) {
      const el = addFx('fx-proj proj--' + style, a.x, a.y);
      const fade = i === 0 ? 1 : 0.5 / i;
      const lag = i * 26;
      playFx(el, [
        { transform: `translate(0, 0) rotate(${spin ? 0 : ang}deg) scale(${0.7 * sc * (1 - i * 0.12)})`, opacity: fade },
        { transform: `translate(${dx}px, ${dy}px) rotate(${spin ? 720 : ang}deg) scale(${sc * (1 - i * 0.12)})`, opacity: fade, offset: 0.92 },
        { transform: `translate(${dx}px, ${dy}px) rotate(${spin ? 760 : ang}deg) scale(${sc * (1 - i * 0.12)})`, opacity: 0 },
      ], { duration: flight + 30, delay: delay + lag, easing });
    }
    if (style === 'bullet') {   // 총구 섬광
      const f = addFx('fx-spark', a.x + 8, a.y);
      playFx(f, [{ transform: 'scale(0.4)', opacity: 1 }, { transform: 'scale(1.4)', opacity: 0 }], { duration: 120, delay });
    }
  }
  // 그 직업의 평타 한 번: 몸동작 + 궤적/투사체 + 몬스터 피격. 몬스터에 닿는 시각(ms)을 돌려준다.
  function classAttack(strong) {
    const style = G.attackStyle(state);
    const soft = calm() && !strong;
    let land;
    if (G.MELEE_STYLES.includes(style)) { land = swingBody(style, soft); arcFx(style, strong, land); }
    else { const rel = shootBody(style, soft); land = rel + projectile(style, rel, strong); }
    monsterHit(strong, land, soft);
    if (!calm() || strong) impactSprite(style, strong, land);   // 화려하게: 맞는 순간 폭발
    return land;
  }
  const IMPACT_SPRITE = { axe: 'explosion_fire', hammer: 'explosion_fire', fire: 'explosion_fire', orb: 'explosion_magic', dark: 'explosion_magic', coin: 'coin_burst' };
  function impactSprite(style, strong, delay) {
    const p = targetPos();
    const name = IMPACT_SPRITE[style] || 'impact_burst';
    sprite(name, p.x + rand(-10, 10), p.y + rand(-10, 10), { size: strong ? 140 : 88, delay, dur: 360, from: 0.3, to: strong ? 1.3 : 1.0, screen: name !== 'coin_burst' });
  }

  // 고블린이 한 번 때릴 때마다 부르는 연출. 차분하게는 0.45초에 한 번만, 화려하게는 0.22초에 한 번(불꽃·타격 숫자 포함).
  let lastHitFx = 0;
  function onHeroHit(n) {
    const t = Date.now();
    if (t - lastHitFx < (calm() ? 450 : 220)) return;
    lastHitFx = t;
    const land = classAttack(false);
    if (calm()) return;
    impactFx(false, land);
    if (t - lastHitText > 350) {   // 연타할 때 숫자가 쏟아지지 않게 한다
      lastHitText = t;
      floatText(G.fmt(G.hitDmg(state) * n), 'float--hit', 'hit');
    }
  }

  // ---- 스킬 연출 ----
  const SKILL_COLOR = { strike: '#ffd479', multi: '#ffa25a', execute: '#ff6a7a', bossbane: '#ffe45a', summon: '#cba8ff', dot: '#8dff7a', haste: '#7ad8ff', might: '#ff7a6a', frenzy: '#ff9a4a',
    lifesteal: '#ff6a9a', heal: '#8dff7a', guard: '#8fb4ff', barrier: '#7ad8ff', stun: '#ffe45a', greed: '#ffd24a', bounty: '#ffd24a' };
  // 화면 위쪽에 스킬 배너(아이콘 + 이름)가 튀어나온다
  function skillBanner(e, color) {
    const h = spot($('heroSprite'), 0.5, 0);
    const el = addFx('skill-banner', h.x, h.t - 6);
    if (!el) return;
    const sk = G.skillFor(e.id);
    el.innerHTML = `${A.skillIcon(e.id, sk ? sk.icon : 'star')}<b style="color:${color}">${e.name}</b>`;
    playFx(el, [
      { transform: 'translate(-50%, 8px) scale(0.6)', opacity: 0 },
      { transform: 'translate(-50%, -6px) scale(1.12)', opacity: 1, offset: 0.18 },
      { transform: 'translate(-50%, -10px) scale(1)', opacity: 1, offset: 0.75 },
      { transform: 'translate(-50%, -24px) scale(0.95)', opacity: 0 },
    ], { duration: calm() ? 900 : 1300, easing: 'ease-out' });
  }
  // 동전이 튀어 올라 골드 표시로 날아간다
  function coinsToPlate(x, y, n) {
    const plate = document.querySelector('.plate').getBoundingClientRect(), sc = sceneEl.getBoundingClientRect();
    const tx = plate.left - sc.left + 20 - x, ty = plate.top - sc.top + 10 - y;
    for (let i = 0; i < n; i++) {
      const c = addFx('fx-coin', x + rand(-14, 14), y + rand(-8, 8));
      playFx(c, [{ transform: 'translate(0, 0) scale(0.7)', opacity: 1 }, { transform: `translate(${rand(-30, 30)}px, ${rand(-50, -20)}px) scale(1.1)`, opacity: 1, offset: 0.3 }, { transform: `translate(${tx}px, ${ty}px) scale(0.6)`, opacity: 0.9 }],
        { duration: rand(650, 900), delay: i * 45, easing: 'ease-in' });
    }
  }

  // ---- 풍성한 스킬 연출 ----
  // 그림 한 장을 터뜨리는 대신, 작은 조각(입자·기둥·고리·문장·날개·속도선)을 겹쳐서 직업 계열마다 다른 색과 모양으로 보여 준다. 차분한 모드에서는 쓰지 않는다.
  // 계열(theme): 색 두 가지(c 밝은 색, c2 진한 색)와 문장 아이콘
  const THEMES = {
    steel:  { c: '#e6f0ff', c2: '#7ab0ff', icon: 'shield' },   // 기사: 강철
    holy:   { c: '#fff4b0', c2: '#ffd24a', icon: 'star' },     // 성기사·십자군·성왕: 신성
    rage:   { c: '#ffb08a', c2: '#ff4a2a', icon: 'sword' },    // 광전사·전쟁군주·거인
    wind:   { c: '#b8ffe0', c2: '#3adfff', icon: 'boots' },    // 궁수·저격수
    nature: { c: '#c8ff9a', c2: '#5adf5a', icon: 'heart' },    // 레인저·야수
    fire:   { c: '#ffe08a', c2: '#ff7a2a', icon: 'burst' },    // 화염술사
    arcane: { c: '#d8c0ff', c2: '#7a6aff', icon: 'star' },     // 마법사
    dark:   { c: '#e0b0ff', c2: '#9a3aff', icon: 'skull' },    // 사령술사
    shadow: { c: '#c0c8ff', c2: '#5a4aff', icon: 'bolt' },     // 도적·암살자
    gold:   { c: '#fff0a0', c2: '#ffb020', icon: 'coin' },     // 해적
  };
  const themeCache = {};
  function themeOf(id) {
    if (themeCache[id]) return themeCache[id];
    const chain = [];
    for (let c = id; c && chain.length < 6; c = G.NODES[c] && G.NODES[c].parent) chain.push(c);
    const has = (x) => chain.includes(x);
    const name = id === 'knight' ? 'steel' : has('knight') ? 'holy' : has('berserker') ? 'rage' : has('ranger') ? 'nature' : has('sniper') || has('archer') ? 'wind'
      : has('pyromancer') ? 'fire' : has('necromancer') ? 'dark' : has('mage') ? 'arcane' : has('assassin') || has('rogue') ? 'shadow' : has('pirate') ? 'gold' : has('warrior') ? 'steel' : 'holy';
    return (themeCache[id] = THEMES[name]);
  }
  // 입자 하나: 각도·거리만큼 튀어 나가며 사라진다
  function part(x, y, o) {
    const el = addFx('fx-part' + (o.star ? ' fx-part--star' : ''), x, y);
    if (!el) return;
    const size = o.size || 6;
    el.style.width = el.style.height = size + 'px';
    el.style.margin = `${-size / 2}px 0 0 ${-size / 2}px`;
    el.style.background = o.color;
    el.style.boxShadow = `0 0 ${Math.round(size * 1.6)}px ${o.glow || o.color}`;
    const dx = Math.cos(o.angle) * o.dist, dy = Math.sin(o.angle) * o.dist + (o.fall || 0);
    playFx(el, [{ transform: 'translate(0, 0) scale(1) rotate(0deg)', opacity: 1 }, { transform: `translate(${dx * 0.6}px, ${dy * 0.6}px) scale(${1 + (o.grow || 0)}) rotate(${o.spin || 0}deg)`, opacity: 1, offset: 0.55 },
      { transform: `translate(${dx}px, ${dy}px) scale(0.15) rotate(${(o.spin || 0) * 2}deg)`, opacity: 0 }], { duration: o.dur || 620, delay: o.delay || 0, easing: 'cubic-bezier(.2, .7, .3, 1)' });
  }
  const richN = (n) => Math.max(1, Math.round(n * (calm() ? 0 : 1)));
  function burst(x, y, th, n, dist, o) {   // 사방으로 튀는 불꽃
    o = o || {};
    for (let i = 0; i < richN(n); i++) part(x, y, { color: i % 2 ? th.c : th.c2, glow: th.c2, size: rand(4, o.size || 8), angle: (i / n) * Math.PI * 2 + rand(-0.25, 0.25), dist: rand(dist * 0.55, dist), dur: o.dur || 620, delay: o.delay || 0, fall: o.fall || 0, star: i % 3 === 0, spin: rand(-90, 90) });
  }
  function rise(x, y, spread, th, n, o) {   // 위로 떠오르는 빛 알갱이
    o = o || {};
    for (let i = 0; i < richN(n); i++) part(x + rand(-spread, spread), y + rand(-4, 14), { color: i % 2 ? th.c : th.c2, glow: th.c2, size: rand(3, 7), angle: -Math.PI / 2 + rand(-0.35, 0.35), dist: rand(o.dist ? o.dist * 0.6 : 40, o.dist || 90), dur: rand(700, 1100), delay: (o.delay || 0) + i * (o.gap || 55), star: i % 2 === 0, spin: rand(-60, 60) });
  }
  function rain(x, y, spread, th, n, o) {   // 위에서 떨어지는 조각 (깃털·동전·불씨)
    o = o || {};
    for (let i = 0; i < richN(n); i++) part(x + rand(-spread, spread), y - (o.h || 110) + rand(-10, 10), { color: i % 2 ? th.c : th.c2, glow: th.c2, size: rand(4, 8), angle: Math.PI / 2 + rand(-0.15, 0.15), dist: (o.h || 110) + rand(0, 20), dur: rand(600, 900), delay: (o.delay || 0) + i * (o.gap || 45), star: true, spin: rand(-120, 120) });
  }
  function pillar(x, y, th, o) {   // 위에서 내려꽂히는 빛기둥
    o = o || {};
    const h = o.h || 170, w = o.w || 34;
    const el = addFx('fx-pillar', x, y - h);
    if (!el) return;
    el.style.width = w + 'px'; el.style.height = h + 'px'; el.style.marginLeft = -w / 2 + 'px';
    el.style.background = `linear-gradient(to bottom, transparent, ${th.c2} 30%, ${th.c} 70%, ${th.c2})`;
    el.style.boxShadow = `0 0 18px ${th.c2}`;
    playFx(el, [{ transform: 'scaleX(0.2) scaleY(0.4)', opacity: 0, transformOrigin: '50% 0' }, { transform: 'scaleX(1) scaleY(1)', opacity: 0.95, offset: 0.25, transformOrigin: '50% 0' }, { transform: 'scaleX(0.3) scaleY(1)', opacity: 0, transformOrigin: '50% 0' }], { duration: o.dur || 520, delay: o.delay || 0, easing: 'ease-out' });
  }
  function groundRing(x, y, th, scale, dur, delay) {   // 발밑에 퍼지는 타원 고리
    const el = addFx('fx-ground', x, y);
    if (!el) return;
    el.style.borderColor = th.c; el.style.boxShadow = `0 0 12px ${th.c2}, inset 0 0 10px ${th.c2}`;
    playFx(el, [{ transform: 'scale(0.3)', opacity: 1 }, { transform: `scale(${scale || 2.6})`, opacity: 0 }], { duration: dur || 700, delay: delay || 0, easing: 'ease-out' });
  }
  function emblem(icon, x, y, th, o) {   // 큰 문장이 쿵 하고 나타났다 떠오른다
    o = o || {};
    const el = addFx('fx-emblem', x, y);
    if (!el) return;
    el.innerHTML = A.icon(icon);
    el.style.filter = `drop-shadow(0 0 10px ${th.c2}) drop-shadow(0 0 3px ${th.c})`;
    const size = o.size || 58;
    el.style.width = el.style.height = size + 'px'; el.style.margin = `${-size / 2}px 0 0 ${-size / 2}px`;
    const from = o.from || -60;
    playFx(el, [{ transform: `translateY(${from}px) scale(2.2) rotate(${o.spin ? -25 : 0}deg)`, opacity: 0 }, { transform: 'translateY(0) scale(0.9) rotate(0deg)', opacity: 1, offset: 0.3 }, { transform: 'translateY(0) scale(1.08) rotate(0deg)', opacity: 1, offset: 0.5 },
      { transform: `translateY(${o.rise === undefined ? -28 : o.rise}px) scale(1.2) rotate(0deg)`, opacity: 0 }], { duration: o.dur || 900, delay: o.delay || 0, easing: 'ease-out' });
  }
  function rays(x, y, th, size, dur, delay) {   // 사방으로 뻗는 빛살이 돌면서 사라진다
    const el = addFx('fx-rays', x, y);
    if (!el) return;
    el.style.width = el.style.height = size + 'px'; el.style.margin = `${-size / 2}px 0 0 ${-size / 2}px`;
    el.style.background = `repeating-conic-gradient(from 0deg, ${th.c} 0deg 6deg, transparent 6deg 30deg)`;
    el.style.setProperty('--rc', th.c2);
    playFx(el, [{ transform: 'scale(0.3) rotate(0deg)', opacity: 0 }, { transform: 'scale(0.8) rotate(60deg)', opacity: 0.5, offset: 0.3 }, { transform: 'scale(1.15) rotate(150deg)', opacity: 0 }], { duration: dur || 900, delay: delay || 0, easing: 'ease-out' });
  }
  function wings(x, y, th) {   // 천사 날개 한 쌍이 펼쳐진다
    for (const side of [-1, 1]) {
      const el = addFx('fx-wing' + (side < 0 ? ' fx-wing--l' : ''), x + side * 6, y);
      if (!el) continue;
      el.style.background = `linear-gradient(${side < 0 ? 270 : 90}deg, ${th.c}, ${th.c2} 60%, transparent)`;
      el.style.boxShadow = `0 0 14px ${th.c2}`;
      el.style.transformOrigin = side < 0 ? '100% 80%' : '0% 80%';
      el.style.marginLeft = side < 0 ? '-58px' : '0px';
      playFx(el, [{ transform: 'scale(0.2) rotate(0deg)', opacity: 0 }, { transform: `scale(1.05) rotate(${side * -12}deg)`, opacity: 0.95, offset: 0.35 }, { transform: `scale(1.15) rotate(${side * -6}deg)`, opacity: 0.9, offset: 0.7 }, { transform: 'scale(1.25) rotate(0deg)', opacity: 0 }], { duration: 950, easing: 'ease-out' });
    }
  }
  function speedLines(x, y, th, n) {   // 옆으로 스치는 속도선
    for (let i = 0; i < richN(n); i++) {
      const el = addFx('fx-speed', x + 70, y + rand(-34, 30));
      if (!el) continue;
      el.style.width = rand(50, 110) + 'px';
      el.style.background = `linear-gradient(90deg, transparent, ${i % 2 ? th.c : th.c2})`;
      playFx(el, [{ transform: 'translateX(0)', opacity: 0 }, { transform: 'translateX(-60px)', opacity: 0.95, offset: 0.3 }, { transform: 'translateX(-190px)', opacity: 0 }], { duration: rand(360, 520), delay: i * 40, easing: 'ease-in' });
    }
  }
  function slashFan(x, y, th, n, len) {   // 몬스터 위에서 여러 갈래로 베는 빛줄기
    for (let i = 0; i < richN(n); i++) {
      const el = addFx('fx-slash', x, y);
      if (!el) continue;
      const ang = -50 + (100 / Math.max(1, n - 1)) * i + rand(-8, 8);
      el.style.width = (len || 110) + 'px'; el.style.marginLeft = -(len || 110) / 2 + 'px';
      el.style.background = `linear-gradient(90deg, transparent, ${th.c} 30%, ${th.c} 70%, transparent)`;
      el.style.boxShadow = `0 0 12px 2px ${th.c2}`;
      playFx(el, [{ transform: `rotate(${ang}deg) scaleX(0.2)`, opacity: 0 }, { transform: `rotate(${ang}deg) scaleX(1.1)`, opacity: 1, offset: 0.3 }, { transform: `rotate(${ang}deg) scaleX(1.25)`, opacity: 0 }], { duration: 300, delay: i * 55, easing: 'ease-out' });
    }
  }
  function screenTint(th, alpha, dur) {   // 화면 가장자리가 그 계열의 색으로 번쩍한다
    if (calm()) return;
    const flash = $('flash');
    flash.style.background = `radial-gradient(ellipse at 50% 55%, transparent 40%, ${th.c2}${Math.round(alpha * 255).toString(16).padStart(2, '0')})`;
    const a = anim(flash, [{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 0 }], { duration: dur || 520, easing: 'ease-out' });
    if (a) a.onfinish = () => { flash.style.background = ''; }; else flash.style.background = '';
  }

  // 효과 종류마다 겹쳐 그리는 연출 (모든 직업 공통). e는 스킬 사건, th는 그 직업 계열의 색.
  function richSkillFx(e, th, hero, t, feet) {
    const heroFeet = { x: hero.x, y: feet.y };
    switch (e.kind) {
      case 'strike': case 'bossbane': case 'execute': {
        slashFan(t.x, t.y, th, e.kind === 'execute' ? 2 : 4, 120);
        burst(t.x, t.y, th, 14, 76, { delay: 120 });
        groundRing(t.x, feet.ty, th, 3, 620, 120); groundRing(t.x, feet.ty, th, 4.4, 820, 240);
        if (e.kind === 'bossbane') pillar(t.x, t.y, th, { h: 210, w: 44, delay: 60 });
        if (e.kind === 'execute') { slashFan(t.x, t.y, { c: '#fff', c2: th.c2 }, 2, 140); rise(t.x, t.y, 20, th, 6, { dist: 60 }); }
        break;
      }
      case 'multi': {
        for (let i = 0; i < Math.min(e.hits || 4, 5); i++) burst(t.x + rand(-16, 16), t.y + rand(-14, 14), th, 6, 34, { delay: 100 + i * 110, size: 6 });
        groundRing(t.x, feet.ty, th, 3.2, 700, 480);
        break;
      }
      case 'summon': {
        groundRing(heroFeet.x, heroFeet.y, th, 3.2, 800); groundRing(heroFeet.x, heroFeet.y, th, 4.6, 1000, 140);
        rise(hero.x, heroFeet.y, 34, th, 10, { dist: 100, gap: 40 });
        burst(t.x, t.y, th, 14, 70, { delay: 700 });
        break;
      }
      case 'dot': {
        rise(t.x, t.y + 20, 22, th, 9, { dist: 70, gap: 60 });
        burst(t.x, t.y, th, 10, 50, { delay: 60 });
        break;
      }
      case 'haste': {
        speedLines(hero.x, hero.y, th, 8);
        groundRing(heroFeet.x, heroFeet.y, th, 2.8, 640);
        rise(hero.x, heroFeet.y, 24, th, 6, { dist: 70 });
        break;
      }
      case 'might': case 'frenzy': {
        groundRing(heroFeet.x, heroFeet.y, th, 3.4, 720); groundRing(heroFeet.x, heroFeet.y, th, 5, 960, 160);
        rise(hero.x, heroFeet.y, 28, th, 12, { dist: 110, gap: 40 });
        rays(hero.x, hero.y, th, 200, 900);
        if (e.kind === 'frenzy') screenTint(th, 0.5, 620);
        break;
      }
      case 'lifesteal': {
        rise(hero.x, heroFeet.y, 20, { c: '#ff9ab8', c2: '#ff3a78' }, 8, { dist: 80 });
        groundRing(heroFeet.x, heroFeet.y, { c: '#ff9ab8', c2: '#ff3a78' }, 2.6, 640, 300);
        break;
      }
      case 'heal': {
        pillar(hero.x, heroFeet.y, th, { h: 200, w: 56, dur: 760 });
        rise(hero.x, heroFeet.y, 30, th, 14, { dist: 120, gap: 45 });
        groundRing(heroFeet.x, heroFeet.y, th, 3, 800); rays(hero.x, hero.y, th, 180, 900, 80);
        break;
      }
      case 'guard': case 'barrier': {
        groundRing(heroFeet.x, heroFeet.y, th, 3, 700); groundRing(heroFeet.x, heroFeet.y, th, 4.4, 900, 140);
        burst(hero.x, hero.y, th, 12, 66, { delay: 120 });
        emblem('shield', hero.x, hero.y - 50, th, { size: 40, from: -30, rise: -10, dur: 800 });
        break;
      }
      case 'stun': {
        groundRing(t.x, feet.ty, th, 3, 700);
        burst(t.x, t.y - 40, th, 10, 50);
        break;
      }
      case 'greed': case 'bounty': {
        rain(hero.x, hero.y - 20, 60, th, e.kind === 'bounty' ? 16 : 8, { h: 130, gap: 40 });
        groundRing(heroFeet.x, heroFeet.y, th, 2.8, 700);
        break;
      }
      default: break;
    }
  }

  // 직업마다 따로 얹는 대표 연출: 기사 계열은 여기서 크게 늘렸다 (방패 문장·신성한 기둥·날개·왕관·심판의 창·성전 깃발)
  const CLASS_FX = {
    knight(e, th, hero, t, feet) {   // 수호의 방패: 커다란 방패가 내리꽂히며 땅이 갈라지고 강철 파편이 튄다
      emblem('shield', hero.x, hero.y - 52, th, { size: 62, from: -110, rise: -10, dur: 1000, spin: true });
      groundRing(hero.x, feet.y, th, 4.2, 900, 260); groundRing(hero.x, feet.y, th, 6, 1100, 380);
      burst(hero.x, feet.y - 6, th, 16, 90, { delay: 260, size: 7 });
      shakeScene(5);
    },
    paladin(e, th, hero, t, feet) {   // 신성한 치유: 십자 빛기둥, 깃털이 내려오고 후광이 뜬다
      pillar(hero.x, feet.y, th, { h: 240, w: 70, dur: 900 }); pillar(hero.x, feet.y, th, { h: 200, w: 18, dur: 900, delay: 100 });
      emblem('heart', hero.x, hero.y - 56, th, { size: 46, from: -20, rise: -30, dur: 1000, delay: 240 });
      rain(hero.x, hero.y - 10, 44, th, 14, { h: 150, gap: 50, delay: 120 });
      groundRing(hero.x, feet.y, th, 5, 1100, 200);
    },
    crusader(e, th, hero, t, feet) {   // 성전의 함성: 함성의 충격파가 퍼지고 검 문장이 솟아오른다
      for (let i = 0; i < 3; i++) groundRing(hero.x, feet.y, th, 3 + i * 1.6, 700 + i * 160, i * 140);
      emblem('sword', hero.x, hero.y - 40, th, { size: 50, from: 30, rise: -60, dur: 900 });
      rays(hero.x, hero.y, th, 220, 1000); screenTint(th, 0.55, 640); shakeScene(4);
    },
    seraph(e, th, hero, t, feet) {   // 천상의 가호: 날개가 펼쳐지고 후광이 빛난다
      wings(hero.x, hero.y - 8, th);
      emblem('star', hero.x, hero.y - 64, th, { size: 34, from: -10, rise: -14, dur: 1000, delay: 120 });
      pillar(hero.x, feet.y, th, { h: 220, w: 60, dur: 900 }); rise(hero.x, feet.y, 36, th, 12, { dist: 120 });
    },
    holyking(e, th, hero, t, feet) {   // 왕의 축복: 왕관이 내려앉고 황금 빛살이 퍼진다
      emblem('crown', hero.x, hero.y - 64, th, { size: 54, from: -100, rise: -8, dur: 1100, spin: true });
      rays(hero.x, hero.y - 20, th, 240, 1200, 260); rain(hero.x, hero.y - 20, 60, th, 14, { h: 140, gap: 40, delay: 260 });
      groundRing(hero.x, feet.y, th, 5.2, 1100, 300); screenTint(th, 0.5, 700);
    },
    inquisitor(e, th, hero, t, feet) {   // 속박의 낙인: 심판의 창이 쏟아지고 낙인이 찍힌다
      for (let i = 0; i < 5; i++) pillar(t.x + (i - 2) * 22, t.y + 10, th, { h: 200, w: 12, dur: 420, delay: 80 + i * 70 });
      emblem('star', t.x, t.y - 30, th, { size: 48, from: -10, rise: -10, dur: 900, delay: 460 });
      groundRing(t.x, feet.ty, th, 4, 800, 460); burst(t.x, t.y, th, 14, 70, { delay: 460 }); shakeScene(5);
    },
    templarlord(e, th, hero, t, feet) {   // 성전 선포: 깃발이 휘날리듯 속도선과 빛살이 몰아친다
      speedLines(hero.x, hero.y, th, 12); rays(hero.x, hero.y, th, 240, 900);
      emblem('crown', hero.x, hero.y - 56, th, { size: 46, from: -30, rise: -20, dur: 900 });
      groundRing(hero.x, feet.y, th, 4, 800, 100);
    },
    warrior(e, th, hero, t, feet) {   // 용맹의 일격: 큰 충격파와 함께 화면이 흔들린다
      groundRing(t.x, feet.ty, th, 4.6, 900, 100); burst(t.x, t.y, th, 16, 90, { delay: 100 }); shakeScene(5);
    },
  };

  function skillFx(e) {
    const color = SKILL_COLOR[e.kind] || '#fff';
    skillBanner(e, color);
    const style = G.attackStyle(state);
    const melee = G.MELEE_STYLES.includes(style);
    const hero = spot($('heroSprite'), 0.5, 0.6);
    const t = targetPos();
    const rich = !calm();
    const num = () => floatText('-' + G.fmt(e.amount), 'float--tap', 'enemy');
    // 근접이면 크게 휘두르고, 원거리면 굵은 투사체를 날린다. 닿는 시각(ms)을 돌려준다.
    const bigHit = () => (melee ? (() => { const l = swingBody(style, false); arcFx(style, true, l); return l; })() : (() => { const rel = shootBody(style, false); return rel + projectile(style, rel, true); })());
    switch (e.kind) {
      case 'strike': case 'execute': case 'bossbane': {
        const land = bigHit();
        if (e.kind === 'execute') { if (!sprite('slash_dark', t.x, t.y, { size: 210, delay: land, dur: 380, rot: -35, rot2: -12 })) ringFx(t.x, t.y, color, 2.6, 500, land); }
        if (e.kind === 'bossbane') { if (!sprite('lightning', t.x, t.y - 30, { size: 220, delay: land - 40, dur: 420, from: 0.7, to: 1.1, rot: 0, rot2: 0, screen: true })) ringFx(t.x, t.y, color, 3, 520, land); }
        const boom = sprite(e.kind === 'strike' ? (IMPACT_SPRITE[style] || 'explosion_fire') : 'explosion_fire', t.x, t.y, { size: 200, delay: land, dur: 460, from: 0.4, to: 1.25, screen: true });
        if (!boom) ringFx(t.x, t.y, color, 2.8, 520, land);
        monsterHit(true, land, false);
        impactFx(true, land);
        num();
        if (rich) shakeScene(e.kind === 'strike' ? 4 : 6);
        break;
      }
      case 'multi': {
        const n = calm() ? Math.min(e.hits, 3) : e.hits;
        for (let i = 0; i < n; i++) {
          setTimeout(() => {
            if (melee) { arcFx(style, false, 0); monsterHit(false, 80, true); impactSprite(style, false, 70); }
            else { projectile(style, 0, false); monsterHit(false, FLIGHT_MS[style] || 200, true); impactSprite(style, false, FLIGHT_MS[style] || 200); }
          }, i * 110);
        }
        setTimeout(() => { if (!sprite('explosion_magic', t.x, t.y, { size: 190, dur: 460, from: 0.4, to: 1.25, screen: true })) ringFx(t.x, t.y, color, 2.6, 500); }, n * 110 + 140);
        num();
        break;
      }
      case 'summon': {
        const circle = melee || style === 'dark' ? 'summon_circle' : 'magic_circle';
        if (!sprite(circle, hero.x, hero.y + 34, { size: 170, dur: 760, from: 0.5, to: 1.05, rot: 0, rot2: 30, screen: true })) ringFx(hero.x, hero.y + 30, color, 2.2, 640);
        const n = calm() ? 3 : 6;
        for (let i = 0; i < n; i++) {
          const m = addFx('fx-minion', hero.x + rand(-8, 8), hero.y + rand(-10, 10));
          const dx = t.x - hero.x, dy = t.y - hero.y + rand(-16, 16);
          playFx(m, [{ transform: 'translate(0, 0) scale(0.6)', opacity: 0 }, { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 24}px) scale(1.1)`, opacity: 1, offset: 0.45 }, { transform: `translate(${dx}px, ${dy}px) scale(0.8)`, opacity: 0 }],
            { duration: 520, delay: 200 + i * 80, easing: 'ease-in-out' });
        }
        monsterHit(true, 720, true);
        sprite('explosion_magic', t.x, t.y, { size: 190, delay: 700, dur: 460, from: 0.4, to: 1.2, screen: true });
        num();
        break;
      }
      case 'dot': {
        const v = e.variant;
        const name = v === 'poison' ? 'poison_cloud' : v === 'burn' || v === 'sun' ? 'explosion_fire' : 'explosion_magic';
        const filter = v === 'void' ? 'hue-rotate(60deg) saturate(1.3)' : v === 'sun' ? 'hue-rotate(-15deg) brightness(1.25)' : '';
        if (!sprite(name, t.x, t.y, { size: 170, dur: 700, from: 0.5, to: 1.15, screen: v !== 'poison', filter })) ringFx(t.x, t.y, color, 2.4, 600);
        monsterHit(true, 60, true);
        break;
      }
      case 'stun': {
        const sp = sprite('stun_stars', t.x, t.y - 58, { size: 100, dur: 700, from: 0.6, to: 1.05, rot: 0, rot2: 90 });
        if (!sp) ringFx(t.x, t.y - 40, color, 2, 520);
        monsterHit(true, 40, true);
        break;
      }
      case 'lifesteal': {
        const n = calm() ? 3 : 6;
        for (let i = 0; i < n; i++) {
          const o = addFx('fx-drain', t.x + rand(-12, 12), t.y + rand(-14, 14));
          playFx(o, [{ transform: 'translate(0, 0) scale(1)', opacity: 1 }, { transform: `translate(${(hero.x - t.x) * 0.5}px, ${(hero.y - t.y) * 0.5 - 30}px) scale(1.2)`, opacity: 1, offset: 0.5 }, { transform: `translate(${hero.x - t.x}px, ${hero.y - t.y}px) scale(0.5)`, opacity: 0 }],
            { duration: 620, delay: i * 70, easing: 'ease-in-out' });
        }
        if (!sprite('slash_dark', t.x, t.y, { size: 150, dur: 360, rot: 25, rot2: 45, filter: 'hue-rotate(-40deg) saturate(1.5)' })) ringFx(t.x, t.y, color, 2, 460);
        break;
      }
      case 'heal': {
        if (!sprite('heal_light', hero.x, hero.y - 6, { size: 190, dur: 900, from: 0.6, to: 1.08, rot: 0, rot2: 0, screen: true })) ringFx(hero.x, hero.y + 8, color, 2.4, 600);
        for (let i = 0; i < (calm() ? 2 : 5); i++) {
          const pl = addFx('fx-plus', hero.x + rand(-30, 30), hero.y + rand(-6, 16));
          if (pl) pl.textContent = '+';
          playFx(pl, [{ transform: 'translateY(0)', opacity: 0 }, { transform: 'translateY(-14px)', opacity: 1, offset: 0.3 }, { transform: 'translateY(-52px)', opacity: 0 }], { duration: 850, delay: i * 110, easing: 'ease-out' });
        }
        floatText('+' + G.fmt(e.amount), 'float--heal', 'hero');
        break;
      }
      case 'barrier': case 'guard': {
        if (!sprite('shield_bubble', hero.x, hero.y, { size: e.kind === 'barrier' ? 150 : 120, dur: 620, from: 0.3, to: 1.05, rot: 0, rot2: 0 })) ringFx(hero.x, hero.y + 8, color, 2.4, 600);
        break;
      }
      case 'haste': case 'might': case 'frenzy': {
        if (e.kind !== 'might') sprite('wind_swirl', hero.x, hero.y, { size: 180, dur: 760, from: 0.5, to: 1.1, rot: 0, rot2: 200, screen: true });
        if (e.kind !== 'haste') { if (!sprite('rage_aura', hero.x, hero.y, { size: 190, dur: 700, from: 0.5, to: 1.15, rot: 0, rot2: 0, screen: true })) ringFx(hero.x, hero.y + 8, color, 2.4, 600); }
        else if (!A.vfx('wind_swirl')) ringFx(hero.x, hero.y + 8, color, 2.4, 600);
        break;
      }
      case 'greed': case 'bounty': {
        if (!sprite('coin_burst', hero.x, hero.y - 24, { size: e.kind === 'bounty' ? 190 : 140, dur: 700, from: 0.5, to: 1.1, rot: 0, rot2: 0 })) ringFx(hero.x, hero.y + 8, color, 2.4, 600);
        coinsToPlate(hero.x, hero.y - 24, e.kind === 'bounty' ? (calm() ? 6 : 12) : (calm() ? 3 : 6));
        if (e.kind === 'bounty') floatText('+' + G.fmt(e.amount), 'float--gold', 'gold');
        break;
      }
      default: ringFx(hero.x, hero.y + 8, color, 2.2, 560);
    }
    if (rich) {   // 기존 연출 위에 조각들을 겹쳐서 풍성하게 (차분한 모드에서는 건너뜀)
      const th = themeOf(e.id);
      const feet = { y: hero.t + hero.h * 0.98, ty: spot($('monsterSprite'), 0.5, 0.96).y };
      richSkillFx(e, th, hero, t, feet);
      if (CLASS_FX[e.id]) CLASS_FX[e.id](e, th, hero, t, feet);
    }
  }

  // ---- 지속 상태 표시: 기절(별), 방벽(방울), 지속 피해(몬스터 몸 색) ----
  let dotFxAt = 0;
  function renderStatusFx() {
    const s = state;
    const toggle = (parent, cls, on, html) => {
      const cur = parent.querySelector('.' + cls);
      if (on && !cur) { const d = document.createElement('div'); d.className = cls; if (html) d.innerHTML = html; parent.appendChild(d); }
      else if (!on && cur) cur.remove();
    };
    const starUrl = A.vfx('stun_stars'), bubbleUrl = A.vfx('shield_bubble');
    toggle($('monsterSprite'), 'mon-stun', !!s.buffs.stun, starUrl ? '' : '★ ★ ★');
    const stun = $('monsterSprite').querySelector('.mon-stun');
    if (stun && starUrl) stun.style.backgroundImage = `url("${starUrl}")`;
    toggle($('heroSprite'), 'hero-barrier', !!s.buffs.barrier, '');
    const bar = $('heroSprite').querySelector('.hero-barrier');
    if (bar) { if (bubbleUrl) bar.style.backgroundImage = `url("${bubbleUrl}")`; bar.style.opacity = String(0.3 + 0.4 * Math.min(1, s.buffs.barrier.v / Math.max(1, G.maxHp(s) * 0.5))); }
    const v = s.dot ? s.dot.variant : '';
    const mb = $('monster');
    if (mb.dataset.dot !== v) mb.dataset.dot = v;
    // 지속 피해가 걸려 있는 동안 몬스터에서 주기적으로 불꽃·독 연기가 올라온다
    if (v && !calm() && Date.now() - dotFxAt > 750 && !document.hidden) {
      dotFxAt = Date.now();
      const p = targetPos();
      const name = v === 'poison' ? 'poison_cloud' : v === 'void' ? 'explosion_magic' : 'explosion_fire';
      sprite(name, p.x + rand(-16, 16), p.y + rand(-4, 22), { size: 64, dur: 560, from: 0.4, to: 0.9, dy1: -26, screen: v !== 'poison', filter: v === 'void' ? 'hue-rotate(60deg)' : '' });
    }
  }

  // ---- 스킬 바 ----
  let skillKey = '';
  const skillEls = {};
  function renderSkillbar() {
    const list = G.skillsOf(state);
    const key = list.map((x) => x.id).join(',');
    const bar = $('skillbar');
    if (key !== skillKey) {
      skillKey = key;
      bar.hidden = list.length === 0;
      sceneEl.classList.toggle('has-skills', list.length > 0);
      bar.innerHTML = list.map((sk) => `<button class="skill" type="button" data-sk="${sk.id}" aria-label="${sk.name}">${A.skillIcon(sk.id, sk.icon)}<i class="skill__cd"></i></button>`).join('');
      for (const k of Object.keys(skillEls)) delete skillEls[k];
      bar.querySelectorAll('.skill').forEach((el) => { skillEls[el.dataset.sk] = { el, cd: el.querySelector('.skill__cd'), p: -1, on: null }; });
    }
    for (const sk of list) {
      const r = skillEls[sk.id];
      if (!r) continue;
      const p = Math.round(Math.min(1, Math.max(0, state.skillCd[sk.id] || 0) / sk.cd) * 50) / 50;   // 남은 쿨타임 비율 (2% 단위로만 갱신)
      if (p !== r.p) { r.p = p; r.cd.style.setProperty('--p', p); }
      const on = !!state.buffs[sk.kind] && (sk.kind === 'haste' || sk.kind === 'might' || sk.kind === 'guard' || sk.kind === 'greed');
      if (on !== r.on) { r.on = on; r.el.classList.toggle('is-on', on); }
    }
  }
  const skillLine = (sk) => `<div class="sk-row">${A.skillIcon(sk.id, sk.icon)}<div><b>${sk.name}</b> <small>${sk.label} · 쿨타임 ${sk.cd}초</small><div class="sk-row__d">${G.describeSkill(sk)}</div></div></div>`;
  function showSkill(id) {
    const sk = G.skillFor(id);
    if (!sk) return;
    openModal(sk.name,
      `<div class="skilld__ic">${A.skillIcon(sk.id, sk.icon)}</div><div class="dexd__path">${G.NODES[id].name} · ${TIER_NAME[sk.tier]} 직업 스킬 · ${sk.label}</div>` +
      `<div class="dexd__desc">${G.describeSkill(sk)}</div><small>쿨타임 ${sk.cd}초 · 쿨타임이 차면 자동으로 사용해요</small>`, [{ text: '닫기' }]);
  }
  $('skillbar').addEventListener('click', (e) => { const b = e.target.closest('button[data-sk]'); if (b) showSkill(b.dataset.sk); });

  let lastHitText = 0;

  // ---- 배경에 떠다니는 빛 입자 (지역마다 색이 다르다) ----
  (function buildFx() {
    let html = '';
    for (let i = 0; i < 14; i++) {
      const x = (5 + Math.random() * 90).toFixed(0);
      const s = (3 + Math.random() * 4).toFixed(1);
      const d = (5 + Math.random() * 6).toFixed(1);
      const dl = (-Math.random() * 10).toFixed(1);
      const dx = (Math.random() * 60 - 30).toFixed(0);
      html += `<i style="--x:${x}%;--s:${s}px;--d:${d}s;--dl:${dl}s;--dx:${dx}px"></i>`;
    }
    $('fx').innerHTML = html;
  })();

  // ---- 창(모달) ----
  function openModal(title, bodyHtml, buttons) {
    $('modalTitle').textContent = title;
    $('modalBody').innerHTML = bodyHtml;
    const box = $('modalActions');
    box.innerHTML = '';
    for (const b of buttons) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn ' + (b.cls || 'btn--gray');
      btn.textContent = b.text;
      btn.addEventListener('click', () => { closeModal(); if (b.onClick) b.onClick(); });
      box.appendChild(btn);
    }
    $('modal').hidden = false;
  }
  function closeModal() { $('modal').hidden = true; }

  // ---- 메뉴 ----
  let currentTab = 'upgrade';
  function goTab(name) {
    if (currentTab === 'gear' && name !== 'gear') gearNew.clear();   // 장비 탭을 떠나면 NEW 표시를 지운다
    currentTab = name;
    document.querySelectorAll('.tab').forEach((t) => { t.hidden = t.dataset.tab !== name; });
    document.querySelectorAll('.tabnav__btn').forEach((b) => b.classList.toggle('is-on', b.dataset.go === name));
    document.querySelector('.tabs').scrollTop = 0;
    if (name === 'class') renderClass(true);
    if (name === 'gear') renderGear(true);
    if (name === 'shop') renderShop(true);
    if (name === 'store') renderStore(true);
    if (name === 'dungeon') renderDungeon(true);
    if (name === 'log') { renderLog(true); loadAttend(); }
    anim(document.querySelector(`.tab[data-tab="${name}"]`), [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'ease-out' });
  }
  $('nav').addEventListener('click', (e) => {
    const b = e.target.closest('.tabnav__btn');
    if (b) goTab(b.dataset.go);
  });

  // ---- 강화 목록 (한 번만 만들고 이후에는 값만 갱신) ----
  const upRefs = {};
  let buyMode = '1';   // 구매 수량: '1' | '10' | 'max'
  const buyWant = () => (buyMode === 'max' ? Infinity : Number(buyMode));
  $('buyMode').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    buyMode = b.dataset.n;
    document.querySelectorAll('#buyMode button').forEach((x) => x.classList.toggle('is-on', x === b));
    for (const k of G.UPGRADE_KEYS) upRefs[k].last = '';   // 버튼 문구를 다시 그리게 한다
    render();
  });
  function buildUpgrades() {
    const ul = $('upgrades');
    for (const key of G.UPGRADE_KEYS) {
      const u = G.UPGRADES[key];
      const li = document.createElement('li');
      li.className = 'card up';
      li.dataset.key = key;
      li.innerHTML =
        `<div class="up__tile">${A.icon(u.icon)}</div>` +
        '<div><div class="up__name"></div><div class="up__desc"></div><div class="mile" hidden></div></div>' +
        '<button class="btn up__btn" type="button"></button>';
      const refs = {
        name: li.querySelector('.up__name'),
        desc: li.querySelector('.up__desc'),
        mile: li.querySelector('.mile'),
        btn: li.querySelector('.up__btn'),
        last: '',
      };
      refs.btn.addEventListener('click', () => {
        if (G.buyMany(state, key, buyWant()) > 0) {
          handleEvents(G.checkAchievements(state));
          render();
          pulse(li);
          popIn(li.querySelector('.lv'));
        }
      });
      upRefs[key] = refs;
      ul.appendChild(li);
    }
  }

  // ---- 직업 탭 ----
  function chipsFor(mult) {
    let html = '';
    for (const k of Object.keys(STAT_LABEL)) {
      const v = mult[k];
      if (!v || v === 1) continue;
      html += `<span class="chip ${v > 1 ? 'chip--up' : 'chip--down'}">${STAT_LABEL[k]} ×${v}</span>`;
    }
    return html;
  }
  function currentMult() {
    const m = {};
    for (const k of Object.keys(STAT_LABEL)) m[k] = Math.round(G.statMult(state, k) * 100) / 100;
    return m;
  }

  const TIER_NAME = { 1: '1차', 2: '2차', 3: '3차', 4: '4차', 5: '5차' };
  const STAGE_TIER = { base: 1, adv: 2, adv3: 3, adv4: 4, adv5: 5 };
  const TIER_FIELD = ['', 'base', 'adv', 'adv3', 'adv4', 'adv5'];   // 차수(1~5) → PROMO_LEVEL 이름표
  // 앞 단계 직업 이름들 (예: 성기사 → 전사, 기사)
  const ancestorNames = (id) => { const out = []; for (let c = G.parentOf(id); c; c = G.parentOf(c)) out.unshift(G.NODES[c].name); return out; };

  function askPromote(id) {
    const info = G.NODES[id], tier = G.classTier(id);
    openModal(
      `${info.name}(으)로 전직할까요?`,
      A.goblin(id) + `<div>${info.desc}</div><div class="chips" style="justify-content:center;margin-top:8px">${chipsFor(info.mult)}</div>` +
      `<div class="choice__skill" style="margin-top:10px"><b>새 스킬 · ${G.SKILL_NAMES[id][0]}</b><br>${G.describeSkill(G.skillFor(id))}</div>` +
      '<div style="margin-top:10px"><small>환생하기 전까지는 바꿀 수 없어요.</small></div>',
      [
        { text: '취소' },
        { text: '전직하기', cls: 'btn--gold', onClick: () => {
          if (!G.promote(state, id)) return;
          handleEvents(G.checkAchievements(state));
          addLog(`${info.name}(으)로 ${TIER_NAME[tier]} 전직했다!`, 'is-good', 'cap');
          cloudSoon();
          floatText('전직!', 'float--big', 'center');
          writeSave();
          render();
          renderClass(true);
        } },
      ]
    );
  }

  function askAscend() {
    const id = G.deepest(state), info = G.NODES[id], nextRank = state.transcend + 1;
    openModal(
      `${info.name}을(를) 초월할까요?`,
      A.goblin(id) + `<div>갈래는 늘지 않지만, 공격력·골드가 +${Math.round(G.TRANSCEND_BONUS * 100)}%p 더 강해져요.</div>` +
      '<div style="margin-top:10px"><small>환생하기 전까지는 되돌릴 수 없어요.</small></div>',
      [
        { text: '취소' },
        { text: '초월하기', cls: 'btn--gold', onClick: () => {
          if (!G.ascend(state)) return;
          addLog(`${info.name}${'★'.repeat(nextRank)}(으)로 초월했다!`, 'is-good', 'cap');
          cloudSoon();
          floatText('초월!', 'float--big', 'center');
          writeSave();
          render();
          renderClass(true);
        } },
      ]
    );
  }

  let classKey = '';
  let dexView = 2;   // 도감에서 보고 있는 차수 (2·3·4·5)
  function renderClass(force) {
    const s = state;
    const dexKey = G.ADV_IDS.map((id) => { const r = G.dexRecord(s, id); return `${s.mastered[id] ? 1 : 0}:${r.best}:${r.kills}`; }).join(',');
    const key = [G.classPath(s).join('>'), s.level, s.transcend, dexKey, dexView].join('|');
    if (!force && key === classKey) return;
    classKey = key;

    // 지금 직업과 지금까지 걸어온 길
    const id = G.lookId(s);
    const path = G.classPath(s);
    const desc = path.length ? G.NODES[G.deepest(s)].desc
      : `아직 직업이 없는 견습 고블린이에요. Lv.${G.PROMO_LEVEL.base}이 되면 전직할 수 있어요.`;
    const trail = path.length ? `<div class="classcard__path">견습 → ${path.map((i) => G.NODES[i].name).join(' → ')}</div>` : '';
    $('classNow').innerHTML =
      `<div class="classcard__art">${A.goblin(id)}</div>` +
      `<div><div class="classcard__name">${G.classTitle(s)}</div>${trail}<div class="classcard__desc">${desc}</div>` +
      `<div class="chips">${chipsFor(currentMult())}</div></div>`;
    const mySkills = G.skillsOf(s);
    $('classSkills').innerHTML = mySkills.length ? `<h3 class="sect">스킬 <small>쿨타임이 차면 자동으로 사용해요</small></h3>` + mySkills.map(skillLine).join('') : '';

    // 전직 선택 (1차~5차)
    const np = G.nextPromo(s);
    let html = '';
    if (np) {
      html += `<div class="choice__title">${TIER_NAME[np.tier]} 전직 (Lv.${np.need}) ${np.ready ? '· 지금 선택할 수 있어요!' : ''}</div><div class="choices">`;
      for (const cid of np.options) {
        const info = G.NODES[cid];
        html += `<div class="card choice ${np.ready ? 'is-ready' : 'is-locked'}">` +
          `<div class="choice__art">${A.goblin(cid)}</div>` +
          `<div class="choice__name">${info.name}</div>` +
          `<div class="choice__desc">${info.desc}</div>` +
          `<div class="chips" style="justify-content:center">${chipsFor(info.mult)}</div>` +
          `<div class="choice__skill"><b>스킬 · ${G.SKILL_NAMES[cid][0]}</b><br>${G.describeSkill(G.skillFor(cid))}</div>` +
          `<button class="btn ${np.ready ? '' : 'btn--gray'}" type="button" data-pick="${cid}" ${np.ready ? '' : 'disabled'}>${np.ready ? '전직하기' : `Lv.${np.need} 필요`}</button>` +
          '</div>';
      }
      html += '</div>';
    } else {
      // 5차까지 전직을 마쳤다: 갈래 없이 랭크만 오르는 '초월'
      const rank = s.transcend, maxRank = G.TRANSCEND_LEVEL.length;
      if (rank >= maxRank) {
        html = `<div class="notice">${G.classTitle(s)} · 초월을 모두 마쳤어요! (초월 ${maxRank}랭크)<br>환생하면 직업이 초기화되어 다른 길을 골라 볼 수 있어요.</div>`;
      } else {
        const need = G.TRANSCEND_LEVEL[rank], ready = s.level >= need;
        html = `<div class="choice__title">초월 ${rank + 1}랭크 (Lv.${need}) ${ready ? '· 지금 초월할 수 있어요!' : ''}</div><div class="choices">` +
          `<div class="card choice ${ready ? 'is-ready' : 'is-locked'}">` +
          `<div class="choice__art">${A.goblin(G.deepest(s))}</div>` +
          `<div class="choice__name">${G.NODES[G.deepest(s)].name}${'★'.repeat(rank + 1)}</div>` +
          `<div class="choice__desc">갈래는 없지만, 공격력·골드가 +${Math.round(G.TRANSCEND_BONUS * 100)}%p 더 강해져요.</div>` +
          `<button class="btn ${ready ? '' : 'btn--gray'}" type="button" data-ascend="1" ${ready ? '' : 'disabled'}>${ready ? '초월하기' : `Lv.${need} 필요`}</button>` +
          '</div></div>';
      }
    }
    $('classChoice').innerHTML = html;
    renderCodex();
  }

  // 도감 카드 하나
  function dexCard(aid, compact) {
    const s = state, info = G.NODES[aid], on = !!s.mastered[aid];
    const rec = G.dexRecord(s, aid), tier = G.dexTier(s, aid);
    return `<div class="dexcard ${on ? 'is-on' : 'is-off'} ${compact ? 'dexcard--compact' : ''}" data-dex="${aid}">` +
      (on ? `<span class="medal medal--${tier}">${tier ? G.DEX_MEDALS[tier - 1] : '-'}</span>` : '') +
      `<div class="dexcard__art">${A.goblin(aid, compact ? { head: true } : undefined)}</div>` +
      `<div class="dexcard__name">${on ? info.name : '???'}</div>` +
      `<div class="dexcard__rec">${on ? `최고 <b>${rec.best}</b>단계<br>처치 <b>${G.fmt(rec.kills)}</b>` : `Lv.${G.PROMO_LEVEL[TIER_FIELD[G.classTier(aid)]]}에 전직`}</div></div>`;
  }

  // 도감: 2~5차 탭으로 나누고, 부모 직업별로 묶어 자식 2갈래를 보여 준다
  function renderCodex() {
    const s = state;
    const done = (t) => G.advIdsOfTier(t).filter((id) => s.mastered[id]).length;
    $('codexBonus').textContent = `${Object.keys(s.mastered).length} / ${G.ADV_IDS.length} · 공격력·골드 +${Math.round((G.masteryMult(s) - 1) * 100)}%`;
    let html = '<div class="dextabs">' + [2, 3, 4, 5].map((t) =>
      `<button class="dextab ${dexView === t ? 'is-on' : ''}" type="button" data-dextab="${t}">${TIER_NAME[t]}<small>${done(t)}/${G.advIdsOfTier(t).length}</small></button>`).join('') + '</div>';
    const compact = dexView >= 3;
    const parents = dexView === 2 ? Object.keys(G.CLASSES) : G.advIdsOfTier(dexView - 1);
    for (const pid of parents) {
      const base = G.NODES[pid];
      const kids = G.childrenOf(pid);
      const stat = dexView === 2 ? Object.keys(base.mult).map((k) => `${STAT_LABEL[k]} ×${base.mult[k]}`).join(' · ') : `${kids.filter((k) => s.mastered[k]).length}/${kids.length}`;
      html += `<div class="dexrow ${compact ? 'dexrow--compact' : ''}"><div class="dexrow__head">${A.goblin(pid, { head: true })}<div class="dexrow__name">${base.name}</div>` +
        `<div class="dexrow__stat">${stat}</div></div><div class="dexrow__kids">${kids.map((k) => dexCard(k, compact)).join('')}</div></div>`;
    }
    $('codex').innerHTML = html;
  }

  // 도감 카드를 누르면 자세한 정보 창을 연다
  function showDex(aid) {
    const info = G.NODES[aid], tier = G.classTier(aid), s = state;
    if (!s.mastered[aid]) {
      const need = G.PROMO_LEVEL[TIER_FIELD[tier]];
      openModal('???',
        `<div class="dexd__art" style="filter:brightness(0) opacity(.4)">${A.goblin(aid)}</div>` +
        `<div class="dexd__desc">아직 만나지 못한 직업이에요.<br><b>${ancestorNames(aid).join(' → ')}</b> 순서로 전직한 뒤<br>Lv.${need}에서 ${TIER_NAME[tier]} 전직하면 도감에 기록돼요.</div>`,
        [{ text: '닫기' }]);
      return;
    }
    const rec = G.dexRecord(s, aid), medals = G.dexTier(s, aid), stages = G.dexStages(aid);
    const bonus = Math.round(G.masteryOf(s, aid) * 1000) / 10;
    const rows = stages.map((st, i) =>
      `<div class="${medals > i ? 'is-done' : ''}"><span class="medal medal--${i + 1}">${G.DEX_MEDALS[i]}</span><span>최고 스테이지 ${st} 도달</span>` +
      `<span>${medals > i ? '달성' : `${Math.max(0, st - rec.best)}단계 남음`}</span></div>`).join('');
    openModal(info.name,
      `<div class="dexd__art">${A.goblin(aid)}</div>` +
      `<div class="dexd__path">${TIER_NAME[tier]} 직업 · ${ancestorNames(aid).join(' → ')}</div>` +
      `<div class="dexd__desc">${info.desc}</div>` +
      `<div class="chips" style="justify-content:center">${chipsFor(info.mult)}</div>` +
      `<div class="choice__skill" style="margin:8px 0"><b>스킬 · ${G.SKILL_NAMES[aid][0]}</b><br>${G.describeSkill(G.skillFor(aid))}</div>` +
      `<div class="dexd__rec"><div><small>최고 스테이지</small><b>${rec.best}</b></div><div><small>처치 수</small><b>${G.fmt(rec.kills)}</b></div><div><small>전직 횟수</small><b>${rec.runs}</b></div></div>` +
      `<div class="dexd__tiers">${rows}</div>` +
      `<div style="margin-top:10px"><small>이 직업 보너스: 공격력·골드 +${bonus}% (메달마다 기본 보너스의 +${Math.round(G.MEDAL_BONUS * 100)}%)</small></div>`,
      [{ text: '닫기' }]);
  }
  $('codex').addEventListener('click', (e) => {
    const t = e.target.closest('.dextab');
    if (t) { dexView = Number(t.dataset.dextab); renderClass(true); return; }
    const c = e.target.closest('.dexcard');
    if (c) showDex(c.dataset.dex);
  });
  $('classChoice').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-pick]');
    if (b && !b.disabled) askPromote(b.dataset.pick);
    const a = e.target.closest('button[data-ascend]');
    if (a && !a.disabled) askAscend();
  });

  // ---- 증표 상점 ----
  let shopKey = '';
  const TIER_TITLE = { 1: '1단계 · 기본 강화', 2: '2단계 · 응용 (앞 단계 강화가 필요해요)', 3: '3단계 · 궁극', 4: '4단계 · 직업 강화 (전직한 직업과 이어져요)', 5: '5단계 · 그 너머 (4단계를 모두 채우면 열려요)' };
  function renderShop(force) {
    const s = state;
    const key = G.PERK_KEYS.map((id) => G.perkLv(s, id)).join(',') + '|' + G.tokenBalance(s);
    if (!force && key === shopKey) return;
    shopKey = key;
    $('shopTokens').textContent = G.tokenBalance(s);
    $('shopSpent').textContent = `강화에 쓴 증표 ${G.perkSpent(s)}개`;
    $('respecBtn').hidden = G.perkSpent(s) === 0;
    let html = '';
    for (const tier of [1, 2, 3, 4, 5]) {
      html += `<div class="tier">${TIER_TITLE[tier]}</div><div class="tierbox ${tier > 1 ? 'tierbox--sub' : ''}">`;
      for (const id of G.PERK_KEYS) {
        const p = G.PERKS[id];
        if (p.tier !== tier) continue;
        const lv = G.perkLv(s, id), maxed = lv >= p.max;
        const missing = G.perkMissing(s, id), can = G.canBuyPerk(s, id);
        const pips = p.max > 10 ? `<div class="perk__bar"><i style="width:${Math.round(lv / p.max * 100)}%"></i></div>` : Array.from({ length: p.max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
        const desc = maxed ? p.now(lv) : lv === 0 ? `<em>${p.per}</em> (레벨마다)` : `${p.now(lv)} → <em>${p.now(lv + 1)}</em>`;
        const need = missing.length ? `<div class="perk__need">${A.icon('lock')}필요: ${missing.map(([rid, rl]) => `${G.PERKS[rid].name} Lv.${rl}`).join(', ')}</div>` : '';
        const btn = maxed
          ? '<button class="btn btn--gray perk__btn" type="button" disabled>MAX</button>'
          : `<button class="btn ${can ? '' : 'btn--gray'} perk__btn" type="button" data-perk="${id}" ${can ? '' : 'disabled'}><small>구매</small><span>${A.icon('crown')}${G.perkCost(s, id)}</span></button>`;
        html += `<div class="card perk ${missing.length ? 'is-locked' : ''} ${maxed ? 'is-maxed' : ''}" data-id="${id}">` +
          `<div class="perk__tile">${A.icon(p.icon)}</div>` +
          `<div><div class="perk__name">${p.name} <span class="lv">Lv.${lv}${maxed ? ' MAX' : ''}</span></div><div class="perk__desc">${desc}</div>` +
          `<div class="perk__pips">${pips}</div>${need}</div>${btn}</div>`;
      }
      html += '</div>';
    }
    $('perks').innerHTML = html;
  }

  // 구매 전에 무엇을 얼마에 사는지 확인받는다 (결제 창)
  function askBuyPerk(id) {
    const p = G.PERKS[id];
    const lv = G.perkLv(state, id), cost = G.perkCost(state, id);
    if (!G.canBuyPerk(state, id)) return;
    openModal('구매할까요?',
      `<div style="font-weight:900;font-size:16px">${A.icon(p.icon)} ${p.name}</div>` +
      `<div style="margin-top:4px">Lv.${lv} → <b>Lv.${lv + 1}</b></div>` +
      `<div style="color:var(--green);font-weight:800;margin-top:2px">${p.now(lv + 1)}</div>` +
      `<div style="margin-top:12px">${A.icon('crown')} 왕의 증표 <b>${cost}개</b> 사용</div>` +
      `<div style="margin-top:2px"><small>구매 후 남는 증표 ${G.tokenBalance(state) - cost}개</small></div>`,
      [
        { text: '취소' },
        { text: '구매하기', cls: 'btn--gold', onClick: () => {
          if (!G.buyPerk(state, id)) return;
          addLog(`${p.name} Lv.${lv + 1} 구매! ${p.now(lv + 1)}`, 'is-gold', p.icon);
          cloudSoon();
          floatText(`${p.name} Lv.${lv + 1}`, 'float--big', 'center');
          writeSave();
          render();
          renderShop(true);
          const card = document.querySelector(`.perk[data-id="${id}"]`);
          pulse(card);
          popIn(card && card.querySelector('.lv'));
        } },
      ]);
  }
  $('perks').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-perk]');
    if (b && !b.disabled) askBuyPerk(b.dataset.perk);
  });
  $('respecBtn').addEventListener('click', () => {
    const back = G.perkSpent(state);
    if (back <= 0) return;
    openModal('강화를 초기화할까요?',
      `산 강화가 모두 사라지고<br>쓴 증표 <b>${back}개</b>를 돌려받아요.<br><small>다른 강화에 다시 쓸 수 있어요.</small>`,
      [
        { text: '취소' },
        { text: '초기화', cls: 'btn--blue', onClick: () => {
          G.respecPerks(state);
          addLog(`강화를 초기화했다. 증표 ${back}개를 돌려받았다`, 'is-good', 'crown');
          cloudSoon();
          writeSave();
          render();
          renderShop(true);
        } },
      ]);
  });

  $('classChoice').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-pick]');
    if (b && !b.disabled) askPromote(b.dataset.pick, b.dataset.adv === '1');
  });

  // ---- 장비 ----
  let selectMode = false;        // 가방에서 여러 개를 골라 파는 중인지
  const picked = new Set();       // 고른 장비 번호
  let gearKey = '';
  let enhanceTarget = null;      // 강화 재료 고르는 창에서, 강화할 장비의 번호
  const gearNew = new Set();   // 장비 탭을 열기 전에 새로 얻은 장비 번호 (NEW 표시·알림 점용, 저장하지 않음)
  const KIND_SHORT = { dmg: '공격력', hp: '체력', gold: '골드', aps: '공속', comp: '동료', click: '직접' };
  const fmtVal = (v) => (Math.round(v * 10) / 10).toString();
  // 장비 그림: 이름(디자인)마다 다르다. 이미지가 없으면 칸 종류의 기본 아이콘을 색만 달리해서 쓴다.
  const gearArt = (it) => A.gear(G.itemDesign(it), G.GEAR[it.slot].icon);
  const itemStat = (it) => `${G.GEAR[it.slot].kinds[it.kind].label} +${fmtVal(G.enhVal(it))}%`;

  function gearSummaryText() {
    const parts = [];
    for (const slot of G.SLOT_KEYS) {
      for (const kind of Object.keys(G.GEAR[slot].kinds)) {
        const m = G.gearMult(state, kind);
        if (m > 1) parts.push(`${G.GEAR[slot].kinds[kind].label} +${fmtVal((m - 1) * 100)}%`);
      }
    }
    return parts.length ? parts.join(' · ') : '아직 효과 없음';
  }

  const spText = (it) => (it.sp ? window.GoblinStore.specialOf(it.sp.k).text(it.sp.v) : '');
  function slotCard(slot, it) {
    if (!it) {
      return `<div class="slot is-empty" data-slot="${slot}"><div class="slot__cap">${G.GEAR[slot].name}</div>${A.icon(G.GEAR[slot].icon)}<div class="slot__name" style="color:var(--muted)">비어 있음</div></div>`;
    }
    return `<button class="slot r${it.r}" type="button" data-slot="${slot}"><div class="slot__cap">${G.GEAR[slot].name}</div>${gearArt(it)}${it.enh ? `<i class="slot__enh">⚒${it.enh}</i>` : ''}` +
      `<div class="slot__name">${G.itemName(it)}</div><div class="slot__stat">${itemStat(it)}</div>${it.sp ? `<div class="slot__sp">★ ${spText(it)}</div>` : ''}<div class="slot__lv">Lv.${it.ilvl}</div></button>`;
  }

  // 드롭 확률표: 가중치를 백분율로 바꿔서 보여 준다 (높은 등급일수록 확률이 낮다)
  function dropInfoHtml() {
    const sum = (key) => G.RARITIES.reduce((a, r) => a + r[key], 0);
    const pct = (x, total) => { const v = (x / total) * 100; return (v >= 10 ? v.toFixed(0) : v.toFixed(v >= 1 ? 1 : 2)).replace(/\.0$/, '') + '%'; };
    const rows = G.RARITIES.map((r) => `<tr><td style="color:${r.color}">${r.name}</td><td>${pct(r.w, sum('w'))}</td><td>${pct(r.bossW, sum('bossW'))}</td></tr>`).join('');
    const chance = (boss) => Math.round(G.dropChance(state, boss) * 1000) / 10;
    return `<div>몬스터를 잡으면 <b>${chance(false)}%</b> 확률로, 보스는 <b>${chance(true)}%</b> 확률로 장비가 떨어져요. 높은 스테이지에서 얻을수록 수치가 커져요.</div>` +
      `<table class="droptable"><tr><th>등급 확률</th><th>일반 몬스터</th><th>보스</th></tr>${rows}</table>`;
  }

  function renderGear(force) {
    const s = state;
    const ids = (it) => (it ? it.id : 0);
    const key = [G.SLOT_KEYS.map((k) => ids(s.equip[k])).join(','), s.bag.map((x) => x.id).join(','), s.autoEquip, s.autoSell, s.autoDust, s.dust, s.bag.map((x) => x.ilvl).join(','), s.relicEq.join('+'), [...gearNew].join('+'), G.perkLv(s, 'luck'), selectMode, [...picked].join('+')].join('|');
    if (!force && key === gearKey) return;
    gearKey = key;
    $('gearSummary').textContent = gearSummaryText();
    $('slots').innerHTML = G.SLOT_KEYS.map((k) => slotCard(k, s.equip[k])).join('');
    $('relicBar').innerHTML = Array.from({ length: Store.RELIC_SLOTS }, (_, i) => {
      const r = G.relicDef(s.relicEq[i]);
      return r ? `<button class="rslot is-full" type="button" style="--rc:${r.color}">${A.icon(r.icon)}<span class="rslot__t"><b>${r.name}</b><small>${r.opts.map((o) => o.text).join(' · ')}</small></span></button>`
        : `<button class="rslot" type="button">${A.icon('star')}<span class="rslot__t"><b>유물 칸 ${i + 1}</b><small>상점에서 유물을 사서 끼워요</small></span></button>`;
    }).join('');
    $('autoEquip').checked = s.autoEquip;
    $('autoSell').value = String(s.autoSell);
    $('autoDust').checked = s.autoDust;
    $('dustBal').innerHTML = `${DUST_IC} 가루 <b>${G.fmt(s.dust)}</b>`;
    const bc = $('bagCount');
    bc.textContent = `${s.bag.length} / ${G.bagLimit(s)}`;
    bc.style.color = s.bag.length >= G.bagLimit(s) ? 'var(--red)' : '';
    for (const id of [...picked]) if (!s.bag.some((x) => x.id === id)) picked.delete(id);   // 이미 팔린 장비는 선택에서 뺀다
    let html = '';
    s.bag.forEach((it) => {
      html += `<button class="gitem r${it.r} ${gearNew.has(it.id) ? 'is-new' : ''} ${picked.has(it.id) ? 'is-sel' : ''}" type="button" data-item="${it.id}">${gearArt(it)}${it.sp ? '<i class="gitem__sp">★</i>' : ''}${it.enh ? `<i class="gitem__enh">⚒${it.enh}</i>` : ''}` +
        `<div class="gitem__stat">${KIND_SHORT[it.kind]} +${fmtVal(G.enhVal(it))}%</div><div class="gitem__lv">Lv.${it.ilvl}</div></button>`;
    });
    for (let i = s.bag.length; i < G.bagLimit(s); i++) html += '<div class="gitem is-empty"></div>';
    $('bag').innerHTML = html;
    // 선택 모드 표시줄
    $('selectBtn').textContent = selectMode ? '완료' : '선택';
    $('selectBtn').classList.toggle('is-on', selectMode);
    $('selbar').hidden = !selectMode;
    const chosen = s.bag.filter((x) => picked.has(x.id));
    const chosenGold = chosen.reduce((a, x) => a + G.sellValue(x), 0);
    $('selCount').textContent = chosen.length ? `${chosen.length}개 선택 · ${G.fmt(chosenGold)} 골드` : '팔 장비를 눌러 고르세요';
    $('selAll').textContent = chosen.length && chosen.length === s.bag.length ? '선택 해제' : '전체 선택';
    $('selSell').disabled = chosen.length === 0;
    $('selDust').disabled = chosen.length === 0;
    $('selDust').textContent = chosen.length ? `분해 +${G.fmt(chosen.reduce((a, x) => a + G.dustValue(x), 0))}` : '분해';
    $('tidyBtn').disabled = s.bag.length === 0;
    $('dropInfo').innerHTML = dropInfoHtml();
  }

  // 장비 강화(재련): 같은 칸의 다른 장비를 재료로 써서 수치를 올린다
  function askEnhance(it) {
    if ((it.enh || 0) >= G.ENH_MAX) { openModal('이미 최대로 강화했어요', `${G.itemName(it)}은(는) 이미 최대 강화(${G.ENH_MAX}단계)예요.`, [{ text: '확인' }]); return; }
    const materials = state.bag.filter((x) => x.slot === it.slot && x.id !== it.id);
    if (!materials.length) { openModal('강화할 재료가 없어요', `가방에 같은 칸(<b>${G.GEAR[it.slot].name}</b>)의 다른 장비가 하나 더 있어야 강화할 수 있어요. 재료로 쓴 장비는 사라져요.`, [{ text: '확인' }]); return; }
    const cost = G.enhCost(it);
    const chance = G.enhChance(it.enh || 0);
    const chancePct = Math.round(chance * 100);
    enhanceTarget = it.id;
    openModal(`${G.GEAR[it.slot].name} 강화`,
      `<div class="itemd__head"><div class="slot r${it.r}">${gearArt(it)}</div><div><div class="itemd__main">${G.itemName(it)}</div>` +
      `<small>강화 Lv.${it.enh || 0} → <b>Lv.${(it.enh || 0) + 1}</b> (효과 +${Math.round(G.ENH_STEP * 100)}%p)</small></div></div>` +
      `<div style="margin:10px 0">${COIN} 골드 <b>${G.fmt(cost)}</b> + 재료 장비 1개가 필요해요.<br>` +
      `<b style="color:${chancePct >= 100 ? 'var(--green)' : chancePct >= 50 ? 'var(--gold)' : 'var(--red)'}">성공 확률 ${chancePct}%</b>` +
      `${chancePct < 100 ? '<br><small>실패해도 골드와 재료는 그대로 사라져요.</small>' : ''}<br><small>재료로 쓸 장비를 아래에서 골라 주세요.</small></div>` +
      `<div class="bag enh__mats">${materials.map((m) => `<button class="gitem r${m.r}" type="button" data-mat="${m.id}">${gearArt(m)}<div class="gitem__stat">${KIND_SHORT[m.kind]} +${fmtVal(m.val)}%</div><div class="gitem__lv">Lv.${m.ilvl}</div></button>`).join('')}</div>`,
      [{ text: '취소', onClick: () => { enhanceTarget = null; } }]);
  }
  // ---- 장비 레벨 올리기 · 분해 ----
  const DUST_IC = '<i class="dust-ic"></i>';
  function askLevelUp(it) {
    const s = state, cap = G.itemLevelCap(s);
    const val = (lv) => G.enhVal(it) * (1 + lv / 40) / (1 + it.ilvl / 40);   // 레벨 lv일 때 예상 수치 (game.js와 같은 비율)
    const def = G.GEAR[it.slot].kinds[it.kind];
    const opts = [1, 10, 999].map((want) => ({ want, plan: G.levelUpPlan(s, it, want) }));
    const row = ({ want, plan }) => {
      const label = want === 999 ? '최대' : `+${want}`;
      const full = want === 999 ? plan.room : Math.min(want, plan.room);
      const ok = plan.n > 0 && (want === 999 || plan.n === full);
      const cost = ok ? plan.cost : G.levelUpCost(it, Math.max(1, full));
      return `<button class="lvopt ${ok ? '' : 'is-off'}" type="button" data-lvn="${want}" ${ok ? '' : 'disabled'}><b>${label}${want === 999 && ok ? ` (Lv.${it.ilvl + plan.n})` : ''}</b>` +
        `<small>${DUST_IC}${G.fmt(cost)}</small><small>${def.label} +${fmtVal(val(it.ilvl + (ok ? plan.n : full)))}%</small></button>`;
    };
    lvTarget = it.id;
    const body = `<div class="itemd__head"><div class="slot r${it.r}">${gearArt(it)}</div><div><div class="itemd__main">${G.itemName(it)}</div>` +
      `<small>장비 레벨 <b>${it.ilvl}</b> / 최대 ${cap} (내 최고 스테이지)</small></div></div>` +
      (it.ilvl >= cap ? '<div style="margin:10px 0">최고 스테이지까지 올렸어요. 더 높은 스테이지에 가면 더 올릴 수 있어요.</div>'
        : `<div class="lvopts">${opts.map(row).join('')}</div>`) +
      `<div class="dres__head">가진 가루 ${DUST_IC}<b>${G.fmt(s.dust)}</b> · 가루는 장비를 분해해서 얻어요</div>`;
    openModal('장비 레벨 올리기', body, [{ text: '닫기', onClick: () => { lvTarget = null; } }]);
  }
  let lvTarget = null;
  $('modalBody').addEventListener('click', (e) => {
    const lv = e.target.closest('button[data-lvup]');
    if (lv) { const it = G.findItem(state, Number(lv.dataset.lvup)); if (it) askLevelUp(it); return; }
    const n = e.target.closest('button[data-lvn]');
    if (n && lvTarget != null) {
      const r = G.levelUpItem(state, lvTarget, Number(n.dataset.lvn));
      const it = G.findItem(state, lvTarget);
      if (!r.ok) return;
      addLog(`${G.itemName(it)} 레벨 ${r.ilvl - r.levels} → ${r.ilvl}`, 'is-good', 'arrowup');
      floatText(`Lv.${r.ilvl}!`, 'float--big', 'center');
      cloudSoon(); writeSave(); render(); renderGear(true);
      askLevelUp(it);   // 창을 새 값으로 다시 그려서 연달아 올릴 수 있게
      return;
    }
    const d = e.target.closest('button[data-dismantle]');
    if (d) {
      const it = state.bag.find((x) => x.id === Number(d.dataset.dismantle));
      if (!it) return;
      const go = () => {
        const r = G.dismantleItems(state, [it.id]);
        closeModal();
        addLog(`${G.itemName(it)}을(를) 분해했다 (가루 +${G.fmt(r.dust)})`, 'is-good', 'anvil');
        cloudSoon(); writeSave(); render(); renderGear(true);
      };
      if (it.r >= 3) openModal('정말 분해할까요?', `<b style="color:${G.RARITIES[it.r].color}">[${G.RARITIES[it.r].name}] ${G.itemName(it)}</b><br>가루 ${G.fmt(G.dustValue(it))}이(가) 돼요.<br><small>되돌릴 수 없어요.</small>`, [{ text: '취소' }, { text: '분해', cls: 'btn--blue', onClick: go }]);
      else go();
    }
  });
  $('modalBody').addEventListener('click', (e) => {
    const m = e.target.closest('button[data-mat]');
    if (!m || enhanceTarget == null) return;
    const targetId = enhanceTarget, materialId = Number(m.dataset.mat);
    enhanceTarget = null;
    const r = G.enhanceItem(state, targetId, materialId);
    closeModal();
    if (!r.ok) { openModal('강화할 수 없어요', r.reason === 'gold' ? '골드가 부족해요' : '다시 시도해 주세요', [{ text: '확인' }]); return; }
    cloudSoon(); writeSave(); render(); renderGear(true);
    if (r.success) {
      addLog(`장비 강화 성공! (Lv.${r.enh})`, 'is-good', 'sword');
      floatText('강화 성공!', 'float--big', 'center');
    } else {
      addLog('장비 강화 실패... 골드와 재료를 잃었다', 'is-bad', 'sword');
      openModal('강화 실패...', '골드와 재료를 모두 잃었어요.<br><small>다음 시도는 지금과 같은 확률이에요.</small>', [{ text: '확인' }]);
    }
  });

  // 장비 하나의 정보 창. 장착 중이면 해제, 가방에 있으면 장착·판매를 고를 수 있다.
  function showItem(it, equipped) {
    const R = G.RARITIES[it.r], def = G.GEAR[it.slot].kinds[it.kind];
    const cur = state.equip[it.slot];
    let cmp = '';
    if (!equipped) {
      if (!cur) cmp = '<div class="itemd__cmp">이 칸은 지금 비어 있어요</div>';
      else if (cur.kind === it.kind) {
        const d = Math.round((it.val - cur.val) * 10) / 10;
        cmp = `<div class="itemd__cmp">장착 중인 ${G.itemName(cur)}보다 <span class="${d >= 0 ? 'cmp-plus' : 'cmp-minus'}">${d >= 0 ? '▲ +' : '▼ '}${d}%p</span></div>`;
      } else {
        cmp = `<div class="itemd__cmp">장착 중인 장비는 ${G.GEAR[cur.slot].kinds[cur.kind].label} 능력이라 수치를 바로 비교할 수 없어요</div>`;
      }
    }
    const body =
      `<div class="itemd__head"><div class="slot r${it.r}">${gearArt(it)}</div>` +
      `<div><span class="itemd__tag r${it.r}">${R.name}</span><div class="itemd__main">${def.label} +${fmtVal(G.enhVal(it))}%</div>${it.sp ? `<div class="itemd__sp">★ ${spText(it)}</div>` : ''}${it.enh ? `<div class="itemd__sp">⚒ 강화 Lv.${it.enh}</div>` : ''}` +
      `<small>${G.GEAR[it.slot].name} · 장비 레벨 ${it.ilvl}</small></div></div>${cmp}` +
      `<div class="itemd__tools"><button class="btn btn--gray" type="button" data-lvup="${it.id}">${DUST_IC}레벨 올리기</button>` +
      (equipped ? '' : `<button class="btn btn--gray" type="button" data-dismantle="${it.id}">분해 +${G.fmt(G.dustValue(it))}</button>`) + '</div>';
    const done = (msg, icon) => { addLog(msg, 'is-good', icon); writeSave(); render(); renderGear(true); };
    if (equipped) {
      openModal(G.itemName(it), body, [
        { text: '닫기' },
        { text: '강화하기', cls: 'btn--gold', onClick: () => askEnhance(it) },
        { text: '해제하기', cls: 'btn--blue', onClick: () => {
          if (!G.unequipItem(state, it.slot)) { addLog('가방이 가득 차서 해제할 수 없어요', 'is-bad', 'lock'); return; }
          done(`${G.itemName(it)}을(를) 해제했다`, G.GEAR[it.slot].icon);
        } },
      ]);
      return;
    }
    const price = G.sellValue(it);
    const sell = () => {
      const g = G.sellBagItem(state, it.id);
      if (g >= 0) done(`${G.itemName(it)}을(를) 팔았다 (+${G.fmt(g)} 골드)`, 'coin');
    };
    openModal(G.itemName(it), body, [
      { text: '닫기' },
      { text: '강화하기', onClick: () => askEnhance(it) },
      { text: `판매 +${G.fmt(price)}`, cls: 'btn--blue', onClick: () => {
        if (it.r >= 3) {   // 귀한 장비는 한 번 더 확인
          openModal('정말 팔까요?', `<b style="color:${R.color}">[${R.name}] ${G.itemName(it)}</b><br>${COIN} 골드 ${G.fmt(price)}을(를) 받고 팔아요.<br><small>되돌릴 수 없어요.</small>`,
            [{ text: '취소' }, { text: '판매', cls: 'btn--blue', onClick: sell }]);
        } else sell();
      } },
      { text: '장착하기', cls: 'btn--gold', onClick: () => {
        if (!G.equipItem(state, it.id)) return;
        done(`${G.itemName(it)}을(를) 장착했다`, G.GEAR[it.slot].icon);
      } },
    ]);
  }
  $('slots').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-slot]');
    if (b) showItem(state.equip[b.dataset.slot], true);
  });
  $('bag').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-item]');
    const it = b && state.bag.find((x) => x.id === Number(b.dataset.item));
    if (!it) return;
    if (selectMode) { if (picked.has(it.id)) picked.delete(it.id); else picked.add(it.id); renderGear(true); return; }
    showItem(it, false);
  });
  $('autoEquip').addEventListener('change', (e) => { state.autoEquip = e.target.checked; writeSave(); });
  $('autoDust').addEventListener('change', (e) => { state.autoDust = e.target.checked; writeSave(); renderGear(true); });
  $('selDust').addEventListener('click', () => {
    const items = state.bag.filter((x) => picked.has(x.id));
    if (!items.length) return;
    const dust = items.reduce((a, x) => a + G.dustValue(x), 0);
    const go = () => {
      const r = G.dismantleItems(state, items.map((x) => x.id));
      picked.clear();
      addLog(`장비 ${r.n}개를 분해했다 (가루 +${G.fmt(r.dust)})`, 'is-gold', 'anvil');
      writeSave(); render(); renderGear(true);
    };
    const rare = items.filter((x) => x.r >= 3);
    if (!rare.length) { go(); return; }
    openModal('정말 분해할까요?', `고른 장비 <b>${items.length}개</b> 중 <b style="color:${G.RARITIES[3].color}">영웅 이상 ${rare.length}개</b>가 있어요.<br>가루 <b>${G.fmt(dust)}</b>이(가) 돼요.<br><small>되돌릴 수 없어요.</small>`,
      [{ text: '취소' }, { text: '분해', cls: 'btn--blue', onClick: go }]);
  });
  $('autoSell').addEventListener('change', (e) => {
    const v = Number(e.target.value), prev = state.autoSell;
    if (v < 3) { state.autoSell = v; writeSave(); return; }
    // 영웅·전설까지 자동으로 파는 설정은 한 번 더 확인한다
    openModal('영웅 이상도 자동으로 팔까요?', `앞으로 얻는 <b style="color:${G.RARITIES[v].color}">${G.RARITIES[v].name} 이하</b> 장비가 <b>바로 팔려요</b>.<br><small>특별 옵션(★) 장비와 유니크·신화는 팔리지 않아요. 지금 가방의 장비는 그대로예요.</small>`,
      [{ text: '취소', onClick: () => { $('autoSell').value = String(prev); } }, { text: '설정하기', cls: 'btn--gold', onClick: () => { state.autoSell = v; writeSave(); } }]);
  });
  // 선택 모드: 팔 장비를 여러 개 눌러 고른 뒤 한 번에 판다
  $('selectBtn').addEventListener('click', () => { selectMode = !selectMode; picked.clear(); renderGear(true); });
  $('selAll').addEventListener('click', () => {
    if (picked.size && picked.size === state.bag.length) picked.clear();
    else state.bag.forEach((x) => picked.add(x.id));
    renderGear(true);
  });
  $('selSell').addEventListener('click', () => {
    const items = state.bag.filter((x) => picked.has(x.id));
    if (!items.length) return;
    const sellNow = () => {
      const r = G.sellBagItems(state, items.map((x) => x.id));
      picked.clear();
      addLog(`장비 ${r.n}개를 팔았다 (+${G.fmt(r.gold)} 골드)`, 'is-gold', 'coin');
      writeSave(); render(); renderGear(true);
    };
    const rare = items.filter((x) => x.r >= 3);
    if (!rare.length) { sellNow(); return; }   // 영웅 이상이 섞여 있을 때만 한 번 더 확인한다
    const gold = items.reduce((a, x) => a + G.sellValue(x), 0);
    openModal('정말 팔까요?', `고른 장비 <b>${items.length}개</b> 중 <b style="color:${G.RARITIES[3].color}">영웅 이상 ${rare.length}개</b>가 있어요.<br>${COIN} 골드 <b>${G.fmt(gold)}</b>을(를) 받고 팔아요.<br><small>되돌릴 수 없어요.</small>`,
      [{ text: '취소' }, { text: '판매', cls: 'btn--gold', onClick: sellNow }]);
  });

  // 정리: 등급별로 또는 '지금 낀 장비보다 약한 것'을 한꺼번에 판다 (개수와 받을 골드를 미리 보여 준다)
  $('tidyBtn').addEventListener('click', () => {
    const s = state;
    const opts = [
      ...[[0, '노말 이하'], [1, '고급 이하'], [2, '희귀 이하'], [3, '영웅 이하'], [4, '전설 이하']].map(([r, label]) => ({ id: 'r' + r, label, r, items: s.bag.filter((x) => x.r <= r && !x.sp) })),   // 특별 옵션 장비와 유니크·신화는 넣지 않는다
      { id: 'weak', label: '장착 중인 장비보다 약한 것', items: G.bagWeaker(s) },
    ];
    const goldOf = (items) => items.reduce((a, x) => a + G.sellValue(x), 0);
    const first = opts.find((o) => o.items.length);
    if (!first) { openModal('정리할 장비가 없어요', '가방에서 팔 만한 장비를 찾지 못했어요.', [{ text: '확인' }]); return; }
    const html = '<div class="tidy">' + opts.map((o) =>
      `<label class="tidy__opt ${o.items.length ? '' : 'is-empty'}"><input type="radio" name="tidy" value="${o.id}" ${o === first ? 'checked' : ''} ${o.items.length ? '' : 'disabled'}>` +
      `<span><b>${o.label}</b><small>${o.items.length}개 · ${COIN}${G.fmt(goldOf(o.items))} 또는 ${DUST_IC}${G.fmt(o.items.reduce((a, x) => a + G.dustValue(x), 0))}</small></span></label>`).join('') +
      '</div><small>장착 중인 장비, 특별 옵션(★) 장비, 유니크·신화는 팔리지 않아요.</small>';
    const pickOpt = () => { const v = document.querySelector('input[name="tidy"]:checked'); return opts.find((x) => v && x.id === v.value); };
    openModal('장비 정리', html, [
      { text: '취소' },
      { text: '분해하기', onClick: () => {
        const o = pickOpt();
        if (!o || !o.items.length) return;
        const r = G.dismantleItems(state, o.items.map((x) => x.id));
        addLog(`장비 ${r.n}개를 분해했다 (가루 +${G.fmt(r.dust)})`, 'is-gold', 'anvil');
        writeSave(); render(); renderGear(true);
      } },
      { text: '판매하기', cls: 'btn--gold', onClick: () => {
        const v = document.querySelector('input[name="tidy"]:checked');
        const o = opts.find((x) => v && x.id === v.value);
        if (!o || !o.items.length) return;
        const doSell = () => {
          const r = G.sellBagItems(state, o.items.map((x) => x.id));
          addLog(`장비 ${r.n}개를 정리했다 (+${G.fmt(r.gold)} 골드)`, 'is-gold', 'coin');
          writeSave(); render(); renderGear(true);
        };
        if (o.r >= 3) openModal('정말 팔까요?', `<b style="color:${G.RARITIES[o.r].color}">${G.RARITIES[o.r].name} 이하</b> 장비 <b>${o.items.length}개</b>를 ${COIN} ${G.fmt(goldOf(o.items))} 골드에 팔아요.<br><small>영웅·전설이 들어 있어요. 되돌릴 수 없어요.</small>`, [{ text: '취소' }, { text: '판매', cls: 'btn--blue', onClick: doSell }]);
        else doSell();
      } },
    ]);
  });

  // ---- 업적 (기록 탭) ----
  // ---- 기록 탭: 일일·주간·월간 퀘스트와 업적 ----
  let logSeg = 'daily', achieveKey = '', questKey = '';
  const achOpen = new Set();   // 펼친 업적 분류 (받을 보상이 있는 분류는 처음부터 펼쳐 둔다)
  let achAutoOpened = false;
  const syncQuests = () => G.questSync(state, today());
  const questBar = (it) => `<div class="ach__bar"><i class="${it.done ? 'is-full' : ''}" style="width:${(it.cur / it.goal) * 100}%"></i></div>`;
  function renderQuests(force) {
    const p = logSeg;
    if (!G.QUEST_PERIODS.includes(p)) return;
    syncQuests();
    const b = G.questBoard(state, p), cfg = G.QUEST_CFG[p], left = G.periodSecsLeft(serverNow())[p];
    const key = [p, b.key, b.items.map((x) => x.cur + (x.claimed ? 'c' : '')).join(','), b.bonus.claimed, left === null ? 'x' : Math.floor(left / 60)].join('|');
    if (!force && key === questKey) return;
    questKey = key;
    const doneN = b.items.filter((x) => x.claimed).length;
    $('qHead').innerHTML = `<span><b>${cfg.name} 퀘스트</b> ${doneN}/${b.items.length} 완료</span><span>${left === null ? '서버 시각을 확인하지 못했어요' : `초기화까지 ${clockText(left)}`}</span>`;
    $('qList').innerHTML = b.items.map((it) => {
      const reward = it.claimed ? '<em>받음</em>' : it.done ? `<span>${GEM}${it.reward}</span><button class="btn btn--gold" type="button" data-qclaim="${p}:${it.id}">받기</button>` : `<span>${GEM}${it.reward}</span>`;
      return `<div class="ach ${it.done ? 'is-on' : ''} ${it.done && !it.claimed ? 'is-claim' : ''}">${A.icon(it.done ? 'check' : 'scroll')}<div class="ach__body">` +
        `<div class="ach__row"><div class="ach__name">${it.label}</div><div class="ach__num">${G.fmt(it.cur)} / ${G.fmt(it.goal)}</div></div>${questBar(it)}</div><div class="ach__rw">${reward}</div></div>`;
    }).join('');
    const bonusText = p === 'daily' ? `${GEM} ${b.bonus.reward} + 물약 1개` : `${GEM} ${b.bonus.reward}`;
    $('qBonus').classList.toggle('is-ready', b.bonus.ready);
    $('qBonus').innerHTML = `<div><b>모두 완료 보너스</b><small>${cfg.name} 퀘스트를 전부 받으면 ${bonusText}</small></div>` +
      (b.bonus.claimed ? '<em style="color:var(--muted)">받음</em>' : `<button class="btn btn--gold" type="button" data-qbonus="${p}" ${b.bonus.ready ? '' : 'disabled'}>받기</button>`);
  }
  function renderAchieves(force) {
    const s = state;
    const done = Object.keys(s.achieved).length;
    const claimable = G.unclaimedAchievements(s);
    if (!achAutoOpened) { achAutoOpened = true; for (const a of claimable) achOpen.add(a.group); }
    // 달성 수·진행도·받은 보상·펼친 분류가 바뀌었을 때만 다시 그린다
    const key = G.ACHIEVEMENTS.map((a) => (s.achieved[a.id] ? (s.achClaimed[a.id] ? 'c' : 'x') : Math.min(a.val(s), a.goal))).join('|') + '#' + [...achOpen].join(',');
    if (!force && key === achieveKey) return;
    achieveKey = key;
    $('achieveBonus').textContent = `${done} / ${G.ACHIEVEMENTS.length} · 공격력·골드 +${Math.round(done * G.ACHIEVE_BONUS * 1000) / 10}%`;
    const sum = claimable.reduce((t, a) => t + a.reward, 0);
    $('achClaim').hidden = claimable.length === 0;
    $('achClaimText').innerHTML = `받을 보상 <b>${claimable.length}개</b> · ${GEM} ${sum}`;
    const groups = [];
    for (const a of G.ACHIEVEMENTS) { let g = groups.find((x) => x.name === a.group); if (!g) groups.push(g = { name: a.group, list: [] }); g.list.push(a); }
    let html = '';
    for (const g of groups) {
      const n = g.list.filter((a) => s.achieved[a.id]).length, open = achOpen.has(g.name), cl = g.list.filter((a) => s.achieved[a.id] && !s.achClaimed[a.id]).length;
      html += `<button class="achgroup" type="button" data-grp="${g.name}"><span><i>${open ? '▾' : '▸'}</i>${g.name}${cl ? `<span class="seg__n">${cl}</span>` : ''}</span><small>${n} / ${g.list.length}</small></button>`;
      if (!open) continue;
      html += '<div class="achv">';
      for (const a of g.list) {
        const on = !!s.achieved[a.id], claimed = !!s.achClaimed[a.id];
        const cur = on ? a.goal : Math.min(a.val(s), a.goal);
        const reward = claimed ? '<em>받음</em>' : on ? `<span>${GEM}${a.reward}</span><button class="btn btn--gold" type="button" data-claim="${a.id}">받기</button>` : `<span>${GEM}${a.reward}</span>`;
        html += `<div class="ach ${on ? 'is-on' : ''} ${on && !claimed ? 'is-claim' : ''}">${A.icon(a.icon)}<div class="ach__body">` +
          `<div class="ach__row"><div class="ach__name">${a.name}</div><div class="ach__num">${G.fmt(cur)} / ${G.fmt(a.goal)}</div></div><div class="ach__desc">${a.desc}</div>` +
          `<div class="ach__bar"><i class="${on ? 'is-full' : ''}" style="width:${(cur / a.goal) * 100}%"></i></div></div><div class="ach__rw">${reward}</div></div>`;
      }
      html += '</div>';
    }
    $('achv').innerHTML = html;
  }
  // 분류 단추(일일·주간·월간·업적)와 받을 보상 개수 표시
  function renderLog(force) {
    for (const b of $('logSeg').querySelectorAll('button')) {
      const p = b.dataset.seg, n = p === 'ach' ? G.unclaimedAchievements(state).length : (state.quests[p] ? G.questBoard(state, p).claimable : 0);
      b.classList.toggle('is-on', p === logSeg);
      let badge = b.querySelector('.seg__n');
      if (n > 0) { if (!badge) { badge = document.createElement('i'); badge.className = 'seg__n'; b.appendChild(badge); } if (badge.textContent !== String(n)) badge.textContent = n; }
      else if (badge) badge.remove();
    }
    $('segQuest').hidden = logSeg === 'ach' || logSeg === 'rank';
    $('segAch').hidden = logSeg !== 'ach';
    $('segRank').hidden = logSeg !== 'rank';
    if (logSeg === 'ach') renderAchieves(force);
    else if (logSeg === 'rank') renderRank(force);
    else { renderQuests(force); if (logSeg === 'daily') renderAttend(force); else $('attendCard').hidden = true; }
  }
  $('logSeg').addEventListener('click', (e) => { const b = e.target.closest('button[data-seg]'); if (b) { logSeg = b.dataset.seg; questKey = ''; achieveKey = ''; attendKey = ''; rankKey = ''; if (logSeg === 'rank') { submitRank(true); loadRank(true); } if (logSeg === 'daily') loadAttend(); renderLog(true); } });
  function claimAchieves(ids) {
    let sum = 0;
    for (const id of ids) sum += G.claimAchievement(state, id);
    if (sum <= 0) return;
    addLog(`업적 보상! 크리스탈 +${sum}`, 'is-gold', 'gem');
    floatText(`+${sum} 크리스탈`, 'float--big', 'center');
    cloudSoon(); writeSave(); render(); renderLog(true);
  }
  $('achv').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-claim]');
    if (b) { claimAchieves([b.dataset.claim]); return; }
    const g = e.target.closest('button[data-grp]');
    if (g) { if (achOpen.has(g.dataset.grp)) achOpen.delete(g.dataset.grp); else achOpen.add(g.dataset.grp); renderAchieves(true); }
  });
  $('achClaimAll').addEventListener('click', () => claimAchieves(G.unclaimedAchievements(state).map((a) => a.id)));
  $('segQuest').addEventListener('click', (e) => {
    const c = e.target.closest('button[data-qclaim]'), bn = e.target.closest('button[data-qbonus]');
    if (c) {
      const [p, id] = c.dataset.qclaim.split(':');
      const got = G.claimQuest(state, p, id);
      if (got > 0) { addLog(`퀘스트 보상! 크리스탈 +${got}`, 'is-gold', 'gem'); floatText(`+${got} 크리스탈`, 'float--big', 'center'); cloudSoon(); writeSave(); render(); renderLog(true); }
    } else if (bn) {
      const r = G.claimQuestBonus(state, bn.dataset.qbonus);
      if (r) {
        addLog(`${G.QUEST_CFG[bn.dataset.qbonus].name} 퀘스트 완료 보너스! 크리스탈 +${r.crystals}`, 'is-gold', 'gem');
        openModal('모두 완료!', `<div style="font-size:15px;font-weight:900">${GEM} 크리스탈 +${r.crystals}</div>` + (r.potion ? `<div class="got" style="--rc:${r.potion.color};margin-top:8px">${A.icon(POTION_ICON[r.potion.id] || 'heart')}<div><b>${r.potion.name}</b><small>${r.potion.desc} · ${clockText(r.potion.dur)}</small></div></div>` : ''), [{ text: '확인', cls: 'btn--gold' }]);
        cloudSoon(); writeSave(); render(); renderLog(true);
      }
    }
  });


  // ---- 서버 출석 · 친선 랭킹 (로그인해야 하고, 서버 규칙이 켜져 있어야 한다) ----
  const Social = window.GoblinSocial;
  const hasFn = (n) => !!cloudAdapter && typeof cloudAdapter[n] === 'function';
  const loggedIn = () => !!cloud.state().user;
  const socialError = (e) => {
    const c = (e && e.code) || '';
    if (c === 'permission-denied') return '서버 규칙이 아직 켜져 있지 않거나 값이 맞지 않아요. 잠시 뒤 다시 시도해 주세요.';
    if (c === 'unavailable' || c === 'auth/network-request-failed') return '인터넷 연결을 확인해 주세요.';
    if (c === 'auth/requires-login') return '먼저 Google 계정을 연동해 주세요.';
    return (e && e.message) || '알 수 없는 오류가 났어요.';
  };
  const todayNum = () => { const t = serverNow(); return t === null ? null : Social.dayNumOf(t); };

  // 출석
  let socialUid = '';
  let attendRec, attendKey = '', attendMsg = '', attendBusy = false, attendLoaded = false;   // attendRec: undefined 아직 모름 | null 기록 없음 | 기록
  async function loadAttend() {
    if (!hasFn('attendGet') || !loggedIn() || attendLoaded) return;
    attendLoaded = true;
    try { attendRec = await cloudAdapter.attendGet(); } catch (e) { attendLoaded = false; attendMsg = socialError(e); }
    attendKey = ''; if (currentTab === 'log') renderLog(false);
  }
  function renderAttend(force) {
    const el = $('attendCard');
    if (!hasFn('attendCheckIn')) { el.hidden = true; return; }
    el.hidden = false;
    const today = todayNum(), rec = attendRec;
    const key = [loggedIn(), today, rec ? rec.day + ':' + rec.streak : String(rec), state.attend.claimed, attendMsg, attendBusy].join('|');
    if (!force && key === attendKey) return;
    attendKey = key;
    const done = rec && rec.day === today;
    const streak = rec && today !== null && rec.day >= today - 1 ? rec.streak : 0;   // 하루 이상 건너뛰었으면 연속이 끊긴 것
    const showStreak = done ? rec.streak : streak;
    const cycle = Store.ATTEND_REWARDS;
    const inCycle = showStreak === 0 ? 0 : ((showStreak - 1) % cycle.length) + 1;   // 이번 주기에서 채운 칸 수
    const nextIdx = done ? inCycle : (inCycle % cycle.length);
    let btn, msg = attendMsg;
    if (!loggedIn()) { btn = '<button class="btn" type="button" data-attend="login">Google 연동</button>'; msg = msg || '계정을 연동하면 서버에 기록되는 출석 보상을 받아요. (기기 시계를 바꿔도 소용없어요)'; }
    else if (today === null) { btn = '<button class="btn btn--gray" type="button" disabled>출석 체크</button>'; msg = msg || '서버 시각을 확인하지 못했어요. 인터넷에 연결되면 할 수 있어요.'; }
    else if (rec === undefined) { btn = '<button class="btn btn--gray" type="button" disabled>불러오는 중</button>'; }
    else if (!done) { btn = `<button class="btn btn--gold" type="button" data-attend="check" ${attendBusy ? 'disabled' : ''}>출석 체크</button>`; }
    else if (state.attend.claimed < today) { btn = '<button class="btn btn--gold" type="button" data-attend="claim">보상 받기</button>'; }
    else { btn = '<button class="btn btn--gray" type="button" disabled>오늘 완료</button>'; }
    el.innerHTML = `<div class="attend__head"><span>출석 체크 <small>${showStreak > 0 ? `${showStreak}일 연속` : '연속 0일'}${rec ? ` · 누적 ${rec.total}일` : ''}</small></span>${btn}</div>` +
      `<div class="attend__days">${cycle.map((r, i) => `<div class="attend__day ${i < inCycle ? 'is-done' : ''} ${i === nextIdx && !done ? 'is-today' : ''}">${i + 1}일<b>${r}</b></div>`).join('')}</div>` +
      (msg ? `<p class="attend__msg">${msg}</p>` : '<p class="attend__msg">하루에 한 번, 한국 시간 자정에 바뀌어요. 7일을 채우면 처음부터 다시 시작해요.</p>');
  }
  async function doAttend() {
    const today = todayNum();
    if (attendBusy || today === null) return;
    attendBusy = true; attendMsg = ''; renderAttend(true);
    try {
      const r = await cloudAdapter.attendCheckIn(today);
      attendRec = r.rec;
    } catch (e) { attendMsg = socialError(e); }
    attendBusy = false;
    claimAttendReward();
    renderAttend(true);
  }
  function claimAttendReward() {
    const today = todayNum();
    if (today === null || !attendRec) return;
    const got = G.claimAttend(state, attendRec, today);
    if (got > 0) {
      addLog(`출석 보상! 크리스탈 +${got} (${attendRec.streak}일 연속)`, 'is-gold', 'gem');
      floatText(`+${got} 크리스탈`, 'float--big', 'center');
      cloudSoon(); writeSave(); render();
      openModal('출석 완료!', `<div style="font-size:15px;font-weight:900">${GEM} 크리스탈 +${got}</div><div style="margin-top:6px;color:var(--muted)">${attendRec.streak}일 연속 출석이에요.</div>`, [{ text: '확인', cls: 'btn--gold' }]);
    }
  }
  $('attendCard').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-attend]');
    if (!b) return;
    if (b.dataset.attend === 'login') $('settingsBtn').click();
    else if (b.dataset.attend === 'check') doAttend();
    else if (b.dataset.attend === 'claim') { claimAttendReward(); renderAttend(true); }
  });

  // 랭킹
  let rankBoard = 'best', rankKey = '', rankMsg = '', rankBusy = false, lastRankSent = null, lastRankAt = 0, rankBlockedUntil = 0;
  const rankCache = {};   // { 종류: { at, rows } } — 읽기 횟수를 아끼려고 1분 동안 다시 부르지 않는다
  async function submitRank(force) {
    if (!hasFn('rankSubmit') || !loggedIn() || !state.nick || Date.now() < rankBlockedUntil) return;
    const entry = Social.rankEntry(state, state.nick, G.lookId(state));
    if (!entry || !Social.rankChanged(lastRankSent, entry)) return;
    if (!force && Date.now() - lastRankAt < 5 * 60e3) return;
    if (Date.now() - lastRankAt < 31e3) return;   // 서버 규칙: 30초에 한 번
    lastRankAt = Date.now();
    try { await cloudAdapter.rankSubmit(entry); lastRankSent = entry; rankMsg = ''; delete rankCache[rankBoard]; }
    catch (e) { rankMsg = socialError(e); rankBlockedUntil = Date.now() + 10 * 60e3; }
    if (currentTab === 'log' && logSeg === 'rank') { rankKey = ''; renderLog(false); }
  }
  async function loadRank(force) {
    if (!hasFn('rankTop') || !loggedIn() || !state.nick || rankBusy) return;
    const c = rankCache[rankBoard];
    if (!force && c && Date.now() - c.at < 60e3) return;
    if (c && Date.now() - c.at < 20e3) return;
    rankBusy = true; rankKey = ''; if (currentTab === 'log') renderLog(false);
    try { rankCache[rankBoard] = { at: Date.now(), rows: await cloudAdapter.rankTop(Social.RANK_BOARDS.find((b) => b.id === rankBoard).field, 50) }; rankMsg = ''; }
    catch (e) { rankMsg = socialError(e); }
    rankBusy = false; rankKey = ''; if (currentTab === 'log') renderLog(false);
  }
  function renderRank(force) {
    const el = $('rankBody');
    const c = rankCache[rankBoard];
    const key = [loggedIn(), state.nick, rankBoard, rankBusy, rankMsg, c ? c.at : 0, hasFn('rankTop')].join('|');
    if (!force && key === rankKey) return;
    rankKey = key;
    if (!hasFn('rankTop')) { el.innerHTML = '<div class="rankempty">랭킹은 Firebase 연결이 있어야 해요.</div>'; return; }
    if (!loggedIn()) { el.innerHTML = '<div class="rankempty">Google 계정을 연동하면 랭킹에 참여할 수 있어요.<br><button class="btn btn--gold" type="button" data-rank="login" style="margin-top:8px">Google 연동</button></div>'; return; }
    if (!state.nick) { el.innerHTML = '<div class="rankempty">랭킹에 보일 닉네임을 정해 주세요.<br>참여하면 닉네임과 기록이 다른 로그인 사용자에게 보여요.<br><button class="btn btn--gold" type="button" data-rank="nick" style="margin-top:8px">닉네임 정하고 참여</button></div>'; return; }
    const board = Social.RANK_BOARDS.find((b) => b.id === rankBoard);
    const chips = `<div class="rankchips">${Social.RANK_BOARDS.map((b) => `<button type="button" data-board="${b.id}" class="${b.id === rankBoard ? 'is-on' : ''}">${b.label}</button>`).join('')}</div>`;
    let rows = '';
    if (rankBusy && !c) rows = '<div class="rankempty">불러오는 중…</div>';
    else if (c && c.rows.length === 0) rows = '<div class="rankempty">아직 기록이 없어요. 첫 번째가 되어 보세요!</div>';
    else if (c) rows = c.rows.map((r, i) => `<div class="rankrow ${r.me ? 'is-me' : ''}"><div class="rankrow__n">${i + 1}</div><div class="rankrow__av">${A.goblin(G.NODES[r.look] ? r.look : 'novice', { head: true })}</div>` +
      `<div class="rankrow__name">${esc(r.name)}<small>Lv.${r.level} · 환생 ${r.prestiges}회</small></div><div class="rankrow__val">${G.fmt(r[board.field])}${board.unit}</div></div>`).join('');
    const mine = Social.rankEntry(state, state.nick, G.lookId(state));
    el.innerHTML = chips + rows +
      (mine ? `<div class="rankrow is-me" style="margin-top:8px"><div class="rankrow__n">나</div><div class="rankrow__av">${A.goblin(G.lookId(state), { head: true })}</div><div class="rankrow__name">${esc(mine.name)}<small>${rankMsg ? '' : '내 기록 (5분마다 올라가요)'}</small></div><div class="rankrow__val">${G.fmt(mine[board.field])}${board.unit}</div></div>` : '') +
      (rankMsg ? `<div class="rankempty">${rankMsg}</div>` : '') +
      '<div class="rankfoot"><button class="link" type="button" data-rank="refresh">새로고침</button><button class="link" type="button" data-rank="nick">닉네임 바꾸기</button><button class="link" type="button" data-rank="remove">내 기록 지우기</button></div>';
  }
  function askNick() {
    openModal('닉네임 정하기', `<div>랭킹에 보일 이름이에요. 한글·영문·숫자 12자까지.<br><small>다른 로그인 사용자에게 보여요.</small></div><input class="nickinput" id="nickInput" maxlength="12" value="${esc(state.nick)}" autocomplete="off">`,
      [{ text: '취소' }, { text: '저장', cls: 'btn--gold', onClick: () => {
        const v = Social.sanitizeNick(($('nickInput') || {}).value);
        if (!v) { openModal('닉네임을 확인해 주세요', '한글·영문·숫자로 1~12자를 써 주세요.', [{ text: '확인', onClick: askNick }]); return; }
        state.nick = v; lastRankSent = null; cloudSoon(); writeSave(); rankKey = '';
        submitRank(true); loadRank(true); renderLog(true);
      } }]);
  }
  $('rankBody').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-rank], button[data-board]');
    if (!b) return;
    if (b.dataset.board) { rankBoard = b.dataset.board; rankKey = ''; loadRank(false); renderLog(true); return; }
    const a = b.dataset.rank;
    if (a === 'login') $('settingsBtn').click();
    else if (a === 'nick') askNick();
    else if (a === 'refresh') loadRank(true);
    else if (a === 'remove') openModal('랭킹에서 지울까요?', '서버에 올린 내 기록을 지워요. 게임 진행에는 영향이 없고, 닉네임을 다시 정하면 다시 참여해요.',
      [{ text: '취소' }, { text: '지우기', cls: 'btn--blue', onClick: async () => { try { await cloudAdapter.rankRemove(); state.nick = ''; lastRankSent = null; for (const k of Object.keys(rankCache)) delete rankCache[k]; cloudSoon(); writeSave(); } catch (err) { rankMsg = socialError(err); } rankKey = ''; renderLog(true); } }]);
  });
  setInterval(() => { if (!booting && !document.hidden) submitRank(false); }, 60000);   // 기록이 바뀌었을 때만, 5분에 한 번까지 올린다

  // ---- 이벤트 처리 ----
  function handleEvents(events) {
    let gold = 0;
    let killShown = false;
    for (const e of events) {
      if (e.type === 'kill') {
        gold += e.gold;
        if (!killShown) {   // 한 프레임에 여러 마리를 잡아도 처치 연출은 한 번만
          killShown = true;
          killFx(e.boss);
          if (!calm() || e.boss) floatText('+' + G.fmt(e.gold), 'float--gold', 'gold');
        }
        if (e.boss) addLog(`보스를 쓰러뜨렸다! +${G.fmt(e.gold)} 골드`, 'is-gold', 'skull');
      } else if (e.type === 'stage') {
        addLog(`스테이지 ${e.stage} 도전!`, 'is-good', 'star');
        if (G.isBossStage(e.stage)) bossIntro();
        else anim(document.querySelector('.ribbon__in'), [{ transform: 'scale(1)' }, { transform: 'scale(1.12)', offset: 0.3 }, { transform: 'scale(1)' }], { duration: 380, easing: 'ease-out' });
      } else if (e.type === 'levelup') {
        addLog(`레벨 ${e.level} 달성!`, 'is-good', 'arrowup');
        levelUpFx();
      } else if (e.type === 'skill') {
        skillFx(e);
      } else if (e.type === 'promoReady') {
        addLog(`${TIER_NAME[STAGE_TIER[e.stage]]} 전직이 가능해요! '전직' 메뉴를 확인하세요`, 'is-gold', 'cap');
        floatText('전직 가능!', 'float--big', 'center');
      } else if (e.type === 'transcendReady') {
        addLog(`초월 ${e.rank}랭크를 할 수 있어요! '전직' 메뉴를 확인하세요`, 'is-gold', 'cap');
        floatText('초월 가능!', 'float--big', 'center');
      } else if (e.type === 'down') {
        addLog(`쓰러졌다... 스테이지 ${e.to}로 후퇴`, 'is-bad', 'skull');
        shakeScene(5);
      } else if (e.type === 'drop') {
        const it = e.item, R = G.RARITIES[it.r], name = G.itemName(it);
        if (!((e.action === 'sold' || e.action === 'dusted') && it.r === 0)) {   // 자동 판매된 노말까지 기록하면 너무 많다
          const verb = e.action === 'equipped' ? '장착' : e.action === 'bag' ? '획득' : e.action === 'dusted' ? `분해 +${G.fmt(e.dust)} 가루` : `판매 +${G.fmt(e.gold)} 골드`;
          addLog(`[${R.name}] ${name} ${verb}`, it.r >= 2 ? 'is-gold' : 'is-good', G.GEAR[it.slot].icon);
        }
        if (calm() ? it.r >= 2 : ((e.action !== 'sold' && e.action !== 'dusted') || it.r >= 2)) floatText(`${R.name} ${name}`, 'float--drop', 'center', R.color);
        if (it.r >= 3) rareDropFx(it.r);
        if (e.action !== 'sold') gearNew.add(it.id);
      } else if (e.type === 'achieve') {
        const a = G.ACHIEVEMENTS.find((x) => x.id === e.id);
        addLog(`업적 달성: ${a.name}! 공격력·골드 +${Math.round(G.ACHIEVE_BONUS * 100)}% · 크리스탈 ${a.reward}개 (기록 탭에서 받기)`, 'is-gold', a.icon);
        floatText('업적 달성!', 'float--big', 'center');
      }
    }
    return gold;
  }

  // ---- 화면 갱신 ----
  let lastLook = '';
  let lastMonster = '';
  let lastPipMode = '';

  function renderPips(s) {
    const boss = G.isBossStage(s.stage);
    const box = $('pips');
    const mode = boss ? 'boss' : 'normal';
    if (mode !== lastPipMode) {
      lastPipMode = mode;
      box.innerHTML = boss ? '<i class="boss"></i>' : '<i></i>'.repeat(G.KILLS_PER_STAGE);
    }
    if (!boss) {
      const pips = box.children;
      for (let i = 0; i < pips.length; i++) pips[i].classList.toggle('on', i < s.killsInStage);
    }
  }

  function render() {
    const s = state;
    setText('gold', G.fmt(s.gold));
    setText('tokens', G.tokenBalance(s));

    // 영웅 정보
    const title = G.classTitle(s);
    setText('heroTitle', title);
    setText('heroTag', title);
    setText('level', s.level);
    const need = G.expNeeded(s);
    setWidth('expBar', (s.exp / need) * 100);
    setText('expText', `${G.fmt(s.exp)} / ${G.fmt(need)}`);

    const look = G.lookId(s);
    if (look !== lastLook) {
      lastLook = look;
      $('hero').innerHTML = A.goblin(look) + '<i class="hero-weapon" id="heroWeapon"></i>';
      $('avatar').innerHTML = A.goblin(look, { head: true });
      setupHeroWeapon();
    }
    const scale = 1 + Math.min(0.3, (s.level - 1) / 150);
    if (cache.scale !== scale) { cache.scale = scale; $('hero').style.setProperty('--s', scale.toFixed(3)); }

    // 장면
    const boss = G.isBossStage(s.stage);
    const scene = $('scene');
    scene.classList.toggle('stage--boss', boss);
    scene.classList.toggle('is-down', s.downT > 0);
    const biome = G.biomeOf(s.stage);
    if (scene.dataset.biome !== String(biome)) scene.dataset.biome = String(biome);
    // 지역 안에서의 진행: 초반(1~4)은 밝게, 후반(6~9)은 어둡게, 보스 자리는 보스 배경으로 하늘 색을 조금씩 바꾼다
    const mon = G.monsterInfo(s.stage);
    const phase = boss ? 'boss' : mon.pos <= 4 ? '0' : '1';
    if (scene.dataset.phase !== phase) scene.dataset.phase = phase;
    const roundKey = String(Math.min(mon.round, 4));
    if (scene.dataset.round !== roundKey) scene.dataset.round = roundKey;
    const ROUND_NAME = ['', ' II', ' III', ' IV', ' V'];
    setText('biomeName', `${BIOMES[biome]}${ROUND_NAME[Math.min(mon.round, 4)]} · ${mon.pos}/${G.BIOME_LEN}`);
    setText('stageLabel', boss ? `BOSS ${s.stage}` : `STAGE ${s.stage}`);
    renderPips(s);
    $('downBanner').hidden = s.downT <= 0;

    const striking = s.downT <= 0;
    $('heroBox').classList.toggle('is-striking', striking);
    for (const k of ['haste', 'might', 'guard', 'greed']) $('heroBox').classList.toggle('buff-' + k, !!s.buffs[k]);   // 효과가 걸려 있는 동안 몸이 은은히 빛난다
    renderSkillbar();
    renderStatusFx();
    const dur = Math.max(0.3, Math.min(1.4, 1 / G.attacksPerSec(s))).toFixed(2) + 's';
    if (cache.dur !== dur) { cache.dur = dur; $('heroBox').style.setProperty('--atk', dur); }

    const monKey = mon.kind + '|' + mon.biome + '|' + mon.boss + '|' + mon.round;
    if (monKey !== lastMonster) {
      lastMonster = monKey;
      $('monster').innerHTML = A.monster(mon.kind, mon.biome, mon.boss, mon.round);
    }
    setText('monsterName', mon.name);
    const max = G.maxHp(s);
    setWidth('goblinHpBar', (s.hp / max) * 100);
    setWidth('goblinHpTrail', (s.hp / max) * 100);
    setText('goblinHpText', `${G.fmt(Math.max(0, s.hp))} / ${G.fmt(max)}`);
    setWidth('monsterHpBar', (s.monsterHp / s.monsterMax) * 100);
    setWidth('monsterHpTrail', (s.monsterHp / s.monsterMax) * 100);
    setText('monsterHpText', `${G.fmt(Math.max(0, s.monsterHp))} / ${G.fmt(s.monsterMax)}`);

    // 능력치
    setText('statDmg', G.fmt(G.hitDmg(s)));
    setText('statAps', G.attacksPerSec(s).toFixed(1) + '/s');
    setText('statComp', G.fmt(G.companionDps(s)));
    setText('statDps', G.fmt(G.totalDps(s)));

    // 강화
    let anyBuy = false;
    for (const key of G.UPGRADE_KEYS) {
      const u = G.UPGRADES[key];
      const r = upRefs[key];
      const lv = s.upgrades[key];
      const maxed = lv >= u.max;
      const can = !maxed && G.canBuy(s, key);
      if (can) anyBuy = true;
      const plan = maxed ? null : G.planBuy(s, key, buyWant());
      const sig = `${lv}|${maxed}|${can}|${maxed ? '' : G.upgradeCost(s, key)}|${plan ? plan.n + '/' + plan.cost : ''}`;
      if (sig === r.last) continue;
      r.last = sig;
      r.name.innerHTML = `${u.name} <span class="lv">Lv.${lv}${maxed ? ' MAX' : ''}</span>`;
      r.desc.innerHTML = maxed ? u.effect(lv) : `${u.effect(lv)} → <em>${u.effect(lv + 1)}</em>`;
      if (u.mile && !maxed) {
        const next = (Math.floor(lv / G.MILESTONE_EVERY) + 1) * G.MILESTONE_EVERY;
        r.mile.hidden = false;
        r.mile.innerHTML = `<span>Lv.${next} 달성 시 효과 ×${G.MILESTONE_MULT}</span><div class="bar"><i style="width:${((lv % G.MILESTONE_EVERY) / G.MILESTONE_EVERY) * 100}%"></i></div>`;
      } else {
        r.mile.hidden = true;
      }
      // 여러 개를 살 수 있으면 "강화 ×N"과 총 비용을, 못 사면 다음 1개의 비용을 보여준다
      r.btn.innerHTML = maxed ? 'MAX'
        : `<small>${plan.n > 1 ? `강화 ×${plan.n}` : '강화'}</small><span>${COIN}${G.fmt(plan.n > 0 ? plan.cost : G.upgradeCost(s, key))}</span>`;
      r.btn.disabled = maxed || !can;
    }

    // 직업 탭
    if (currentTab === 'class') renderClass(false);
    if (currentTab === 'gear') renderGear(false);
    if (currentTab === 'shop') renderShop(false);
    if (currentTab === 'store') renderStore(false);
    if (currentTab === 'dungeon') renderDungeon(false);
    renderPotionbar();
    if (currentTab === 'log') renderLog(false);

    // 환생 탭
    const info = G.prestigeInfo(s), gain = info.gain;
    const fullGain = Math.max(1, Math.floor(info.base * (1 + G.relicV(s, 'token'))));
    const pb = $('prestigeBtn');
    setText('pTokens', G.tokenBalance(s));
    setText('pBonus', '+' + Math.round((G.tokenMult(s) - 1) * 100) + '%');
    setText('pBest', s.bestStage);
    pb.disabled = gain <= 0;
    setText('prestigeBtn', gain > 0 ? `환생하기 (증표 +${gain})` : '아직 환생할 수 없어요');
    const perTok = Math.round(G.TOKEN_BONUS * G.resonance(s) * 100), maxTok = Math.round(G.TOKEN_BONUS * (1 + 5 * G.RESONANCE) * 100);
    const runMin = Math.floor(s.runT / 60);
    const timeNote = gain <= 0 ? '' : info.timeF < 1
      ? `이번 판은 <b>${runMin}분</b> 키웠어요. 증표는 판을 <b>10분</b> 키우면 100%이고 지금은 ${Math.round(info.timeF * 100)}%예요 (${Math.ceil(info.secsLeft / 60)}분 더 키우면 +${fullGain}).`
      : `이번 판을 10분 넘게 키워서 증표를 100% 받아요.`;
    setHtml('prestigeHint', gain > 0
      ? `지금 환생하면 왕의 증표 <b>${gain}개</b>를 얻어요. ${timeNote}<br>골드·레벨·강화·스테이지·직업은 처음부터 다시 시작하고, 직업 도감은 그대로 남아요.`
      : `스테이지 ${G.PRESTIGE_MIN_STAGE}에 도달하면 환생할 수 있어요. 환생하면 왕의 증표를 얻어 영구히 강해지고, 다른 직업으로 다시 시작해 볼 수 있어요.`);
    setHtml('prestigeNote',
      `증표 1개당 공격력·골드 <b>+${perTok}%</b>, 체력도 조금 늘어요.<br>` +
      `<b>전직할 때마다 증표의 힘이 ${Math.round(G.RESONANCE * 100)}%씩 더 깨어나요.</b> 지금 ${G.classPath(s).length}단계 → 5차 직업이면 증표 1개당 +${maxTok}%까지 올라요.<br>` +
      `증표는 <b>증표 탭</b>에서 영구 강화를 사는 데 쓰고, 4단계의 <b>직업 각성·도감 공명</b>은 전직과 이어진 강화예요.`);

    setText('awayNote', `자리를 비워도 최대 ${Math.round(G.offlineCap(s) / 3600)}시간까지 보상을 받아요. 비운 시간은 ${serverNow() === null ? '기기 시계' : '서버 시각'} 기준으로 재고, 창을 닫아도 백그라운드에 두어도 같은 규칙이에요.`);

    // 메뉴 알림 점
    const dots = document.querySelectorAll('.tabnav__btn .dot');
    G.dungeonSync(s, today());
    const want = [anyBuy && currentTab !== 'upgrade', gearNew.size > 0 && currentTab !== 'gear', (G.promoStage(s) !== null || G.transcendReady(s)) && currentTab !== 'class', gain > 0 && currentTab !== 'prestige',
      G.PERK_KEYS.some((id) => G.canBuyPerk(s, id)) && currentTab !== 'shop', G.adStatus(s, today()).left > 0 && adsMod.available && currentTab !== 'store',
      (G.dungeonClaimable(s) > 0 || G.towerInfo(s, today()).dailyReady) && currentTab !== 'dungeon', (G.unclaimedAchievements(s).length > 0 || G.questClaimable(s) > 0) && currentTab !== 'log'];
    dots.forEach((d, i) => { if (d.hidden === want[i]) d.hidden = !want[i]; });
  }

  $('relicBar').addEventListener('click', () => goTab('store'));

  // ---- 크리스탈 상점 ----
  // 결제와 광고는 지금 '시연 모드'다: 실제 돈이 청구되지 않고, 실제 광고도 나오지 않는다. (실제로 바꾸는 방법: docs/PAYMENTS.md)
  const Store = window.GoblinStore;
  const POTION_ICON = { gold: 'coin', might: 'sword', haste: 'boots', exp: 'arrowup', luck: 'star', hero: 'crown' };
  const won = (n) => n.toLocaleString('ko-KR') + '원';
  const clockText = (sec) => (sec >= 3600 ? `${Math.floor(sec / 3600)}시간 ${Math.floor((sec % 3600) / 60)}분` : `${Math.max(1, Math.ceil(sec / 60))}분`);
  const today = () => G.adToday(state, serverNow(), Date.now());
  let storeKey = '', potionKey = '';
  const rarityName = (r) => `<b style="color:${G.RARITIES[r].color}">${G.RARITIES[r].name}</b>`;
  const oddsHtml = (odds) => Object.keys(odds).map(Number).map((r) => `<span style="color:${G.RARITIES[r].color}">${G.RARITIES[r].name} ${odds[r]}%</span>`).join('');
  const reasonText = { crystals: '크리스탈이 부족해요', bag: '가방에 자리가 없어요. 장비를 팔거나 가방을 넓혀 주세요', max: '더 살 수 없어요', owned: '이미 산 상품이에요', unknown: '없는 상품이에요' };

  const paymentsMod = window.GoblinPayments.createPayments(window.PAYMENTS_CONFIG, { confirmDemo });
  const adsMod = window.GoblinAds.createAds(window.ADS_CONFIG, { showDemoAd });

  function renderStore(force) {
    const s = state;
    const ad = G.adStatus(s, today());
    const sh = G.shopSync(s, serverNow(), Date.now());
    const key = [s.crystals, ad.left, s.shop.win, s.shop.reroll, s.shop.bought.join(''), sh.secsLeft === null ? 'x' : Math.floor(sh.secsLeft / 60), s.bag.length, s.bagExtra, Object.keys(s.relics).join('+'), s.relicEq.join('+'), s.bought.starter ? 1 : 0, s.mythPity, s.bag.length >= G.bagLimit(s) ? 1 : 0, paymentsMod.mode, adsMod.mode].join('|');
    if (!force && key === storeKey) return;
    storeKey = key;
    $('crystalBal').textContent = G.fmt(s.crystals);
    $('chargeBtn').disabled = !paymentsMod.available;
    $('chargeBtn').textContent = paymentsMod.available ? '충전하기' : '준비 중';
    const demo = [];
    if (paymentsMod.isDemo) demo.push('결제는 <b>시연용</b>이에요. 실제 돈은 청구되지 않고, 카드 정보도 받지 않아요.');
    if (adsMod.isDemo) demo.push('광고도 <b>시연 화면</b>이에요.');
    $('demoNote').hidden = demo.length === 0;
    $('demoNote').innerHTML = demo.join(' ');

    $('adCard').innerHTML = `<div class="card prod"><div class="prod__tile" style="--tone:#3a8a4a">${A.icon('arrowup')}</div>` +
      `<div><div class="prod__name">광고 보고 크리스탈·물약 <span class="prod__chip">무료</span></div>` +
      `<div class="prod__desc">광고를 끝까지 볼 때마다 ${GEM} <b>크리스탈 ${Store.AD_CRYSTALS}개</b>와 <b>랜덤 물약 1개</b> (30분~1시간 동안 강해져요).<br>오늘 ${ad.left}/${ad.limit}번 남음 · 한국 시간 자정에 초기화</div></div>` +
      `<button class="btn prod__btn" type="button" data-ad ${ad.left > 0 && adsMod.available ? '' : 'disabled'}><span>${ad.left > 0 ? '광고 보기' : '오늘 끝'}</span></button></div>`;

    const buyBtn = (id, price, disabled, label) => `<button class="btn btn--gold prod__btn" type="button" data-buy="${id}" ${disabled ? 'disabled' : ''}>${label ? `<small>${label}</small>` : ''}<span>${GEM}${price}</span></button>`;
    const card = (icon, tone, name, desc, extra, btn) => `<div class="card prod"><div class="prod__tile" style="--tone:${tone}">${A.icon(icon)}</div><div><div class="prod__name">${name}</div><div class="prod__desc">${desc}</div>${extra || ''}</div>${btn}</div>`;

    // 장비 상점: 특별 옵션이 붙은 영웅 이상 장비 (정해진 시간마다 새로 들어온다, 가끔 유니크·신화)
    $('gshopTimer').textContent = sh.secsLeft === null ? '서버 시각을 확인하지 못했어요' : `다음 갱신까지 ${clockText(sh.secsLeft)}`;
    $('gshopReroll').disabled = s.shop.reroll >= Store.GEAR_SHOP.rerollMax || s.crystals < Store.GEAR_SHOP.rerollCost;
    $('gshopReroll').innerHTML = `새로고침 ${GEM}${Store.GEAR_SHOP.rerollCost} <small>(${Store.GEAR_SHOP.rerollMax - s.shop.reroll}/${Store.GEAR_SHOP.rerollMax})</small>`;   // 아이콘은 그림이라 textContent가 아니라 innerHTML로 넣는다 (예전에는 그림 코드가 글자로 보였다)
    $('gshopNote').innerHTML = `영웅 이상 장비에 <b>드롭에는 없는 특별 옵션</b>이 붙어 있어요. 낀 동안 효과가 적용되고, 옵션 없는 드롭에게 자리를 뺏기지 않아요. 진열은 ${Store.GEAR_SHOP.refreshSec / 3600}시간마다 새로 바뀌어요.<br>칸마다 전설 ${Math.round(Store.GEAR_SHOP.legendChance * 100)}% · <b style="color:${G.RARITIES[5].color}">유니크 ${Math.round(Store.GEAR_SHOP.uniqueChance * 100)}%</b> · <b style="color:${G.RARITIES[6].color}">신화 ${Math.round(Store.GEAR_SHOP.mythChance * 100)}%</b> 확률로 진열돼요.`;
    $('gearShop').innerHTML = G.shopStock(s).map((o) => {
      const it = o.item, R = G.RARITIES[it.r], cur = s.equip[it.slot];
      const cmp = !cur ? '<span class="cmp-plus">칸이 비어 있어요</span>' : cur.kind === it.kind ? (() => { const d = Math.round((it.val - cur.val) * 10) / 10; return `<span class="${d >= 0 ? 'cmp-plus' : 'cmp-minus'}">낀 장비보다 ${d >= 0 ? '▲ +' : '▼ '}${d}%p</span>`; })() : '';
      const btn = o.sold ? '<button class="btn btn--gray prod__btn" type="button" disabled>판매 완료</button>' : `<button class="btn btn--gold prod__btn" type="button" data-gbuy="${o.i}" ${s.crystals < o.price ? 'disabled' : ''}><span>${GEM}${o.price}</span></button>`;
      return `<div class="card prod gshop r${it.r} ${o.sold ? 'is-sold' : ''}" style="--rc:${R.color}"><div class="prod__tile">${gearArt(it)}</div>` +
        `<div><div class="prod__name" style="color:${R.color}">${G.itemName(it)} <span class="prod__chip">${R.name}</span></div>` +
        `<div class="prod__desc">${G.GEAR[it.slot].kinds[it.kind].label} +${fmtVal(it.val)}% · Lv.${it.ilvl} ${cmp}</div>` +
        `<div class="relic__opts" style="--rc:${R.color}"><b>${spText(it)}</b></div></div>${btn}</div>`;
    }).join('');

    // 신화 보장 게이지: 상자·칸별 뽑기에 쓴 크리스탈이 가득 차면 다음 장비가 신화
    const P = Store.MYTH_PITY, pv = Math.min(P, s.mythPity), myth = G.RARITIES[6];
    $('pityBar').innerHTML = `<div class="pity__head"><b style="color:${myth.color}">신화 보장</b><span>${GEM}${G.fmt(pv)} / ${G.fmt(P)}</span></div>` +
      `<div class="pity__bar"><i style="width:${(pv / P) * 100}%"></i></div>` +
      `<small>장비 상자·칸별 뽑기에 크리스탈을 ${G.fmt(P)}개 쓰면 그 구매의 첫 장비가 <b style="color:${myth.color}">신화 확정</b>이에요 (전설 상자 3개째). 지금 ${G.fmt(P - pv)}개 남았어요.</small>`;
    $('boxList').innerHTML = Store.BOXES.map((b) =>
      card('gem', '#7a4aff99', b.name, b.desc, `<div class="prod__odds">${oddsHtml(b.odds)}</div>`, buyBtn(b.id, b.price, s.crystals < b.price))).join('');

    $('slotDrawList').innerHTML = Store.SLOT_DRAWS.map((d) =>
      card(d.icon, '#5aa8ff99', d.name, d.desc, `<div class="prod__odds">${oddsHtml(d.odds)}</div>`, buyBtn(d.id, d.price, s.crystals < d.price))).join('');
    const relicsLeft = G.unownedRelics(s).length;
    $('relicDrawList').innerHTML = relicsLeft === 0 ? '' : card(Store.RELIC_DRAW.icon, '#c07aff99', Store.RELIC_DRAW.name,
      `${Store.RELIC_DRAW.desc} (남은 유물 ${relicsLeft}/${Store.RELICS.length})`, '', buyBtn(Store.RELIC_DRAW.id, Store.RELIC_DRAW.price, s.crystals < Store.RELIC_DRAW.price));

    const bagMaxed = s.bagExtra >= Store.BAG_EXTRA_MAX;
    const u = Store.UTILITIES[0], st = Store.STARTER;
    $('utilList').innerHTML =
      card('pouch', '#8a6a3a99', u.name, `${u.desc}<br>지금 ${G.bagLimit(s)}칸`, '', bagMaxed ? '<button class="btn btn--gray prod__btn" type="button" disabled>MAX</button>' : buyBtn(u.id, u.price, s.crystals < u.price)) +
      card('party', '#ff8a3a99', st.name, st.desc, '', s.bought.starter ? '<button class="btn btn--gray prod__btn" type="button" disabled>구매 완료</button>' : buyBtn(st.id, st.price, s.crystals < st.price));

    $('relicCount').textContent = `장착 ${s.relicEq.length}/${Store.RELIC_SLOTS} · 드롭으로 얻을 수 없는 특별 옵션`;
    $('relicList').innerHTML = Store.RELICS.map((r) => {
      const own = !!s.relics[r.id], on = s.relicEq.includes(r.id);
      const btn = !own ? buyBtn(r.id, r.price, s.crystals < r.price)
        : `<button class="btn ${on ? 'btn--gray' : 'btn--gold'} prod__btn" type="button" data-relic="${r.id}">${on ? '해제' : '장착'}</button>`;
      const opts = `<div class="relic__opts">${r.opts.map((o) => `<b>${o.text}</b>`).join('')}</div>`;
      return `<div class="card prod relic ${on ? 'is-on' : ''}" style="--rc:${r.color}"><div class="prod__tile" style="--tone:${r.color}55">${A.icon(r.icon)}</div>` +
        `<div><div class="prod__name">${r.name} <span class="prod__chip prod__chip--relic">${on ? '장착 중' : own ? '보유' : '유물'}</span></div><div class="prod__desc">${r.desc}</div>${opts}</div>${btn}</div>`;
    }).join('');

    $('storeNote').innerHTML = '칸별 뽑기는 무기·방어구·액세서리 중 원하는 칸이 확정으로 나와요 (등급은 무작위). 유물 뽑기는 아직 없는 유물 하나를 무작위로 줘요. 유물은 한 번 사면 영구히 내 것이고 환생해도 남아요. 한 번에 2개까지만 장착할 수 있어서 상황에 맞게 바꿔 끼우세요. 장비 상자·뽑기는 위 확률대로 등급이 정해져요 (같은 등급 안에서 능력은 무작위). 산 장비는 자동 판매되지 않고, 더 좋으면 바로 장착돼요. 물약은 게임을 꺼 둔 동안에도 시간이 줄어요.';
  }

  function renderPotionbar() {
    const list = Store.POTIONS.filter((p) => state.potions[p.id] > 0);
    const key = list.map((p) => p.id + ':' + Math.ceil(state.potions[p.id] / 60)).join(',');
    if (key === potionKey) return;
    potionKey = key;
    const bar = $('potionbar');
    bar.hidden = list.length === 0;
    bar.innerHTML = list.map((p) => `<div class="pchip" style="--pc:${p.color}">${A.icon(POTION_ICON[p.id] || 'heart')}${clockText(state.potions[p.id])}</div>`).join('');
  }

  function toggleRelic(id) {
    const r = G.toggleRelic(state, id);
    if (r === 'full') { openModal('유물 칸이 가득 찼어요', `유물은 ${Store.RELIC_SLOTS}개까지만 낄 수 있어요. 다른 유물을 먼저 해제해 주세요.`, [{ text: '확인' }]); return; }
    cloudSoon(); writeSave(); render(); renderStore(true); renderGear(true);
  }

  function askBuyGear(i) {
    const o = G.shopStock(state)[i];
    if (!o || o.sold) return;
    const it = o.item, R = G.RARITIES[it.r];
    openModal('구매할까요?',
      `<div class="got" style="--rc:${R.color}">${gearArt(it)}<div><b>[${R.name}] ${G.itemName(it)}</b><small>${G.GEAR[it.slot].kinds[it.kind].label} +${fmtVal(it.val)}% · Lv.${it.ilvl}</small></div></div>` +
      `<div class="relic__opts" style="--rc:${R.color};align-items:center"><b>${spText(it)}</b></div>` +
      `<div style="margin-top:12px">${GEM} 크리스탈 <b>${o.price}개</b> 사용</div><div style="margin-top:2px"><small>구매 후 남는 크리스탈 ${state.crystals - o.price}개</small></div>`,
      [{ text: '취소' }, { text: '구매하기', cls: 'btn--gold', onClick: () => {
        const res = G.buyShopItem(state, i);
        if (!res.ok) { openModal('살 수 없어요', reasonText[res.reason] || (res.reason === 'sold' ? '이미 판매된 장비예요' : '다시 시도해 주세요'), [{ text: '확인' }]); renderStore(true); return; }
        addLog(`${G.itemName(res.item)} 구매!`, 'is-gold', G.GEAR[res.item.slot].icon);
        if (res.action === 'bag') gearNew.add(res.item.id);
        cloudSoon(); writeSave(); render(); renderStore(true); renderGear(true);
        const r2 = G.RARITIES[res.item.r];
        openModal('구매 완료', `<div class="got" style="--rc:${r2.color}">${gearArt(res.item)}<div><b>[${r2.name}] ${G.itemName(res.item)}</b><small>${G.GEAR[res.item.slot].kinds[res.item.kind].label} +${fmtVal(res.item.val)}%</small></div></div>` +
          `<div class="relic__opts" style="--rc:${r2.color};align-items:center"><b>${spText(res.item)}</b></div>` +
          `<div style="margin-top:8px;color:var(--green);font-weight:800">${res.action === 'equipped' ? '바로 장착했어요' : '가방에 넣었어요. 장비 탭에서 껴 보세요'}</div>`, [{ text: '확인', cls: 'btn--gold' }]);
      } }]);
  }
  $('gshopReroll').addEventListener('click', () => {
    const left = Store.GEAR_SHOP.rerollMax - state.shop.reroll;
    openModal('진열을 새로 바꿀까요?', `${GEM} 크리스탈 <b>${Store.GEAR_SHOP.rerollCost}개</b>를 내고 진열을 새 물건으로 바꿔요.<br><small>이번 갱신 시간에 ${left}번 더 할 수 있어요. 산 물건은 그대로 내 것이에요.</small>`,
      [{ text: '취소' }, { text: '새로고침', cls: 'btn--gold', onClick: () => {
        const r = G.rerollShop(state);
        if (!r.ok) { openModal('할 수 없어요', r.reason === 'max' ? '이번 갱신 시간에는 더 새로고침할 수 없어요' : '크리스탈이 부족해요', [{ text: '확인' }]); return; }
        cloudSoon(); writeSave(); render(); renderStore(true);
      } }]);
  });

  // 구매 결과 창: 받은 장비를 보여 준다
  function showBought(res) {
    const p = res.product;
    let body = `<div style="font-weight:900;font-size:16px;margin-bottom:8px">${p.name}</div>`;
    if (res.pityHit) body += `<div class="pity__hit">신화 보장 발동!</div>`;
    if (res.items && res.items.length) {
      body += res.items.map((it) => `<div class="got" style="--rc:${G.RARITIES[it.r].color}">${gearArt(it)}<div><b>[${G.RARITIES[it.r].name}] ${G.itemName(it)}</b><small>${KIND_SHORT[it.kind]} +${fmtVal(it.val)}% · Lv.${it.ilvl}</small></div></div>`).join('');
      body += '<small>가방에서 확인하고, 더 좋으면 자동으로 장착됐어요.</small>';
    } else if (res.picked) {
      const rp = res.picked, on = state.relicEq.includes(rp.id);
      body = `<div style="font-weight:900;font-size:16px;margin-bottom:8px">${rp.name}</div>` +
        `<div class="relic__opts" style="--rc:${rp.color};align-items:center">${rp.opts.map((o) => `<b>${o.text}</b>`).join('')}</div>` +
        `<div style="margin-top:8px;color:var(--green);font-weight:800">${on ? '바로 장착했어요' : '유물 칸이 가득 차 있어요. 상점 탭에서 바꿔 낄 수 있어요'}</div>`;
    } else if (p.opts) {
      const on = state.relicEq.includes(p.id);
      body += `<div class="relic__opts" style="--rc:${p.color};align-items:center">${p.opts.map((o) => `<b>${o.text}</b>`).join('')}</div><div style="margin-top:8px;color:var(--green);font-weight:800">${on ? '바로 장착했어요' : '유물 칸이 가득 차 있어요. 상점 탭에서 바꿔 낄 수 있어요'}</div>`;
    } else body += `<div style="color:var(--green);font-weight:800">${p.desc}</div>`;
    openModal('구매 완료', body, [{ text: '확인', cls: 'btn--gold' }]);
  }
  function askBuyProduct(id) {
    const all = [...Store.BOXES, ...Store.SLOT_DRAWS, Store.RELIC_DRAW, ...Store.UTILITIES, Store.STARTER, ...Store.RELICS];
    const p = all.find((x) => x.id === id);
    if (!p) return;
    const odds = p.odds ? `<div class="prod__odds" style="justify-content:center;margin-top:6px">${oddsHtml(p.odds)}</div>` : p.opts ? `<div class="relic__opts" style="--rc:${p.color};align-items:center;margin-top:6px">${p.opts.map((o) => `<b>${o.text}</b>`).join('')}</div>` : '';
    openModal('구매할까요?',
      `<div style="font-weight:900;font-size:16px">${p.name}</div><div style="margin-top:4px;color:var(--muted)">${p.desc || ''}</div>${odds}` +
      `<div style="margin-top:12px">${GEM} 크리스탈 <b>${p.price}개</b> 사용</div><div style="margin-top:2px"><small>구매 후 남는 크리스탈 ${state.crystals - p.price}개</small></div>`,
      [{ text: '취소' }, { text: '구매하기', cls: 'btn--gold', onClick: () => {
        const res = G.buyProduct(state, id);
        if (!res.ok) { openModal('살 수 없어요', reasonText[res.reason] || '다시 시도해 주세요', [{ text: '확인' }]); return; }
        addLog(`${p.name} 구매!`, 'is-gold', 'gem');
        cloudSoon(); writeSave(); render(); renderStore(true);
        renderGear(true); potionKey = '';
        showBought(res);
      } }]);
  }
  document.querySelector('.tab[data-tab="store"]').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-buy]');
    if (b && !b.disabled) askBuyProduct(b.dataset.buy);
    const rb = e.target.closest('button[data-relic]');
    if (rb) toggleRelic(rb.dataset.relic);
    const gb = e.target.closest('button[data-gbuy]');
    if (gb && !gb.disabled) askBuyGear(Number(gb.dataset.gbuy));
    if (e.target.closest('button[data-ad]') && !e.target.closest('button[data-ad]').disabled) watchAd();
  });

  // ---- 충전 (시연 결제) ----
  function confirmDemo(pack) {
    return new Promise((resolve) => {
      let done = false;
      const end = (v) => { if (!done) { done = true; resolve(v); } };
      openModal('결제 확인 (시연)',
        `<div class="demoban">시연용 결제예요. <b>실제 돈은 청구되지 않아요.</b> 카드 정보도 입력하지 않아요.</div>` +
        `<div style="font-weight:900;font-size:16px">${GEM} 크리스탈 ${pack.crystals}개</div>` +
        (pack.bonus ? `<div style="color:var(--green);font-weight:800">보너스 ${pack.bonus}개 포함</div>` : '') +
        `<div style="margin-top:8px">표시 가격 <b>${won(pack.price)}</b> <small>(청구되지 않음)</small></div>`,
        [{ text: '취소', onClick: () => end(false) }, { text: '시연 결제하기', cls: 'btn--gold', onClick: () => end(true) }]);
    });
  }
  async function startCharge(id) {
    const pack = Store.CRYSTAL_PACKS.find((x) => x.id === id);
    if (!pack) return;
    const r = await paymentsMod.checkout(pack);
    if (r.status === 'paid') {
      const c = G.creditCrystals(state, pack.crystals, r.orderId);
      if (c.ok) {
        addLog(`크리스탈 ${pack.crystals}개 충전 (시연)`, 'is-gold', 'gem');
        cloudSoon(); writeSave(); render(); renderStore(true);
        floatText(`+${pack.crystals} 크리스탈`, 'float--big', 'center');
      }
    } else if (r.status === 'unavailable') openModal('충전할 수 없어요', esc(r.reason || ''), [{ text: '확인' }]);
  }
  $('chargeBtn').addEventListener('click', () => {
    if (!paymentsMod.available) return;
    openModal('크리스탈 충전',
      (paymentsMod.isDemo ? '<div class="demoban">시연 모드: 누르면 결제 확인 창이 나오지만 <b>실제 돈은 청구되지 않아요.</b></div>' : '') +
      Store.CRYSTAL_PACKS.map((p) => `<button class="pack" type="button" data-pack="${p.id}">${GEM}<span class="pack__main"><b>${p.crystals}</b><small>${p.bonus ? `보너스 ${p.bonus}개 포함` : '기본'}</small></span><span class="pack__price">${won(p.price)}</span></button>`).join(''),
      [{ text: '닫기' }]);
  });
  $('modalBody').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-pack]');
    if (!b) return;
    const id = b.dataset.pack;
    closeModal();
    startCharge(id);
  });

  // ---- 광고 (시연 화면) ----
  function showDemoAd() {
    return new Promise((resolve) => {
      const ov = $('adOverlay'), count = $('adCount'), claim = $('adClaim'), cancel = $('adCancel');
      let left = Store.AD_SECONDS, done = false;
      const finish = (v) => { if (done) return; done = true; clearInterval(t); ov.hidden = true; claim.onclick = cancel.onclick = null; resolve(v); };
      count.textContent = left; claim.disabled = true; ov.hidden = false;
      const t = setInterval(() => { left--; count.textContent = Math.max(0, left); if (left <= 0) { clearInterval(t); claim.disabled = false; } }, 1000);
      claim.onclick = () => { if (!claim.disabled) finish(true); };
      cancel.onclick = () => finish(false);
    });
  }
  let adBusy = false;
  async function watchAd() {
    if (adBusy || G.adStatus(state, today()).left <= 0) return;
    adBusy = true;
    try {
      await fetchServerTime();   // 광고를 보여 주기 전에 서버 시각으로 오늘 횟수를 다시 확인한다
      if (G.adStatus(state, today()).left <= 0) { renderStore(true); return; }
      const r = await adsMod.showRewarded();
      if (r.status === 'completed') {
        const res = G.claimAd(state, today());   // 서버 시각 기준으로 센다
        if (res.ok) {
          addLog(`광고 보상! 크리스탈 +${res.crystals}, ${res.potion.name}`, 'is-gold', 'gem');
          floatText(`+${res.crystals} 크리스탈`, 'float--big', 'center');
          openModal('광고 보상', `<div style="font-size:15px;font-weight:900">${GEM} 크리스탈 +${res.crystals}</div><div class="got" style="--rc:${res.potion.color};margin-top:8px">${A.icon(POTION_ICON[res.potion.id] || 'heart')}<div><b>${res.potion.name}</b><small>${res.potion.desc} · ${clockText(res.potion.dur)}</small></div></div>`, [{ text: '확인', cls: 'btn--gold' }]);
          cloudSoon(); writeSave(); render(); renderStore(true);
        }
      } else if (r.status === 'unavailable') openModal('광고를 볼 수 없어요', esc(r.reason || ''), [{ text: '확인' }]);
    } finally { adBusy = false; }
  }

  // ---- 던전 (일일·주간·월간) ----
  // 예상 파동 문구: 지금 그대로 / 미니게임을 잘하면 몇 파동까지 가는지
  function dungeonForecastHtml(info) {
    if (info.forecast >= info.waves) return `<span class="dfc dfc--ok">${A.icon('check')}지금 전투력으로 완주 가능</span>`;
    if (info.forecastMax >= info.waves) return `<span class="dfc dfc--mid">미니게임을 잘하면 완주 가능 (지금은 ${info.forecast}/${info.waves})</span>`;
    return `<span class="dfc dfc--hard">예상 ${info.forecast}/${info.waves} · 미니게임 만점이면 ${info.forecastMax}/${info.waves}</span>`;
  }
  let dungeonKey = '';
  function renderDungeon(force) {
    const s = state;
    G.dungeonSync(s, today());
    const left = G.periodSecsLeft(serverNow());
    const infos = {};
    for (const p of G.DUNGEON_PERIODS) infos[p] = G.dungeonInfo(s, p);
    const key = G.DUNGEON_PERIODS.map((p) => { const d = s.dungeons[p], i = infos[p]; return `${d.key}:${d.used}:${d.bestWaves}:${d.bonusClaimed ? 1 : 0}:${i.forecast}:${i.forecastMax}`; }).join('|') + '#' + G.DUNGEON_PERIODS.map((p) => (left[p] === null ? 'x' : Math.floor(left[p] / 60))).join(',');
    const tw = G.towerInfo(s, today());
    const fullKey = key + '#t' + [tw.best, tw.forecast, tw.dailyReady ? 1 : 0].join(':');
    if (!force && fullKey === dungeonKey) return;
    dungeonKey = fullKey;
    renderTower(tw);
    $('dungeonList').innerHTML = G.DUNGEON_PERIODS.map((p) => {
      const info = infos[p], secLeft = left[p];
      const dots = Array.from({ length: info.waves }, (_, i) => `<i class="dwave ${i < info.bestWaves ? 'is-on' : ''}"></i>`).join('');
      const clearNote = info.bonusClaimed ? `<span class="dclear">${A.icon('chest')}완주 보상 받음</span>` : '';
      const label = info.left <= 0 ? '오늘 끝' : info.canSweep ? '도전·소탕' : '도전';
      const btn = `<button class="btn ${info.left > 0 ? 'btn--gold' : 'btn--gray'} prod__btn" type="button" data-dchallenge="${p}" ${info.left > 0 ? '' : 'disabled'}><span>${label}</span><small>${A.icon('ticket')}${info.left}/${info.attempts}</small></button>`;
      return `<div class="card prod dungeon"><div class="prod__tile prod__tile--boss" style="--tone:#7a4aff99">${A.bossArt(G.BOSS_ART[info.boss])}</div>` +
        `<div><div class="prod__name">${info.name} <span class="prod__chip">${info.boss}</span></div>` +
        `<div class="prod__desc">파동 ${info.waves > 1 ? `${info.bestWaves}/${info.waves} 최고 기록` : (info.cleared ? '처치' : '미처치')} ${clearNote}</div>` +
        `<div class="dwaves">${dots}</div>` +
        `<div class="prod__desc">${dungeonForecastHtml(info)}</div>` +
        `<div class="prod__desc">초기화까지 ${secLeft === null ? '서버 시각을 확인하지 못했어요' : clockText(secLeft)}</div></div>${btn}</div>`;
    }).join('');
  }
  // ---- 무한의 탑 ----
  function renderTower(tw) {
    const T = G.TOWER;
    const nextItem = Math.ceil(tw.next / T.itemEvery) * T.itemEvery, nextToken = Math.ceil(tw.next / T.tokenEvery) * T.tokenEvery;
    const status = tw.top ? `<span class="dfc dfc--ok">꼭대기에 올랐어요!</span>`
      : tw.forecast > 0 ? `<span class="dfc dfc--ok">${A.icon('check')}지금 ${tw.forecast}층${tw.forecast >= T.maxClimb ? ' 이상' : ''} 오를 수 있어요</span>`
      : `<span class="dfc dfc--hard">${tw.next}층 ${tw.nextBoss}: 체력 ${G.fmt(tw.nextHp)} · 내 예산 ${G.fmt(tw.budget)}</span>`;
    const climbBtn = `<button class="btn ${tw.forecast > 0 ? 'btn--gold' : 'btn--gray'} prod__btn" type="button" data-tclimb ${tw.top ? 'disabled' : ''}><span>오르기</span><small>${tw.forecast > 0 ? `+${tw.forecast}층` : '막힘'}</small></button>`;
    const daily = tw.best > 0 ? `<button class="btn ${tw.dailyReady ? 'btn--gold' : 'btn--gray'} tower__daily" type="button" data-tdaily ${tw.dailyReady ? '' : 'disabled'}>${GEM}${tw.dailyReady ? `오늘의 탑 보상 ${tw.daily}` : '오늘 보상 받음'}</button>` : '';
    $('towerCard').innerHTML = `<div class="card prod dungeon tower"><div class="prod__tile prod__tile--boss" style="--tone:#2a7aff99">${A.bossArt(G.BOSS_ART[tw.nextBoss])}</div>` +
      `<div><div class="prod__name">무한의 탑 <span class="prod__chip">최고 ${tw.best}층</span></div>` +
      `<div class="prod__desc">횟수 제한 없이, 전투력만큼 한 번에 최대 ${T.maxClimb}층씩 올라가요. 새 층마다 ${GEM}, ${T.itemEvery}층마다 장비, ${T.tokenEvery}층마다 ${A.icon('crown')}증표.</div>` +
      `<div class="prod__desc">${status}</div>` +
      `<div class="prod__desc">다음 장비 ${nextItem}층 · 다음 증표 ${nextToken}층</div>${daily}</div>${climbBtn}</div>`;
  }
  function doTowerClimb() {
    const info = G.towerInfo(state, today());
    const r = G.climbTower(state);
    if (!r.ok) {
      if (r.reason === 'bag') openModal('가방 자리가 모자라요', `보상 장비를 받으려면 가방에 <b>${r.need}칸</b>이 비어 있어야 해요.<br><small>장비 탭에서 안 쓰는 장비를 팔아 주세요.</small>`, [{ text: '닫기' }, { text: '장비 탭으로', cls: 'btn--gold', onClick: () => goTab('gear') }]);
      return;
    }
    for (const it of r.drops) gearNew.add(it.id);
    if (r.climbed > 0) addLog(`무한의 탑: ${r.from + 1}~${r.to}층 돌파!`, 'is-gold', 'gate');
    cloudSoon(); writeSave(); render(); renderDungeon(true); renderGear(true);
    const fights = r.fights.map((f) => ({ name: `${f.floor}층 · ${f.boss}`, wave: f.floor, art: A.bossArt(G.BOSS_ART[f.boss]), hp: f.hp, dealt: f.dealt, killed: f.killed,
      drop: f.drop ? { color: G.RARITIES[f.drop.r].color, label: `[${G.RARITIES[f.drop.r].name}] ${G.itemName(f.drop)}` } : null }));
    $('mgTitle').textContent = '무한의 탑';
    $('mgModal').hidden = false;
    Mini.fight($('mgStage'), fights, r.budget, { label: '층', freshBudget: true, calm: calm(), fmt: G.fmt }, () => {
      $('mgModal').hidden = true;
      const body = r.climbed > 0
        ? `<b>${r.from + 1}층 → ${r.to}층</b> 돌파!<div class="dres__partial">${GEM} +${r.crystals}${r.tokens ? ` · ${A.icon('crown')}증표 +${r.tokens}` : ''}</div>${r.drops.map(itemLine).join('')}` +
          (r.more ? '<div class="dres__head">아직 더 오를 수 있어요. 한 번 더 눌러 보세요!</div>' : '')
        : `${info.next}층 ${info.nextBoss}를 넘지 못했어요.<br><small>체력 ${G.fmt(info.nextHp)} · 내 예산 ${G.fmt(info.budget)} — 더 강해져서 다시 와요. 져도 잃는 건 없어요.</small>`;
      openModal(r.climbed > 0 ? '무한의 탑 돌파' : '무한의 탑', body, [{ text: '확인', cls: 'btn--gold' }]);
    });
  }
  function doTowerDaily() {
    const r = G.claimTowerDaily(state, today());
    if (!r.ok) return;
    addLog(`무한의 탑 오늘의 보상: 크리스탈 +${r.crystals}`, 'is-gold', 'gem');
    cloudSoon(); writeSave(); render(); renderDungeon(true); renderStore(true);
    floatText(`+${r.crystals}`, 'float--gold', 'center');
  }
  const itemLine = (it) => { const R = G.RARITIES[it.r]; return `<div class="got" style="--rc:${R.color}">${gearArt(it)}<div><b>[${R.name}] ${G.itemName(it)}</b><small>${G.GEAR[it.slot].kinds[it.kind].label} +${fmtVal(it.val)}%</small></div></div>`; };
  function showDungeonResult(info, r) {
    const waveLines = r.drops.map(itemLine).join('');
    const partial = r.partialGold > 0 ? `<div class="dres__partial">${A.icon('coin')} 깎아 둔 만큼 위로 골드 +${G.fmt(r.partialGold)}</div>` : '';
    const bonus = r.bonus ? `<div style="margin:10px 0 6px;font-weight:900;color:var(--gold)">${A.icon('chest')} 완주 보상! ${GEM}${r.bonus.crystals}${r.bonus.tokens ? ` · ${A.icon('crown')}증표 +${r.bonus.tokens}` : ''}</div>${itemLine(r.bonus.item)}` : '';
    const head = `<div class="dres__head">${r.sweep ? '소탕' : '미니게임'} 보너스 +${Math.round(r.mgBonus * 100)}%</div>`;
    const body = head + ((waveLines + bonus) || '<div>보스를 물리치지 못했어요. 더 강해져서 다시 도전해 보세요.</div>') + partial;
    openModal(r.fullClear ? `${info.name} 완주!` : `${info.name} · 파동 ${r.wavesCleared}/${r.waves}`, body, [{ text: '확인', cls: 'btn--gold' }]);
  }
  const DUNGEON_MINIGAME_NAME = { daily: '두더지 잡기', weekly: '타이밍 게이지', monthly: '패턴 회피·반격' };
  // 도전 결과를 먼저 확정·저장하고(중간에 앱을 꺼도 보상은 남는다), 보스 체력이 깎이는 전투 연출을 보여 준 뒤 결과 창을 띄운다.
  function resolveDungeonChallenge(period, info, mgBonus, sweep) {
    const r = G.challengeDungeon(state, period, mgBonus, sweep);
    if (!r.ok) { $('mgModal').hidden = true; openModal('도전할 수 없어요', r.reason === 'limit' ? '오늘 도전 횟수를 다 썼어요' : r.reason === 'nosweep' ? '먼저 한 번 완주해야 소탕할 수 있어요' : r.reason === 'bag' ? `가방에 자리가 ${r.need}칸 필요해요. 장비를 팔거나 가방을 넓혀 주세요` : '다시 시도해 주세요', [{ text: '확인' }]); return; }
    for (const it of r.drops) gearNew.add(it.id);
    if (r.bonus) gearNew.add(r.bonus.item.id);
    addLog(`${info.name}${r.sweep ? ' 소탕' : ''}: 파동 ${r.wavesCleared}/${r.waves}${r.fullClear ? ' 완주!' : ''}`, r.fullClear ? 'is-gold' : '', 'gate');
    cloudSoon(); writeSave(); render(); renderDungeon(true); renderGear(true);
    const fights = r.fights.map((f, i) => {
      const it = f.killed ? r.drops[i] : null;
      return { name: f.boss, art: A.bossArt(G.BOSS_ART[f.boss]), hp: f.hp, dealt: f.dealt, killed: f.killed,
               drop: it ? { color: G.RARITIES[it.r].color, label: `[${G.RARITIES[it.r].name}] ${G.itemName(it)}` } : null };
    });
    $('mgTitle').textContent = `${info.name} 전투`;
    $('mgModal').hidden = false;
    Mini.fight($('mgStage'), fights, r.budget, { waves: r.waves, calm: calm(), fmt: G.fmt }, () => {
      $('mgModal').hidden = true;
      showDungeonResult(info, r);
    });
  }
  function playDungeonMinigame(period, info) {
    $('mgTitle').textContent = DUNGEON_MINIGAME_NAME[period] || info.name;
    $('mgModal').hidden = false;
    Mini.play(period, $('mgStage'), (bonus) => resolveDungeonChallenge(period, info, bonus, false));
  }
  function doDungeonChallenge(period) {
    const info = G.dungeonInfo(state, period);
    if (!info || info.left <= 0) return;
    const need = G.dungeonBagNeed(state, period), free = G.bagLimit(state) - state.bag.length;
    if (free < need) {   // 미니게임을 다 하고 나서 거절당하지 않게 먼저 알려 준다
      openModal('가방 자리가 모자라요', `보상 장비를 받으려면 가방에 <b>${need}칸</b>이 비어 있어야 해요 (지금 ${Math.max(0, free)}칸).<br><small>장비 탭에서 안 쓰는 장비를 팔아 주세요.</small>`,
        [{ text: '닫기' }, { text: '장비 탭으로', cls: 'btn--gold', onClick: () => goTab('gear') }]);
      return;
    }
    // 파동별 보스와 체력, 내 피해 예산이 어디까지 닿는지 한눈에 (누적 체력 기준)
    let acc = 0;
    const rows = info.waveBosses.map((name, i) => {
      acc += info.bossHp[i];
      const st = info.budget >= acc ? 'ok' : info.budgetMax >= acc ? 'mid' : 'hard';
      const mark = st === 'ok' ? A.icon('check') : st === 'mid' ? '<em>미니게임</em>' : '<em>무리</em>';
      return `<div class="dwrow dwrow--${st}"><span class="dwrow__art">${A.bossArt(G.BOSS_ART[name])}</span><span class="dwrow__name">${i + 1}. ${name}</span><span class="dwrow__hp">${G.fmt(info.bossHp[i])}</span><span class="dwrow__mark">${mark}</span></div>`;
    }).join('');
    const sweepNote = info.canSweep ? `<br><small>소탕: 미니게임 없이 이번 ${period === 'daily' ? '날' : period === 'weekly' ? '주' : '달'} 최고 보너스(+${Math.round(info.bestBonus * 100)}%)로 바로 도전해요.</small>` : '';
    const buttons = [{ text: '취소' }];
    if (info.canSweep) buttons.push({ text: '소탕', onClick: () => resolveDungeonChallenge(period, info, 0, true) });
    buttons.push({ text: '도전!', cls: 'btn--gold', onClick: () => playDungeonMinigame(period, info) });
    openModal(`${info.name} 도전`,
      `<div class="dungeon__bossart">${A.bossArt(G.BOSS_ART[info.boss])}</div>` +
      `<b>${info.boss}</b>${info.waves > 1 ? ` 외 파동 ${info.waves}마리` : ''}에게 도전해요.` +
      `<div class="dwlist">${rows}</div>` +
      `<div class="dwbudget">내 피해 예산 <b>${G.fmt(info.budget)}</b> → 미니게임 만점 시 <b>${G.fmt(info.budgetMax)}</b> (+${Math.round(info.mgCap * 100)}%)</div>` +
      `<small>미니게임(${DUNGEON_MINIGAME_NAME[period]})으로 피해 예산을 늘릴 수 있어요. 남은 도전 ${info.left}/${info.attempts}번.</small>${sweepNote}`,
      buttons);
  }
  document.querySelector('.tab[data-tab="dungeon"]').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-dchallenge]');
    if (b && !b.disabled) doDungeonChallenge(b.dataset.dchallenge);
    if (e.target.closest('button[data-tclimb]:not([disabled])')) doTowerClimb();
    if (e.target.closest('button[data-tdaily]:not([disabled])')) doTowerDaily();
  });

  // ---- 공격 (화면 누르기) ----
  function attack(px, py) {
    const r = G.clickAttack(state);
    if (r.dmg > 0) {
      floatText(G.fmt(r.dmg), 'float--tap', 'enemy');
      const contact = classAttack(true);
      impactFx(true, contact);
      if (px !== undefined) {   // 누른 자리에 동그란 파문
        const ring = addFx('fx-tap', px, py);
        playFx(ring, [{ transform: 'scale(0.3)', opacity: 0.9 }, { transform: 'scale(1.7)', opacity: 0 }], { duration: 380, easing: 'ease-out' });
      }
    }
    handleEvents(r.events);
    render();
  }
  $('scene').addEventListener('pointerdown', (e) => {
    if (e.target.closest('.gearbtn, .skillbar')) return;   // 설정 버튼·스킬 바는 공격이 아니다
    e.preventDefault();
    const box = sceneEl.getBoundingClientRect();
    attack(e.clientX - box.left, e.clientY - box.top);
  });
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !e.repeat && $('modal').hidden && e.target === document.body) {
      e.preventDefault();
      attack();
    }
  });

  // ---- 환생 / 처음부터 ----
  $('prestigeBtn').addEventListener('click', () => {
    const info = G.prestigeInfo(state), gain = info.gain;
    if (gain <= 0) return;
    const fullGain = Math.max(1, Math.floor(info.base * (1 + G.relicV(state, 'token'))));
    const early = info.timeF < 1 ? `<div class="demoban" style="margin-top:8px">이번 판을 아직 ${Math.floor(state.runT / 60)}분밖에 키우지 않았어요. ${Math.ceil(info.secsLeft / 60)}분 더 키우면 증표 <b>${fullGain}개</b>를 받아요.</div>` : '';
    openModal('환생할까요?',
      `${A.icon('crown')}왕의 증표 <b>${gain}개</b>를 얻고<br>골드·레벨·강화·스테이지·직업이 처음으로 돌아가요.<br><small>직업 도감은 그대로 남아요.</small>${early}`,
      [
        { text: '취소' },
        { text: '환생하기', cls: 'btn--gold', onClick: () => {
          G.prestige(state);
          logs.length = 0;
          handleEvents(G.checkAchievements(state));
          lastLook = '';
          addLog(`환생했다! 왕의 증표 +${gain} (총 ${state.tokens}개)`, 'is-gold', 'crown');
          cloudSoon();
          writeSave();
          render();
          goTab('class');
        } },
      ]);
  });

  $('resetBtn').addEventListener('click', () => {
    openModal('처음부터 다시 시작할까요?', `모든 진행 상황이 지워져요.${cloud.state().user ? '<br><b>로그인 중이라 클라우드 저장도 새로 시작돼요.</b>' : ''}<br><small>되돌릴 수 없어요.</small>`, [
      { text: '취소' },
      { text: '지우고 시작', cls: 'btn--blue', onClick: () => {
        clearSave();
        state = G.createState(Date.now());
        logs.length = 0;
        lastLook = '';
        lastMonster = '';
        addLog('새로운 고블린이 태어났다!', 'is-good', 'sword');
        writeSave();
        cloudSoon();
        render();
        goTab('upgrade');
      } },
    ]);
  });

  function showOffline(r) {
    const stage = r.stageTo === r.stageFrom ? `스테이지 ${r.stageTo}에서 계속 싸웠어요` : `스테이지 ${r.stageFrom} → ${r.stageTo}`;
    const cap = G.offlineCap(state);
    const notes = [];
    if (r.capped || r.seconds >= cap) notes.push(`실제로는 ${G.fmtTime(r.raw || r.seconds)} 비웠지만, 보상은 최대 ${Math.round(cap / 3600)}시간까지예요.`);
    if (r.jumped) notes.push('기기 시계가 서버 시각과 크게 달라서 <b>서버 시각</b> 기준으로 계산했어요.');
    else if (r.source) notes.push(`시간은 ${r.source === 'server' ? '서버 시각' : '기기 시계'} 기준이에요.`);
    openModal('자리를 비운 사이에...',
      `${G.fmtTime(r.seconds)} 동안 고블린이 열심히 싸웠어요.<br>` +
      `${COIN} 골드 +${G.fmt(r.gold)}<br>` +
      `${A.icon('sword')} 몬스터 ${G.fmt(r.kills)}마리 처치<br>` +
      `${A.icon('arrowup')} 레벨 ${r.levelFrom} → ${r.levelTo}<br>` +
      `${A.icon('star')} ${stage}` +
      (r.drops > 0 ? `<br>${A.icon('gem')} 장비 ${r.drops}개 발견 (${r.dropsSold}개 자동 판매)` + (r.dropBest >= 2 ? ` · 최고 <b style="color:${G.RARITIES[r.dropBest].color}">${G.RARITIES[r.dropBest].name}</b>` : '') : '') +
      (notes.length ? `<br><small>${notes.join('<br>')}</small>` : ''),
      [{ text: '받기', cls: '' }]);
    addLog(`${G.fmtTime(r.seconds)} 동안 자리를 비웠어요`, 'is-gold', 'coin');
  }


  // ---- 계정 · 클라우드 저장 ----
  // 로그인하면 진행 상황을 클라우드(Firebase)에 저장해서 기기를 바꿔도 이어서 할 수 있다. 설정이 없으면 이 기능은 꺼지고 게임은 그대로 동작한다.
  const cloudStorage = {
    get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* 무시 */ } },
    remove: (k) => { try { localStorage.removeItem(k); } catch (e) { /* 무시 */ } },
  };
  // window.CLOUD_ADAPTER가 미리 정해져 있으면(테스트용 가짜 서버, 또는 null로 기능 끄기) 그것을 쓰고, 아니면 Firebase 설정으로 만든다
  const cloudAdapter = 'CLOUD_ADAPTER' in window ? window.CLOUD_ADAPTER :
    (window.FIREBASE_CONFIG && window.CloudFirebase ? window.CloudFirebase.createFirebaseAdapter(window.FIREBASE_CONFIG) : null);

  const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const agoText = (ms) => {
    const sec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
    return sec < 10 ? '방금' : sec < 60 ? `${sec}초 전` : sec < 3600 ? `${Math.floor(sec / 60)}분 전` : `${Math.floor(sec / 3600)}시간 전`;
  };
  const sumRows = (sm) =>
    `스테이지 <b>${sm.bestStage}</b><br>레벨 <b>${sm.level}</b><br>환생 <b>${sm.prestiges}</b>회<br>증표 <b>${sm.tokens}</b>개<br>처치 <b>${G.fmt(sm.kills)}</b>` +
    (G.NODES[sm.look] ? `<br>직업 <b>${G.NODES[sm.look].name}</b>` : '');

  // 클라우드 저장을 게임에 적용한다 (다른 기기의 진행을 이어받을 때)
  function applyCloudSave(text) {
    const next = G.deserialize(text);
    if (!next) return false;
    state = next;   // 그 저장이 마지막으로 저장된 뒤 지금까지 비운 시간도 보상으로 인정한다 (다른 기기에서 이미 받았다면 그 기기가 저장 시각을 옮겨 두었으므로 두 번 받지 않는다)
    logs.length = 0;
    lastLook = ''; lastMonster = '';
    gearKey = ''; shopKey = ''; storeKey = ''; potionKey = ''; classKey = ''; achieveKey = ''; questKey = '';
    gearNew.clear();
    const away = G.applyOffline(state, Date.now(), serverNow());
    if (away) showOffline(away);
    lastHits = state.hits;
    addLog('클라우드 저장을 불러왔다', 'is-good', 'crown');
    writeSave();
    render();
    return true;
  }

  // 이 기기와 클라우드의 저장이 다를 때 어느 쪽으로 계속할지 고르게 한다
  function askConflict(info) {
    return new Promise((resolve) => {
      const rec = info.recommend;
      const box = (title, sm, isRec) => `<div class="${isRec ? 'is-rec' : ''}"><h4>${title}${isRec ? '<span class="rec">진행이 더 앞서요</span>' : ''}</h4>${sumRows(sm)}</div>`;
      openModal('어느 저장으로 계속할까요?',
        '<div style="font-size:12px">이 기기와 클라우드에 서로 다른 저장이 있어요.</div>' +
        `<div class="cmp">${box('이 기기', info.local, rec === 'local')}${box('클라우드', info.remote, rec === 'cloud')}</div>` +
        `<small>${info.remoteUpdatedAt ? `클라우드 저장: ${agoText(info.remoteUpdatedAt)}<br>` : ''}선택하지 않은 쪽 저장은 사라져요.</small>`,
        [
          { text: '이 기기', onClick: () => resolve('local') },
          { text: '클라우드', cls: 'btn--gold', onClick: () => resolve('cloud') },
          { text: '나중에', onClick: () => resolve(null) },
        ]);
    });
  }

  const cloud = window.CloudClient.createCloud(cloudAdapter, {
    getLocal: () => ({ text: G.serialize(state, Date.now(), serverNow()), summary: window.Sync.summaryOf(state, G.lookId(state)) }),
    applySave: applyCloudSave,
    askConflict,
    storage: cloudStorage,
    onChange: (st) => {
      renderAccount(st);
      const uid = st.user ? st.user.uid : '';
      if (uid !== socialUid) {   // 로그인하거나 계정이 바뀌면 출석·랭킹 기록을 다시 확인한다
        socialUid = uid; attendRec = undefined; attendLoaded = false; attendKey = ''; rankKey = ''; lastRankSent = null; lastRankAt = 0; rankBlockedUntil = 0; attendMsg = ''; rankMsg = '';
        for (const k of Object.keys(rankCache)) delete rankCache[k];
        if (uid) { loadAttend(); submitRank(true); }
        if (currentTab === 'log') renderLog(true);
      }
    },
  });

  window.GoblinCloud = cloud;   // 점검 도구와 개발자 콘솔에서 동기화를 직접 불러 볼 수 있게 한다 (화면에는 저장 버튼이 없다)

  function renderAccount(st) {
    st = st || cloud.state();
    $('gmSection').hidden = !G.isGM(st.user && st.user.email);
    const box = $('acct');
    if (!st.configured) {
      // 서버(Firebase)가 아직 연결되지 않았어도 버튼은 보여 주고, 누르면 준비 중이라고 알려 준다
      box.innerHTML = '<div class="acct__title">☁ 계정 연동 <span class="acct__soon">준비 중</span></div>' +
        '<div class="acct__desc">Google 계정을 연동하면 진행 상황이 클라우드에 저장돼서, 다른 기기에서도 이어서 할 수 있어요. 지금은 이 기기(브라우저)에만 자동 저장돼요.</div>' +
        '<div class="acct__btns acct__btns--one"><button class="btn btn--google is-soon" type="button" data-login="google">Google 계정 연동하기</button></div>' +
        '<div class="acct__desc" style="margin:8px 0 0"><small>개발자: docs/FIREBASE-SETUP.md</small></div>';
      return;
    }
    const err = st.error ? `<div class="acct__err">${esc(st.error)}</div>` : '';
    if (!st.user) {
      box.innerHTML = '<div class="acct__title">☁ 계정 연동</div>' +
        '<div class="acct__desc">Google 계정을 연동하면 진행 상황이 클라우드에 저장돼서, 다른 기기에서도 이어서 할 수 있어요.</div>' +
        '<div class="acct__btns acct__btns--one"><button class="btn btn--google" type="button" data-login="google">Google 계정 연동하기</button></div>' +
        '<div class="acct__lock">※ 한 번 연동하면 <b>해제할 수 없어요.</b> 계정 선택 화면에서 쓰실 계정을 신중하게 골라 주세요.</div>' + err;
      return;
    }
    const u = st.user;
    // 저장은 전부 자동이다: 진행이 바뀌면 알아서 올리고, 실패하면 다시 시도한다. 그래서 '저장' 버튼은 없고 상태만 보여 준다.
    const statusText = st.status === 'syncing' ? '저장하는 중…' : st.status === 'error' ? '저장하지 못했어요 · 자동으로 다시 시도해요' : st.lastSyncedAt ? `자동 저장됨 · 마지막 ${agoText(st.lastSyncedAt)}` : '자동 저장이 켜져 있어요';
    box.innerHTML =
      '<div class="acct__title" style="margin-bottom:8px">☁ 연동된 계정 <span class="acct__soon" style="background:linear-gradient(180deg,#bfe3ff,#6fb6f0)">해제 불가</span></div>' +
      `<div class="acct__user"><div class="acct__photo">${u.photo ? `<img src="${esc(u.photo)}" alt="" referrerpolicy="no-referrer">` : esc((u.name || '?').slice(0, 1))}</div>` +
      `<div><div class="acct__name">${esc(u.name)}</div><div class="acct__mail">${esc(u.email || '')}</div></div></div>` +
      `<div class="acct__status ${st.status === 'syncing' ? 'is-busy' : st.status === 'error' ? 'is-error' : ''}">☁ ${statusText}</div>` +
      '<div class="acct__desc" style="margin:0"><small>진행 상황은 자동으로 저장돼요. 다른 기기에서 같은 계정으로 연동하면 이어서 할 수 있어요.</small></div>' + err;
  }
  $('acct').addEventListener('click', async (e) => {
    const login = e.target.closest('button[data-login]');
    if (login) {
      if (!cloud.state().configured) {
        openModal('준비 중이에요', 'Google 계정 연동은 아직 서버가 연결되지 않아서 쓸 수 없어요.<br>연결되면 이 버튼으로 연동해서 기기를 바꿔도 이어서 할 수 있어요.<br><small>지금 진행 상황은 이 기기에 자동 저장돼요.</small>', [{ text: '확인' }]);
        return;
      }
      await cloud.signIn(login.dataset.login); renderAccount(); return;
    }
  });
  // ---- 설정 창 ----
  const settings = $('settings');
  const openSettings = () => { renderAccount(); settings.hidden = false; };
  const closeSettings = () => { settings.hidden = true; };
  $('settingsBtn').addEventListener('click', openSettings);
  $('settingsClose').addEventListener('click', closeSettings);
  settings.addEventListener('click', (e) => { if (e.target === settings) closeSettings(); });   // 바깥을 누르면 닫는다
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !settings.hidden && $('modal').hidden) closeSettings(); });
  $('resetBtn2').addEventListener('click', () => { closeSettings(); $('resetBtn').click(); });
  // ---- GM 모드 (특정 계정에서만 보인다) ----
  const GM_ACTIONS = {
    crystal1000: () => { G.gmAddCrystals(state, 1000); return '크리스탈 +1,000'; },
    crystal10000: () => { G.gmAddCrystals(state, 10000); return '크리스탈 +10,000'; },
    token50: () => { G.gmAddTokens(state, 50); return '증표 +50'; },
    token500: () => { G.gmAddTokens(state, 500); return '증표 +500'; },
    gold1m: () => { G.gmAddGold(state, 1e6); return '골드 +1,000,000'; },
    level20: () => { G.gmSetLevel(state, state.level + 20); return '레벨 +20'; },
    stage50: () => { G.gmSetStage(state, 50); return '스테이지 → 50'; },
    stage150: () => { G.gmSetStage(state, 150); return '스테이지 → 150'; },
    upgrade10: () => { G.gmMaxUpgrades(state, 10); return '강화 전부 +10'; },
    relics: () => { G.gmUnlockRelics(state); return '유물 전부 획득'; },
  };
  $('gmGrid').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-gm]');
    if (!b || !G.isGM(cloud.state().user && cloud.state().user.email)) return;
    const fn = GM_ACTIONS[b.dataset.gm];
    if (!fn) return;
    const label = fn();
    addLog(`[GM] ${label}`, 'is-gold', 'crown');
    cloudSoon(); writeSave(); render(); renderGear(true); renderClass(true); renderShop(true); renderStore(true); renderDungeon(true);
  });
  const FX_INFO = { calm: '차분하게: 꼭 필요한 움직임만 보여요', full: '화려하게: 궤적·폭발·스킬 이펙트·화면 흔들림까지 모두 보여요' };
  function renderFxSetting() {
    $('fxSeg').querySelectorAll('button').forEach((b) => b.classList.toggle('is-on', b.dataset.fx === fxMode));
    $('fxInfo').textContent = FX_INFO[fxMode];
  }
  $('fxSeg').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-fx]');
    if (!b) return;
    fxMode = b.dataset.fx;
    try { localStorage.setItem(FX_KEY, fxMode); } catch (err) { /* 무시 */ }
    renderFxSetting();
  });
  renderFxSetting();

  // 저장 시각 문구("3분 전")가 멈춰 보이지 않게 기록 탭이 열려 있으면 가끔 다시 그린다
  setInterval(() => { if (!settings.hidden && cloud.state().user) renderAccount(); }, 15000);

  // 중요한 일(환생·전직·상점 구매·초기화) 뒤에는 바로, 평소에는 1분마다, 창을 가릴 때도 클라우드에 올린다 (모두 자동)
  const cloudSoon = () => cloud.schedulePush(4000);
  setInterval(() => cloud.push(), 60000);   // 바뀐 게 없으면 서버에 쓰지 않는다
  let hiddenAt = 0;
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { hiddenAt = Date.now(); cloud.push(); return; }
    if (Date.now() - hiddenAt > 30000) cloud.sync();   // 한동안 다른 화면에 있다 돌아오면, 다른 기기에서 진행했는지 확인해 이어받는다
  });

  // ---- 자리를 비운 시간 ----
  // 세 경우가 있다: ① 창을 닫았다 다시 연 경우(시작할 때), ② 탭이 백그라운드에 있는 동안 브라우저가 타이머를 늦추거나 멈춘 경우, ③ 기기가 잠들었다 깨어난 경우.
  // 모두 같은 규칙으로 잰다: 서버 시각이 있으면 서버 시각의 차이, 없으면 기기 시계의 차이 (G.applyOffline). 화면을 벗어난 동안 여러 번 깨어난 시간은 합쳐서 한도를 지키고, 돌아왔을 때 한 번만 알려 준다.
  let last = Date.now(), lastPerf = performance.now(), lastSrv = null;
  let dealtTimer = 0;
  let lastHits = state.hits;
  let waking = true;          // 시작 처리나 깨어나는 처리가 끝날 때까지 루프를 멈춘다
  let away = null;            // 화면을 벗어난 동안의 기록 { at, mark, seconds(시뮬레이션한 시간), chunk(한도에 세는 시간), dropBest, source, jumped, capped }
  const awayMarkOf = () => ({ gold: state.gold, kills: state.totalKills, stage: state.stage, level: state.level, drops: state.stats.drops, sold: state.stats.sold });
  const resetClock = () => { last = Date.now(); lastPerf = performance.now(); lastSrv = serverNow(); };

  // 자리를 비웠다가 돌아온(또는 시계가 튄) 순간: 서버 시각을 다시 받아서 비운 시간을 재고 보상을 준다
  async function wake() {
    waking = true;
    try {
      await fetchServerTime();
      state.savedAt = last;                                             // 마지막 프레임 시각과
      state.srvSavedAt = lastSrv === null ? 0 : Math.floor(lastSrv);    // 그때의 서버 시각에서부터 잰다
      const left = away ? G.offlineCap(state) - away.chunk : Infinity;
      const r = G.applyOffline(state, Date.now(), serverNow(), left);
      if (r) {
        if (away) {   // 화면 밖이면 조용히 모아 두었다가 돌아왔을 때 한 번만 알린다
          away.seconds += r.seconds; away.chunk += r.seconds; away.dropBest = Math.max(away.dropBest, r.dropBest);
          away.source = r.source; away.jumped = away.jumped || r.jumped; away.capped = away.capped || r.capped;
        } else showOffline(r);
      }
      lastHits = state.hits;
      syncQuests();   // 자리를 비운 사이에 하루·한 주·한 달이 지났을 수 있다
    } finally { resetClock(); waking = false; }
  }
  function finishAway() {
    const a = away;
    away = null;
    if (!a || a.seconds < 30) return;
    showOffline({ seconds: Math.floor(a.seconds), raw: Math.floor(a.seconds), gold: Math.floor(state.gold - a.mark.gold), kills: state.totalKills - a.mark.kills,
      stageFrom: a.mark.stage, stageTo: state.stage, levelFrom: a.mark.level, levelTo: state.level,
      drops: state.stats.drops - a.mark.drops, dropsSold: state.stats.sold - a.mark.sold, dropBest: a.dropBest, source: a.source, jumped: a.jumped, capped: a.capped });
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { away = { at: Date.now(), mark: awayMarkOf(), seconds: 0, chunk: 0, dropBest: -1, source: null, jumped: false, capped: false }; return; }
    fetchServerTime();   // 돌아오면 서버 시각을 다시 받는다 (광고 횟수·장비 상점 갱신도 이걸 쓴다)
    // 돌아왔다: 아직 시간 확인 중이면 끝난 뒤에 알린다
    const done = () => { if (waking) setTimeout(done, 100); else finishAway(); };
    setTimeout(done, 50);
  });

  buildUpgrades();
  render();
  addLog('고블린이 모험을 시작했다!', 'is-good', 'sword');
  (async () => {
    await fetchServerTime(2500);   // 창을 닫았다 열면 서버 시각부터 확인한다 (로컬 파일처럼 못 받는 곳에서는 바로 넘어간다)
    const offline = G.applyOffline(state, Date.now(), serverNow());
    if (offline) showOffline(offline);
    lastHits = state.hits;
    booting = false;
    syncQuests();
    writeSave();
    resetClock();
    waking = false;
    renderAccount();
    cloud.start();   // 로그인 상태를 확인하고, 로그인돼 있으면 클라우드와 저장을 맞춘다
  })();

  // ---- 메인 루프 ----
  function frame() {
    if (waking) return;
    const now = Date.now(), perf = performance.now();
    let dt = (now - last) / 1000;
    const dtPerf = (perf - lastPerf) / 1000;
    // 30초 넘게 멈췄거나, 기기 시계가 뒤로/크게 앞으로 튀었거나(시계 변경·절전), 시계와 내부 타이머가 30초 넘게 어긋나면 서버 시각으로 다시 잰다
    if (dt >= 30 || dt < -5 || Math.abs(dt - dtPerf) > 30) { wake(); return; }
    last = now; lastPerf = perf; lastSrv = serverNow();
    if (dt < 0) dt = 0;
    const events = G.simulate(state, dt);
    handleEvents(events);
    if (away) { away.seconds += dt; for (const e of events) if (e.type === 'drop') away.dropBest = Math.max(away.dropBest, e.item.r); }
    if (state.hits < lastHits) lastHits = state.hits;   // 처음부터 다시 시작해 횟수가 초기화된 경우
    if (state.hits !== lastHits) {
      const n = state.hits - lastHits;
      lastHits = state.hits;
      if (!document.hidden) onHeroHit(n);
    }
    if (!document.hidden) enemyAttackFx(dt);
    // 동료의 공격은 자잘하게 나누지 않고 0.5초마다 합쳐서 작게 보여 준다
    dealtTimer += dt;
    if (dealtTimer >= 0.5) {
      dealtTimer = 0;
      const comp = G.companionDps(state) * 0.5;
      if (comp > 0 && state.downT <= 0 && !calm()) floatText('-' + G.fmt(comp), 'float--comp', 'comp');
    }
    if (!document.hidden) render();   // 백그라운드에서는 계산만 하고 화면은 안 그린다 (돌아오면 다음 프레임에 바로 그린다)
  }
  setInterval(frame, 100);

  // 자동 저장
  setInterval(() => { if (!booting && !waking) syncQuests(); }, 20000);   // 켜 둔 채 자정이 지나도 새 퀘스트가 나온다
  setInterval(writeSave, 5000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) writeSave(); });
  window.addEventListener('pagehide', writeSave);

})();
