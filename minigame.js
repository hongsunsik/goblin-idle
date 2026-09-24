// 고블린 키우기 - 던전 미니게임 (화면·손가락 조작만 담당. 점수→보너스 계산은 game.js의 moleBonus/gaugeBonus/parryBonus)
// 일일=두더지 잡기, 주간=타이밍 게이지, 월간=패턴 회피+반격. 결과 bonus(0~0.5)는 던전 피해 예산을 그만큼 늘려준다.
(function (root) {
  const G = root.Game;
  const A = root.Art;

  function skipBtn(onSkip) {
    return `<button class="btn btn--gray mg__skip" id="mgSkip" type="button">건너뛰기</button>`;
  }

  // 화면 어딘가(el 기준 상대 위치 cx%,cy%)에서 작은 파티클이 사방으로 흩어지는 연출. 그림 없이 CSS만으로 낸다.
  function burst(host, cx, cy, color, n) {
    for (let i = 0; i < (n || 8); i++) {
      const p = document.createElement('i');
      p.className = 'mg__spark';
      const ang = (Math.PI * 2 * i) / (n || 8) + Math.random() * 0.5;
      const dist = 26 + Math.random() * 18;
      p.style.left = cx + '%'; p.style.top = cy + '%'; p.style.background = color;
      host.appendChild(p);
      const anim = p.animate([
        { transform: 'translate(-50%,-50%) scale(1)', opacity: 1 },
        { transform: `translate(${Math.cos(ang) * dist - 50}%,${Math.sin(ang) * dist - 50}%) scale(0)`, opacity: 0 },
      ], { duration: 420 + Math.random() * 160, easing: 'ease-out' });
      anim.onfinish = () => p.remove();
    }
  }

  // ---- 공용: 효과음 · 카운트다운 · 결과 화면 ----
  const snd = (name, arg) => { if (root.GoblinAudio && root.GoblinAudio.sfxEvent) root.GoblinAudio.sfxEvent(name, arg); };
  // 게임 판을 먼저 그려 두고 그 위에 3·2·1·시작! 을 띄운다. 건너뛰기는 카운트다운 중에도 된다.
  function countdown(container, start) {
    const ov = document.createElement('div');
    ov.className = 'mg__count';
    container.appendChild(ov);
    let n = 3, stopped = false;
    const step = () => {
      if (stopped) return;
      ov.textContent = n > 0 ? String(n) : '시작!';
      ov.classList.toggle('is-go', n === 0);
      ov.animate([{ transform: 'scale(1.6)', opacity: 0 }, { transform: 'scale(1)', opacity: 1, offset: 0.3 }, { transform: 'scale(0.9)', opacity: n > 0 ? 1 : 0 }], { duration: 560, fill: 'forwards' });
      snd(n > 0 ? 'mgCount' : 'mgGo');
      if (n === 0) { setTimeout(() => { ov.remove(); if (!stopped) start(); }, 450); return; }
      n -= 1;
      setTimeout(step, 560);
    };
    step();
    return () => { stopped = true; ov.remove(); };
  }
  const GRADES = [[0.9, 'S', '#ffd44a'], [0.65, 'A', '#6fe06a'], [0.35, 'B', '#5aa8ff'], [0, 'C', '#b9c2d0']];
  // 결과 화면: 등급(S/A/B/C)과 피해 예산 보너스를 크게 보여 준 뒤 이어서 전투로 넘어간다
  function showResult(container, bonus, cap, detail, next) {
    const ratio = cap > 0 ? bonus / cap : 0, [, grade, color] = GRADES.find(([min]) => ratio >= min);
    container.innerHTML = `<div class="mg__result"><div class="mg__grade" style="color:${color}">${grade}</div>` +
      `<div class="mg__resline">피해 예산 <b>+${Math.round(bonus * 100)}%</b> <small>(최대 +${Math.round(cap * 100)}%)</small></div>` +
      `<div class="mg__resdetail">${detail}</div><button class="btn btn--gold mg__tap" id="mgNext" type="button">전투 시작!</button></div>`;
    const g = container.querySelector('.mg__grade');
    g.animate([{ transform: 'scale(2.4) rotate(-12deg)', opacity: 0 }, { transform: 'scale(0.9) rotate(4deg)', opacity: 1, offset: 0.6 }, { transform: 'scale(1) rotate(0)', opacity: 1 }], { duration: 520, easing: 'ease-out' });
    burst(container.querySelector('.mg__result'), 50, 28, color, grade === 'S' ? 18 : 10);
    snd('mgResult', grade);
    let gone = false;
    const go = () => { if (gone) return; gone = true; next(); };
    container.querySelector('#mgNext').addEventListener('click', go);
    setTimeout(go, 2600);
  }
  function popText(host, x, y, text, cls) {
    const el = document.createElement('b');
    el.className = 'mg__pop ' + (cls || '');
    el.textContent = text;
    el.style.left = x + '%'; el.style.top = y + '%';
    host.appendChild(el);
    const a = el.animate([{ transform: 'translate(-50%, 0) scale(0.7)', opacity: 1 }, { transform: 'translate(-50%, -10px) scale(1.15)', opacity: 1, offset: 0.3 }, { transform: 'translate(-50%, -30px) scale(1)', opacity: 0 }], { duration: 620, easing: 'ease-out' });
    a.onfinish = () => el.remove();
  }

  // ---- 일일: 두더지 잡기 ----
  // 흙더미 구멍에서 몬스터가 튀어 오른다. 황금은 +2(빨리 숨음), 해골 함정은 누르면 -1. 연속으로 맞히면 콤보(3콤보마다 +1 보너스 적중).
  function playMole(container, done) {
    const HOLES = 9, DURATION = 12000, UP_MS = 800;
    container.innerHTML =
      `<div class="mg__desc">몬스터가 나오면 바로 탭! <b class="mg__gold">황금</b>은 +2, <b class="mg__bad">해골</b>은 누르면 -1 · 연속 적중하면 콤보</div>
      <div class="mg__timerbar"><i id="mgBar"></i></div>
      <div class="mg__grid mg__grid--3" id="mgGrid">${Array.from({ length: HOLES }, () => `<div class="mg__hole"><div class="mg__mound"></div><div class="mg__hole-in"></div></div>`).join('')}</div>
      <div class="mg__score">적중 <b id="mgScore">0</b> <span class="mg__combo" id="mgCombo"></span></div>
      ${skipBtn()}`;
    const grid = container.querySelector('#mgGrid'), scoreEl = container.querySelector('#mgScore'), comboEl = container.querySelector('#mgCombo');
    const kinds = A.MONSTER_KINDS;
    let hits = 0, combo = 0, best = 0, spawnTimer = null, endTimer = null, running = false, t0 = 0;
    const live = new Map();
    function spawn() {
      const empty = [...grid.children].filter((h) => !live.has(h));
      if (!empty.length) return;
      const hole = empty[Math.floor(Math.random() * empty.length)];
      const roll = Math.random();
      const type = roll < 0.16 ? 'trap' : roll < 0.3 ? 'gold' : 'mob';
      const kind = kinds[Math.floor(Math.random() * kinds.length)];
      const inner = hole.querySelector('.mg__hole-in');
      inner.innerHTML = type === 'trap' ? A.icon('skull') : A.monster(kind, 0, false, 0);
      hole.classList.add('is-up');
      hole.classList.toggle('is-gold', type === 'gold');
      hole.classList.toggle('is-trap', type === 'trap');
      inner.animate([{ transform: 'translateY(100%) scale(0.8, 1.2)' }, { transform: 'translateY(-8%) scale(1.1, 0.9)', offset: 0.6 }, { transform: 'translateY(0) scale(1, 1)' }], { duration: 220, easing: 'ease-out' });
      const t = setTimeout(() => { if (type !== 'trap') { combo = 0; showCombo(); } hide(hole); }, type === 'gold' ? UP_MS * 0.7 : UP_MS);
      live.set(hole, { t, type });
    }
    function hide(hole) {
      const l = live.get(hole);
      if (l) clearTimeout(l.t);
      live.delete(hole);
      hole.classList.remove('is-up', 'is-gold', 'is-trap');
      hole.querySelector('.mg__hole-in').innerHTML = '';
    }
    function showCombo() {
      comboEl.textContent = combo >= 2 ? `${combo}콤보!` : '';
      comboEl.classList.toggle('is-hot', combo >= 5);
    }
    function onHit(e) {
      if (!running) return;
      const hole = e.target.closest('.mg__hole');
      if (!hole || !live.has(hole)) return;
      const { type } = live.get(hole);
      const r = hole.getBoundingClientRect(), g = grid.getBoundingClientRect();
      const cx = ((r.left + r.width / 2 - g.left) / g.width) * 100, cy = ((r.top + r.height / 3 - g.top) / g.height) * 100;
      hide(hole);
      if (type === 'trap') {
        hits = Math.max(0, hits - 1); combo = 0;
        popText(grid, cx, cy, '-1', 'mg__pop--bad');
        grid.classList.remove('mg__shake'); void grid.offsetWidth; grid.classList.add('mg__shake');
        container.classList.add('mg__flash-bad'); setTimeout(() => container.classList.remove('mg__flash-bad'), 200);
        snd('mgMiss');
      } else {
        combo += 1; best = Math.max(best, combo);
        let v = type === 'gold' ? 2 : 1;
        if (combo % 3 === 0) v += 1;   // 3콤보마다 한 번 더
        hits += v;
        popText(grid, cx, cy, '+' + v, type === 'gold' ? 'mg__pop--gold' : '');
        burst(grid, cx, cy, type === 'gold' ? '#ffc93a' : '#6fe06a', type === 'gold' ? 12 : 7);
        snd(type === 'gold' || combo % 3 === 0 ? 'mgPerfect' : 'mgHit', combo);
      }
      scoreEl.textContent = hits;
      scoreEl.animate([{ transform: 'scale(1.4)' }, { transform: 'scale(1)' }], { duration: 180 });
      showCombo();
      hole.animate([{ transform: 'scale(1)' }, { transform: 'scale(0.88)' }, { transform: 'scale(1)' }], { duration: 160 });
    }
    grid.addEventListener('pointerdown', onHit);
    function loop() {   // 시간이 갈수록 조금씩 빨리 나온다 (650ms → 430ms)
      if (!running) return;
      spawn();
      const p = Math.min(1, (performance.now() - t0) / DURATION);
      spawnTimer = setTimeout(loop, 650 - 220 * p);
    }
    const cancelCount = countdown(container, () => {
      running = true; t0 = performance.now();
      container.querySelector('#mgBar').animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: DURATION, easing: 'linear', fill: 'forwards' });
      loop();
      endTimer = setTimeout(() => finish(false), DURATION);
    });
    function finish(skipped) {
      if (!running && !skipped) return;
      running = false;
      cancelCount(); clearTimeout(endTimer); clearTimeout(spawnTimer);
      for (const l of live.values()) clearTimeout(l.t);
      grid.removeEventListener('pointerdown', onHit);
      const bonus = skipped ? 0 : G.moleBonus(hits);
      if (skipped) { done(0, { hits, skipped }); return; }
      showResult(container, bonus, G.MG_BONUS_CAP.daily, `적중 <b>${hits}</b> · 최고 콤보 <b>${best}</b>`, () => done(bonus, { hits, skipped }));
    }
    container.querySelector('#mgSkip').addEventListener('click', () => finish(true));
  }

  // ---- 주간: 타이밍 게이지 ----
  // 라운드마다 막대가 빨라지고 노란 구간 위치가 바뀐다. 초록(가운데)이면 '완벽!'.
  function playGauge(container, done) {
    const ROUNDS = 5, ROUND_MS = 1900, ZONE_W = 0.26, CRIT_W = 0.1;
    container.innerHTML =
      `<div class="mg__desc">막대가 <b class="mg__gold">노란 구간</b>에 왔을 때 탭! 가운데 <b style="color:var(--green)">초록</b>이면 완벽</div>
      <div class="mg__round">라운드 <b id="mgRound">1</b>/${ROUNDS} <span class="mg__judge" id="mgJudge"></span></div>
      <div class="mg__track" id="mgTrack">
        <div class="mg__zone" id="mgZone"></div><div class="mg__zone mg__zone--crit" id="mgCrit"></div>
        <div class="mg__cursor" id="mgCursor"></div>
      </div>
      <div class="mg__dots" id="mgDots">${Array.from({ length: ROUNDS }, () => '<i></i>').join('')}</div>
      <button class="btn btn--gold mg__tap" id="mgTap" type="button">탭!</button>
      ${skipBtn()}`;
    const cursor = container.querySelector('#mgCursor'), roundEl = container.querySelector('#mgRound'), judgeEl = container.querySelector('#mgJudge');
    const zone = container.querySelector('#mgZone'), crit = container.querySelector('#mgCrit'), dots = container.querySelector('#mgDots').children;
    const track = container.querySelector('#mgTrack');
    let round = 0, results = [], roundStart = 0, raf, roundTimer, resolved = true, center = 0.5, speed = 260, over = false;
    const posOf = (t) => (Math.sin(t / speed) + 1) / 2;
    const place = () => {
      zone.style.left = ((center - ZONE_W / 2) * 100) + '%'; zone.style.width = (ZONE_W * 100) + '%';
      crit.style.left = ((center - CRIT_W / 2) * 100) + '%'; crit.style.width = (CRIT_W * 100) + '%';
    };
    place();
    function tick() { cursor.style.left = (posOf(performance.now() - roundStart) * 100) + '%'; raf = requestAnimationFrame(tick); }
    function judge(p) { const d = Math.abs(p - center); return d <= CRIT_W / 2 ? 'crit' : d <= ZONE_W / 2 ? 'hit' : 'miss'; }
    function nextRound() {
      if (over) return;
      if (round >= ROUNDS) return finish(false);
      round += 1; resolved = false;
      roundEl.textContent = round;
      speed = 260 - 28 * (round - 1);                        // 라운드마다 빨라진다
      center = round === 1 ? 0.5 : 0.25 + Math.random() * 0.5;   // 노란 구간 위치가 바뀐다
      place();
      roundStart = performance.now();
      cancelAnimationFrame(raf); tick();
      roundTimer = setTimeout(() => onTap(true), ROUND_MS);
    }
    function onTap(auto) {
      if (resolved || over) return;
      resolved = true; clearTimeout(roundTimer);
      const p = posOf(performance.now() - roundStart);
      const r = auto ? 'miss' : judge(p);
      results.push(r);
      dots[round - 1].className = 'is-' + r;
      cursor.classList.add('mg__cursor--' + r);
      judgeEl.textContent = r === 'crit' ? '완벽!' : r === 'hit' ? '좋아!' : '빗나감';
      judgeEl.className = 'mg__judge is-' + r;
      judgeEl.animate([{ transform: 'scale(1.5)' }, { transform: 'scale(1)' }], { duration: 220 });
      if (r === 'crit') { burst(track, p * 100, 50, '#6fe06a', 14); container.classList.add('mg__flash-good'); snd('mgPerfect', round); }
      else if (r === 'hit') { burst(track, p * 100, 50, '#ffd479', 7); snd('mgHit', round); }
      else { container.classList.add('mg__flash-bad'); track.classList.remove('mg__shake'); void track.offsetWidth; track.classList.add('mg__shake'); snd('mgMiss'); }
      setTimeout(() => { cursor.classList.remove('mg__cursor--crit', 'mg__cursor--hit', 'mg__cursor--miss'); container.classList.remove('mg__flash-good', 'mg__flash-bad'); nextRound(); }, 420);
    }
    container.querySelector('#mgTap').addEventListener('click', () => onTap(false));
    track.addEventListener('pointerdown', () => onTap(false));   // 막대를 직접 눌러도 된다
    const cancelCount = countdown(container, nextRound);
    function finish(skipped) {
      if (over) return;
      over = true;
      cancelCount(); cancelAnimationFrame(raf); clearTimeout(roundTimer);
      if (skipped) { done(0, { results, skipped }); return; }
      const bonus = G.gaugeBonus(results);
      const n = (k) => results.filter((x) => x === k).length;
      showResult(container, bonus, G.MG_BONUS_CAP.weekly, `완벽 <b>${n('crit')}</b> · 좋아 <b>${n('hit')}</b> · 빗나감 <b>${n('miss')}</b>`, () => done(bonus, { results, skipped }));
    }
    container.querySelector('#mgSkip').addEventListener('click', () => finish(true));
  }

  // ---- 월간: 패턴 반격 ----
  // 보스가 번개를 던진다. 방패에 닿는 순간 반격! 닿기 직전에는 방패가 빛나 알려 주고, 뒤로 갈수록 빨라지며 가끔 두 번 연속 온다.
  function playParry(container, done, opts) {
    const ROUNDS = 8, WINDOW_MS = 260;
    const art = (opts && opts.bossArt) || A.icon('skull');
    container.innerHTML =
      `<div class="mg__desc">번개가 <b style="color:#6fe0c0">방패</b>에 닿는 순간 반격! 방패가 빛나면 곧 닿아요</div>
      <div class="mg__round">패턴 <b id="mgRound">1</b>/${ROUNDS} · 콤보 <b id="mgCombo">0</b></div>
      <div class="mg__lane" id="mgLane"><div class="mg__boss">${art}</div><div class="mg__bolt" id="mgBolt">${A.icon('bolt')}</div><div class="mg__guard" id="mgGuard">${A.icon('shield')}</div></div>
      <button class="btn btn--gold mg__tap" id="mgTap" type="button">반격!</button>
      ${skipBtn()}`;
    const bolt = container.querySelector('#mgBolt'), guard = container.querySelector('#mgGuard'), lane = container.querySelector('#mgLane');
    const roundEl = container.querySelector('#mgRound'), comboEl = container.querySelector('#mgCombo');
    let round = 0, results = [], combo = 0, best = 0, roundStart = 0, travel = 1000, roundTimer, warnTimer, resolved = true, over = false;
    function nextRound() {
      if (over) return;
      if (round >= ROUNDS) return finish(false);
      round += 1; resolved = false;
      roundEl.textContent = round;
      travel = Math.max(620, 1050 - 60 * round) * (Math.random() < 0.25 && round > 2 ? 0.8 : 1);   // 뒤로 갈수록, 가끔 더 빨리
      bolt.getAnimations().forEach((a) => a.cancel());
      bolt.classList.remove('is-parried', 'is-missed');
      roundStart = performance.now();
      bolt.animate([{ left: '16%', transform: 'scale(0.7) rotate(0deg)' }, { left: '80%', transform: 'scale(1.15) rotate(20deg)' }], { duration: travel, easing: 'cubic-bezier(0.4, 0, 0.9, 0.6)', fill: 'forwards' });
      warnTimer = setTimeout(() => guard.classList.add('is-warn'), travel - WINDOW_MS);
      roundTimer = setTimeout(() => resolve(false), travel + 160);
    }
    function resolve(success) {
      if (resolved || over) return;
      resolved = true; clearTimeout(roundTimer); clearTimeout(warnTimer);
      guard.classList.remove('is-warn');
      combo = success ? combo + 1 : 0; best = Math.max(best, combo);
      comboEl.textContent = combo;
      comboEl.classList.toggle('mg__combo--hot', combo >= 3);
      results.push(success);
      bolt.classList.add(success ? 'is-parried' : 'is-missed');
      if (success) {
        burst(lane, 80, 50, '#6fe0c0', 10 + combo * 2);
        popText(lane, 70, 10, combo >= 3 ? `${combo}콤보!` : '반격!', 'mg__pop--good');
        bolt.animate([{ left: '80%' }, { left: '18%', opacity: 0.2 }], { duration: 240, fill: 'forwards' });   // 번개를 되받아친다
        container.classList.add('mg__flash-good'); snd(combo >= 3 ? 'mgPerfect' : 'mgHit', combo);
      } else {
        lane.classList.add('mg__shake'); container.classList.add('mg__flash-bad'); snd('mgMiss');
      }
      setTimeout(() => { lane.classList.remove('mg__shake'); container.classList.remove('mg__flash-good', 'mg__flash-bad'); nextRound(); }, 380);
    }
    const tap = () => {
      if (resolved || over) return;
      const t = performance.now() - roundStart;
      resolve(t >= travel - WINDOW_MS && t <= travel + WINDOW_MS / 2);
    };
    container.querySelector('#mgTap').addEventListener('click', tap);
    lane.addEventListener('pointerdown', tap);
    const cancelCount = countdown(container, nextRound);
    function finish(skipped) {
      if (over) return;
      over = true;
      cancelCount(); clearTimeout(roundTimer); clearTimeout(warnTimer);
      if (skipped) { done(0, { results, skipped }); return; }
      const bonus = G.parryBonus(results);
      showResult(container, bonus, G.MG_BONUS_CAP.monthly, `반격 성공 <b>${results.filter(Boolean).length}</b>/${ROUNDS} · 최고 콤보 <b>${best}</b>`, () => done(bonus, { results, skipped }));
    }
    container.querySelector('#mgSkip').addEventListener('click', () => finish(true));
  }

  // ---- 던전 전투 연출: 결과(fights)는 이미 계산돼 있고, 보스 체력이 깎이는 모습만 보여 준다 ----
  // fights: [{ name, art(html), hp, dealt, killed, drop?: { color, label } }], budget: 시작 피해 예산, fmt: 숫자 표시 함수
  function fight(container, fights, budget, opts, done) {
    const fast = !!opts.calm;
    const HIT_N = fast ? 4 : 7, HIT_GAP = fast ? 90 : 140, ENTER = fast ? 180 : 380, AFTER = fast ? 260 : 520;
    const fmt = opts.fmt || ((n) => String(Math.round(n)));
    container.innerHTML =
      `<div class="dfight">
        <div class="mg__round">${opts.label || '파동'} <b id="dfWave">1</b>${opts.waves ? '/' + opts.waves : ''}</div>
        <div class="dfight__arena" id="dfArena"><div class="dfight__boss" id="dfBoss"></div><div class="dfight__fx" id="dfFx"></div></div>
        <div class="dfight__name" id="dfName"></div>
        <div class="dfight__bar"><i id="dfHp"></i><span id="dfHpTxt"></span></div>
        <div class="dfight__me"><span>내 공격력</span><div class="dfight__bar dfight__bar--me"><i id="dfBudget"></i></div></div>
        <div class="dfight__log" id="dfLog"></div>
      </div>
      <button class="btn btn--gray mg__skip" id="mgSkip" type="button">결과 바로 보기</button>`;
    const $ = (id) => container.querySelector('#' + id);
    const arena = $('dfArena'), bossEl = $('dfBoss'), fx = $('dfFx'), hpEl = $('dfHp'), hpTxt = $('dfHpTxt'), meEl = $('dfBudget'), logEl = $('dfLog');
    const timers = [];
    let over = false, spent = 0;
    const later = (fn, ms) => timers.push(setTimeout(() => { if (!over) fn(); }, ms));
    function finish() {
      if (over) return;
      over = true;
      timers.forEach(clearTimeout);
      done();
    }
    $('mgSkip').addEventListener('click', finish);
    function dmgNum(n, big) {
      const el = document.createElement('b');
      el.className = 'dfight__dmg' + (big ? ' is-big' : '');
      el.textContent = '-' + fmt(n);
      el.style.left = (30 + Math.random() * 40) + '%';
      el.style.top = (12 + Math.random() * 30) + '%';
      fx.appendChild(el);
      const a = el.animate([{ transform: 'translate(-50%, 0) scale(0.7)', opacity: 1 }, { transform: 'translate(-50%, -8px) scale(1.1)', opacity: 1, offset: 0.25 }, { transform: 'translate(-50%, -30px) scale(1)', opacity: 0 }], { duration: 650, easing: 'ease-out' });
      a.onfinish = () => el.remove();
    }
    function runWave(i) {
      if (i >= fights.length) return later(finish, AFTER + 200);
      const f = fights[i];
      if (opts.freshBudget) { spent = 0; meEl.style.width = '100%'; }   // 무한의 탑: 층마다 예산을 새로 받는다
      $('dfWave').textContent = f.wave || i + 1;
      $('dfName').textContent = f.name;
      bossEl.innerHTML = f.art;
      bossEl.className = 'dfight__boss';
      hpEl.style.width = '100%';
      hpTxt.textContent = fmt(f.hp);
      bossEl.animate([{ transform: 'translateY(-14px) scale(0.85)', opacity: 0 }, { transform: 'translateY(0) scale(1)', opacity: 1 }], { duration: ENTER, easing: 'cubic-bezier(.2,1.4,.4,1)' });
      const per = f.dealt / HIT_N;
      for (let h = 0; h < HIT_N; h++) {
        later(() => {
          const dealt = per * (h + 1), last = h === HIT_N - 1;
          spent += per;
          hpEl.style.width = Math.max(0, (1 - dealt / f.hp) * 100) + '%';
          hpTxt.textContent = fmt(Math.max(0, f.hp - dealt));
          meEl.style.width = Math.max(0, (1 - spent / budget) * 100) + '%';
          dmgNum(per, last && f.killed);
          bossEl.animate([{ transform: 'translateX(0)', filter: 'brightness(1)' }, { transform: 'translateX(6px)', filter: 'brightness(2.2)' }, { transform: 'translateX(-3px)', filter: 'brightness(1)' }, { transform: 'translateX(0)' }], { duration: 160 });
          if (!fast) burst(fx, 35 + Math.random() * 30, 35 + Math.random() * 30, '#ffd479', 4);
        }, ENTER + h * HIT_GAP);
      }
      const end = ENTER + HIT_N * HIT_GAP + 60;
      later(() => {
        const row = document.createElement('div');
        row.className = 'dfight__row ' + (f.killed ? 'is-win' : 'is-lose');
        if (f.killed) {
          burst(fx, 50, 50, '#ffc93a', fast ? 8 : 16);
          arena.classList.remove('mg__shake'); void arena.offsetWidth; arena.classList.add('mg__shake');
          container.classList.add('mg__flash-good');
          bossEl.animate([{ transform: 'scale(1)', opacity: 1, filter: 'brightness(1)' }, { transform: 'scale(1.15)', opacity: 1, filter: 'brightness(3)', offset: 0.3 }, { transform: 'scale(0.6) translateY(20px)', opacity: 0, filter: 'brightness(3)' }], { duration: AFTER, fill: 'forwards' });
          row.innerHTML = `<b>${f.name}</b> 처치!` + (f.drop ? ` <span style="color:${f.drop.color}">${f.drop.label}</span>` : '');
        } else {
          container.classList.add('mg__flash-bad');
          bossEl.classList.add('is-standing');
          row.innerHTML = `<b>${f.name}</b> 남은 체력 ${Math.max(1, Math.round((1 - f.dealt / f.hp) * 100))}% · 공격이 바닥났어요`;
        }
        logEl.appendChild(row);
        later(() => container.classList.remove('mg__flash-good', 'mg__flash-bad'), 220);
        later(() => (f.killed ? runWave(i + 1) : later(finish, AFTER + 400)), AFTER);
      }, end);
    }
    if (!fights.length) { later(finish, 50); return; }
    runWave(0);
  }

  function play(period, container, done, opts) {
    container.innerHTML = '';
    if (period === 'daily') return playMole(container, done, opts);
    if (period === 'weekly') return playGauge(container, done, opts);
    return playParry(container, done, opts);
  }

  root.Mini = { play, fight };
})(typeof window !== 'undefined' ? window : globalThis);
