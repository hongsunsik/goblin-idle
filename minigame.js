// 고블린 키우기 - 던전 미니게임 (화면·손가락 조작만 담당. 점수→보너스 계산은 game.js의 moleBonus/gaugeBonus/parryBonus)
// 일일=두더지 잡기, 주간=타이밍 게이지, 월간=패턴 회피+반격. 결과 bonus(0~0.5)는 던전 피해 예산을 그만큼 늘려준다.
(function (root) {
  const G = root.Game;
  const A = root.Art;

  function skipBtn(onSkip) {
    return `<button class="btn btn--gray mg__skip" id="mgSkip" type="button">건너뛰기</button>`;
  }

  // ---- 일일: 두더지 잡기 ----
  function playMole(container, done) {
    const HOLES = 6, DURATION = 10000, SPAWN_MS = 650, UP_MS = 750;
    container.innerHTML =
      `<div class="mg__desc">몬스터가 나오면 바로 탭!</div>
      <div class="mg__timerbar"><i id="mgBar"></i></div>
      <div class="mg__grid" id="mgGrid">${Array.from({ length: HOLES }, (_, i) => `<div class="mg__hole"><div class="mg__hole-in"></div></div>`).join('')}</div>
      <div class="mg__score">적중 <b id="mgScore">0</b></div>
      ${skipBtn()}`;
    const grid = container.querySelector('#mgGrid');
    const scoreEl = container.querySelector('#mgScore');
    const kinds = A.MONSTER_KINDS;
    let hits = 0;
    const live = new Map();
    function spawn() {
      const empty = [...grid.children].filter((h) => !live.has(h));
      if (!empty.length) return;
      const hole = empty[Math.floor(Math.random() * empty.length)];
      const kind = kinds[Math.floor(Math.random() * kinds.length)];
      hole.querySelector('.mg__hole-in').innerHTML = A.monster(kind, 0, false, 0);
      hole.classList.add('is-up');
      const t = setTimeout(() => hide(hole), UP_MS);
      live.set(hole, t);
    }
    function hide(hole) {
      clearTimeout(live.get(hole));
      live.delete(hole);
      hole.classList.remove('is-up');
      hole.querySelector('.mg__hole-in').innerHTML = '';
    }
    function onHit(e) {
      const hole = e.target.closest('.mg__hole');
      if (!hole || !live.has(hole)) return;
      hide(hole);
      hits += 1;
      scoreEl.textContent = hits;
      hole.animate([{ transform: 'scale(1)' }, { transform: 'scale(0.85)' }, { transform: 'scale(1)' }], { duration: 160 });
    }
    grid.addEventListener('pointerdown', onHit);
    const spawnTimer = setInterval(spawn, SPAWN_MS);
    spawn();
    container.querySelector('#mgBar').animate([{ transform: 'scaleX(1)' }, { transform: 'scaleX(0)' }], { duration: DURATION, easing: 'linear', fill: 'forwards' });
    let endTimer;
    function finish(skipped) {
      clearTimeout(endTimer);
      clearInterval(spawnTimer);
      for (const h of live.keys()) clearTimeout(live.get(h));
      grid.removeEventListener('pointerdown', onHit);
      done(skipped ? 0 : G.moleBonus(hits), { hits, skipped });
    }
    endTimer = setTimeout(() => finish(false), DURATION);
    container.querySelector('#mgSkip').addEventListener('click', () => finish(true));
  }

  // ---- 주간: 타이밍 게이지 ----
  function playGauge(container, done) {
    const ROUNDS = 5, ROUND_MS = 1700, ZONE_CENTER = 0.5, ZONE_W = 0.24, CRIT_W = 0.1;
    container.innerHTML =
      `<div class="mg__desc">막대가 가운데 노란 구간에 왔을 때 탭!</div>
      <div class="mg__round">라운드 <b id="mgRound">1</b>/${ROUNDS}</div>
      <div class="mg__track" id="mgTrack">
        <div class="mg__zone" style="left:${(ZONE_CENTER - ZONE_W / 2) * 100}%;width:${ZONE_W * 100}%"></div>
        <div class="mg__zone mg__zone--crit" style="left:${(ZONE_CENTER - CRIT_W / 2) * 100}%;width:${CRIT_W * 100}%"></div>
        <div class="mg__cursor" id="mgCursor"></div>
      </div>
      <button class="btn btn--gold mg__tap" id="mgTap" type="button">탭!</button>
      ${skipBtn()}`;
    const cursor = container.querySelector('#mgCursor');
    const roundEl = container.querySelector('#mgRound');
    let round = 0, results = [], roundStart = 0, raf, roundTimer, resolved = true;
    const posOf = (t) => (Math.sin(t / 260) + 1) / 2;
    function tick() {
      const p = posOf(performance.now() - roundStart);
      cursor.style.left = (p * 100) + '%';
      raf = requestAnimationFrame(tick);
    }
    function judge(p) {
      const d = Math.abs(p - ZONE_CENTER);
      if (d <= CRIT_W / 2) return 'crit';
      if (d <= ZONE_W / 2) return 'hit';
      return 'miss';
    }
    function nextRound() {
      if (round >= ROUNDS) return finish(false);
      round += 1;
      resolved = false;
      roundEl.textContent = round;
      roundStart = performance.now();
      cancelAnimationFrame(raf);
      tick();
      roundTimer = setTimeout(() => onTap(true), ROUND_MS);
    }
    function onTap(auto) {
      if (resolved) return;
      resolved = true;
      clearTimeout(roundTimer);
      const r = auto ? 'miss' : judge(posOf(performance.now() - roundStart));
      results.push(r);
      cursor.classList.add('mg__cursor--' + r);
      setTimeout(() => { cursor.classList.remove('mg__cursor--crit', 'mg__cursor--hit', 'mg__cursor--miss'); nextRound(); }, 260);
    }
    container.querySelector('#mgTap').addEventListener('click', () => onTap(false));
    function finish(skipped) {
      cancelAnimationFrame(raf);
      clearTimeout(roundTimer);
      done(skipped ? 0 : G.gaugeBonus(results), { results, skipped });
    }
    container.querySelector('#mgSkip').addEventListener('click', () => finish(true));
    nextRound();
  }

  // ---- 월간: 패턴 회피+반격 ----
  function playParry(container, done) {
    const ROUNDS = 8, TRAVEL_MS = 950, WINDOW_MS = 260;
    container.innerHTML =
      `<div class="mg__desc">번개가 방패에 닿는 순간 반격!</div>
      <div class="mg__round">패턴 <b id="mgRound">1</b>/${ROUNDS} · 콤보 <b id="mgCombo">0</b></div>
      <div class="mg__lane" id="mgLane"><div class="mg__bolt" id="mgBolt">${A.icon('bolt')}</div><div class="mg__guard">${A.icon('shield')}</div></div>
      <button class="btn btn--gold mg__tap" id="mgTap" type="button">반격!</button>
      ${skipBtn()}`;
    const bolt = container.querySelector('#mgBolt');
    const roundEl = container.querySelector('#mgRound'), comboEl = container.querySelector('#mgCombo');
    let round = 0, results = [], combo = 0, roundStart = 0, roundTimer, resolved = true;
    function nextRound() {
      if (round >= ROUNDS) return finish(false);
      round += 1;
      resolved = false;
      roundEl.textContent = round;
      bolt.getAnimations().forEach((a) => a.cancel());
      bolt.style.left = '4%';
      roundStart = performance.now();
      bolt.animate([{ left: '4%' }, { left: '82%' }], { duration: TRAVEL_MS, easing: 'linear', fill: 'forwards' });
      roundTimer = setTimeout(() => resolve(false), TRAVEL_MS + 150);
    }
    function resolve(success) {
      if (resolved) return;
      resolved = true;
      clearTimeout(roundTimer);
      combo = success ? combo + 1 : 0;
      comboEl.textContent = combo;
      results.push(success);
      bolt.classList.add(success ? 'is-parried' : 'is-missed');
      setTimeout(() => { bolt.classList.remove('is-parried', 'is-missed'); nextRound(); }, 260);
    }
    container.querySelector('#mgTap').addEventListener('click', () => {
      if (resolved) return;
      const t = performance.now() - roundStart;
      resolve(t >= TRAVEL_MS - WINDOW_MS && t <= TRAVEL_MS + WINDOW_MS / 2);
    });
    function finish(skipped) {
      clearTimeout(roundTimer);
      done(skipped ? 0 : G.parryBonus(results), { results, skipped });
    }
    container.querySelector('#mgSkip').addEventListener('click', () => finish(true));
    nextRound();
  }

  function play(period, container, done) {
    container.innerHTML = '';
    if (period === 'daily') return playMole(container, done);
    if (period === 'weekly') return playGauge(container, done);
    return playParry(container, done);
  }

  root.Mini = { play };
})(typeof window !== 'undefined' ? window : globalThis);
