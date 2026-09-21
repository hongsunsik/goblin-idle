// 밸런스 시뮬레이터: 강화를 자동으로 사고 전직·환생하는 봇으로 플레이 시간별 성장 곡선을 확인한다.
// 사용법: node tools/simulate.js [분(기본 30)] [직업경로 예: warrior/knight (생략하면 전부 비교)]
const G = require('../game.js');

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

// 한 경로로 minutes분 동안 플레이 (환생 없이)
function runOne(path, minutes) {
  const s = G.createState(0);
  const marks = [10, 20, 30, 40, 50].map((stage) => ({ stage, t: null }));
  playRun(s, path, minutes * 60, marks);
  return { s, marks };
}

// 정체되면 환생하는 봇. 한 판을 minutes분씩 돌려 몇 번째 판에 어디까지 가는지 본다.
function runPrestiges(path, runMinutes, runs) {
  const s = G.createState(0);
  const out = [];
  for (let i = 0; i < runs; i++) {
    playRun(s, path, runMinutes * 60, []);
    out.push({ run: i + 1, stage: s.runBest, tokens: s.tokens });
    G.prestige(s);
  }
  return out;
}

const fmtMin = (t) => (t === null ? '  -  ' : (t / 60).toFixed(1).padStart(5) + '분');

const minutes = Number(process.argv[2]) || 30;
const only = process.argv[3];
const paths = [];
for (const b of Object.keys(G.CLASSES)) for (const a of G.CLASSES[b].adv) paths.push([b, a]);
const selected = only ? paths.filter((p) => p.join('/') === only) : paths;

console.log(`\n== 환생 없이 ${minutes}분 (스테이지 도달 시간) ==`);
console.log('경로'.padEnd(22) + '10     20     30     40     50    최종  Lv');
for (const p of selected) {
  const { s, marks } = runOne(p, minutes);
  console.log(p.join('/').padEnd(20) + marks.map((m) => fmtMin(m.t)).join(' ') + `  ${String(s.runBest).padStart(3)}  ${s.level}`);
}

console.log('\n== 환생 반복 (한 판 15분씩 6번) ==');
const demo = only ? selected[0] : ['mage', 'pyromancer'];
console.log(demo.join('/') + ': ' + runPrestiges(demo, 15, 6).map((r) => `${r.run}판→${r.stage}`).join('  '));
