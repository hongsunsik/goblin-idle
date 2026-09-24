// 고블린 키우기 - 직업별 스킬과 공격 모션 데이터 (game.js가 불러 쓴다)
//
// 스킬: 직업(1~4차) 60개마다 스킬이 하나씩 있고, 전직할 때마다 그 직업의 스킬이 하나씩 쌓인다 (4차는 최대 4개).
// 스킬은 쿨타임이 차고 '상황이 맞으면' 자동으로 쓴다 (예: 방벽은 체력이 낮을 때, 보스 사냥은 보스가 나왔을 때, 처형은 몬스터 체력이 낮을 때).
// 위력은 효과 종류(KINDS)의 기본값에 직업 단계(TIER_POWER)를 곱해서 정한다.
// 공격 모션: 평타를 칠 때 어떤 모양으로 공격하는지 (칼 휘두르기, 표창 던지기, 마법구 쏘기 등). 화면 연출이 쓴다.
(function (root) {
  // ---- 효과 종류 (16가지) ----
  //   cd 쿨타임(초) / base 1차 기준 위력 / dur 지속 시간(초) / hits 연타 횟수 / secs 소환 지속 시간 / cap 위력 상한 / icon 그림이 없을 때 쓰는 기본 아이콘 / when 쓰는 상황(설명용)
  const KINDS = {
    // 즉시 피해
    strike:    { label: '강타',     icon: 'sword',   cd: 14, base: 3.0 },                       // 공격력 × 위력
    multi:     { label: '연타',     icon: 'burst',   cd: 12, base: 1.0, hits: 4 },              // 공격력 × 위력을 hits번
    execute:   { label: '처형',     icon: 'skull',   cd: 13, base: 7.0 },                       // 몬스터 체력이 40% 아래일 때만: 공격력 × 위력
    bossbane:  { label: '보스 사냥', icon: 'crown',   cd: 15, base: 9.0 },                       // 보스가 나왔을 때만: 공격력 × 위력
    summon:    { label: '소환',     icon: 'party',   cd: 16, base: 1.0, secs: 6 },               // 소환수가 secs초 동안 낼 피해(내 초당 피해의 30% 기준)를 한 번에
    dot:       { label: '지속 피해', icon: 'burst',   cd: 18, base: 0.4, dur: 8 },               // 몬스터 체력이 절반 넘을 때: dur초 동안 매초 (내 초당 피해 × 위력)
    // 공격 강화
    haste:     { label: '가속',     icon: 'bolt',    cd: 18, base: 0.35, dur: 6 },              // 공격 속도 +위력
    might:     { label: '강화',     icon: 'arrowup', cd: 18, base: 0.30, dur: 6 },              // 공격력 +위력
    frenzy:    { label: '광란',     icon: 'bolt',    cd: 30, base: 0.25, dur: 8 },              // 공격 속도와 공격력이 함께 +위력
    lifesteal: { label: '흡혈',     icon: 'heart',   cd: 22, base: 0.25, dur: 8 },              // 체력이 90% 아래일 때: 준 피해의 (위력)만큼 회복
    // 방어·회복
    heal:      { label: '회복',     icon: 'heart',   cd: 25, base: 0.20, cap: 0.6 },            // 체력이 70% 아래일 때: 최대 체력의 (위력) 회복
    guard:     { label: '방어',     icon: 'shield',  cd: 20, base: 0.30, dur: 6, cap: 0.8 },    // 체력이 85% 아래일 때: 받는 피해 -위력
    barrier:   { label: '방벽',     icon: 'shield',  cd: 24, base: 0.35, dur: 8 },              // 체력이 75% 아래일 때: 최대 체력의 (위력)만큼 피해를 대신 막아 줌
    stun:      { label: '기절',     icon: 'star',    cd: 22, base: 3.0, dur: 3, cap: 6 },       // 체력이 85% 아래일 때: 몬스터가 (위력)초 동안 공격하지 못함
    // 재화
    greed:     { label: '약탈',     icon: 'coin',    cd: 24, base: 0.50, dur: 8 },              // 골드 획득 +위력
    bounty:    { label: '전리품',   icon: 'pouch',   cd: 26, base: 6.0 },                       // 즉시 골드: 처치 골드 × 위력
  };
  // 직업 단계(1~5차)가 높을수록 같은 종류의 스킬이 강하다
  const TIER_POWER = { 1: 1, 2: 1.25, 3: 1.5, 4: 1.8, 5: 2.1 };

  // ---- 직업별 스킬 [이름, 효과 종류, (선택) 연출 종류] ----
  // 연출 종류는 지속 피해(dot)의 모양: burn 불, poison 독, void 공허, sun 태양
  const SKILLS = {
    // 1차
    warrior: ['용맹의 일격', 'strike'], archer: ['속사', 'haste'], mage: ['마법 화살', 'multi'], rogue: ['맹독 표창', 'dot', 'poison'],
    // 2차
    knight: ['수호의 방패', 'barrier'], berserker: ['흡혈 광란', 'lifesteal'], sniper: ['급소 저격', 'execute'], ranger: ['동물 소환', 'summon'],
    pyromancer: ['점화', 'dot', 'burn'], necromancer: ['해골 병사', 'summon'], assassin: ['암살', 'bossbane'], pirate: ['약탈', 'greed'],
    // 3차
    paladin: ['신성한 치유', 'heal'], crusader: ['성전의 함성', 'might'], warlord: ['전투 고양', 'frenzy'], destroyer: ['대지 분쇄', 'strike'],
    deadeye: ['거인 저격', 'bossbane'], piercer: ['관통 화살', 'multi'], windwalker: ['질풍', 'haste'], beastmaster: ['맹수 습격', 'summon'],
    infernomage: ['지옥불 폭격', 'strike'], phoenixmage: ['불사조의 깃털', 'barrier'], lich: ['생명 흡수', 'lifesteal'], soulreaper: ['영혼 수확', 'execute'],
    shade: ['그림자 결박', 'stun'], nightblade: ['초승달 베기', 'multi'], captain: ['포격', 'strike'], buccaneer: ['보물 사냥', 'bounty'],
    // 4차
    seraph: ['천상의 가호', 'guard'], holyking: ['왕의 축복', 'might'], inquisitor: ['속박의 낙인', 'stun'], templarlord: ['성전 선포', 'haste'],
    conqueror: ['정복 전리품', 'bounty'], hordelord: ['대군 소환', 'summon'], avatarofruin: ['파멸의 일격', 'bossbane'], titan: ['거인의 분노', 'frenzy'],
    godeye: ['천안 사격', 'multi'], hawkeye: ['매의 급강하', 'execute'], siegearcher: ['공성 화살', 'strike'], dragonslayer: ['용 사냥', 'bossbane'],
    stormarcher: ['번개 화살', 'multi'], windsage: ['바람의 치유', 'heal'], wolfking: ['늑대 무리', 'summon'], forestwarden: ['숲의 방벽', 'barrier'],
    flameemperor: ['화염 제국', 'strike'], meteormage: ['유성우', 'multi'], phoenixlord: ['부활의 불꽃', 'heal'], sunpriest: ['태양의 낙인', 'dot', 'sun'],
    lichking: ['언데드 군단', 'summon'], soulbinder: ['영혼 방벽', 'barrier'], grimreaper: ['수확의 낫', 'execute'], boneemperor: ['뼈 군대', 'summon'],
    voidwalker: ['공허 침식', 'dot', 'void'], phantom: ['환영 분신', 'haste'], bloodblade: ['흡혈의 칼날', 'lifesteal'], ninjamaster: ['분신술', 'multi'],
    seaking: ['해일', 'strike'], ghostcaptain: ['유령선 습격', 'summon'], treasureking: ['황금 비', 'bounty'], raiderlord: ['약탈 강행', 'frenzy'],
    // 5차
    archangel: ['천상의 축복', 'guard'], redeemer: ['최후의 심판', 'execute'], sunmonarch: ['태양의 칙령', 'might'], heavenlord: ['천지 지배', 'frenzy'],
    condemner: ['단죄의 낙인', 'stun'], judgment: ['심판 강림', 'bossbane'], grandduke: ['성전 돌격', 'haste'], immortalknight: ['불멸의 의지', 'barrier'],
    earthconqueror: ['정복의 함성', 'bounty'], tyrant: ['폭군의 철퇴', 'strike'], legionfather: ['군단 소환', 'summon'], allarmyking: ['만군 집결', 'summon'],
    apocalypse: ['종말 강림', 'bossbane'], chaoslord: ['혼돈의 힘', 'frenzy'], colossus: ['대지 강타', 'strike'], mountainlord: ['산사태', 'multi'],
    farsight: ['천리안 조준', 'execute'], judgearrow: ['심판의 화살', 'bossbane'], skyhawk: ['급강하', 'haste'], stormsniper: ['폭풍 저격', 'multi'],
    wallbreaker: ['성벽 관통', 'strike'], siegemaster: ['공성 사격', 'multi'], dragonbane: ['용살', 'bossbane'], legendhunter: ['전설의 일격', 'execute'],
    thunderavatar: ['벼락 강림', 'multi'], galeforce: ['질풍 연사', 'haste'], windarchsage: ['바람의 축복', 'heal'], stormjudge: ['폭풍 심판', 'multi'],
    primalwolf: ['늑대 무리 소환', 'summon'], packlord: ['무리의 포효', 'frenzy'], ancientspirit: ['숲의 가호', 'barrier'], naturejudge: ['자연의 심판', 'dot', 'poison'],
    firegod: ['화염 강림', 'strike'], infernolord: ['지옥불 폭발', 'dot', 'burn'], doomstar: ['운석 낙하', 'multi'], celestialbreaker: ['천체 파괴', 'strike'],
    eternalflame: ['불사의 불꽃', 'heal'], rebirthlord: ['재생', 'lifesteal'], sungodpriest: ['태양의 심판', 'dot', 'sun'], dawnsaint: ['새벽의 축복', 'heal'],
    deathgrandduke: ['죽음의 선고', 'execute'], eternalking: ['영원한 군세', 'summon'], soullord: ['영혼 지배', 'lifesteal'], thousandsouls: ['천 영혼의 함성', 'summon'],
    endscythe: ['종말의 낫질', 'execute'], judgereaper: ['사신의 심판', 'bossbane'], skeletonking: ['백골 군단', 'summon'], tomblord: ['무덤의 저주', 'dot', 'void'],
    voidlord: ['공허 지배', 'dot', 'void'], dimensionslayer: ['차원 베기', 'multi'], thousandphantom: ['천 개의 환영', 'haste'], phantomlord: ['환영 지배', 'stun'],
    bloodlord: ['피의 학살', 'lifesteal'], slaughterer: ['멈추지 않는 학살', 'multi'], shadowgrandmaster: ['그림자 지배', 'multi'], tenthousandninja: ['만겁 분신술', 'multi'],
    abysslord: ['심해 소환', 'summon'], stormseaking: ['폭풍우 지배', 'frenzy'], cursedfleetlord: ['저주받은 함대', 'summon'], deathvoyager: ['죽음의 항해', 'bounty'],
    goldenlord: ['황금비', 'bounty'], infinitehoard: ['무한한 보고', 'bounty'], raidavatar: ['약탈의 화신', 'greed'], doomraider: ['파멸의 약탈', 'frenzy'],
  };

  // 스킬 하나의 실제 수치. tier는 그 직업이 몇 차인지(1~4).
  function makeSkill(id, tier) {
    const entry = SKILLS[id];
    if (!entry) return null;
    const [name, kind, variant] = entry;
    const k = KINDS[kind];
    let power = k.base * (TIER_POWER[tier] || 1);
    if (k.cap) power = Math.min(k.cap, power);
    return { id, name, kind, variant: variant || '', tier, power, cd: k.cd, dur: k.dur || 0, hits: k.hits || 0, secs: k.secs || 0, icon: k.icon, label: k.label };
  }

  // 사람이 읽는 설명 (수치는 위력에서 계산해서 넣는다)
  function describeSkill(sk) {
    const pct = (x) => Math.round(x * 100) + '%';
    const x = (v) => (Math.round(v * 10) / 10).toString();
    switch (sk.kind) {
      case 'strike': return `공격력 ×${x(sk.power)}의 강한 일격을 날려요.`;
      case 'multi': return `공격력 ×${x(sk.power)}씩 ${sk.hits}번 연달아 공격해요.`;
      case 'execute': return `몬스터 체력이 40% 아래일 때 공격력 ×${x(sk.power)}로 마무리해요.`;
      case 'bossbane': return `보스가 나타나면 공격력 ×${x(sk.power)}의 큰 피해를 줘요.`;
      case 'summon': return `소환수를 불러 ${sk.secs}초 동안 낼 피해(내 초당 피해의 ${Math.round(30 * sk.power)}%)를 한 번에 입혀요.`;
      case 'dot': return `몬스터를 ${sk.variant === 'poison' ? '중독' : sk.variant === 'burn' ? '불태워' : sk.variant === 'void' ? '공허로 침식해' : '태양으로 지져'} ${sk.dur}초 동안 매초 내 초당 피해의 ${pct(sk.power)}만큼 피해를 줘요.`;
      case 'haste': return `${sk.dur}초 동안 공격 속도가 ${pct(sk.power)} 빨라져요.`;
      case 'might': return `${sk.dur}초 동안 공격력이 ${pct(sk.power)} 올라요.`;
      case 'frenzy': return `${sk.dur}초 동안 공격 속도와 공격력이 함께 ${pct(sk.power)} 올라요.`;
      case 'lifesteal': return `체력이 90% 아래일 때 ${sk.dur}초 동안 준 피해의 ${pct(sk.power)}만큼 체력을 회복해요.`;
      case 'heal': return `체력이 70% 아래일 때 최대 체력의 ${pct(sk.power)}를 회복해요.`;
      case 'guard': return `체력이 85% 아래일 때 ${sk.dur}초 동안 받는 피해가 ${pct(sk.power)} 줄어요.`;
      case 'barrier': return `체력이 75% 아래일 때 최대 체력의 ${pct(sk.power)}만큼 피해를 대신 막는 방벽을 ${sk.dur}초 동안 펼쳐요.`;
      case 'stun': return `체력이 85% 아래일 때 몬스터를 ${x(sk.power)}초 동안 꼼짝 못 하게 해요.`;
      case 'greed': return `${sk.dur}초 동안 얻는 골드가 ${pct(sk.power)} 늘어요.`;
      case 'bounty': return `처치 골드의 ${x(sk.power)}배를 즉시 얻어요.`;
      default: return '';
    }
  }

  // ---- 평타 공격 모션 ----
  // 근접: slash 칼, axe 도끼, hammer 망치, holy 성스러운 검, dagger 단검
  // 원거리: arrow 화살, bolt 석궁, bullet 총, orb 마법구, fire 화염구, dark 어둠 마법, shuriken 표창, coin 동전
  const MELEE_STYLES = ['slash', 'axe', 'hammer', 'holy', 'dagger'];
  // 직업 id → 공격 모션. 없으면 가장 가까운 윗단계 직업의 모션을 따른다 (견습은 몽둥이 = slash).
  const ATTACK_STYLE = {
    novice: 'slash',
    warrior: 'slash', archer: 'arrow', mage: 'orb', rogue: 'shuriken',
    knight: 'slash', berserker: 'axe', sniper: 'bullet', ranger: 'arrow', pyromancer: 'fire', necromancer: 'dark', assassin: 'dagger', pirate: 'coin',
    paladin: 'holy', piercer: 'bolt', infernomage: 'fire', phoenixmage: 'fire', lich: 'dark', soulreaper: 'slash',
    shade: 'dagger', nightblade: 'shuriken', buccaneer: 'coin', captain: 'slash',
    seraph: 'holy', holyking: 'holy', inquisitor: 'hammer', titan: 'hammer', godeye: 'bullet', ninjamaster: 'shuriken', treasureking: 'coin',
    flameemperor: 'fire', phoenixlord: 'fire', lichking: 'dark', boneemperor: 'dark',
  };

  // 전투 이펙트 스프라이트 이름 (images/vfx/이름.webp). tools/generate-images.py의 VFX와 같아야 한다.
  const VFX_NAMES = ['slash_white', 'slash_gold', 'slash_fire', 'slash_dark', 'claw_slash', 'impact_burst', 'explosion_fire', 'explosion_magic', 'lightning',
    'heal_light', 'shield_bubble', 'magic_circle', 'summon_circle', 'coin_burst', 'poison_cloud', 'stun_stars', 'wind_swirl', 'rage_aura',
    'swing_sword', 'swing_axe', 'swing_holy', 'swing_hammer', 'thrust_dagger'];

  const api = { VFX_NAMES, KINDS, TIER_POWER, SKILLS, makeSkill, describeSkill, ATTACK_STYLE, MELEE_STYLES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GoblinSkills = api;
})(typeof window !== 'undefined' ? window : globalThis);
