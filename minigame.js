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

  // ---- 일일: 두더지 잡기 ----
  function playMole(container, done) {
    const HOLES = 6, DURATION = 10000, SPAWN_MS = 650, UP_MS = 750;
    container.innerHTML =
      `<div class="mg__desc">몬스터가 나오면 바로 탭! <b class="mg__gold">황금</b>은 +2, <b class="mg__bad">해골</b>은 누르면 -1</div>
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
      const roll = Math.random();
      const type = roll < 0.18 ? 'trap' : roll < 0.32 ? 'gold' : 'mob';   // 해골 함정 18% · 황금 몬스터 14%
      const kind = kinds[Math.floor(Math.random() * kinds.length)];
      hole.querySelector('.mg__hole-in').innerHTML = type === 'trap' ? A.icon('skull') : A.monster(kind, 0, false, 0);
      hole.classList.add('is-up');
      hole.classList.toggle('is-gold', type === 'gold');
      hole.classList.toggle('is-trap', type === 'trap');
      const t = setTimeout(() => hide(hole), type === 'gold' ? UP_MS * 0.7 : UP_MS);   // 황금은 빨리 숨는다
      live.set(hole, { t, type });
    }
    function hide(hole) {
      const l = live.get(hole);
      if (l) clearTimeout(l.t);
      live.delete(hole);
      hole.classList.remove('is-up', 'is-gold', 'is-trap');
      hole.querySelector('.mg__hole-in').innerHTML = '';
    }
    function pop(hole, text, cls) {
      const el = document.createElement('b');
      el.className = 'mg__pop ' + cls;
      el.textContent = text;
      hole.appendChild(el);
      const a = el.animate([{ transform: 'translate(-50%, 0)', opacity: 1 }, { transform: 'translate(-50%, -26px)', opacity: 0 }], { duration: 520, easing: 'ease-out' });
      a.onfinish = () => el.remove();
    }
    function onHit(e) {
      const hole = e.target.closest('.mg__hole');
      if (!hole || !live.has(hole)) return;
      const { type } = live.get(hole);
      hide(hole);
      if (type === 'trap') {
        hits = Math.max(0, hits - 1);
        pop(hole, '-1', 'mg__pop--bad');
        grid.classList.remove('mg__shake'); void grid.offsetWidth; grid.classList.add('mg__shake');
        container.classList.add('mg__flash-bad'); setTimeout(() => container.classList.remove('mg__flash-bad'), 200);
      } else {
        const v = type === 'gold' ? 2 : 1;
        hits += v;
        pop(hole, '+' + v, type === 'gold' ? 'mg__pop--gold' : '');
        const r = hole.getBoundingClientRect(), g = grid.getBoundingClientRect();
        burst(grid, ((r.left + r.width / 2 - g.left) / g.width) * 100, ((r.top + r.height / 2 - g.top) / g.height) * 100, type === 'gold' ? '#ffc93a' : '#6fe06a', type === 'gold' ? 10 : 6);
      }
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
      for (const l of live.values()) clearTimeout(l.t);
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
    const track = container.querySelector('#mgTrack');
    function onTap(auto) {
      if (resolved) return;
      resolved = true;
      clearTimeout(roundTimer);
      const r = auto ? 'miss' : judge(posOf(performance.now() - roundStart));
      results.push(r);
      cursor.classList.add('mg__cursor--' + r);
      if (r === 'crit') { burst(track, parseFloat(cursor.style.left), 50, '#6fe06a', 10); container.classList.add('mg__flash-good'); }
      else if (r === 'hit') { burst(track, parseFloat(cursor.style.left), 50, '#ffd479', 5); }
      else { container.classList.add('mg__flash-bad'); }
      setTimeout(() => { cursor.classList.remove('mg__cursor--crit', 'mg__cursor--hit', 'mg__cursor--miss'); container.classList.remove('mg__flash-good', 'mg__flash-bad'); nextRound(); }, 260);
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
    const lane = container.querySelector('#mgLane');
    function resolve(success) {
      if (resolved) return;
      resolved = true;
      clearTimeout(roundTimer);
      combo = success ? combo + 1 : 0;
      comboEl.textContent = combo;
      comboEl.classList.toggle('mg__combo--hot', combo >= 3);
      results.push(success);
      bolt.classList.add(success ? 'is-parried' : 'is-missed');
      if (success) { burst(lane, 82, 50, '#6fe0c0', 10); container.classList.add('mg__flash-good'); }
      else { lane.classList.add('mg__shake'); container.classList.add('mg__flash-bad'); }
      setTimeout(() => { bolt.classList.remove('is-parried', 'is-missed'); lane.classList.remove('mg__shake'); container.classList.remove('mg__flash-good', 'mg__flash-bad'); nextRound(); }, 260);
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

  function play(period, container, done) {
    container.innerHTML = '';
    if (period === 'daily') return playMole(container, done);
    if (period === 'weekly') return playGauge(container, done);
    return playParry(container, done);
  }

  root.Mini = { play, fight };
})(typeof window !== 'undefined' ? window : globalThis);
