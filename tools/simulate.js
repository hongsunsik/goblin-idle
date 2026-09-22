// 밸런스 시뮬레이터: 강화를 자동으로 사고 전직·환생하는 봇으로 플레이 시간별 성장 곡선을 확인한다.
// 사용법: node tools/simulate.js [분(기본 30)] [직업경로 예: mage/pyromancer/infernomage/flameemperor (생략하면 4차까지 32가지 전부)]
//   경로를 짧게(예: mage/pyromancer) 주면 그 단계까지만 전직한 봇이 된다. --summary 를 붙이면 3·4차 효과만 요약한다.
// 주의: 전직 레벨이 15/28/45/65/90으로 늘어난 뒤로는, 환생 없이 짧은 시간(30분 이하)만 돌리면 대부분 2~3차에 머물러
//   4·5차 비교가 잘 안 된다. 3차 이상을 비교하려면 분(90 이상)을 크게 주거나, tools/test.js의 증표를 미리 채운
//   회귀 테스트(격차 검사)처럼 s.tokens·s.perks를 미리 넣고 재는 편이 더 공정하다.
const G = require('../game.js');

// 장비 드롭도 무작위라 한 번의 결과는 운에 흔들린다. 씨앗이 있는 난수로 여러 번 돌려 평균을 낸다.
function seeded(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
let SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
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
  let t = 0;
  while (t < seconds) {
    G.simulate(s, 1);
    t += 1;
    spendAll(s);
    const st = G.promoStage(s);
    if (st) { const id = path[['base', 'adv', 'adv3', 'adv4', 'adv5'].indexOf(st)]; if (id) G.promote(s, id); }   // 경로가 끝난 단계에서는 더 전직하지 않는다
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
// 직업 트리를 끝까지 따라 내려가며 depth차까지의 경로를 모두 만든다 (depth 4 = 32가지)
function pathsTo(depth) {
  const out = [];
  const walk = (path) => {
    if (path.length === depth) { out.push(path); return; }
    for (const c of (path.length === 0 ? Object.keys(G.CLASSES) : G.childrenOf(path[path.length - 1]))) walk(path.concat(c));
  };
  walk([]);
  return out;
}
const summary = process.argv.includes('--summary');
const only = process.argv[3] && process.argv[3] !== '--summary' ? process.argv[3] : undefined;
const selected = only ? [only.split('/')] : pathsTo(4);
if (!only) SEEDS = [1, 2, 3, 4];   // 32가지를 다 돌릴 때는 씨앗을 줄여 시간을 아낀다

const name = (path) => path.map((id) => (G.CLASSES[id] || G.ADVANCED[id] || G.ADVANCED3[id] || G.ADVANCED4[id] || G.ADVANCED5[id]).name).join('/');
console.log(`\n== 환생 없이 ${minutes}분 (스테이지 도달 시간) ==`);
console.log(`(씨앗 ${SEEDS.length}개 평균)`);
const results = [];
if (!summary) console.log('경로'.padEnd(30) + '10     20     30     40     50    최종(최소~최대)  Lv');
for (const p of selected) {
  const r = runOne(p, minutes);
  results.push({ p, r });
  if (!summary) console.log(name(p).padEnd(26) + r.marks.map((m) => fmtMin(m.t)).join(' ') + `  ${r.final.toFixed(1).padStart(5)} (${r.min}~${r.max})  ${r.level.toFixed(0)}`);
}
if (!only) {
  // 같은 2차 직업까지만 전직한 봇과 비교해서 3·4차가 얼마나 강해지는지 본다
  const base2 = pathsTo(2).map((p) => ({ p, r: runOne(p, minutes) }));
  const m2 = mean(base2.map((x) => x.r.final));
  const finals = results.map((x) => x.r.final);
  const best = results.reduce((a, b) => (b.r.final > a.r.final ? b : a)), worst = results.reduce((a, b) => (b.r.final < a.r.final ? b : a));
  console.log(`\n2차까지만: 평균 ${m2.toFixed(1)}  (${Math.min(...base2.map((x) => x.r.final)).toFixed(1)}~${Math.max(...base2.map((x) => x.r.final)).toFixed(1)})`);
  console.log(`4차까지:   평균 ${mean(finals).toFixed(1)}  (${Math.min(...finals).toFixed(1)}~${Math.max(...finals).toFixed(1)})  격차 ${(Math.max(...finals) - Math.min(...finals)).toFixed(1)}스테이지`);
  console.log(`  가장 강한 경로: ${name(best.p)} ${best.r.final.toFixed(1)} / 가장 약한 경로: ${name(worst.p)} ${worst.r.final.toFixed(1)}`);
}

console.log('\n== 환생 반복 (한 판 10분씩 10번) ==');
const demo = only ? selected[0] : ['mage', 'pyromancer', 'infernomage', 'flameemperor'];
SEEDS = [1, 2, 3, 4, 5, 6, 7, 8];
const show = (rs) => rs.map((r) => `${r.run}판→${r.stage}`).join('  ');
console.log(demo.join('/') + ' (증표 상점 안 씀): ' + show(runPrestiges(demo, 10, 10, false)));
const withPerks = runPrestiges(demo, 10, 10, true);
console.log(demo.join('/') + ' (증표 상점 사용): ' + show(withPerks));
const last = withPerks[withPerks.length - 1];
console.log(`  10판 뒤 누적 증표 ${last.tokens}개, 상점에 쓴 증표 ${last.spent}개`);

// 환생 주기 비교: 같은 60분 동안 몇 분마다 환생하면 증표를 얼마나 모으는지 (짧게 반복하는 쪽이 유리하면 밸런스 결함)
console.log('\n== 환생 주기 비교 (총 60분, 증표 상점 사용) ==');
SEEDS = [1, 2, 3, 4];
for (const runMin of [3, 5, 10, 15, 30, 60]) {
  const res = SEEDS.map((seed) => {
    G.setRandom(seeded(seed));
    const s = G.createState(0);
    for (let el = 0; el + runMin <= 60; el += runMin) { playRun(s, demo, runMin * 60, []); G.prestige(s); spendTokens(s); }
    return s.tokens;
  });
  console.log(`${String(runMin).padStart(2)}분마다 환생 → 60분 뒤 누적 증표 ${mean(res).toFixed(0)}개`);
}
