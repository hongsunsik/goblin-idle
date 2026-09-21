// 고블린 키우기 - 3차·4차 직업 데이터 (game.js가 불러 쓴다)
// 2차 직업 하나마다 3차가 2갈래, 3차 하나마다 4차가 2갈래로 갈라진다 (3차 16종 + 4차 32종).
// mult는 앞 단계 직업의 배율에 곱해진다. 항목: dmg 공격력, hp 최대 체력, aps 공격 속도, gold 골드, comp 동료 공격, regen 체력 회복, click 직접 때리기
(function (root) {
  const ADVANCED3 = {
    // ---- 기사 ----
    paladin:     { name: '성기사',        parent: 'knight',      desc: '신성한 가호로 체력과 회복이 더 늘어난다.',
                   mult: { hp: 1.3, regen: 1.4, dmg: 1.3 } },
    crusader:    { name: '십자군',        parent: 'knight',      desc: '방패를 든 채 돌격한다. 공격과 체력이 함께 오른다.',
                   mult: { dmg: 1.35, hp: 1.2 } },
    // ---- 광전사 ----
    warlord:     { name: '전쟁군주',      parent: 'berserker',   desc: '전장을 지휘한다. 공격력과 동료의 힘이 오른다.',
                   mult: { dmg: 1.2, comp: 1.1 } },
    destroyer:   { name: '파괴자',        parent: 'berserker',   desc: '모든 것을 부순다. 공격력이 크게 오르지만 몸이 상한다.',
                   mult: { dmg: 1.55, hp: 0.85 } },
    // ---- 저격수 ----
    deadeye:     { name: '명사수',        parent: 'sniper',      desc: '숨을 멈추고 쏜다. 공격력과 직접 공격이 강해진다.',
                   mult: { dmg: 1.35, click: 1.5 } },
    piercer:     { name: '관통사수',      parent: 'sniper',      desc: '갑옷을 뚫는 화살. 공격력과 연사가 함께 늘어난다.',
                   mult: { dmg: 1.25, aps: 1.15 } },
    // ---- 레인저 ----
    windwalker:  { name: '바람추적자',    parent: 'ranger',      desc: '바람처럼 빠르다. 연사가 크게 늘어난다.',
                   mult: { aps: 1.35, dmg: 1.2 } },
    beastmaster: { name: '야수조련사',    parent: 'ranger',      desc: '맹수를 길들여 함께 싸운다. 동료의 공격이 크게 늘어난다.',
                   mult: { comp: 1.6, aps: 1.05 } },
    // ---- 화염술사 ----
    infernomage: { name: '업화술사',      parent: 'pyromancer',  desc: '지옥불을 다룬다. 공격력과 직접 공격이 강해진다.',
                   mult: { dmg: 1.35, click: 1.5 } },
    phoenixmage: { name: '불사조술사',    parent: 'pyromancer',  desc: '재에서 되살아난다. 체력과 회복이 크게 오른다.',
                   mult: { hp: 1.2, regen: 1.15, dmg: 1.05 } },
    // ---- 사령술사 ----
    lich:        { name: '리치',          parent: 'necromancer', desc: '죽음을 넘어선 마법사. 동료의 힘이 더 강해진다.',
                   mult: { comp: 1.15, dmg: 1.05 } },
    soulreaper:  { name: '영혼수확자',    parent: 'necromancer', desc: '영혼을 거둬 부를 쌓는다. 골드와 동료가 강해진다.',
                   mult: { gold: 1.35, comp: 1.3 } },
    // ---- 암살자 ----
    shade:       { name: '그림자 자객',   parent: 'assassin',    desc: '그림자에 스며든다. 공격력과 손놀림이 오른다.',
                   mult: { dmg: 1.3, aps: 1.1 } },
    nightblade:  { name: '밤칼날',        parent: 'assassin',    desc: '밤에 움직이는 칼. 공격력과 골드가 함께 오른다.',
                   mult: { dmg: 1.2, gold: 1.25 } },
    // ---- 해적 ----
    captain:     { name: '선장',          parent: 'pirate',      desc: '배를 이끄는 우두머리. 골드와 동료가 강해진다.',
                   mult: { gold: 1.4, comp: 1.25 } },
    buccaneer:   { name: '약탈자',        parent: 'pirate',      desc: '닥치는 대로 빼앗는다. 골드가 크게 늘어난다.',
                   mult: { gold: 1.55, dmg: 1.1 } },
  };

  const ADVANCED4 = {
    // ---- 성기사 ----
    seraph:        { name: '세라핌 기사',   parent: 'paladin',     desc: '날개 달린 수호자. 체력과 회복이 극에 달한다.',
                     mult: { hp: 1.3, regen: 2.4, dmg: 1.9 } },
    holyking:      { name: '성왕',          parent: 'paladin',     desc: '신성한 왕. 공격·체력·골드가 고르게 오른다.',
                     mult: { dmg: 2.02, hp: 1.25, gold: 1.15 } },
    // ---- 십자군 ----
    inquisitor:    { name: '심판관',        parent: 'crusader',    desc: '죄를 심판하는 일격. 공격력과 직접 공격이 크게 오른다.',
                     mult: { dmg: 1.65, click: 1.5 } },
    templarlord:   { name: '성전 사령관',   parent: 'crusader',    desc: '성전을 이끄는 지휘관. 체력과 연사가 늘어난다.',
                     mult: { hp: 1.3, aps: 1.15, dmg: 1.67 } },
    // ---- 전쟁군주 ----
    conqueror:     { name: '정복왕',        parent: 'warlord',     desc: '땅을 차지하고 전리품을 거둔다. 공격력과 골드가 오른다.',
                     mult: { dmg: 1, gold: 1.3 } },
    hordelord:     { name: '군단장',        parent: 'warlord',     desc: '거대한 군단을 부린다. 동료의 힘이 압도적이다.',
                     mult: { comp: 1.06, dmg: 1 } },
    // ---- 파괴자 ----
    avatarofruin:  { name: '파멸의 화신',   parent: 'destroyer',   desc: '멸망 그 자체. 공격력이 폭발하지만 몹시 위태롭다.',
                     mult: { dmg: 1.02, hp: 0.8 } },
    titan:         { name: '타이탄',        parent: 'destroyer',   desc: '산처럼 거대한 몸. 공격력과 체력이 함께 오른다.',
                     mult: { dmg: 1, hp: 1.4 } },
    // ---- 명사수 ----
    godeye:        { name: '신의 눈',       parent: 'deadeye',     desc: '빗나가지 않는 눈. 공격력과 직접 공격이 극대화된다.',
                     mult: { dmg: 2.5, click: 1.5 } },
    hawkeye:       { name: '매의 눈',       parent: 'deadeye',     desc: '먼 곳도 꿰뚫어 본다. 공격력과 연사가 오른다.',
                     mult: { dmg: 2.5, aps: 1.35 } },
    // ---- 관통사수 ----
    siegearcher:   { name: '공성 궁수',     parent: 'piercer',     desc: '성벽도 뚫는 화살. 공격력과 체력이 오른다.',
                     mult: { dmg: 2.5, hp: 1.15 } },
    dragonslayer:  { name: '용사냥꾼',      parent: 'piercer',     desc: '용을 잡는 사냥꾼. 공격력과 골드가 오른다.',
                     mult: { dmg: 2.5, gold: 1.3 } },
    // ---- 바람추적자 ----
    stormarcher:   { name: '폭풍의 궁수',   parent: 'windwalker',  desc: '폭풍처럼 쏟아붓는다. 연사가 압도적이다.',
                     mult: { aps: 1.65, dmg: 1.89 } },
    windsage:      { name: '바람의 현자',   parent: 'windwalker',  desc: '바람의 축복을 받는다. 연사와 회복이 늘어난다.',
                     mult: { aps: 1.4, regen: 1.12, hp: 1.2, dmg: 1.41 } },
    // ---- 야수조련사 ----
    wolfking:      { name: '늑대왕',        parent: 'beastmaster', desc: '늑대 무리의 왕. 동료의 공격이 압도적이다.',
                     mult: { comp: 1.8, aps: 1.1 } },
    forestwarden:  { name: '숲의 수호자',   parent: 'beastmaster', desc: '숲과 함께 싸운다. 동료와 체력이 오른다.',
                     mult: { comp: 1.34, hp: 1.3 } },
    // ---- 업화술사 ----
    flameemperor:  { name: '화염 황제',     parent: 'infernomage', desc: '불꽃의 지배자. 공격력과 직접 공격이 극대화된다.',
                     mult: { dmg: 2.5, click: 1.5 } },
    meteormage:    { name: '유성술사',      parent: 'infernomage', desc: '하늘에서 별을 떨어뜨린다. 공격력과 연사가 오른다.',
                     mult: { dmg: 2.5, aps: 1.25 } },
    // ---- 불사조술사 ----
    phoenixlord:   { name: '불사조의 주인', parent: 'phoenixmage', desc: '죽지 않는 불꽃. 체력과 회복이 극에 달한다.',
                     mult: { hp: 1.5, regen: 1, dmg: 1.76 } },
    sunpriest:     { name: '태양의 사제',   parent: 'phoenixmage', desc: '태양의 은총. 체력·회복·골드가 오른다.',
                     mult: { hp: 1.25, gold: 1.25, regen: 1, dmg: 2.24 } },
    // ---- 리치 ----
    lichking:      { name: '리치왕',        parent: 'lich',        desc: '언데드의 왕. 동료의 공격이 압도적이다.',
                     mult: { comp: 1.05, dmg: 1.02 } },
    soulbinder:    { name: '영혼결속자',    parent: 'lich',        desc: '영혼을 묶어 방패로 삼는다. 동료와 체력이 오른다.',
                     mult: { comp: 1.0, hp: 1.25 } },
    // ---- 영혼수확자 ----
    grimreaper:    { name: '죽음의 사신',   parent: 'soulreaper',  desc: '낫을 든 사신. 골드와 공격력이 오른다.',
                     mult: { gold: 1.5, dmg: 1.6 } },
    boneemperor:   { name: '뼈의 황제',     parent: 'soulreaper',  desc: '뼈의 군대를 거느린다. 동료와 골드가 오른다.',
                     mult: { comp: 1.6, gold: 1.25 } },
    // ---- 그림자 자객 ----
    voidwalker:    { name: '공허의 자객',   parent: 'shade',       desc: '공허를 걷는 그림자. 공격력이 극대화된다.',
                     mult: { dmg: 2.11, aps: 1.1 } },
    phantom:       { name: '환영 무사',     parent: 'shade',       desc: '환영처럼 흩어진다. 공격력과 체력이 오른다.',
                     mult: { dmg: 2.08, hp: 1.25 } },
    // ---- 밤칼날 ----
    bloodblade:    { name: '혈검객',        parent: 'nightblade',  desc: '피에 젖은 칼날. 공격력과 골드가 오른다.',
                     mult: { dmg: 1, gold: 1.25 } },
    ninjamaster:   { name: '닌자 대가',     parent: 'nightblade',  desc: '눈에 보이지 않는 손놀림. 연사와 골드가 오른다.',
                     mult: { aps: 1.35, gold: 1.25, dmg: 2.46 } },
    // ---- 선장 ----
    seaking:       { name: '해왕',          parent: 'captain',     desc: '바다를 지배한다. 골드와 동료가 크게 오른다.',
                     mult: { gold: 1.55, comp: 2.5 } },
    ghostcaptain:  { name: '유령선장',      parent: 'captain',     desc: '저주받은 선장. 골드·동료·체력이 고르게 오른다.',
                     mult: { gold: 1.5, comp: 1.9, hp: 1.1 } },
    // ---- 약탈자 ----
    treasureking:  { name: '보물왕',        parent: 'buccaneer',   desc: '보물의 왕. 골드가 어마어마하게 쌓인다.',
                     mult: { gold: 1.8, dmg: 1.49 } },
    raiderlord:    { name: '약탈군주',      parent: 'buccaneer',   desc: '모든 것을 빼앗는 군주. 골드와 공격력이 오른다.',
                     mult: { gold: 1.6, dmg: 1.7 } },
  };

  const api = { ADVANCED3, ADVANCED4 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GoblinClasses = api;
})(typeof window !== 'undefined' ? window : globalThis);
