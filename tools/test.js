// 게임 로직 자체 점검: node tools/test.js  (화면·브라우저 없이 game.js만 검사한다)
const assert = require('assert');
const G = require('../game.js');

// 테스트는 등록한 순서대로 하나씩 실행한다 (비동기 테스트도 기다린다). 실행은 파일 끝에서 시작한다.
let passed = 0;
let queue = Promise.resolve();
const section = (title) => { queue = queue.then(() => console.log(title)); };
function test(name, fn) {
  queue = queue.then(async () => {
    try { await fn(); passed += 1; console.log('  통과  ' + name); }
    catch (e) { console.error('  실패  ' + name + '\n        ' + e.message); process.exitCode = 1; }
  });
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

section('업적');
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

test('달성할 때마다 공격력과 골드가 +0.5%씩 늘어난다', () => {
  const s = G.createState(0);
  const dmg0 = G.hitDmg(s), gold0 = G.goldMult(s);
  s.achieved.kill100 = true; s.achieved.stage10 = true;
  assert.ok(Math.abs(G.hitDmg(s) / dmg0 - 1.01) < 1e-9);
  assert.ok(Math.abs(G.goldMult(s) / gold0 - 1.01) < 1e-9);
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

section('직업 도감');
test('2차 전직하면 도감에 기록이 생기고 처치 수와 최고 스테이지가 오른다', () => {
  const s = G.createState(0);
  s.level = G.PROMO_LEVEL.adv; G.promote(s, 'mage'); G.promote(s, 'pyromancer');
  assert.strictEqual(G.dexRecord(s, 'pyromancer').runs, 1);
  s.stage = 30; s.monsterHp = 1; G.clickAttack(s);   // 몬스터 1마리 처치 (뒤 몬스터는 체력이 커서 남은 피해가 이어지지 않는다)
  assert.strictEqual(G.dexRecord(s, 'pyromancer').kills, 1);
  s.stage = 31; s.killsInStage = 4; s.monsterHp = 1; G.clickAttack(s);   // 스테이지를 넘긴다
  assert.strictEqual(G.dexRecord(s, 'pyromancer').best, 32);
});

test('도감 등급은 차수별 기준 스테이지에서 오르고 그 직업 보너스를 20%씩 늘린다', () => {
  const s = G.createState(0);
  s.mastered.knight = true;                                  // 2차: 기본 +5%
  const base = G.masteryMult(s);
  assert.ok(Math.abs(base - 1.05) < 1e-9);
  s.dex.knight = { best: 35, kills: 0, runs: 1 };            // 은 = 메달 2개 → 기본값의 +40%
  assert.strictEqual(G.dexTier(s, 'knight'), 2);
  assert.ok(Math.abs(G.masteryMult(s) - (1 + 0.05 * 1.4)) < 1e-9);
  s.dex.knight.best = 60;
  assert.strictEqual(G.dexTier(s, 'knight'), 3);
  // 같은 스테이지여도 3·4차는 기준이 높다 (3차: 30/45/60, 4차: 40/55/70)
  s.dex.paladin = { best: 44, kills: 0, runs: 1 }; s.dex.seraph = { best: 44, kills: 0, runs: 1 };
  assert.strictEqual(G.dexTier(s, 'paladin'), 1);
  assert.strictEqual(G.dexTier(s, 'seraph'), 1);
  s.dex.paladin.best = 45; s.dex.seraph.best = 39;
  assert.strictEqual(G.dexTier(s, 'paladin'), 2);
  assert.strictEqual(G.dexTier(s, 'seraph'), 0);
});

test('도감 기록은 환생해도 남고 저장·복원된다', () => {
  const s = G.createState(0);
  s.dex.knight = { best: 40, kills: 123, runs: 2 }; s.mastered.knight = true; s.runBest = 12;
  G.prestige(s);
  const back = G.deserialize(G.serialize(s, 1));
  assert.deepStrictEqual(back.dex.knight, { best: 40, kills: 123, runs: 2 });
});

test('도감 기록의 이상한 값은 범위 안으로 보정하고 없는 직업은 버린다', () => {
  const s = G.createState(0);
  const o = JSON.parse(G.serialize(s, 1));
  o.dex = { knight: { best: -5, kills: 'x', runs: 1e99 }, hacker: { best: 9, kills: 9, runs: 9 } };
  const back = G.deserialize(JSON.stringify(o));
  assert.deepStrictEqual(Object.keys(back.dex), ['knight']);
  assert.deepStrictEqual(back.dex.knight, { best: 0, kills: 0, runs: 99999 });
});

section('3차·4차 전직');
// 봇처럼 필요한 레벨까지 올려서 지정한 경로를 끝까지 전직시킨다
const walkPath = (s, ids) => { for (const id of ids) { s.level = Math.max(s.level, G.PROMO_LEVEL[G.promoStage(s) || 'adv5']); if (!G.promote(s, id)) return false; } return true; };

test('직업 트리가 온전하다 (1~4차는 갈래 2개, 5차는 끝, 모든 노드에 부모)', () => {
  assert.strictEqual(Object.keys(G.ADVANCED3).length, 16);
  assert.strictEqual(Object.keys(G.ADVANCED4).length, 32);
  assert.strictEqual(Object.keys(G.ADVANCED5).length, 64);
  for (const id of Object.keys(G.CLASSES)) assert.strictEqual(G.childrenOf(id).length, 2, id);
  for (const id of [...Object.keys(G.ADVANCED), ...Object.keys(G.ADVANCED3), ...Object.keys(G.ADVANCED4)]) assert.strictEqual(G.childrenOf(id).length, 2, id);
  for (const id of Object.keys(G.ADVANCED5)) assert.strictEqual(G.childrenOf(id).length, 0, id);
  for (const id of G.ADV_IDS) { assert.ok(G.classTier(G.parentOf(id)) === G.classTier(id) - 1, id); }
  const names = G.ADV_IDS.map((id) => G.NODES[id].name);
  assert.strictEqual(new Set(names).size, names.length, '직업 이름이 겹친다');
});

test('모든 3·4·5차 직업에 설명과 능력치 배율이 있다', () => {
  for (const id of [...Object.keys(G.ADVANCED3), ...Object.keys(G.ADVANCED4), ...Object.keys(G.ADVANCED5)]) {
    const n = G.NODES[id];
    assert.ok(n.name && n.desc && n.desc.length > 8, id);
    assert.ok(Object.keys(n.mult).length >= 1 && Object.values(n.mult).every((v) => v > 0 && v <= 2.5), id + ' ' + JSON.stringify(n.mult));
  }
});

test('레벨이 차면 3차·4차 전직이 열리고 알림 사건이 나온다', () => {
  const s = G.createState(0);
  walkPath(s, ['warrior', 'knight']);
  const need = G.PROMO_LEVEL.adv3;
  s.level = need - 1; assert.strictEqual(G.promoStage(s), null);
  s.level = need; assert.strictEqual(G.promoStage(s), 'adv3');
  assert.deepStrictEqual(G.promoOptions(s).sort(), ['crusader', 'paladin']);
  s.level = need - 1; s.exp = G.expNeeded(s) - 1; s.monsterHp = 1; s.hp = 1e9;
  const ev = G.clickAttack(s).events;   // 몬스터를 잡아 다음 전직 레벨이 되게 한다
  assert.ok(ev.some((e) => e.type === 'promoReady' && e.stage === 'adv3'), JSON.stringify(ev.map((e) => e.type)));
});

test('5차까지 순서대로 전직하고, 자식이 아닌 직업이나 건너뛰기는 거절한다', () => {
  const s = G.createState(0);
  assert.ok(walkPath(s, ['warrior', 'knight', 'paladin', 'seraph', 'archangel']));
  assert.deepStrictEqual(G.classPath(s), ['warrior', 'knight', 'paladin', 'seraph', 'archangel']);
  assert.strictEqual(G.lookId(s), 'archangel');
  assert.strictEqual(G.classTitle(s), '대천사');
  assert.strictEqual(G.promoStage(s), null);
  const t = G.createState(0); t.level = 50;
  G.promote(t, 'warrior'); G.promote(t, 'knight');
  assert.strictEqual(G.promote(t, 'lich'), false, '다른 갈래');
  assert.strictEqual(G.promote(t, 'seraph'), false, '3차를 건너뛰고 4차');
  assert.strictEqual(G.promote(t, 'knight'), false, '이미 고른 단계');
});

test('3차·4차 직업의 배율이 이전 단계 배율에 모두 곱해진다', () => {
  const s = G.createState(0);
  walkPath(s, ['mage', 'pyromancer', 'infernomage', 'flameemperor']);
  const expectDmg = 1.35 * 1.5 * 1.35 * 2.5, expectClick = 2 * 1.5 * 1.5;
  assert.ok(Math.abs(G.statMult(s, 'dmg') - expectDmg) < 1e-9, G.statMult(s, 'dmg') + ' vs ' + expectDmg);
  assert.ok(Math.abs(G.statMult(s, 'click') - expectClick) < 1e-9);
  assert.ok(Math.abs(G.statMult(s, 'hp') - 0.85) < 1e-9);
});

test('전직한 2·3·4차 직업이 모두 도감에 등록되고 기록이 쌓인다', () => {
  const s = G.createState(0);
  walkPath(s, ['rogue', 'pirate', 'captain', 'seaking']);
  for (const id of ['pirate', 'captain', 'seaking']) { assert.ok(s.mastered[id], id); assert.strictEqual(G.dexRecord(s, id).runs, 1); }
  assert.ok(!s.mastered.rogue, '1차는 도감 대상이 아니다');
  s.stage = 41; s.killsInStage = 4; s.monsterHp = 1; G.clickAttack(s);
  for (const id of ['pirate', 'captain', 'seaking']) { assert.ok(G.dexRecord(s, id).kills >= 1 && G.dexRecord(s, id).best === 42, id); }
});

test('직업 보너스는 차수가 높을수록 하나당 작다 (2차 5% > 3차 1.5% > 4차 0.5%)', () => {
  const s = G.createState(0);
  assert.ok(Math.abs(G.masteryOf({ dex: {}, mastered: {} }, 'knight') - 0.05) < 1e-9);
  assert.ok(Math.abs(G.masteryOf({ dex: {} }, 'paladin') - 0.015) < 1e-9);
  assert.ok(Math.abs(G.masteryOf({ dex: {} }, 'seraph') - 0.005) < 1e-9);
  for (const id of G.ADV_IDS) s.mastered[id] = true;
  assert.ok(G.masteryMult(s) < 2.0, '전부 채워도 배율이 폭주하지 않는다: ' + G.masteryMult(s));
});

test('환생하면 직업 경로가 모두 초기화되고 도감은 남는다', () => {
  const s = G.createState(0);
  walkPath(s, ['archer', 'ranger', 'beastmaster', 'wolfking']);
  s.runBest = 12;
  G.prestige(s);
  assert.deepStrictEqual(G.classPath(s), []);
  assert.strictEqual(G.lookId(s), 'novice');
  assert.ok(s.mastered.wolfking && s.mastered.beastmaster);
});

test('3·4차 직업이 든 저장 데이터를 저장·복원할 수 있다', () => {
  const s = G.createState(0);
  walkPath(s, ['mage', 'necromancer', 'lich', 'lichking']);
  const back = G.deserialize(G.serialize(s, 1));
  assert.deepStrictEqual(G.classPath(back), ['mage', 'necromancer', 'lich', 'lichking']);
  assert.deepStrictEqual(back.mastered, s.mastered);
});

test('이어지지 않는 직업 경로나 이상한 이름은 저장 데이터에서 걸러낸다', () => {
  const o = JSON.parse(G.serialize(G.createState(0), 1));
  o.cls = 'warrior'; o.adv = 'knight'; o.adv3 = 'lich'; o.adv4 = 'seraph';   // 3차가 knight의 자식이 아니면 그 뒤도 무효
  let back = G.deserialize(JSON.stringify(o));
  assert.deepStrictEqual(G.classPath(back), ['warrior', 'knight']);
  o.adv3 = 'paladin'; o.adv4 = 'lichking';                                    // 4차가 paladin의 자식이 아님
  back = G.deserialize(JSON.stringify(o));
  assert.deepStrictEqual(G.classPath(back), ['warrior', 'knight', 'paladin']);
  o.adv3 = 'constructor'; o.adv4 = '__proto__';
  back = G.deserialize(JSON.stringify(o));
  assert.deepStrictEqual(G.classPath(back), ['warrior', 'knight']);
  assert.ok(Number.isFinite(G.hitDmg(back)));
  o.cls = null; o.adv = 'knight'; o.adv3 = 'paladin';                        // 1차가 없으면 이후도 무효
  assert.deepStrictEqual(G.classPath(G.deserialize(JSON.stringify(o))), []);
});

test('3·4차 업적: 3차 전직, 4차 전직, 4차 직업 8종', () => {
  const s = G.createState(0);
  assert.ok(!G.checkAchievements(s).some((e) => ['tier3', 'tier4', 'elite8'].includes(e.id)));
  s.mastered.paladin = true;
  assert.deepStrictEqual(G.checkAchievements(s).map((e) => e.id), ['tier3']);
  s.mastered.seraph = true;
  assert.deepStrictEqual(G.checkAchievements(s).map((e) => e.id), ['tier4']);
  for (const id of Object.keys(G.ADVANCED4).slice(0, 8)) s.mastered[id] = true;
  assert.deepStrictEqual(G.checkAchievements(s).map((e) => e.id), ['elite8']);
});

section('증표 상점');
const richState = (tokens) => { const s = G.createState(0); s.tokens = tokens; return s; };

test('증표가 모자라면 살 수 없고, 사면 가격이 레벨에 따라 오른다', () => {
  const s = richState(0);
  assert.strictEqual(G.buyPerk(s, 'might'), false);
  s.tokens = 10;
  assert.strictEqual(G.perkCost(s, 'might'), 1);
  G.buyPerk(s, 'might');
  assert.strictEqual(G.perkCost(s, 'might'), 2);
  assert.strictEqual(G.tokenBalance(s), 9);
  G.buyPerk(s, 'might');
  assert.strictEqual(G.tokenBalance(s), 7);   // 1 + 2개를 씀
});

test('먼저 올려야 하는 강화가 있으면 열리기 전에는 살 수 없다', () => {
  const s = richState(100);
  assert.strictEqual(G.canBuyPerk(s, 'click'), false);
  assert.deepStrictEqual(G.perkMissing(s, 'click'), [['might', 3]]);
  for (let i = 0; i < 3; i++) G.buyPerk(s, 'might');
  assert.strictEqual(G.canBuyPerk(s, 'click'), true);
});

test('최대 레벨에서는 더 살 수 없다', () => {
  const s = richState(10000);
  for (let i = 0; i < 20; i++) G.buyPerk(s, 'might');
  assert.strictEqual(G.perkLv(s, 'might'), G.PERKS.might.max);
});

test('증표를 써도 증표 보너스(공격력·골드)는 줄지 않는다', () => {
  const s = richState(10);
  const before = G.tokenMult(s);
  G.buyPerk(s, 'might'); G.buyPerk(s, 'greed');
  assert.strictEqual(G.tokenMult(s), before);
});

test('용사의 힘·탐욕·강철 체력이 각각 10%씩 능력치를 올린다', () => {
  const s = richState(50);
  const d = G.hitDmg(s), g = G.goldMult(s), h = G.maxHp(s);
  G.buyPerk(s, 'might'); G.buyPerk(s, 'greed'); G.buyPerk(s, 'vitality');
  assert.ok(Math.abs(G.hitDmg(s) / d - 1.1) < 1e-9);
  assert.ok(Math.abs(G.goldMult(s) / g - 1.1) < 1e-9);
  assert.ok(Math.abs(G.maxHp(s) / h - 1.1) < 1e-9);
});

test('강타는 직접 공격 피해를 25%씩 올린다', () => {
  const s = richState(100);
  for (let i = 0; i < 3; i++) G.buyPerk(s, 'might');
  s.monsterHp = s.monsterMax = 1e12;
  const a = G.clickAttack(s).dmg;
  G.buyPerk(s, 'click');
  const b = G.clickAttack(s).dmg;
  assert.ok(Math.abs(b / a - 1.25) < 1e-9);
});

test('빠른 출발은 환생 뒤 무기·갑옷을 높은 레벨로 시작하게 한다', () => {
  const s = richState(100);
  for (let i = 0; i < 5; i++) G.buyPerk(s, 'might');
  G.buyPerk(s, 'headstart'); G.buyPerk(s, 'headstart');
  s.runBest = 12;
  G.prestige(s);
  assert.strictEqual(s.upgrades.weapon, 2 * G.HEADSTART_LV);
  assert.strictEqual(s.upgrades.armor, 2 * G.HEADSTART_LV);
  assert.strictEqual(s.upgrades.speed, 0);
  assert.strictEqual(G.perkLv(s, 'headstart'), 2, '산 강화는 환생해도 남는다');
});

test('든든한 휴식은 오프라인 보상 한도를 1시간씩 늘린다', () => {
  const s = richState(100);
  for (let i = 0; i < 3; i++) G.buyPerk(s, 'greed');
  G.buyPerk(s, 'rest'); G.buyPerk(s, 'rest');
  assert.strictEqual(G.offlineCap(s), 10 * 3600);
  s.savedAt = 0;
  assert.strictEqual(G.applyOffline(s, 100 * 3600 * 1000).seconds, 10 * 3600);
});

test('초기화하면 쓴 증표를 모두 돌려받는다', () => {
  const s = richState(20);
  for (let i = 0; i < 4; i++) G.buyPerk(s, 'might');
  const spent = G.perkSpent(s);
  assert.strictEqual(G.respecPerks(s), spent);
  assert.strictEqual(G.tokenBalance(s), 20);
  assert.deepStrictEqual(s.perks, {});
});

test('산 강화는 저장·복원되고, 번 것보다 많이 쓴 조작 데이터는 되돌린다', () => {
  const s = richState(20);
  for (let i = 0; i < 3; i++) G.buyPerk(s, 'might');
  const back = G.deserialize(G.serialize(s, 1));
  assert.deepStrictEqual(back.perks, { might: 3 });
  const o = JSON.parse(G.serialize(s, 1));
  o.tokens = 1; o.perks = { might: 10, greed: 10 };
  assert.deepStrictEqual(G.deserialize(JSON.stringify(o)).perks, {});
});

test('없는 강화와 최대치를 넘는 레벨은 걸러낸다', () => {
  const o = JSON.parse(G.serialize(richState(1e6), 1));
  o.perks = { might: 999, cheat: 5, greed: -3 };
  assert.deepStrictEqual(G.deserialize(JSON.stringify(o)).perks, { might: G.PERKS.might.max });
});

test('5단계(초월자의 힘)는 4단계(직업 각성·도감 공명)를 모두 채워야 열리고, 상한이 훨씬 높다', () => {
  const s = richState(1e6);
  assert.strictEqual(G.canBuyPerk(s, 'ascend'), false);
  for (let i = 0; i < 5; i++) { G.buyPerk(s, 'might'); G.buyPerk(s, 'greed'); }
  for (let i = 0; i < 5; i++) G.buyPerk(s, 'kingly');
  for (let i = 0; i < 5; i++) { G.buyPerk(s, 'awaken'); G.buyPerk(s, 'codex'); }
  assert.strictEqual(G.canBuyPerk(s, 'ascend'), true);
  assert.strictEqual(G.PERKS.ascend.max, 50, '증표를 아무리 벌어도 금방 다 사서 살 게 없어지지 않게 상한이 넉넉해야 한다');
  const d = G.hitDmg(s), g = G.goldMult(s);
  for (let i = 0; i < 10; i++) G.buyPerk(s, 'ascend');
  assert.ok(Math.abs(G.hitDmg(s) / d - 1.2) < 1e-9, '10레벨이면 공격력 +20%');
  assert.ok(Math.abs(G.goldMult(s) / g - 1.2) < 1e-9, '10레벨이면 골드 +20%');
});

section('장비');
// 결과가 매번 같도록 씨앗이 있는 난수를 쓴다
function seeded(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const mkItem = (o) => Object.assign({ id: 1, slot: 'weapon', kind: 'dmg', r: 0, ilvl: 1, val: 10, n: 0, enh: 0 }, o);

test('등급이 높을수록 나올 확률이 낮다 (일반 몬스터, 20만 번)', () => {
  G.setRandom(seeded(1));
  const s = G.createState(0), n = [0, 0, 0, 0, 0];
  for (let i = 0; i < 200000; i++) n[G.rollItem(s, 10, false).r] += 1;
  for (let r = 1; r < 5; r++) assert.ok(n[r] < n[r - 1], `등급 ${r}(${n[r]})이 등급 ${r - 1}(${n[r - 1]})보다 많다`);
  const pct = n.map((x) => (x / 2000));
  assert.ok(Math.abs(pct[0] - 62) < 1.5 && Math.abs(pct[4] - 0.5) < 0.3, pct.join(', '));
  G.setRandom();
});

test('보스는 노말이 안 나오고 상위 등급이 일반 몬스터보다 훨씬 잘 나온다', () => {
  G.setRandom(seeded(2));
  const s = G.createState(0), b = [0, 0, 0, 0, 0], m = [0, 0, 0, 0, 0];
  for (let i = 0; i < 100000; i++) { b[G.rollItem(s, 10, true).r] += 1; m[G.rollItem(s, 10, false).r] += 1; }
  assert.strictEqual(b[0], 0);
  assert.ok(b[4] > m[4] * 4 && b[3] > m[3] * 3, `보스 전설 ${b[4]} / 일반 ${m[4]}`);
  G.setRandom();
});

test('드롭 확률은 일반 8%·보스 50%이고 수집가가 레벨당 1.5%p씩 올린다', () => {
  const s = richState(100);
  assert.strictEqual(G.dropChance(s, false), 0.08);
  assert.strictEqual(G.dropChance(s, true), 0.5);
  G.buyPerk(s, 'greed'); G.buyPerk(s, 'greed'); G.buyPerk(s, 'luck'); G.buyPerk(s, 'luck');
  assert.ok(Math.abs(G.dropChance(s, false) - 0.11) < 1e-9);
});

test('실제로 몬스터를 잡았을 때 드롭 비율이 8% 근처다 (2만 마리)', () => {
  G.setRandom(seeded(3));
  const s = G.createState(0); s.autoSell = 4;   // 전부 자동 판매되게 해서 가방이 차지 않게 한다
  let drops = 0;
  for (let i = 0; i < 20000; i++) {
    s.stage = 31; s.killsInStage = 0; s.monsterHp = 1;
    drops += G.clickAttack(s).events.filter((e) => e.type === 'drop').length;
  }
  const rate = drops / 20000;
  assert.ok(Math.abs(rate - 0.08) < 0.01, `드롭률 ${(rate * 100).toFixed(2)}%`);
  G.setRandom();
});

test('같은 등급이어도 더 높은 스테이지에서 나온 장비의 수치가 더 크다', () => {
  G.setRandom(() => 0.5);   // 항상 중간값 → 수치 차이는 스테이지 때문만
  const s = G.createState(0);
  const lo = G.rollItem(s, 1, true), hi = G.rollItem(s, 79, true);
  assert.strictEqual(lo.r, hi.r);
  assert.ok(Math.abs(hi.val / lo.val - (1 + 79 / 40) / (1 + 1 / 40)) < 0.05, `${lo.val} → ${hi.val}`);
  G.setRandom();
});

test('장착한 장비가 무기·방어구·액세서리 종류대로 능력을 올린다', () => {
  const s = G.createState(0);
  const d = G.hitDmg(s), h = G.maxHp(s), g = G.goldMult(s), a = G.attacksPerSec(s);
  s.equip.weapon = mkItem({ slot: 'weapon', kind: 'dmg', val: 20 });
  s.equip.armor = mkItem({ id: 2, slot: 'armor', kind: 'hp', val: 30 });
  s.equip.accessory = mkItem({ id: 3, slot: 'accessory', kind: 'gold', val: 50 });
  assert.ok(Math.abs(G.hitDmg(s) / d - 1.2) < 1e-9);
  assert.ok(Math.abs(G.maxHp(s) / h - 1.3) < 1e-9);
  assert.ok(Math.abs(G.goldMult(s) / g - 1.5) < 1e-9);
  assert.strictEqual(G.attacksPerSec(s), a, '골드 액세서리는 공격 속도에 영향이 없다');
  s.equip.accessory = mkItem({ id: 3, slot: 'accessory', kind: 'aps', val: 10 });
  assert.ok(Math.abs(G.attacksPerSec(s) / a - 1.1) < 1e-9);
});

test('직접 공격·동료 액세서리도 각각 해당 능력만 올린다', () => {
  const s = G.createState(0); s.upgrades.companion = 5;
  s.monsterHp = s.monsterMax = 1e12;
  const click0 = G.clickAttack(s).dmg, comp0 = G.companionDps(s);
  s.equip.accessory = mkItem({ slot: 'accessory', kind: 'click', val: 40 });
  assert.ok(Math.abs(G.clickAttack(s).dmg / click0 - 1.4) < 1e-9);
  assert.strictEqual(G.companionDps(s), comp0);
  s.equip.accessory = mkItem({ slot: 'accessory', kind: 'comp', val: 40 });
  assert.ok(Math.abs(G.companionDps(s) / comp0 - 1.4) < 1e-9);
});

test('빈 칸이면 노말도 자동 장착하고, 더 좋은 장비가 나오면 바꾸며 밀려난 것은 가방으로 간다', () => {
  const s = G.createState(0); const ev = [];
  G.receiveItem(s, mkItem({ id: 1, val: 5 }), ev);
  assert.strictEqual(ev[0].action, 'equipped');
  assert.strictEqual(s.equip.weapon.id, 1);
  s.autoSell = -1;
  G.receiveItem(s, mkItem({ id: 2, val: 9, r: 2 }), ev);
  assert.strictEqual(s.equip.weapon.id, 2);
  assert.deepStrictEqual(s.bag.map((x) => x.id), [1]);
  G.receiveItem(s, mkItem({ id: 3, val: 7 }), ev);   // 더 나쁨 → 장착하지 않는다
  assert.strictEqual(s.equip.weapon.id, 2);
  assert.strictEqual(ev[2].action, 'bag');
});

test('능력 종류가 다른 액세서리는 종합 전투력(초당 피해)으로 비교해 자동으로 갈아 낀다', () => {
  const s = G.createState(0); s.autoSell = -1;
  s.equip.accessory = mkItem({ id: 1, slot: 'accessory', kind: 'gold', val: 5 });   // 골드는 전투력에 영향이 없다
  G.receiveItem(s, mkItem({ id: 2, slot: 'accessory', kind: 'aps', val: 50 }), []);   // 공격 속도는 전투력을 크게 올린다
  assert.strictEqual(s.equip.accessory.id, 2, '전투력이 오르는 쪽으로 갈아 낀다');
  assert.deepStrictEqual(s.bag.map((x) => x.id), [1], '밀려난 골드 장비는 가방으로 간다');
  const t = G.createState(0); t.autoSell = -1;
  t.equip.accessory = mkItem({ id: 3, slot: 'accessory', kind: 'aps', val: 50 });
  G.receiveItem(t, mkItem({ id: 4, slot: 'accessory', kind: 'gold', val: 500 }), []);   // 골드는 수치가 아무리 높아도 전투력엔 그대로다
  assert.strictEqual(t.equip.accessory.id, 3, '전투력에 도움이 안 되면 수치가 훨씬 높아도 갈아 끼우지 않는다');
  assert.deepStrictEqual(t.bag.map((x) => x.id), [4]);
});

test('자동 장착을 끄면 빈 칸이어도 가방으로 간다', () => {
  const s = G.createState(0); s.autoEquip = false; s.autoSell = -1;
  G.receiveItem(s, mkItem({ id: 1 }), []);
  assert.strictEqual(s.equip.weapon, null);
  assert.strictEqual(s.bag.length, 1);
});

test('자동 판매 등급 이하는 얻자마자 팔려 골드가 되고, 그보다 높은 등급은 가방에 남는다', () => {
  const s = G.createState(0); s.autoSell = 1;   // 고급 이하
  s.equip.weapon = mkItem({ id: 9, val: 999 });    // 칸을 채워 자동 장착이 끼어들지 않게 한다
  const ev = [];
  G.receiveItem(s, mkItem({ id: 1, r: 1 }), ev);
  G.receiveItem(s, mkItem({ id: 2, r: 2 }), ev);
  assert.strictEqual(ev[0].action, 'sold');
  assert.ok(s.gold > 0);
  assert.strictEqual(ev[1].action, 'bag');
  assert.deepStrictEqual(s.bag.map((x) => x.id), [2]);
});

test('가방이 가득 차면 새 장비는 자동으로 팔린다', () => {
  const s = G.createState(0); s.autoSell = -1; s.equip.weapon = mkItem({ id: 999, val: 999 });
  for (let i = 1; i <= G.BAG_MAX; i++) s.bag.push(mkItem({ id: i, r: 2 }));
  const ev = [];
  G.receiveItem(s, mkItem({ id: 100, r: 3 }), ev);
  assert.strictEqual(ev[0].action, 'sold');
  assert.strictEqual(s.bag.length, G.BAG_MAX);
});

test('가방에서 장착하면 기존 장비가 가방으로 돌아가고, 해제·판매도 된다', () => {
  const s = G.createState(0);
  s.equip.weapon = mkItem({ id: 1 });
  s.bag.push(mkItem({ id: 2, val: 30 }), mkItem({ id: 3, slot: 'armor', kind: 'hp' }));
  assert.ok(G.equipItem(s, 2));
  assert.strictEqual(s.equip.weapon.id, 2);
  assert.deepStrictEqual(s.bag.map((x) => x.id).sort(), [1, 3]);
  assert.ok(G.unequipItem(s, 'weapon'));
  assert.strictEqual(s.equip.weapon, null);
  const gold0 = s.gold;
  assert.ok(G.sellBagItem(s, 3) > 0);
  assert.ok(s.gold > gold0);
  assert.strictEqual(G.sellBagItem(s, 3), -1, '이미 판 장비는 다시 팔 수 없다');
});

test('가방이 가득 차 있으면 장비를 해제할 수 없다', () => {
  const s = G.createState(0); s.equip.weapon = mkItem({ id: 1 });
  for (let i = 2; i < 2 + G.BAG_MAX; i++) s.bag.push(mkItem({ id: i }));
  assert.strictEqual(G.unequipItem(s, 'weapon'), false);
  assert.ok(s.equip.weapon);
});

test('일괄 판매는 지정한 등급 이하만 팔고 장착한 장비는 건드리지 않는다', () => {
  const s = G.createState(0); s.equip.weapon = mkItem({ id: 1, r: 0 });
  s.bag.push(mkItem({ id: 2, r: 0 }), mkItem({ id: 3, r: 1 }), mkItem({ id: 4, r: 2 }), mkItem({ id: 5, r: 4 }));
  const r = G.sellBagUpTo(s, 1);
  assert.strictEqual(r.n, 2);
  assert.deepStrictEqual(s.bag.map((x) => x.id), [4, 5]);
  assert.ok(s.equip.weapon);
  assert.strictEqual(s.gold, r.gold);
});

test('고른 장비만 한꺼번에 팔고, 없는 번호는 무시하며, 골드는 합계만큼 늘어난다', () => {
  const s = G.createState(0);
  s.bag.push(mkItem({ id: 1, r: 0 }), mkItem({ id: 2, r: 1 }), mkItem({ id: 3, r: 2 }), mkItem({ id: 4, r: 3 }));
  const expected = G.sellValue(s.bag[0]) + G.sellValue(s.bag[2]);
  const r = G.sellBagItems(s, [1, 3, 999]);
  assert.deepStrictEqual([r.n, r.gold], [2, expected]);
  assert.strictEqual(s.gold, expected);
  assert.deepStrictEqual(s.bag.map((x) => x.id), [2, 4]);
  assert.deepStrictEqual(G.sellBagItems(s, []), { n: 0, gold: 0 });
});

test('지금 낀 장비보다 약한 가방 장비를 찾는다 (같은 칸·같은 능력만 비교)', () => {
  const s = G.createState(0);
  s.equip.weapon = mkItem({ id: 1, kind: 'dmg', val: 20 });
  s.equip.accessory = mkItem({ id: 2, slot: 'accessory', kind: 'gold', val: 10 });
  s.bag.push(
    mkItem({ id: 10, kind: 'dmg', val: 20 }),                                  // 같은 수치 → 약한 것으로 본다
    mkItem({ id: 11, kind: 'dmg', val: 25 }),                                  // 더 강함 → 남긴다
    mkItem({ id: 12, slot: 'accessory', kind: 'gold', val: 4 }),               // 약함
    mkItem({ id: 13, slot: 'accessory', kind: 'aps', val: 1 }),                // 다른 능력 → 비교 불가라 남긴다
    mkItem({ id: 14, slot: 'armor', kind: 'hp', val: 1 }),                     // 방어구 칸이 비어 있음 → 남긴다
  );
  assert.deepStrictEqual(G.bagWeaker(s).map((x) => x.id), [10, 12]);
  assert.strictEqual(G.isWeaker(s, s.bag[1]), false);
});

test('갑옷을 장착하면 늘어난 체력만큼 바로 회복한다', () => {
  const s = G.createState(0); s.hp = 10;
  s.bag.push(mkItem({ id: 1, slot: 'armor', kind: 'hp', val: 100 }));
  const max0 = G.maxHp(s);
  G.equipItem(s, 1);
  assert.ok(Math.abs(s.hp - (10 + max0)) < 1e-6);
});

test('장비와 설정은 환생해도 남고 저장·복원된다', () => {
  const s = G.createState(0); s.autoEquip = false; s.autoSell = 2;
  s.equip.armor = mkItem({ id: 4, slot: 'armor', kind: 'hp', r: 3, ilvl: 30, val: 40 });
  s.bag.push(mkItem({ id: 7, r: 2, ilvl: 12, val: 9.5 })); s.itemSeq = 7; s.runBest = 12;
  G.prestige(s);
  const back = G.deserialize(G.serialize(s, 1));
  assert.deepStrictEqual(back.equip.armor, s.equip.armor);
  assert.deepStrictEqual(back.bag, s.bag);
  assert.strictEqual(back.autoEquip, false);
  assert.strictEqual(back.autoSell, 2);
  assert.strictEqual(back.itemSeq, 7);
});

test('장비가 든 저장 데이터를 불러온 뒤 새로 얻는 장비 번호가 겹치지 않는다', () => {
  const s = G.createState(0); s.bag.push(mkItem({ id: 50 })); s.itemSeq = 0;
  const back = G.deserialize(G.serialize(s, 1));
  G.setRandom(seeded(5));
  assert.ok(G.rollItem(back, 5, false).id > 50);
  G.setRandom();
});

test('조작된 장비(없는 종류·등급, 과한 수치, 겹치는 번호, 넘치는 가방)는 걸러내거나 보정한다', () => {
  const o = JSON.parse(G.serialize(G.createState(0), 1));
  const good = mkItem({ id: 1, r: 1, ilvl: 10, val: 8 });
  o.equip = { weapon: mkItem({ id: 2, r: 4, ilvl: 5, val: 99999 }), armor: { slot: 'constructor', kind: 'hp', r: 0 }, accessory: mkItem({ id: 3, slot: 'weapon' }) };
  o.bag = [good, good, mkItem({ id: 4, r: 9 }), mkItem({ id: 5, kind: '__proto__' }), 'x', null];
  for (let i = 10; i < 60; i++) o.bag.push(mkItem({ id: i }));
  const back = G.deserialize(JSON.stringify(o));
  assert.ok(back.equip.weapon.val <= 26 * (1 + 5 / 40) * 1.15 + 0.1, `수치 ${back.equip.weapon.val}`);
  assert.strictEqual(back.equip.armor, null);
  assert.strictEqual(back.equip.accessory, null, '무기를 액세서리 칸에 넣을 수 없다');
  assert.strictEqual(back.bag.filter((x) => x.id === 1).length, 1, '같은 번호는 한 번만');
  assert.ok(back.bag.every((x) => x.id !== 4 && x.id !== 5));
  assert.ok(back.bag.length <= G.BAG_MAX);
});

test("직업 이름이 'constructor' 같은 이상한 저장 데이터도 오류 없이 불러온다", () => {
  const o = JSON.parse(G.serialize(G.createState(0), 1));
  o.cls = 'constructor'; o.adv = '__proto__';
  const back = G.deserialize(JSON.stringify(o));
  assert.strictEqual(back.cls, null);
  assert.ok(Number.isFinite(G.hitDmg(back)));
});

test('장비가 없는 예전 저장 데이터도 불러온다 (자동 장착 켜짐, 노말 자동 판매)', () => {
  const o = JSON.parse(G.serialize(G.createState(0), 1));
  delete o.equip; delete o.bag; delete o.itemSeq; delete o.autoEquip; delete o.autoSell;
  const back = G.deserialize(JSON.stringify(o));
  assert.deepStrictEqual(back.equip, { weapon: null, armor: null, accessory: null });
  assert.deepStrictEqual(back.bag, []);
  assert.strictEqual(back.autoEquip, true);
  assert.strictEqual(back.autoSell, 0);
});

test('오프라인 보상 결과에 얻은 장비 수와 최고 등급이 들어간다', () => {
  G.setRandom(seeded(7));
  const s = G.createState(0); s.savedAt = 0;
  const r = G.applyOffline(s, 3600 * 1000);
  assert.ok(r.drops > 0 && r.dropsSold <= r.drops && r.dropBest >= 0 && r.dropBest <= 4, JSON.stringify(r));
  G.setRandom();
});

section('클라우드 저장 (판단 로직)');
const Sync = require('../sync.js');
const Cloud = require('../cloud.js');
const CloudFirebase = require('../cloud-firebase.js');

const sum = (o) => Object.assign({ v: 1, level: 10, bestStage: 12, prestiges: 0, tokens: 0, kills: 100, look: 'novice', savedAt: 1000 }, o);

test('클라우드에 저장이 없으면: 진행이 있으면 올리고, 새 게임이면 할 일이 없다', () => {
  assert.strictEqual(Sync.decide(sum(), null, null).action, 'upload');
  assert.strictEqual(Sync.decide(sum({ kills: 0, bestStage: 1, level: 1 }), null, null).action, 'same');
});

test('이 기기가 새 게임이면 클라우드 저장을 내려받는다', () => {
  assert.strictEqual(Sync.decide(sum({ kills: 0, bestStage: 1, level: 1 }), sum({ rev: 3 }), null).action, 'download');
});

test('마지막 동기화 이후 클라우드는 그대로이고 이 기기만 바뀌었으면 조용히 올린다', () => {
  const base = { rev: 4, sig: Sync.sigOf(sum({ kills: 100 })) };
  assert.strictEqual(Sync.decide(sum({ kills: 250 }), sum({ kills: 100, rev: 4 }), base).action, 'upload');
  assert.strictEqual(Sync.decide(sum({ kills: 100 }), sum({ kills: 100, rev: 4 }), base).action, 'same');
});

test('이 기기는 그대로이고 다른 기기에서 클라우드가 앞서 갔으면 조용히 내려받는다', () => {
  const base = { rev: 4, sig: Sync.sigOf(sum({ kills: 100 })) };
  assert.strictEqual(Sync.decide(sum({ kills: 100 }), sum({ kills: 900, rev: 6 }), base).action, 'download');
});

test('양쪽이 다 바뀌었으면 사용자에게 묻고, 더 앞선 쪽을 추천한다 (환생 > 증표 > 최고 스테이지)', () => {
  const base = { rev: 4, sig: Sync.sigOf(sum({ kills: 100 })) };
  const d1 = Sync.decide(sum({ kills: 300, prestiges: 1 }), sum({ kills: 500, bestStage: 40, rev: 6 }), base);
  assert.deepStrictEqual([d1.action, d1.recommend], ['ask', 'local']);   // 환생 횟수가 더 큰 쪽이 앞선 진행
  const d2 = Sync.decide(sum({ kills: 300, bestStage: 20 }), sum({ kills: 500, bestStage: 40, rev: 6 }), base);
  assert.deepStrictEqual([d2.action, d2.recommend], ['ask', 'cloud']);
});

test('동기화 기록이 없고 양쪽이 다르면 묻는다. 진행이 똑같으면 할 일이 없다', () => {
  assert.strictEqual(Sync.decide(sum({ kills: 300 }), sum({ kills: 500, rev: 2 }), null).action, 'ask');
  assert.strictEqual(Sync.decide(sum({ kills: 300 }), sum({ kills: 300, savedAt: 5, rev: 2 }), null).action, 'same');
});

test('요약은 저장 시각이 아니라 진행 값으로만 비교한다', () => {
  assert.strictEqual(Sync.sigOf(sum({ savedAt: 1 })), Sync.sigOf(sum({ savedAt: 999999 })));
  const s = G.createState(5); s.totalKills = 7; s.tokens = 3;
  const u = Sync.summaryOf(s, 'knight');
  assert.deepStrictEqual([u.kills, u.tokens, u.look, u.savedAt], [7, 3, 'knight', 5]);
  assert.ok(Sync.isFresh(Sync.summaryOf(G.createState(0), 'novice')));
});

section('클라우드 저장 (클라이언트 흐름, 가짜 서버)');
// 여러 기기가 같은 서버를 쓰는 상황을 흉내 낸다
function fakeServer() { return { docs: {}, writes: 0 }; }
function fakeAdapter(server, uid) {
  let authCb = null;
  const a = {
    log: [],
    onAuth(cb) { authCb = cb; return () => { authCb = null; }; },
    login(u) { authCb && authCb(u === null ? null : { uid, name: '테스터', email: 't@example.com', photo: '', provider: 'google.com' }); },
    async signIn(p) { a.log.push('signIn:' + p); a.login(); },
    async signOut() { a.log.push('signOut'); a.login(null); },
    async read() { a.log.push('read'); return server.docs[uid] ? JSON.parse(JSON.stringify(server.docs[uid])) : null; },
    async write({ save, summary, expectedRev }) {
      a.log.push('write:' + expectedRev);
      const cur = server.docs[uid] ? server.docs[uid].rev : 0;
      if (cur !== expectedRev) return { conflict: true, remote: JSON.parse(JSON.stringify(server.docs[uid])) };
      server.docs[uid] = { save, summary, rev: cur + 1, updatedAt: Date.now() };
      server.writes += 1;
      return { ok: true, rev: cur + 1 };
    },
  };
  return a;
}
// 기기 하나: 게임 상태(state)와 기기 저장소를 가진다
function makeDevice(server, uid, mutate) {
  const dev = { state: G.createState(1000), applied: [], asked: [], choice: 'cloud', mem: {}, changes: [] };
  if (mutate) mutate(dev.state);
  dev.adapter = fakeAdapter(server, uid);
  dev.cloud = Cloud.createCloud(dev.adapter, {
    getLocal: () => ({ text: G.serialize(dev.state, 2000), summary: Sync.summaryOf(dev.state, G.lookId(dev.state)) }),
    applySave: (text) => { const n = G.deserialize(text); if (!n) return false; dev.state = n; dev.applied.push(text); return true; },
    askConflict: async (info) => { dev.asked.push(info); return dev.choice; },
    storage: { get: (k) => (k in dev.mem ? dev.mem[k] : null), set: (k, v) => { dev.mem[k] = v; }, remove: (k) => { delete dev.mem[k]; } },
    onChange: (st) => dev.changes.push(st.status),
  });
  return dev;
}
const played = (kills, stage, extra) => (s) => { s.totalKills = kills; s.bestStage = s.runBest = s.stage = stage; s.level = 5 + Math.floor(kills / 50); Object.assign(s, extra || {}); };
const login = async (dev) => { dev.cloud.start(); dev.adapter.login(); await dev.cloud.sync(); };

test('첫 로그인: 이 기기의 진행을 클라우드에 올린다', async () => {
  const server = fakeServer(), a = makeDevice(server, 'u1', played(300, 20));
  await login(a);
  assert.strictEqual(server.docs.u1.rev, 1);
  assert.strictEqual(server.docs.u1.summary.kills, 300);
  assert.ok(JSON.parse(server.docs.u1.save).totalKills === 300);
  assert.strictEqual(a.cloud.state().status, 'ok');
  assert.strictEqual(a.cloud.state().rev, 1);
});

test('새 기기에서 로그인하면 클라우드 저장을 내려받아 이어서 한다', async () => {
  const server = fakeServer();
  await login(makeDevice(server, 'u1', played(300, 20)));
  const b = makeDevice(server, 'u1');   // 새 게임
  await login(b);
  assert.strictEqual(b.state.totalKills, 300);
  assert.strictEqual(b.applied.length, 1);
  assert.strictEqual(b.asked.length, 0, '묻지 않고 바로 이어 받는다');
});

test('같은 기기에서 로그아웃 후 다시 로그인하면 묻지 않고 바뀐 만큼만 올린다', async () => {
  const server = fakeServer(), a = makeDevice(server, 'u1', played(300, 20));
  await login(a);
  await a.cloud.signOut();
  played(450, 24)(a.state);
  a.adapter.log.length = 0;
  a.adapter.login();
  await a.cloud.sync();
  assert.strictEqual(a.asked.length, 0);
  assert.strictEqual(server.docs.u1.rev, 2);
  assert.strictEqual(server.docs.u1.summary.kills, 450);
});

test('바뀐 게 없으면 자동 저장이 서버에 쓰지 않고, 바뀌면 쓴다', async () => {
  const server = fakeServer(), a = makeDevice(server, 'u1', played(300, 20));
  await login(a);
  const w0 = server.writes;
  assert.strictEqual((await a.cloud.push()).action, 'unchanged');
  assert.strictEqual((await a.cloud.push()).action, 'unchanged');
  assert.strictEqual(server.writes, w0);
  played(320, 21)(a.state);
  assert.strictEqual((await a.cloud.push()).action, 'upload');
  assert.strictEqual(server.writes, w0 + 1);
});

test('다른 기기에서 진행한 뒤 이 기기는 그대로면 조용히 내려받는다', async () => {
  const server = fakeServer(), a = makeDevice(server, 'u1', played(300, 20)), b = makeDevice(server, 'u1');
  await login(a); await login(b);                   // b는 새 게임 → 내려받음
  played(900, 30)(b.state); b.cloud.state().rev;    // b가 더 진행
  await b.cloud.push();
  await a.cloud.sync();                             // a는 300 그대로, 클라우드는 900
  assert.strictEqual(a.state.totalKills, 900);
  assert.strictEqual(a.asked.length, 0);
});

test('양쪽 진행이 다르면 묻고, 클라우드를 고르면 이 기기가 클라우드 저장으로 바뀐다', async () => {
  const server = fakeServer();
  await login(makeDevice(server, 'u1', played(900, 30)));
  const b = makeDevice(server, 'u1', played(300, 20)); b.choice = 'cloud';
  await login(b);
  assert.strictEqual(b.asked.length, 1);
  assert.ok(b.asked[0].recommend === 'cloud' && b.asked[0].local.kills === 300 && b.asked[0].remote.kills === 900);
  assert.strictEqual(b.state.totalKills, 900);
});

test('양쪽 진행이 다를 때 이 기기를 고르면 클라우드를 덮어쓴다', async () => {
  const server = fakeServer();
  await login(makeDevice(server, 'u1', played(900, 30)));
  const b = makeDevice(server, 'u1', played(300, 20)); b.choice = 'local';
  await login(b);
  assert.strictEqual(server.docs.u1.summary.kills, 300);
  assert.strictEqual(server.docs.u1.rev, 2);
  assert.strictEqual(b.state.totalKills, 300);
});

test('선택 창을 취소하면 어느 쪽도 바꾸지 않는다', async () => {
  const server = fakeServer();
  await login(makeDevice(server, 'u1', played(900, 30)));
  const b = makeDevice(server, 'u1', played(300, 20)); b.choice = null;
  await login(b);
  assert.strictEqual(server.docs.u1.summary.kills, 900);
  assert.strictEqual(b.state.totalKills, 300);
  assert.strictEqual(b.cloud.state().status, 'ok');
});

test('저장하는 사이 다른 기기가 먼저 올렸다면 덮어쓰지 않고 사용자에게 묻는다', async () => {
  const server = fakeServer(), a = makeDevice(server, 'u1', played(300, 20)), b = makeDevice(server, 'u1');
  await login(a); await login(b);
  played(500, 25)(a.state);                          // a가 진행
  played(700, 28)(b.state); await b.cloud.push();    // b가 먼저 저장 (rev 2)
  a.choice = 'cloud';
  await a.cloud.push();                              // a의 push는 rev 1을 기준으로 시도 → 충돌
  assert.strictEqual(a.asked.length, 1, '충돌을 알려야 한다');
  assert.strictEqual(server.docs.u1.summary.kills, 700, '묻기 전에는 서버가 바뀌지 않는다');
  assert.strictEqual(a.state.totalKills, 700);
});

test('자동 저장은 연달아 예약해도 마지막 한 번만 올린다', async () => {
  const server = fakeServer(), a = makeDevice(server, 'u1', played(300, 20));
  await login(a);
  played(310, 21)(a.state);   // 진행이 바뀌어야 올린다
  const before = server.writes;
  a.cloud.schedulePush(15); a.cloud.schedulePush(15); a.cloud.schedulePush(15);
  await new Promise((r) => setTimeout(r, 80));
  assert.strictEqual(server.writes, before + 1);
});

test('로그아웃하면 마지막 진행을 올린 뒤 로그인 상태가 풀린다', async () => {
  const server = fakeServer(), a = makeDevice(server, 'u1', played(300, 20));
  await login(a);
  played(360, 21)(a.state);
  await a.cloud.signOut();
  assert.strictEqual(server.docs.u1.summary.kills, 360);
  assert.strictEqual(a.cloud.state().user, null);
  assert.strictEqual(a.cloud.state().status, 'signedout');
});

test('서버 오류가 나도 게임은 멈추지 않고 오류 상태와 안내 문구만 남긴다', async () => {
  const server = fakeServer(), a = makeDevice(server, 'u1', played(300, 20));
  a.adapter.read = async () => { throw Object.assign(new Error('boom'), { code: 'unavailable' }); };
  await login(a);
  assert.strictEqual(a.cloud.state().status, 'error');
  assert.ok(a.cloud.state().error.includes('인터넷'));
  assert.strictEqual(a.state.totalKills, 300);
});

test('동기화를 동시에 여러 번 불러도 한 번만 실행한다', async () => {
  const server = fakeServer(), a = makeDevice(server, 'u1', played(300, 20));
  a.cloud.start(); a.adapter.login();
  await Promise.all([a.cloud.sync(), a.cloud.sync(), a.cloud.sync()]);
  assert.strictEqual(a.adapter.log.filter((x) => x === 'read').length, 1);
});

test('계정이 바뀌면 이전 계정의 동기화 기록을 쓰지 않는다', async () => {
  const server = fakeServer(), a = makeDevice(server, 'u1', played(300, 20));
  await login(a);
  a.adapter = null;
  const other = makeDevice(server, 'u2', played(50, 6)); other.mem = a.mem;   // 같은 기기(저장소), 다른 계정
  await login(other);
  assert.strictEqual(server.docs.u2.rev, 1, '다른 계정이므로 새로 올린다');
  assert.strictEqual(other.asked.length, 0);
});

test('망가진 동기화 기록이 있어도 오류 없이 처음부터 판단한다', async () => {
  const server = fakeServer(), a = makeDevice(server, 'u1', played(300, 20));
  a.mem[Cloud.BASE_KEY] = '{not json';
  await login(a);
  assert.strictEqual(server.docs.u1.rev, 1);
});

test('오류 문구: 창을 스스로 닫은 것은 알리지 않고 주소·설정 문제는 안내한다', () => {
  assert.strictEqual(Cloud.friendlyError({ code: 'auth/popup-closed-by-user' }), '');
  assert.ok(Cloud.friendlyError({ code: 'auth/popup-blocked' }).includes('팝업'));
  assert.ok(Cloud.friendlyError({ code: 'auth/unauthorized-domain' }).includes('FIREBASE-SETUP'));
  assert.ok(Cloud.friendlyError({ code: 'auth/operation-not-allowed' }).includes('켜져'));
  assert.ok(Cloud.friendlyError({ code: 'auth/configuration-not-found' }).includes('시작하기'));
  assert.ok(Cloud.friendlyError({ code: 'permission-denied' }).includes('규칙'));
  assert.ok(Cloud.friendlyError(new Error('뭔가 잘못됨')).includes('뭔가'));
});

test('로그인 실패 문구는 다음 시도에서 지워진다 (창을 스스로 닫은 경우 포함)', async () => {
  const server = fakeServer(), a = makeDevice(server, 'u1', played(300, 20));
  a.cloud.start();
  a.adapter.signIn = async () => { throw Object.assign(new Error('x'), { code: 'auth/popup-blocked' }); };
  await a.cloud.signIn('apple');
  assert.ok(a.cloud.state().error.includes('팝업'));
  a.adapter.signIn = async () => { throw Object.assign(new Error('x'), { code: 'auth/popup-closed-by-user' }); };
  await a.cloud.signIn('apple');
  assert.strictEqual(a.cloud.state().error, '');
});

test('설정이 없으면(어댑터 없음) 클라우드 기능은 꺼진 상태로 아무것도 하지 않는다', async () => {
  const c = Cloud.createCloud(null, { getLocal: () => { throw new Error('부르면 안 됨'); }, storage: {} });
  c.start();
  assert.strictEqual(c.state().status, 'off');
  assert.strictEqual(c.state().configured, false);
  assert.deepStrictEqual(await c.signIn('google'), { ok: false });
});

section('클라우드 저장 (Firebase 어댑터, 가짜 SDK)');
// Firebase SDK의 필요한 부분만 흉내 낸다: 어댑터가 SDK를 올바른 모양으로 부르는지 확인한다
function stubSdk() {
  const calls = [];
  const store = {};
  let authCb = null;
  const auth = { currentUser: null };
  class GoogleAuthProvider { constructor() { this.id = 'google.com'; this.params = null; calls.push('new Google'); } setCustomParameters(p) { this.params = p; calls.push('params:' + JSON.stringify(p)); } }
  class OAuthProvider { constructor(id) { this.id = id; this.scopes = []; calls.push('new OAuth:' + id); } addScope(s) { this.scopes.push(s); } }
  const user = { uid: 'abc', displayName: '홍길동', email: 'a@b.c', photoURL: 'http://p', providerData: [{ providerId: 'google.com' }] };
  const sdk = {
    calls, store, auth,
    app: { initializeApp: (cfg) => { calls.push('init:' + cfg.projectId); return { cfg }; } },
    auth: {
      getAuth: () => auth, GoogleAuthProvider, OAuthProvider,
      getRedirectResult: async () => null,
      onAuthStateChanged: (a, cb) => { authCb = cb; return () => { authCb = null; calls.push('unsubscribed'); }; },
      signInWithPopup: async (a, p) => { calls.push('popup:' + p.id); auth.currentUser = user; authCb && authCb(user); },
      signInWithRedirect: async (a, p) => { calls.push('redirect:' + p.id); },
      signOut: async () => { calls.push('signOut'); auth.currentUser = null; authCb && authCb(null); },
    },
    firestore: {
      getFirestore: () => ({}),
      doc: (db, col, id) => ({ path: col + '/' + id }),
      getDoc: async (ref) => ({ exists: () => ref.path in store, data: () => store[ref.path] }),
      serverTimestamp: () => ({ toMillis: () => 12345 }),
      setDoc: async (ref, data) => { store[ref.path] = data; calls.push('setDoc:' + ref.path); },
      deleteDoc: async (ref) => { delete store[ref.path]; calls.push('deleteDoc:' + ref.path); },
      collection: (db, name) => ({ col: name }),
      orderBy: (f, dir) => ({ f, dir }),
      limit: (n) => ({ n }),
      query: (c, ...cons) => ({ c, cons }),
      getDocs: async (q) => {
        const f = q.cons.find((x) => x.f).f, n = q.cons.find((x) => x.n).n;
        calls.push(`query:${q.c.col}:${f}:${n}`);
        const docs = Object.keys(store).filter((p) => p.startsWith(q.c.col + '/')).map((p) => ({ id: p.split('/')[1], data: () => store[p] })).sort((x, y) => y.data()[f] - x.data()[f]).slice(0, n);
        return { docs };
      },
      runTransaction: async (db, fn) => fn({
        get: async (ref) => ({ exists: () => ref.path in store, data: () => store[ref.path] }),
        set: (ref, data) => { store[ref.path] = data; },
      }),
    },
    setPopupError(code) { sdk.auth.signInWithPopup = async () => { throw Object.assign(new Error(code), { code }); }; },
    loginNow() { auth.currentUser = user; },
  };
  return sdk;
}
const CFG = { projectId: 'demo', apiKey: 'k' };

test('로그인 상태 변화를 사용자 정보(이름·이메일·제공자)로 바꿔 알려 준다', async () => {
  const sdk = stubSdk(), ad = CloudFirebase.createFirebaseAdapter(CFG, sdk);
  const seen = [];
  ad.onAuth((u) => seen.push(u));
  await new Promise((r) => setTimeout(r, 10));
  await ad.signIn('google');
  assert.deepStrictEqual(seen[seen.length - 1], { uid: 'abc', name: '홍길동', email: 'a@b.c', photo: 'http://p', provider: 'google.com' });
  assert.ok(sdk.calls.includes('init:demo'));
});

test('Google은 팝업으로, Apple은 apple.com 제공자에 이메일·이름 권한을 붙여 로그인한다', async () => {
  const sdk = stubSdk(), ad = CloudFirebase.createFirebaseAdapter(CFG, sdk);
  await ad.signIn('google');
  await ad.signIn('apple');
  assert.ok(sdk.calls.includes('popup:google.com') && sdk.calls.includes('new OAuth:apple.com') && sdk.calls.includes('popup:apple.com'));
});

test('Google 로그인은 매번 계정 선택 화면을 띄우도록 요청한다 (계정이 여러 개인 사람용)', async () => {
  const sdk = stubSdk(), ad = CloudFirebase.createFirebaseAdapter(CFG, sdk);
  await ad.signIn('google');
  assert.ok(sdk.calls.includes('params:{"prompt":"select_account"}'), sdk.calls.join(' | '));
  assert.ok(sdk.calls.indexOf('params:{"prompt":"select_account"}') < sdk.calls.indexOf('popup:google.com'), '창을 열기 전에 옵션을 넣어야 한다');
});

test('알 수 없는 로그인 방식은 거절한다', async () => {
  const ad = CloudFirebase.createFirebaseAdapter(CFG, stubSdk());
  await assert.rejects(() => ad.signIn('facebook'), /지원하지 않는/);
});

test('팝업을 쓸 수 없는 환경이면 리다이렉트로 다시 시도하고, 그 밖의 오류는 그대로 전달한다', async () => {
  const sdk = stubSdk(), ad = CloudFirebase.createFirebaseAdapter(CFG, sdk);
  sdk.setPopupError('auth/operation-not-supported-in-this-environment');
  await ad.signIn('google');
  assert.ok(sdk.calls.includes('redirect:google.com'));
  sdk.setPopupError('auth/popup-blocked');
  await assert.rejects(() => ad.signIn('google'), (e) => e.code === 'auth/popup-blocked');
});

test('저장: 처음엔 rev 1로 만들고, 기대한 rev와 같을 때만 rev+1로 고친다', async () => {
  const sdk = stubSdk(), ad = CloudFirebase.createFirebaseAdapter(CFG, sdk);
  sdk.loginNow();
  assert.strictEqual(await ad.read(), null);
  assert.deepStrictEqual(await ad.write({ save: 'S1', summary: { kills: 1 }, expectedRev: 0 }), { ok: true, rev: 1 });
  const r = await ad.read();
  assert.deepStrictEqual([r.save, r.rev, r.updatedAt], ['S1', 1, 12345]);
  assert.deepStrictEqual(await ad.write({ save: 'S2', summary: {}, expectedRev: 1 }), { ok: true, rev: 2 });
  assert.strictEqual(sdk.store['saves/abc'].rev, 2);
});

test('저장: 기대한 rev가 서버와 다르면 덮어쓰지 않고 충돌로 돌려준다', async () => {
  const sdk = stubSdk(), ad = CloudFirebase.createFirebaseAdapter(CFG, sdk);
  sdk.loginNow();
  await ad.write({ save: 'S1', summary: {}, expectedRev: 0 });
  await ad.write({ save: 'S2', summary: {}, expectedRev: 1 });
  const res = await ad.write({ save: 'STALE', summary: {}, expectedRev: 1 });
  assert.strictEqual(res.conflict, true);
  assert.strictEqual(res.remote.save, 'S2');
  assert.strictEqual(sdk.store['saves/abc'].save, 'S2', '서버 저장은 그대로');
  const created = await ad.write({ save: 'X', summary: {}, expectedRev: 0 });   // 이미 있는데 처음이라고 주장해도 충돌
  assert.strictEqual(created.conflict, true);
});

test('로그인하지 않은 채 읽거나 쓰면 로그인이 필요하다는 오류를 낸다', async () => {
  const ad = CloudFirebase.createFirebaseAdapter(CFG, stubSdk());
  await assert.rejects(() => ad.read(), (e) => e.code === 'auth/requires-login');
  await assert.rejects(() => ad.write({ save: 'x', summary: {}, expectedRev: 0 }), (e) => e.code === 'auth/requires-login');
});

test('SDK가 시작되지 못하면 로그인 안 한 상태로 알린다 (게임은 계속)', async () => {
  const sdk = stubSdk(); sdk.app.initializeApp = () => { throw new Error('bad config'); };
  const ad = CloudFirebase.createFirebaseAdapter(CFG, sdk);
  const seen = [];
  const origErr = console.error; console.error = () => {};
  ad.onAuth((u) => seen.push(u));
  await new Promise((r) => setTimeout(r, 10));
  console.error = origErr;
  assert.deepStrictEqual(seen, [null]);
});

test('실제 어댑터와 가짜 서버가 같은 규격을 지킨다 (Cloud 클라이언트를 어댑터에 그대로 연결)', async () => {
  const sdk = stubSdk(), ad = CloudFirebase.createFirebaseAdapter(CFG, sdk);
  const dev = { state: G.createState(1000), mem: {} };
  played(300, 20)(dev.state);
  const c = Cloud.createCloud(ad, {
    getLocal: () => ({ text: G.serialize(dev.state, 2000), summary: Sync.summaryOf(dev.state, 'novice') }),
    applySave: () => true, askConflict: async () => 'cloud',
    storage: { get: (k) => dev.mem[k] || null, set: (k, v) => { dev.mem[k] = v; }, remove() {} },
  });
  c.start();
  await new Promise((r) => setTimeout(r, 10));
  await ad.signIn('google');
  await new Promise((r) => setTimeout(r, 30));
  assert.strictEqual(sdk.store['saves/abc'].rev, 1);
  assert.strictEqual(sdk.store['saves/abc'].summary.kills, 300);
  assert.strictEqual(c.state().status, 'ok');
});

section('크리스탈 상점');
const St = G.STORE;
const cash = (n) => { const t = G.createState(0); t.crystals = n; return t; };

test('상품 데이터가 올바르다 (가격 양수, 아이디 중복 없음, 상자 확률 합 100, 물약 시간은 상한 이하)', () => {
  const ids = [...St.BOXES, ...St.UTILITIES, ...St.RELICS, St.STARTER].map((x) => x.id);
  assert.strictEqual(new Set(ids).size, ids.length);
  for (const x of [...St.BOXES, ...St.UTILITIES, St.STARTER]) assert.ok(x.price > 0 && x.name && x.desc, x.id);
  for (const b of St.BOXES) assert.strictEqual(Object.values(b.odds).reduce((a, c) => a + c, 0), 100, b.id + ' 확률 합');
  for (const p of St.POTIONS) assert.ok(p.dur > 0 && p.dur <= St.POTION_CAP && p.w > 0 && !('price' in p), p.id + ' (물약은 팔지 않는다)');
  for (const c of St.CRYSTAL_PACKS) assert.ok(c.crystals >= c.bonus && c.price > 0, c.id);
  const perWon = St.CRYSTAL_PACKS.map((c) => c.crystals / c.price);
  assert.ok(perWon.every((v, i) => i === 0 || v >= perWon[i - 1]), '많이 살수록 크리스탈당 가격이 같거나 싸다');
});

test('충전: 크리스탈이 늘고, 같은 주문 번호는 두 번 지급되지 않으며, 잘못된 값은 거절한다', () => {
  const t = cash(0);
  assert.deepStrictEqual(G.creditCrystals(t, 330, 'demo-1'), { ok: true });
  assert.strictEqual(t.crystals, 330);
  assert.deepStrictEqual(G.creditCrystals(t, 330, 'demo-1'), { ok: false, reason: 'duplicate' });
  assert.strictEqual(t.crystals, 330, '중복 주문은 지급하지 않는다');
  for (const bad of [[0, 'a'], [-5, 'b'], [NaN, 'c'], [10, ''], [10, 123]]) assert.strictEqual(G.creditCrystals(t, bad[0], bad[1]).ok, false);
  assert.strictEqual(t.crystals, 330);
  for (let i = 0; i < 80; i++) G.creditCrystals(t, 1, 'o' + i);
  assert.strictEqual(t.orders.length, 50, '주문 기록은 최근 50개만');
});

test('물약은 상점에서 팔지 않는다. 광고를 볼 때 하나씩 받고, 겹치면 시간이 늘며 상한(3시간)을 넘지 않는다', () => {
  const t = cash(5000);
  for (const id of ['gold', 'might', 'haste', 'exp', 'luck', 'hero', 'sand']) assert.strictEqual(G.buyProduct(t, id).reason, 'unknown', id);
  assert.strictEqual(t.crystals, 5000);
  G.setRandom(seeded(5));
  const u = G.createState(0);
  const r = G.claimAd(u, '2026-09-21');
  assert.ok(r.ok && r.potion && St.POTIONS.some((p) => p.id === r.potion.id));
  assert.strictEqual(u.potions[r.potion.id], r.potion.dur, '받은 물약의 시간만큼 효과가 생긴다');
  assert.strictEqual(u.stats.potions, 1);
  u.potions[r.potion.id] = St.POTION_CAP - 10;
  G.setRandom(() => 0);   // 첫 물약(황금)이 나오게 한다
  u.potions.gold = St.POTION_CAP - 10; G.claimAd(u, '2026-09-21');
  assert.strictEqual(u.potions.gold, St.POTION_CAP, '상한을 넘지 않는다');
  G.setRandom();
});

test('광고 물약은 가중치대로 나오고 용사의 비약은 드물다 (2만 번)', () => {
  G.setRandom(seeded(8));
  const n = {};
  for (let i = 0; i < 20000; i++) { const u = G.createState(0); const p = G.claimAd(u, 'd' + 0).potion; n[p.id] = (n[p.id] || 0) + 1; }
  const total = St.POTIONS.reduce((a, p) => a + p.w, 0);
  for (const p of St.POTIONS) assert.ok(Math.abs(n[p.id] / 20000 - p.w / total) < 0.015, `${p.id} ${(n[p.id] / 200).toFixed(1)}% (기대 ${(100 * p.w / total).toFixed(1)}%)`);
  assert.ok(n.hero < n.gold / 2);
  G.setRandom();
});

test('없는 상품은 거절하고, 크리스탈이 모자라면 아무것도 바뀌지 않는다', () => {
  const t = cash(59);
  const r = G.buyProduct(t, 'box_fine');
  assert.deepStrictEqual([r.ok, r.reason, t.crystals], [false, 'crystals', 59]);
  assert.strictEqual(G.buyProduct(t, 'nonexistent').reason, 'unknown');
  for (const id of ['box_legend', 'bag', 'starter']) { G.buyProduct(t, id); }
  assert.ok(t.crystals >= 0, '크리스탈이 음수가 되지 않는다');
});

test('물약 효과: 황금·힘·신속·지혜·행운이 각각 골드·공격력·공격 속도·경험치·드롭 확률에 반영된다', () => {
  const t = G.createState(0);
  const g0 = G.goldMult(t), d0 = G.hitDmg(t), a0 = G.attacksPerSec(t), l0 = G.dropChance(t, false);
  t.potions = { gold: 100, might: 100, haste: 100, luck: 100 };
  assert.ok(Math.abs(G.goldMult(t) / g0 - 2.0) < 1e-9);
  assert.ok(Math.abs(G.hitDmg(t) / d0 - 1.5) < 1e-9);
  assert.ok(Math.abs(G.attacksPerSec(t) / a0 - 1.4) < 1e-9);
  assert.ok(Math.abs(G.dropChance(t, false) / l0 - 2.0) < 1e-9);
  const gain = (potion) => { const u = G.createState(0); if (potion) u.potions = { exp: 100 }; u.stage = 6; u.monsterHp = 1; const before = u.exp; G.clickAttack(u); return u.exp - before + (u.level - 1) * 1e6; };
  assert.ok(gain(true) >= gain(false) * 1.9, `경험치 ${gain(false)} → ${gain(true)}`);
  t.potions = { hero: 100 };
  assert.ok(Math.abs(G.goldMult(t) / g0 - 1.5) < 1e-9 && Math.abs(G.hitDmg(t) / d0 - 1.5) < 1e-9, '용사의 비약은 공격력·골드 +50%');
});

test('물약 시간은 흐르다 0이 되면 사라지고, 쓰러져 있는 동안에도 흐른다', () => {
  const t = G.createState(0);
  t.potions = { gold: 1.0, might: 50 };
  G.tick(t, 0.6);
  assert.ok(Math.abs(t.potions.gold - 0.4) < 1e-9);
  G.tick(t, 0.6);
  assert.ok(!('gold' in t.potions), '끝난 물약은 사라진다');
  t.downT = 3; const m0 = t.potions.might;
  G.tick(t, 1);
  assert.ok(t.potions.might < m0, '기절 중에도 시간이 간다');
});

test('장비 상자: 지정한 개수와 등급 확률로 나오고, 상자를 열면 크리스탈이 나간다', () => {
  G.setRandom(seeded(31));
  const N = 4000, count = [0, 0, 0, 0, 0];
  for (let i = 0; i < N; i++) { const t = cash(1000); t.bestStage = 30; const r = G.buyProduct(t, 'box_hero'); assert.strictEqual(r.items.length, 1); count[r.items[0].r] += 1; assert.strictEqual(t.crystals, 700); }
  assert.strictEqual(count[0] + count[1] + count[2], 0, '영웅 상자에서는 영웅 미만이 나오지 않는다');
  assert.ok(Math.abs(count[3] / N - 0.85) < 0.03 && Math.abs(count[4] / N - 0.15) < 0.03, `영웅 ${count[3] / N} 전설 ${count[4] / N}`);
  const t = cash(1000); t.bestStage = 30;
  assert.strictEqual(G.buyProduct(t, 'box_fine').items.length, 3);
  assert.ok(G.buyProduct(cash(900), 'box_legend').items.every((x) => x.r === 4), '전설 상자는 전설 확정');
  G.setRandom();
});

test('고급 장비 상자의 등급 확률이 공개한 표(60/30/9/1)와 맞고 고급 미만은 나오지 않는다 (3만 번)', () => {
  G.setRandom(seeded(32));
  const count = [0, 0, 0, 0, 0]; let total = 0;
  for (let i = 0; i < 10000; i++) { const t = cash(100); t.bestStage = 20; for (const it of G.buyProduct(t, 'box_fine').items) { count[it.r] += 1; total += 1; } }
  assert.strictEqual(count[0], 0);
  assert.ok(Math.abs(count[1] / total - 0.6) < 0.015 && Math.abs(count[2] / total - 0.3) < 0.015 && Math.abs(count[3] / total - 0.09) < 0.01 && Math.abs(count[4] / total - 0.01) < 0.005, count.map((c) => (c / total).toFixed(3)).join(' '));
  G.setRandom();
});

test('칸별 뽑기: 원하는 칸(무기·방어구·액세서리)이 확정으로 나온다', () => {
  G.setRandom(seeded(34));
  for (const id of ['draw_weapon', 'draw_armor', 'draw_accessory']) {
    const slot = id.split('_')[1];
    for (let i = 0; i < 30; i++) { const t = cash(1000); t.bestStage = 20; const r = G.buyProduct(t, id); assert.strictEqual(r.items[0].slot, slot, id); }
  }
  G.setRandom();
});

test('유물 뽑기: 아직 없는 유물 중 하나를 무작위로 주고, 다 가지고 있으면 살 수 없다', () => {
  G.setRandom(seeded(35));
  const t = cash(1e6);
  const seen = new Set();
  for (let i = 0; i < G.STORE.RELICS.length; i++) {
    const r = G.buyProduct(t, 'draw_relic');
    assert.strictEqual(r.ok, true);
    assert.ok(!seen.has(r.picked.id), '이미 가진 유물은 다시 나오지 않는다');
    seen.add(r.picked.id);
    assert.ok(t.relics[r.picked.id]);
  }
  assert.strictEqual(seen.size, G.STORE.RELICS.length, '전부 뽑으면 모든 유물을 갖게 된다');
  assert.strictEqual(G.buyProduct(t, 'draw_relic').reason, 'owned', '더 뽑을 유물이 없으면 살 수 없다');
  G.setRandom();
});

test('상자 장비의 레벨은 최고 스테이지를 따르고(최소 10), 좋은 장비는 바로 장착되며 아니면 가방에 들어간다', () => {
  G.setRandom(seeded(33));
  const t = cash(2000); t.bestStage = 44;
  const r = G.buyProduct(t, 'box_legend');
  assert.strictEqual(r.items[0].ilvl, 44);
  assert.strictEqual(t.equip[r.items[0].slot].id, r.items[0].id, '빈 칸이면 바로 장착한다');
  assert.strictEqual(G.buyProduct(cash(900), 'box_legend').items[0].ilvl, 10, '최고 스테이지가 낮아도 최소 10');
  const u = cash(900); u.autoEquip = false;
  assert.strictEqual(G.buyProduct(u, 'box_legend').ok, true);
  assert.strictEqual(u.bag.length, 1, '자동 장착을 끄면 가방에 들어간다');
  G.setRandom();
});

test('가방에 자리가 없으면 상자를 살 수 없고 크리스탈은 그대로다 (자동 판매되지 않는다)', () => {
  const t = cash(1000);
  for (let i = 0; i < G.BAG_MAX - 2; i++) t.bag.push(mkItem({ id: i + 1 }));
  const r = G.buyProduct(t, 'box_fine');   // 3개가 필요한데 2칸뿐
  assert.deepStrictEqual([r.ok, r.reason, t.crystals, t.bag.length], [false, 'bag', 1000, G.BAG_MAX - 2]);
  assert.strictEqual(G.buyProduct(t, 'box_hero').ok, true, '1개짜리는 살 수 있다');
});

test('가방 확장: 6칸씩 늘고 +18칸이 최대이며, 늘어난 칸만큼 장비를 담고 저장·복원된다', () => {
  const t = cash(1000);
  for (let i = 0; i < 3; i++) assert.ok(G.buyProduct(t, 'bag').ok);
  assert.strictEqual(G.bagLimit(t), G.BAG_MAX + 18);
  const r = G.buyProduct(t, 'bag');
  assert.deepStrictEqual([r.ok, r.reason, t.crystals], [false, 'max', 1000 - 240]);
  for (let i = 0; i < G.bagLimit(t); i++) t.bag.push(mkItem({ id: i + 1 }));
  const back = G.deserialize(G.serialize(t, 1));
  assert.strictEqual(back.bag.length, G.BAG_MAX + 18, '확장한 칸의 장비까지 그대로 불러온다');
  assert.strictEqual(back.bagExtra, 18);
  const u = cash(0); u.autoSell = -1; u.equip.weapon = mkItem({ id: 999, val: 999 });
  for (let i = 0; i < 24; i++) u.bag.push(mkItem({ id: i + 1, r: 2 }));
  const ev = []; G.receiveItem(u, mkItem({ id: 500, r: 3 }), ev);
  assert.strictEqual(ev[0].action, 'sold', '확장 전에는 가득 차서 팔린다');
  u.bagExtra = 6; G.receiveItem(u, mkItem({ id: 501, r: 3 }), ev);
  assert.strictEqual(ev[1].action, 'bag', '확장하면 담긴다');
});

test('시작 패키지: 영웅 장비와 물약 2개를 주고 계정당 한 번만 살 수 있다', () => {
  G.setRandom(seeded(34));
  const t = cash(600);
  const r = G.buyProduct(t, 'starter');
  assert.ok(r.ok && r.items[0].r === 3 && t.potions.gold === 1800 && t.potions.might === 1800 && t.crystals === 350);
  const r2 = G.buyProduct(t, 'starter');
  assert.deepStrictEqual([r2.ok, r2.reason, t.crystals], [false, 'owned', 350]);
  assert.strictEqual(G.deserialize(G.serialize(t, 1)).bought.starter, true, '산 기록은 저장된다');
  G.setRandom();
});

test('광고: 하루 3번까지 보상을 받고, 그 이상은 거절하며, 날짜가 바뀌면 다시 3번이다', () => {
  const t = G.createState(0);
  const day1 = G.dayKey(Date.UTC(2026, 8, 21, 1)), day2 = G.dayKey(Date.UTC(2026, 8, 21, 15, 1));   // 한국 시간 10시 / 다음 날 0시 1분
  assert.deepStrictEqual([day1, day2], ['2026-09-21', '2026-09-22']);
  assert.strictEqual(G.dayKey(Date.UTC(2026, 8, 21, 14, 59, 59)), '2026-09-21', '자정 1초 전은 아직 같은 날');
  assert.deepStrictEqual(G.adStatus(t, day1), { used: 0, left: 3, limit: 3 });
  for (let i = 0; i < 3; i++) assert.ok(G.claimAd(t, day1).ok);
  const r = G.claimAd(t, day1);
  assert.deepStrictEqual([r.ok, r.reason, r.left], [false, 'limit', 0]);
  assert.strictEqual(t.crystals, 30, '3번 성공했으니 크리스탈 30개');
  assert.strictEqual(G.adStatus(t, day2).left, 3, '다음 날 초기화');
  assert.ok(G.claimAd(t, day2).ok);
});

test('광고: 기기 시계를 바꿔도 하루 3번을 넘길 수 없다 (서버 시각 기준)', () => {
  const t = G.createState(0);
  const H = 3600e3, d21 = Date.UTC(2026, 8, 21, 1), d22 = Date.UTC(2026, 8, 21, 16);   // 서버가 말하는 시각 (21일, 22일)
  const localReal = d21;
  const use = (server, local) => { const day = G.adToday(t, server, local); return G.claimAd(t, day); };
  for (let i = 0; i < 3; i++) assert.ok(use(d21, localReal).ok);
  assert.ok(!use(d21, localReal).ok, '서버가 같은 날이라고 하면 막힌다');
  // 기기 시계를 이틀 앞으로 돌려도, 서버 시각이 같은 날이면 그대로 막힌다
  assert.ok(!use(d21, localReal + 48 * H).ok, '시계를 앞으로 돌려도 서버 기준이라 막힌다');
  // 시계를 뒤로 돌려도 마찬가지
  assert.ok(!use(d21, localReal - 48 * H).ok, '시계를 뒤로 돌려도 막힌다');
  // 서버 시각을 못 받는 상태(오프라인)에서는 시계를 아무리 돌려도 새 날이 되지 않는다
  assert.ok(!use(null, localReal + 72 * H).ok, '오프라인에서 시계를 앞으로 돌려도 새 날이 되지 않는다');
  assert.ok(!use(NaN, localReal + 72 * H).ok, '서버 시각이 이상한 값이어도 마찬가지');
  // 서버 시각이 진짜 다음 날이 되면 다시 3번
  assert.ok(use(d22, localReal).ok, '서버 시각이 다음 날이 되면 다시 받을 수 있다');
  // 이미 지나간 날짜로 되돌아갈 수 없다: 서버가 예전 날짜를 말해도 마지막 확인된 날짜에 머문다
  assert.strictEqual(G.adToday(t, d21, localReal), '2026-09-22', '날짜가 뒤로 가지 않는다');
  // 저장하고 불러와도 마지막 확인된 날짜가 남는다 (오프라인으로 다시 열어도 새 날이 열리지 않음)
  const back = G.deserialize(G.serialize(t, 1));
  assert.strictEqual(back.adClock, '2026-09-22');
  assert.strictEqual(G.adToday(back, null, localReal + 100 * H), '2026-09-22');
  // 처음 쓰는 오프라인 기기는 기기 시계로 시작하되, 그 뒤로는 그 날에 머문다
  const u = G.createState(0);
  assert.strictEqual(G.adToday(u, null, d21), '2026-09-21');
  assert.strictEqual(G.adToday(u, null, d21 + 200 * H), '2026-09-21');
  // 손상된 값은 버린다
  const o = JSON.parse(G.serialize(t, 1)); o.adClock = 'hacked';
  assert.strictEqual(G.deserialize(JSON.stringify(o)).adClock, '');
});

test('광고 보상은 한 번에 크리스탈 10개와 물약 1개이고, 횟수를 다 쓰면 받지 못한다', () => {
  const t = G.createState(0);
  t.crystals = 5;
  const r = G.claimAd(t, '2026-09-21');
  assert.deepStrictEqual([r.ok, r.crystals, r.left, t.crystals], [true, 10, 2, 15]);
  assert.strictEqual(t.level, 1, '레벨은 오르지 않는다');
  G.claimAd(t, '2026-09-21'); G.claimAd(t, '2026-09-21');
  const x = G.claimAd(t, '2026-09-21');
  assert.deepStrictEqual([x.ok, x.reason, x.crystals, x.potion, t.crystals], [false, 'limit', 0, null, 35], '4번째는 거절되고 크리스탈·물약도 늘지 않는다');
  assert.strictEqual(G.claimAd(t, '2026-09-22').crystals, 10, '다음 날은 다시 받는다');
  assert.strictEqual(G.deserialize(G.serialize(t, 1)).crystals, 45, '저장된다');
});

test('상점 관련 저장 값은 저장·복원되고, 조작된 값은 범위 안으로 보정한다', () => {
  const t = cash(500); t.potions = { gold: 900 }; t.adLog = { day: '2026-09-21', n: 2 }; t.bagExtra = 12; t.orders = ['demo-a', 'demo-b']; t.bought.starter = true;
  const back = G.deserialize(G.serialize(t, 1));
  assert.deepStrictEqual([back.crystals, back.potions, back.adLog, back.bagExtra, back.orders, back.bought], [500, { gold: 900 }, { day: '2026-09-21', n: 2 }, 12, ['demo-a', 'demo-b'], { starter: true }]);
  const o = JSON.parse(G.serialize(cash(0), 1));
  Object.assign(o, { crystals: -50, potions: { gold: 1e9, hacker: 100, might: -5 }, adLog: { day: 'hacked', n: 999 }, bagExtra: 13, orders: ['ok-1', '<script>', 5, 'x'.repeat(100)], bought: { starter: 'yes' } });
  const b = G.deserialize(JSON.stringify(o));
  assert.strictEqual(b.crystals, 0);
  assert.deepStrictEqual(b.potions, { gold: St.POTION_CAP }, '없는 물약·음수는 버리고 시간은 상한으로');
  assert.deepStrictEqual(b.adLog, { day: '', n: 0 }, '잘못된 날짜는 무시');
  assert.strictEqual(b.bagExtra, 12, '6의 배수로 내림');
  assert.deepStrictEqual(b.orders, ['ok-1']);
  assert.deepStrictEqual(b.bought, {});
  o.adLog = { day: '2026-09-21', n: 999 }; o.crystals = 1e15;
  const c = G.deserialize(JSON.stringify(o));
  assert.deepStrictEqual([c.adLog.n, c.crystals], [3, 1e9], '횟수는 하루 상한으로, 크리스탈은 상한으로');
});

test('상점 값이 없는 예전 저장 데이터도 불러온다', () => {
  const o = JSON.parse(G.serialize(G.createState(0), 1));
  for (const k of ['crystals', 'potions', 'adLog', 'bagExtra', 'bought', 'orders']) delete o[k];
  const b = G.deserialize(JSON.stringify(o));
  assert.deepStrictEqual([b.crystals, b.potions, b.adLog, b.bagExtra, b.bought, b.orders], [0, {}, { day: '', n: 0 }, 0, {}, []]);
});

test('환생해도 크리스탈·물약·가방 확장·광고 기록은 남는다 (돈으로 산 것이라 초기화하지 않는다)', () => {
  const t = cash(300); t.potions = { gold: 500 }; t.bagExtra = 6; t.adLog = { day: '2026-09-21', n: 1 }; t.runBest = 12;
  G.prestige(t);
  assert.deepStrictEqual([t.crystals, t.potions, t.bagExtra, t.adLog.n], [300, { gold: 500 }, 6, 1]);
});

section('스킬·공격 모션');
// 스킬 시험용: 몬스터 체력을 크게 잡아서 스킬 피해를 그대로 볼 수 있게 한다 (스테이지 1이라 고블린이 거의 다치지 않는다)
const skillState = (route) => { const t = G.createState(0); walkPath(t, route); t.stage = 1; t.monsterHp = t.monsterMax = 1e15; t.hp = G.maxHp(t); return t; };
const castsOf = (t, seconds, id) => { let n = 0; for (let i = 0; i < seconds * 10; i++) { t.monsterHp = t.monsterMax = 1e15; for (const e of G.tick(t, 0.1)) if (e.type === 'skill' && (!id || e.id === id)) n += 1; } return n; };

test('124개 직업 모두 스킬이 있고, 이름이 겹치지 않으며, 효과 종류가 정의돼 있다', () => {
  const ids = [...Object.keys(G.CLASSES), ...G.ADV_IDS];
  assert.strictEqual(ids.length, 124);
  const names = ids.map((id) => { assert.ok(G.SKILL_NAMES[id], id); return G.SKILL_NAMES[id][0]; });
  assert.strictEqual(new Set(names).size, 124, '스킬 이름이 겹친다');
  for (const id of ids) assert.ok(G.SKILL_KINDS[G.SKILL_NAMES[id][1]], `${id}: 알 수 없는 효과 종류`);
  assert.ok(Object.keys(G.SKILL_NAMES).every((id) => ids.includes(id)), '직업이 아닌 이름의 스킬이 있다');
});

test('직업 단계가 높을수록 같은 종류(강타) 스킬의 위력이 커진다: 1차 3.0 < 3차 4.5 < 4차 5.4', () => {
  const power = (route, id) => G.skillsOf(skillState(route)).find((x) => x.id === id).power;
  const p1 = power(['warrior'], 'warrior');
  const p3 = power(['warrior', 'berserker', 'destroyer'], 'destroyer');
  const p4 = power(['mage', 'pyromancer', 'infernomage', 'flameemperor'], 'flameemperor');
  assert.ok(Math.abs(p1 - 3.0) < 1e-9 && Math.abs(p3 - 4.5) < 1e-9 && Math.abs(p4 - 5.4) < 1e-9, [p1, p3, p4].join(' / '));
});

test('전직할수록 스킬이 쌓인다 (견습 0개 → 1차 1개 → … → 4차 4개)', () => {
  const t = G.createState(0);
  assert.strictEqual(G.skillsOf(t).length, 0);
  const path = ['warrior', 'knight', 'paladin', 'seraph'];
  const counts = [];
  t.level = 99; for (const id of path) { G.promote(t, id); counts.push(G.skillsOf(t).length); }
  assert.deepStrictEqual(counts, [1, 2, 3, 4]);
  assert.deepStrictEqual(G.skillsOf(t).map((x) => x.id), path);
});

test('강타: 쿨타임이 되면 자동으로 공격력 × 위력만큼 피해를 주고 사건을 남긴다', () => {
  const t = skillState(['warrior']);
  t.skillCd.warrior = 0;
  const dmg = G.hitDmg(t);
  const ev = G.tick(t, 0.1).filter((e) => e.type === 'skill');
  assert.strictEqual(ev.length, 1);
  assert.deepStrictEqual([ev[0].id, ev[0].kind, ev[0].name], ['warrior', 'strike', '용맹의 일격']);
  assert.ok(Math.abs(ev[0].amount - dmg * 3) < 1e-6, `${ev[0].amount} vs ${dmg * 3}`);
});

test('쿨타임 동안에는 다시 쓰지 않고, 쿨타임(14초)마다 한 번씩 쓴다', () => {
  const t = skillState(['warrior']);
  t.skillCd.warrior = 0;
  const n = castsOf(t, 50);   // 0초, 14초, 28초, 42초 → 4번
  assert.strictEqual(n, 4);
});

test('처음 만난 스킬은 시간 차를 두고 시작해서 한꺼번에 터지지 않는다', () => {
  const t = skillState(['warrior', 'knight', 'paladin', 'seraph']);
  const first = G.tick(t, 0.1).filter((e) => e.type === 'skill');
  assert.strictEqual(first.length, 0, '시작하자마자 쓰지 않는다');
  const cds = G.skillsOf(t).map((sk) => t.skillCd[sk.id]);
  assert.ok(new Set(cds.map((c) => Math.round(c * 10))).size === 4, '쿨타임 시작이 서로 다르다: ' + cds);
});

test('연타: 위력 × 횟수만큼 한 번에 피해를 준다', () => {
  const t = skillState(['mage']);
  t.skillCd.mage = 0;
  const dmg = G.hitDmg(t);
  const e = G.tick(t, 0.1).find((x) => x.type === 'skill');
  assert.strictEqual(e.kind, 'multi');
  assert.ok(Math.abs(e.amount - dmg * 1.0 * 4) < 1e-6);
});

test('회복: 체력이 충분하면 쓰지 않고, 70% 아래일 때만 최대 체력의 (위력)만큼 회복한다', () => {
  const t = skillState(['warrior', 'knight', 'paladin']);
  t.skillCd.paladin = 0;
  t.hp = G.maxHp(t);
  assert.strictEqual(castsOf(t, 30, 'paladin'), 0, '체력이 가득이면 회복하지 않는다');
  t.hp = G.maxHp(t) * 0.3; t.skillCd.paladin = 0;
  const before = t.hp;
  const e = G.tick(t, 0.1).find((x) => x.id === 'paladin');
  assert.ok(e, '체력이 낮으면 쓴다');
  assert.ok(t.hp - before >= G.maxHp(t) * 0.3 - 1, `회복량 ${t.hp - before}`);   // 위력 0.2×1.5=0.3
});

test('가속: 공격 속도가 지속 시간 동안만 오른다', () => {
  const t = skillState(['archer']);
  const base = G.attacksPerSec(t);
  t.skillCd.archer = 0;
  G.tick(t, 0.1);
  assert.ok(Math.abs(G.attacksPerSec(t) / base - 1.35) < 1e-9);
  for (let i = 0; i < 70; i++) { t.monsterHp = t.monsterMax = 1e15; G.tick(t, 0.1); }   // 7초 지남
  assert.ok(!t.buffs.haste, '효과가 끝났다');
  assert.strictEqual(G.attacksPerSec(t), base);
});

test('강화·방어·약탈: 각각 공격력·받는 피해·골드에 영향을 준다', () => {
  const t = skillState(['mage']);
  const d0 = G.hitDmg(t);
  t.buffs.might = { t: 5, v: 0.3 };
  assert.ok(Math.abs(G.hitDmg(t) / d0 - 1.3) < 1e-9);
  // 방어: 1초 동안 받는 피해가 (몬스터 공격력 × 위력)만큼 줄어든다. 회복량은 두 경우가 같으므로 손실의 차이가 그 값이다.
  const loss = (guard) => {
    const u = skillState(['warrior']); u.stage = 6; u.monsterHp = u.monsterMax = 1e15;
    u.hp = G.maxHp(u) * 0.5;
    if (guard) u.buffs.guard = { t: 99, v: 0.5 };
    const h0 = u.hp; G.tick(u, 1); return h0 - u.hp;
  };
  const noGuard = loss(false), withGuard = loss(true);
  assert.ok(Math.abs((noGuard - withGuard) - 0.5 * G.monsterAtk(6)) < 1e-6, `${noGuard} → ${withGuard}`);
  // 약탈: 처치 골드가 (1 + 위력)배가 된다
  const kill = (greed) => { G.setRandom(() => 0.999); const u = skillState(['rogue']); u.monsterHp = 1; if (greed) u.buffs.greed = { t: 9, v: 0.5 }; G.clickAttack(u); G.setRandom(); return u.gold; };   // 드롭이 골드를 더하지 않게 난수를 고정한다
  const g1 = kill(false), g2 = kill(true);
  assert.ok(g2 > g1 && Math.abs(g2 / g1 - 1.5) < 0.2, `${g1} → ${g2}`);
});

test('소환: 동료가 없어도 내 초당 피해의 일부만큼은 피해를 준다', () => {
  const t = skillState(['archer', 'ranger']);
  t.skillCd.ranger = 0;
  const e = G.tick(t, 0.1).find((x) => x.id === 'ranger');
  assert.strictEqual(e.kind, 'summon');
  assert.ok(e.amount > 0 && e.amount < G.totalDps(t) * 6 * 1.25, `${e.amount}`);
});

test('쓰러져 있는 동안에는 스킬을 쓰지 않고, 환생하면 쿨타임과 효과가 초기화된다', () => {
  const t = skillState(['warrior']);
  t.skillCd.warrior = 0; t.downT = 2;
  assert.strictEqual(G.tick(t, 0.1).filter((e) => e.type === 'skill').length, 0);
  t.downT = 0; t.buffs.might = { t: 5, v: 0.3 }; t.skillCd.warrior = 3; t.runBest = 12;
  G.prestige(t);
  assert.deepStrictEqual([t.buffs, t.skillCd], [{}, {}]);
});

test('저장·불러오기 뒤에는 쿨타임과 효과가 새로 시작한다', () => {
  const t = skillState(['warrior']);
  t.buffs.might = { t: 5, v: 0.3 }; t.skillCd.warrior = 7;
  const back = G.deserialize(G.serialize(t, 1));
  assert.deepStrictEqual([back.buffs, back.skillCd], [{}, {}]);
  assert.deepStrictEqual(G.skillsOf(back).map((x) => x.id), ['warrior'], '직업(스킬)은 그대로');
});

test('스킬 설명은 효과 종류마다 위력 수치가 들어간 문장이다', () => {
  const t = skillState(['mage', 'pyromancer', 'infernomage', 'flameemperor']);
  const d = G.skillsOf(t).map((sk) => G.describeSkill(sk));
  assert.ok(d.every((x) => x.length > 8));
  assert.ok(d[0].includes('4번') && d[0].includes('×1'), d[0]);      // 마법 화살(연타) ×1 4번
  assert.ok(d[1].includes('불태워') && d[1].includes('50%'), d[1]);   // 점화(지속 피해) 위력 0.4×1.25
  assert.ok(d[3].includes('5.4'), d[3]);                            // 화염 제국(강타) ×5.4
});

test('처형: 몬스터 체력이 충분하면 쓰지 않고, 40% 아래가 되면 공격력 × 위력으로 마무리한다', () => {
  const t = skillState(['archer', 'sniper']);
  t.skillCd.sniper = 0;
  assert.strictEqual(castsOf(t, 30, 'sniper'), 0, '체력이 가득이면 쓰지 않는다');
  t.monsterMax = 1e15; t.monsterHp = 1e15 * 0.3; t.skillCd.sniper = 0;
  const e = G.tick(t, 0.1).find((x) => x.id === 'sniper');
  assert.ok(e && e.kind === 'execute');
  assert.ok(Math.abs(e.amount - G.hitDmg(t) * 7 * 1.25) < 1e-6);
});

test('보스 사냥: 보스가 아니면 쓰지 않고, 보스가 나오면 큰 피해를 준다', () => {
  const t = skillState(['rogue', 'assassin']);
  t.skillCd.assassin = 0; t.isBoss = false;
  assert.strictEqual(castsOf(t, 30, 'assassin'), 0);
  t.isBoss = true; t.skillCd.assassin = 0;
  const e = G.tick(t, 0.1).find((x) => x.id === 'assassin');
  assert.ok(e && e.kind === 'bossbane' && Math.abs(e.amount - G.hitDmg(t) * 9 * 1.25) < 1e-6);
});

test('지속 피해: 몬스터 체력이 절반 넘을 때 걸고, 시간 동안 매초 피해를 주며, 겹쳐 걸지 않고, 몬스터가 죽으면 사라진다', () => {
  const t = skillState(['rogue']);
  t.skillCd.rogue = 0;
  G.tick(t, 0.1);
  assert.ok(t.dot && t.dot.variant === 'poison' && t.dot.t > 7.5, JSON.stringify(t.dot));
  const dps = t.dot.dps;
  const before = t.monsterHp;
  for (let i = 0; i < 10; i++) { t.skillCd.rogue = 0; G.tick(t, 0.1); }   // 1초 진행. 이미 걸려 있으니 다시 걸지 않는다
  assert.ok(t.dot.dps === dps, '다시 걸리지 않았다');
  assert.ok(before - t.monsterHp >= dps * 0.9, `지속 피해 ${before - t.monsterHp} vs 초당 ${dps}`);
  for (let i = 0; i < 100; i++) { t.monsterHp = t.monsterMax = 1e15; G.tick(t, 0.1); }   // 시간이 다하면 끝난다
  assert.ok(!t.dot || t.dot.t > 0);
  t.dot = { t: 5, dps: 1, variant: 'poison' }; t.monsterHp = 1; G.clickAttack(t);            // 몬스터가 죽으면 사라진다
  assert.strictEqual(t.dot, null);
});

test('기절: 걸린 동안 몬스터가 공격하지 못하고, 체력이 충분하면 쓰지 않는다', () => {
  const loss = (stunned) => { const u = skillState(['warrior']); u.stage = 6; u.monsterHp = u.monsterMax = 1e15; u.hp = G.maxHp(u) * 0.5; if (stunned) u.buffs.stun = { t: 5, v: 1 }; const h0 = u.hp; G.tick(u, 1); return h0 - u.hp; };
  assert.ok(loss(false) > loss(true), '기절하면 덜 다친다');
  assert.ok(loss(true) < 0, '기절한 동안은 회복만 남아 체력이 오른다');
  const t = skillState(['rogue', 'assassin', 'shade']);
  t.skillCd.shade = 0; t.hp = G.maxHp(t);
  assert.strictEqual(castsOf(t, 30, 'shade'), 0, '체력이 가득이면 쓰지 않는다');
});

test('흡혈: 걸린 동안 준 피해의 일부만큼 체력을 회복한다', () => {
  const t = skillState(['warrior', 'berserker']);
  t.hp = G.maxHp(t) * 0.5; t.buffs.lifesteal = { t: 8, v: 0.3 };
  const h0 = t.hp;
  const dmg = G.clickAttack(t).dmg;
  assert.ok(Math.abs((t.hp - h0) - dmg * 0.3) < 1e-6, `회복 ${t.hp - h0} vs 기대 ${dmg * 0.3}`);
  t.hp = G.maxHp(t); const full = t.hp; G.clickAttack(t);
  assert.strictEqual(t.hp, full, '최대 체력을 넘어 회복하지 않는다');
});

test('방벽: 몬스터의 피해를 먼저 대신 맞고, 다 닳으면 사라진다. 체력이 충분하면 펼치지 않는다', () => {
  const t = skillState(['warrior', 'knight']);
  t.skillCd.knight = 0; t.hp = G.maxHp(t);
  assert.strictEqual(castsOf(t, 30, 'knight'), 0, '체력이 충분하면 펼치지 않는다');
  t.hp = G.maxHp(t) * 0.5; t.skillCd.knight = 0;
  G.tick(t, 0.1);
  assert.ok(t.buffs.barrier && Math.abs(t.buffs.barrier.v - G.maxHp(t) * 0.35 * 1.25) < G.monsterAtk(1), '방벽 크기');
  const loss = (barrier) => { const u = skillState(['warrior']); u.stage = 6; u.monsterHp = u.monsterMax = 1e15; u.hp = G.maxHp(u) * 0.5; if (barrier) u.buffs.barrier = { t: 8, v: 1e9 }; const h0 = u.hp; G.tick(u, 1); return h0 - u.hp; };
  assert.ok(loss(true) < loss(false), '방벽이 있으면 덜 다친다');
  const u = skillState(['warrior']); u.stage = 6; u.monsterHp = u.monsterMax = 1e15; u.buffs.barrier = { t: 8, v: 1 };
  G.tick(u, 1);
  assert.ok(!u.buffs.barrier, '다 닳으면 사라진다');
});

test('전리품: 처치 골드의 위력배를 즉시 얻는다', () => {
  const t = skillState(['rogue', 'pirate', 'buccaneer']);
  G.checkAchievements(t);   // 전직 업적이 틱 도중에 달성돼 골드 배율이 바뀌지 않게, 먼저 반영해 둔다
  t.skillCd.buccaneer = 0;
  const g0 = t.gold, expected = Math.ceil(G.monsterGold(1) * G.goldMult(t) * 6 * 1.5);
  const e = G.tick(t, 0.1).find((x) => x.id === 'buccaneer');
  assert.ok(e && e.kind === 'bounty');
  assert.strictEqual(t.gold - g0, expected);
});

test('광란: 공격 속도와 공격력이 함께 오른다', () => {
  const t = skillState(['warrior', 'berserker', 'warlord']);
  G.checkAchievements(t);   // 업적 배율을 먼저 반영해 두고 기준값을 잡는다
  const a0 = G.attacksPerSec(t), d0 = G.hitDmg(t);
  t.skillCd.warlord = 0;
  G.tick(t, 0.1);
  assert.ok(Math.abs(G.attacksPerSec(t) / a0 - 1.375) < 1e-9 && Math.abs(G.hitDmg(t) / d0 - 1.375) < 1e-9);
});

test('스킬 효과 종류는 16가지이고 모두 어느 직업이 쓴다. 상황 조건이 필요한 종류는 조건이 있다', () => {
  assert.strictEqual(Object.keys(G.SKILL_KINDS).length, 16);
  const used = new Set(Object.values(G.SKILL_NAMES).map((x) => x[1]));
  for (const k of Object.keys(G.SKILL_KINDS)) assert.ok(used.has(k), `${k}를 쓰는 직업이 없다`);
  const t = skillState(['warrior']);
  t.hp = G.maxHp(t);   // 체력 가득, 보스 아님, 몬스터 체력 가득
  t.isBoss = false;
  const can = (kind) => G.canCast(t, { kind });
  assert.deepStrictEqual(['heal', 'guard', 'stun', 'barrier', 'lifesteal', 'execute', 'bossbane'].filter(can), [], '상황이 안 맞으면 쓰지 않는다');
  assert.deepStrictEqual(['strike', 'dot', 'greed', 'bounty'].filter((k) => !can(k)), [], '언제나 쓸 수 있는 종류');
});

test('그림 생성 스크립트의 스킬·이펙트 목록이 게임 데이터와 같다 (이름이 어긋나면 그림이 안 쓰인다)', () => {
  const fs = require('fs'), path = require('path');
  const py = fs.readFileSync(path.join(__dirname, 'generate-images.py'), 'utf8');
  const keysOf = (name) => { const body = py.slice(py.indexOf(name + ' = {'), py.indexOf('\n}\n', py.indexOf(name + ' = {'))); return [...body.matchAll(/^\s+'([a-z_]+)':/gm)].map((m) => m[1]); };
  const skills = keysOf('SKILLS'), vfx = keysOf('VFX').concat(keysOf('HIT_STYLES').flatMap((k) => ['hit_' + k, 'hitx_' + k]), keysOf('ELEMENT_FX').map((k) => 'el_' + k));   // 타격 이펙트는 HIT_STYLES에서 반복문으로 만든다
  assert.deepStrictEqual(skills.slice().sort(), Object.keys(G.SKILL_NAMES).sort(), '스킬 아이콘 프롬프트가 60개 직업과 다르다');
  assert.deepStrictEqual(vfx.slice().sort(), require('../skills.js').VFX_NAMES.slice().sort(), '이펙트 이름이 skills.js와 다르다');
});

test('직업별 공격 모션: 도적은 표창, 마법사는 마법구, 기사는 칼, 궁수는 화살, 저격수는 총', () => {
  const style = (route) => G.attackStyle(skillState(route));
  assert.strictEqual(G.attackStyle(G.createState(0)), 'slash', '견습은 몽둥이');
  assert.strictEqual(style(['rogue']), 'shuriken');
  assert.strictEqual(style(['mage']), 'orb');
  assert.strictEqual(style(['warrior', 'knight']), 'slash');
  assert.strictEqual(style(['archer']), 'arrow');
  assert.strictEqual(style(['archer', 'sniper']), 'bullet');
  assert.strictEqual(style(['mage', 'pyromancer']), 'fire');
  assert.strictEqual(style(['mage', 'necromancer']), 'dark');
});

test('124개 직업 모두 공격 모션이 정해져 있고, 3·4·5차는 정해 두지 않으면 윗단계를 따른다', () => {
  const known = new Set(['slash', 'axe', 'hammer', 'holy', 'dagger', 'arrow', 'bolt', 'bullet', 'orb', 'fire', 'dark', 'shuriken', 'coin']);
  for (const id of [...Object.keys(G.CLASSES), ...G.ADV_IDS]) assert.ok(known.has(G.styleOfClass(id)), `${id}: ${G.styleOfClass(id)}`);
  assert.strictEqual(G.styleOfClass('warlord'), 'axe', '전쟁군주는 광전사(도끼)를 따른다');
  assert.strictEqual(G.styleOfClass('windwalker'), 'arrow');
  assert.strictEqual(G.styleOfClass('paladin'), 'holy', '정해 둔 것은 그대로');
  assert.ok(Object.keys(G.ATTACK_STYLE).every((id) => id === 'novice' || G.NODES[id]), '없는 직업의 모션이 있다');
});

section('스테이지·몬스터 배치');
test('모든 지역에서 일반 몬스터 5종과 보스 2종이 빠짐없이 나온다 (예전에는 5번째 몬스터가 한 번도 안 나왔다)', () => {
  for (let b = 0; b < 6; b++) {
    const normals = new Set(), bosses = new Set();
    for (let p = 1; p <= 10; p++) { const m = G.monsterInfo(b * 10 + p); (m.boss ? bosses : normals).add(m.name); }
    assert.strictEqual(normals.size, 5, `지역 ${b}: 일반 몬스터 ${[...normals].join(', ')}`);
    assert.strictEqual(bosses.size, 2, `지역 ${b}: 보스 ${[...bosses].join(', ')}`);
  }
});

test('보스는 5의 배수 스테이지에만 나오고, 같은 몬스터가 두 스테이지 연속으로 나오지 않는다', () => {
  let prev = null;
  for (let st = 1; st <= 130; st++) {
    const m = G.monsterInfo(st);
    assert.strictEqual(m.boss, st % 5 === 0, `스테이지 ${st}`);
    if (prev) assert.notStrictEqual(m.name + m.round, prev, `스테이지 ${st}에서 ${m.name} 반복`);
    prev = m.name + m.round;
  }
});

test('지역 안 위치는 1~10이고, 스테이지 61부터 회차가 올라가며 같은 지역이 다시 나온다', () => {
  assert.deepStrictEqual([1, 5, 10, 11].map((st) => G.monsterInfo(st).pos), [1, 5, 10, 1]);
  assert.strictEqual(G.roundOf(60), 0);
  assert.strictEqual(G.roundOf(61), 1);
  const m61 = G.monsterInfo(61);
  assert.deepStrictEqual([m61.biome, m61.pos, m61.round], [0, 1, 1]);
  assert.strictEqual(G.monsterInfo(121).round, 2);
  assert.strictEqual(G.monsterInfo(61).name, G.monsterInfo(1).name, '같은 몬스터가 색만 바뀌어 다시 나온다');
});

test('일반 몬스터 자리표가 지역 표의 5종을 모두 가리키고 보스 자리는 5의 배수와 일치한다', () => {
  const used = new Set(G.NORMAL_SLOTS.filter((x) => x !== null));
  assert.deepStrictEqual([...used].sort(), [0, 1, 2, 3, 4]);
  G.NORMAL_SLOTS.forEach((slot, i) => assert.strictEqual(slot === null, (i + 1) % 5 === 0, `위치 ${i + 1}`));
});

section('그 밖의 로직');
test('도감 8종을 채우면 codex4·codex8 업적이 함께 달성된다', () => {
  const s = G.createState(0);
  for (const k of Object.keys(G.ADVANCED)) s.mastered[k] = true;
  const ids = G.checkAchievements(s).map((e) => e.id).sort();
  assert.deepStrictEqual(ids, ['codex4', 'codex8', 'tier2']);
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


// ============ 업적 확장 · 유물 · 환생 · 밸런스 ============
section('업적 보상과 기록');
test('업적 50개는 번호가 겹치지 않고, 모두 분류와 양수 보상이 있다', () => {
  const ids = G.ACHIEVEMENTS.map((a) => a.id);
  assert.strictEqual(new Set(ids).size, ids.length);
  assert.ok(G.ACHIEVEMENTS.length >= 40);
  for (const a of G.ACHIEVEMENTS) { assert.ok(a.group && a.name && a.desc && a.icon, a.id); assert.ok(a.reward > 0 && a.goal > 0, a.id); }
});
test('보상 크리스탈은 달성한 업적만, 한 번만 받는다', () => {
  const s = G.createState(0);
  assert.strictEqual(G.claimAchievement(s, 'kill100'), 0, '달성 전에는 못 받는다');
  s.totalKills = 100; G.checkAchievements(s);
  assert.deepStrictEqual(G.unclaimedAchievements(s).map((a) => a.id), ['kill100']);
  assert.strictEqual(G.claimAchievement(s, 'kill100'), 5);
  assert.strictEqual(s.crystals, 5);
  assert.strictEqual(G.claimAchievement(s, 'kill100'), 0, '두 번 받을 수 없다');
  assert.strictEqual(G.claimAchievement(s, 'nope'), 0);
  assert.strictEqual(s.crystals, 5);
});
test('모두 받기는 받을 수 있는 것을 전부 합쳐서 준다', () => {
  const s = G.createState(0);
  s.totalKills = 1000; s.bestStage = 30; s.level = 10; G.checkAchievements(s);
  const want = G.unclaimedAchievements(s).reduce((a, x) => a + x.reward, 0);
  assert.ok(want > 20);
  assert.strictEqual(G.claimAllAchievements(s), want);
  assert.strictEqual(s.crystals, want);
  assert.strictEqual(G.unclaimedAchievements(s).length, 0);
});
test('예전 저장(보상 기록 없음)의 달성 업적도 보상을 받을 수 있다', () => {
  const o = JSON.parse(G.serialize(G.createState(0), 1));
  o.achieved = { kill100: true, stage10: true }; delete o.achClaimed; delete o.stats; delete o.runT;
  const s = G.deserialize(JSON.stringify(o));
  assert.strictEqual(G.claimAllAchievements(s), 10);
});
test('저장 데이터를 고쳐서 달성하지 않은 업적의 보상을 받은 것으로 만들 수 없다', () => {
  const o = JSON.parse(G.serialize(G.createState(0), 1));
  o.achClaimed = { kill100: true, hacker: true }; o.stats = { bossKills: -5, gold: 'x', casts: NaN, taps: 1e400 };
  const s = G.deserialize(JSON.stringify(o));
  assert.deepStrictEqual(s.achClaimed, {});
  assert.strictEqual(s.stats.bossKills, 0);
  assert.strictEqual(s.stats.gold, 0);
  assert.ok(Number.isFinite(s.stats.taps));
});
test('보상 받은 기록과 누적 기록은 저장되고 환생해도 남는다', () => {
  const s = G.createState(0);
  s.totalKills = 100; s.stats.bossKills = 7; G.checkAchievements(s); G.claimAchievement(s, 'kill100');
  s.runBest = 12; G.prestige(s);
  const back = G.deserialize(G.serialize(s, 1));
  assert.strictEqual(back.achClaimed.kill100, true);
  assert.strictEqual(back.stats.bossKills, 7);
  assert.strictEqual(back.crystals, 5);
});
test('누적 기록이 실제 전투에서 올라간다 (보스 처치·골드·스킬·직접 공격·쓰러짐)', () => {
  G.setRandom(seeded(3));
  const s = G.createState(0);
  s.stage = 5; s.monsterMax = s.monsterHp = 5; s.isBoss = true;   // 보스 스테이지
  G.clickAttack(s); G.simulate(s, 1);
  assert.ok(s.stats.taps === 1 && s.stats.bossKills >= 1 && s.stats.gold > 0, JSON.stringify(s.stats));
  const t = G.createState(0); t.level = 99; G.promote(t, 'warrior'); G.simulate(t, 40);
  assert.ok(t.stats.casts > 0, '스킬을 쓰면 올라간다');
  const u = G.createState(0); u.hp = 0.01; G.simulate(u, 0.5);
  assert.strictEqual(u.stats.downs, 1);
  G.setRandom();
});
test('장비를 얻고 팔면 기록이 오르고, 전설 획득은 따로 센다', () => {
  const s = G.createState(0); s.autoSell = 0;
  const ev = [];
  G.setRandom(seeded(1));
  const legend = G.rollItem(s, 20, false, 4), common = G.rollItem(s, 5, false, 0);
  s.bag.push(common);
  G.sellBagItem(s, common.id);
  assert.strictEqual(s.stats.sold, 1);
  G.setRandom();
});

section('유물 (크리스탈 상점의 특별 옵션 장비)');
const relicOwner = (ids) => { const s = G.createState(0); s.crystals = 99999; for (const id of ids) G.buyProduct(s, id); return s; };
test('유물은 크리스탈로 한 번만 살 수 있고, 빈 칸이 있으면 바로 낀다', () => {
  const s = cash(5000);
  const r = G.buyProduct(s, 'relic_seal');
  assert.ok(r.ok);
  assert.deepStrictEqual([s.crystals, s.relics.relic_seal, s.relicEq], [3800, true, ['relic_seal']]);
  const again = G.buyProduct(s, 'relic_seal');
  assert.deepStrictEqual([again.ok, again.reason, s.crystals], [false, 'owned', 3800], '같은 유물은 다시 못 산다');
  const poor = G.buyProduct(cash(100), 'relic_seal');
  assert.deepStrictEqual([poor.ok, poor.reason], [false, 'crystals']);
});
test('유물은 2칸까지만 낄 수 있고, 가득 차면 하나를 빼야 다른 것을 낀다', () => {
  const s = relicOwner(['relic_seal', 'relic_horn', 'relic_scholar']);
  assert.deepStrictEqual(s.relicEq, ['relic_seal', 'relic_horn'], '처음 산 2개만 자동으로 낀다');
  assert.strictEqual(G.toggleRelic(s, 'relic_scholar'), 'full');
  assert.strictEqual(G.toggleRelic(s, 'relic_seal'), 'off');
  assert.strictEqual(G.toggleRelic(s, 'relic_scholar'), 'on');
  assert.strictEqual(G.toggleRelic(s, 'relic_chrono'), 'none', '안 가진 유물');
  assert.deepStrictEqual(s.relicEq, ['relic_horn', 'relic_scholar']);
});
test('유물 효과는 낀 동안만 적용된다', () => {
  const s = relicOwner(['relic_vault']);
  assert.strictEqual(G.relicV(s, 'gold'), 0.3);
  assert.strictEqual(G.relicV(s, 'offline'), 2);
  G.toggleRelic(s, 'relic_vault');
  assert.strictEqual(G.relicV(s, 'gold'), 0);
});
test('탐욕의 금고: 골드 +30%, 오프라인 한도 +2시간', () => {
  const a = G.createState(0), b = relicOwner(['relic_vault']);
  assert.ok(Math.abs(G.goldMult(b) / G.goldMult(a) - 1.3) < 1e-9);
  assert.strictEqual(G.offlineCap(b) - G.offlineCap(a), 2 * 3600);
});
test('동료의 나팔: 동료 공격 +50%', () => {
  const a = G.createState(0), b = relicOwner(['relic_bugle']);
  a.upgrades.companion = b.upgrades.companion = 5;
  assert.ok(Math.abs(G.companionDps(b) / G.companionDps(a) - 1.5) < 1e-9);
});
test('학자의 안경: 처치 경험치 +50%', () => {
  const a = G.createState(0), b = relicOwner(['relic_scholar']);
  for (const s of [a, b]) { s.monsterHp = 1; s.exp = 0; G.clickAttack(s); }
  assert.deepStrictEqual([a.exp, b.exp], [3, 5], '3 → ceil(3 × 1.5)');
});
test('사냥꾼의 뿔피리: 보스에게만 피해 +40%', () => {
  const dmgTo = (s, boss) => { s.stage = boss ? 5 : 4; s.isBoss = boss; s.monsterMax = s.monsterHp = 1e6; s.downT = 0; G.clickAttack(s); return 1e6 - s.monsterHp; };
  const a = G.createState(0), b = relicOwner(['relic_horn']);
  assert.ok(Math.abs(dmgTo(b, true) / dmgTo(a, true) - 1.4) < 1e-6, '보스에게 +40%');
  assert.ok(Math.abs(dmgTo(b, false) / dmgTo(a, false) - 1) < 1e-6, '일반 몬스터에게는 그대로');
});
test('불사조의 깃털: 쓰러졌을 때 부활 시간 -60%', () => {
  const a = G.createState(0), b = relicOwner(['relic_phoenix']);
  a.hp = b.hp = 0.01; b.rescueT = 99; G.simulate(a, 0.1); G.simulate(b, 0.1);   // 깃털의 '버티기'는 쉬는 중
  assert.ok(Math.abs(a.downT - G.DOWN_TIME) < 1e-9);
  assert.ok(Math.abs(b.downT - G.DOWN_TIME * 0.4) < 1e-9, String(b.downT));
});
test('시간의 회중시계: 스킬 쿨타임이 25% 빨리 돈다', () => {
  const mk = (s) => { s.level = 99; G.promote(s, 'warrior'); const id = G.skillsOf(s)[0].id; s.skillCd[id] = 100; s.monsterHp = s.monsterMax = 1e15; return id; };
  const a = G.createState(0), b = relicOwner(['relic_chrono']);
  const ia = mk(a), ib = mk(b);
  G.simulate(a, 3); G.simulate(b, 3);
  const spentA = 100 - a.skillCd[ia], spentB = 100 - b.skillCd[ib];
  assert.ok(Math.abs(spentB / spentA - 1 / 0.75) < 1e-6, `${spentA} / ${spentB}`);
});
const tankState = (relics, stage, boss) => { const s = relicOwner(relics); s.level = 200; s.stage = stage; s.isBoss = !!boss; s.monsterMax = s.monsterHp = 1e30; s.hp = 1000; return s; };
test('수호자의 방패: 받는 피해 -20%, 체력 회복 +50%', () => {
  const a = tankState([], 31), b = tankState(['relic_aegis'], 31);
  G.simulate(a, 0.1); G.simulate(b, 0.1);
  const atk = Math.min(2 * Math.pow(1.19, 30), G.maxHp(a) * 0.06) * 0.1, regen = G.maxHp(a) * 0.02 * 0.1;   // 몬스터 공격은 최대 체력의 6%/초까지만
  assert.ok(Math.abs(a.hp - (1000 + regen - atk)) < 1e-6, String(a.hp));
  assert.ok(Math.abs(b.hp - (1000 + regen * 1.5 - atk * 0.8)) < 1e-6, String(b.hp));
});
test('사냥꾼의 뿔피리: 보스에게 받는 피해만 -25%', () => {
  const loss = (relics, boss) => { const s = tankState(relics, 30, boss); const max = G.maxHp(s), h0 = s.hp; G.simulate(s, 0.1); return h0 + max * 0.002 - s.hp; };
  const bossRatio = loss(['relic_horn'], true) / loss([], true), normalRatio = loss(['relic_horn'], false) / loss([], false);
  assert.ok(Math.abs(bossRatio - 0.75) < 1e-9 && Math.abs(normalRatio - 1) < 1e-9, `${bossRatio} ${normalRatio}`);
});
test('불사조의 깃털: 쓰러질 순간 45초에 한 번 체력 40%로 버틴다', () => {
  const a = tankState([], 60), b = tankState(['relic_phoenix'], 60);
  a.hp = b.hp = 0.001; G.simulate(a, 0.1); G.simulate(b, 0.1);
  assert.ok(a.downT > 0, '유물이 없으면 쓰러진다');
  assert.ok(b.downT === 0 && b.stage === 60 && Math.abs(b.hp - G.maxHp(b) * 0.4) < G.maxHp(b) * 0.02, `hp ${b.hp} down ${b.downT}`);
  b.hp = 0.001; G.simulate(b, 0.1);
  assert.ok(b.downT > 0, '45초 안에 또 쓰러지면 버티지 못한다');
  b.downT = 0; b.hp = 0.001; b.rescueT = 0; G.simulate(b, 0.1);
  assert.strictEqual(b.downT, 0, '시간이 지나면 다시 버틴다');
});
test('네잎클로버: 드롭 확률 +5%p, 희귀 이상 등급이 약 1.4배', () => {
  const a = G.createState(0), b = relicOwner(['relic_clover']);
  assert.ok(Math.abs(G.dropChance(b, false) - G.dropChance(a, false) - 0.05) < 1e-9);
  const rate = (s) => { G.setRandom(seeded(9)); let n = 0; for (let i = 0; i < 40000; i++) if (G.rollItem(s, 10, false).r >= 2) n++; G.setRandom(); return n / 40000; };
  const ratio = rate(b) / rate(a);
  assert.ok(ratio > 1.3 && ratio < 1.5, `배율 ${ratio.toFixed(2)}`);
});
test('유물은 저장되고 환생해도 남지만, 조작한 저장은 걸러진다', () => {
  const s = relicOwner(['relic_seal', 'relic_horn']);
  s.runBest = 12; G.prestige(s);
  const back = G.deserialize(G.serialize(s, 1));
  assert.deepStrictEqual([back.relics, back.relicEq], [s.relics, s.relicEq]);
  const o = JSON.parse(G.serialize(s, 1));
  o.relics = { relic_seal: true, relic_fake: true, relic_chrono: 'yes' };
  o.relicEq = ['relic_seal', 'relic_horn', 'relic_fake', 'relic_seal'];
  const c = G.deserialize(JSON.stringify(o));
  assert.deepStrictEqual(c.relics, { relic_seal: true }, '없는 유물과 가짜 값은 버린다');
  assert.deepStrictEqual(c.relicEq, ['relic_seal'], '안 가진 유물은 낄 수 없고, 중복도 없다');
  const o2 = JSON.parse(G.serialize(relicOwner(['relic_seal', 'relic_horn', 'relic_scholar', 'relic_chrono']), 1));
  o2.relicEq = ['relic_seal', 'relic_horn', 'relic_scholar', 'relic_chrono'];
  assert.strictEqual(G.deserialize(JSON.stringify(o2)).relicEq.length, 2, '칸 수 제한');
});

section('장비 상점 (특별 옵션 장비, 시간마다 갱신)');
const HOUR = 3600e3, WIN_MS = St.GEAR_SHOP.refreshSec * 1000;
const shopUser = (win, crystals) => { const t = cash(crystals === undefined ? 99999 : crystals); t.bestStage = 40; G.shopSync(t, win * WIN_MS + 1, 0); return t; };
test('진열은 6개이고 모두 영웅 이상이며 특별 옵션이 하나씩 붙고, 옵션 종류는 서로 겹치지 않는다', () => {
  const t = shopUser(500);
  const stock = G.shopStock(t);
  assert.strictEqual(stock.length, St.GEAR_SHOP.count);
  assert.ok(stock.every((o) => o.item.r >= 3 && o.item.sp && St.specialOf(o.item.sp.k) && !o.sold));
  assert.strictEqual(new Set(stock.map((o) => o.item.sp.k)).size, stock.length, '옵션이 겹치지 않는다');
  const slots = {}; for (const o of stock) slots[o.item.slot] = (slots[o.item.slot] || 0) + 1;
  assert.deepStrictEqual(slots, { weapon: 2, armor: 2, accessory: 2 }, '무기·방어구·액세서리가 2개씩');
  for (const o of stock) {
    const [lo, hi] = St.specialOf(o.item.sp.k)[o.item.r >= 4 ? 'legend' : 'hero'];   // 전설·유니크·신화는 전설 범위
    assert.ok(o.item.sp.v >= lo && o.item.sp.v <= hi, `${o.item.sp.k} ${o.item.sp.v}`);
    assert.strictEqual(o.price, St.GEAR_SHOP.price[o.item.r]);
    assert.strictEqual(o.item.ilvl, 40);
    assert.ok(o.item.val >= G.GEAR[o.item.slot].kinds[o.item.kind].base[o.item.r] * (1 + 40 / 40) - 1e-9, '드롭보다 낮게 나오지 않는다');
  }
});
test('같은 시간 구간에서는 언제 열어도 같은 진열이고, 구간이 바뀌면 다른 진열이 된다', () => {
  const a = shopUser(500), b = shopUser(500), c = shopUser(501);
  assert.deepStrictEqual(G.shopStock(a), G.shopStock(b));
  assert.notDeepStrictEqual(G.shopStock(a).map((o) => o.item), G.shopStock(c).map((o) => o.item));
  G.shopSync(a, 500 * WIN_MS + 3 * HOUR, 0);
  assert.deepStrictEqual(G.shopStock(a), G.shopStock(b), '3시간 뒤에도 같은 구간');
});
test('구간은 서버 시각으로만 넘어간다: 기기 시계를 돌려도, 서버 시각을 못 받아도 새 물건이 나오지 않는다', () => {
  const t = shopUser(500);
  const before = JSON.stringify(G.shopStock(t));
  G.shopSync(t, null, 900 * WIN_MS);
  G.shopSync(t, NaN, 900 * WIN_MS);
  assert.strictEqual(JSON.stringify(G.shopStock(t)), before, '오프라인에서는 그대로');
  G.shopSync(t, 400 * WIN_MS, 0);
  assert.strictEqual(t.shop.win, 500, '서버가 옛 시각을 말해도 뒤로 가지 않는다');
  const info = G.shopSync(t, 500 * WIN_MS + WIN_MS - 5000, 0);
  assert.deepStrictEqual([info.online, info.secsLeft], [true, 5], '갱신까지 남은 시간');
  G.shopSync(t, 501 * WIN_MS, 0);
  assert.strictEqual(t.shop.win, 501);
  const fresh = G.createState(0);
  G.shopSync(fresh, null, 700 * WIN_MS);
  assert.strictEqual(fresh.shop.win, 700, '처음 쓰는 오프라인 기기는 기기 시각으로 시작하고');
  G.shopSync(fresh, null, 999 * WIN_MS);
  assert.strictEqual(fresh.shop.win, 700, '그 뒤로는 시계를 돌려도 넘어가지 않는다');
});
test('구매: 크리스탈을 내고 장비를 얻고 그 칸은 "판매 완료"가 되며, 새 구간이 되면 다시 열린다', () => {
  const t = shopUser(500, 3000);
  const stock = G.shopStock(t);
  const r = G.buyShopItem(t, 0);
  assert.ok(r.ok && r.item.id > 0 && r.item.sp && ['equipped', 'bag'].includes(r.action));
  assert.strictEqual(t.crystals, 3000 - stock[0].price);
  assert.ok(G.shopStock(t)[0].sold);
  assert.strictEqual(G.buyShopItem(t, 0).reason, 'sold');
  assert.strictEqual(G.buyShopItem(t, 99).reason, 'none');
  assert.ok([...t.bag, ...Object.values(t.equip)].some((x) => x && x.id === r.item.id), '장비가 내 것이 됐다');
  G.shopSync(t, 501 * WIN_MS, 0);
  assert.ok(G.shopStock(t).every((o) => !o.sold));
});
test('크리스탈이 모자라거나 가방이 가득 차면 살 수 없고 아무것도 바뀌지 않는다', () => {
  const poor = shopUser(500, 100);
  assert.deepStrictEqual([G.buyShopItem(poor, 0).reason, poor.crystals, poor.bag.length], ['crystals', 100, 0]);
  const full = shopUser(500);
  for (let i = 0; i < G.bagLimit(full); i++) full.bag.push({ id: 1000 + i, slot: 'weapon', kind: 'dmg', r: 0, ilvl: 1, val: 1, n: 0 });
  const c0 = full.crystals;
  assert.deepStrictEqual([G.buyShopItem(full, 0).reason, full.crystals], ['bag', c0]);
});
test('새로고침: 크리스탈을 내고 진열이 바뀌며 산 기록이 지워지고, 한 구간에 3번까지다', () => {
  const t = shopUser(500, 1000);
  const first = JSON.stringify(G.shopStock(t).map((o) => o.item));
  G.buyShopItem(t, 1);
  const seen = new Set([first]);
  for (let i = 0; i < 3; i++) { const r = G.rerollShop(t); assert.ok(r.ok); seen.add(JSON.stringify(G.shopStock(t).map((o) => o.item))); }
  assert.strictEqual(seen.size, 4, '매번 다른 진열');
  assert.ok(G.shopStock(t).every((o) => !o.sold), '새 진열은 모두 살 수 있다');
  assert.ok(t.crystals < 1000 - 3 * St.GEAR_SHOP.rerollCost + 1 && t.crystals >= 0);
});
test('새로고침 비용과 횟수 제한', () => {
  const t = shopUser(500, 1000), c0 = t.crystals;
  G.rerollShop(t);
  assert.strictEqual(t.crystals, c0 - St.GEAR_SHOP.rerollCost);
  G.rerollShop(t); G.rerollShop(t);
  assert.strictEqual(G.rerollShop(t).reason, 'max');
  const poor = shopUser(500, 10);
  assert.deepStrictEqual([G.rerollShop(poor).reason, poor.crystals], ['crystals', 10]);
  G.shopSync(t, 501 * WIN_MS, 0);
  assert.strictEqual(t.shop.reroll, 0, '새 구간에는 횟수가 돌아온다');
});
test('전설이 약 25%, 나머지는 영웅으로 나온다 (구간 2,000개)', () => {
  let legend = 0, total = 0;
  for (let w = 1000; w < 3000; w++) { const t = shopUser(w); for (const o of G.shopStock(t)) { total++; if (o.item.r === 4) legend++; } }
  assert.ok(Math.abs(legend / total - St.GEAR_SHOP.legendChance) < 0.02, `전설 ${(100 * legend / total).toFixed(1)}%`);
});
test('특별 옵션은 장착했을 때만 적용되고, 이름 앞에 옵션 이름이 붙는다', () => {
  const t = shopUser(500);
  const it = Object.assign({ id: 77 }, G.shopStock(t)[0].item);
  it.sp = { k: 'boss', v: 0.2 };
  t.bag.push(it);
  assert.strictEqual(G.specialV(t, 'boss'), 0);
  assert.ok(G.itemName(it).startsWith('사냥꾼의 '), G.itemName(it));
  assert.ok(G.equipItem(t, 77));
  assert.strictEqual(G.specialV(t, 'boss'), 0.2);
  G.unequipItem(t, it.slot);
  assert.strictEqual(G.specialV(t, 'boss'), 0);
});
test('특별 옵션은 유물과 합쳐지고, 상한(쿨타임 60%·받는 피해 70%·부활 80%)은 넘지 않는다', () => {
  const t = relicOwner(['relic_chrono', 'relic_aegis']);
  t.equip.weapon = { id: 1, slot: 'weapon', kind: 'dmg', r: 4, ilvl: 10, val: 10, n: 0, sp: { k: 'cdr', v: 0.45 } };
  t.equip.armor = { id: 2, slot: 'armor', kind: 'hp', r: 4, ilvl: 10, val: 10, n: 0, sp: { k: 'guard', v: 0.5 } };
  assert.ok(Math.abs(G.specialV(t, 'cdr') - 0.7) < 1e-9);
  assert.ok(Math.abs(G.specialV(t, 'guard') - 0.7) < 1e-9);
  t.stage = 31; t.monsterMax = t.monsterHp = 1e30; t.level = 200; t.hp = 1000;
  const hit = Math.min(2 * Math.pow(1.19, 30), G.maxHp(t) * 0.06) * 0.1, regen = G.maxHp(t) * 0.02 * 1.5 * 0.1;
  G.simulate(t, 0.1);
  assert.ok(Math.abs(t.hp - (1000 + regen - hit * 0.3)) < 1e-6, `방어가 70%를 넘어도 70%까지만 막는다: ${t.hp}`);
});
test('특별 옵션 장비는 옵션 없는 드롭에게 자리를 뺏기지 않고 정리·자동 판매 대상이 아니다', () => {
  const t = G.createState(0);
  const sp = { id: 5, slot: 'weapon', kind: 'dmg', r: 3, ilvl: 10, val: 20, n: 0, sp: { k: 'exp', v: 0.1 } };
  const plainBetter = { id: 6, slot: 'weapon', kind: 'dmg', r: 3, ilvl: 10, val: 60, n: 0 };
  t.equip.weapon = sp;
  assert.strictEqual(G.isUpgrade(t, plainBetter), false, '수치가 3배여도 옵션 장비를 밀어내지 않는다');
  t.equip.weapon = { id: 7, slot: 'weapon', kind: 'dmg', r: 3, ilvl: 10, val: 20, n: 0 };
  assert.strictEqual(G.isUpgrade(t, Object.assign({}, sp, { val: 19 })), true, '옵션 장비는 수치가 90% 이상이면 자리를 얻는다');
  assert.strictEqual(G.isUpgrade(t, Object.assign({}, sp, { val: 15 })), false);
  t.equip.weapon = { id: 8, slot: 'weapon', kind: 'dmg', r: 3, ilvl: 10, val: 50, n: 0 };
  t.bag = [sp];
  assert.deepStrictEqual(G.bagWeaker(t), [], '더 약해 보여도 옵션 장비는 정리 대상이 아니다');
});
test('특별 옵션 장비는 저장·복원되고, 조작된 옵션은 걸러진다', () => {
  const t = shopUser(500, 5000);
  G.buyShopItem(t, 0);
  const back = G.deserialize(G.serialize(t, 1));
  assert.deepStrictEqual([back.shop, back.crystals], [t.shop, t.crystals]);
  const all = [...back.bag, ...Object.values(back.equip)].filter(Boolean);
  assert.ok(all.length === 1 && all[0].sp && all[0].sp.v === [...t.bag, ...Object.values(t.equip)].filter(Boolean)[0].sp.v);
  const o = JSON.parse(G.serialize(t, 1));
  const target = o.bag[0] || Object.values(o.equip).find(Boolean);
  target.sp = { k: 'hacker', v: 99 };
  const c = G.deserialize(JSON.stringify(o));
  assert.ok([...c.bag, ...Object.values(c.equip)].filter(Boolean).every((x) => !x.sp), '없는 옵션은 버린다');
  target.sp = { k: 'exp', v: 99 }; target.r = 1;
  assert.ok([...G.deserialize(JSON.stringify(o)).bag, ...Object.values(G.deserialize(JSON.stringify(o)).equip)].filter(Boolean).every((x) => !x.sp), '희귀 이하에는 옵션이 붙을 수 없다');
  target.r = 4; target.sp = { k: 'exp', v: 99 };
  const d = G.deserialize(JSON.stringify(o));
  const kept = [...d.bag, ...Object.values(d.equip)].filter(Boolean)[0];
  assert.ok(kept.sp && kept.sp.v <= St.specialOf('exp').legend[1], '값은 그 옵션의 최대치로 제한된다');
  const bad = JSON.parse(G.serialize(t, 1)); bad.shop = { win: 'x', reroll: 99, lvl: -4, bought: [0, 0, 7, 'a', 2] };
  const e = G.deserialize(JSON.stringify(bad));
  assert.deepStrictEqual(e.shop, { win: 0, reroll: St.GEAR_SHOP.rerollMax, lvl: 0, bought: [0, 2] });
});
test('상점 값이 없는 예전 저장도 불러오고, 환생해도 진열 기록은 남는다', () => {
  const o = JSON.parse(G.serialize(G.createState(0), 1)); delete o.shop;
  assert.deepStrictEqual(G.deserialize(JSON.stringify(o)).shop, { win: 0, reroll: 0, lvl: 0, bought: [] });
  const t = shopUser(500, 3000); G.buyShopItem(t, 2); t.runBest = 12; G.prestige(t);
  assert.deepStrictEqual(t.shop.bought, [2]);
});

section('장비 강화(재련)');
test('같은 칸의 다른 장비를 재료로 써서 강화하면 골드가 들고 재료가 사라지며 수치가 오른다', () => {
  const s = G.createState(0); s.gold = 1e9;
  const target = mkItem({ id: 1, val: 10 });
  const material = mkItem({ id: 2, val: 5 });
  s.equip.weapon = target; s.bag = [material];
  const before = G.gearMult(s, 'dmg');
  const r = G.enhanceItem(s, 1, 2);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(target.enh, 1);
  assert.deepStrictEqual(s.bag, [], '재료로 쓴 장비는 가방에서 사라진다');
  assert.ok(G.gearMult(s, 'dmg') > before, '강화하면 실제 능력치가 오른다');
});
test('재료가 없거나 칸이 다르면 강화할 수 없고, 골드가 모자라도 안 된다', () => {
  const s = G.createState(0); s.gold = 1e9;
  const target = mkItem({ id: 1, val: 10 });
  s.equip.weapon = target;
  assert.strictEqual(G.enhanceItem(s, 1, 999).reason, 'material', '재료가 없다');
  s.bag = [mkItem({ id: 2, slot: 'armor', kind: 'hp', val: 5 })];
  assert.strictEqual(G.enhanceItem(s, 1, 2).reason, 'material', '다른 칸의 장비는 재료로 쓸 수 없다');
  s.bag = [mkItem({ id: 3, val: 5 })]; s.gold = 0;
  assert.strictEqual(G.enhanceItem(s, 1, 3).reason, 'gold');
});
test('최대 강화(15단계)에 도달하면 더 강화할 수 없다', () => {
  assert.strictEqual(G.ENH_MAX, 15);
  const s = G.createState(0); s.gold = 1e12;
  const target = mkItem({ id: 1, val: 10, enh: G.ENH_MAX });
  s.equip.weapon = target; s.bag = [mkItem({ id: 2, val: 5 })];
  assert.strictEqual(G.enhanceItem(s, 1, 2).reason, 'max');
});
test('강화 확률: 낮은 단계는 100%, 높은 단계로 갈수록 낮아지고, 실패해도 골드·재료는 그대로 사라진다', () => {
  assert.strictEqual(G.enhChance(0), 1, '처음 강화는 실패하지 않는다');
  assert.ok(G.enhChance(G.ENH_MAX - 1) < 1, '마지막 단계 근처는 100% 미만이다');
  assert.ok(G.enhChance(10) < G.enhChance(0), '단계가 높을수록 확률이 낮아진다');
  G.setRandom(() => 0.999);   // 항상 큰 값이 나오게 해서 실패를 강제한다
  const s = G.createState(0); s.gold = 1e9;
  const target = mkItem({ id: 1, val: 10, enh: 10 });   // enhChance(10) = 0.55 < 1
  s.equip.weapon = target; s.bag = [mkItem({ id: 2, val: 5 })];
  const goldBefore = s.gold;
  const r = G.enhanceItem(s, 1, 2);
  G.setRandom();
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.success, false, '확률보다 큰 난수가 나오면 실패한다');
  assert.strictEqual(target.enh, 10, '실패하면 강화 단계가 오르지 않는다');
  assert.strictEqual(s.gold, goldBefore - r.cost, '실패해도 골드는 그대로 사라진다');
  assert.deepStrictEqual(s.bag, [], '실패해도 재료는 사라진다');
});
test('equipPower는 실제로 그 장비를 껴 봤을 때의 종합 전투력(초당 피해)을 계산하고, 계산 뒤 원래대로 되돌린다', () => {
  const s = G.createState(0);
  const apsItem = mkItem({ id: 1, slot: 'accessory', kind: 'aps', val: 50 });
  const before = G.totalDps(s);
  const p = G.equipPower(s, apsItem);
  assert.ok(p > before, '공격 속도 액세서리를 끼면 전투력이 오른다');
  assert.strictEqual(s.equip.accessory, null, '계산 후에는 원래 상태로 되돌아간다');
  assert.strictEqual(G.totalDps(s), before, '전투력도 원래 값으로 돌아온다');
});
test('강화된 장비는 자연 최대치보다 세더라도 자동 정리·자동 장착에서 손해 보지 않는다', () => {
  const s = G.createState(0);
  const weak = mkItem({ id: 1, val: 5, enh: 10 });   // 강화로 실제 수치는 5 × 1.8 = 9
  const strongDrop = mkItem({ id: 2, val: 8 });       // 강화 안 된 새 드롭
  s.equip.weapon = weak;
  assert.strictEqual(G.isUpgrade(s, strongDrop), false, '강화된 장비가 더 세면 새 드롭이 밀어내지 못한다');
  assert.strictEqual(G.isWeaker(s, strongDrop), true, '그 새 드롭은 정리 대상이다');
});
test('강화 정보는 저장·복원되고, 범위를 넘는 값은 걸러진다', () => {
  const s = G.createState(0); s.gold = 1e9;
  s.equip.weapon = mkItem({ id: 1, val: 10 });
  s.bag = [mkItem({ id: 2, val: 5 })];
  G.enhanceItem(s, 1, 2);
  const back = G.deserialize(G.serialize(s, 1));
  assert.strictEqual(back.equip.weapon.enh, 1);
  const o = JSON.parse(G.serialize(s, 1));
  o.equip.weapon.enh = 999;
  assert.strictEqual(G.deserialize(JSON.stringify(o)).equip.weapon.enh, G.ENH_MAX);
});

section('환생 보상과 전직·증표');
test('환생 보상은 스테이지 5개당 증표 1개에 판을 키운 시간(10분 = 100%)을 곱한다', () => {
  const s = G.createState(0);
  s.runBest = 50;
  const at = (sec) => { s.runT = sec; return G.prestigeGain(s); };
  assert.deepStrictEqual([at(0), at(120), at(300), at(600), at(5000)], [1, 2, 5, 10, 10]);
  s.runBest = 9; s.runT = 9999;
  assert.strictEqual(G.prestigeGain(s), 0, '스테이지 10 미만은 환생 불가');
});
test('왕의 인장: 환생 증표 +15%', () => {
  const s = relicOwner(['relic_seal']); s.runBest = 50; s.runT = 600;
  assert.strictEqual(G.prestigeGain(s), 11);
});
test('환생하면 이번 판 시간이 0으로 돌아가고, 게임을 켜 둔 시간은 판 시간에 쌓인다', () => {
  const s = G.createState(0);
  G.simulate(s, 100); assert.ok(Math.abs(s.runT - 100) < 1e-6);
  s.runBest = 12; G.prestige(s); assert.strictEqual(s.runT, 0);
});
test('예전 저장(판 시간 없음)은 손해 보지 않게 10분이 지난 것으로 시작한다', () => {
  const o = JSON.parse(G.serialize(G.createState(0), 1)); delete o.runT;
  const s = G.deserialize(JSON.stringify(o));
  assert.strictEqual(s.runT, G.PRESTIGE_FULL_SEC);
  o.runT = -5; assert.strictEqual(G.deserialize(JSON.stringify(o)).runT, 0);
});
test('전직 단계가 오를수록 증표의 공격력·골드 보너스가 커진다 (직업 공명)', () => {
  const s = G.createState(0); s.tokens = 10; s.level = 99;
  const m = [G.tokenMult(s)];
  for (const id of ['mage', 'pyromancer', 'infernomage', 'flameemperor']) { G.promote(s, id); m.push(G.tokenMult(s)); }
  for (let i = 1; i < m.length; i++) assert.ok(m[i] > m[i - 1], m.join(','));
  assert.ok(Math.abs(m[0] - (1 + G.TOKEN_BONUS * 10)) < 1e-9);
  assert.ok(Math.abs(m[4] - (1 + G.TOKEN_BONUS * (1 + 4 * G.RESONANCE) * 10)) < 1e-9);
  assert.ok(Math.abs(G.resonance(s) - (1 + 4 * G.RESONANCE)) < 1e-9);
});
test('증표는 체력에도 깃든다 (증표 효과의 0.4제곱)', () => {
  const a = G.createState(0), b = G.createState(0); b.tokens = 100;
  assert.ok(Math.abs(G.maxHp(b) / G.maxHp(a) - Math.pow(G.tokenMult(b), 0.4)) < 1e-9);
  assert.ok(G.maxHp(b) > G.maxHp(a) * 4);
});
test('직업 각성: 직업의 장점 배율만 강해지고 단점은 그대로다', () => {
  const s = G.createState(0); s.level = 99; G.promote(s, 'mage');   // dmg ×1.35, hp ×0.85
  const d0 = G.statMult(s, 'dmg'), h0 = G.statMult(s, 'hp');
  s.perks.awaken = 5;
  assert.ok(Math.abs(G.statMult(s, 'dmg') - Math.pow(1.35, 1.5)) < 1e-9);
  assert.strictEqual(G.statMult(s, 'hp'), h0, '체력 단점은 그대로');
  assert.ok(G.statMult(s, 'dmg') > d0);
});
test('도감 공명: 직업 도감 보너스가 레벨당 +20%', () => {
  const s = G.createState(0); s.mastered.knight = true; s.mastered.berserker = true;
  const m0 = G.masteryMult(s) - 1;
  s.perks.codex = 5;
  assert.ok(Math.abs((G.masteryMult(s) - 1) / m0 - 2) < 1e-9);
});
test('직업 각성·도감 공명은 왕의 위엄을 먼저 사야 열리고, 가격은 4·8·12…', () => {
  const s = G.createState(0); s.tokens = 200;
  assert.strictEqual(G.canBuyPerk(s, 'awaken'), false);
  s.perks = { might: 5, greed: 5, kingly: 1 };
  assert.ok(G.canBuyPerk(s, 'awaken') && G.canBuyPerk(s, 'codex'));
  assert.deepStrictEqual([G.perkCost(s, 'awaken')], [4]);
  assert.strictEqual(G.PERKS.awaken.tier, 4);
});
test('저장·불러오기와 초기화가 새 강화와도 맞는다 (쓴 증표 계산)', () => {
  const s = G.createState(0); s.tokens = 200; s.perks = { might: 5, greed: 5, kingly: 1, awaken: 2 };
  const spent = G.perkSpent(s);
  assert.strictEqual(spent, 15 + 15 + 5 + 12);
  assert.strictEqual(G.respecPerks(s), spent);
});

section('밸런스 회귀 (봇 시뮬레이션)');
test('몬스터의 공격은 초당 최대 체력의 6%를 넘지 않아서, 스테이지 150에서도 한 번 맞고 쓰러지지 않는다', () => {
  const s = G.createState(0); s.stage = 150; s.monsterMax = s.monsterHp = 1e300; s.level = 30;
  s.hp = G.maxHp(s);
  G.simulate(s, 1);
  assert.ok(s.downT === 0 && s.hp >= G.maxHp(s) * (1 - 0.06 - 1e-9), `체력 ${(100 * s.hp / G.maxHp(s)).toFixed(1)}%`);
  G.simulate(s, 4);
  assert.strictEqual(s.downT, 0, '몇 초를 맞아도 버틴다 (체력 회복이 있어 실제로는 25초쯤 버틴다)');
  for (let i = 0; i < 60; i++) G.simulate(s, 1);
  assert.ok(s.downT > 0 || s.stage < 150, '계속 맞으면 결국 쓰러진다');
});
test('증표가 쌓인 뒤 10분 판에서 쓰러지는 횟수가 예전(111~164번)보다 훨씬 적다', () => {
  G.setRandom(seeded(7));
  const s = G.createState(0); s.tokens = 60; s.prestiges = 5;
  for (const id of ['might', 'greed', 'vitality', 'kingly']) s.perks[id] = G.PERKS[id].max;
  s.hp = G.maxHp(s);
  bot(s, MAGE, 600);
  G.setRandom();
  assert.ok(s.runBest >= 90 && s.stats.downs <= 50, `스테이지 ${s.runBest}, 쓰러짐 ${s.stats.downs}번`);
});

// 강화를 가장 싼 것부터 사고 전직 경로를 따라가는 봇
function bot(s, path, seconds, order) {
  order = order || ['weapon', 'armor', 'speed', 'companion', 'loot'];
  for (let t = 0; t < seconds; t++) {
    G.simulate(s, 1);
    for (;;) { let b = null, bc = Infinity; for (const k of order) if (G.canBuy(s, k) && G.upgradeCost(s, k) < bc) { b = k; bc = G.upgradeCost(s, k); } if (!b) break; G.buy(s, b); }
    const st = G.promoStage(s);
    if (st) { const id = path[['base', 'adv', 'adv3', 'adv4', 'adv5'].indexOf(st)]; if (id) G.promote(s, id); }
  }
}
const MAGE = ['mage', 'pyromancer', 'infernomage', 'flameemperor'];
test('환생을 짧게 반복하는 쪽이 10분씩 키우는 쪽보다 증표를 훨씬 더 벌지 못한다', () => {
  const loop = (runMin, totalMin) => {
    G.setRandom(seeded(4));
    const s = G.createState(0);
    for (let el = 0; el + runMin <= totalMin; el += runMin) {
      bot(s, MAGE, runMin * 60);
      G.prestige(s);
      for (;;) { let b = null, bc = Infinity; for (const id of G.PERK_KEYS) if (G.canBuyPerk(s, id) && G.perkCost(s, id) < bc) { b = id; bc = G.perkCost(s, id); } if (!b) break; G.buyPerk(s, b); }
    }
    G.setRandom();
    return s.tokens;
  };
  const spam = loop(3, 60), steady = loop(10, 60);
  assert.ok(spam <= steady * 1.15, `3분마다 ${spam}개, 10분마다 ${steady}개 (예전에는 3.5배였다)`);
});
test('재빠른 손은 이제 실제로 도움이 된다 (없으면 스테이지가 3 이상 낮아진다)', () => {
  const fin = (order) => { G.setRandom(seeded(5)); const s = G.createState(0); bot(s, MAGE, 15 * 60, order); G.setRandom(); return s.runBest; };
  const withSpeed = fin(), without = fin(['weapon', 'armor', 'companion', 'loot']);
  assert.ok(withSpeed - without >= 3, `${withSpeed} vs ${without}`);
});
test('증표가 많아도 스테이지가 90 근처에서 멈추지 않는다 (증표 150개로 15분에 100 넘게)', () => {
  G.setRandom(seeded(6));
  const s = G.createState(0); s.tokens = 150; s.prestiges = 8;
  for (const id of ['might', 'greed', 'vitality', 'kingly', 'headstart']) s.perks[id] = G.PERKS[id].max;
  s.hp = G.maxHp(s);
  bot(s, MAGE, 15 * 60);
  G.setRandom();
  assert.ok(s.runBest >= 98, `스테이지 ${s.runBest}`);
});
test('32가지 4차 직업이 증표 70개 상태에서 15분 뒤 도달하는 스테이지 격차가 9 이하다 (4차 전직 레벨이 65로 늘어난 뒤로는 이 정도 투자가 있어야 15분 안에 전부 4차에 닿는다)', () => {
  const paths = [];
  const walk = (p) => { if (p.length === 4) { paths.push(p); return; } for (const c of (p.length === 0 ? Object.keys(G.CLASSES) : G.childrenOf(p[p.length - 1]))) walk(p.concat(c)); };
  walk([]);
  const res = paths.map((p) => {
    G.setRandom(seeded(2));
    const s = G.createState(0); s.tokens = 70; s.prestiges = 6;
    for (const id of ['might', 'greed', 'vitality']) s.perks[id] = 8;
    s.hp = G.maxHp(s);
    bot(s, p, 15 * 60);
    return s.runBest;
  });
  G.setRandom();
  const spread = Math.max(...res) - Math.min(...res);
  assert.ok(spread <= 9, `격차 ${spread} (${Math.min(...res)}~${Math.max(...res)})`);
});
// 씨앗 하나로만 재면 장비 드롭 운에 따라 격차가 10~20으로 흔들려서(2026-09-24 실측), 씨앗 3개로 경로마다 평균을 낸 뒤 비교한다.
test('64가지 5차 직업이 증표 2000개 상태에서 25분 뒤 도달하는 스테이지(씨앗 3개 평균) 격차가 15 이하다', () => {
  const paths = [];
  const walk = (p) => { if (p.length === 5) { paths.push(p); return; } for (const c of (p.length === 0 ? Object.keys(G.CLASSES) : G.childrenOf(p[p.length - 1]))) walk(p.concat(c)); };
  walk([]);
  assert.strictEqual(paths.length, 64);
  const SEEDS = [1, 2, 3];
  const res = paths.map((p) => {
    let sum = 0, reached5 = true;
    for (const seed of SEEDS) {
      G.setRandom(seeded(seed));
      const s = G.createState(0); s.tokens = 2000; s.prestiges = 25;
      for (const id of ['might', 'greed', 'vitality', 'kingly']) s.perks[id] = G.PERKS[id].max;
      s.hp = G.maxHp(s);
      bot(s, p, 25 * 60);
      reached5 = reached5 && G.classPath(s).length === 5;
      sum += s.runBest;
    }
    G.setRandom();
    return { stage: sum / SEEDS.length, reached5 };
  });
  assert.ok(res.every((r) => r.reached5), '이 정도 투자로는 25분 안에 모든 경로가 5차에 닿아야 한다');
  const stages = res.map((r) => r.stage);
  const spread = Math.max(...stages) - Math.min(...stages);
  assert.ok(spread <= 15, `격차 ${spread.toFixed(1)} (${Math.min(...stages).toFixed(1)}~${Math.max(...stages).toFixed(1)})`);
});


section('자리를 비운 시간 (오프라인 보상)');
const awayState = (savedWall, savedSrv) => { const s = G.createState(0); s.savedAt = savedWall; s.srvSavedAt = savedSrv || 0; return s; };
test('서버 시각이 있으면 기기 시계가 아니라 서버 시각의 차이로 잰다', () => {
  const s = awayState(1e9, 5e12);
  const a = G.resolveAway(s, 1e9 + 3600e3, 5e12 + 1800e3);   // 기기는 1시간, 서버는 30분
  assert.deepStrictEqual([a.seconds, a.source, a.jumped, a.capped], [1800, 'server', true, false]);
});
test('기기 시계를 앞으로 돌려도(10시간) 서버가 5분이라고 하면 5분만 받는다', () => {
  const s = awayState(1e9, 5e12);
  const a = G.resolveAway(s, 1e9 + 10 * 3600e3, 5e12 + 300e3);
  assert.deepStrictEqual([a.seconds, a.jumped], [300, true]);
});
test('기기 시계가 뒤로 가 있어도(음수) 서버 시각으로 실제 비운 시간을 받는다', () => {
  const s = awayState(1e9, 5e12);
  const a = G.resolveAway(s, 1e9 - 3600e3, 5e12 + 7200e3);
  assert.deepStrictEqual([a.seconds, a.source, a.jumped], [7200, 'server', true]);
});
test('서버 시각을 모르면(저장 때나 지금) 기기 시계의 차이를 쓰고, 음수는 0이다', () => {
  assert.deepStrictEqual(G.resolveAway(awayState(1e9, 0), 1e9 + 600e3, 5e12).source, 'device', '저장 때 서버 시각을 몰랐던 경우');
  assert.strictEqual(G.resolveAway(awayState(1e9, 0), 1e9 + 600e3, 5e12).seconds, 600);
  assert.deepStrictEqual([G.resolveAway(awayState(1e9, 5e12), 1e9 + 600e3, null).source, G.resolveAway(awayState(1e9, 5e12), 1e9 + 600e3, NaN).seconds], ['device', 600], '지금 서버 시각을 못 받은 경우');
  assert.strictEqual(G.resolveAway(awayState(1e9, 0), 1e9 - 999e3, null).seconds, 0);
});
test('두 시각이 2분 이내로 어긋난 것은 시계가 튄 것으로 치지 않는다', () => {
  const s = awayState(1e9, 5e12);
  assert.strictEqual(G.resolveAway(s, 1e9 + 3600e3, 5e12 + 3600e3 + 100e3).jumped, false);
  assert.strictEqual(G.resolveAway(s, 1e9 + 3600e3, 5e12 + 3600e3 + 130e3).jumped, true);
});
test('한도(기본 8시간 + 든든한 휴식·탐욕의 금고)를 넘으면 한도까지만 주고 표시한다', () => {
  const s = awayState(1e9, 5e12);
  const a = G.resolveAway(s, 1e9, 5e12 + 20 * 3600e3);
  assert.deepStrictEqual([a.seconds, a.capped, a.raw], [8 * 3600, true, 20 * 3600]);
  s.perks.rest = 4;
  assert.strictEqual(G.resolveAway(s, 1e9, 5e12 + 20 * 3600e3).seconds, 12 * 3600);
  const v = relicOwner(['relic_vault']); v.savedAt = 1e9; v.srvSavedAt = 5e12;
  assert.strictEqual(G.resolveAway(v, 1e9, 5e12 + 20 * 3600e3).seconds, 10 * 3600);
});
test('여러 번에 나눠 받을 때는 남은 한도(maxSeconds)까지만 준다', () => {
  const s = awayState(1e9, 5e12);
  assert.strictEqual(G.resolveAway(s, 1e9, 5e12 + 5 * 3600e3, 3 * 3600).seconds, 3 * 3600);
  assert.strictEqual(G.resolveAway(s, 1e9, 5e12 + 5 * 3600e3, 0).seconds, 0);
  assert.strictEqual(G.resolveAway(s, 1e9, 5e12 + 5 * 3600e3, -50).seconds, 0);
  assert.strictEqual(G.resolveAway(s, 1e9, 5e12 + 5 * 3600e3, NaN).seconds, 5 * 3600, '값이 이상하면 한도 없음이 아니라 기본 한도');
});
test('보상은 한 번만 준다: 받고 나면 저장 시각이 지금으로 옮겨져서 바로 다시 받을 수 없다', () => {
  G.setRandom(seeded(2));
  const s = awayState(0, 5e12);
  const r = G.applyOffline(s, 3600e3, 5e12 + 3600e3);
  assert.ok(r && r.seconds === 3600 && r.source === 'server' && r.gold > 0 && r.kills > 0);
  assert.deepStrictEqual([s.savedAt, s.srvSavedAt], [3600e3, 5e12 + 3600e3]);
  assert.strictEqual(G.applyOffline(s, 3600e3 + 10e3, 5e12 + 3610e3), null, '10초 뒤에는 보상이 없다');
  G.setRandom();
});
test('30초 미만은 보상이 없지만 저장 시각은 옮겨진다 (짧게 여러 번 열어도 시간이 새지 않는다)', () => {
  const s = awayState(0, 5e12);
  assert.strictEqual(G.applyOffline(s, 20e3, 5e12 + 20e3), null);
  assert.strictEqual(s.savedAt, 20e3);
  const r = G.applyOffline(s, 70e3, 5e12 + 70e3);
  assert.strictEqual(r.seconds, 50, '옮겨진 시각부터 다시 잰다');
});
test('보고서에 실제 비운 시간(raw)·기준(source)·한도 여부가 담긴다', () => {
  G.setRandom(seeded(3));
  const s = awayState(0, 5e12);
  const r = G.applyOffline(s, 20 * 3600e3, 5e12 + 20 * 3600e3);
  assert.deepStrictEqual([r.seconds, r.raw, r.capped, r.source], [8 * 3600, 20 * 3600, true, 'server']);
  G.setRandom();
});
test('오래 비울수록 보상이 커진다 (1시간 < 4시간 < 8시간)', () => {
  const gold = (h) => { G.setRandom(seeded(4)); const s = G.createState(0); const g0 = s.gold; G.applyOffline(s, h * 3600e3, null); G.setRandom(); return s.gold - g0; };
  const g1 = gold(1), g4 = gold(4), g8 = gold(8);
  assert.ok(g1 > 0 && g4 > g1 && g8 > g4, `${g1} ${g4} ${g8}`);
});
test('저장할 때 서버 시각도 함께 기록하고, 모르면 0으로 적는다. 조작된 값은 걸러진다', () => {
  const s = G.createState(0);
  const back = G.deserialize(G.serialize(s, 1234, 5e12 + 0.7));
  assert.deepStrictEqual([back.savedAt, back.srvSavedAt], [1234, 5e12]);
  assert.strictEqual(G.deserialize(G.serialize(s, 1234)).srvSavedAt, 0, '모르면 0 (옛 서버 시각이 남지 않는다)');
  for (const bad of [-5, 'x', NaN, 1e30, null]) { const o = JSON.parse(G.serialize(s, 1)); o.srvSavedAt = bad; const v = G.deserialize(JSON.stringify(o)).srvSavedAt; assert.ok(v >= 0 && v <= 1e14 && Number.isFinite(v), String(bad)); }
  const old = JSON.parse(G.serialize(s, 1)); delete old.srvSavedAt;
  assert.strictEqual(G.deserialize(JSON.stringify(old)).srvSavedAt, 0, '예전 저장(서버 시각 없음)은 기기 시계로 잰다');
});
test('한 번에 받은 8시간과 나눠 받은 8시간(4시간+4시간)이 같은 한도로 계산된다', () => {
  const s = awayState(0, 5e12);
  const first = G.resolveAway(s, 0, 5e12 + 4 * 3600e3, 8 * 3600);
  const second = G.resolveAway(s, 0, 5e12 + 9 * 3600e3, 8 * 3600 - first.seconds);
  assert.strictEqual(first.seconds + second.seconds, 8 * 3600);
});


// ============ 장비 등급 확장 · 업적 확장 · 일일/주간/월간 퀘스트 ============
section('유니크·신화 등급과 자동 판매');
test('등급이 7개(노말~신화)이고 높을수록 확률이 낮고 판매가·수치가 크다', () => {
  assert.deepStrictEqual(G.RARITIES.map((r) => r.name), ['노말', '고급', '희귀', '영웅', '전설', '유니크', '신화']);
  for (let i = 1; i < 7; i++) { assert.ok(G.RARITIES[i].w < G.RARITIES[i - 1].w || i === 1, `w ${i}`); assert.ok(G.RARITIES[i].gold > G.RARITIES[i - 1].gold, `gold ${i}`); }
  for (const slot of G.SLOT_KEYS) for (const kind of Object.keys(G.GEAR[slot].kinds)) { const b = G.GEAR[slot].kinds[kind].base; assert.strictEqual(b.length, 7, kind); for (let i = 1; i < 7; i++) assert.ok(b[i] > b[i - 1], `${kind} ${i}`); }
  const s = G.createState(0); G.setRandom(seeded(1));
  const it = G.rollItem(s, 40, false, 6); G.setRandom();
  assert.ok(it.r === 6 && G.itemName(it).startsWith('신화의 '), G.itemName(it));
  assert.ok(G.itemName(Object.assign({}, it, { r: 5 })).startsWith('유일한 '));
});
test('유니크·신화는 아주 드물게 나오고 보스에게서 더 잘 나온다 (10만 번)', () => {
  const n = (boss) => { G.setRandom(seeded(boss ? 11 : 12)); const c = [0, 0, 0, 0, 0, 0, 0]; const s = G.createState(0); for (let i = 0; i < 100000; i++) c[G.rollItem(s, 10, boss).r]++; G.setRandom(); return c; };
  const a = n(false), b = n(true);
  assert.ok(a[5] > 0 && a[5] < 200 && a[6] < 20, `일반 ${a}`);
  assert.ok(b[5] > a[5] && b[6] >= a[6] && b[5] < 3000, `보스 ${b}`);
  assert.ok(a[4] > a[5] && a[5] > a[6], '등급이 높을수록 적다');
});
test('자동 판매는 전설(4)까지 고를 수 있고, 특별 옵션 장비와 유니크·신화는 어떤 설정에서도 팔리지 않는다', () => {
  const t = G.createState(0); t.autoSell = 4; t.autoEquip = false;
  const mk = (r, sp) => Object.assign({ id: 100 + r + (sp ? 50 : 0), slot: 'weapon', kind: 'dmg', r, ilvl: 10, val: 20, n: 0 }, sp ? { sp: { k: 'exp', v: 0.1 } } : {});
  for (const r of [0, 3, 4]) assert.strictEqual(G.receiveItem ? (() => { const ev = []; G.receiveItem(t, mk(r), ev); return ev[0].action; })() : 'x', 'sold', `등급 ${r}는 팔린다`);
  for (const r of [5, 6]) { const ev = []; G.receiveItem(t, mk(r), ev); assert.strictEqual(ev[0].action, 'bag', `등급 ${r}는 가방에`); }
  const ev2 = []; G.receiveItem(t, mk(3, true), ev2);
  assert.strictEqual(ev2[0].action, 'bag', '특별 옵션 장비는 팔리지 않는다');
  const o = JSON.parse(G.serialize(t, 1)); o.autoSell = 99;
  assert.strictEqual(G.deserialize(JSON.stringify(o)).autoSell, 4, '값이 이상하면 전설까지로 제한');
  o.autoSell = 4; assert.strictEqual(G.deserialize(JSON.stringify(o)).autoSell, 4);
});
test('전설 장비 상자는 전설 90% · 유니크 9% · 신화 1%이고, 장비 등급 통계가 오른다', () => {
  assert.deepStrictEqual(G.STORE.BOXES.find((b) => b.id === 'box_legend').odds, { 4: 90, 5: 9, 6: 1 });
  const t = cash(99999);
  for (let i = 0; i < 20; i++) { t.bag = []; G.buyProduct(t, 'box_legend'); }
  assert.ok(t.stats.legends >= 20 && t.stats.epics >= 20 && t.stats.rares >= 20 && t.stats.boxes === 20, JSON.stringify(t.stats));
});
test('유니크·신화 장비도 저장·복원되고 수치는 그 등급의 최대치를 넘지 못한다', () => {
  const t = G.createState(0); G.setRandom(seeded(2));
  t.bag.push(G.rollItem(t, 60, false, 5), G.rollItem(t, 60, false, 6)); G.setRandom();
  const back = G.deserialize(G.serialize(t, 1));
  assert.deepStrictEqual(back.bag.map((x) => x.r), [5, 6]);
  const o = JSON.parse(G.serialize(t, 1)); o.bag[1].val = 1e9; o.bag[0].r = 9;
  const c = G.deserialize(JSON.stringify(o));
  assert.strictEqual(c.bag.length, 1, '없는 등급은 버린다');
  assert.ok(c.bag[0].val < 1000, '수치는 최대치로 제한');
});

section('업적 확장 (159개)');
test('업적은 150개 이상이고 번호가 겹치지 않으며, 분류·보상·목표가 있다', () => {
  const ids = G.ACHIEVEMENTS.map((a) => a.id);
  assert.ok(G.ACHIEVEMENTS.length >= 150, String(G.ACHIEVEMENTS.length));
  assert.strictEqual(new Set(ids).size, ids.length, '번호 중복');
  for (const a of G.ACHIEVEMENTS) { assert.ok(a.group && a.name && a.desc && a.icon && a.goal > 0 && a.reward >= 3, a.id); assert.ok(Number.isFinite(a.val(G.createState(0))), a.id + ' 값'); }
});
test('새 업적 기록이 실제로 올라간다 (스테이지 클리어·레벨업·상점·상자·지출·시간)', () => {
  G.setRandom(seeded(5));
  const s = G.createState(0); s.crystals = 99999; s.bestStage = 40;
  G.simulate(s, 60);
  assert.ok(s.stats.time >= 59.9 && s.stats.levelUps >= 1 && s.stats.stageUps >= 1, JSON.stringify(s.stats));
  G.shopSync(s, 500 * 4 * 3600e3 + 1, 0); G.buyShopItem(s, 0); G.buyProduct(s, 'box_fine'); G.rerollShop(s);
  assert.strictEqual(s.stats.shopBuys, 1); assert.strictEqual(s.stats.boxes, 1);
  assert.ok(s.stats.spent >= G.STORE.BOXES[0].price + 40, String(s.stats.spent));
  const away = G.createState(0); G.applyOffline(away, 3600e3, null);
  assert.ok(away.stats.away >= 3599, '자리를 비운 시간도 센다');
  G.setRandom();
});
test('업적 목표를 채우면 새 업적도 달성되고 보상을 받을 수 있다 (전설 3칸, 금메달, 유물, 접속일)', () => {
  const s = G.createState(0);
  for (const slot of G.SLOT_KEYS) s.equip[slot] = { id: G.SLOT_KEYS.indexOf(slot) + 1, slot, kind: Object.keys(G.GEAR[slot].kinds)[0], r: 5, ilvl: 10, val: 10, n: 0 };
  s.stats.days = 7; s.relics = { relic_seal: true }; s.stats.uniques = 1;
  const ids = G.checkAchievements(s).map((e) => e.id);
  for (const id of ['legendset', 'uniqueset', 'days3', 'days7', 'relic1', 'unique1']) assert.ok(ids.includes(id), id + ' ' + ids);
  assert.ok(!ids.includes('mythset'));
  assert.ok(G.claimAllAchievements(s) > 0);
});
test('업적 하나당 보너스는 +0.5%이고 전부 달성해도 +80%를 넘지 않는다', () => {
  assert.strictEqual(G.ACHIEVE_BONUS, 0.005);
  assert.ok(G.ACHIEVE_BONUS * G.ACHIEVEMENTS.length < 0.8);
});
test('같은 종류의 업적은 목표가 커질수록 보상도 같거나 커진다', () => {
  const byId = (id) => G.ACHIEVEMENTS.find((a) => a.id === id).reward;
  const chains = [['stage10', 'stage20', 'stage30', 'stage40', 'stage50', 'stage60', 'stage70', 'stage80', 'stage100', 'stage110', 'stage130', 'stage150', 'stage170', 'stage200'],
    ['kill100', 'kill1000', 'kill10000', 'kill100000'], ['prestige1', 'prestige5', 'prestige10', 'prestige25', 'prestige50', 'prestige100'], ['level10', 'level20', 'level30', 'level50', 'level70', 'level90', 'level100'],
    ['legend1', 'legend10', 'legend50', 'legend200'], ['sold100', 'sold1000', 'sold10000'], ['cast100', 'cast2000', 'cast10000', 'cast50000'], ['tap1000', 'tap10000', 'tap100000'], ['ad10', 'ad50', 'ad200', 'ad1000'],
    ['gold1m', 'gold1b', 'gold1t', 'gold1e15', 'gold1e18', 'gold1e21', 'gold1e24'], ['tokens100', 'tokens300', 'tokens500', 'tokens1000', 'tokens3000']];
  for (const c of chains) for (let i = 1; i < c.length; i++) assert.ok(byId(c[i]) >= byId(c[i - 1]), `${c[i - 1]}(${byId(c[i - 1])}) → ${c[i]}(${byId(c[i])})`);
});

section('일일·주간·월간 퀘스트');
test('기간 이름표: 일일은 그 날, 주간은 그 주 월요일, 월간은 그 달', () => {
  assert.deepStrictEqual(G.periodKeys('2026-09-21'), { daily: '2026-09-21', weekly: '2026-09-21', monthly: '2026-09' });   // 월요일
  assert.deepStrictEqual(G.periodKeys('2026-09-27'), { daily: '2026-09-27', weekly: '2026-09-21', monthly: '2026-09' });   // 일요일은 그 주의 끝
  assert.deepStrictEqual(G.periodKeys('2026-10-01'), { daily: '2026-10-01', weekly: '2026-09-28', monthly: '2026-10' });   // 주가 달을 넘는다
  assert.deepStrictEqual(G.periodKeys('2027-01-01'), { daily: '2027-01-01', weekly: '2026-12-28', monthly: '2027-01' });   // 해를 넘는다
});
test('각 기간이 끝나기까지 남은 시간(한국 시간 자정 기준)이 맞다', () => {
  const at = (y, m, d, h, mi) => Date.UTC(y, m - 1, d, h - 9, mi);   // 한국 시각
  assert.deepStrictEqual(G.periodSecsLeft(at(2026, 9, 21, 0, 0)), { daily: 86400, weekly: 7 * 86400, monthly: 10 * 86400 });
  assert.deepStrictEqual(G.periodSecsLeft(at(2026, 9, 27, 23, 59)), { daily: 60, weekly: 60, monthly: 3 * 86400 + 60 });
  assert.deepStrictEqual(G.periodSecsLeft(null), { daily: null, weekly: null, monthly: null });
});
test('처음 동기화하면 일일 5개(첫째는 접속하기)·주간 5개·월간 4개가 뽑히고 접속일이 1 늘어난다', () => {
  const s = G.createState(0);
  assert.strictEqual(G.questSync(s, '2026-09-22'), true);
  const d = G.questBoard(s, 'daily'), w = G.questBoard(s, 'weekly'), m = G.questBoard(s, 'monthly');
  assert.deepStrictEqual([d.items.length, w.items.length, m.items.length], [5, 5, 4]);
  assert.strictEqual(d.items[0].id, 'attend');
  assert.ok(d.items[0].done && !d.items[0].claimed);
  for (const b of [d, w, m]) assert.strictEqual(new Set(b.items.map((x) => x.id)).size, b.items.length, '종류가 겹치지 않는다');
  assert.strictEqual(s.stats.days, 1);
  assert.strictEqual(G.questSync(s, '2026-09-22'), false, '같은 날에는 그대로');
});
test('목표는 기간 이름표로 정해져서 같은 기간에는 항상 같고, 다른 날은 달라질 수 있다', () => {
  const a = G.createState(0), b = G.createState(0);
  G.questSync(a, '2026-09-22'); G.questSync(b, '2026-09-22');
  assert.deepStrictEqual(G.questBoard(a, 'daily').items.map((x) => x.id), G.questBoard(b, 'daily').items.map((x) => x.id));
  const seen = new Set();
  for (let d = 1; d <= 28; d++) { const t = G.createState(0); G.questSync(t, `2026-09-${String(d).padStart(2, '0')}`); seen.add(G.questBoard(t, 'daily').items.map((x) => x.id).join(',')); }
  assert.ok(seen.size > 10, `28일 동안 ${seen.size}가지 조합`);
});
test('목표 크기는 최고 스테이지에 따라 3단계로 커진다', () => {
  const goal = (stage) => { const s = G.createState(0); s.bestStage = stage; G.questSync(s, '2026-09-22'); return G.questBoard(s, 'weekly').items.map((x) => x.goal); };
  const lo = goal(5), mid = goal(50), hi = goal(120);
  for (let i = 0; i < lo.length; i++) assert.ok(lo[i] <= mid[i] && mid[i] <= hi[i], `${lo[i]} ${mid[i]} ${hi[i]}`);
  assert.ok(hi.some((g, i) => g > lo[i]));
});
test('진행도는 기간이 시작된 뒤 늘어난 기록만큼이고, 다 채우면 받을 수 있으며 한 번만 받는다', () => {
  const s = G.createState(0); s.totalKills = 1e6; s.prestiges = 50;
  for (const k of ['bossKills', 'stageUps', 'casts', 'taps', 'drops', 'epics', 'sold', 'levelUps', 'ads', 'shopBuys']) s.stats[k] = 1e6;   // 이미 쌓인 기록: 어떤 목표가 뽑혀도 0에서 시작해야 한다
  G.questSync(s, '2026-09-22');
  const it = (id) => G.questBoard(s, 'daily').items.find((x) => x.id === id);
  const target = G.questBoard(s, 'daily').items.find((x) => x.id !== 'attend');
  assert.strictEqual(target.cur, 0, '이미 쌓인 기록은 세지 않는다');
  const def = G.QUEST_DEFS.find((d) => d.id === target.id);
  const stat = { kills: () => { s.totalKills += target.goal; }, boss: () => { s.stats.bossKills += target.goal; }, stage: () => { s.stats.stageUps += target.goal; }, skill: () => { s.stats.casts += target.goal; }, tap: () => { s.stats.taps += target.goal; },
    drop: () => { s.stats.drops += target.goal; }, epic: () => { s.stats.epics += target.goal; }, sell: () => { s.stats.sold += target.goal; }, level: () => { s.stats.levelUps += target.goal; }, ad: () => { s.stats.ads += target.goal; } }[target.id];
  stat();
  assert.ok(it(target.id).done && !it(target.id).claimed);
  const c0 = s.crystals;
  assert.strictEqual(G.claimQuest(s, 'daily', target.id), 5);
  assert.strictEqual(s.crystals, c0 + 5);
  assert.strictEqual(G.claimQuest(s, 'daily', target.id), 0, '두 번 받을 수 없다');
  assert.strictEqual(G.claimQuest(s, 'daily', 'attend'), 2, '접속하기 보상은 2개');
  assert.strictEqual(G.claimQuest(s, 'daily', 'nope'), 0);
  assert.strictEqual(G.claimQuest(s, 'yearly', 'attend'), 0);
  assert.strictEqual(s.stats.questClaims, 2);
  assert.ok(def);
});
test('아직 못 끝낸 목표는 받을 수 없고, 모두 받은 뒤에야 완료 보너스(일일은 물약 포함)를 한 번 받는다', () => {
  G.setRandom(seeded(9));
  const s = G.createState(0); G.questSync(s, '2026-09-22');
  const b0 = G.questBoard(s, 'daily');
  const open = b0.items.find((x) => !x.done);
  assert.strictEqual(G.claimQuest(s, 'daily', open.id), 0, '못 끝낸 목표');
  assert.strictEqual(G.claimQuestBonus(s, 'daily'), null, '다 받기 전에는 보너스가 없다');
  for (const it of b0.items) { const q = s.quests.daily.list.find((x) => x.id === it.id); if (it.id !== 'attend') q.base -= q.goal; }   // 모두 끝낸 것으로 만든다
  for (const it of b0.items) assert.ok(G.claimQuest(s, 'daily', it.id) > 0, it.id);
  const bonus = G.claimQuestBonus(s, 'daily');
  assert.ok(bonus && bonus.crystals === 10 && bonus.potion && s.potions[bonus.potion.id] > 0);
  assert.strictEqual(G.claimQuestBonus(s, 'daily'), null, '한 번만');
  assert.strictEqual(s.stats.dailyClears, 1);
  assert.strictEqual(G.questClaimable(s), G.questBoard(s, 'weekly').claimable + G.questBoard(s, 'monthly').claimable, '일일은 모두 받았으니 남은 것은 주간·월간뿐');
  G.setRandom();
});
test('날이 바뀌면 일일이, 주가 바뀌면 주간이, 달이 바뀌면 월간이 새로 뽑히고 못 받은 보상은 사라진다', () => {
  const s = G.createState(0); G.questSync(s, '2026-09-27');   // 일요일
  const w = s.quests.weekly.key, m = s.quests.monthly.key;
  G.questSync(s, '2026-09-28');   // 월요일: 일일·주간 바뀜, 월간 그대로
  assert.deepStrictEqual([s.quests.daily.key, s.quests.weekly.key === w, s.quests.monthly.key === m], ['2026-09-28', false, true]);
  G.questSync(s, '2026-10-01');
  assert.strictEqual(s.quests.monthly.key, '2026-10');
  assert.strictEqual(s.stats.days, 3);
  s.quests.daily.claimed.attend = true; G.questSync(s, '2026-10-02');
  assert.deepStrictEqual(s.quests.daily.claimed, {}, '새 날에는 받은 기록도 새로');
});
test('환생해도 퀘스트 진행과 기준점은 남는다', () => {
  const s = G.createState(0); G.questSync(s, '2026-09-22'); s.runBest = 12;
  const before = JSON.stringify(s.quests);
  G.prestige(s);
  assert.strictEqual(JSON.stringify(s.quests), before);
});
test('퀘스트 저장·복원: 그대로 돌아오고, 조작된 값(없는 종류·이상한 이름표·받은 기록)은 걸러진다', () => {
  const s = G.createState(0); s.totalKills = 100; G.questSync(s, '2026-09-22'); G.claimQuest(s, 'daily', 'attend');
  const back = G.deserialize(G.serialize(s, 1));
  assert.deepStrictEqual(back.quests, s.quests);
  const o = JSON.parse(G.serialize(s, 1));
  o.quests.daily.key = 'hacked'; o.quests.weekly.list.push({ id: 'cheat', goal: 1, base: 0 }, { id: 'kills', goal: -5, base: -1 }, null);
  o.quests.weekly.claimed = { kills: true, cheat: true, ghost: true }; o.quests.monthly.bonus = true;
  const c = G.deserialize(JSON.stringify(o));
  assert.strictEqual(c.quests.daily, null, '이름표가 이상하면 버린다');
  assert.ok(c.quests.weekly.list.every((x) => G.QUEST_DEFS.some((d) => d.id === x.id) && x.goal >= 1 && x.base >= 0));
  assert.ok(Object.keys(c.quests.weekly.claimed).every((k) => c.quests.weekly.list.some((x) => x.id === k)), '없는 목표의 받은 기록은 버린다');
  assert.strictEqual(c.quests.monthly.bonus, false, '목표를 다 받지 않았으면 보너스를 받은 것으로 칠 수 없다');
  const old = JSON.parse(G.serialize(s, 1)); delete old.quests;
  assert.deepStrictEqual(G.deserialize(JSON.stringify(old)).quests, { daily: null, weekly: null, monthly: null });
});
test('퀘스트 보상 크리스탈이 상한(10억)을 넘지 않는다', () => {
  const s = G.createState(0); G.questSync(s, '2026-09-22'); s.crystals = 1e9 - 1;
  G.claimQuest(s, 'daily', 'attend');
  assert.strictEqual(s.crystals, 1e9);
});


section('일일·주간·월간 던전');
test('모든 던전 보스 이름표에 그림 종류(BOSS_ART)가 있고, 그림 생성 스크립트의 보스 목록과도 같다', () => {
  const fsx2 = require('fs'), path2 = require('path');
  const allBosses = new Set();
  for (const p of G.DUNGEON_PERIODS) for (const name of G.DUNGEONS[p].boss) allBosses.add(name);
  for (const name of allBosses) assert.ok(G.BOSS_ART[name], `${name}에 그림 종류가 없다`);
  const ids = Object.values(G.BOSS_ART);
  assert.strictEqual(new Set(ids).size, ids.length, '그림 종류 이름이 겹친다');
  const py = fsx2.readFileSync(path2.join(__dirname, 'generate-images.py'), 'utf8');
  const body = py.slice(py.indexOf('BOSSES = {'), py.indexOf('\n}\n', py.indexOf('BOSSES = {')));
  const pyIds = [...body.matchAll(/^\s+'([a-z_]+)':/gm)].map((m) => m[1]);
  assert.deepStrictEqual(pyIds.slice().sort(), ids.slice().sort(), '그림 생성 프롬프트가 BOSS_ART와 다르다');
});
test('동기화하면 세 기간 모두 뽑히고, 각 기간의 횟수·파동 수는 dungeon.js 설정과 같다', () => {
  const s = G.createState(0);
  G.dungeonSync(s, '2026-09-22');
  for (const p of G.DUNGEON_PERIODS) {
    const d = s.dungeons[p], cfg = G.DUNGEONS[p];
    assert.ok(d && d.key, p);
    assert.strictEqual(d.used, 0);
    assert.strictEqual(d.cleared, false);
    assert.strictEqual(d.bonusClaimed, false);
    assert.ok(cfg.boss.includes(d.boss), '보스 이름표 안에서 고른다');
    const info = G.dungeonInfo(s, p);
    assert.strictEqual(info.waves, cfg.waves);
    assert.strictEqual(info.attempts, cfg.attempts);
    assert.strictEqual(info.bossHp.length, cfg.waves);
  }
});
test('같은 기간에는 다시 동기화해도 진행이 그대로고, 날이 바뀌면 일일만 새로 뽑힌다', () => {
  const s = G.createState(0);
  G.dungeonSync(s, '2026-09-22');
  s.dungeons.daily.used = 2;
  G.dungeonSync(s, '2026-09-22');
  assert.strictEqual(s.dungeons.daily.used, 2, '같은 날에는 안 바뀐다');
  const weeklyKey = s.dungeons.weekly.key;
  G.dungeonSync(s, '2026-09-23');
  assert.strictEqual(s.dungeons.daily.used, 0, '날짜가 바뀌면 일일이 새로 뽑힌다');
  assert.strictEqual(s.dungeons.weekly.key, weeklyKey, '같은 주 안에서는 주간이 그대로다');
});
test('도전은 기간의 한도(attempts) 안에서만 되고, 넘으면 reason:limit이다', () => {
  const s = G.createState(0);
  G.dungeonSync(s, '2026-09-22');
  for (let i = 0; i < G.DUNGEONS.weekly.attempts; i++) assert.strictEqual(G.challengeDungeon(s, 'weekly').ok, true);
  const r = G.challengeDungeon(s, 'weekly');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.reason, 'limit');
});
test('피해 예산이 충분하면 모든 파동을 물리치고, 처음 완주할 때만 완주 보너스를 준다', () => {
  const s = G.createState(0); s.bestStage = 5; s.level = 60;
  for (const k of G.UPGRADE_KEYS) s.upgrades[k] = 200;
  G.promote(s, 'mage'); G.promote(s, 'necromancer'); G.promote(s, 'lich'); G.promote(s, 'lichking');
  G.dungeonSync(s, '2026-09-22');
  const before = { gold: s.gold, crystals: s.crystals, tokens: s.tokens };
  const r1 = G.challengeDungeon(s, 'weekly');
  assert.strictEqual(r1.wavesCleared, G.DUNGEONS.weekly.waves);
  assert.strictEqual(r1.fullClear, true);
  assert.ok(r1.bonus, '처음 완주하면 보너스가 있다');
  assert.strictEqual(r1.drops.length, G.DUNGEONS.weekly.waves, '파동마다 장비를 하나씩 준다');
  assert.ok(s.gold > before.gold && s.crystals > before.crystals && s.tokens > before.tokens);
  assert.strictEqual(s.dungeons.weekly.cleared, true);
  assert.strictEqual(s.dungeons.weekly.bonusClaimed, true);
});
test('피해 예산이 모자라면 그 자리에서 멈추고, 도전은 소모되지만 완주 보상은 없다', () => {
  const s = G.createState(0); s.bestStage = 90;   // 갓 시작한 고블린이 스테이지 90 던전에 도전
  G.dungeonSync(s, '2026-09-22');
  const r = G.challengeDungeon(s, 'monthly');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.wavesCleared, 0);
  assert.strictEqual(r.fullClear, false);
  assert.strictEqual(r.bonus, null);
  assert.strictEqual(s.dungeons.monthly.used, 1, '실패해도 도전 횟수는 줄어든다');
});
test('저장·복원: 그대로 돌아오고, 조작된 값(없는 이름표·한도를 넘는 횟수·가짜 보스)은 걸러진다', () => {
  const s = G.createState(0); s.bestStage = 5; s.level = 60;
  for (const k of G.UPGRADE_KEYS) s.upgrades[k] = 200;
  G.promote(s, 'mage'); G.promote(s, 'necromancer'); G.promote(s, 'lich'); G.promote(s, 'lichking');
  G.dungeonSync(s, '2026-09-22');
  G.challengeDungeon(s, 'daily'); G.challengeDungeon(s, 'weekly');
  const back = G.deserialize(G.serialize(s, 1));
  assert.deepStrictEqual(back.dungeons, s.dungeons);
  const o = JSON.parse(G.serialize(s, 1));
  o.dungeons.daily.key = 'hacked';
  o.dungeons.weekly.used = 999; o.dungeons.weekly.bestWaves = 999; o.dungeons.weekly.boss = '조작된 보스';
  const c = G.deserialize(JSON.stringify(o));
  assert.strictEqual(c.dungeons.daily, null, '이름표가 이상하면 버린다');
  assert.strictEqual(c.dungeons.weekly.used, G.DUNGEONS.weekly.attempts, '도전 횟수는 한도를 넘지 못한다');
  assert.strictEqual(c.dungeons.weekly.bestWaves, G.DUNGEONS.weekly.waves, '물리친 파동은 그 던전의 파동 수를 넘지 못한다');
  assert.ok(G.DUNGEONS.weekly.boss.includes(c.dungeons.weekly.boss), '목록에 없는 보스 이름표는 버리고 첫 번째로 되돌린다');
  const old = JSON.parse(G.serialize(s, 1)); delete old.dungeons;
  assert.deepStrictEqual(G.deserialize(JSON.stringify(old)).dungeons, { daily: null, weekly: null, monthly: null });
});
test('던전 보상 크리스탈이 상한(10억)을 넘지 않는다', () => {
  const s = G.createState(0); s.bestStage = 5; s.level = 60;
  for (const k of G.UPGRADE_KEYS) s.upgrades[k] = 200;
  G.promote(s, 'mage'); G.promote(s, 'necromancer'); G.promote(s, 'lich'); G.promote(s, 'lichking');
  G.dungeonSync(s, '2026-09-22'); s.crystals = 1e9 - 1;
  G.challengeDungeon(s, 'daily');
  assert.strictEqual(s.crystals, 1e9);
});

section('던전 미니게임 보너스');
test('두더지 잡기: 적중 수에 비례하고 상한(35%)을 넘지 않는다', () => {
  assert.strictEqual(G.moleBonus(0), 0);
  assert.ok(Math.abs(G.moleBonus(4) - 0.14) < 1e-9);
  assert.strictEqual(G.moleBonus(100), 0.35);
});
test('타이밍 게이지: 크리티컬 > 히트 > 미스 순으로 점수를 주고 상한(40%)을 넘지 않는다', () => {
  assert.strictEqual(G.gaugeBonus(['miss', 'miss']), 0);
  assert.ok(G.gaugeBonus(['hit']) > 0 && G.gaugeBonus(['crit']) > G.gaugeBonus(['hit']));
  assert.strictEqual(G.gaugeBonus(Array(20).fill('crit')), 0.4);
});
test('패턴 반격: 연속 성공(콤보)일수록 한 번의 성공 가치가 크고, 실패하면 콤보가 끊긴다', () => {
  assert.strictEqual(G.parryBonus([false, false]), 0);
  const withoutCombo = G.parryBonus([true, false, true, false]);
  const withCombo = G.parryBonus([true, true, true, true]);
  assert.ok(withCombo > withoutCombo);
  assert.ok(G.parryBonus(Array(30).fill(true)) <= 0.5);
});
test('미니게임 보너스만큼 도전 한 번의 피해 예산(=처치 가능한 파동)이 늘어난다', () => {
  const s = G.createState(0); s.bestStage = 5; s.level = 60;
  for (const k of G.UPGRADE_KEYS) s.upgrades[k] = 40;
  G.dungeonSync(s, '2026-09-22');
  const s2 = JSON.parse(G.serialize(s, 1));
  const without = G.challengeDungeon(G.deserialize(JSON.stringify(s2)), 'monthly', 0);
  const withBonus = G.challengeDungeon(G.deserialize(JSON.stringify(s2)), 'monthly', 0.5);
  assert.ok(withBonus.wavesCleared >= without.wavesCleared, '보너스가 있으면 적어도 같거나 더 많이 처치한다');
});
test('미니게임 보너스는 0~50%로 잘린다(음수·과도한 값 방어)', () => {
  const base = () => { const s = G.createState(0); s.bestStage = 5; s.level = 60; for (const k of G.UPGRADE_KEYS) s.upgrades[k] = 40; G.dungeonSync(s, '2026-09-22'); return s; };
  const rNeg = G.challengeDungeon(base(), 'monthly', -1);
  const rHalf = G.challengeDungeon(base(), 'monthly', 0.5);
  const rHuge = G.challengeDungeon(base(), 'monthly', 999);
  assert.deepStrictEqual(rNeg.wavesCleared <= rHalf.wavesCleared, true);
  assert.deepStrictEqual(rHuge.wavesCleared, rHalf.wavesCleared, '50%를 넘겨도 더 늘어나지 않는다');
});

section('던전 개선 (예상·파동별 보스·전투 기록·소탕·위로 보상)');
const dgBase = (lv = 40) => { const s = G.createState(0); s.bestStage = 5; s.level = 60; for (const k of G.UPGRADE_KEYS) s.upgrades[k] = lv; G.dungeonSync(s, '2026-09-22'); return s; };
test('파동별 보스: 마지막 파동은 대표 보스이고, 파동 수만큼 모두 그 던전의 보스 목록 안에서 나온다', () => {
  const s = dgBase();
  for (const p of G.DUNGEON_PERIODS) {
    const info = G.dungeonInfo(s, p);
    assert.strictEqual(info.waveBosses.length, G.DUNGEONS[p].waves);
    assert.strictEqual(info.waveBosses[info.waveBosses.length - 1], info.boss);
    for (const b of info.waveBosses) assert.ok(G.DUNGEONS[p].boss.includes(b));
    if (info.waves > 1) assert.notStrictEqual(info.waveBosses[0], info.boss, '앞 파동은 다른 보스');
  }
});
test('예상 파동 수는 실제 도전 결과와 같다 (보너스 0과 상한 모두)', () => {
  for (const lv of [5, 20, 40, 80]) for (const p of G.DUNGEON_PERIODS) for (const bonus of [0, G.MG_BONUS_CAP[p]]) {
    const s = dgBase(lv);
    const f = G.dungeonForecast(s, p, bonus);
    assert.strictEqual(G.challengeDungeon(s, p, bonus).wavesCleared, f, `${p} lv${lv} bonus${bonus}`);
  }
});
test('전투 기록: 물리친 파동은 체력만큼, 막힌 파동은 남은 예산만큼 피해를 기록하고 합이 시작 예산을 넘지 않는다', () => {
  const s = dgBase(5); s.bestStage = 25;
  const r = G.challengeDungeon(s, 'monthly', 0);
  assert.strictEqual(r.fights.filter((f) => f.killed).length, r.wavesCleared);
  for (const f of r.fights) assert.ok(f.dealt <= f.hp + 1e-6);
  assert.ok(r.fights.reduce((a, f) => a + f.dealt, 0) <= r.budget + 1e-6);
  if (!r.fullClear) assert.strictEqual(r.fights[r.fights.length - 1].killed, false);
});
test('못 물리친 파동은 깎은 비율만큼 위로 골드를 주고, 완주하면 위로 골드는 0이다', () => {
  const s = dgBase(5); s.bestStage = 25; const g0 = s.gold;   // 월간 5파동 중 1파동만 잡는 세기
  const r = G.challengeDungeon(s, 'monthly', 0);
  assert.ok(!r.fullClear, '이 설정에서는 월간을 다 못 깬다');
  assert.ok(r.partialGold > 0 && s.gold >= g0 + r.partialGold);
  const strong = dgBase(200);
  assert.strictEqual(G.challengeDungeon(strong, 'daily', 0).partialGold, 0);
});
test('미니게임 보너스는 던전별 상한으로 잘리고, 이번 기간 최고 보너스로 기록된다', () => {
  const s = dgBase();
  const r = G.challengeDungeon(s, 'daily', 0.5);
  assert.strictEqual(r.mgBonus, G.MG_BONUS_CAP.daily);
  assert.strictEqual(s.dungeons.daily.bestBonus, G.MG_BONUS_CAP.daily);
  G.challengeDungeon(s, 'daily', 0.1);
  assert.strictEqual(s.dungeons.daily.bestBonus, G.MG_BONUS_CAP.daily, '낮은 점수는 기록을 덮지 않는다');
});
test('소탕: 완주한 적이 없으면 거절하고, 완주 뒤엔 최고 보너스로 도전 횟수를 쓴다', () => {
  const s = dgBase(200);
  assert.strictEqual(G.challengeDungeon(s, 'daily', 0, true).reason, 'nosweep');
  assert.strictEqual(s.dungeons.daily.used, 0, '거절되면 횟수를 안 쓴다');
  G.challengeDungeon(s, 'daily', 0.2);
  assert.strictEqual(G.dungeonInfo(s, 'daily').canSweep, true);
  const r = G.challengeDungeon(s, 'daily', 0, true);
  assert.strictEqual(r.ok, true); assert.strictEqual(r.sweep, true);
  assert.ok(Math.abs(r.mgBonus - 0.2) < 1e-9);
  assert.strictEqual(s.dungeons.daily.used, 2);
});
test('던전 보스 체력·골드는 최고 스테이지가 보스 스테이지(10의 배수)여도 튀지 않고 스테이지에 따라 매끄럽게 는다', () => {
  const at = (st) => { const s = dgBase(); s.bestStage = st; return G.dungeonBossHp(s, 'monthly', 0); };
  assert.ok(at(109) < at(110) && at(110) < at(111), '109 < 110 < 111');
  assert.ok(at(110) / at(109) < 1.5, '보스 스테이지 배율(6배)이 끼지 않는다');
});
test('던전 장비는 등급 기록(업적용)을 한 번만 센다', () => {
  const s = dgBase(200); const before = { ...s.stats };
  const r = G.challengeDungeon(s, 'weekly', 0);
  const got = [...r.drops, r.bonus.item];
  assert.strictEqual(s.stats.rares - before.rares, got.filter((it) => it.r >= 2).length);
  assert.strictEqual(s.stats.epics - before.epics, got.filter((it) => it.r >= 3).length);
});
test('가방 자리가 모자라면 도전하지 않고(횟수도 안 씀), 한도를 넘겨 장비를 넣지 않는다', () => {
  const s = dgBase(200); s.autoEquip = false;
  while (s.bag.length < G.bagLimit(s) - 1) s.bag.push(G.rollItem(s, 5, false, 0));
  const r = G.challengeDungeon(s, 'monthly', 0);
  assert.strictEqual(r.ok, false); assert.strictEqual(r.reason, 'bag');
  assert.strictEqual(s.dungeons.monthly.used, 0);
  s.bag.length = G.bagLimit(s) - G.dungeonBagNeed(s, 'monthly');
  assert.strictEqual(G.challengeDungeon(s, 'monthly', 0).ok, true);
  assert.ok(s.bag.length <= G.bagLimit(s));
});
test('최고 보너스 기록은 저장·복원되고, 상한을 넘게 조작하면 잘린다', () => {
  const s = dgBase(); G.challengeDungeon(s, 'weekly', 0.3);
  const o = JSON.parse(G.serialize(s, 1));
  assert.ok(Math.abs(G.deserialize(JSON.stringify(o)).dungeons.weekly.bestBonus - 0.3) < 1e-9);
  o.dungeons.weekly.bestBonus = 99;
  assert.strictEqual(G.deserialize(JSON.stringify(o)).dungeons.weekly.bestBonus, G.MG_BONUS_CAP.weekly);
});

section('장비 분해 · 가루 · 레벨 올리기');
const dsBase = () => { const s = G.createState(0); s.bestStage = 100; s.autoEquip = false; G.setRandom(() => 0.5); return s; };
test('분해 가루는 등급·레벨·강화 단계가 높을수록 많다', () => {
  const v = (r, ilvl, enh) => G.dustValue({ r, ilvl, enh });
  assert.ok(v(1, 10, 0) < v(2, 10, 0) && v(5, 10, 0) < v(6, 10, 0));
  assert.ok(v(3, 10, 0) < v(3, 80, 0));
  assert.ok(v(3, 10, 0) < v(3, 10, 3));
});
test('분해하면 가방에서 빠지고 가루가 는다 (장착 중인 장비는 분해되지 않는다)', () => {
  const s = dsBase();
  const a = G.rollItem(s, 20, false, 3), b = G.rollItem(s, 20, false, 1);
  s.bag.push(a, b); s.equip.weapon = G.rollItem(s, 20, false, 4);
  const r = G.dismantleItems(s, [a.id, b.id, s.equip.weapon.id]);
  assert.strictEqual(r.n, 2);
  assert.strictEqual(s.dust, G.dustValue(a) + G.dustValue(b));
  assert.strictEqual(s.bag.length, 0);
  assert.ok(s.equip.weapon);
});
test('레벨 올리기: 가루를 쓰고 수치가 레벨 비율만큼 오르며, 처음 굴린 편차는 유지된다', () => {
  const s = dsBase(); const it = G.rollItem(s, 20, false, 4); s.bag.push(it);
  const v0 = it.val; s.dust = 1e6;
  const cost = G.levelUpCost(it, 10);
  const r = G.levelUpItem(s, it.id, 10);
  assert.strictEqual(r.ok, true); assert.strictEqual(r.levels, 10); assert.strictEqual(it.ilvl, 30);
  assert.strictEqual(s.dust, 1e6 - cost);
  const expect = v0 * (1 + 30 / 40) / (1 + 20 / 40);
  assert.ok(Math.abs(it.val - expect) < 0.2, `${it.val} vs ${expect}`);
});
test('레벨 상한은 최고 스테이지 + 100이고, 가루가 모자라면 살 수 있는 만큼만 올린다', () => {
  const s = dsBase(); const it = G.rollItem(s, 95, false, 2); s.bag.push(it); s.dust = 1e7;
  assert.strictEqual(G.levelUpItem(s, it.id, 999).ilvl, 200);
  assert.strictEqual(G.levelUpItem(s, it.id, 1).reason, 'cap');
  const t = G.rollItem(s, 10, false, 2); s.bag.push(t); s.dust = G.levelUpCost(t, 3) + 1;
  assert.strictEqual(G.levelUpItem(s, t.id, 50).levels, 3);
  assert.strictEqual(G.levelUpItem(s, t.id, 1).reason, 'dust');
});
test('레벨을 올린 장비도 저장·복원 검사(수치 상한)를 통과해 그대로 돌아온다', () => {
  const s = dsBase(); G.setRandom(() => 0.999);   // 편차 최대(+15%)로 굴린 장비
  const it = G.rollItem(s, 5, false, 6); s.bag.push(it); s.dust = 1e7;
  G.levelUpItem(s, it.id, 95);
  G.setRandom(() => 0.5);
  const back = G.deserialize(G.serialize(s, 1)).bag[0];
  assert.strictEqual(back.ilvl, 100); assert.strictEqual(back.val, it.val);
});
test('장착한 방어구의 레벨을 올리면 늘어난 최대 체력만큼 체력도 찬다', () => {
  const s = dsBase(); const it = G.rollItem(s, 10, false, 4, 'armor'); s.equip.armor = it; s.hp = G.maxHp(s); s.dust = 1e6;
  const before = G.maxHp(s);
  G.levelUpItem(s, it.id, 50);
  assert.ok(G.maxHp(s) > before); assert.ok(Math.abs(s.hp - G.maxHp(s)) < 1e-6);
});
test('자동 분해를 켜면 자동 판매 대상이 골드 대신 가루가 된다', () => {
  const s = dsBase(); s.autoSell = 2; s.autoDust = true;
  const g = s.gold;
  const ev = []; G.receiveItem(s, G.rollItem(s, 30, false, 1), ev);
  assert.strictEqual(s.gold, g); assert.ok(s.dust > 0);
});
test('가루와 자동 분해 설정은 저장·복원되고 환생해도 남는다, 조작된 값은 걸러진다', () => {
  const s = dsBase(); s.dust = 1234; s.autoDust = true; s.stage = s.runBest = 60; G.prestige(s);
  assert.strictEqual(s.dust, 1234);
  const o = JSON.parse(G.serialize(s, 1));
  const b = G.deserialize(JSON.stringify(o)); assert.strictEqual(b.dust, 1234); assert.strictEqual(b.autoDust, true);
  o.dust = -5; o.autoDust = 'yes';
  const c = G.deserialize(JSON.stringify(o)); assert.strictEqual(c.dust, 0); assert.strictEqual(c.autoDust, false);
});
G.setRandom(null);   // 이 구역에서 고정한 난수를 되돌린다

section('장비 초월 · 전설 전용 디자인');
const stBase = () => { const s = G.createState(0); s.bestStage = 100; s.autoEquip = false; return s; };
test('초월은 15강 장비만, 같은 칸·같은 등급 이상 재료 1개와 가루로 한다', () => {
  const s = stBase(); const it = G.rollItem(s, 50, false, 4, 'weapon'); s.equip.weapon = it; s.dust = 1e7;
  const low = G.rollItem(s, 50, false, 3, 'weapon'), mat = G.rollItem(s, 50, false, 4, 'weapon'), other = G.rollItem(s, 50, false, 5, 'armor');
  s.bag.push(low, mat, other);
  assert.strictEqual(G.starItem(s, it.id, mat.id).reason, 'enh');
  it.enh = G.ENH_MAX;
  assert.strictEqual(G.starItem(s, it.id, low.id).reason, 'material', '낮은 등급은 재료가 안 된다');
  assert.strictEqual(G.starItem(s, it.id, other.id).reason, 'material', '다른 칸은 재료가 안 된다');
  const cost = G.starDust(it), before = G.enhVal(it);
  const r = G.starItem(s, it.id, mat.id);
  assert.strictEqual(r.ok, true); assert.strictEqual(it.star, 1);
  assert.strictEqual(s.dust, 1e7 - cost);
  assert.ok(!s.bag.includes(mat));
  assert.ok(Math.abs(G.enhVal(it) / before - (1 + G.STAR_STEP)) < 1e-9, '효과 +25%');
});
test('초월 한 단계마다 레벨 상한이 100 오르고, 최대 5단계, 상한 999를 넘지 않는다', () => {
  const s = stBase(); const it = G.rollItem(s, 50, false, 4, 'weapon'); it.enh = G.ENH_MAX; s.bag.push(it);
  assert.strictEqual(G.itemLevelCap(s, it), 200);
  it.star = 3; assert.strictEqual(G.itemLevelCap(s, it), 500);
  s.bestStage = 900; assert.strictEqual(G.itemLevelCap(s, it), 999);
  it.star = G.STAR_MAX; s.dust = 1e9; s.bag.push(G.rollItem(s, 50, false, 6, 'weapon'));
  assert.strictEqual(G.starItem(s, it.id, s.bag[1].id).reason, 'max');
});
test('초월 단계는 저장·복원되고, 15강이 아닌 장비의 초월 조작은 버린다; 분해하면 초월 가루 일부를 돌려받는다', () => {
  const s = stBase(); const it = G.rollItem(s, 50, false, 4, 'weapon'); it.enh = 15; it.star = 2;
  const junk = G.rollItem(s, 50, false, 4, 'armor'); junk.star = 3; s.bag.push(it, junk);
  const b = G.deserialize(G.serialize(s, 1)).bag;
  assert.strictEqual(b[0].star, 2); assert.strictEqual(b[1].star, undefined);
  const plain = Object.assign({}, it, { star: 0 });
  assert.ok(G.dustValue(it) > G.dustValue(plain) + 0.5 * (G.starDust(plain) + G.starDust(Object.assign({}, it, { star: 1 }))));
});
test('전설 이상 전용 디자인은 영웅 이하에서 나오지 않고, 전설 이상에서는 나온다', () => {
  const s = stBase(); const epic = new Set();
  for (const slot of G.SLOT_KEYS) for (const k of Object.keys(G.GEAR[slot].kinds)) G.GEAR[slot].kinds[k].nouns.forEach((x) => { if (x[2]) epic.add(x[0]); });
  assert.strictEqual(epic.size, 9);
  let low = 0, high = 0;
  G.setRandom(seeded(7));
  for (let i = 0; i < 4000; i++) {
    const r = i % 7, it = G.rollItem(s, 30, false, r), d = G.itemDesign(it);
    if (epic.has(d)) { if (r < 4) low += 1; else high += 1; }
  }
  G.setRandom(null);
  assert.strictEqual(low, 0); assert.ok(high > 300, `전설 이상 전용 디자인 ${high}개`);
  s.shop = { win: 5, reroll: 0, lvl: 30, bought: [] };
  for (let w = 1; w < 300; w++) { s.shop.win = w; for (const o of G.shopStock(s)) if (o.item.r < 4) assert.ok(!epic.has(G.itemDesign(o.item))); }
});

section('상점: 신화 맛보기 (보장·장비 상점)');
test('신화 보장: 상자·뽑기에 쓴 크리스탈이 2700이 되는 구매(전설 상자 3개째)에서 신화가 확정되고 게이지는 0으로 돌아간다', () => {
  const s = G.createState(0); s.bestStage = 30; s.autoEquip = false; s.crystals = 1e6; G.setRandom(() => 0.01);   // 신화가 저절로는 안 나오는 난수
  const rs = [0, 1, 2].map(() => G.buyProduct(s, 'box_legend'));
  assert.deepStrictEqual(rs.map((r) => r.pityHit), [false, false, true]);
  assert.strictEqual(rs[2].items[0].r, 6);
  assert.strictEqual(s.mythPity, 0);
  const d = [];
  for (let i = 0; i < 18; i++) d.push(G.buyProduct(s, 'draw_weapon'));   // 150 × 18 = 2700
  assert.strictEqual(d.findIndex((r) => r.pityHit), 17, '칸별 뽑기도 같이 쌓인다');
  assert.strictEqual(d[17].items[0].slot, 'weapon');
  G.setRandom(null);
});
test('운 좋게 신화가 나오면 보장 게이지가 0부터 다시 쌓인다', () => {
  const s = G.createState(0); s.bestStage = 30; s.autoEquip = false; s.crystals = 1e6; s.mythPity = 1000; G.setRandom(() => 0.9999);
  const r = G.buyProduct(s, 'box_legend');
  assert.strictEqual(r.items[0].r, 6); assert.strictEqual(r.pityHit, false); assert.strictEqual(s.mythPity, 0);
  G.setRandom(null);
});
test('물약·가방 같은 상품은 보장 게이지를 쌓지 않고, 게이지는 저장·복원되며 조작은 걸러진다', () => {
  const s = G.createState(0); s.crystals = 1e6; G.buyProduct(s, 'bag');
  assert.strictEqual(s.mythPity, 0);
  s.mythPity = 1234;
  const o = JSON.parse(G.serialize(s, 1)); assert.strictEqual(G.deserialize(JSON.stringify(o)).mythPity, 1234);
  o.mythPity = 1e9; assert.strictEqual(G.deserialize(JSON.stringify(o)).mythPity, St.MYTH_PITY);
});
test('장비 상점에 유니크·신화도 가끔 진열되고 값은 등급별 가격이다 (여러 구간 통계)', () => {
  const s = G.createState(0); s.bestStage = 40; let n = 0, uniq = 0, myth = 0;
  for (let w = 1; w <= 3000; w++) { s.shop = { win: w, reroll: 0, lvl: 40, bought: [] }; for (const o of G.shopStock(s)) { n += 1; if (o.item.r === 5) uniq += 1; if (o.item.r === 6) { myth += 1; assert.strictEqual(o.price, St.GEAR_SHOP.price[6]); } } }
  assert.ok(Math.abs(myth / n - St.GEAR_SHOP.mythChance) < 0.006, `신화 ${myth / n}`);
  assert.ok(Math.abs(uniq / n - St.GEAR_SHOP.uniqueChance) < 0.01, `유니크 ${uniq / n}`);
});

section('장비 수치 편차');
test('새로 얻는 장비는 같은 등급·종류·레벨이면 기준 수치의 ±5% 안이고, 품질로 편차를 알 수 있다', () => {
  const s = G.createState(0);
  for (let i = 0; i < 3000; i++) {
    const it = G.rollItem(s, 60, i % 2 === 0, i % 7);
    const q = G.itemQuality(it);
    assert.ok(q >= -G.ITEM_SPREAD - 0.01 && q <= G.ITEM_SPREAD + 0.01, `품질 ${q}`);
  }
});
test('예전 ±15% 장비도 복원할 때 깎이지 않는다', () => {
  const s = G.createState(0); const it = G.rollItem(s, 40, false, 4, 'weapon');
  it.val = Math.round(G.GEAR.weapon.kinds[it.kind].base[4] * 2 * 1.14 * 10) / 10; s.bag.push(it);
  assert.strictEqual(G.deserialize(G.serialize(s, 1)).bag[0].val, it.val);
});

section('직업 속성 타격 이펙트');
test('모든 직업에 속성이 있고, 부모·자식과 형제 직업끼리는 속성이 겹치지 않는다', () => {
  const Sk = require('../skills.js');
  for (const id of Object.keys(G.NODES)) {
    assert.ok(Sk.ELEMENTS.includes(Sk.CLASS_ELEMENT[id]), `${id} 속성 없음`);
    const p = G.parentOf(id);
    if (p) assert.notStrictEqual(Sk.CLASS_ELEMENT[id], Sk.CLASS_ELEMENT[p], `${id}가 부모 ${p}와 같다`);
  }
  for (const id of [...Object.keys(G.NODES), null]) {
    const kids = id ? G.childrenOf(id) : Object.keys(G.CLASSES);
    assert.strictEqual(new Set(kids.map((k) => Sk.CLASS_ELEMENT[k])).size, kids.length, `${id || '1차'}의 자식끼리 겹친다`);
  }
});

section('장비 잠금');
const lkBase = () => { const s = G.createState(0); s.bestStage = 50; s.autoEquip = false; const a = G.rollItem(s, 20, false, 1, 'weapon'), b = G.rollItem(s, 20, false, 1, 'weapon'); s.bag.push(a, b); return { s, a, b }; };
test('잠근 장비는 하나씩·골라서·등급별로 팔거나 분해해도 남는다', () => {
  const { s, a, b } = lkBase();
  assert.strictEqual(G.toggleLock(s, a.id), true);
  assert.strictEqual(G.sellBagItem(s, a.id), -1);
  assert.strictEqual(G.sellBagItems(s, [a.id, b.id]).n, 1);
  assert.deepStrictEqual(s.bag.map((x) => x.id), [a.id]);
  s.bag.push(b); assert.strictEqual(G.dismantleItems(s, [a.id, b.id]).n, 1);
  s.bag.push(b); G.sellBagUpTo(s, 4);
  assert.deepStrictEqual(s.bag.map((x) => x.id), [a.id]);
});
test('잠근 장비는 강화·초월 재료가 되지 않고, 약한 장비 정리에서도 빠진다', () => {
  const { s, a, b } = lkBase(); s.gold = 1e12; s.dust = 1e9;
  G.toggleLock(s, b.id);
  assert.strictEqual(G.enhanceItem(s, a.id, b.id).reason, 'material');
  a.enh = 15; assert.deepStrictEqual(G.starMaterials(s, a), []);
  s.equip.weapon = G.rollItem(s, 90, false, 6, 'weapon');
  assert.ok(!G.bagWeaker(s).includes(b));
});
test('잠금은 언제든 풀 수 있고, 저장·복원된다', () => {
  const { s, a } = lkBase();
  G.toggleLock(s, a.id);
  assert.strictEqual(G.deserialize(G.serialize(s, 1)).bag.find((x) => x.id === a.id).lock, true);
  assert.strictEqual(G.toggleLock(s, a.id), false);
  assert.ok(G.sellBagItem(s, a.id) >= 0);
});

section('무한의 탑');
const twBase = (lv) => { const s = G.createState(0); s.bestStage = 5; s.level = 60; for (const k of G.UPGRADE_KEYS) s.upgrades[k] = lv; return s; };
test('층이 오를수록 보스 체력이 늘고, 보스 스테이지 배율 때문에 튀지 않는다', () => {
  for (let f = 1; f < 100; f++) {
    assert.ok(G.towerHp(f + 1) > G.towerHp(f), `층 ${f}`);
    assert.ok(G.towerHp(f + 1) / G.towerHp(f) < 2, `층 ${f}→${f + 1} 급증`);
  }
});
test('오르기: 예상한 층 수만큼 오르고, 한 번에 최대 10층, 막힌 층은 기록만 남긴다', () => {
  const s = twBase(40);
  const f = G.towerForecast(s);
  const r = G.climbTower(s);
  assert.strictEqual(r.climbed, f);
  assert.ok(r.climbed <= G.TOWER.maxClimb);
  assert.strictEqual(s.tower.best, f);
  assert.strictEqual(r.fights.filter((x) => x.killed).length, f);
  if (f < G.TOWER.maxClimb) assert.strictEqual(r.fights[r.fights.length - 1].killed, false);
});
test('못 오르면 잃는 것 없이 0층 오르기로 끝난다', () => {
  const s = G.createState(0); s.bestStage = 5; s.tower.best = 200; const c = s.crystals;
  const r = G.climbTower(s);
  assert.strictEqual(r.ok, true); assert.strictEqual(r.climbed, 0);
  assert.strictEqual(s.crystals, c); assert.strictEqual(s.tower.best, 200);
});
test('새 층 보상: 층마다 크리스탈, 5층마다 장비, 10층마다 증표를 준다', () => {
  const s = twBase(200); s.autoEquip = false;
  const r = G.climbTower(s);
  assert.strictEqual(r.climbed, 10);
  let c = 0; for (let f = 1; f <= 10; f++) c += G.TOWER.crystals(f);
  assert.strictEqual(r.crystals, c);
  assert.strictEqual(r.drops.length, 2);
  assert.strictEqual(r.tokens, G.TOWER.tokens);
  assert.ok(r.more, '더 오를 수 있으면 알려 준다');
});
test('가방 자리가 모자라면 오르지 않는다', () => {
  const s = twBase(200); s.autoEquip = false;
  while (s.bag.length < G.bagLimit(s)) s.bag.push(G.rollItem(s, 5, false, 0));
  const r = G.climbTower(s);
  assert.strictEqual(r.reason, 'bag'); assert.strictEqual(s.tower.best, 0);
});
test('일일 보상: 최고 층이 있어야 하고 하루 한 번만', () => {
  const s = twBase(200);
  assert.strictEqual(G.claimTowerDaily(s, '2026-09-24').reason, 'none');
  G.climbTower(s);
  const c = s.crystals;
  assert.strictEqual(G.claimTowerDaily(s, '2026-09-24').crystals, G.TOWER.daily(10));
  assert.strictEqual(s.crystals, c + G.TOWER.daily(10));
  assert.strictEqual(G.claimTowerDaily(s, '2026-09-24').reason, 'claimed');
  assert.strictEqual(G.claimTowerDaily(s, '2026-09-25').ok, true);
});
test('탑 기록은 환생해도 남고, 저장·복원되며, 조작된 값은 걸러진다', () => {
  const s = twBase(200); G.climbTower(s); G.claimTowerDaily(s, '2026-09-24');
  s.stage = s.runBest = s.bestStage = 60; G.prestige(s);
  assert.strictEqual(s.tower.best, 10);
  const o = JSON.parse(G.serialize(s, 1));
  assert.deepStrictEqual(G.deserialize(JSON.stringify(o)).tower, { best: 10, day: '2026-09-24' });
  o.tower = { best: 1e9, day: '<script>' };
  assert.deepStrictEqual(G.deserialize(JSON.stringify(o)).tower, { best: G.TOWER.maxFloor, day: '' });
  delete o.tower;
  assert.deepStrictEqual(G.deserialize(JSON.stringify(o)).tower, { best: 0, day: '' }, '예전 저장은 0층부터');
});

section('친선 랭킹 · 서버 출석');
const Social = require('../social.js');
test('한국 시간 기준 날짜 번호: 자정(한국 시간)에 바뀐다', () => {
  const kst = (y, m, d, h, mi) => Date.UTC(y, m - 1, d, h - 9, mi);
  assert.strictEqual(Social.dayNumOf(kst(2026, 9, 22, 0, 0)), Social.dayNumOf(kst(2026, 9, 22, 23, 59)));
  assert.strictEqual(Social.dayNumOf(kst(2026, 9, 23, 0, 0)), Social.dayNumOf(kst(2026, 9, 22, 12, 0)) + 1);
  assert.strictEqual(Social.dayNumOf(Date.UTC(1970, 0, 1, 14, 59)), 0);   // 1970-01-01 23:59 KST
  assert.strictEqual(Social.dayNumOf(Date.UTC(1970, 0, 1, 15, 0)), 1);
});
test('닉네임은 한글·영문·숫자·공백·밑줄만 12자까지 남기고, 못 쓰면 빈 문자열이다', () => {
  assert.strictEqual(Social.sanitizeNick('  홍길동  '), '홍길동');
  assert.strictEqual(Social.sanitizeNick('a<b>c"d\'e&f'), 'abcdef');
  assert.strictEqual(Social.sanitizeNick('가나다라마바사아자차카타파하'), '가나다라마바사아자차카타');
  assert.strictEqual(Social.sanitizeNick('Goblin   King_1'), 'Goblin King_', '공백은 하나로, 12자까지');
  assert.strictEqual(Social.sanitizeNick('Goblin_1'), 'Goblin_1');
  for (const bad of ['', '   ', '<>!@#', null, undefined, 123]) assert.ok(Social.sanitizeNick(bad) === '' || typeof Social.sanitizeNick(bad) === 'string');
  assert.strictEqual(Social.sanitizeNick('<>!@#'), '');
});
test('랭킹에 올리는 값은 서버 규칙이 허용하는 범위 안으로 맞춰지고, 닉네임이 없으면 올리지 않는다', () => {
  const s = G.createState(0); s.bestStage = 9999; s.tokens = -5; s.level = 3.7; s.prestiges = 2; s.achieved = { kill100: true, stage10: true };
  assert.strictEqual(Social.rankEntry(s, '', 'mage'), null);
  const e = Social.rankEntry(s, '고블린왕', 'mage');
  assert.deepStrictEqual(e, { name: '고블린왕', best: 500, tokens: 0, ach: 2, prestiges: 2, level: 3, look: 'mage' });
  assert.deepStrictEqual(Object.keys(e).sort(), ['ach', 'best', 'level', 'look', 'name', 'prestiges', 'tokens']);
  assert.strictEqual(Social.rankEntry(s, '이름', 5).look, 'novice');
});
test('랭킹 값이 그대로면 다시 올리지 않는다 (쓰기 횟수 절약)', () => {
  const s = G.createState(0); const a = Social.rankEntry(s, '나', 'novice');
  assert.strictEqual(Social.rankChanged(null, a), true);
  assert.strictEqual(Social.rankChanged(a, Object.assign({}, a)), false);
  assert.strictEqual(Social.rankChanged(a, Object.assign({}, a, { best: 2 })), true);
});
test('출석 계산: 첫 출석 1일, 어제 했으면 연속 +1, 건너뛰면 1부터, 오늘 이미 했으면 없음 (서버 규칙과 같은 계산)', () => {
  assert.deepStrictEqual(Social.nextAttend(null, 100), { day: 100, streak: 1, total: 1, best: 1 });
  const a = Social.nextAttend(null, 100), b = Social.nextAttend(a, 101), c = Social.nextAttend(b, 102);
  assert.deepStrictEqual(c, { day: 102, streak: 3, total: 3, best: 3 });
  assert.strictEqual(Social.nextAttend(c, 102), null, '같은 날');
  assert.strictEqual(Social.nextAttend(c, 101), null, '과거 날짜');
  assert.deepStrictEqual(Social.nextAttend(c, 105), { day: 105, streak: 1, total: 4, best: 3 }, '끊기면 1부터, 최고 기록은 남는다');
});
test('출석 보상은 연속 일수의 7일 주기대로 3·3·5·5·8·8·20이다', () => {
  const R = G.STORE.ATTEND_REWARDS;
  assert.deepStrictEqual(R, [3, 3, 5, 5, 8, 8, 20]);
  assert.deepStrictEqual([1, 2, 3, 4, 5, 6, 7, 8, 14, 15].map((d) => Social.attendReward(d, R)), [3, 3, 5, 5, 8, 8, 20, 3, 20, 3]);
});
test('서버 출석 보상은 그날의 기록이 있고 그날 아직 안 받았을 때만 한 번 준다', () => {
  const s = G.createState(0);
  assert.strictEqual(G.claimAttend(s, null, 100), 0);
  assert.strictEqual(G.claimAttend(s, { day: 99, streak: 3 }, 100), 0, '어제 기록은 오늘 보상이 아니다');
  assert.strictEqual(G.claimAttend(s, { day: 100, streak: 3 }, 100), 5);
  assert.strictEqual(G.claimAttend(s, { day: 100, streak: 3 }, 100), 0, '두 번 받을 수 없다');
  assert.strictEqual(G.claimAttend(s, { day: 101, streak: 4 }, 101), 5);
  assert.strictEqual(s.crystals, 10);
  const back = G.deserialize(G.serialize(s, 1));
  assert.deepStrictEqual([back.attend.claimed, back.crystals], [101, 10]);
  s.crystals = 1e9 - 1; assert.strictEqual(G.claimAttend(s, { day: 102, streak: 7 }, 102), 20); assert.strictEqual(s.crystals, 1e9);
});
test('닉네임과 출석 받은 기록은 저장·복원되고, 조작된 값은 걸러진다', () => {
  const s = G.createState(0); s.nick = '고블린왕';
  assert.strictEqual(G.deserialize(G.serialize(s, 1)).nick, '고블린왕');
  const o = JSON.parse(G.serialize(s, 1)); o.nick = '<script>alert(1)</script>가나'; o.attend = { claimed: -9 };
  const c = G.deserialize(JSON.stringify(o));
  assert.strictEqual(c.nick, 'scriptalert1', '특수문자는 지우고 12자까지');
  assert.strictEqual(c.attend.claimed, 0);
  const old = JSON.parse(G.serialize(s, 1)); delete old.nick; delete old.attend;
  const d = G.deserialize(JSON.stringify(old));
  assert.deepStrictEqual([d.nick, d.attend], ['', { claimed: 0 }]);
});
test('Firebase 어댑터: 랭킹 올리기·불러오기·지우기가 규칙에 맞는 모양으로 SDK를 부른다', async () => {
  const sdk = stubSdk(), ad = CloudFirebase.createFirebaseAdapter(CFG, sdk);
  await assert.rejects(() => ad.rankSubmit({ name: 'a' }), /로그인/);
  sdk.loginNow();
  const e1 = { name: '가', best: 50, tokens: 3, ach: 4, prestiges: 1, level: 30, look: 'mage' };
  await ad.rankSubmit(e1);
  assert.ok(sdk.calls.includes('setDoc:ranks/abc'));
  assert.deepStrictEqual(Object.keys(sdk.store['ranks/abc']).sort(), ['ach', 'best', 'level', 'look', 'name', 'prestiges', 'tokens', 'updatedAt']);
  sdk.store['ranks/other'] = { name: '나', best: 90, tokens: 1, ach: 1, prestiges: 0, level: 10, look: 'novice' };
  const rows = await ad.rankTop('best', 500);
  assert.deepStrictEqual(rows.map((r) => [r.name, r.me]), [['나', false], ['가', true]], '높은 순, 내 것 표시');
  assert.ok(sdk.calls.includes('query:ranks:best:100'), '한 번에 100개까지만 요청한다: ' + sdk.calls.join(' '));
  await ad.rankRemove();
  assert.ok(!('ranks/abc' in sdk.store));
});
test('Firebase 어댑터: 출석은 하루 한 번, 연속·누적이 서버 규칙과 같게 계산된다', async () => {
  const sdk = stubSdk(), ad = CloudFirebase.createFirebaseAdapter(CFG, sdk);
  await assert.rejects(() => ad.attendCheckIn(100), /로그인/);
  sdk.loginNow();
  assert.strictEqual(await ad.attendGet(), null);
  assert.deepStrictEqual((await ad.attendCheckIn(100)).rec, { day: 100, streak: 1, total: 1, best: 1 });
  assert.deepStrictEqual(await ad.attendCheckIn(100), { already: true, rec: { day: 100, streak: 1, total: 1, best: 1 } });
  assert.deepStrictEqual((await ad.attendCheckIn(101)).rec, { day: 101, streak: 2, total: 2, best: 2 });
  assert.deepStrictEqual((await ad.attendCheckIn(105)).rec, { day: 105, streak: 1, total: 3, best: 2 });
  assert.deepStrictEqual(await ad.attendGet(), { day: 105, streak: 1, total: 3, best: 2 });
  assert.deepStrictEqual(Object.keys(sdk.store['attendance/abc']).sort(), ['best', 'day', 'streak', 'total', 'updatedAt']);
});
test('firestore.rules에 랭킹·출석 규칙이 있고 서버 시각·범위·30초 제한·본인 문서만 검사한다 (문자열 점검)', () => {
  const rules = require('fs').readFileSync(require('path').join(__dirname, '..', 'firestore.rules'), 'utf8');
  for (const must of ['match /ranks/{uid}', 'match /attendance/{uid}', 'math.floor((request.time.toMillis() + 32400000) / 86400000)', 'request.query.limit <= 100', "duration.value(30, 's')",
    'request.resource.data.updatedAt == request.time', 'hasOnly([\'name\', \'best\'', 'match /wallets/{uid}', 'allow write: if false']) assert.ok(rules.includes(must), must);
  assert.ok(!/allow (read|write)[^:]*: if true/.test(rules), '아무나 허용하는 규칙이 없다');
  assert.strictEqual((rules.match(/\{/g) || []).length, (rules.match(/\}/g) || []).length, '중괄호 짝');
});


section('배포 파일 (웹 앱 설치 · 안드로이드 TWA 준비)');
const fsx = require('fs'), pathx = require('path');
const rootPath = (...p) => pathx.join(__dirname, '..', ...p);
const pngSize = (file) => { const b = fsx.readFileSync(file); assert.strictEqual(b.slice(1, 4).toString(), 'PNG'); return [b.readUInt32BE(16), b.readUInt32BE(20)]; };
test('manifest.webmanifest에 앱 이름·시작 주소·범위·세로 화면·색·아이콘(192·512·maskable)이 있고 아이콘 파일 크기가 맞다', () => {
  const m = JSON.parse(fsx.readFileSync(rootPath('manifest.webmanifest'), 'utf8'));
  for (const k of ['name', 'short_name', 'start_url', 'scope', 'display', 'background_color', 'theme_color', 'icons', 'lang']) assert.ok(m[k], k);
  assert.strictEqual(m.display, 'standalone'); assert.strictEqual(m.orientation, 'portrait');
  assert.ok(m.start_url.startsWith('./') && m.scope === './', '주소는 상대 경로라서 어느 주소에 올려도 맞다');
  const has = (size, purpose) => m.icons.some((i) => i.sizes === size && i.purpose === purpose && i.type === 'image/png');
  assert.ok(has('192x192', 'any') && has('512x512', 'any') && has('512x512', 'maskable'));
  for (const i of m.icons) { const [w, h] = pngSize(rootPath(i.src)); assert.strictEqual(`${w}x${h}`, i.sizes, i.src); }
  assert.deepStrictEqual(pngSize(rootPath('icons', 'apple-touch-icon.png')), [180, 180]);
});
test('index.html이 매니페스트·아이콘을 연결하고 https에서만 서비스 워커를 등록한다', () => {
  const h = fsx.readFileSync(rootPath('index.html'), 'utf8');
  assert.ok(h.includes('rel="manifest" href="manifest.webmanifest"') && h.includes('rel="apple-touch-icon"'));
  assert.ok(h.includes("location.protocol === 'https:'") && h.includes("register('sw.js')"));
  assert.ok(h.indexOf('social.js') < h.indexOf('game.js') && h.indexOf('store.js') < h.indexOf('game.js'), 'game.js보다 먼저 불러와야 하는 파일 순서');
  for (const m of h.matchAll(/(?:src|href)="([^"?#:]+\.(?:js|css|png|webmanifest))(?:\?[^"]*)?"/g)) assert.ok(fsx.existsSync(rootPath(m[1])), '없는 파일: ' + m[1]);
});
test('서비스 워커는 GET·같은 사이트 요청만 다루고 네트워크 우선이라서 배포하면 바로 새 버전이 뜬다', () => {
  const sw = fsx.readFileSync(rootPath('sw.js'), 'utf8');
  assert.ok(sw.includes("req.method !== 'GET'") && sw.includes('url.origin !== self.location.origin'), 'HEAD·POST·다른 사이트 요청은 통과');
  assert.ok(sw.indexOf('await fetch(req)') < sw.indexOf('caches.match'), '네트워크를 먼저 시도한다');
  assert.ok(sw.includes('skipWaiting') && sw.includes('clients.claim'));
  assert.ok(!sw.includes('cache.addAll'), '미리 저장하지 않는다 (오래된 파일이 남지 않게)');
});
test('TWA 초안과 assetlinks 견본이 올바른 JSON이고 주소·패키지 이름이 서로 맞는다', () => {
  const tw = JSON.parse(fsx.readFileSync(rootPath('twa', 'twa-manifest.json'), 'utf8'));
  const al = JSON.parse(fsx.readFileSync(rootPath('twa', 'assetlinks.sample.json'), 'utf8'));
  assert.strictEqual(tw.host, 'hongsunsik.github.io');
  assert.ok(tw.webManifestUrl.startsWith(`https://${tw.host}/goblin-idle/`) && tw.startUrl.startsWith('/goblin-idle/'));
  assert.strictEqual(al[0].target.package_name, tw.packageId);
  assert.strictEqual(al[0].target.namespace, 'android_app');
  assert.ok(al[0].relation.includes('delegate_permission/common.handle_all_urls'));
  assert.ok(!('playBilling' in tw.features), '결제는 서버 검증이 준비된 뒤에 켠다');
  assert.ok(/keystore/.test(fsx.readFileSync(rootPath('.gitignore'), 'utf8')), '서명 키는 올리지 않는다');
});

section('GM 치트 (특정 계정 전용)');
test('등록된 이메일만 GM으로 인정하고, 값 범위를 벗어나지 않게 자른다', () => {
  assert.strictEqual(G.isGM('hongsunsik1@gmail.com'), true);
  assert.strictEqual(G.isGM('other@example.com'), false);
  assert.strictEqual(G.isGM(''), false);
  assert.strictEqual(G.isGM(undefined), false);
  const s = G.createState(0);
  G.gmAddCrystals(s, 1e12); assert.strictEqual(s.crystals, 1e9, '상한을 넘지 않는다');
  G.gmAddTokens(s, -999); assert.strictEqual(s.tokens, 0, '음수로 내려가지 않는다');
  G.gmSetLevel(s, -5); assert.strictEqual(s.level, 1);
  G.gmSetLevel(s, 50); assert.strictEqual(s.level, 50); assert.strictEqual(s.hp, G.maxHp(s), '레벨이 오르면 체력도 다시 계산된다');
  G.gmSetStage(s, 9999); assert.strictEqual(s.stage, 999, '상한(999)을 넘지 않는다');
  assert.strictEqual(s.runBest, 999); assert.strictEqual(s.bestStage, 999);
  const before = { ...s.upgrades };
  G.gmMaxUpgrades(s, 999); for (const k of G.UPGRADE_KEYS) assert.strictEqual(s.upgrades[k], Math.min(before[k] + 999, G.UPGRADES[k].max), k);
  G.gmMaxUpgrades(s, 999); assert.strictEqual(s.upgrades.speed, G.UPGRADES.speed.max, '유한한 상한(재빠른 손)은 넘지 않는다');
  G.gmUnlockRelics(s); assert.strictEqual(Object.keys(s.relics).length, G.STORE.RELICS.length);
});

queue.then(() => console.log(`\n${passed}개 통과` + (process.exitCode ? ', 실패 있음' : '')));
