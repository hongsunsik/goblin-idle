// 그림 (SVG). 이모지 대신 코드로 직접 그린 만화 스타일 그림이다: 고블린 13종, 몬스터 13종, 아이콘 세트.
// 외부 이미지 없이 코드만으로 만들고, 그림자 면(셀 셰이딩)을 얹어 애니메이션 채색 느낌을 낸다.
(function (root) {
  // ---- 이미지 폴더 (images/) ----
  // images/manifest.js(tools/make-manifest.js가 만든다)에 적힌 파일이 있으면 그 이미지를 쓰고, 없으면 아래의 SVG 그림을 그대로 쓴다.
  // manifest 형식: { v, goblins: { knight: 'knight.png' }, monsters: {...}, icons: {...}, backgrounds: { biome0: '...' } }
  const IMG_DIR = 'images/';
  const M = Object.assign({ v: 0, goblins: {}, monsters: {}, icons: {}, backgrounds: {}, gear: {}, skills: {}, vfx: {} }, root.ART_MANIFEST || {});
  const has = (cat, name) => (M[cat] && M[cat][name]) || '';
  // manifest 값은 images/ 기준 경로 (예: 'goblins/knight.png'). ?v= 는 그림을 바꿨을 때 브라우저 캐시를 피하려는 값.
  const src = (file) => IMG_DIR + file + (M.v ? '?v=' + M.v : '');
  const SKIN = '#7fc241';
  const SKIN_D = '#4f8a25';
  const SKIN_L = '#a8de6b';
  const LINE = '#2b4f12';

  // 별 모양 (마법사 모자 장식)
  const STAR = 'points="60,15 62.2,20.5 68,21 63.6,24.8 65,30.5 60,27.5 55,30.5 56.4,24.8 52,21 57.8,20.5"';

  // 모자·옷·무기 등 직업별 겉모습. 그리는 순서: back → legs → body → (팔) → 머리 → hat → face → off → weapon
  const LOOKS = {
    // 견습 고블린
    novice: {
      legs: '#5a3a1a',
      body: `<path d="M42 100 L78 100 L73 118 L60 112 L47 118 Z" fill="#8b5a2b" stroke="#4a2f14" stroke-width="2"/>`,
      hat: `<path d="M29 42 Q60 26 91 42 L91 49 Q60 35 29 49 Z" fill="#c0392b" stroke="#7d2018" stroke-width="1.5"/>
            <path d="M88 44 L104 52 L96 56 Z" fill="#c0392b"/>`,
      weapon: `<g transform="rotate(20 88 105)"><rect x="85" y="60" width="7" height="48" rx="3" fill="#9c6b3a" stroke="#5a3a1a" stroke-width="1.5"/><ellipse cx="88.5" cy="60" rx="8.5" ry="12" fill="#b07b45" stroke="#5a3a1a" stroke-width="1.5"/></g>`,
    },
    // 전사
    warrior: {
      legs: '#4b5560',
      body: `<path d="M39 82 Q60 73 81 82 L79 106 Q60 113 41 106 Z" fill="#9aa5b1" stroke="#4b5560" stroke-width="2"/>
             <rect x="39" y="99" width="42" height="6" fill="#6b4a2a"/><rect x="56" y="98" width="8" height="8" rx="1" fill="#e2b93b"/>`,
      hat: `<path d="M27 47 Q28 14 60 12 Q92 14 93 47 L85 45 Q60 34 35 45 Z" fill="#aab4bf" stroke="#4b5560" stroke-width="2"/>
            <path d="M55 15 L60 2 L65 15 Z" fill="#d5dbe1" stroke="#4b5560" stroke-width="1.5"/>
            <path d="M24 44 L34 38 L34 52 Z M96 44 L86 38 L86 52 Z" fill="#8c97a3"/>`,
      off: `<circle cx="26" cy="100" r="17" fill="#8b5a2b" stroke="#3d2a14" stroke-width="2.5"/><circle cx="26" cy="100" r="6" fill="#aab4bf" stroke="#4b5560" stroke-width="1.5"/>
            <path d="M26 84 L26 116 M10 100 L42 100" stroke="#3d2a14" stroke-width="1.5" opacity=".6"/>`,
      weapon: `<g transform="rotate(12 90 104)"><rect x="87" y="42" width="7" height="58" fill="#dfe6ee" stroke="#5c6772" stroke-width="1.5"/><path d="M87 42 L90.5 33 L94 42 Z" fill="#dfe6ee" stroke="#5c6772" stroke-width="1.5"/><rect x="81" y="99" width="19" height="5" rx="2" fill="#c9962b"/><rect x="88" y="104" width="5" height="10" fill="#5a3a1a"/></g>`,
    },
    // 궁수
    archer: {
      legs: '#5a3a1a',
      back: `<g transform="rotate(25 88 78)"><rect x="82" y="60" width="11" height="32" rx="3" fill="#6b4a2a" stroke="#3d2a14" stroke-width="1.5"/><path d="M84 58 L86 50 L88 58 M88 58 L90 49 L92 58" stroke="#e8d9a8" stroke-width="2" fill="none"/></g>`,
      body: `<path d="M40 82 Q60 75 80 82 L79 106 Q60 113 41 106 Z" fill="#5a9c4a" stroke="#2b5a24" stroke-width="2"/><rect x="40" y="100" width="40" height="5" fill="#6b4a2a"/>`,
      hat: `<path d="M25 51 Q26 13 60 11 Q94 13 95 51 Q78 33 60 35 Q42 33 25 51 Z" fill="#3f7d3a" stroke="#22491f" stroke-width="2"/>
            <path d="M82 20 Q104 6 112 22 Q96 20 88 32 Z" fill="#e94b4b" stroke="#a02a2a" stroke-width="1.5"/>`,
      weapon: `<path d="M97 52 Q122 82 97 114" stroke="#8b5a2b" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M97 52 L97 114" stroke="#f1f1f1" stroke-width="1.3"/><path d="M60 84 L100 84" stroke="#e8d9a8" stroke-width="2" opacity="0"/>`,
    },
    // 마법사
    mage: {
      legs: '#3a1f7a',
      body: `<path d="M37 80 Q60 71 83 80 L92 121 Q60 130 28 121 Z" fill="#6c3fc4" stroke="#3a1f7a" stroke-width="2"/>
             <path d="M45 84 Q60 92 75 84" stroke="#ffd54a" stroke-width="3" fill="none"/><circle cx="60" cy="100" r="3" fill="#ffd54a"/>`,
      hat: `<ellipse cx="60" cy="33" rx="40" ry="9" fill="#5b32b0" stroke="#33196b" stroke-width="2"/>
            <path d="M34 33 Q44 12 74 -6 Q66 16 86 33 Z" fill="#6c3fc4" stroke="#33196b" stroke-width="2"/>
            <polygon ${STAR} transform="translate(0 -1)" fill="#ffd54a" stroke="#c99a1a" stroke-width=".8"/>`,
      weapon: `<rect x="91" y="42" width="6" height="76" rx="3" fill="#8b5a2b" stroke="#4a2f14" stroke-width="1.5"/>
               <circle cx="94" cy="36" r="10" fill="#5be3ff" stroke="#1b6d80" stroke-width="2"/><circle cx="91" cy="33" r="3.2" fill="#fff" opacity=".85"/>
               <circle cx="94" cy="36" r="15" fill="none" stroke="#5be3ff" stroke-width="1.5" opacity=".45"/>`,
    },
    // 도적
    rogue: {
      legs: '#2a2a35',
      body: `<path d="M40 82 Q60 75 80 82 L79 106 Q60 113 41 106 Z" fill="#3b3b4a" stroke="#15151b" stroke-width="2"/><path d="M42 84 L78 105" stroke="#a07a3a" stroke-width="4"/><rect x="40" y="100" width="40" height="5" fill="#15151b"/>`,
      hat: `<path d="M25 52 Q26 13 60 11 Q94 13 95 52 Q78 34 60 36 Q42 34 25 52 Z" fill="#33333f" stroke="#15151b" stroke-width="2"/>`,
      face: `<path d="M35 65 Q60 60 85 65 Q83 82 60 86 Q37 82 35 65 Z" fill="#2a2a35" stroke="#15151b" stroke-width="2"/>`,
      off: `<g transform="rotate(-22 30 104)"><path d="M28 74 L32 74 L33 100 L27 100 Z" fill="#dfe6ee" stroke="#5c6772" stroke-width="1.5"/><rect x="25" y="99" width="10" height="4" fill="#5a3a1a"/><rect x="28" y="103" width="4" height="8" fill="#15151b"/></g>`,
      weapon: `<g transform="rotate(22 90 104)"><path d="M88 74 L92 74 L93 100 L87 100 Z" fill="#dfe6ee" stroke="#5c6772" stroke-width="1.5"/><rect x="85" y="99" width="10" height="4" fill="#5a3a1a"/><rect x="88" y="103" width="4" height="8" fill="#15151b"/></g>`,
    },

    // ---- 2차 전직 ----
    // 기사 (전사 → 방어형)
    knight: {
      legs: '#4b5560',
      back: `<path d="M30 76 Q60 66 90 76 L98 124 Q60 116 22 124 Z" fill="#b3322c" stroke="#6e1a16" stroke-width="2"/>`,
      body: `<path d="M38 82 Q60 72 82 82 L80 107 Q60 114 40 107 Z" fill="#c9d2dc" stroke="#d4a72c" stroke-width="2.5"/>
             <path d="M60 78 L60 110" stroke="#d4a72c" stroke-width="2"/><rect x="38" y="99" width="44" height="6" fill="#d4a72c"/>`,
      hat: `<path d="M27 47 Q28 12 60 10 Q92 12 93 47 L85 45 Q60 34 35 45 Z" fill="#d7dee6" stroke="#d4a72c" stroke-width="2.5"/>
            <path d="M58 12 Q86 -6 92 22 Q76 14 62 20 Z" fill="#d63a3a" stroke="#8a2020" stroke-width="1.5"/>
            <path d="M24 44 L34 38 L34 52 Z M96 44 L86 38 L86 52 Z" fill="#d4a72c"/>`,
      off: `<path d="M10 82 L42 82 L42 106 Q26 128 10 106 Z" fill="#2f5bd0" stroke="#d4a72c" stroke-width="3"/><path d="M26 86 L26 114 M15 96 L37 96" stroke="#f4d35e" stroke-width="4"/>`,
      weapon: `<g transform="rotate(10 90 104)"><rect x="86" y="34" width="9" height="66" fill="#eef3f8" stroke="#5c6772" stroke-width="1.5"/><path d="M86 34 L90.5 22 L95 34 Z" fill="#eef3f8" stroke="#5c6772" stroke-width="1.5"/><rect x="79" y="99" width="23" height="6" rx="2" fill="#d4a72c"/><rect x="88" y="105" width="5" height="10" fill="#5a3a1a"/></g>`,
    },
    // 광전사 (전사 → 공격형)
    berserker: {
      legs: '#6b4a2a',
      body: `<path d="M42 102 L78 102 L74 120 L60 114 L46 120 Z" fill="#7a5230" stroke="#3d2a14" stroke-width="2"/><ellipse cx="34" cy="80" rx="12" ry="8" fill="#8b6b4a" stroke="#4a3a24" stroke-width="1.5"/><ellipse cx="86" cy="80" rx="12" ry="8" fill="#8b6b4a" stroke="#4a3a24" stroke-width="1.5"/>
             <path d="M46 86 L52 96 M70 86 L64 96 M58 92 L58 102" stroke="#b3322c" stroke-width="3" stroke-linecap="round"/>`,
      hat: `<path d="M48 26 L54 6 L60 22 L66 4 L72 24 Z" fill="#c0392b" stroke="#7d2018" stroke-width="1.5"/>`,
      face: `<path d="M36 42 L45 57 M84 42 L75 57 M55 62 L65 62" stroke="#c0392b" stroke-width="3.2" stroke-linecap="round"/>`,
      weapon: `<g transform="rotate(14 90 104)"><rect x="88" y="34" width="5" height="78" fill="#6b4a2a" stroke="#3d2a14" stroke-width="1.2"/><path d="M90.5 36 Q66 30 69 60 Q81 57 90.5 66 Z" fill="#c4ccd4" stroke="#4b5560" stroke-width="1.8"/><path d="M90.5 36 Q115 30 112 60 Q100 57 90.5 66 Z" fill="#c4ccd4" stroke="#4b5560" stroke-width="1.8"/></g>`,
    },
    // 저격수 (궁수 → 공격형)
    sniper: {
      legs: '#3d2a14',
      body: `<path d="M40 82 Q60 75 80 82 L79 106 Q60 113 41 106 Z" fill="#7a6a3a" stroke="#3d3418" stroke-width="2"/><rect x="40" y="100" width="40" height="5" fill="#3d2a14"/><rect x="44" y="90" width="7" height="8" fill="#3d2a14"/><rect x="69" y="90" width="7" height="8" fill="#3d2a14"/>`,
      hat: `<ellipse cx="60" cy="30" rx="42" ry="8" fill="#5b4a26" stroke="#2e2510" stroke-width="2"/><path d="M34 30 Q34 8 60 8 Q86 8 86 30 Z" fill="#6b5a30" stroke="#2e2510" stroke-width="2"/><rect x="34" y="24" width="52" height="5" fill="#2e2510"/>`,
      face: `<circle cx="73" cy="49" r="11.5" fill="rgba(120,220,255,.25)" stroke="#333" stroke-width="3"/><path d="M84 49 L100 44" stroke="#333" stroke-width="3"/>`,
      weapon: `<rect x="62" y="90" width="52" height="7" rx="3" fill="#6b4a2a" stroke="#3d2a14" stroke-width="1.5"/><path d="M102 74 Q118 94 102 114" stroke="#444" stroke-width="4.5" fill="none" stroke-linecap="round"/><path d="M102 74 L88 94 L102 114" stroke="#eee" stroke-width="1.2" fill="none"/><rect x="72" y="83" width="18" height="6" rx="2" fill="#333"/><path d="M66 93 L112 93" stroke="#e8d9a8" stroke-width="2.5"/>`,
    },
    // 레인저 (궁수 → 속도/동료형)
    ranger: {
      legs: '#3d5a1f',
      back: `<path d="M26 74 Q60 64 94 74 L96 118 Q60 110 24 118 Z" fill="#2f6b34" stroke="#173d1a" stroke-width="2"/>`,
      body: `<path d="M40 82 Q60 75 80 82 L79 106 Q60 113 41 106 Z" fill="#7fc25a" stroke="#2b5a24" stroke-width="2"/><path d="M44 90 l4 -3 l4 3 M68 96 l4 -3 l4 3" stroke="#2b5a24" stroke-width="2" fill="none"/>`,
      hat: `<path d="M25 51 Q26 12 60 10 Q94 12 95 51 Q78 33 60 35 Q42 33 25 51 Z" fill="#2f6b34" stroke="#173d1a" stroke-width="2"/>
            <path d="M32 30 Q26 20 34 14 Q40 22 38 30 Z M50 18 Q46 8 56 4 Q60 14 56 20 Z M70 18 Q74 6 84 8 Q84 18 76 22 Z" fill="#8fdc5c" stroke="#3d7a2a" stroke-width="1.2"/>`,
      weapon: `<path d="M96 46 Q126 82 96 118" stroke="#8b5a2b" stroke-width="5.5" fill="none" stroke-linecap="round"/><path d="M96 46 L96 118" stroke="#9dff7a" stroke-width="1.8"/><path d="M96 46 Q126 82 96 118" stroke="#9dff7a" stroke-width="1.5" fill="none" opacity=".5" transform="translate(3 0)"/><circle cx="96" cy="82" r="4" fill="#9dff7a" opacity=".8"/>`,
    },
    // 화염술사 (마법사 → 공격/클릭형)
    pyromancer: {
      legs: '#8a2a10',
      body: `<path d="M37 80 Q60 71 83 80 L92 121 Q60 130 28 121 Z" fill="#d6431f" stroke="#7a1f0a" stroke-width="2"/><path d="M45 84 Q60 92 75 84" stroke="#ffd54a" stroke-width="3" fill="none"/><path d="M50 108 Q60 98 70 108" stroke="#ffb02e" stroke-width="3" fill="none"/>`,
      hat: `<ellipse cx="60" cy="33" rx="40" ry="9" fill="#a5300f" stroke="#5a1806" stroke-width="2"/><path d="M34 33 Q46 10 78 -2 Q68 16 86 33 Z" fill="#d6431f" stroke="#5a1806" stroke-width="2"/><path d="M66 6 Q60 -4 68 -10 Q72 -2 76 4 Q72 8 66 6 Z" fill="#ffb02e"/>`,
      weapon: `<rect x="91" y="46" width="6" height="72" rx="3" fill="#5a3a1a" stroke="#2e1c0a" stroke-width="1.5"/><circle cx="94" cy="40" r="10" fill="#ff7a1a" stroke="#a5300f" stroke-width="2"/><path d="M94 22 Q86 32 90 38 Q92 32 94 34 Q96 30 100 36 Q104 28 94 22 Z" fill="#ffd54a"/><circle cx="94" cy="41" r="4" fill="#fff3a0"/>`,
    },
    // 사령술사 (마법사 → 동료형)
    necromancer: {
      legs: '#1c1830',
      back: `<circle cx="60" cy="70" r="46" fill="#9b5cff" opacity=".18"/>`,
      body: `<path d="M37 80 Q60 71 83 80 L92 121 Q60 130 28 121 Z" fill="#2b2540" stroke="#120f22" stroke-width="2"/><path d="M60 78 L60 122" stroke="#7a52c8" stroke-width="2"/><circle cx="60" cy="96" r="5" fill="#b9ff8a" opacity=".85"/>`,
      hat: `<path d="M24 52 Q26 10 60 8 Q94 10 96 52 Q78 32 60 34 Q42 32 24 52 Z" fill="#2b2540" stroke="#120f22" stroke-width="2"/><path d="M52 12 Q60 4 68 12" stroke="#7a52c8" stroke-width="2" fill="none"/>`,
      weapon: `<rect x="91" y="50" width="6" height="68" rx="3" fill="#3a2f55" stroke="#120f22" stroke-width="1.5"/><circle cx="94" cy="40" r="11" fill="#eef2e6" stroke="#4a5a3a" stroke-width="2"/><circle cx="90" cy="38" r="3" fill="#1c1830"/><circle cx="98" cy="38" r="3" fill="#1c1830"/><path d="M91 46 L97 46" stroke="#1c1830" stroke-width="2"/><circle cx="94" cy="40" r="17" fill="none" stroke="#b9ff8a" stroke-width="1.8" opacity=".5"/>`,
    },
    // 암살자 (도적 → 공격형)
    assassin: {
      legs: '#15151b',
      back: `<path d="M28 76 Q60 66 92 76 L88 118 Q60 108 32 118 Z" fill="#1c1c26" stroke="#0a0a0e" stroke-width="2"/>`,
      body: `<path d="M40 82 Q60 75 80 82 L79 106 Q60 113 41 106 Z" fill="#23232e" stroke="#0a0a0e" stroke-width="2"/><path d="M42 84 L78 105" stroke="#b3322c" stroke-width="4"/><rect x="40" y="100" width="40" height="5" fill="#0a0a0e"/>`,
      hat: `<path d="M24 54 Q26 10 60 8 Q94 10 96 54 Q78 34 60 36 Q42 34 24 54 Z" fill="#23232e" stroke="#0a0a0e" stroke-width="2"/>`,
      face: `<path d="M35 65 Q60 60 85 65 Q83 82 60 86 Q37 82 35 65 Z" fill="#1c1c26" stroke="#0a0a0e" stroke-width="2"/><ellipse cx="48" cy="51" rx="6.4" ry="8.2" fill="#ff3b3b" opacity=".9"/><ellipse cx="74" cy="51" rx="6.4" ry="8.2" fill="#ff3b3b" opacity=".9"/><ellipse cx="48" cy="51.5" rx="2.4" ry="5.2" fill="#22060a"/><ellipse cx="74" cy="51.5" rx="2.4" ry="5.2" fill="#22060a"/>`,
      off: `<g transform="rotate(-24 30 104)"><path d="M28 70 Q24 84 32 100 L27 100 Q22 84 26 70 Z" fill="#cfd6dd" stroke="#4b5560" stroke-width="1.3"/><path d="M28 70 Q20 62 28 56 Q32 66 28 70 Z" fill="#b3322c"/><rect x="25" y="99" width="10" height="4" fill="#0a0a0e"/><rect x="28" y="103" width="4" height="8" fill="#b3322c"/></g>`,
      weapon: `<g transform="rotate(24 90 104)"><path d="M92 70 Q96 84 88 100 L93 100 Q98 84 94 70 Z" fill="#cfd6dd" stroke="#4b5560" stroke-width="1.3"/><path d="M92 70 Q100 62 92 56 Q88 66 92 70 Z" fill="#b3322c"/><rect x="85" y="99" width="10" height="4" fill="#0a0a0e"/><rect x="88" y="103" width="4" height="8" fill="#b3322c"/></g>`,
    },
    // 해적 (도적 → 골드형)
    pirate: {
      legs: '#3a2a4a',
      body: `<path d="M38 82 Q60 73 82 82 L81 108 Q60 115 39 108 Z" fill="#b3322c" stroke="#6e1a16" stroke-width="2"/><circle cx="52" cy="90" r="2.4" fill="#ffd54a"/><circle cx="52" cy="99" r="2.4" fill="#ffd54a"/><rect x="38" y="101" width="44" height="5" fill="#3a2a1a"/><rect x="56" y="100" width="8" height="7" fill="#ffd54a"/>`,
      hat: `<path d="M22 40 Q60 -2 98 40 Q78 30 60 32 Q42 30 22 40 Z" fill="#23232e" stroke="#0a0a0e" stroke-width="2"/><path d="M26 39 Q60 8 94 39" stroke="#ffd54a" stroke-width="2.5" fill="none"/><circle cx="60" cy="24" r="5" fill="#eef2e6"/><path d="M56 30 L64 30" stroke="#eef2e6" stroke-width="2"/>`,
      face: `<ellipse cx="73" cy="49" rx="10" ry="9" fill="#15151b"/><path d="M36 30 L84 66" stroke="#15151b" stroke-width="2"/>`,
      off: `<circle cx="24" cy="104" r="9" fill="#ffd54a" stroke="#a07a1a" stroke-width="2"/><text x="24" y="108" font-size="11" font-weight="700" text-anchor="middle" fill="#a07a1a">$</text>`,
      weapon: `<g transform="rotate(20 90 104)"><path d="M88 46 Q102 56 92 100 L86 100 Q94 62 88 46 Z" fill="#dfe6ee" stroke="#5c6772" stroke-width="1.5"/><path d="M78 100 Q86 94 98 100 L96 106 L80 106 Z" fill="#ffd54a" stroke="#a07a1a" stroke-width="1.5"/><rect x="87" y="106" width="5" height="9" fill="#5a3a1a"/></g>`,
    },
  };

  // =====================================================================
  //  아이콘 (이모지 대신 쓰는 그림). 페이지에 스프라이트를 한 번 넣고 <use>로 가져다 쓴다.
  // =====================================================================
  const io = (w) => `stroke="#1b1533" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
  const IO = io(3);
  const grad = (id, stops) =>
    `<linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">${stops.map((c, i) => `<stop offset="${(i / (stops.length - 1)).toFixed(2)}" stop-color="${c}"/>`).join('')}</linearGradient>`;
  const ICON_DEFS =
    grad('gGold', ['#fff4b0', '#ffd24a', '#e39a14', '#a8660a']) +
    grad('gSteel', ['#ffffff', '#c8d4e6', '#8194b0', '#566682']) +
    grad('gRed', ['#ffb0a0', '#ff5a48', '#c02a1c', '#7a140c']) +
    grad('gBlue', ['#b0e2ff', '#4aa2f0', '#2a62c8', '#183a8a']) +
    grad('gGreen', ['#d0ffa0', '#7ad64a', '#3a9a2a', '#1f6a1a']) +
    grad('gWood', ['#e8b078', '#b87a3a', '#7a4a1a', '#4a2a0c']) +
    grad('gLeather', ['#d09868', '#a06a3a', '#6a4020', '#3a220e']) +
    grad('gPurple', ['#e0c0ff', '#a070f0', '#6a3ab8', '#3a1a7a']) +
    grad('gOrange', ['#fff0a0', '#ffb02e', '#ff6a1a', '#c02a0a']) +
    grad('gBone', ['#ffffff', '#f0ead8', '#c8c0a8', '#8a8068']) +
    grad('gParch', ['#fff6d8', '#f0d898', '#d0a860']);

  // 별 모양 좌표 계산 (중심 32,32)
  function starPts(n, ro, ri) {
    let s = '';
    for (let i = 0; i < n * 2; i++) {
      const r = i % 2 === 0 ? ro : ri;
      const a = (Math.PI * i) / n - Math.PI / 2;
      s += `${(32 + r * Math.cos(a)).toFixed(1)},${(32 + r * Math.sin(a)).toFixed(1)} `;
    }
    return s.trim();
  }
  const mini = (cx, cy, s, sk) => `<g transform="translate(${cx} ${cy}) scale(${s})">
      <path d="M-12 -2 L-27 -13 L-14 7 Z M12 -2 L27 -13 L14 7 Z" fill="${sk}" ${io(3.6)}/>
      <ellipse rx="15" ry="13" fill="${sk}" ${io(3.6)}/>
      <ellipse cx="-5.6" cy="-1" rx="3.8" ry="4.6" fill="#fff6a8"/><ellipse cx="5.6" cy="-1" rx="3.8" ry="4.6" fill="#fff6a8"/>
      <ellipse cx="-5.2" cy="0" rx="1.7" ry="3.2" fill="#111"/><ellipse cx="6" cy="0" rx="1.7" ry="3.2" fill="#111"/>
      <path d="M-5 7.6 Q0 11 5 7.6" fill="none" stroke="#1b1533" stroke-width="2.6" stroke-linecap="round"/></g>`;

  const ICONS = {
    sword: `<g transform="rotate(38 32 32)"><path d="M32 2 L39 10 V40 H25 V10 Z" fill="url(#gSteel)" ${IO}/><path d="M32 8 V37" stroke="#fff" stroke-opacity=".8" stroke-width="2.4"/>
      <path d="M14 40 H50 V47 H14 Z" fill="url(#gGold)" ${IO}/><path d="M28 47 H36 V57 H28 Z" fill="url(#gWood)" ${IO}/><circle cx="32" cy="60" r="4" fill="url(#gGold)" ${IO}/></g>`,
    shield: `<path d="M32 4 L55 11 V31 Q55 50 32 61 Q9 50 9 31 V11 Z" fill="url(#gBlue)" ${IO}/><path d="M32 11 L48 16 V31 Q48 44 32 53 Q16 44 16 31 V16 Z" fill="none" stroke="url(#gGold)" stroke-width="3.4"/>
      <polygon points="${starPts(5, 13, 5.6).replace(/(\d+\.?\d*),(\d+\.?\d*)/g, (m, x, y) => `${x},${(+y + 3).toFixed(1)}`)}" fill="url(#gGold)" stroke="#1b1533" stroke-width="1.8" stroke-linejoin="round"/><path d="M15 15 V30" stroke="#fff" stroke-opacity=".5" stroke-width="3" stroke-linecap="round"/>`,
    boots: `<path d="M18 6 H38 V28 L54 36 Q61 41 57 50 Q55 57 48 57 H14 Q8 57 8 51 V43 Q8 38 14 36 L18 28 Z" fill="url(#gLeather)" ${IO}/>
      <path d="M8 49 H58" stroke="#1b1533" stroke-width="3"/><path d="M17 6 H39 V15 H17 Z" fill="url(#gGold)" ${IO}/><path d="M22 20 V26" stroke="#fff" stroke-opacity=".4" stroke-width="3" stroke-linecap="round"/>
      <path d="M38 22 Q52 8 62 12 Q56 16 60 22 Q52 20 52 26 Q44 24 40 30 Z" fill="url(#gBone)" ${io(2.4)}/>`,
    party: `${mini(16, 24, 0.72, '#4a9a2a')}${mini(48, 24, 0.72, '#4a9a2a')}${mini(32, 40, 1.05, '#7fc241')}`,
    pouch: `<path d="M20 26 Q4 42 11 54 Q16 61 32 61 Q48 61 53 54 Q60 42 44 26 Z" fill="url(#gLeather)" ${IO}/><path d="M22 26 L16 12 Q32 20 48 12 L42 26 Z" fill="url(#gLeather)" ${IO}/>
      <path d="M20 26 Q32 31 44 26" fill="none" stroke="url(#gGold)" stroke-width="4.6" stroke-linecap="round"/><circle cx="32" cy="44" r="10" fill="url(#gGold)" ${IO}/><path d="M32 38 V50 M27 41.5 H35.5 Q37 44 35.5 46 H28.5 Q27 48 28.5 50 H37" fill="none" stroke="#8a5a06" stroke-width="2.4" stroke-linecap="round"/>`,
    coin: `<circle cx="32" cy="32" r="27" fill="url(#gGold)" ${IO}/><circle cx="32" cy="32" r="19" fill="none" stroke="#b8760a" stroke-width="3"/><polygon points="${starPts(5, 12, 5)}" fill="#fff4b0" stroke="#b8760a" stroke-width="2" stroke-linejoin="round"/><path d="M12 22 Q16 12 26 9" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="3" stroke-linecap="round"/>`,
    crown: `<path d="M6 48 L10 17 L23 32 L32 10 L41 32 L54 17 L58 48 Z" fill="url(#gGold)" ${IO}/><path d="M6 48 H58 V56 Q32 62 6 56 Z" fill="url(#gGold)" ${IO}/>
      <circle cx="10" cy="15" r="3.4" fill="#fff4b0" ${io(2)}/><circle cx="32" cy="8" r="3.4" fill="#fff4b0" ${io(2)}/><circle cx="54" cy="15" r="3.4" fill="#fff4b0" ${io(2)}/>
      <circle cx="32" cy="42" r="4.6" fill="url(#gRed)" ${io(2)}/><circle cx="18" cy="46" r="3.2" fill="url(#gBlue)" ${io(2)}/><circle cx="46" cy="46" r="3.2" fill="url(#gBlue)" ${io(2)}/><path d="M14 30 L17 24" stroke="#fff" stroke-opacity=".8" stroke-width="2.6" stroke-linecap="round"/>`,
    heart: `<path d="M32 59 C8 41 3 24 11 14 C19 5 30 9 32 18 C34 9 45 5 53 14 C61 24 56 41 32 59 Z" fill="url(#gRed)" ${IO}/><path d="M14 20 Q16 13 23 13" fill="none" stroke="#fff" stroke-opacity=".8" stroke-width="3.4" stroke-linecap="round"/>`,
    bolt: `<path d="M39 3 L11 36 H27 L22 61 L54 25 H37 Z" fill="url(#gGold)" ${IO}/><path d="M37 9 L20 30" stroke="#fff" stroke-opacity=".8" stroke-width="3" stroke-linecap="round"/>`,
    burst: `<polygon points="${starPts(10, 30, 16)}" fill="url(#gOrange)" ${IO}/><polygon points="${starPts(10, 15, 8)}" fill="#fff6c0" stroke="#e39a14" stroke-width="2" stroke-linejoin="round"/>`,
    anvil: `<path d="M6 16 H52 Q60 16 57 24 L44 28 Q40 32 45 40 H52 V56 H14 V40 H21 Q26 32 20 28 L8 24 Q4 20 6 16 Z" fill="url(#gSteel)" ${IO}/><path d="M10 20 H50" stroke="#fff" stroke-opacity=".8" stroke-width="3" stroke-linecap="round"/><path d="M18 48 H48" stroke="#566682" stroke-width="3" stroke-linecap="round"/>`,
    cap: `<path d="M32 8 L61 22 L32 36 L3 22 Z" fill="url(#gPurple)" ${IO}/><path d="M15 31 V44 Q32 55 49 44 V31 L32 39 Z" fill="url(#gBlue)" ${IO}/><path d="M56 25 V42" stroke="url(#gGold)" stroke-width="3.4" stroke-linecap="round"/><circle cx="56" cy="46" r="4" fill="url(#gGold)" ${io(2.4)}/><path d="M16 21 L30 14" stroke="#fff" stroke-opacity=".7" stroke-width="3" stroke-linecap="round"/>`,
    scroll: `<path d="M14 11 H50 V49 Q50 56 44 56 H16 Q10 56 10 49 V17 Q10 11 14 11 Z" fill="url(#gParch)" ${IO}/><ellipse cx="32" cy="11" rx="19" ry="6" fill="url(#gParch)" ${IO}/><path d="M18 26 H44 M18 34 H44 M18 42 H36" stroke="#8a5a1a" stroke-width="3" stroke-linecap="round"/><path d="M14 56 Q14 62 22 60" fill="none" ${IO}/>`,
    star: `<polygon points="${starPts(5, 29, 13)}" fill="url(#gGold)" ${IO}/><path d="M22 20 L28 12" stroke="#fff" stroke-opacity=".85" stroke-width="3" stroke-linecap="round"/>`,
    skull: `<path d="M32 5 C16 5 7 17 9 30 C10 36 14 38 17 40 V51 H47 V40 C50 38 54 36 55 30 C57 17 48 5 32 5 Z" fill="url(#gBone)" ${IO}/><ellipse cx="22" cy="30" rx="7" ry="8" fill="#20142e"/><ellipse cx="42" cy="30" rx="7" ry="8" fill="#20142e"/><path d="M32 38 L28 46 H36 Z" fill="#20142e"/><path d="M24 51 V44 M32 51 V47 M40 51 V44" stroke="#1b1533" stroke-width="3" stroke-linecap="round"/>`,
    hand: `<path d="M18 5 L18 46 L28 37 L35 55 L42 52 L35 35 L49 35 Z" fill="#fff" ${IO}/><path d="M22 14 V32" stroke="#a8b8d0" stroke-width="3" stroke-linecap="round"/>`,
    lock: `<path d="M18 28 V20 Q18 6 32 6 Q46 6 46 20 V28" fill="none" stroke="#1b1533" stroke-width="9" stroke-linecap="round"/><path d="M18 28 V20 Q18 6 32 6 Q46 6 46 20 V28" fill="none" stroke="url(#gSteel)" stroke-width="4.6" stroke-linecap="round"/><rect x="10" y="27" width="44" height="32" rx="7" fill="url(#gGold)" ${IO}/><circle cx="32" cy="41" r="4.6" fill="#1b1533"/><path d="M32 44 V51" stroke="#1b1533" stroke-width="4" stroke-linecap="round"/>`,
    check: `<path d="M10 34 L25 49 L54 14" fill="none" stroke="#1b1533" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/><path d="M10 34 L25 49 L54 14" fill="none" stroke="url(#gGreen)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>`,
    book: `<path d="M4 14 Q18 8 32 16 Q46 8 60 14 V52 Q46 46 32 54 Q18 46 4 52 Z" fill="url(#gParch)" ${IO}/><path d="M32 16 V54" stroke="#1b1533" stroke-width="3"/><path d="M10 22 Q19 20 26 24 M10 30 Q19 28 26 32 M10 38 Q19 36 26 40 M38 24 Q45 20 54 22 M38 32 Q45 28 54 30" fill="none" stroke="#8a5a1a" stroke-width="2.4" stroke-linecap="round"/>`,
    gem: `<path d="M18 8 H46 L58 24 L32 58 L6 24 Z" fill="url(#gBlue)" ${IO}/><path d="M6 24 H58 M18 8 L26 24 L32 58 L38 24 L46 8" fill="none" stroke="#1b1533" stroke-width="2.2" stroke-linejoin="round" stroke-opacity=".7"/><path d="M14 22 L22 12" stroke="#fff" stroke-opacity=".85" stroke-width="3" stroke-linecap="round"/>`,
    arrowup: `<path d="M32 6 L54 30 H40 V58 H24 V30 H10 Z" fill="url(#gGreen)" ${IO}/><path d="M26 32 V52" stroke="#fff" stroke-opacity=".6" stroke-width="3" stroke-linecap="round"/>`,
    dot: `<circle cx="32" cy="32" r="20" fill="url(#gRed)" ${IO}/>`,
    gate: `<path d="M8 58 V28 Q8 4 32 4 Q56 4 56 28 V58 H44 V29 Q44 15 32 15 Q20 15 20 29 V58 Z" fill="url(#gSteel)" ${IO}/>
      <ellipse cx="32" cy="40" rx="11" ry="17" fill="url(#gPurple)" ${io(2.4)}/><ellipse cx="32" cy="36" rx="5" ry="9" fill="#fff" fill-opacity=".4"/>`,
    ticket: `<path d="M6 18 Q6 12 12 12 H52 Q58 12 58 18 V24 A6 6 0 0 0 58 36 V42 Q58 48 52 48 H12 Q6 48 6 42 V36 A6 6 0 0 0 6 24 Z" fill="url(#gGold)" ${IO}/>
      <path d="M26 12 V48" stroke="#8a5a06" stroke-width="2.6" stroke-dasharray="4 4"/><circle cx="41" cy="30" r="7" fill="#fff6c0" stroke="#b8760a" stroke-width="2"/><path d="M38 30 L40 32 L44 27" fill="none" stroke="#8a5a06" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`,
    chest: `<path d="M8 30 H56 V54 Q56 58 52 58 H12 Q8 58 8 54 Z" fill="url(#gWood)" ${IO}/><path d="M8 30 Q8 16 20 14 H44 Q56 16 56 30 Z" fill="url(#gWood)" ${IO}/>
      <path d="M8 30 H56" stroke="url(#gGold)" stroke-width="5"/><rect x="26" y="27" width="12" height="14" rx="3" fill="url(#gGold)" ${io(2.4)}/><circle cx="32" cy="34" r="2.6" fill="#5a3a06"/>`,
    medal: `<path d="M22 8 L13 28 L26 25 Z M42 8 L51 28 L38 25 Z" fill="url(#gRed)" ${io(2.4)}/>
      <circle cx="32" cy="41" r="18" fill="url(#gGold)" ${IO}/><circle cx="32" cy="41" r="11" fill="none" stroke="#a8660a" stroke-width="3"/>
      <polygon points="${starPts(5, 8, 3.6).replace(/(\d+\.?\d*),(\d+\.?\d*)/g, (m, x, y) => `${x},${(+y + 9).toFixed(1)}`)}" fill="#fff6c0" stroke="#a8660a" stroke-width="1.4" stroke-linejoin="round"/>`,
  };

  function spriteMarkup() {
    let sym = '';
    for (const k of Object.keys(ICONS)) sym += `<symbol id="i-${k}" viewBox="0 0 64 64">${ICONS[k]}</symbol>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>${ICON_DEFS}</defs>${sym}</svg>`;
  }
  const svgIcon = (name, cls) => `<svg class="ic ${cls || ''}" viewBox="0 0 64 64" aria-hidden="true" focusable="false"><use href="#i-${name}"/></svg>`;
  const icon = (name, cls) => {
    const f = has('icons', name);
    return f ? `<img class="ic ic-img ${cls || ''}" src="${src(f)}" alt="" draggable="false">` : svgIcon(name, cls);
  };

  // =====================================================================
  //  셀 셰이딩: 그림 위에 대각선으로 딱 떨어지는 그림자 면과 테두리 빛을 얹어 애니메이션 채색 느낌을 낸다.
  // =====================================================================
  let uidCount = 0;
  function shaded(inner, box) {
    const u = 'u' + (++uidCount);
    const b = box;
    return `<defs>
        <filter id="${u}w" x="-10%" y="-10%" width="120%" height="120%" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 1 0"/></filter>
        <g id="${u}g">${inner}</g>
        <mask id="${u}m" maskUnits="userSpaceOnUse" x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}"><g filter="url(#${u}w)"><use href="#${u}g"/></g></mask>
        <linearGradient id="${u}s" x1="0.12" y1="0.05" x2="0.88" y2="0.95"><stop offset="0.5" stop-color="#2a1a66" stop-opacity="0"/><stop offset="0.51" stop-color="#2a1a66" stop-opacity="0.30"/></linearGradient>
        <linearGradient id="${u}r" x1="0.05" y1="0.02" x2="0.6" y2="0.5"><stop offset="0" stop-color="#fff" stop-opacity="0.26"/><stop offset="0.16" stop-color="#fff" stop-opacity="0.10"/><stop offset="0.17" stop-color="#fff" stop-opacity="0"/></linearGradient>
      </defs>
      <use href="#${u}g"/>
      <rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="url(#${u}s)" mask="url(#${u}m)"/>
      <rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="url(#${u}r)" mask="url(#${u}m)"/>`;
  }

  // 몬스터 그림. boss가 true면 왕관이나 위압감을 더한다.
  // 지역별 그림이 없을 때 공통 그림에 씌우는 색 필터 (지역 번호 순서). 세피아로 색을 한 톤에 모은 뒤
  // 색상을 돌려서, 원래 색이 다른 몬스터(초록 슬라임, 빨간 악마 등)도 같은 지역 색으로 보이게 한다.
  const BIOME_TINT = [
    '',                                                                        // 고블린 숲: 원본 그대로
    'sepia(.7) hue-rotate(205deg) saturate(1.6) brightness(.9)',               // 어둠의 동굴: 청보라
    'sepia(.95) hue-rotate(-8deg) saturate(1.9) brightness(1.12)',             // 불타는 사막: 모래빛
    'sepia(.75) hue-rotate(148deg) saturate(1.5) brightness(1.2)',             // 얼음 산맥: 청록
    'sepia(.85) hue-rotate(-36deg) saturate(3.4)',                             // 화산 지대: 주황~붉은색
    'sepia(.7) hue-rotate(235deg) saturate(1.1) brightness(.78) contrast(1.1)', // 저주받은 성: 어두운 보라
  ];

  // 회차(스테이지 61 이후)마다 색을 더 돌려서 같은 몬스터가 다른 존재처럼 보이게 한다
  const ROUND_TINT = ['', ' hue-rotate(40deg) saturate(1.15)', ' hue-rotate(-45deg) saturate(1.2)', ' hue-rotate(95deg) saturate(1.1)', ' hue-rotate(160deg) saturate(1.25) brightness(0.9)'];
  function monster(kind, biome, boss, round) {
    // 지역별 그림(ogre_3.png)이 있으면 그걸, 없으면 공통 그림(ogre.png)에 지역 색을 씌워 쓴다
    const own = has('monsters', kind + '_' + (biome | 0));
    const f = own || has('monsters', kind);
    if (f) {
      const tint = (own ? '' : BIOME_TINT[biome | 0] || '') + (ROUND_TINT[Math.min(round | 0, ROUND_TINT.length - 1)] || '');
      return `<img class="mon-svg mon-img" src="${src(f)}" alt="" draggable="false"${tint ? ` style="--tint:${tint}"` : ''}>`;
    }
    const inner = monsterInner(kind, biome | 0, !!boss);
    return `<svg class="mon-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 112" aria-hidden="true">
      <ellipse cx="60" cy="104" rx="42" ry="6" fill="rgba(0,0,0,.35)"/>
      ${shaded(inner, { x: -6, y: -6, w: 132, h: 118 })}</svg>`;
  }

  // =====================================================================
  //  몬스터 (13종). 팔레트 [주색, 어두운색, 밝은색, 눈색, 포인트색]만 바꿔서 지역마다 다르게 보이게 한다.
  // =====================================================================
  const LN = '#1d1233';
  const OL = `stroke="${LN}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"`;

  // 만화 느낌의 큰 눈 (흰자, 홍채, 눈동자, 하이라이트)
  function meye(cx, cy, r, col) {
    return `<ellipse cx="${cx}" cy="${cy}" rx="${r}" ry="${(r * 1.1).toFixed(1)}" fill="#fff" stroke="${LN}" stroke-width="1.6"/>
      <ellipse cx="${(cx + r * 0.1).toFixed(1)}" cy="${(cy + r * 0.15).toFixed(1)}" rx="${(r * 0.68).toFixed(1)}" ry="${(r * 0.88).toFixed(1)}" fill="${col}"/>
      <ellipse cx="${(cx + r * 0.1).toFixed(1)}" cy="${(cy + r * 0.2).toFixed(1)}" rx="${(r * 0.3).toFixed(1)}" ry="${(r * 0.52).toFixed(1)}" fill="#140a22"/>
      <circle cx="${(cx - r * 0.32).toFixed(1)}" cy="${(cy - r * 0.36).toFixed(1)}" r="${(r * 0.3).toFixed(1)}" fill="#fff"/>`;
  }
  const fang = (x, y, s) => `<path d="M${x} ${y} L${x + 3 * s} ${y} L${x + 1.5 * s} ${y + 4.5 * s} Z" fill="#fff" stroke="${LN}" stroke-width=".8"/>`;
  const crown = (cx, cy, s) => `<g transform="translate(${cx} ${cy}) scale(${s})"><path d="M-14 8 L-16 -8 L-7 -1 L0 -12 L7 -1 L16 -8 L14 8 Z" fill="#ffcf4a" stroke="${LN}" stroke-width="2.2" stroke-linejoin="round"/><circle cx="0" cy="2" r="2.6" fill="#ff5a5a"/></g>`;

  // [주색, 어두운색, 밝은색, 눈색, 포인트색]
  const P_DEF = ['#8a8f9c', '#4b5060', '#c7ccd8', '#ffd84a', '#ffcf4a'];
  // 종류별로 지역(0 숲, 1 동굴, 2 사막, 3 설원, 4 화산, 5 성) 순서의 팔레트
  const PAL = {
    slime:    [['#6fd65a', '#2f8f3a', '#c8ff9a', '#2a5a1a'], ['#5aa2ff', '#2a58c8', '#b8dcff', '#1a2a7a'], ['#f0d24a', '#b8901a', '#fff2a0', '#6a4a0a'],
               ['#7fe8ff', '#3aa0d8', '#d8f8ff', '#0a4a7a'], ['#ff7a3a', '#c02a10', '#ffd08a', '#5a0a0a'], ['#a06aff', '#5a2ab0', '#d8c0ff', '#2a0a5a']],
    wolf:     [['#9a6a3a', '#5a3a1a', '#d8b078', '#ffd84a', '#7a4a20'], null, null, ['#e8f2ff', '#8aa8c8', '#ffffff', '#5ad0ff', '#b8d0e8']],
    boar:     [['#a85a3a', '#5a2a1a', '#e8a888', '#ffd84a', '#f0e8d8']],
    spider:   [['#3f7a3a', '#1f3f1a', '#8fd07a', '#ff5a5a', '#c8ff5a'], ['#7a4ac8', '#3a1a7a', '#c8a8ff', '#ff5a9a', '#ff9aff'], null, null, null,
               ['#4a2a6a', '#1f0f3a', '#9a6ac8', '#ff5a5a', '#c88aff']],
    snake:    [['#4fbf4a', '#1f6a2a', '#d8ff9a', '#ffd84a', '#ff5a5a'], null, ['#e8c060', '#a06a20', '#fff0b0', '#7a2a0a', '#c8402a']],
    bat:      [null, ['#7a4ac8', '#3a1a7a', '#c8a8ff', '#ff5a9a'], ['#c8a060', '#7a5a2a', '#f0d8a0', '#ff5a3a'], ['#a8d0f0', '#5a88b8', '#e8f8ff', '#5ad0ff'],
               ['#ff9a3a', '#a03a10', '#ffd08a', '#ffe84a'], ['#4a3a5a', '#1f1a2a', '#8a7aa0', '#ff3a3a']],
    skeleton: [null, ['#e8e0c8', '#8a8068', '#fffdf0', '#5aff9a', '#8a6a3a'], null, null, null, ['#e0e4ee', '#7a8298', '#ffffff', '#b45aff', '#6a4aa0']],
    ghost:    [null, ['#b8e0ff', '#6a98d0', '#f0faff', '#2a5a9a'], null, ['#e8faff', '#8ac8e0', '#ffffff', '#3a90c0'], null, ['#c8a8ff', '#7a4ac8', '#f0e8ff', '#5a2aa0']],
    scorpion: [null, null, ['#d89a3a', '#8a5a1a', '#ffd88a', '#ff3a3a', '#b8402a'], null, ['#e0402a', '#7a1a10', '#ff9a6a', '#ffe84a', '#ffcf4a']],
    golem:    [['#8a9a5a', '#4a5a2a', '#c8d890', '#8aff5a', '#5a8a2a'], ['#8a6ac8', '#4a2a8a', '#d8c0ff', '#e85aff', '#5ae8ff'], ['#d8b070', '#8a6a30', '#f8e0a8', '#ffb83a', '#a08040'],
               ['#a8d8f0', '#5a90b8', '#eafaff', '#5ad8ff', '#ffffff'], ['#4a3a3a', '#1f1414', '#8a6a5a', '#ff8a2a', '#ff5a1a']],
    imp:      [null, null, null, null, ['#e8402a', '#8a1a10', '#ff9a7a', '#ffe84a', '#3a1a1a'], ['#8a90a8', '#4a5068', '#c8ccd8', '#ff3a3a', '#5a6078']],
    ogre:     [['#7fa858', '#3f6a2a', '#c8e0a0', '#ffd84a', '#8a5a2a'], null, null, ['#f0f4ff', '#a8b8d0', '#ffffff', '#5ad0ff', '#8a9ab8']],
    dragon:   [null, null, ['#e0b040', '#8a6a1a', '#fff0a0', '#ff3a3a', '#c8402a'], ['#8ad8ff', '#3a88c8', '#e8faff', '#ffffff', '#ffffff'],
               ['#e8402a', '#7a1a10', '#ffb08a', '#ffe84a', '#ffcf4a'], ['#d8d8d0', '#7a7a70', '#fffff0', '#5aff9a', '#a09a80']],
  };
  function palette(kind, biome) {
    const row = PAL[kind] || [];
    const p = row[biome] || row[0] || P_DEF;
    const out = P_DEF.slice();
    for (let i = 0; i < p.length; i++) out[i] = p[i];
    return out;
  }

  const MONSTER = {
    slime: (p) => `
      <path d="M10 98 Q4 62 32 42 Q60 20 88 42 Q116 62 110 98 Q60 110 10 98 Z" fill="${p[0]}" ${OL}/>
      <path d="M18 92 Q60 102 102 92 Q108 98 60 104 Q12 98 18 92 Z" fill="${p[1]}" opacity=".55"/>
      <ellipse cx="36" cy="54" rx="13" ry="7" fill="#fff" opacity=".55" transform="rotate(-28 36 54)"/>
      <circle cx="28" cy="70" r="3" fill="#fff" opacity=".5"/>
      ${meye(44, 74, 9.5, p[3])}${meye(78, 74, 9.5, p[3])}
      <path d="M53 90 Q61 96 69 90" fill="none" ${OL}/>
      <path d="M52 22 Q60 6 68 22" fill="${p[0]}" ${OL}/>`,
    bat: (p) => `
      <path d="M58 58 Q34 30 4 42 Q12 48 10 58 Q20 54 24 64 Q34 58 40 70 Q50 66 58 74 Z" fill="${p[1]}" ${OL}/>
      <path d="M62 58 Q86 30 116 42 Q108 48 110 58 Q100 54 96 64 Q86 58 80 70 Q70 66 62 74 Z" fill="${p[1]}" ${OL}/>
      <path d="M58 58 L14 50 M58 62 L26 62 M60 66 L42 70 M62 58 L106 50 M62 62 L94 62 M60 66 L78 70" stroke="${LN}" stroke-width="1.6" opacity=".55"/>
      <ellipse cx="60" cy="70" rx="15" ry="20" fill="${p[0]}" ${OL}/><ellipse cx="60" cy="74" rx="8" ry="12" fill="${p[2]}" opacity=".7"/>
      <path d="M46 38 L42 14 L58 30 Z" fill="${p[0]}" ${OL}/><path d="M74 38 L78 14 L62 30 Z" fill="${p[0]}" ${OL}/>
      <circle cx="60" cy="48" r="17" fill="${p[0]}" ${OL}/>
      ${meye(52, 48, 6, p[3])}${meye(68, 48, 6, p[3])}
      <path d="M54 59 Q60 62 66 59" fill="none" ${OL}/>${fang(54.5, 59.5, 1.1)}${fang(63, 59.5, 1.1)}`,
    wolf: (p) => `
      <path d="M92 68 Q114 52 108 26 Q104 54 86 64 Z" fill="${p[0]}" ${OL}/>
      <ellipse cx="64" cy="72" rx="34" ry="20" fill="${p[0]}" ${OL}/><ellipse cx="62" cy="82" rx="22" ry="8" fill="${p[2]}" opacity=".6"/>
      <rect x="38" y="82" width="10" height="20" rx="5" fill="${p[1]}" ${OL}/><rect x="52" y="84" width="10" height="18" rx="5" fill="${p[1]}" ${OL}/>
      <rect x="76" y="84" width="10" height="18" rx="5" fill="${p[1]}" ${OL}/><rect x="90" y="82" width="10" height="20" rx="5" fill="${p[1]}" ${OL}/>
      <path d="M40 58 L46 48 L52 58 L58 46 L64 58 L70 48 L76 58" fill="${p[1]}" ${OL}/>
      <ellipse cx="32" cy="58" rx="19" ry="16" fill="${p[0]}" ${OL}/>
      <path d="M16 56 Q2 58 4 68 Q14 74 28 68 Z" fill="${p[2]}" ${OL}/><circle cx="6" cy="62" r="3.2" fill="${LN}"/>
      <path d="M26 46 L22 24 L38 40 Z" fill="${p[0]}" ${OL}/><path d="M40 44 L48 24 L52 46 Z" fill="${p[0]}" ${OL}/>
      ${meye(30, 55, 5.6, p[3])}<path d="M22 47 L36 53" stroke="${LN}" stroke-width="3" stroke-linecap="round"/>
      <path d="M10 68 Q18 74 26 68" fill="none" ${OL}/>${fang(12, 68, 1.1)}${fang(20, 70, 1.1)}`,
    boar: (p) => `
      <ellipse cx="68" cy="70" rx="36" ry="23" fill="${p[0]}" ${OL}/><ellipse cx="66" cy="82" rx="24" ry="8" fill="${p[2]}" opacity=".55"/>
      <path d="M40 54 L48 42 L54 54 L62 40 L68 54 L76 42 L82 56 L90 46 L94 62" fill="${p[1]}" ${OL}/>
      <rect x="42" y="84" width="11" height="18" rx="5" fill="${p[1]}" ${OL}/><rect x="56" y="86" width="11" height="16" rx="5" fill="${p[1]}" ${OL}/>
      <rect x="80" y="86" width="11" height="16" rx="5" fill="${p[1]}" ${OL}/><rect x="94" y="84" width="11" height="18" rx="5" fill="${p[1]}" ${OL}/>
      <circle cx="34" cy="64" r="19" fill="${p[0]}" ${OL}/>
      <ellipse cx="14" cy="72" rx="12" ry="10" fill="#f0a8a0" ${OL}/><circle cx="10" cy="70" r="2.2" fill="${LN}"/><circle cx="17" cy="73" r="2.2" fill="${LN}"/>
      <path d="M8 80 Q2 72 8 62 Q10 72 16 78 Z" fill="${p[4]}" ${OL}/><path d="M22 82 Q16 82 20 90 Q26 88 28 82 Z" fill="${p[4]}" ${OL}/>
      <path d="M30 48 L28 32 L42 44 Z" fill="${p[0]}" ${OL}/>
      ${meye(34, 60, 5.6, p[3])}<path d="M27 53 L41 58" stroke="${LN}" stroke-width="3" stroke-linecap="round"/>`,
    spider: (p) => `
      <g fill="none" stroke="${LN}" stroke-width="9" stroke-linecap="round"><path d="M46 60 Q20 40 8 62"/><path d="M46 66 Q16 62 10 86"/><path d="M48 72 Q24 82 20 102"/><path d="M50 56 Q34 30 18 32"/>
        <path d="M74 60 Q100 40 112 62"/><path d="M74 66 Q104 62 110 86"/><path d="M72 72 Q96 82 100 102"/><path d="M70 56 Q86 30 102 32"/></g>
      <g fill="none" stroke="${p[1]}" stroke-width="5" stroke-linecap="round"><path d="M46 60 Q20 40 8 62"/><path d="M46 66 Q16 62 10 86"/><path d="M48 72 Q24 82 20 102"/><path d="M50 56 Q34 30 18 32"/>
        <path d="M74 60 Q100 40 112 62"/><path d="M74 66 Q104 62 110 86"/><path d="M72 72 Q96 82 100 102"/><path d="M70 56 Q86 30 102 32"/></g>
      <ellipse cx="60" cy="76" rx="24" ry="21" fill="${p[0]}" ${OL}/><path d="M60 62 L67 76 L60 90 L53 76 Z" fill="${p[4]}" ${OL}/>
      <circle cx="60" cy="50" r="16" fill="${p[0]}" ${OL}/>
      ${meye(52, 50, 5, p[3])}${meye(68, 50, 5, p[3])}<circle cx="56" cy="40" r="3.2" fill="${p[3]}" stroke="${LN}" stroke-width="1.2"/><circle cx="64" cy="40" r="3.2" fill="${p[3]}" stroke="${LN}" stroke-width="1.2"/>
      <path d="M53 62 Q52 70 56 70" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/><path d="M67 62 Q68 70 64 70" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/>`,
    snake: (p) => `
      <path d="M22 98 Q64 110 94 92 Q114 80 94 68 Q66 58 52 50" fill="none" stroke="${LN}" stroke-width="24" stroke-linecap="round"/>
      <path d="M22 98 Q64 110 94 92 Q114 80 94 68 Q66 58 52 50" fill="none" stroke="${p[0]}" stroke-width="18" stroke-linecap="round"/>
      <path d="M22 98 Q64 110 94 92 Q114 80 94 68 Q66 58 52 50" fill="none" stroke="${p[2]}" stroke-width="7" stroke-linecap="round" stroke-dasharray="2 13" opacity=".8"/>
      <path d="M26 92 Q64 102 92 86" fill="none" stroke="${p[1]}" stroke-width="4" stroke-linecap="round" opacity=".55"/>
      <path d="M32 38 L20 40 M20 40 L14 35 M20 40 L14 45" stroke="${p[4]}" stroke-width="3" stroke-linecap="round" fill="none"/>
      <ellipse cx="46" cy="40" rx="20" ry="15" fill="${p[0]}" ${OL} transform="rotate(-12 46 40)"/>
      ${meye(40, 34, 6, p[3])}${meye(54, 36, 6, p[3])}<path d="M30 46 Q42 52 56 48" fill="none" ${OL}/>${fang(34, 47, 1)}`,
    skeleton: (p) => `
      <rect x="49" y="84" width="8" height="18" rx="4" fill="${p[2]}" ${OL}/><rect x="63" y="84" width="8" height="18" rx="4" fill="${p[2]}" ${OL}/>
      <path d="M44 56 Q26 68 28 88" fill="none" stroke="${LN}" stroke-width="9" stroke-linecap="round"/><path d="M44 56 Q26 68 28 88" fill="none" stroke="${p[2]}" stroke-width="5" stroke-linecap="round"/>
      <path d="M76 56 Q94 68 92 88" fill="none" stroke="${LN}" stroke-width="9" stroke-linecap="round"/><path d="M76 56 Q94 68 92 88" fill="none" stroke="${p[2]}" stroke-width="5" stroke-linecap="round"/>
      <g transform="rotate(-18 28 88)"><rect x="24" y="52" width="8" height="40" rx="2" fill="#9aa4b4" ${OL}/><rect x="18" y="88" width="20" height="5" rx="2" fill="${p[4]}" ${OL}/></g>
      <rect x="44" y="52" width="32" height="34" rx="9" fill="${p[2]}" ${OL}/>
      <path d="M50 60 H70 M50 68 H70 M50 76 H70 M60 54 V84" stroke="${p[1]}" stroke-width="3" stroke-linecap="round"/>
      <path d="M60 8 C40 8 34 24 38 38 C40 44 44 46 46 48 V54 H74 V48 C76 46 80 44 82 38 C86 24 80 8 60 8 Z" fill="${p[2]}" ${OL}/>
      <ellipse cx="51" cy="32" rx="7" ry="8" fill="#20142e"/><ellipse cx="69" cy="32" rx="7" ry="8" fill="#20142e"/>
      <circle cx="51" cy="33" r="3.4" fill="${p[3]}"/><circle cx="69" cy="33" r="3.4" fill="${p[3]}"/><circle cx="49.6" cy="31.4" r="1.2" fill="#fff"/><circle cx="67.6" cy="31.4" r="1.2" fill="#fff"/>
      <path d="M60 40 L56 47 H64 Z" fill="#20142e"/><path d="M50 52 V48 M55 52 V48 M60 52 V48 M65 52 V48 M70 52 V48" stroke="${LN}" stroke-width="2"/>`,
    ghost: (p) => `
      <ellipse cx="60" cy="60" rx="52" ry="46" fill="${p[0]}" opacity=".22"/>
      <path d="M24 96 Q20 30 60 20 Q100 30 96 96 Q88 86 80 98 Q70 86 60 98 Q50 86 40 98 Q32 86 24 96 Z" fill="${p[2]}" ${OL} opacity=".95"/>
      <path d="M30 88 Q60 100 90 88 Q92 96 60 102 Q28 96 30 88 Z" fill="${p[0]}" opacity=".6"/>
      <path d="M26 66 Q10 66 8 80 Q18 78 28 82 Z" fill="${p[2]}" ${OL}/><path d="M94 66 Q110 66 112 80 Q102 78 92 82 Z" fill="${p[2]}" ${OL}/>
      <ellipse cx="42" cy="44" rx="9" ry="6" fill="#fff" opacity=".6" transform="rotate(-25 42 44)"/>
      ${meye(46, 56, 8.5, p[3])}${meye(74, 56, 8.5, p[3])}
      <ellipse cx="60" cy="74" rx="5" ry="6.5" fill="#3a2a5a" ${OL}/>
      <ellipse cx="34" cy="68" rx="5" ry="3" fill="#ff9aa8" opacity=".5"/><ellipse cx="86" cy="68" rx="5" ry="3" fill="#ff9aa8" opacity=".5"/>`,
    scorpion: (p) => `
      <g fill="${p[0]}" ${OL}><circle cx="86" cy="66" r="10"/><circle cx="96" cy="52" r="9.5"/><circle cx="99" cy="38" r="9"/><circle cx="92" cy="26" r="8.5"/><circle cx="80" cy="20" r="8"/></g>
      <path d="M72 20 L60 24 L70 28 Z" fill="${p[4]}" ${OL}/>
      <g stroke="${LN}" stroke-width="8" stroke-linecap="round" fill="none"><path d="M52 78 L36 94"/><path d="M62 82 L52 100"/><path d="M76 80 L86 98"/><path d="M84 76 L102 90"/></g>
      <g stroke="${p[1]}" stroke-width="4" stroke-linecap="round" fill="none"><path d="M52 78 L36 94"/><path d="M62 82 L52 100"/><path d="M76 80 L86 98"/><path d="M84 76 L102 90"/></g>
      <ellipse cx="68" cy="74" rx="26" ry="16" fill="${p[0]}" ${OL}/><path d="M50 72 Q68 66 86 72 M50 78 Q68 72 86 78" stroke="${p[1]}" stroke-width="2.4" fill="none"/>
      <path d="M40 70 Q24 68 20 54" fill="none" stroke="${LN}" stroke-width="10" stroke-linecap="round"/><path d="M40 70 Q24 68 20 54" fill="none" stroke="${p[0]}" stroke-width="6" stroke-linecap="round"/>
      <path d="M8 44 Q4 60 22 62 Q18 54 26 48 Q16 42 8 44 Z" fill="${p[0]}" ${OL}/>
      <ellipse cx="46" cy="72" rx="15" ry="12" fill="${p[0]}" ${OL}/>
      ${meye(42, 68, 4.4, p[3])}${meye(52, 66, 4.4, p[3])}`,
    golem: (p) => `
      <rect x="36" y="76" width="18" height="26" rx="6" fill="${p[1]}" ${OL}/><rect x="66" y="76" width="18" height="26" rx="6" fill="${p[1]}" ${OL}/>
      <rect x="6" y="46" width="24" height="36" rx="10" fill="${p[0]}" ${OL}/><rect x="90" y="46" width="24" height="36" rx="10" fill="${p[0]}" ${OL}/>
      <path d="M12 56 L20 62 L14 70 M108 56 L100 62 L106 70" fill="none" stroke="${p[3]}" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M28 44 Q28 26 60 26 Q92 26 92 44 L88 86 H32 Z" fill="${p[0]}" ${OL}/>
      <path d="M36 44 L50 52 L42 64 M84 48 L72 58 L80 72" fill="none" stroke="${p[1]}" stroke-width="3" stroke-linecap="round"/>
      <circle cx="60" cy="62" r="11" fill="${p[3]}" ${OL} opacity=".95"/><circle cx="60" cy="62" r="17" fill="${p[3]}" opacity=".22"/><circle cx="56" cy="58" r="3" fill="#fff" opacity=".8"/>
      <path d="M22 34 L28 14 L36 30 Z" fill="${p[4]}" ${OL}/><path d="M98 34 L92 14 L84 30 Z" fill="${p[4]}" ${OL}/>
      <rect x="44" y="8" width="32" height="26" rx="7" fill="${p[0]}" ${OL}/><path d="M44 16 H76" stroke="${p[1]}" stroke-width="2.5"/>
      <rect x="49" y="18" width="8" height="7" rx="2" fill="${p[3]}"/><rect x="63" y="18" width="8" height="7" rx="2" fill="${p[3]}"/><rect x="50" y="19" width="3" height="2.4" fill="#fff"/><rect x="64" y="19" width="3" height="2.4" fill="#fff"/>`,
    imp: (p) => `
      <path d="M46 68 Q14 52 8 78 Q22 70 30 84 Q36 76 48 82 Z" fill="${p[1]}" ${OL}/><path d="M74 68 Q106 52 112 78 Q98 70 90 84 Q84 76 72 82 Z" fill="${p[1]}" ${OL}/>
      <path d="M74 86 Q106 96 100 62" fill="none" stroke="${LN}" stroke-width="9" stroke-linecap="round"/><path d="M74 86 Q106 96 100 62" fill="none" stroke="${p[0]}" stroke-width="5" stroke-linecap="round"/>
      <path d="M100 52 L94 66 L106 66 Z" fill="${p[4]}" ${OL}/>
      <ellipse cx="60" cy="78" rx="17" ry="19" fill="${p[0]}" ${OL}/><ellipse cx="60" cy="82" rx="9" ry="12" fill="${p[2]}" opacity=".7"/>
      <ellipse cx="50" cy="98" rx="9" ry="5" fill="${p[1]}" ${OL}/><ellipse cx="70" cy="98" rx="9" ry="5" fill="${p[1]}" ${OL}/>
      <path d="M42 34 Q34 12 50 6 Q50 20 54 30 Z" fill="${p[4]}" ${OL}/><path d="M78 34 Q86 12 70 6 Q70 20 66 30 Z" fill="${p[4]}" ${OL}/>
      <path d="M40 46 L26 40 L38 54 Z" fill="${p[0]}" ${OL}/><path d="M80 46 L94 40 L82 54 Z" fill="${p[0]}" ${OL}/>
      <circle cx="60" cy="46" r="21" fill="${p[0]}" ${OL}/>
      ${meye(51, 45, 6.6, p[3])}${meye(69, 45, 6.6, p[3])}<path d="M42 37 L57 42 M78 37 L63 42" stroke="${LN}" stroke-width="3.2" stroke-linecap="round"/>
      <path d="M49 57 Q60 68 71 57 Z" fill="#3a0d14" ${OL}/>${fang(52, 57.5, 1.2)}${fang(64, 57.5, 1.2)}`,
    ogre: (p) => `
      <g transform="translate(-13 6) rotate(20 100 70)"><rect x="96" y="14" width="11" height="70" rx="4" fill="#9a6a3a" ${OL}/><ellipse cx="101" cy="22" rx="14" ry="20" fill="#b07b45" ${OL}/><path d="M92 14 L86 10 M110 18 L116 14 M92 30 L86 32" stroke="${LN}" stroke-width="3"/></g>
      <rect x="40" y="86" width="16" height="16" rx="5" fill="${p[1]}" ${OL}/><rect x="64" y="86" width="16" height="16" rx="5" fill="${p[1]}" ${OL}/>
      <ellipse cx="60" cy="68" rx="34" ry="32" fill="${p[0]}" ${OL}/><ellipse cx="60" cy="74" rx="22" ry="20" fill="${p[2]}" opacity=".55"/>
      <path d="M34 82 Q60 96 86 82 L84 94 Q60 104 36 94 Z" fill="${p[4]}" ${OL}/>
      <ellipse cx="24" cy="66" rx="12" ry="20" fill="${p[0]}" ${OL}/><circle cx="98" cy="72" r="10" fill="${p[0]}" ${OL}/>
      <ellipse cx="60" cy="34" rx="22" ry="19" fill="${p[0]}" ${OL}/>
      <path d="M40 22 L36 8 L50 18 Z M80 22 L84 8 L70 18 Z" fill="${p[1]}" ${OL}/>
      ${meye(51, 32, 5.2, p[3])}${meye(69, 32, 5.2, p[3])}<path d="M42 25 L56 30 M78 25 L64 30" stroke="${LN}" stroke-width="3.6" stroke-linecap="round"/>
      <path d="M46 44 Q60 52 74 44" fill="#3a1a1a" ${OL}/><path d="M48 44 L52 34 L56 45 Z M72 44 L68 34 L64 45 Z" fill="#fff" ${OL}/>`,
    dragon: (p) => `
      <path d="M96 84 Q120 88 114 58 Q108 78 94 74 Z" fill="${p[0]}" ${OL}/><path d="M108 66 L116 56 L112 72 Z" fill="${p[4]}" ${OL}/>
      <path d="M66 60 Q80 12 114 10 Q102 32 110 42 Q96 44 96 56 Q84 50 82 68 Z" fill="${p[1]}" ${OL}/>
      <path d="M72 58 Q86 30 108 18 M80 62 Q92 42 104 38" stroke="${LN}" stroke-width="1.8" fill="none" opacity=".6"/>
      <ellipse cx="72" cy="76" rx="30" ry="21" fill="${p[0]}" ${OL}/><ellipse cx="66" cy="84" rx="20" ry="10" fill="${p[2]}" opacity=".8"/>
      <rect x="58" y="88" width="12" height="15" rx="5" fill="${p[1]}" ${OL}/><rect x="80" y="88" width="12" height="15" rx="5" fill="${p[1]}" ${OL}/>
      <path d="M52 68 Q38 60 34 48" fill="none" stroke="${LN}" stroke-width="22" stroke-linecap="round"/><path d="M52 68 Q38 60 34 48" fill="none" stroke="${p[0]}" stroke-width="17" stroke-linecap="round"/>
      <path d="M38 34 Q46 12 60 14 Q50 22 48 34 Z" fill="${p[4]}" ${OL}/>
      <ellipse cx="30" cy="42" rx="19" ry="14" fill="${p[0]}" ${OL}/><path d="M14 40 Q4 44 6 54 Q18 56 26 50 Z" fill="${p[0]}" ${OL}/>
      <circle cx="9" cy="47" r="2" fill="${LN}"/>${meye(30, 38, 5.6, p[3])}<path d="M22 30 L36 36" stroke="${LN}" stroke-width="3.2" stroke-linecap="round"/>
      <path d="M12 54 Q20 58 28 52" fill="none" ${OL}/>${fang(14, 54, 1.1)}${fang(22, 55.5, 1.1)}`,
  };

  function monsterInner(kind, biome, boss) {
    const p = palette(kind, biome);
    let inner = (MONSTER[kind] || MONSTER.slime)(p);
    // 보스 중 일부는 왕관을 쓴다 (거미 여왕, 전갈 대왕, 해골 군주, 마왕)
    if (boss && ['spider', 'scorpion', 'skeleton', 'imp'].indexOf(kind) >= 0) {
      const pos = { spider: [60, 30, 1.1], scorpion: [46, 56, 0.9], skeleton: [60, 6, 1.1], imp: [60, 22, 1.2] }[kind];
      inner += crown(pos[0], pos[1], pos[2]);
    }
    return inner;
  }

  // 얼굴: 큰 눈(홍채 그라데이션, 하이라이트, 속눈썹), 볼터치, 작은 송곳니로 만화 느낌을 낸다
  function head(u) {
    const eye = (cx) => `
      <ellipse cx="${cx}" cy="50" rx="9" ry="9.6" fill="#f7fbdc" stroke="${LINE}" stroke-width="1.4"/>
      <ellipse cx="${cx + 1}" cy="51" rx="6.7" ry="8.3" fill="url(#${u})"/>
      <ellipse cx="${cx + 1}" cy="51.6" rx="2.9" ry="5.5" fill="#1a0f05"/>
      <ellipse cx="${cx - 2}" cy="46" rx="3" ry="3.4" fill="#fff"/>
      <circle cx="${cx + 3.6}" cy="55.4" r="1.5" fill="#fff" opacity=".9"/>
      <path d="M${cx - 10} 46.5 Q${cx} 38.4 ${cx + 10} 46.5" fill="none" stroke="#1d2f0a" stroke-width="3.2" stroke-linecap="round"/>`;
    return `
      <defs><radialGradient id="${u}" cx="0.5" cy="0.28" r="0.85"><stop offset="0" stop-color="#ffe870"/><stop offset="0.55" stop-color="#f0a020"/><stop offset="1" stop-color="#a24a08"/></radialGradient></defs>
      <path d="M32 44 C20 42 10 36 1 22 C2 40 10 56 31 60 Z" fill="${SKIN}" stroke="${LINE}" stroke-width="2" stroke-linejoin="round"/>
      <path d="M29 47 C21 45 14 40 8 32 C9 43 15 52 28 55 Z" fill="#e6a07c"/>
      <path d="M88 44 C100 42 110 36 119 22 C118 40 110 56 89 60 Z" fill="${SKIN}" stroke="${LINE}" stroke-width="2" stroke-linejoin="round"/>
      <path d="M91 47 C99 45 106 40 112 32 C111 43 105 52 92 55 Z" fill="#e6a07c"/>
      <ellipse cx="60" cy="50" rx="31" ry="27" fill="${SKIN}" stroke="${LINE}" stroke-width="2"/>
      <ellipse cx="50" cy="35" rx="13" ry="5.5" fill="#fff" opacity=".22"/>
      <ellipse cx="36" cy="61" rx="6.4" ry="3.4" fill="#ff8fa3" opacity=".55"/><ellipse cx="84" cy="61" rx="6.4" ry="3.4" fill="#ff8fa3" opacity=".55"/>
      ${eye(47)}${eye(73)}
      <path d="M37 37 Q46 33.6 56 38.4" fill="none" stroke="${LINE}" stroke-width="2.6" stroke-linecap="round"/>
      <path d="M83 37 Q74 33.6 64 38.4" fill="none" stroke="${LINE}" stroke-width="2.6" stroke-linecap="round"/>
      <ellipse cx="60" cy="59" rx="4.8" ry="3.4" fill="#96d25a" stroke="${LINE}" stroke-width="1.3"/>
      <circle cx="58.4" cy="59.4" r="0.9" fill="${LINE}"/><circle cx="61.6" cy="59.4" r="0.9" fill="${LINE}"/>
      <path d="M51.5 66.6 Q60 73.4 68.5 66.6 Z" fill="#5a1e24" stroke="${LINE}" stroke-width="1.8" stroke-linejoin="round"/>
      <path d="M53.4 67.6 L57 68.6 L54.8 72.8 Z" fill="#fff"/><path d="M66.6 67.6 L63 68.6 L65.2 72.8 Z" fill="#fff"/>`;
  }

  function goblinInner(id) {
    const L = LOOKS[id] || LOOKS.novice;
    const legs = L.legs || SKIN_D;
    return `
      ${L.back || ''}
      <rect x="41" y="104" width="15" height="21" rx="7" fill="${legs}"/><rect x="64" y="104" width="15" height="21" rx="7" fill="${legs}"/>
      <ellipse cx="46" cy="126" rx="11" ry="5.5" fill="${legs}"/><ellipse cx="74" cy="126" rx="11" ry="5.5" fill="${legs}"/>
      <ellipse cx="60" cy="92" rx="23" ry="21" fill="${SKIN}" stroke="${LINE}" stroke-width="2"/>
      <ellipse cx="60" cy="97" rx="14" ry="13" fill="${SKIN_L}" opacity=".6"/>
      ${L.body || ''}
      <ellipse cx="35" cy="92" rx="7.5" ry="15" transform="rotate(12 35 92)" fill="${SKIN}" stroke="${LINE}" stroke-width="2"/>
      <ellipse cx="85" cy="92" rx="7.5" ry="15" transform="rotate(-12 85 92)" fill="${SKIN}" stroke="${LINE}" stroke-width="2"/>
      <circle cx="32" cy="105" r="6.5" fill="${SKIN}" stroke="${LINE}" stroke-width="2"/>
      <circle cx="88" cy="105" r="6.5" fill="${SKIN}" stroke="${LINE}" stroke-width="2"/>
      ${head('gi' + (++uidCount))}
      ${L.hat || ''}
      ${L.face || ''}
      ${L.off || ''}
      ${L.weapon || ''}`;
  }

  // 3·4차 직업처럼 그림이 아직 없는 직업은 가장 가까운 윗단계 직업의 그림을 대신 쓴다. 부모를 알려 주는 함수는 게임 쪽에서 넣어 준다.
  let parentOf = () => null;
  function setParents(fn) { parentOf = fn; }
  function resolveGoblin(id) {
    for (let c = id, n = 0; c && n < 6; c = parentOf(c), n++) {
      if (has('goblins', c) || LOOKS[c]) return c;
    }
    return 'novice';
  }

  // 고블린 그림. opts.head가 true면 얼굴만 잘라서(프로필 사진용) 돌려준다.
  function goblin(id, opts) {
    const o = opts || {};
    id = resolveGoblin(id);
    // 얼굴 그림(knight_head.png)이 있으면 그걸, 없으면 전신 그림을 얼굴 부분만 잘라서 쓴다
    const full = has('goblins', id);
    if (full && !o.head) return `<img class="gob-svg gob-img" src="${src(full)}" alt="" draggable="false">`;
    if (full && o.head) {
      const hd = has('goblins', id + '_head');
      return hd
        ? `<img class="gob-svg gob-img" src="${src(hd)}" alt="" draggable="false">`
        : `<span class="gob-svg gob-crop" style="background-image:url('${src(full)}')"></span>`;
    }
    const view = o.head ? '14 -6 92 92' : '-4 -14 128 154';
    const ground = o.head ? '' : '<ellipse cx="60" cy="132" rx="32" ry="6" fill="rgba(0,0,0,.35)"/>';
    return `<svg class="gob-svg" xmlns="http://www.w3.org/2000/svg" viewBox="${view}" aria-hidden="true">${ground}${shaded(goblinInner(id), { x: -10, y: -30, w: 150, h: 180 })}</svg>`;
  }

  // 장비 그림. images/gear/<디자인 id>가 있으면 그 이미지를, 없으면 칸 종류의 기본 아이콘을 디자인마다 색만 달리해서 쓴다.
  function gear(design, fallbackIcon, cls) {
    const f = has('gear', design);
    if (f) return `<img class="ic ic-img gear-img ${cls || ''}" src="${src(f)}" alt="" draggable="false">`;
    let h = 0;
    for (let i = 0; i < design.length; i++) h = (h * 31 + design.charCodeAt(i)) % 360;
    return `<span class="gear-fallback" style="filter:hue-rotate(${h}deg)">${svgIcon(fallbackIcon, cls)}</span>`;
  }

  // 스킬 아이콘. images/skills/<직업 id>가 있으면 그 그림을, 없으면 효과 종류의 기본 아이콘을 스킬마다 색만 달리해서 쓴다.
  function skillIcon(id, fallbackIcon, cls) {
    const f = has('skills', id);
    if (f) return `<img class="ic ic-img skill-img ${cls || ''}" src="${src(f)}" alt="" draggable="false">`;
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 360;
    return `<span class="skill-fallback" style="filter:hue-rotate(${h}deg)">${svgIcon(fallbackIcon, cls)}</span>`;
  }
  // 전투 이펙트 스프라이트의 주소 (그림이 없으면 빈 문자열: 화면 쪽이 CSS 이펙트로 대신한다)
  function vfx(name) {
    const f = has('vfx', name);
    return f ? src(f) : '';
  }

  // index.html에 직접 적힌 아이콘(<svg class="ic"><use href="#i-xxx"/>)을 이미지로 바꾸고, 지역 배경 이미지를 적용한다. 시작할 때 한 번 부른다.
  function applyStatic(doc) {
    if (!doc || !doc.querySelectorAll) return;
    doc.querySelectorAll('svg.ic > use').forEach((use) => {
      const name = (use.getAttribute('href') || '').replace('#i-', '');
      const f = has('icons', name);
      if (!f) return;
      const svg = use.parentNode;
      const img = doc.createElement('img');
      img.className = svg.getAttribute('class') + ' ic-img';
      img.src = src(f);
      img.alt = '';
      img.draggable = false;
      svg.replaceWith(img);
    });
    let css = '';
    for (let b = 0; b < 6; b++) {
      const f = has('backgrounds', 'biome' + b);
      if (!f) continue;
      css += `.stage[data-biome='${b}'] .stage__sky { background: url('${src(f)}') center bottom / cover no-repeat; }\n` +
             `.stage[data-biome='${b}'] :is(.stage__art, .stage__sun, .stage__rays) { display: none; }\n`;
    }
    if (css) { const st = doc.createElement('style'); st.textContent = css; doc.head.appendChild(st); }
    // 처음 화면에 나올 때 깜빡이지 않도록 미리 내려받아 둔다
    if (typeof Image !== 'undefined') {
      for (const cat of ['goblins', 'monsters', 'icons', 'backgrounds']) {
        for (const k of Object.keys(M[cat] || {})) new Image().src = src(M[cat][k]);
      }
    }
  }

  const api = { applyStatic, goblin, gear, skillIcon, vfx, setParents, monster, icon, sprite: spriteMarkup, LOOK_IDS: Object.keys(LOOKS), MONSTER_KINDS: Object.keys(MONSTER), ICON_NAMES: Object.keys(ICONS) };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Art = api;
})(typeof window !== 'undefined' ? window : globalThis);
