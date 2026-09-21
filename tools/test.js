// 게임 로직 자체 점검: node tools/test.js  (화면·브라우저 없이 game.js만 검사한다)
const assert = require('assert');
const G = require('../game.js');

let passed = 0;
function test(name, fn) {
  try { fn(); passed += 1; console.log('  통과  ' + name); }
  catch (e) { console.error('  실패  ' + name + '\n        ' + e.message); process.exitCode = 1; }
}

// 강화를 사면서 until(s)이 참이 될 때까지 진행시킨다
function play(s, until, maxSec = 4 * 3600) {
  for (let t = 0; t < maxSec && !until(s); t++) {
    G.simulate(s, 1);
    for (const k of G.UPGRADE_KEYS) G.buyMany(s, k, Infinity);
    G.checkAchievements(s);
  }
  return s;
}

console.log('업적');
test('새 게임은 달성한 업적이 없고 배율이 1이다', () => {
  const s = G.createState(0);
  assert.deepStrictEqual(s.achieved, {});
  assert.strictEqual(G.achieveMult(s), 1);
});

test('조건을 채우면 업적이 한 번만 달성된다', () => {
  const s = G.createState(0);
  s.totalKills = 100;
  const first = G.checkAchievements(s);
  assert.deepStrictEqual(first.map((e) => e.id), ['kill100']);
  assert.strictEqual(G.checkAchievements(s).length, 0, '이미 달성한 업적은 다시 알리지 않는다');
});

test('달성할 때마다 공격력과 골드가 +2%씩 늘어난다', () => {
  const s = G.createState(0);
  const dmg0 = G.hitDmg(s), gold0 = G.goldMult(s);
  s.achieved.kill100 = true; s.achieved.stage10 = true;
  assert.ok(Math.abs(G.hitDmg(s) / dmg0 - 1.04) < 1e-9);
  assert.ok(Math.abs(G.goldMult(s) / gold0 - 1.04) < 1e-9);
});

test('전투 중 처치 수 업적이 사건(achieve)으로 나온다', () => {
  const s = G.createState(0);
  s.totalKills = 99;
  const ev = G.simulate(s, 60);
  assert.ok(ev.some((e) => e.type === 'achieve' && e.id === 'kill100'));
});

test('환생해도 업적이 유지되고 첫 환생 업적이 달성된다', () => {
  const s = G.createState(0);
  s.achieved.kill100 = true;
  s.runBest = 12;
  assert.ok(G.prestige(s) > 0);
  const ids = G.checkAchievements(s).map((e) => e.id);
  assert.ok(s.achieved.kill100);
  assert.deepStrictEqual(ids, ['prestige1']);
});

test('저장하고 불러와도 업적이 그대로다', () => {
  const s = G.createState(0);
  s.achieved.kill100 = true; s.achieved.stage30 = true;
  const back = G.deserialize(G.serialize(s, 1));
  assert.deepStrictEqual(back.achieved, s.achieved);
});

test('없는 업적이나 잘못된 값이 든 저장 데이터는 걸러낸다', () => {
  const s = G.createState(0);
  const o = JSON.parse(G.serialize(s, 1));
  o.achieved = { kill100: true, hacked: true, stage10: 'yes', kill1000: 1 };
  const back = G.deserialize(JSON.stringify(o));
  assert.deepStrictEqual(back.achieved, { kill100: true });
});

test('업적 저장 항목이 없는 예전 저장 데이터도 불러온다', () => {
  const s = G.createState(0);
  const o = JSON.parse(G.serialize(s, 1));
  delete o.achieved;
  const back = G.deserialize(JSON.stringify(o));
  assert.deepStrictEqual(back.achieved, {});
});

test('업적 id는 서로 다르고 목표가 양수다', () => {
  const ids = G.ACHIEVEMENTS.map((a) => a.id);
  assert.strictEqual(new Set(ids).size, ids.length);
  assert.ok(G.ACHIEVEMENTS.every((a) => a.goal > 0 && typeof a.val(G.createState(0)) === 'number'));
});

console.log('그 밖의 로직');
test('도감 8종을 채우면 codex4·codex8 업적이 함께 달성된다', () => {
  const s = G.createState(0);
  for (const k of Object.keys(G.ADVANCED)) s.mastered[k] = true;
  const ids = G.checkAchievements(s).map((e) => e.id).sort();
  assert.deepStrictEqual(ids, ['codex4', 'codex8']);
});

test('20분 자동 플레이로 스테이지 30 이상에 도달한다 (진행 속도 회귀 방지)', () => {
  const s = G.createState(0);
  play(s, (x) => x.stage >= 30, 20 * 60);
  assert.ok(s.runBest >= 30, `스테이지 ${s.runBest}`);
});

test('오프라인 보상이 최대 8시간으로 제한된다', () => {
  const s = G.createState(0);
  const r = G.applyOffline(s, 100 * 3600 * 1000);
  assert.strictEqual(r.seconds, 8 * 3600);
});

console.log(`\n${passed}개 통과` + (process.exitCode ? ', 실패 있음' : ''));
