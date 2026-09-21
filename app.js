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

  // ---- 화면에 떠오르는 숫자 ----
  const layer = $('floatLayer');
  function floatText(text, cls, where) {
    if (layer.children.length > 14) return;
    const el = document.createElement('div');
    el.className = 'float ' + cls;
    el.textContent = text;
    const x = where === 'hero' ? 16 : where === 'center' ? 34 : 60;
    el.style.left = x + Math.random() * 16 + '%';
    el.style.top = (where === 'center' ? 34 : 40) + Math.random() * 14 + '%';
    layer.appendChild(el);
    setTimeout(() => el.remove(), 950);
  }
  function shakeEnemy() {
    const el = $('monster');
    el.classList.remove('shake');
    void el.offsetWidth;   // 애니메이션을 처음부터 다시 시작
    el.classList.add('shake');
  }

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
    currentTab = name;
    document.querySelectorAll('.tab').forEach((t) => { t.hidden = t.dataset.tab !== name; });
    document.querySelectorAll('.tabnav__btn').forEach((b) => b.classList.toggle('is-on', b.dataset.go === name));
    document.querySelector('.tabs').scrollTop = 0;
    if (name === 'class') renderClass(true);
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
      refs.btn.addEventListener('click', () => { if (G.buyMany(state, key, buyWant()) > 0) render(); });
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
    const key = [s.cls, s.adv, s.level, Object.keys(s.mastered).length].join('|');
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

    // 도감
    const count = Object.keys(s.mastered).length;
    $('codexBonus').textContent = `${count} / ${Object.keys(G.ADVANCED).length} · 공격력·골드 +${Math.round(count * G.MASTERY_BONUS * 100)}%`;
    let dex = '';
    for (const aid of Object.keys(G.ADVANCED)) {
      const on = !!s.mastered[aid];
      dex += `<div class="dex ${on ? 'is-on' : ''}"><div class="dex__art">${A.goblin(aid, { head: true })}</div>` +
        `<div class="dex__name">${on ? G.ADVANCED[aid].name : '???'}</div></div>`;
    }
    $('codex').innerHTML = dex;
  }
  $('classChoice').addEventListener('click', (e) => {
    const b = e.target.closest('button[data-pick]');
    if (b && !b.disabled) askPromote(b.dataset.pick, b.dataset.adv === '1');
  });

  // ---- 이벤트 처리 ----
  function handleEvents(events) {
    let gold = 0;
    for (const e of events) {
      if (e.type === 'kill') {
        gold += e.gold;
        if (e.boss) addLog(`보스를 쓰러뜨렸다! +${G.fmt(e.gold)} 골드`, 'is-gold', 'skull');
      } else if (e.type === 'stage') {
        addLog(`스테이지 ${e.stage} 도전!`, 'is-good', 'star');
      } else if (e.type === 'levelup') {
        addLog(`레벨 ${e.level} 달성!`, 'is-good', 'arrowup');
      } else if (e.type === 'promoReady') {
        addLog(`${e.stage === 'base' ? '1차' : '2차'} 전직이 가능해요! '전직' 메뉴를 확인하세요`, 'is-gold', 'cap');
        floatText('전직 가능!', 'float--big', 'center');
      } else if (e.type === 'down') {
        addLog(`쓰러졌다... 스테이지 ${e.to}로 후퇴`, 'is-bad', 'skull');
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
    setText('tokens', s.tokens);

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
    setText('goblinHpText', `${G.fmt(Math.max(0, s.hp))} / ${G.fmt(max)}`);
    setWidth('monsterHpBar', (s.monsterHp / s.monsterMax) * 100);
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

    // 환생 탭
    const gain = G.prestigeGain(s);
    const pb = $('prestigeBtn');
    setText('pTokens', s.tokens);
    setText('pBonus', '+' + Math.round((G.tokenMult(s) - 1) * 100) + '%');
    setText('pBest', s.bestStage);
    pb.disabled = gain <= 0;
    setText('prestigeBtn', gain > 0 ? `환생하기 (증표 +${gain})` : '아직 환생할 수 없어요');
    setText('prestigeHint', gain > 0
      ? `지금 환생하면 왕의 증표 ${gain}개를 얻어요. 증표 1개당 공격력·골드가 영구히 +${Math.round(G.TOKEN_BONUS * 100)}%라서 보너스가 +${Math.round((G.tokenMult(s) - 1) * 100)}% → +${Math.round(G.TOKEN_BONUS * 100 * (s.tokens + gain))}%가 돼요. 골드·레벨·강화·스테이지·직업은 처음부터 다시 시작하고, 직업 도감은 그대로 남아요.`
      : `스테이지 ${G.PRESTIGE_MIN_STAGE}에 도달하면 환생할 수 있어요. 환생하면 왕의 증표를 얻어 영구히 강해지고, 다른 직업으로 다시 시작해 볼 수 있어요.`);

    // 메뉴 알림 점
    const dots = document.querySelectorAll('.tabnav__btn .dot');
    const want = [anyBuy && currentTab !== 'upgrade', G.promoStage(s) !== null && currentTab !== 'class', gain > 0 && currentTab !== 'prestige'];
    dots.forEach((d, i) => { if (d.hidden === want[i]) d.hidden = !want[i]; });
  }

  // ---- 공격 (화면 누르기) ----
  function attack() {
    const r = G.clickAttack(state);
    if (r.dmg > 0) {
      floatText(G.fmt(r.dmg), 'float--big', 'enemy');
      shakeEnemy();
    }
    const gold = handleEvents(r.events);
    if (gold > 0) floatText('+' + G.fmt(gold), 'float--gold', 'hero');
    render();
  }
  $('scene').addEventListener('pointerdown', (e) => { e.preventDefault(); attack(); });
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
      (r.seconds >= G.OFFLINE_CAP ? '<br><small>(오프라인 보상은 최대 8시간까지예요)</small>' : ''),
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
        if (state.dealt > 0) floatText('-' + G.fmt(state.dealt), 'float--dmg', 'enemy');
        if (gold > 0) floatText('+' + G.fmt(gold), 'float--gold', 'hero');
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
