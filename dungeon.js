// 고블린 키우기 - 일일·주간·월간 던전 데이터 (game.js가 불러 쓴다)
//
// 던전은 일반 스테이지와 별개로, 기간마다 정해진 횟수만큼 도전하는 '한 방 승부'다.
// 도전하면 그 순간의 총 초당 피해(totalDps) × budgetSec를 '피해 예산'으로 삼아, 파동(웨이브) 보스를 순서대로 물리친다
// (dealDamage의 연쇄 처치와 같은 개념: 예산이 남으면 다음 파동까지 이어간다). 예산이 모자라면 그 자리에서 멈춘다.
// 물리친 파동마다 바로 보상(크리스탈·골드·장비)을 주고, 마지막 파동까지 다 물리치면(그 기간 처음 한 번만) 큰 보너스를 더 준다.
// 보스 체력은 '이번 판의 최고 스테이지(runBest)' 일반 몬스터 체력에 비례한다 (보상 장비 레벨·골드도 같은 기준). 판 후반에 도전할수록 보상이 크다.
(function (root) {
  const DUNGEON_PERIODS = ['daily', 'weekly', 'monthly'];
  // minStage: 최고 스테이지가 이만큼 되어야 열린다 (예전엔 10분 차에도 월간까지 완주해 크리스탈 550·증표 16·신화 45% 상자를 받아 초반이 폭주했다)
  const DUNGEONS = {
    daily: {
      id: 'daily', name: '일일 던전', period: 'daily', attempts: 3, waves: 1, minStage: 20,
      hpMult: 0.95, hpStep: 1, budgetSec: 20,   // 2026-09-24 재측정(이번 판 최고 스테이지 기준, 판 대부분 벽에서 머묾): 6.2면 15일 뒤 완주 가능 11~18% → 0.95
      boss: ['고블린 우두머리', '노략질 오크', '동굴 트롤', '늪지 히드라'],
      odds: { 2: 60, 3: 32, 4: 7, 5: 1 },                        // 파동 하나를 물리칠 때마다 주는 장비 등급 확률 (희귀 위주)
      reward: { crystals: 12, gold: 4 },
      clear: { crystals: 45, gold: 8, boxOdds: { 3: 60, 4: 34, 5: 6 } },
    },
    weekly: {
      id: 'weekly', name: '주간 던전', period: 'weekly', attempts: 1, waves: 3, minStage: 60,
      hpMult: 0.7, hpStep: 1.5, budgetSec: 55,   // 4.2 → 0.7
      boss: ['서리 거인', '용암 군주', '심연의 파수꾼', '뇌운의 화신'],
      odds: { 3: 55, 4: 38, 5: 6, 6: 1 },                        // 영웅 위주
      reward: { crystals: 33, gold: 9 },
      clear: { crystals: 240, tokens: 6, gold: 27, boxOdds: { 4: 55, 5: 36, 6: 9 } },
    },
    monthly: {
      id: 'monthly', name: '월간 던전', period: 'monthly', attempts: 1, waves: 5, minStage: 100,
      hpMult: 0.65, hpStep: 1.45, budgetSec: 110,   // 3.6 → 0.65 (미니게임을 조금 하면 여유)
      boss: ['천 개의 눈 리치', '태초의 화룡', '왕좌를 삼킨 그림자', '종말의 문지기'],
      odds: { 4: 55, 5: 35, 6: 10 },                             // 전설 위주
      reward: { crystals: 80, gold: 24 },
      clear: { crystals: 800, tokens: 18, gold: 70, boxOdds: { 5: 50, 6: 50 } },
    },
  };
  // 보스 이름표 → 그림 종류(images/bosses/<종류>.webp). 화면 쪽에서 A.bossArt(id)로 그린다.
  const BOSS_ART = {
    '고블린 우두머리': 'goblin_chief', '노략질 오크': 'raiding_orc', '동굴 트롤': 'cave_troll', '늪지 히드라': 'swamp_hydra',
    '서리 거인': 'frost_giant', '용암 군주': 'lava_lord', '심연의 파수꾼': 'abyss_warden', '뇌운의 화신': 'storm_avatar',
    '천 개의 눈 리치': 'thousand_eye_lich', '태초의 화룡': 'primal_firedragon', '왕좌를 삼킨 그림자': 'throne_shadow', '종말의 문지기': 'doom_gatekeeper',
  };
  // 무한의 탑: 횟수 제한 없이, 지금 전투력으로 뚫을 수 있는 층까지 한 번에 최대 maxClimb층씩 오른다.
  // 층의 세기는 내 진행과 무관한 고정값(층 f = 스테이지 stageBase + stagePerFloor×f의 일반 몬스터 체력 × hpMult)이라
  // '최고 층'이 곧 내 전투력의 기록이 된다. 층마다 피해 예산(초당 피해 × budgetSec)을 새로 받는다.
  // 보상: 새 층을 처음 넘을 때만. 5층마다 장비, 10층마다 증표. 하루 한 번 최고 층에 비례한 크리스탈.
  const TOWER = {
    stageBase: 10, stagePerFloor: 3, hpMult: 6, budgetSec: 25, maxClimb: 10, maxFloor: 9999, minStage: 30,
    crystals: (f) => 5 + Math.floor(f / 2),
    itemEvery: 5, itemOdds: { 2: 60, 3: 34, 4: 6 },
    tokenEvery: 10, tokens: 2, bigOdds: { 3: 58, 4: 34, 5: 7, 6: 1 },   // 10층마다: 장비 등급이 더 높고 증표도 준다
    daily: (best) => 10 + best,   // 43층(스테이지 140 무렵)이면 하루 53개: 일일 던전 완주(38개)보다 조금 많게
  };
  const api = { DUNGEON_PERIODS, DUNGEONS, BOSS_ART, TOWER };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GoblinDungeon = api;
})(typeof window !== 'undefined' ? window : globalThis);
