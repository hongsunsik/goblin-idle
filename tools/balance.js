// 장기 밸런스 시뮬레이터: '실제로 매일 조금씩 하는 사람'에 가까운 봇으로 며칠 치를 돌려 성장 곡선과 재화 흐름을 본다.
// 사용법: node tools/balance.js [일수(기본 7)] [씨앗 수(기본 4)] [--json]
// 봇: 하루 ACTIVE_MIN분 접속(나머지는 오프라인 보상, 상한까지), 강화는 가장 싼 것부터, 전직은 경로대로,
//     판이 PRESTIGE_MIN분 넘고 STALL초 동안 새 스테이지가 없으면 환생, 증표는 가장 싼 강화부터,
//     하루 한 번 던전 3종(미니게임 보너스는 상한의 60%)·탑 오르기·탑 보상, 크리스탈 900개마다 전설 상자,
//     가루는 낀 장비 레벨 올리기, 강화는 가방의 같은 칸 장비를 재료로.
// 출력: 날짜별 최고 스테이지·환생 수·증표·크리스탈·가루·탑 층, 처음 도달 시각(스테이지 50/100/150/200, 5차 전직), 벽(한 스테이지에 오래 머문 곳).
const G = require(process.env.GAME || '../game.js');   // 실험용: GAME=변형 파일 경로

const DAYS = Number(process.argv[2]) || 7, SEEDS = Number(process.argv[3]) || 4, JSON_OUT = process.argv.includes('--json');
const ACTIVE_MIN = Number(process.env.ACTIVE_MIN || 120), PRESTIGE_MIN = Number(process.env.PRESTIGE_MIN || 10), STALL = Number(process.env.STALL || 90);
const DAY_MS = 864e5, T0 = Date.UTC(2026, 8, 21, 3);   // 한국 시간 정오쯤
const DT = Number(process.env.DT || 1);   // 몇 초씩 묶어 계산할지 (장기 시뮬레이션은 5~10으로 빠르게)

