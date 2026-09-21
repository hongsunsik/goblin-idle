(function () {
  const G = window.Game;
  const A = window.Art;
  A.setParents(G.parentOf);   // 그림이 없는 3·4차 직업은 윗단계 직업 그림으로 대신 그린다
  const SAVE_KEY = 'goblin-idle-save-v1';
  const $ = (id) => document.getElementById(id);

  // 아이콘 스프라이트를 페이지에 한 번 넣어 두면 <use href="#i-이름">으로 어디서든 쓸 수 있다
  document.body.insertAdjacentHTML('afterbegin', A.sprite());
  A.applyStatic(document);   // images/ 폴더에 그림이 있으면 아이콘·배경을 이미지로 교체

  const BIOMES = ['고블린 숲', '어둠의 동굴', '불타는 사막', '얼음 산맥', '화산 지대', '저주받은 성'];
  const STAT_LABEL = { dmg: '공격력', hp: '체력', aps: '공격 속도', gold: '골드', comp: '동료', regen: '회복', click: '직접 공격' };
  const COIN = A.icon('coin');

  // ---- 저장소 (막혀 있어도 게임은 동작해야 하므로 전부 try/catch) ----
  function loadSave() {
    try {
      const text = localStorage.getItem(SAVE_KEY);
      return text ? G.deserialize(text) : null;
    } catch (e) { return null; }
  }
  function writeSave() {
    try {
      localStorage.setItem(SAVE_KEY, G.serialize(state, Date.now()));
      setText('saveInfo', '자동 저장됨');
    } catch (e) {
      setText('saveInfo', '저장할 수 없어요 (브라우저 설정 확인)');
    }
  }
  function clearSave() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* 무시 */ }
  }

  let state = loadSave() || G.createState(Date.now());

  // ---- 바뀐 값만 화면에 쓴다 (초당 10번 갱신하므로 불필요한 그리기를 줄임) ----
  const cache = {};
  function setText(id, v) {
    v = String(v);
    if (cache['t' + id] === v) return;
    cache['t' + id] = v;
    $(id).textContent = v;
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
  try { if (localStorage.getItem(FX_KEY) === 'calm') fxMode = 'calm'; } catch (e) { /* 저장소를 못 써도 기본값 */ }
  const calm = () => fxMode === 'calm';
  const MAX_FX = 64;   // 화면에 한꺼번에 떠 있는 이펙트 수 제한 (빠르게 싸울 때 과부하 방지)

  function anim(el, keyframes, opts) {
    if (reduceMotion || !el || !el.animate) return null;
    return el.animate(keyframes, opts);
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
    anim(heroBody, [
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
      flash.style.background = 'radial-gradient(ellipse at 50% 55%, transparent 30%, rgba(255, 201, 58, 0.7))';
      const a = anim(flash, [{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 0 }], { duration: 800, easing: 'ease-out' });
      if (a) a.onfinish = () => { flash.style.background = ''; };
      else flash.style.background = '';
      shakeScene(4);
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
  const handPos = () => spot($('heroSprite'), 0.78, 0.42);      // 무기를 든 손
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
    } else {   // 칼·도끼·성검: 젖혔다가 크게 휘두른다
      dur = style === 'axe' ? 380 : 330; hit = 0.55;
      kf = [{ transform: 'translate(0, 0) rotate(0deg)' }, { transform: `translate(${-4 * k}px, 0) rotate(${-9 * k}deg)`, offset: 0.3, easing: 'cubic-bezier(0.5, 0, 1, 0.6)' },
        { transform: `translate(${11 * k}px, 1px) rotate(${10 * k}deg)`, offset: 0.55, easing: 'ease-out' }, { transform: 'translate(0, 0) rotate(0deg)' }];
    }
    anim($('hero'), kf, { duration: dur });
    return dur * hit;
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
  // 원거리: 반동(총·활) 또는 마법을 모으는 동작(마법구)
  function shootBody(style, soft) {
    const k = soft ? 0.6 : 1;
    const cast = style === 'orb' || style === 'fire' || style === 'dark';
    anim($('hero'), cast
      ? [{ transform: 'translateY(0) scale(1, 1)' }, { transform: `translateY(${-5 * k}px) scale(1.03, 0.98)`, offset: 0.4 }, { transform: 'translateY(0) scale(1, 1)' }]
      : [{ transform: 'translateX(0)' }, { transform: `translateX(${-5 * k}px)`, offset: 0.25 }, { transform: 'translateX(0)' }], { duration: 260 });
  }
  // 원거리: 손에서 몬스터까지 날아가는 것. 도착까지 걸리는 시간(ms)을 돌려준다.
  function projectile(style, delay, big) {
    const a = handPos(), b = targetPos();
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
    return flight;
  }
  // 그 직업의 평타 한 번: 몸동작 + 궤적/투사체 + 몬스터 피격. 몬스터에 닿는 시각(ms)을 돌려준다.
  function classAttack(strong) {
    const style = G.attackStyle(state);
    const soft = calm() && !strong;
    let land;
    if (G.MELEE_STYLES.includes(style)) { land = swingBody(style, soft); arcFx(style, strong, land); }
    else { shootBody(style, soft); land = 60 + projectile(style, 60, strong); }
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
    const bigHit = () => (melee ? (() => { const l = swingBody(style, false); arcFx(style, true, l); return l; })() : (shootBody(style, false), 60 + projectile(style, 60, true)));
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
        if (!sprite('shield_bubble', hero.x, hero.y, { size: e.kind === 'barrier' ? 190 : 150, dur: 620, from: 0.3, to: 1.05, rot: 0, rot2: 0 })) ringFx(hero.x, hero.y + 8, color, 2.4, 600);
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
    if (bar) { if (bubbleUrl) bar.style.backgroundImage = `url("${bubbleUrl}")`; bar.style.opacity = String(0.45 + 0.5 * Math.min(1, s.buffs.barrier.v / Math.max(1, G.maxHp(s) * 0.5))); }
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
    if (name === 'log') renderAchieves(true);
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

  const TIER_NAME = { 1: '1차', 2: '2차', 3: '3차', 4: '4차' };
  const STAGE_TIER = { base: 1, adv: 2, adv3: 3, adv4: 4 };
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

  let classKey = '';
  let dexView = 2;   // 도감에서 보고 있는 차수 (2·3·4)
  function renderClass(force) {
    const s = state;
    const dexKey = G.ADV_IDS.map((id) => { const r = G.dexRecord(s, id); return `${s.mastered[id] ? 1 : 0}:${r.best}:${r.kills}`; }).join(',');
    const key = [G.classPath(s).join('>'), s.level, dexKey, dexView].join('|');
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

    // 전직 선택 (1차~4차)
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
      html = '<div class="notice">모든 전직을 마쳤어요! (4차)<br>환생하면 직업이 초기화되어 다른 길을 골라 볼 수 있어요.</div>';
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
      `<div class="dexcard__rec">${on ? `최고 <b>${rec.best}</b>단계<br>처치 <b>${G.fmt(rec.kills)}</b>` : `Lv.${G.PROMO_LEVEL[['', 'base', 'adv', 'adv3', 'adv4'][G.classTier(aid)]]}에 전직`}</div></div>`;
  }

  // 도감: 2·3·4차 탭으로 나누고, 부모 직업별로 묶어 자식 2갈래를 보여 준다
  function renderCodex() {
    const s = state;
    const done = (t) => G.advIdsOfTier(t).filter((id) => s.mastered[id]).length;
    $('codexBonus').textContent = `${Object.keys(s.mastered).length} / ${G.ADV_IDS.length} · 공격력·골드 +${Math.round((G.masteryMult(s) - 1) * 100)}%`;
    let html = '<div class="dextabs">' + [2, 3, 4].map((t) =>
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
      const need = G.PROMO_LEVEL[['', 'base', 'adv', 'adv3', 'adv4'][tier]];
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
  });

  // ---- 증표 상점 ----
  let shopKey = '';
  const TIER_TITLE = { 1: '1단계 · 기본 강화', 2: '2단계 · 응용 (앞 단계 강화가 필요해요)', 3: '3단계 · 궁극' };
  function renderShop(force) {
    const s = state;
    const key = G.PERK_KEYS.map((id) => G.perkLv(s, id)).join(',') + '|' + G.tokenBalance(s);
    if (!force && key === shopKey) return;
    shopKey = key;
    $('shopTokens').textContent = G.tokenBalance(s);
    $('shopSpent').textContent = `강화에 쓴 증표 ${G.perkSpent(s)}개`;
    $('respecBtn').hidden = G.perkSpent(s) === 0;
    let html = '';
    for (const tier of [1, 2, 3]) {
      html += `<div class="tier">${TIER_TITLE[tier]}</div><div class="tierbox ${tier > 1 ? 'tierbox--sub' : ''}">`;
      for (const id of G.PERK_KEYS) {
        const p = G.PERKS[id];
        if (p.tier !== tier) continue;
        const lv = G.perkLv(s, id), maxed = lv >= p.max;
        const missing = G.perkMissing(s, id), can = G.canBuyPerk(s, id);
        const pips = Array.from({ length: p.max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
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
  const gearNew = new Set();   // 장비 탭을 열기 전에 새로 얻은 장비 번호 (NEW 표시·알림 점용, 저장하지 않음)
  const KIND_SHORT = { dmg: '공격력', hp: '체력', gold: '골드', aps: '공속', comp: '동료', click: '직접' };
  const fmtVal = (v) => (Math.round(v * 10) / 10).toString();
  // 장비 그림: 이름(디자인)마다 다르다. 이미지가 없으면 칸 종류의 기본 아이콘을 색만 달리해서 쓴다.
  const gearArt = (it) => A.gear(G.itemDesign(it), G.GEAR[it.slot].icon);
  const itemStat = (it) => `${G.GEAR[it.slot].kinds[it.kind].label} +${fmtVal(it.val)}%`;

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

  function slotCard(slot, it) {
    if (!it) {
      return `<div class="slot is-empty" data-slot="${slot}"><div class="slot__cap">${G.GEAR[slot].name}</div>${A.icon(G.GEAR[slot].icon)}<div class="slot__name" style="color:var(--muted)">비어 있음</div></div>`;
    }
    return `<button class="slot r${it.r}" type="button" data-slot="${slot}"><div class="slot__cap">${G.GEAR[slot].name}</div>${gearArt(it)}` +
      `<div class="slot__name">${G.itemName(it)}</div><div class="slot__stat">${itemStat(it)}</div><div class="slot__lv">Lv.${it.ilvl}</div></button>`;
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
    const key = [G.SLOT_KEYS.map((k) => ids(s.equip[k])).join(','), s.bag.map((x) => x.id).join(','), s.autoEquip, s.autoSell, [...gearNew].join('+'), G.perkLv(s, 'luck'), selectMode, [...picked].join('+')].join('|');
    if (!force && key === gearKey) return;
    gearKey = key;
    $('gearSummary').textContent = gearSummaryText();
    $('slots').innerHTML = G.SLOT_KEYS.map((k) => slotCard(k, s.equip[k])).join('');
    $('autoEquip').checked = s.autoEquip;
    $('autoSell').value = String(s.autoSell);
    const bc = $('bagCount');
    bc.textContent = `${s.bag.length} / ${G.bagLimit(s)}`;
    bc.style.color = s.bag.length >= G.bagLimit(s) ? 'var(--red)' : '';
    for (const id of [...picked]) if (!s.bag.some((x) => x.id === id)) picked.delete(id);   // 이미 팔린 장비는 선택에서 뺀다
    let html = '';
    s.bag.forEach((it) => {
      html += `<button class="gitem r${it.r} ${gearNew.has(it.id) ? 'is-new' : ''} ${picked.has(it.id) ? 'is-sel' : ''}" type="button" data-item="${it.id}">${gearArt(it)}` +
        `<div class="gitem__stat">${KIND_SHORT[it.kind]} +${fmtVal(it.val)}%</div><div class="gitem__lv">Lv.${it.ilvl}</div></button>`;
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
    $('tidyBtn').disabled = s.bag.length === 0;
    $('dropInfo').innerHTML = dropInfoHtml();
  }

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
      `<div><span class="itemd__tag r${it.r}">${R.name}</span><div class="itemd__main">${def.label} +${fmtVal(it.val)}%</div>` +
      `<small>${G.GEAR[it.slot].name} · 드롭 스테이지 ${it.ilvl}</small></div></div>${cmp}`;
    const done = (msg, icon) => { addLog(msg, 'is-good', icon); writeSave(); render(); renderGear(true); };
    if (equipped) {
      openModal(G.itemName(it), body, [
        { text: '닫기' },
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
  $('autoSell').addEventListener('change', (e) => { state.autoSell = Number(e.target.value); writeSave(); });
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
      { id: 'r0', label: '노말 이하', items: s.bag.filter((x) => x.r <= 0) },
      { id: 'r1', label: '고급 이하', items: s.bag.filter((x) => x.r <= 1) },
      { id: 'r2', label: '희귀 이하', items: s.bag.filter((x) => x.r <= 2) },
      { id: 'weak', label: '장착 중인 장비보다 약한 것', items: G.bagWeaker(s) },
    ];
    const goldOf = (items) => items.reduce((a, x) => a + G.sellValue(x), 0);
    const first = opts.find((o) => o.items.length);
    if (!first) { openModal('정리할 장비가 없어요', '가방에서 팔 만한 장비를 찾지 못했어요.', [{ text: '확인' }]); return; }
    const html = '<div class="tidy">' + opts.map((o) =>
      `<label class="tidy__opt ${o.items.length ? '' : 'is-empty'}"><input type="radio" name="tidy" value="${o.id}" ${o === first ? 'checked' : ''} ${o.items.length ? '' : 'disabled'}>` +
      `<span><b>${o.label}</b><small>${o.items.length}개 · ${COIN}${G.fmt(goldOf(o.items))}</small></span></label>`).join('') +
      '</div><small>장착 중인 장비는 팔리지 않아요.</small>';
    openModal('장비 정리', html, [
      { text: '취소' },
      { text: '판매하기', cls: 'btn--gold', onClick: () => {
        const v = document.querySelector('input[name="tidy"]:checked');
        const o = opts.find((x) => v && x.id === v.value);
        if (!o || !o.items.length) return;
        const r = G.sellBagItems(state, o.items.map((x) => x.id));
        addLog(`장비 ${r.n}개를 정리했다 (+${G.fmt(r.gold)} 골드)`, 'is-gold', 'coin');
        writeSave(); render(); renderGear(true);
      } },
    ]);
  });

  // ---- 업적 (기록 탭) ----
  let achieveKey = '';
  function renderAchieves(force) {
    const s = state;
    const done = Object.keys(s.achieved).length;
    // 달성 수와 진행도가 바뀌었을 때만 다시 그린다
    const key = G.ACHIEVEMENTS.map((a) => (s.achieved[a.id] ? 'x' : Math.min(a.val(s), a.goal))).join('|');
    if (!force && key === achieveKey) return;
    achieveKey = key;
    $('achieveBonus').textContent = `${done} / ${G.ACHIEVEMENTS.length} · 공격력·골드 +${Math.round(done * G.ACHIEVE_BONUS * 100)}%`;
    let html = '';
    for (const a of G.ACHIEVEMENTS) {
      const on = !!s.achieved[a.id];
      const cur = on ? a.goal : Math.min(a.val(s), a.goal);
      html += `<div class="ach ${on ? 'is-on' : ''}">${A.icon(a.icon)}<div class="ach__body">` +
        `<div class="ach__name">${a.name}</div><div class="ach__desc">${a.desc}</div>` +
        `<div class="ach__bar"><i class="${on ? 'is-full' : ''}" style="width:${(cur / a.goal) * 100}%"></i></div></div></div>`;
    }
    $('achv').innerHTML = html;
  }

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
      } else if (e.type === 'down') {
        addLog(`쓰러졌다... 스테이지 ${e.to}로 후퇴`, 'is-bad', 'skull');
        shakeScene(5);
      } else if (e.type === 'drop') {
        const it = e.item, R = G.RARITIES[it.r], name = G.itemName(it);
        if (!(e.action === 'sold' && it.r === 0)) {   // 자동 판매된 노말까지 기록하면 너무 많다
          const verb = e.action === 'equipped' ? '장착' : e.action === 'bag' ? '획득' : `판매 +${G.fmt(e.gold)} 골드`;
          addLog(`[${R.name}] ${name} ${verb}`, it.r >= 2 ? 'is-gold' : 'is-good', G.GEAR[it.slot].icon);
        }
        if (calm() ? it.r >= 2 : (e.action !== 'sold' || it.r >= 2)) floatText(`${R.name} ${name}`, 'float--drop', 'center', R.color);
        if (it.r >= 3) rareDropFx(it.r);
        if (e.action !== 'sold') gearNew.add(it.id);
      } else if (e.type === 'achieve') {
        const a = G.ACHIEVEMENTS.find((x) => x.id === e.id);
        addLog(`업적 달성: ${a.name}! 공격력·골드 +${Math.round(G.ACHIEVE_BONUS * 100)}%`, 'is-gold', a.icon);
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
      $('hero').innerHTML = A.goblin(look);
      $('avatar').innerHTML = A.goblin(look, { head: true });
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
    renderPotionbar();
    if (currentTab === 'log') renderAchieves(false);

    // 환생 탭
    const gain = G.prestigeGain(s);
    const pb = $('prestigeBtn');
    setText('pTokens', G.tokenBalance(s));
    setText('pBonus', '+' + Math.round((G.tokenMult(s) - 1) * 100) + '%');
    setText('pBest', s.bestStage);
    pb.disabled = gain <= 0;
    setText('prestigeBtn', gain > 0 ? `환생하기 (증표 +${gain})` : '아직 환생할 수 없어요');
    setText('prestigeHint', gain > 0
      ? `지금 환생하면 왕의 증표 ${gain}개를 얻어요. 증표 1개당 공격력·골드가 영구히 +${Math.round(G.TOKEN_BONUS * 100)}%라서 보너스가 +${Math.round((G.tokenMult(s) - 1) * 100)}% → +${Math.round(G.TOKEN_BONUS * 100 * (s.tokens + gain))}%가 돼요. 골드·레벨·강화·스테이지·직업은 처음부터 다시 시작하고, 직업 도감은 그대로 남아요. 증표는 '증표' 탭에서 영구 강화를 사는 데 쓸 수 있어요.`
      : `스테이지 ${G.PRESTIGE_MIN_STAGE}에 도달하면 환생할 수 있어요. 환생하면 왕의 증표를 얻어 영구히 강해지고, 다른 직업으로 다시 시작해 볼 수 있어요.`);

    // 메뉴 알림 점
    const dots = document.querySelectorAll('.tabnav__btn .dot');
    const want = [anyBuy && currentTab !== 'upgrade', gearNew.size > 0 && currentTab !== 'gear', G.promoStage(s) !== null && currentTab !== 'class', gain > 0 && currentTab !== 'prestige',
      G.PERK_KEYS.some((id) => G.canBuyPerk(s, id)) && currentTab !== 'shop', G.adStatus(s, today()).left > 0 && adsMod.available && currentTab !== 'store'];
    dots.forEach((d, i) => { if (d.hidden === want[i]) d.hidden = !want[i]; });
  }

  // ---- 크리스탈 상점 ----
  // 결제와 광고는 지금 '시연 모드'다: 실제 돈이 청구되지 않고, 실제 광고도 나오지 않는다. (실제로 바꾸는 방법: docs/PAYMENTS.md)
  const Store = window.GoblinStore;
  const GEM = A.icon('gem');
  const POTION_ICON = { gold: 'coin', might: 'sword', haste: 'boots', exp: 'arrowup', luck: 'star', hero: 'crown', sand: 'bolt' };
  const won = (n) => n.toLocaleString('ko-KR') + '원';
  const clockText = (sec) => (sec >= 3600 ? `${Math.floor(sec / 3600)}시간 ${Math.floor((sec % 3600) / 60)}분` : `${Math.max(1, Math.ceil(sec / 60))}분`);
  // 광고 횟수를 세는 '오늘'은 기기 시계가 아니라 서버 시각으로 정한다 (시계를 바꿔서 횟수를 늘리지 못하게).
  // 서버 시각은 이 사이트를 내려 주는 서버의 응답 시각(Date 헤더)이다. 받지 못하면(오프라인·로컬 파일) 새 하루로 넘어가지 않는다.
  let srvBase = null, perfBase = 0;
  async function fetchServerTime() {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), 4000);
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
  const today = () => G.adToday(state, serverNow(), Date.now());
  fetchServerTime();
  document.addEventListener('visibilitychange', () => { if (!document.hidden) fetchServerTime(); });
  let storeKey = '', potionKey = '';
  const rarityName = (r) => `<b style="color:${G.RARITIES[r].color}">${G.RARITIES[r].name}</b>`;
  const oddsHtml = (odds) => Object.keys(odds).map(Number).map((r) => `<span style="color:${G.RARITIES[r].color}">${G.RARITIES[r].name} ${odds[r]}%</span>`).join('');
  const reasonText = { crystals: '크리스탈이 부족해요', bag: '가방에 자리가 없어요. 장비를 팔거나 가방을 넓혀 주세요', max: '더 살 수 없어요', owned: '이미 산 상품이에요', unknown: '없는 상품이에요' };

  const paymentsMod = window.GoblinPayments.createPayments(window.PAYMENTS_CONFIG, { confirmDemo });
  const adsMod = window.GoblinAds.createAds(window.ADS_CONFIG, { showDemoAd });

  function renderStore(force) {
    const s = state;
    const ad = G.adStatus(s, today());
    const key = [s.crystals, ad.left, s.bagExtra, s.bought.starter ? 1 : 0, s.bag.length >= G.bagLimit(s) ? 1 : 0, paymentsMod.mode, adsMod.mode].join('|');
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
      `<div><div class="prod__name">광고 보고 크리스탈 <span class="prod__chip">무료</span></div>` +
      `<div class="prod__desc">광고를 끝까지 볼 때마다 ${GEM} <b>크리스탈 ${Store.AD_CRYSTALS}개</b>.<br>오늘 ${ad.left}/${ad.limit}번 남음 · 한국 시간 자정에 초기화</div></div>` +
      `<button class="btn prod__btn" type="button" data-ad ${ad.left > 0 && adsMod.available ? '' : 'disabled'}><span>${ad.left > 0 ? '광고 보기' : '오늘 끝'}</span></button></div>`;

    const buyBtn = (id, price, disabled, label) => `<button class="btn btn--gold prod__btn" type="button" data-buy="${id}" ${disabled ? 'disabled' : ''}>${label ? `<small>${label}</small>` : ''}<span>${GEM}${price}</span></button>`;
    const card = (icon, tone, name, desc, extra, btn) => `<div class="card prod"><div class="prod__tile" style="--tone:${tone}">${A.icon(icon)}</div><div><div class="prod__name">${name}</div><div class="prod__desc">${desc}</div>${extra || ''}</div>${btn}</div>`;

    $('potionList').innerHTML = [...Store.POTIONS, ...Store.INSTANT].map((p) => {
      const left = s.potions[p.id] || 0;
      const active = left > 0 ? `<div class="prod__desc" style="color:var(--green)">적용 중 · ${clockText(left)} 남음</div>` : '';
      const dur = p.dur ? ` <small>(${clockText(p.dur)})</small>` : '';
      return card(POTION_ICON[p.id] || 'heart', p.color + '99', p.name, p.desc + dur, active, buyBtn(p.id, p.price, s.crystals < p.price));
    }).join('');

    $('boxList').innerHTML = Store.BOXES.map((b) =>
      card('gem', '#7a4aff99', b.name, b.desc, `<div class="prod__odds">${oddsHtml(b.odds)}</div>`, buyBtn(b.id, b.price, s.crystals < b.price))).join('');

    const bagMaxed = s.bagExtra >= Store.BAG_EXTRA_MAX;
    const u = Store.UTILITIES[0], st = Store.STARTER;
    $('utilList').innerHTML =
      card('pouch', '#8a6a3a99', u.name, `${u.desc}<br>지금 ${G.bagLimit(s)}칸`, '', bagMaxed ? '<button class="btn btn--gray prod__btn" type="button" disabled>MAX</button>' : buyBtn(u.id, u.price, s.crystals < u.price)) +
      card('party', '#ff8a3a99', st.name, st.desc, '', s.bought.starter ? '<button class="btn btn--gray prod__btn" type="button" disabled>구매 완료</button>' : buyBtn(st.id, st.price, s.crystals < st.price));

    $('storeNote').innerHTML = '장비 상자는 위 확률대로 등급이 정해져요 (같은 등급 안에서 능력은 무작위). 산 장비는 자동 판매되지 않고, 더 좋으면 바로 장착돼요. 물약은 게임을 꺼 둔 동안에도 시간이 줄어요.';
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

  // 구매 결과 창: 받은 장비를 보여 준다
  function showBought(res) {
    const p = res.product;
    let body = `<div style="font-weight:900;font-size:16px;margin-bottom:8px">${p.name}</div>`;
    if (res.items && res.items.length) {
      body += res.items.map((it) => `<div class="got" style="--rc:${G.RARITIES[it.r].color}">${gearArt(it)}<div><b>[${G.RARITIES[it.r].name}] ${G.itemName(it)}</b><small>${KIND_SHORT[it.kind]} +${fmtVal(it.val)}% · Lv.${it.ilvl}</small></div></div>`).join('');
      body += '<small>가방에서 확인하고, 더 좋으면 자동으로 장착됐어요.</small>';
    } else body += `<div style="color:var(--green);font-weight:800">${p.desc}</div>`;
    openModal('구매 완료', body, [{ text: '확인', cls: 'btn--gold' }]);
  }
  function askBuyProduct(id) {
    const all = [...Store.POTIONS, ...Store.INSTANT, ...Store.BOXES, ...Store.UTILITIES, Store.STARTER];
    const p = all.find((x) => x.id === id);
    if (!p) return;
    const odds = p.odds ? `<div class="prod__odds" style="justify-content:center;margin-top:6px">${oddsHtml(p.odds)}</div>` : '';
    openModal('구매할까요?',
      `<div style="font-weight:900;font-size:16px">${p.name}</div><div style="margin-top:4px;color:var(--muted)">${p.desc}</div>${odds}` +
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
          addLog(`광고 보상! 크리스탈 +${res.crystals}`, 'is-gold', 'gem');
          floatText(`+${res.crystals} 크리스탈`, 'float--big', 'center');
          cloudSoon(); writeSave(); render(); renderStore(true);
        }
      } else if (r.status === 'unavailable') openModal('광고를 볼 수 없어요', esc(r.reason || ''), [{ text: '확인' }]);
    } finally { adBusy = false; }
  }

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
    const gain = G.prestigeGain(state);
    if (gain <= 0) return;
    openModal('환생할까요?',
      `${A.icon('crown')}왕의 증표 <b>${gain}개</b>를 얻고<br>골드·레벨·강화·스테이지·직업이 처음으로 돌아가요.<br><small>직업 도감은 그대로 남아요.</small>`,
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
    openModal('자리를 비운 사이에...',
      `${G.fmtTime(r.seconds)} 동안 고블린이 열심히 싸웠어요.<br>` +
      `${COIN} 골드 +${G.fmt(r.gold)}<br>` +
      `${A.icon('sword')} 몬스터 ${G.fmt(r.kills)}마리 처치<br>` +
      `${A.icon('arrowup')} 레벨 ${r.levelFrom} → ${r.levelTo}<br>` +
      `${A.icon('star')} ${stage}` +
      (r.drops > 0 ? `<br>${A.icon('gem')} 장비 ${r.drops}개 발견 (${r.dropsSold}개 자동 판매)` + (r.dropBest >= 2 ? ` · 최고 <b style="color:${G.RARITIES[r.dropBest].color}">${G.RARITIES[r.dropBest].name}</b>` : '') : '') +
      (r.seconds >= G.offlineCap(state) ? `<br><small>(오프라인 보상은 최대 ${Math.round(G.offlineCap(state) / 3600)}시간까지예요)</small>` : ''),
      [{ text: '받기', cls: '' }]);
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
    next.savedAt = Date.now();   // 기기를 바꾼 사이의 시간을 오프라인 보상으로 또 주지 않는다 (다른 기기가 이미 받았을 수 있다)
    state = next;
    logs.length = 0;
    lastLook = ''; lastMonster = '';
    gearKey = ''; shopKey = ''; storeKey = ''; potionKey = ''; classKey = ''; achieveKey = '';
    gearNew.clear();
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
    getLocal: () => ({ text: G.serialize(state, Date.now()), summary: window.Sync.summaryOf(state, G.lookId(state)) }),
    applySave: applyCloudSave,
    askConflict,
    storage: cloudStorage,
    onChange: (st) => renderAccount(st),
  });

  window.GoblinCloud = cloud;   // 점검 도구와 개발자 콘솔에서 동기화를 직접 불러 볼 수 있게 한다 (화면에는 저장 버튼이 없다)

  function renderAccount(st) {
    st = st || cloud.state();
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

  // ---- 시작: 자리를 비운 동안의 보상 ----
  buildUpgrades();
  const offline = G.applyOffline(state, Date.now());
  if (offline) {
    showOffline(offline);
    addLog(`${G.fmtTime(offline.seconds)} 동안 자리를 비웠어요`, 'is-gold', 'coin');
  } else {
    addLog('고블린이 모험을 시작했다!', 'is-good', 'sword');
  }
  render();

  // ---- 메인 루프 ----
  let last = Date.now();
  let dealtTimer = 0;
  let lastHits = state.hits;

  function frame() {
    const now = Date.now();
    let dt = (now - last) / 1000;
    last = now;
    if (dt < 0) dt = 0;   // 시계가 뒤로 갔을 때

    if (dt >= 30) {
      // 탭이 오래 멈춰 있었다면 오프라인 보상과 같은 방식으로 처리
      state.savedAt = now - dt * 1000;
      const r = G.applyOffline(state, now);
      if (r) showOffline(r);
      lastHits = state.hits;
    } else {
      const events = G.simulate(state, dt);
      handleEvents(events);
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
    }
    render();
  }
  setInterval(frame, 100);

  // 자동 저장
  setInterval(writeSave, 5000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) writeSave(); });
  window.addEventListener('pagehide', writeSave);

  renderAccount();
  cloud.start();   // 로그인 상태를 확인하고, 로그인돼 있으면 클라우드와 저장을 맞춘다
})();
