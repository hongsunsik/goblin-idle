(function () {
  const G = window.Game;
  const SAVE_KEY = 'goblin-idle-save-v1';
  const $ = (id) => document.getElementById(id);

  const NAMES = {
    '🐀': '들쥐', '🦇': '박쥐', '🐍': '독뱀', '🕷️': '거미', '🐺': '늑대', '🐗': '멧돼지', '🧟': '좀비', '👻': '유령',
    '🦂': '전갈 대왕', '🐻': '광폭 곰', '🧌': '트롤', '🐲': '어린 용', '👹': '오거', '💀': '해골 군주',
  };

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
      $('saveInfo').textContent = '자동 저장됨';
    } catch (e) {
      $('saveInfo').textContent = '저장할 수 없어요 (브라우저 설정 확인)';
    }
  }
  function clearSave() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* 무시 */ }
  }

  let state = loadSave() || G.createState(Date.now());

  // ---- 기록 ----
  const logs = [];
  function addLog(text, cls) {
    logs.unshift({ text, cls });
    if (logs.length > 8) logs.pop();
    const ul = $('log');
    ul.innerHTML = '';
    for (const l of logs) {
      const li = document.createElement('li');
      li.textContent = l.text;
      if (l.cls) li.className = l.cls;
      ul.appendChild(li);
    }
  }

  function handleEvents(events) {
    let gold = 0;
    for (const e of events) {
      if (e.type === 'kill') {
        gold += e.gold;
        if (e.boss) addLog(`👹 보스를 쓰러뜨렸다! +${G.fmt(e.gold)} 골드`, 'is-gold');
      } else if (e.type === 'stage') {
        addLog(`⭐ 스테이지 ${e.stage} 도전!`, 'is-good');
      } else if (e.type === 'levelup') {
        addLog(`🆙 레벨 ${e.level} 달성!`, 'is-good');
      } else if (e.type === 'evolve') {
        addLog(`✨ 진화! 이제 ${e.name}`, 'is-good');
      } else if (e.type === 'down') {
        addLog(`😵 쓰러졌다... 스테이지 ${e.to}로 후퇴`, 'is-bad');
      }
    }
    return gold;
  }

  // ---- 화면에 떠오르는 숫자 ----
  const layer = $('floatLayer');
  function floatText(text, cls, side) {
    if (layer.children.length > 14) return;
    const el = document.createElement('div');
    el.className = 'float ' + cls;
    el.textContent = text;
    const base = side === 'gold' ? 42 : 66;
    el.style.left = base + Math.random() * 14 + '%';
    el.style.top = 34 + Math.random() * 16 + '%';
    layer.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  function shake(id) {
    const el = $(id);
    el.classList.remove('shake');
    void el.offsetWidth;   // 애니메이션을 처음부터 다시 시작
    el.classList.add('shake');
  }

  // ---- 강화 목록 (한 번만 만들고 이후에는 값만 갱신) ----
  const upRefs = {};
  function buildUpgrades() {
    const ul = $('upgrades');
    for (const key of G.UPGRADE_KEYS) {
      const u = G.UPGRADES[key];
      const li = document.createElement('li');
      li.className = 'up';
      li.innerHTML =
        '<div><div class="up__name"></div><div class="up__desc"></div></div>' +
        '<button class="up__btn" type="button"></button>';
      const refs = {
        name: li.querySelector('.up__name'),
        desc: li.querySelector('.up__desc'),
        btn: li.querySelector('.up__btn'),
        icon: u.icon,
      };
      refs.btn.addEventListener('click', () => {
        if (G.buy(state, key)) render();
      });
      upRefs[key] = refs;
      ul.appendChild(li);
    }
  }

  // ---- 화면 갱신 ----
  let lastTier = '';
  let lastMonster = '';

  function render() {
    const s = state;
    $('gold').textContent = G.fmt(s.gold);
    $('tokens').textContent = s.tokens;

    // 전투
    const boss = G.isBossStage(s.stage);
    $('arena').classList.toggle('arena--boss', boss);
    $('arena').classList.toggle('is-down', s.downT > 0);
    $('downBanner').hidden = s.downT <= 0;
    $('stageLabel').textContent = boss ? `👹 스테이지 ${s.stage} · 보스` : `스테이지 ${s.stage}`;
    $('stageProgress').textContent = boss ? '보스 1마리' : `${s.killsInStage} / ${G.KILLS_PER_STAGE}`;

    const tier = G.tierOf(s.level);
    if (tier.name !== lastTier) {
      lastTier = tier.name;
      $('goblin').innerHTML = '👺' + (tier.extra ? `<small>${tier.extra}</small>` : '');
      $('goblin').style.setProperty('--scale', tier.scale);
      $('goblinName').textContent = tier.name;
    }
    const emoji = G.monsterEmoji(s.stage);
    if (emoji !== lastMonster) {
      lastMonster = emoji;
      $('monster').textContent = emoji;
      $('monsterName').textContent = NAMES[emoji] || '몬스터';
    }

    const max = G.maxHp(s);
    $('goblinHpBar').style.width = Math.max(0, (s.hp / max) * 100) + '%';
    $('goblinHpText').textContent = `${G.fmt(Math.max(0, s.hp))} / ${G.fmt(max)}`;
    $('monsterHpBar').style.width = Math.max(0, (s.monsterHp / s.monsterMax) * 100) + '%';
    $('monsterHpText').textContent = `${G.fmt(Math.max(0, s.monsterHp))} / ${G.fmt(s.monsterMax)}`;
    $('hitBtn').disabled = s.downT > 0;

    // 능력치
    const need = G.expNeeded(s);
    $('level').textContent = s.level;
    $('expText').textContent = `경험치 ${G.fmt(s.exp)} / ${G.fmt(need)}`;
    $('expBar').style.width = Math.min(100, (s.exp / need) * 100) + '%';
    $('statDmg').textContent = G.fmt(G.hitDmg(s));
    $('statAps').textContent = G.attacksPerSec(s).toFixed(1);
    $('statComp').textContent = G.fmt(G.companionDps(s));
    $('statDps').textContent = G.fmt(G.totalDps(s));

    // 강화
    for (const key of G.UPGRADE_KEYS) {
      const u = G.UPGRADES[key];
      const r = upRefs[key];
      const lv = s.upgrades[key];
      const maxed = lv >= u.max;
      r.name.innerHTML = `${u.icon} ${u.name} <em>Lv.${lv}${maxed ? ' MAX' : ''}</em>`;
      r.desc.textContent = maxed ? u.effect(lv) : `${u.effect(lv)} → ${u.effect(lv + 1)}`;
      r.btn.textContent = maxed ? 'MAX' : `💰 ${G.fmt(G.upgradeCost(s, key))}`;
      r.btn.disabled = maxed || !G.canBuy(s, key);
    }

    // 환생
    const gain = G.prestigeGain(s);
    const pb = $('prestigeBtn');
    if (gain > 0) {
      pb.disabled = false;
      pb.textContent = `환생하기 (왕의 증표 +${gain})`;
      $('prestigeHint').textContent =
        `지금 환생하면 왕의 증표 ${gain}개를 얻어요. 증표 1개당 공격력·골드가 영구히 +25%예요. ` +
        `골드, 레벨, 강화, 스테이지는 처음부터 다시 시작해요.`;
    } else {
      pb.disabled = true;
      pb.textContent = '아직 환생할 수 없어요';
      $('prestigeHint').textContent =
        `스테이지 ${G.PRESTIGE_MIN_STAGE}에 도달하면 환생할 수 있어요. ` +
        `환생하면 왕의 증표를 얻어 영구히 강해져요. (지금 ${s.tokens}개 보유, 최고 기록 스테이지 ${s.bestStage})`;
    }
  }

  // ---- 버튼 ----
  $('hitBtn').addEventListener('click', () => {
    const r = G.clickAttack(state);
    if (r.dmg > 0) {
      floatText(G.fmt(r.dmg), 'float--big', 'monster');
      shake('monster');
    }
    const gold = handleEvents(r.events);
    if (gold > 0) floatText('+' + G.fmt(gold), 'float--gold', 'gold');
    render();
  });

  $('prestigeBtn').addEventListener('click', () => {
    const gain = G.prestigeGain(state);
    if (gain <= 0) return;
    if (!confirm(`환생할까요?\n왕의 증표 ${gain}개를 얻고, 골드·레벨·강화·스테이지가 처음으로 돌아가요.`)) return;
    G.prestige(state);
    logs.length = 0;
    addLog(`👑 환생했다! 왕의 증표 +${gain} (총 ${state.tokens}개)`, 'is-gold');
    writeSave();
    render();
  });

  $('resetBtn').addEventListener('click', () => {
    if (!confirm('정말 처음부터 다시 시작할까요?\n모든 진행 상황이 지워져요.')) return;
    clearSave();
    state = G.createState(Date.now());
    logs.length = 0;
    lastTier = '';
    lastMonster = '';
    addLog('🌱 새로운 고블린이 태어났다!', 'is-good');
    writeSave();
    render();
  });

  function showOffline(r) {
    const stage = r.stageTo === r.stageFrom ? `스테이지 ${r.stageTo}에서 계속 싸웠어요` : `스테이지 ${r.stageFrom} → ${r.stageTo}`;
    $('offlineBody').innerHTML =
      `${G.fmtTime(r.seconds)} 동안 고블린이 열심히 싸웠어요.<br>` +
      `💰 골드 +${G.fmt(r.gold)}<br>` +
      `⚔️ 몬스터 ${G.fmt(r.kills)}마리 처치<br>` +
      `🆙 레벨 ${r.levelFrom} → ${r.levelTo}<br>` +
      `⭐ ${stage}` +
      (r.seconds >= G.OFFLINE_CAP ? '<br><small>(오프라인 보상은 최대 8시간까지예요)</small>' : '');
    $('offlineModal').hidden = false;
  }
  $('offlineOk').addEventListener('click', () => { $('offlineModal').hidden = true; });

  // ---- 시작: 자리를 비운 동안의 보상 ----
  buildUpgrades();
  const offline = G.applyOffline(state, Date.now());
  if (offline) {
    showOffline(offline);
    addLog(`😴 ${G.fmtTime(offline.seconds)} 동안 자리를 비웠어요`, 'is-gold');
  } else {
    addLog('🌱 고블린이 모험을 시작했다!', 'is-good');
  }
  render();

  // ---- 메인 루프 ----
  let last = Date.now();
  let dealtTimer = 0;

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
    } else {
      const events = G.simulate(state, dt);
      const gold = handleEvents(events);
      dealtTimer += dt;
      if (dealtTimer >= 0.5) {
        dealtTimer = 0;
        if (state.dealt > 0) floatText('-' + G.fmt(state.dealt), 'float--dmg', 'monster');
        if (gold > 0) floatText('+' + G.fmt(gold), 'float--gold', 'gold');
        state.dealt = 0;
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
