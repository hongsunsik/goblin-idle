// 밸런스 시뮬레이터: 강화를 자동으로 사고 전직·환생하는 봇으로 플레이 시간별 성장 곡선을 확인한다.
// 사용법: node tools/simulate.js [분(기본 30)] [직업경로 예: warrior/knight (생략하면 전부 비교)]
const G = require('../game.js');

// 장비 드롭도 무작위라 한 번의 결과는 운에 흔들린다. 씨앗이 있는 난수로 여러 번 돌려 평균을 낸다.
function seeded(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

const BUY_ORDER = ['weapon', 'armor', 'speed', 'companion', 'loot'];

// 가장 싼 강화부터 산다 (골드를 남기지 않는 '완벽히 쓰는' 봇)
function spendAll(s) {
  for (;;) {
    let best = null, bestCost = Infinity;
    for (const k of BUY_ORDER) {
      if (!G.canBuy(s, k)) continue;
      const c = G.upgradeCost(s, k);
      if (c < bestCost) { best = k; bestCost = c; }
    }
    if (!best) return;
    G.buy(s, best);
  }
}

function playRun(s, path, seconds, marks) {
  const [base, adv] = path;
  let t = 0;
  while (t < seconds) {
    G.simulate(s, 1);
    t += 1;
    spendAll(s);
    if (G.promoStage(s) === 'base') G.promote(s, base);
    else if (G.promoStage(s) === 'adv' && adv) G.promote(s, adv);
    for (const m of marks) if (m.t === null && s.stage >= m.stage) m.t = t;
  }
  return t;
}

// 한 경로로 minutes분 동안 플레이 (환생 없이). 씨앗마다 돌려 평균을 낸다.
// 도달 시간은 절반 이상의 씨앗이 도달한 경우에만 평균을 내고, 아니면 null.
function runOne(path, minutes) {
  const stages = [10, 20, 30, 40, 50];
  const runs = SEEDS.map((seed) => {
    G.setRandom(seeded(seed));
    const s = G.createState(0);
    const marks = stages.map((stage) => ({ stage, t: null }));
    playRun(s, path, minutes * 60, marks);
    return { final: s.runBest, level: s.level, marks };
  });
  const marks = stages.map((stage, i) => {
    const ts = runs.map((r) => r.marks[i].t).filter((t) => t !== null);
    return { stage, t: ts.length * 2 >= runs.length ? mean(ts) : null };
  });
  const finals = runs.map((r) => r.final);
  return { marks, final: mean(finals), min: Math.min(...finals), max: Math.max(...finals), level: mean(runs.map((r) => r.level)) };
}

// 증표로 상점 강화를 산다: 가장 싼 것부터, 살 수 있는 만큼 (기본 3가지를 먼저 올리는 것과 비슷한 효과)
function spendTokens(s) {
  for (;;) {
    let best = null, bestCost = Infinity;
    for (const id of G.PERK_KEYS) {
      if (G.canBuyPerk(s, id) && G.perkCost(s, id) < bestCost) { best = id; bestCost = G.perkCost(s, id); }
    }
    if (!best) return;
    G.buyPerk(s, best);
  }
}

// 정체되면 환생하는 봇. 한 판을 minutes분씩 돌려 몇 번째 판에 어디까지 가는지 본다 (씨앗별 평균).
function runPrestiges(path, runMinutes, runs, usePerks) {
  const all = SEEDS.map((seed) => {
    G.setRandom(seeded(seed));
    const s = G.createState(0);
    const out = [];
    for (let i = 0; i < runs; i++) {
      playRun(s, path, runMinutes * 60, []);
      out.push({ run: i + 1, stage: s.runBest, tokens: s.tokens, spent: G.perkSpent(s) });
      G.prestige(s);
      if (usePerks) spendTokens(s);
    }
    return out;
  });
  return all[0].map((_, i) => ({ run: i + 1, stage: Math.round(mean(all.map((o) => o[i].stage))), tokens: Math.round(mean(all.map((o) => o[i].tokens))), spent: Math.round(mean(all.map((o) => o[i].spent))) }));
}

const fmtMin = (t) => (t === null ? '  -  ' : (t / 60).toFixed(1).padStart(5) + '분');

const minutes = Number(process.argv[2]) || 30;
const only = process.argv[3];
const paths = [];
for (const b of Object.keys(G.CLASSES)) for (const a of G.CLASSES[b].adv) paths.push([b, a]);
const selected = only ? paths.filter((p) => p.join('/') === only) : paths;

console.log(`\n== 환생 없이 ${minutes}분 (스테이지 도달 시간) ==`);
console.log(`(씨앗 ${SEEDS.length}개 평균)`);
console.log('경로'.padEnd(22) + '10     20     30     40     50    최종(최소~최대)  Lv');
for (const p of selected) {
  const r = runOne(p, minutes);
  console.log(p.join('/').padEnd(20) + r.marks.map((m) => fmtMin(m.t)).join(' ') + `  ${r.final.toFixed(1).padStart(5)} (${r.min}~${r.max})  ${r.level.toFixed(0)}`);
}

console.log('\n== 환생 반복 (한 판 15분씩 10번) ==');
const demo = only ? selected[0] : ['mage', 'pyromancer'];
const show = (rs) => rs.map((r) => `${r.run}판→${r.stage}`).join('  ');
console.log(demo.join('/') + ' (증표 상점 안 씀): ' + show(runPrestiges(demo, 15, 10, false)));
const withPerks = runPrestiges(demo, 15, 10, true);
console.log(demo.join('/') + ' (증표 상점 사용): ' + show(withPerks));
const last = withPerks[withPerks.length - 1];
console.log(`  10판 뒤 누적 증표 ${last.tokens}개, 상점에 쓴 증표 ${last.spent}개`);