function seeded(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const BUY = ['weapon', 'armor', 'speed', 'companion', 'loot'];
function spendGold(s) { for (let guard = 0; guard < 5000; guard++) { let b = null, bc = Infinity; for (const k of BUY) { if (!G.canBuy(s, k)) continue; const c = G.upgradeCost(s, k); if (c < bc) { b = k; bc = c; } } if (!b) return; G.buy(s, b); } }
function spendTokens(s) { for (let guard = 0; guard < 2000; guard++) { let b = null, bc = Infinity; for (const id of G.PERK_KEYS) if (G.canBuyPerk(s, id) && G.perkCost(s, id) < bc) { b = id; bc = G.perkCost(s, id); } if (!b) return; G.buyPerk(s, b); } }
const OFF = new Set((process.env.OFF || '').split(',').filter(Boolean));   // 원인 찾기용: OFF=gear,content,boxes,dust,enh 처럼 기능을 끈다
function gearCare(s) {
  if (OFF.has('gear')) return;
  for (const slot of G.SLOT_KEYS) {
    const it = s.equip[slot];
    if (!it) continue;
    if (!OFF.has('dust')) G.levelUpItem(s, it.id, 999);
    for (let k = 0; k < 3; k++) {   // 가방의 같은 칸 장비 중 가장 약한 걸 재료로 강화
      const mats = s.bag.filter((x) => x.slot === slot && x.id !== it.id && !x.lock).sort((a, b) => a.r - b.r || a.val - b.val);
      if (OFF.has('enh') || !mats.length || (it.enh || 0) >= G.ENH_MAX || s.gold < G.enhCost(it)) break;
      G.enhanceItem(s, it.id, mats[0].id);
    }
    if ((it.enh || 0) >= G.ENH_MAX) { const m = G.starMaterials(s, it); if (m.length) G.starItem(s, it.id, m[0].id); }
  }
  // 가방이 차면 약한 것부터 분해
  if (s.bag.length > G.bagLimit(s) - 6) G.dismantleItems(s, s.bag.filter((x) => x.r <= 3 && !x.sp).map((x) => x.id));
}

function runSeed(seed, path) {
  G.setRandom(seeded(seed));
  const s = G.createState(T0); s.savedAt = T0; s.autoSell = 1; s.autoDust = true;
  const first = {}; const mark = (k, t) => { if (first[k] === undefined) first[k] = t; };
  const days = [], walls = {};
  let playSec = 0, lastBest = 0, lastBestAt = 0, crystalsIn = 0, prestiges = 0;
  for (let d = 0; d < DAYS; d++) {
    const dayStart = T0 + d * DAY_MS, dayKey = new Date(dayStart + 9 * 3600e3).toISOString().slice(0, 10);
    // 오프라인 보상 (전날 끝 ~ 오늘)
    if (d > 0) { s.savedAt = dayStart - (DAY_MS - ACTIVE_MIN * 60e3); G.applyOffline(s, dayStart, dayStart); }
    const c0 = s.crystals;
    // 하루 콘텐츠: 던전·탑 (접속하자마자 한 번, 접속 끝날 때 한 번 더 — 강해진 뒤)
    const content = () => {
      if (OFF.has('content')) return;
      G.dungeonSync(s, dayKey);
      for (const p of G.DUNGEON_PERIODS) while (G.dungeonInfo(s, p).left > 0) { const r = G.challengeDungeon(s, p, G.MG_BONUS_CAP[p] * 0.6); if (!r.ok) break; }
      for (let k = 0; k < 30; k++) { const r = G.climbTower(s); if (!r.ok || r.climbed === 0) break; }
      G.claimTowerDaily(s, dayKey);
      while (!OFF.has('boxes') && s.crystals >= 900 && s.bag.length < G.bagLimit(s) - 2) G.buyProduct(s, 'box_legend');
    };
    for (let t = 0; t < ACTIVE_MIN * 60; t += DT) {
      G.simulate(s, DT);
      playSec += DT;
      spendGold(s);
      const st = G.promoStage(s);
      if (st) { const id = path[['base', 'adv', 'adv3', 'adv4', 'adv5'].indexOf(st)]; if (id) G.promote(s, id); }
      if (G.classPath(s).length === 5) mark('5차', playSec);
      if (s.runBest > lastBest || s.runBest < lastBest) { lastBest = s.runBest; lastBestAt = playSec; }
      for (const m of [50, 100, 150, 200, 250, 300]) if (s.bestStage >= m) mark('스테이지' + m, playSec);
      if (t % 60 === 0) { gearCare(s); if (t === 600 || t === ACTIVE_MIN * 60 - 60) content(); }
      const stalled = playSec - lastBestAt >= STALL;
      if (stalled) walls[s.runBest] = (walls[s.runBest] || 0) + DT;
      if (s.runT >= PRESTIGE_MIN * 60 && stalled && G.canPrestige(s)) { G.prestige(s); prestiges += 1; spendTokens(s); lastBest = 0; lastBestAt = playSec; }
    }
    crystalsIn += Math.max(0, s.crystals - c0);
    const caps = [];   // 저장 상한에 닿은 값 (몇 년 플레이에서 진행이 잘리는지)
    if (s.bestStage >= 999) caps.push('스테이지999'); if (s.tokens >= 99999) caps.push('증표99999'); if (s.gold >= 1e59) caps.push('골드1e60');
    if (s.level >= 9999) caps.push('레벨'); if (s.tower.best >= G.TOWER.maxFloor) caps.push('탑꼭대기'); if (!Number.isFinite(G.totalDps(s))) caps.push('무한대');
    days.push({ caps: caps.join(','), level: s.level, day: d + 1, best: s.bestStage, run: s.runBest, prestiges, tokens: s.tokens, crystals: Math.round(s.crystals), dust: s.dust, tower: s.tower.best,
                dps: G.totalDps(s), gear: G.SLOT_KEYS.map((k) => (s.equip[k] ? `${G.RARITIES[s.equip[k].r].name[0]}${s.equip[k].ilvl}+${s.equip[k].enh || 0}${s.equip[k].star ? '✦' + s.equip[k].star : ''}` : '-')).join(' ') });
  }
  G.setRandom();
  return { days, first, walls };
}

const PATHS = [
  ['warrior', 'knight', 'paladin', 'holyking', 'sunmonarch'],
  ['archer', 'ranger', 'windwalker', 'stormarcher', 'thunderavatar'],
  ['mage', 'pyromancer', 'infernomage', 'flameemperor', 'firegod'],
  ['rogue', 'pirate', 'buccaneer', 'treasureking', 'goldenlord'],
];
const results = [];
const ONLY = process.env.ONLY !== undefined ? Number(process.env.ONLY) : null;   // 병렬로 나눠 돌릴 때: 이 번호의 씨앗만
for (let i = 0; i < SEEDS; i++) if (ONLY === null || ONLY === i) results.push({ path: PATHS[i % PATHS.length], ...runSeed(1000 + i, PATHS[i % PATHS.length]) });
if (JSON_OUT) { console.log(JSON.stringify(results)); process.exit(0); }
const fmtT = (sec) => (sec === undefined ? '  -  ' : `${(sec / 3600).toFixed(1)}h`);
console.log(`하루 ${ACTIVE_MIN}분 접속 × ${DAYS}일, 씨앗 ${SEEDS}개 (환생: 판 ${PRESTIGE_MIN}분 이상 + ${STALL}초 정체)`);
for (const r of results) {
  console.log(`\n[${r.path.join('/')}]`);
  console.log('일  최고  환생  증표    크리스탈  가루      탑   초당피해   장비(무기 방어구 액세서리)');
  const SHOW = DAYS > 30 ? new Set([1, 2, 3, 7, 14, 30, 60, 90, 120, 180, 270, 365, 540, 730, 1095].filter((x) => x <= DAYS).concat([DAYS])) : null;
  for (const d of r.days) if (!SHOW || SHOW.has(d.day)) console.log(`${String(d.day).padStart(2)}  ${String(d.best).padStart(4)}  ${String(d.prestiges).padStart(4)}  ${String(d.tokens).padStart(5)}  ${String(d.crystals).padStart(8)}  ${G.fmt(d.dust).padStart(7)}  ${String(d.tower).padStart(4)}  ${G.fmt(d.dps).padStart(8)}   ${d.gear} Lv${d.level}${d.caps ? ' ⚠' + d.caps : ''}`);
  console.log('처음 도달(접속 시간 기준): ' + ['5차', '스테이지50', '스테이지100', '스테이지150', '스테이지200', '스테이지250', '스테이지300'].map((k) => `${k} ${fmtT(r.first[k])}`).join(' · '));
  const w = Object.entries(r.walls).sort((a, b) => b[1] - a[1]).slice(0, 5);
  console.log('오래 막힌 스테이지(정체 초): ' + w.map(([st, n]) => `${st}(${n}s)`).join(' '));
}
