// 고블린 키우기 - 직업별 스킬과 공격 모션 데이터 (game.js가 불러 쓴다)
//
// 스킬: 직업(1~4차) 60개마다 스킬이 하나씩 있고, 전직할 때마다 그 직업의 스킬이 하나씩 쌓인다 (4차는 최대 4개).
// 스킬은 쿨타임이 차면 자동으로 쓴다. 위력은 효과 종류(KINDS)의 기본값에 직업 단계(TIER_POWER)를 곱해서 정한다.
// 공격 모션: 평타를 칠 때 어떤 모양으로 공격하는지 (칼 휘두르기, 표창 던지기, 마법구 쏘기 등). 화면 연출이 쓴다.
(function (root) {
  // ---- 효과 종류 ----
  //   cd 쿨타임(초) / base 1차 기준 위력 / dur 지속 시간(초) / hits 연타 횟수 / secs 소환 지속 시간 / cap 위력 상한
  const KINDS = {
    strike: { label: '강타',   icon: 'sword',  cd: 14, base: 3.0 },                 // 공격력 × 위력 만큼 한 번에 피해
    multi:  { label: '연타',   icon: 'burst',  cd: 12, base: 1.0, hits: 4 },         // 공격력 × 위력 만큼을 hits번 나눠 피해
    heal:   { label: '회복',   icon: 'heart',  cd: 25, base: 0.20, cap: 0.6 },      // 최대 체력의 (위력)만큼 회복. 체력이 70% 아래일 때만 씀
    haste:  { label: '가속',   icon: 'bolt',   cd: 18, base: 0.35, dur: 6 },        // 공격 속도 +위력 (dur초)
    might:  { label: '강화',   icon: 'arrowup', cd: 18, base: 0.30, dur: 6 },       // 공격력 +위력 (dur초)
    guard:  { label: '방어',   icon: 'shield', cd: 20, base: 0.30, dur: 6, cap: 0.8 }, // 받는 피해 -위력 (dur초). 체력이 85% 아래일 때만 씀
    greed:  { label: '약탈',   icon: 'coin',   cd: 24, base: 0.50, dur: 8 },        // 골드 획득 +위력 (dur초)
    summon: { label: '소환',   icon: 'party',  cd: 16, base: 1.0, secs: 6 },        // 동료(없으면 내 초당 피해의 일부)가 secs초 동안 낼 피해를 한 번에
  };
  // 직업 단계(1~4차)가 높을수록 같은 종류의 스킬이 강하다
  const TIER_POWER = { 1: 1, 2: 1.25, 3: 1.5, 4: 1.8 };

  // ---- 직업별 스킬 [이름, 효과 종류] ----
  const SKILLS = {
    // 1차
    warrior: ['용맹의 일격', 'strike'], archer: ['속사', 'haste'], mage: ['마나 집중', 'might'], rogue: ['표창 난사', 'multi'],
    // 2차
    knight: ['철벽 방어', 'guard'], berserker: ['분노', 'might'], sniper: ['헤드샷', 'strike'], ranger: ['동물 소환', 'summon'],
    pyromancer: ['화염 폭발', 'strike'], necromancer: ['해골 병사', 'summon'], assassin: ['급소 찌르기', 'strike'], pirate: ['약탈', 'greed'],
    // 3차
    paladin: ['신성한 치유', 'heal'], crusader: ['성전의 함성', 'might'], warlord: ['군단 호령', 'summon'], destroyer: ['대지 분쇄', 'strike'],
    deadeye: ['조준', 'might'], piercer: ['관통 화살', 'multi'], windwalker: ['질풍', 'haste'], beastmaster: ['맹수 습격', 'summon'],
    infernomage: ['지옥불', 'multi'], phoenixmage: ['불사조의 숨결', 'heal'], lich: ['죽음의 손길', 'strike'], soulreaper: ['영혼 수확', 'greed'],
    shade: ['그림자 은신', 'guard'], nightblade: ['초승달 베기', 'multi'], captain: ['포격', 'strike'], buccaneer: ['보물 사냥', 'greed'],
    // 4차
    seraph: ['천상의 가호', 'guard'], holyking: ['왕의 축복', 'might'], inquisitor: ['심판의 낙인', 'strike'], templarlord: ['성전 선포', 'haste'],
    conqueror: ['정복의 함성', 'greed'], hordelord: ['대군 소환', 'summon'], avatarofruin: ['파멸', 'strike'], titan: ['거인의 분노', 'might'],
    godeye: ['천안 사격', 'multi'], hawkeye: ['매의 급강하', 'strike'], siegearcher: ['공성 화살', 'strike'], dragonslayer: ['용 사냥', 'might'],
    stormarcher: ['번개 화살', 'multi'], windsage: ['바람의 치유', 'heal'], wolfking: ['늑대 무리', 'summon'], forestwarden: ['숲의 보호', 'guard'],
    flameemperor: ['화염 제국', 'strike'], meteormage: ['유성우', 'multi'], phoenixlord: ['부활의 불꽃', 'heal'], sunpriest: ['성스러운 광선', 'strike'],
    lichking: ['언데드 군단', 'summon'], soulbinder: ['영혼 방패', 'guard'], grimreaper: ['수확의 낫', 'strike'], boneemperor: ['뼈 군대', 'summon'],
    voidwalker: ['공허의 칼날', 'multi'], phantom: ['환영 분신', 'haste'], bloodblade: ['피의 갈증', 'might'], ninjamaster: ['분신술', 'multi'],
    seaking: ['해일', 'strike'], ghostcaptain: ['유령선 습격', 'summon'], treasureking: ['황금 비', 'greed'], raiderlord: ['약탈 강행', 'might'],
  };

  // 스킬 하나의 실제 수치. tier는 그 직업이 몇 차인지(1~4).
  function makeSkill(id, tier) {
    const entry = SKILLS[id];
    if (!entry) return null;
    const [name, kind] = entry;
    const k = KINDS[kind];
    let power = k.base * (TIER_POWER[tier] || 1);
    if (k.cap) power = Math.min(k.cap, power);
    return { id, name, kind, tier, power, cd: k.cd, dur: k.dur || 0, hits: k.hits || 0, secs: k.secs || 0, icon: k.icon, label: k.label };
  }

  // 사람이 읽는 설명 (수치는 위력에서 계산해서 넣는다)
  function describeSkill(sk) {
    const pct = (x) => Math.round(x * 100) + '%';
    const x = (v) => (Math.round(v * 10) / 10).toString();
    switch (sk.kind) {
      case 'strike': return `공격력 ×${x(sk.power)}의 강한 일격을 날려요.`;
      case 'multi': return `공격력 ×${x(sk.power)}씩 ${sk.hits}번 연달아 공격해요.`;
      case 'heal': return `체력이 70% 아래일 때 최대 체력의 ${pct(sk.power)}를 회복해요.`;
      case 'haste': return `${sk.dur}초 동안 공격 속도가 ${pct(sk.power)} 빨라져요.`;
      case 'might': return `${sk.dur}초 동안 공격력이 ${pct(sk.power)} 올라요.`;
      case 'guard': return `체력이 85% 아래일 때 ${sk.dur}초 동안 받는 피해가 ${pct(sk.power)} 줄어요.`;
      case 'greed': return `${sk.dur}초 동안 얻는 골드가 ${pct(sk.power)} 늘어요.`;
      case 'summon': return `동료를 불러 ${sk.secs}초 동안 낼 피해를 한 번에 입혀요.`;
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

  const api = { KINDS, TIER_POWER, SKILLS, makeSkill, describeSkill, ATTACK_STYLE, MELEE_STYLES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GoblinSkills = api;
})(typeof window !== 'undefined' ? window : globalThis);
