// 고블린 그림 (SVG). 직업마다 모자·옷·무기를 바꿔서 그린다. 외부 이미지 없이 코드만으로 만든다.
(function (root) {
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
      face: `<path d="M35 65 Q60 60 85 65 Q83 82 60 86 Q37 82 35 65 Z" fill="#1c1c26" stroke="#0a0a0e" stroke-width="2"/><ellipse cx="48.5" cy="49.5" rx="2.8" ry="5.8" fill="#ff3b3b"/><ellipse cx="71.5" cy="49.5" rx="2.8" ry="5.8" fill="#ff3b3b"/>`,
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

  // 머리 위쪽에 눈·코·입 등 얼굴 요소를 그린 뒤 hat/face를 덮는다
  function head() {
    return `
      <path d="M32 44 C20 42 10 36 1 24 C3 40 10 56 31 60 Z" fill="${SKIN}" stroke="${LINE}" stroke-width="2" stroke-linejoin="round"/>
      <path d="M29 47 C21 45 14 41 8 34 C10 44 15 52 28 55 Z" fill="#e0a27a"/>
      <path d="M88 44 C100 42 110 36 119 24 C117 40 110 56 89 60 Z" fill="${SKIN}" stroke="${LINE}" stroke-width="2" stroke-linejoin="round"/>
      <path d="M91 47 C99 45 106 41 112 34 C110 44 105 52 92 55 Z" fill="#e0a27a"/>
      <ellipse cx="60" cy="50" rx="31" ry="27" fill="${SKIN}" stroke="${LINE}" stroke-width="2"/>
      <ellipse cx="50" cy="36" rx="13" ry="6" fill="#fff" opacity=".2"/>
      <ellipse cx="47" cy="49" rx="8.5" ry="7.5" fill="#fff6a8" stroke="${LINE}" stroke-width="1.5"/>
      <ellipse cx="73" cy="49" rx="8.5" ry="7.5" fill="#fff6a8" stroke="${LINE}" stroke-width="1.5"/>
      <ellipse cx="48.5" cy="49.5" rx="2.6" ry="5.5" fill="#111"/>
      <ellipse cx="71.5" cy="49.5" rx="2.6" ry="5.5" fill="#111"/>
      <circle cx="46.5" cy="47" r="1.6" fill="#fff"/><circle cx="70.5" cy="47" r="1.6" fill="#fff"/>
      <path d="M36 40 L55 45" stroke="${LINE}" stroke-width="4.5" stroke-linecap="round"/>
      <path d="M84 40 L65 45" stroke="${LINE}" stroke-width="4.5" stroke-linecap="round"/>
      <ellipse cx="60" cy="59" rx="8" ry="6.5" fill="#94d055" stroke="${LINE}" stroke-width="1.5"/>
      <circle cx="56.5" cy="60" r="1.6" fill="${LINE}"/><circle cx="63.5" cy="60" r="1.6" fill="${LINE}"/>
      <path d="M43 67 Q60 81 77 67 Z" fill="#3a1414" stroke="${LINE}" stroke-width="2" stroke-linejoin="round"/>
      <path d="M49 68.5 L54.5 70 L51.5 77 Z" fill="#fff"/><path d="M71 68.5 L65.5 70 L68.5 77 Z" fill="#fff"/>`;
  }

  function goblinInner(id) {
    const L = LOOKS[id] || LOOKS.novice;
    const legs = L.legs || SKIN_D;
    return `
      <ellipse cx="60" cy="132" rx="32" ry="6" fill="rgba(0,0,0,.35)"/>
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
      ${head()}
      ${L.hat || ''}
      ${L.face || ''}
      ${L.off || ''}
      ${L.weapon || ''}`;
  }

  // 전신 그림. opts.head가 true면 얼굴만 잘라서(프로필 사진용) 돌려준다.
  function goblin(id, opts) {
    const o = opts || {};
    const view = o.head ? '14 -6 92 92' : '-4 -14 128 154';
    return `<svg class="gob-svg" xmlns="http://www.w3.org/2000/svg" viewBox="${view}" aria-hidden="true">${goblinInner(id)}</svg>`;
  }

  const api = { goblin, goblinInner, LOOK_IDS: Object.keys(LOOKS) };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Art = api;
})(typeof window !== 'undefined' ? window : globalThis);
