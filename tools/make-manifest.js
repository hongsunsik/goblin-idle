// images/ 폴더를 훑어서 images/manifest.js 를 만든다.  사용법: node tools/make-manifest.js
// 게임이 필요로 하는 이름 중 어떤 그림이 있고 없는지, 이름이 틀린 파일은 없는지도 알려준다.
const fs = require('fs');
const path = require('path');
const A = require('../art.js');
const G = require('../game.js');

const ROOT = path.join(__dirname, '..', 'images');
const EXT = /\.(png|webp|jpe?g|gif|svg)$/i;

const monsterNames = [];
for (const k of A.MONSTER_KINDS) { monsterNames.push(k); for (let b = 0; b < 6; b++) monsterNames.push(`${k}_${b}`); }
const EXPECT = {
  goblins: [...A.LOOK_IDS, ...A.LOOK_IDS.map((id) => id + '_head')],
  monsters: monsterNames,
  icons: A.ICON_NAMES,
  backgrounds: [0, 1, 2, 3, 4, 5].map((b) => 'biome' + b),
};
// 꼭 있어야 하는 이름 (나머지는 선택: 얼굴 전용 그림, 지역별 몬스터 그림)
const REQUIRED = {
  goblins: A.LOOK_IDS, monsters: A.MONSTER_KINDS, icons: A.ICON_NAMES, backgrounds: EXPECT.backgrounds,
};

const manifest = { v: Date.now(), goblins: {}, monsters: {}, icons: {}, backgrounds: {} };
let problems = 0;
for (const cat of Object.keys(EXPECT)) {
  const dir = path.join(ROOT, cat);
  const files = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => EXT.test(f)).sort() : [];
  for (const f of files) {
    const name = f.replace(EXT, '');
    if (!EXPECT[cat].includes(name)) { console.warn(`! images/${cat}/${f}: 게임에서 쓰지 않는 이름이에요`); problems++; continue; }
    if (manifest[cat][name]) { console.warn(`! images/${cat}/${f}: 같은 이름의 다른 파일(${manifest[cat][name]})이 이미 있어요`); problems++; continue; }
    manifest[cat][name] = `${cat}/${f}`;
  }
  const have = REQUIRED[cat].filter((n) => manifest[cat][n]).length;
  console.log(`${cat.padEnd(12)} ${have}/${REQUIRED[cat].length}장${have < REQUIRED[cat].length ? ' (없는 것은 기본 SVG 그림으로 나와요)' : ''}`);
}
fs.writeFileSync(path.join(ROOT, 'manifest.js'),
  '// 자동 생성 파일입니다. images/ 폴더의 그림을 바꾼 뒤 `node tools/make-manifest.js` 로 다시 만드세요.\n' +
  'window.ART_MANIFEST = ' + JSON.stringify(manifest) + ';\n');
console.log(problems ? `\nimages/manifest.js 를 만들었어요. 위 경고 ${problems}건을 확인하세요.` : '\nimages/manifest.js 를 만들었어요.');
