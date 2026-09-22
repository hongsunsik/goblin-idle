// 고블린 키우기 - 3차·4차 직업 데이터 (game.js가 불러 쓴다)
// 2차 직업 하나마다 3차가 2갈래, 3차 하나마다 4차가 2갈래로 갈라진다 (3차 16종 + 4차 32종).
// mult는 앞 단계 직업의 배율에 곱해진다. 항목: dmg 공격력, hp 최대 체력, aps 공격 속도, gold 골드, comp 동료 공격, regen 체력 회복, click 직접 때리기
(function (root) {
  const ADVANCED3 = {
    // ---- 기사 ----
    paladin:     { name: '성기사',        parent: 'knight',      desc: '신성한 가호로 체력과 회복이 더 늘어난다.',
                   mult: { hp: 1.25, regen: 1.35, dmg: 1.5 } },
    crusader:    { name: '십자군',        parent: 'knight',      desc: '방패를 든 채 돌격한다. 공격과 체력이 함께 오른다.',
                   mult: { dmg: 1.55, hp: 1.15 } },
    // ---- 광전사 ----
    warlord:     { name: '전쟁군주',      parent: 'berserker',   desc: '전장을 지휘한다. 공격력과 동료의 힘이 오른다.',
                   mult: { dmg: 1.2, comp: 1.1 } },
    destroyer:   { name: '파괴자',        parent: 'berserker',   desc: '모든 것을 부순다. 공격력이 크게 오르지만 몸이 상한다.',
                   mult: { dmg: 1.55, hp: 0.85 } },
    // ---- 저격수 ----
    deadeye:     { name: '명사수',        parent: 'sniper',      desc: '숨을 멈추고 쏜다. 공격력과 직접 공격이 강해진다.',
                   mult: { dmg: 1.45, click: 1.5 } },
    piercer:     { name: '관통사수',      parent: 'sniper',      desc: '갑옷을 뚫는 화살. 공격력과 연사가 함께 늘어난다.',
                   mult: { dmg: 1.32, aps: 1.15 } },
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
                   mult: { comp: 1.08, dmg: 1.05 } },
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
    seraph:        { name: '세라핌 기사',   parent: 'paladin',     desc: '날개 달린 수호자. 체력·회복과 함께 동료도 축복받는다.',
                     mult: { hp: 1.25, regen: 2.1, dmg: 1.95, comp: 1.08 } },
    holyking:      { name: '성왕',          parent: 'paladin',     desc: '신성한 왕. 공격·체력·골드가 고르게 오른다.',
                     mult: { dmg: 1.9, hp: 1.15, gold: 1.15, comp: 1.04 } },
    // ---- 십자군 ----
    inquisitor:    { name: '심판관',        parent: 'crusader',    desc: '죄를 심판하는 일격. 공격력과 직접 공격이 크게 오른다.',
                     mult: { dmg: 1.7, click: 1.5, comp: 1.04 } },
    templarlord:   { name: '성전 사령관',   parent: 'crusader',    desc: '성전을 이끄는 지휘관. 체력과 연사, 동료가 늘어난다.',
                     mult: { hp: 1.15, aps: 1.15, dmg: 1.7, comp: 1.04 } },
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
                     mult: { comp: 1.0, dmg: 1.0 } },
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

  // 5차 직업(64종). 4차 하나마다 2갈래로 갈라지는 마지막 전직. 이후로는 갈래 없이 '초월' 랭크만 붙는다(game.js).
  const ADVANCED5 = {
    // ---- 세라핌 기사 ----
    archangel:     { name: '대천사',            parent: 'seraph',        desc: '천상의 빛으로 아군 전체를 축복한다.',
                     mult: { hp: 1.3, regen: 1.3, dmg: 1.35, comp: 1.1 } },
    redeemer:      { name: '구원자',            parent: 'seraph',        desc: '단 한 번의 심판으로 모든 것을 정리한다.',
                     mult: { dmg: 1.6, hp: 1.15 } },
    // ---- 성왕 ----
    sunmonarch:    { name: '태양왕',            parent: 'holyking',      desc: '태양처럼 빛나는 왕의 위엄.',
                     mult: { dmg: 1.5, gold: 1.35 } },
    heavenlord:    { name: '천상의 지배자',     parent: 'holyking',      desc: '하늘과 땅을 함께 다스린다.',
                     mult: { dmg: 1.3, hp: 1.25, gold: 1.2 } },
    // ---- 심판관 ----
    condemner:     { name: '단죄자',            parent: 'inquisitor',    desc: '죄인을 가려내 즉시 단죄한다.',
                     mult: { dmg: 1.75, click: 1.2 } },
    judgment:      { name: '심판의 화신',       parent: 'inquisitor',    desc: '심판 그 자체가 되어 싸운다.',
                     mult: { dmg: 1.6, comp: 1.15 } },
    // ---- 성전 사령관 ----
    grandduke:     { name: '성전의 대공',       parent: 'templarlord',   desc: '성전을 지휘하는 대공.',
                     mult: { hp: 1.2, aps: 1.2, dmg: 1.4 } },
    immortalknight:{ name: '불멸의 기사',       parent: 'templarlord',   desc: '죽지 않는 기사, 끝없이 버틴다.',
                     mult: { hp: 1.4, dmg: 1.3 } },
    // ---- 정복왕 ----
    earthconqueror:{ name: '대지의 정복자',     parent: 'conqueror',     desc: '정복한 땅에서 끝없이 거둬들인다.',
                     mult: { dmg: 1.4, gold: 1.5 } },
    tyrant:        { name: '폭군',              parent: 'conqueror',     desc: '모든 것을 힘으로 굴복시킨다.',
                     mult: { dmg: 1.7, gold: 1.2 } },
    // ---- 군단장 ----
    legionfather:  { name: '군단의 아버지',     parent: 'hordelord',     desc: '거대한 군단을 낳고 이끈다.',
                     mult: { comp: 1.7, dmg: 1.2 } },
    allarmyking:   { name: '만군의 왕',         parent: 'hordelord',     desc: '만 개의 군대를 거느린 왕.',
                     mult: { comp: 1.5, dmg: 1.4 } },
    // ---- 파멸의 화신 ----
    apocalypse:    { name: '종말의 사도',       parent: 'avatarofruin',  desc: '스스로 종말이 되어 휩쓴다.',
                     mult: { dmg: 1.8, hp: 0.9 } },
    chaoslord:     { name: '혼돈의 군주',       parent: 'avatarofruin',  desc: '혼돈을 다스리는 군주.',
                     mult: { dmg: 1.6, hp: 1.1 } },
    // ---- 타이탄 ----
    colossus:      { name: '거신',              parent: 'titan',         desc: '산처럼 거대하고 굳건하다.',
                     mult: { hp: 1.6, dmg: 1.2 } },
    mountainlord:  { name: '산의 지배자',       parent: 'titan',         desc: '산맥 그 자체를 다스린다.',
                     mult: { hp: 1.4, dmg: 1.4 } },
    // ---- 신의 눈 ----
    farsight:      { name: '만리안',            parent: 'godeye',        desc: '만 리 밖도 꿰뚫어 본다.',
                     mult: { dmg: 2.0, click: 1.2 } },
    judgearrow:    { name: '심판의 화살',       parent: 'godeye',        desc: '심판을 실은 화살을 쏜다.',
                     mult: { dmg: 1.8, click: 1.4 } },
    // ---- 매의 눈 ----
    skyhawk:       { name: '천공의 매',         parent: 'hawkeye',       desc: '하늘에서 급강하하는 매.',
                     mult: { dmg: 1.7, aps: 1.3 } },
    stormsniper:   { name: '폭풍의 저격수',     parent: 'hawkeye',       desc: '폭풍 속에서도 빗나가지 않는다.',
                     mult: { dmg: 1.9, aps: 1.15 } },
    // ---- 공성 궁수 ----
    wallbreaker:   { name: '성벽 파괴자',       parent: 'siegearcher',   desc: '어떤 성벽도 뚫는다.',
                     mult: { dmg: 1.9, hp: 1.15 } },
    siegemaster:   { name: '공성의 대가',       parent: 'siegearcher',   desc: '공성전의 진정한 달인.',
                     mult: { dmg: 1.7, hp: 1.3 } },
    // ---- 용사냥꾼 ----
    dragonbane:    { name: '용의 재앙',         parent: 'dragonslayer',  desc: '용조차 두려워하는 사냥꾼.',
                     mult: { dmg: 2.0, gold: 1.2 } },
    legendhunter:  { name: '전설의 사냥꾼',     parent: 'dragonslayer',  desc: '전설이 된 사냥꾼.',
                     mult: { dmg: 1.7, gold: 1.4 } },
    // ---- 폭풍의 궁수 ----
    thunderavatar: { name: '번개의 현신',       parent: 'stormarcher',   desc: '번개 그 자체가 된다.',
                     mult: { aps: 1.5, dmg: 1.5 } },
    galeforce:     { name: '질풍노도',          parent: 'stormarcher',   desc: '거센 바람처럼 몰아친다.',
                     mult: { aps: 1.7, dmg: 1.3 } },
    // ---- 바람의 현자 ----
    windarchsage:  { name: '바람의 대현자',     parent: 'windsage',      desc: '바람의 이치를 깨우친 현자.',
                     mult: { aps: 1.3, regen: 1.3, hp: 1.2, dmg: 1.3 } },
    stormjudge:    { name: '폭풍의 심판자',     parent: 'windsage',      desc: '폭풍으로 심판을 내린다.',
                     mult: { aps: 1.4, dmg: 1.5 } },
    // ---- 늑대왕 ----
    primalwolf:    { name: '태초의 늑대',       parent: 'wolfking',      desc: '태초부터 존재한 늑대의 조상.',
                     mult: { comp: 1.6, aps: 1.15 } },
    packlord:      { name: '무리의 지배자',     parent: 'wolfking',      desc: '무리 전체를 지배한다.',
                     mult: { comp: 1.8 } },
    // ---- 숲의 수호자 ----
    ancientspirit: { name: '고대숲의 정령',     parent: 'forestwarden',  desc: '오래된 숲의 정령이 깃든다.',
                     mult: { comp: 1.4, hp: 1.4 } },
    naturejudge:   { name: '자연의 심판자',     parent: 'forestwarden',  desc: '자연의 이름으로 심판한다.',
                     mult: { comp: 1.3, hp: 1.3, dmg: 1.2 } },
    // ---- 화염 황제 ----
    firegod:       { name: '불꽃의 신',         parent: 'flameemperor',  desc: '불꽃 그 자체가 되어 군림한다.',
                     mult: { dmg: 2.0, click: 1.3 } },
    infernolord:   { name: '지옥불의 지배자',   parent: 'flameemperor',  desc: '지옥불을 다스리는 지배자.',
                     mult: { dmg: 1.8, click: 1.5 } },
    // ---- 유성술사 ----
    doomstar:      { name: '종말의 별',         parent: 'meteormage',    desc: '하늘에서 종말의 별을 부른다.',
                     mult: { dmg: 1.9, aps: 1.2 } },
    celestialbreaker:{ name: '천체 파괴자',     parent: 'meteormage',    desc: '천체마저 부수는 힘.',
                     mult: { dmg: 1.7, aps: 1.35 } },
    // ---- 불사조의 주인 ----
    eternalflame:  { name: '불멸의 화염',       parent: 'phoenixlord',   desc: '꺼지지 않는 불꽃으로 되살아난다.',
                     mult: { hp: 1.4, regen: 1.2, dmg: 1.5 } },
    rebirthlord:   { name: '재생의 군주',       parent: 'phoenixlord',   desc: '몇 번이든 다시 태어난다.',
                     mult: { hp: 1.6, regen: 1.3 } },
    // ---- 태양의 사제 ----
    sungodpriest:  { name: '태양신의 사제',     parent: 'sunpriest',     desc: '태양신을 섬기는 사제.',
                     mult: { hp: 1.3, gold: 1.3, dmg: 1.6 } },
    dawnsaint:     { name: '새벽의 성자',       parent: 'sunpriest',     desc: '새벽의 빛으로 축복한다.',
                     mult: { hp: 1.4, regen: 1.3, gold: 1.2 } },
    // ---- 리치왕 ----
    deathgrandduke:{ name: '죽음의 대공',       parent: 'lichking',      desc: '죽음을 다스리는 대공.',
                     mult: { comp: 1.2, dmg: 1.5 } },
    eternalking:   { name: '영원한 군주',       parent: 'lichking',      desc: '영원히 군림하는 언데드의 왕.',
                     mult: { comp: 1.3, dmg: 1.3 } },
    // ---- 영혼결속자 ----
    soullord:      { name: '영혼의 지배자',     parent: 'soulbinder',    desc: '수많은 영혼을 지배한다.',
                     mult: { comp: 1.15, hp: 1.4 } },
    thousandsouls: { name: '천 개의 영혼',      parent: 'soulbinder',    desc: '천 개의 영혼이 함께 싸운다.',
                     mult: { comp: 1.4, hp: 1.15 } },
    // ---- 죽음의 사신 ----
    endscythe:     { name: '종말의 낫',         parent: 'grimreaper',    desc: '낫 한 번에 끝을 낸다.',
                     mult: { gold: 1.5, dmg: 1.7 } },
    judgereaper:   { name: '심판의 사신',       parent: 'grimreaper',    desc: '심판을 내리는 죽음의 사신.',
                     mult: { gold: 1.3, dmg: 1.9 } },
    // ---- 뼈의 황제 ----
    skeletonking:  { name: '백골 군단의 왕',    parent: 'boneemperor',   desc: '백골 군단을 통솔하는 왕.',
                     mult: { comp: 1.7, gold: 1.3 } },
    tomblord:      { name: '무덤의 지배자',     parent: 'boneemperor',   desc: '무덤 전체를 다스린다.',
                     mult: { comp: 1.5, gold: 1.5 } },
    // ---- 공허의 자객 ----
    voidlord:      { name: '공허의 지배자',     parent: 'voidwalker',    desc: '공허 그 자체를 지배한다.',
                     mult: { dmg: 2.1, aps: 1.15 } },
    dimensionslayer:{ name: '차원의 살수',      parent: 'voidwalker',    desc: '차원을 넘나들며 벤다.',
                     mult: { dmg: 1.9, aps: 1.3 } },
    // ---- 환영 무사 ----
    thousandphantom:{ name: '천의 환영',        parent: 'phantom',       desc: '천 개의 환영으로 흩어진다.',
                     mult: { dmg: 1.9, hp: 1.3 } },
    phantomlord:   { name: '환영의 지배자',     parent: 'phantom',       desc: '환영을 지배하는 자.',
                     mult: { dmg: 2.1, hp: 1.1 } },
    // ---- 혈검객 ----
    bloodlord:     { name: '피의 군주',         parent: 'bloodblade',    desc: '피로 물든 군주.',
                     mult: { dmg: 1.6, gold: 1.4 } },
    slaughterer:   { name: '학살자',            parent: 'bloodblade',    desc: '멈추지 않는 학살자.',
                     mult: { dmg: 1.9, gold: 1.2 } },
    // ---- 닌자 대가 ----
    shadowgrandmaster:{ name: '그림자 종주',    parent: 'ninjamaster',   desc: '그림자 세계의 종주.',
                     mult: { aps: 1.4, dmg: 2.0, gold: 1.2 } },
    tenthousandninja:{ name: '만겁의 인자',     parent: 'ninjamaster',   desc: '만 명의 분신을 부린다.',
                     mult: { aps: 1.5, dmg: 1.8, gold: 1.3 } },
    // ---- 해왕 ----
    abysslord:     { name: '심해의 지배자',     parent: 'seaking',       desc: '심해 깊은 곳을 지배한다.',
                     mult: { gold: 1.5, comp: 2.0 } },
    stormseaking:  { name: '폭풍의 해왕',       parent: 'seaking',       desc: '폭풍우를 다스리는 바다의 왕.',
                     mult: { gold: 1.6, comp: 1.7 } },
    // ---- 유령선장 ----
    cursedfleetlord:{ name: '저주받은 함대의 주인', parent: 'ghostcaptain', desc: '저주받은 함대를 이끈다.',
                     mult: { gold: 1.4, comp: 1.6, hp: 1.2 } },
    deathvoyager:  { name: '죽음의 항해자',     parent: 'ghostcaptain',  desc: '죽음의 바다를 항해한다.',
                     mult: { gold: 1.5, comp: 1.5, hp: 1.15 } },
    // ---- 보물왕 ----
    goldenlord:    { name: '황금의 지배자',     parent: 'treasureking',  desc: '황금으로 세상을 뒤덮는다.',
                     mult: { gold: 1.9, dmg: 1.3 } },
    infinitehoard: { name: '무한 보고의 주인',  parent: 'treasureking',  desc: '끝없는 보물 창고의 주인.',
                     mult: { gold: 2.1, dmg: 1.15 } },
    // ---- 약탈군주 ----
    raidavatar:    { name: '약탈의 화신',       parent: 'raiderlord',    desc: '약탈 그 자체가 된다.',
                     mult: { gold: 1.5, dmg: 1.6 } },
    doomraider:    { name: '파멸의 약탈자',     parent: 'raiderlord',    desc: '파멸을 부르는 약탈자.',
                     mult: { gold: 1.3, dmg: 1.8 } },
  };

  const api = { ADVANCED3, ADVANCED4, ADVANCED5 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GoblinClasses = api;
})(typeof window !== 'undefined' ? window : globalThis);
