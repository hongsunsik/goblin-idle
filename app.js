(function () {
  const G = window.Game;
  const A = window.Art;
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
  const MAX_FX = 34;   // 화면에 한꺼번에 떠 있는 이펙트 수 제한 (빠르게 싸울 때 과부하 방지)

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

  // ---- 고블린 공격: 웅크렸다가(예비 동작) 돌진하고, 멈칫했다가 돌아온다 ----
  function heroLunge(seconds) {
    const dur = Math.max(190, Math.min(440, seconds * 1000 * 0.85));
    anim($('hero'), [
      { transform: 'translate(0, 0) scale(1, 1) rotate(0deg)' },
      { transform: 'translate(-7px, 1px) scale(1.05, 0.95) rotate(-4deg)', offset: 0.22, easing: 'cubic-bezier(0.5, 0, 1, 0.6)' },
      { transform: 'translate(34px, -2px) scale(0.94, 1.07) rotate(6deg)', offset: 0.4, easing: 'ease-out' },
      { transform: 'translate(28px, 0) scale(1.02, 0.98) rotate(3deg)', offset: 0.54 },
      { transform: 'translate(0, 0) scale(1, 1) rotate(0deg)' },
    ], { duration: dur });
    return dur * 0.4;   // 고블린이 몬스터에 닿는 시각(ms)
  }

  // ---- 몬스터 피격: 밀려났다가 되돌아오고, 순간 하얗게 번쩍인다 ----
  function monsterHit(strong, delay) {
    const body = $('monster'), img = body.firstElementChild;
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
    const spark = addFx('fx-spark', p.x + rand(-18, 10), p.y + rand(-22, 14));
    playFx(spark, [
      { transform: `scale(0.3) rotate(${rand(-30, 30)}deg)`, opacity: 1 },
      { transform: `scale(${strong ? 2.3 : 1.7}) rotate(${rand(-30, 30)}deg)`, opacity: 0 },
    ], { duration: 260, delay, easing: 'ease-out' });
    if (strong) {
      const a = rand(-35, 35);
      const slash = addFx('fx-slash', p.x, p.y);
      playFx(slash, [
        { transform: `rotate(${a}deg) scaleX(0.2)`, opacity: 1 },
        { transform: `rotate(${a}deg) scaleX(1.05)`, opacity: 1, offset: 0.4 },
        { transform: `rotate(${a}deg) scaleX(1.15)`, opacity: 0 },
      ], { duration: 240, delay, easing: 'ease-out' });
    }
  }

  // ---- 몬스터가 쓰러질 때: 복제본이 튕겨 날아가며 사라지고, 새 몬스터가 통통 튀며 등장한다 ----
  function killFx(boss) {
    const mSprite = $('monsterSprite');
    const p = spot(mSprite, 0.5, 0.5);
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
    anim($('flash'), [{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 0 }], { duration: 700, easing: 'ease-out' });
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
    if (img) {
      const base = baseFilter(img);
      anim(img, [{ filter: base + ' brightness(1.9) saturate(1.3)' }, { filter: base }], { duration: 520, easing: 'ease-out' });
    }
  }

  // 몬스터도 가끔 달려들고, 고블린은 맞는 순간 움찔하며 붉게 번쩍인다
  let enemyAtkT = 0;
  function enemyAttackFx(dt) {
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
    setTimeout(() => floatText('-' + G.fmt(G.monsterAtk(state.stage) * period), 'float--hurt', 'hero'), 220);
  }

  // 영웅·전설 장비가 떨어지면 등급 색 고리가 퍼지고 (전설은 화면도 번쩍이며 흔들린다)
  function rareDropFx(rarity) {
    const color = G.RARITIES[rarity].color;
    const p = spot($('monsterSprite'), 0.5, 0.5);
    for (let i = 0; i < 2; i++) {
      const ring = addFx('fx-ring', p.x, p.y);
      if (ring) ring.style.borderColor = color;
      playFx(ring, [{ transform: 'scale(0.3)', opacity: 1 }, { transform: `scale(${3.2 + i * 1.6})`, opacity: 0 }], { duration: 620 + i * 200, delay: i * 120, easing: 'ease-out' });
    }
    if (rarity >= 4) {
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
  function onHeroHit(n) {
    const contact = heroLunge(1 / G.attacksPerSec(state));
    monsterHit(false, contact);
    impactFx(false, contact);
    const now = Date.now();
    if (now - lastHitText > 350) {   // 연타할 때 숫자가 쏟아지지 않게 한다
      lastHitText = now;
      floatText(G.fmt(G.hitDmg(state) * n), 'float--hit', 'hit');
    }
  }
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

  function askPromote(id, isAdv) {
    const info = isAdv ? G.ADVANCED[id] : G.CLASSES[id];
    openModal(
      `${info.name}(으)로 전직할까요?`,
      A.goblin(id) + `<div>${info.desc}</div><div class="chips" style="justify-content:center;margin-top:8px">${chipsFor(info.mult)}</div>` +
      '<div style="margin-top:10px"><small>환생하기 전까지는 바꿀 수 없어요.</small></div>',
      [
        { text: '취소' },
        { text: '전직하기', cls: 'btn--gold', onClick: () => {
          if (!G.promote(state, id)) return;
          handleEvents(G.checkAchievements(state));
          addLog(`${info.name}(으)로 전직했다!`, 'is-good', 'cap');
          floatText('전직!', 'float--big', 'center');
          writeSave();
          render();
          renderClass(true);
        } },
      ]
    );
  }

  let classKey = '';
  function renderClass(force) {
    const s = state;
    const dexKey = Object.keys(G.ADVANCED).map((id) => { const r = G.dexRecord(s, id); return `${s.mastered[id] ? 1 : 0}:${r.best}:${r.kills}`; }).join(',');
    const key = [s.cls, s.adv, s.level, dexKey].join('|');
    if (!force && key === classKey) return;
    classKey = key;

    // 지금 직업
    const id = G.lookId(s);
    const desc = s.adv ? G.ADVANCED[s.adv].desc : s.cls ? G.CLASSES[s.cls].desc
      : `아직 직업이 없는 견습 고블린이에요. Lv.${G.PROMO_LEVEL.base}이 되면 전직할 수 있어요.`;
    $('classNow').innerHTML =
      `<div class="classcard__art">${A.goblin(id)}</div>` +
      `<div><div class="classcard__name">${G.classTitle(s)}</div><div class="classcard__desc">${desc}</div>` +
      `<div class="chips">${chipsFor(currentMult())}</div></div>`;

    // 전직 선택
    const box = $('classChoice');
    let html = '';
    if (!s.cls || !s.adv) {
      const isAdv = !!s.cls;
      const need = isAdv ? G.PROMO_LEVEL.adv : G.PROMO_LEVEL.base;
      const ids = isAdv ? G.CLASSES[s.cls].adv : Object.keys(G.CLASSES);
      const ready = s.level >= need;
      html += `<div class="choice__title">${isAdv ? '2차' : '1차'} 전직 (Lv.${need}) ${ready ? '· 지금 선택할 수 있어요!' : ''}</div><div class="choices">`;
      for (const cid of ids) {
        const info = isAdv ? G.ADVANCED[cid] : G.CLASSES[cid];
        html += `<div class="card choice ${ready ? 'is-ready' : 'is-locked'}">` +
          `<div class="choice__art">${A.goblin(cid)}</div>` +
          `<div class="choice__name">${info.name}</div>` +
          `<div class="choice__desc">${info.desc}</div>` +
          `<div class="chips" style="justify-content:center">${chipsFor(info.mult)}</div>` +
          `<button class="btn ${ready ? '' : 'btn--gray'}" type="button" data-pick="${cid}" data-adv="${isAdv ? 1 : 0}" ${ready ? '' : 'disabled'}>${ready ? '전직하기' : `Lv.${need} 필요`}</button>` +
          '</div>';
      }
      html += '</div>';
    } else {
      html = '<div class="notice">모든 전직을 마쳤어요!<br>환생하면 직업이 초기화되어 다른 직업을 골라 볼 수 있어요.</div>';
    }
    box.innerHTML = html;

    // 도감: 1차 직업별로 묶고, 2차 직업마다 등급·최고 스테이지·처치 수를 보여 준다
    const count = Object.keys(s.mastered).length;
    $('codexBonus').textContent = `${count} / ${Object.keys(G.ADVANCED).length} · 공격력·골드 +${Math.round((G.masteryMult(s) - 1) * 100)}%`;
    let dex = '';
    for (const bid of Object.keys(G.CLASSES)) {
      const base = G.CLASSES[bid];
      dex += `<div class="dexrow"><div class="dexrow__head">${A.goblin(bid, { head: true })}<div class="dexrow__name">${base.name}</div>` +
        `<div class="dexrow__stat">${Object.keys(base.mult).map((k) => `${STAT_LABEL[k]} ×${base.mult[k]}`).join(' · ')}</div></div><div class="dexrow__kids">`;
      for (const aid of base.adv) {
        const on = !!s.mastered[aid];
        const rec = G.dexRecord(s, aid), tier = G.dexTier(s, aid);
        dex += `<div class="dexcard ${on ? 'is-on' : 'is-off'}" data-dex="${aid}">` +
          (on ? `<span class="medal medal--${tier}">${tier ? G.DEX_TIERS[tier - 1].name : '-'}</span>` : '') +
          `<div class="dexcard__art">${A.goblin(aid)}</div>` +
          `<div class="dexcard__name">${on ? G.ADVANCED[aid].name : '???'}</div>` +
          `<div class="dexcard__rec">${on ? `최고 <b>${rec.best}</b>단계<br>처치 <b>${G.fmt(rec.kills)}</b>` : `${base.name} Lv.${G.PROMO_LEVEL.adv}에서 전직`}</div></div>`;
      }
      dex += '</div></div>';
    }
    $('codex').innerHTML = dex;
  }

  // 도감 카드를 누르면 자세한 정보 창을 연다
  function showDex(aid) {
    const info = G.ADVANCED[aid];
    const s = state;
    if (!s.mastered[aid]) {
      const base = G.CLASSES[info.parent];
      openModal('???',
        `<div class="dexd__art" style="filter:brightness(0) opacity(.4)">${A.goblin(aid)}</div>` +
        `<div class="dexd__desc">아직 만나지 못한 직업이에요.<br><b>${base.name}</b>으로 1차 전직한 뒤 Lv.${G.PROMO_LEVEL.adv}에서 2차 전직하면 도감에 기록돼요.</div>`,
        [{ text: '닫기' }]);
      return;
    }
    const rec = G.dexRecord(s, aid), tier = G.dexTier(s, aid);
    const bonus = Math.round((G.MASTERY_BONUS + G.TIER_BONUS * tier) * 100);
    const tiers = G.DEX_TIERS.map((t, i) =>
      `<div class="${tier > i ? 'is-done' : ''}"><span class="medal medal--${i + 1}">${t.name}</span><span>최고 스테이지 ${t.stage} 도달</span>` +
      `<span>${tier > i ? '달성' : `${t.stage - rec.best}단계 남음`}</span></div>`).join('');
    openModal(info.name,
      `<div class="dexd__art">${A.goblin(aid)}</div>` +
      `<div class="dexd__desc">${info.desc}</div>` +
      `<div class="chips" style="justify-content:center">${chipsFor(info.mult)}</div>` +
      `<div class="dexd__rec"><div><small>최고 스테이지</small><b>${rec.best}</b></div><div><small>처치 수</small><b>${G.fmt(rec.kills)}</b></div><div><small>전직 횟수</small><b>${rec.runs}</b></div></div>` +
      `<div class="dexd__tiers">${tiers}</div>` +
      `<div style="margin-top:10px"><small>이 직업 보너스: 공격력·골드 +${bonus}% (등급마다 +${Math.round(G.TIER_BONUS * 100)}%p)</small></div>`,
      [{ text: '닫기' }]);
  }
  $('codex').addEventListener('click', (e) => {
    const c = e.target.closest('.dexcard');
    if (c) showDex(c.dataset.dex);
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
  let gearKey = '';
  const gearNew = new Set();   // 장비 탭을 열기 전에 새로 얻은 장비 번호 (NEW 표시·알림 점용, 저장하지 않음)
  const KIND_SHORT = { dmg: '공격력', hp: '체력', gold: '골드', aps: '공속', comp: '동료', click: '직접' };
  const fmtVal = (v) => (Math.round(v * 10) / 10).toString();
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
    return `<button class="slot r${it.r}" type="button" data-slot="${slot}"><div class="slot__cap">${G.GEAR[slot].name}</div>${A.icon(G.GEAR[slot].icon)}` +
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
    const key = [G.SLOT_KEYS.map((k) => ids(s.equip[k])).join(','), s.bag.map((x) => x.id).join(','), s.autoEquip, s.autoSell, [...gearNew].join('+'), G.perkLv(s, 'luck')].join('|');
    if (!force && key === gearKey) return;
    gearKey = key;
    $('gearSummary').textContent = gearSummaryText();
    $('slots').innerHTML = G.SLOT_KEYS.map((k) => slotCard(k, s.equip[k])).join('');
    $('autoEquip').checked = s.autoEquip;
    $('autoSell').value = String(s.autoSell);
    const bc = $('bagCount');
    bc.textContent = `${s.bag.length} / ${G.BAG_MAX}`;
    bc.style.color = s.bag.length >= G.BAG_MAX ? 'var(--red)' : '';
    let html = '';
    s.bag.forEach((it) => {
      html += `<button class="gitem r${it.r} ${gearNew.has(it.id) ? 'is-new' : ''}" type="button" data-item="${it.id}">${A.icon(G.GEAR[it.slot].icon)}` +
        `<div class="gitem__stat">${KIND_SHORT[it.kind]} +${fmtVal(it.val)}%</div><div class="gitem__lv">Lv.${it.ilvl}</div></button>`;
    });
    for (let i = s.bag.length; i < G.BAG_MAX; i++) html += '<div class="gitem is-empty"></div>';
    $('bag').innerHTML = html;
    const cheap = s.bag.filter((x) => x.r <= 1);
    $('sellAllBtn').textContent = cheap.length ? `노말·고급 ${cheap.length}개 판매` : '일괄 판매';
    $('sellAllBtn').disabled = cheap.length === 0;
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
      `<div class="itemd__head"><div class="slot r${it.r}">${A.icon(G.GEAR[it.slot].icon)}</div>` +
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
    if (it) showItem(it, false);
  });
  $('autoEquip').addEventListener('change', (e) => { state.autoEquip = e.target.checked; writeSave(); });
  $('autoSell').addEventListener('change', (e) => { state.autoSell = Number(e.target.value); writeSave(); });
  $('sellAllBtn').addEventListener('click', () => {
    const items = state.bag.filter((x) => x.r <= 1);
    if (!items.length) return;
    const gold = items.reduce((a, x) => a + G.sellValue(x), 0);
    openModal('일괄 판매', `가방의 노말·고급 장비 <b>${items.length}개</b>를 팔고<br>${COIN} 골드 <b>${G.fmt(gold)}</b>을(를) 받아요.<br><small>장착 중인 장비와 희귀 이상은 그대로예요.</small>`, [
      { text: '취소' },
      { text: '판매', cls: 'btn--gold', onClick: () => {
        const r = G.sellBagUpTo(state, 1);
        addLog(`장비 ${r.n}개를 팔았다 (+${G.fmt(r.gold)} 골드)`, 'is-gold', 'coin');
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
          floatText('+' + G.fmt(e.gold), 'float--gold', 'gold');
        }
        if (e.boss) addLog(`보스를 쓰러뜨렸다! +${G.fmt(e.gold)} 골드`, 'is-gold', 'skull');
      } else if (e.type === 'stage') {
        addLog(`스테이지 ${e.stage} 도전!`, 'is-good', 'star');
        if (G.isBossStage(e.stage)) bossIntro();
        else anim(document.querySelector('.ribbon__in'), [{ transform: 'scale(1)' }, { transform: 'scale(1.12)', offset: 0.3 }, { transform: 'scale(1)' }], { duration: 380, easing: 'ease-out' });
      } else if (e.type === 'levelup') {
        addLog(`레벨 ${e.level} 달성!`, 'is-good', 'arrowup');
        levelUpFx();
      } else if (e.type === 'promoReady') {
        addLog(`${e.stage === 'base' ? '1차' : '2차'} 전직이 가능해요! '전직' 메뉴를 확인하세요`, 'is-gold', 'cap');
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
        if (e.action !== 'sold' || it.r >= 2) floatText(`${R.name} ${name}`, 'float--drop', 'center', R.color);
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
    setText('biomeName', BIOMES[biome]);
    setText('stageLabel', boss ? `BOSS ${s.stage}` : `STAGE ${s.stage}`);
    renderPips(s);
    $('downBanner').hidden = s.downT <= 0;

    const striking = s.downT <= 0;
    $('heroBox').classList.toggle('is-striking', striking);
    const dur = Math.max(0.3, Math.min(1.4, 1 / G.attacksPerSec(s))).toFixed(2) + 's';
    if (cache.dur !== dur) { cache.dur = dur; $('heroBox').style.setProperty('--atk', dur); }

    const mon = G.monsterInfo(s.stage);
    const monKey = mon.kind + '|' + mon.biome + '|' + mon.boss;
    if (monKey !== lastMonster) {
      lastMonster = monKey;
      $('monster').innerHTML = A.monster(mon.kind, mon.biome, mon.boss);
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
      ? `지금 환생하면 왕의 증표 ${gain}개를 얻어요. 증표 1개당 공격력·골드가 영구히 +${Math.round(G.TOKEN_BONUS * 100)}%라서 보너스가 +${Math.round((G.tokenMult(s) - 1) * 100)}% → +${Math.round(G.TOKEN_BONUS * 100 * (s.tokens + gain))}%가 돼요. 골드·레벨·강화·스테이지·직업은 처음부터 다시 시작하고, 직업 도감은 그대로 남아요. 증표는 '상점'에서 영구 강화를 사는 데 쓸 수 있어요.`
      : `스테이지 ${G.PRESTIGE_MIN_STAGE}에 도달하면 환생할 수 있어요. 환생하면 왕의 증표를 얻어 영구히 강해지고, 다른 직업으로 다시 시작해 볼 수 있어요.`);

    // 메뉴 알림 점
    const dots = document.querySelectorAll('.tabnav__btn .dot');
    const want = [anyBuy && currentTab !== 'upgrade', gearNew.size > 0 && currentTab !== 'gear', G.promoStage(s) !== null && currentTab !== 'class', gain > 0 && currentTab !== 'prestige',
      G.PERK_KEYS.some((id) => G.canBuyPerk(s, id)) && currentTab !== 'shop'];
    dots.forEach((d, i) => { if (d.hidden === want[i]) d.hidden = !want[i]; });
  }

  // ---- 공격 (화면 누르기) ----
  function attack(px, py) {
    const r = G.clickAttack(state);
    if (r.dmg > 0) {
      floatText(G.fmt(r.dmg), 'float--tap', 'enemy');
      const contact = heroLunge(0.3);
      monsterHit(true, contact);
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
          writeSave();
          render();
          goTab('class');
        } },
      ]);
  });

  $('resetBtn').addEventListener('click', () => {
    openModal('처음부터 다시 시작할까요?', '모든 진행 상황이 지워져요.<br><small>되돌릴 수 없어요.</small>', [
      { text: '취소' },
      { text: '지우고 시작', cls: 'btn--blue', onClick: () => {
        clearSave();
        state = G.createState(Date.now());
        logs.length = 0;
        lastLook = '';
        lastMonster = '';
        addLog('새로운 고블린이 태어났다!', 'is-good', 'sword');
        writeSave();
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
        if (comp > 0 && state.downT <= 0) floatText('-' + G.fmt(comp), 'float--comp', 'comp');
      }
    }
    render();
  }
  setInterval(frame, 100);

  // 자동 저장
  setInterval(writeSave, 5000);
  document.addEventListener('visibilitychange', () => { if (document.hidden) writeSave(); });
  window.addEventListener('pagehide', writeSave);
})();
