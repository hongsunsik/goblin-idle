# 이미지 폴더 사용법

여기에 그림을 넣으면 게임이 **기본 SVG 그림 대신 그 이미지를 씁니다.** 파일이 없는 항목은 기본 SVG로 나오기 때문에 한 장씩 바꿔 가도 게임이 깨지지 않습니다.

## 적용하는 방법

1. 아래 이름대로 파일을 해당 폴더에 넣는다. (확장자는 `png` `webp` `jpg` `gif` `svg` 아무거나)
2. 터미널에서 `node tools/make-manifest.js` 를 실행한다. 어떤 그림이 들어갔고 무엇이 빠졌는지, 이름이 틀린 파일이 없는지 알려준다.
3. `images/manifest.js` 가 다시 만들어진다. 이 파일도 같이 커밋한다.

> 그림 파일을 새로 넣거나 바꿀 때마다 2번을 다시 해야 합니다. (브라우저가 파일 목록을 알 수 없어서 목록 파일이 필요해요.)

## 폴더와 파일 이름

| 폴더 | 파일 이름 | 개수 | 권장 크기 | 배경 |
|---|---|---|---|---|
| `goblins/` | 아래 13개 이름 | 13 | 512×616 (세로가 조금 긴 비율) | **투명** |
| `goblins/` (선택) | `이름_head.png` 얼굴만 | 최대 13 | 256×256 | **투명** |
| `monsters/` | 아래 13개 이름 | 13 | 480×448 | **투명** |
| `monsters/` (선택) | `이름_지역번호.png` (예: `golem_3.png`) | 지역별 | 480×448 | **투명** |
| `icons/` | 아래 22개 이름 | 22 | 128×128 (정사각형) | **투명** |
| `backgrounds/` | `biome0` ~ `biome5` | 6 | 1600×1200 (4:3 가로) | 불투명 (WebP 권장) |

- **고블린**: 발이 그림 아래쪽 끝에 닿게(아래 여백 4% 정도), 몸이 좌우 가운데에 오게 그리세요. 화면에서는 오른쪽(몬스터 쪽)을 보고 있어야 합니다.
- **몬스터**: 화면에서는 왼쪽(고블린 쪽)을 보고 있어야 합니다. 보스는 같은 그림이 더 크게 나오고 붉은 빛이 납니다.
- **얼굴 그림(`_head`)이 없으면** 전신 그림의 윗부분을 잘라서 프로필과 도감에 씁니다. 잘린 모습이 마음에 안 들 때만 따로 만들어 넣으세요.
- **몬스터 지역 그림**: `golem.png` 하나만 있으면 모든 지역에서 그걸 씁니다. 지역마다 다르게 하고 싶을 때만 `golem_2.png`(사막), `golem_3.png`(얼음)처럼 추가하세요. 지역 번호는 0 숲, 1 동굴, 2 사막, 3 얼음, 4 화산, 5 성입니다.
- **배경**: 캐릭터가 서 있을 바닥이 아래쪽 25% 정도에 평평하게 있고, 가운데는 비어 있어야 합니다. 배경을 넣은 지역은 기본 하늘·산·구름 그림이 자동으로 꺼집니다.
- **용량**: 캐릭터와 아이콘은 WebP로 저장하면 PNG의 1/3 수준입니다. 전체 5MB 안쪽을 권장합니다.

### 이름 목록

- `goblins/`: `novice` `warrior` `archer` `mage` `rogue` `knight` `berserker` `sniper` `ranger` `pyromancer` `necromancer` `assassin` `pirate`
- `monsters/`: `slime` `bat` `wolf` `boar` `spider` `snake` `skeleton` `ghost` `scorpion` `golem` `imp` `ogre` `dragon`
- `icons/`: `sword` `shield` `boots` `party` `pouch` `coin` `crown` `heart` `bolt` `burst` `anvil` `cap` `scroll` `star` `skull` `hand` `lock` `check` `book` `gem` `arrowup` `dot`
- `backgrounds/`: `biome0` `biome1` `biome2` `biome3` `biome4` `biome5`

---

## 이미지 생성 프롬프트 (영어로 쓰는 게 결과가 좋습니다)

**화풍을 통일하는 게 가장 중요합니다.** 모든 프롬프트 앞에 같은 "공통 문장"을 붙이세요. 같은 도구·같은 모델·같은 시드(또는 스타일 참조 이미지)를 쓰면 더 잘 맞습니다. 도구가 참조 이미지를 지원하면 처음 만든 마음에 드는 그림 한 장을 이후 모든 그림의 참조로 넣으세요.

**공통 문장 (캐릭터·몬스터)**
> cute cartoon mobile game character, thick dark purple outline, cel-shaded with hard-edged shadows, vibrant saturated colors, chibi proportions, full body, centered, isolated on a plain flat bright green background, no text, no ground shadow

**공통 문장 (아이콘)**
> game UI icon, bold dark purple outline, glossy cel-shaded, vibrant colors, centered, square composition, isolated on a plain flat bright green background, no text

**공통 문장 (배경)**
> 2D side-view mobile game background, painterly cartoon style, vibrant colors, empty flat ground across the bottom quarter for characters to stand on, no characters, no text, wide 4:3 composition

배경색을 초록으로 하라고 한 이유는 나중에 지우기 쉽게 하려는 것입니다. 투명 배경은 `rembg`(무료 프로그램), remove.bg, Photoshop의 배경 제거 등으로 만드세요.

### 고블린 (`goblins/`) — 모두 "작은 초록 피부 고블린, 큰 뾰족귀, 큰 주황색 눈, 작은 송곳니" 공통

| 이름 | 프롬프트 뒷부분 |
|---|---|
| novice | small green goblin with big pointy ears and big orange eyes, red headband, brown loincloth, holding a crude wooden club |
| warrior | small green goblin in gray steel armor and a crested steel helmet, holding a sword and a round wooden shield |
| archer | small green goblin in a green hood with a red feather, holding a wooden bow, quiver on the back |
| mage | small green goblin in a purple wizard hat with a gold star and a purple robe, holding a staff with a glowing cyan orb |
| rogue | small green goblin in a dark hood and a face mask, dark clothes, holding a dagger |
| knight | small green goblin in heavy silver plate armor, helmet with a red plume, holding a sword and a large blue shield with a cross |
| berserker | small green goblin, bare chested with red war paint, wild angry expression, holding a huge battle axe |
| sniper | small green goblin in a camouflage cloak, holding a long rifle with a scope, one eye squinting |
| ranger | small green goblin in a leafy green cloak, holding a fast recurve bow, small wolf pup companion at its feet |
| pyromancer | small green goblin in a red pointed wizard hat and red robe, holding a staff topped with a burning flame |
| necromancer | small green goblin in a black hooded robe, holding a skull-topped staff with green ghostly flames, tiny skeleton minion beside |
| assassin | small green goblin all in black, glowing yellow eyes, holding two curved daggers, crouching pose |
| pirate | small green goblin in a tricorn pirate hat, eye patch, holding a cutlass, coin pouch on the belt |

### 몬스터 (`monsters/`) — 몸이 왼쪽(고블린 쪽)을 향하게 (`facing left`를 붙이세요)

| 이름 | 프롬프트 뒷부분 |
|---|---|
| slime | glossy green slime blob with big cute eyes and a small smile, a small sprout on top, facing left |
| bat | small bat with big ears and wide open wings, fangs, facing left |
| wolf | brown wolf, side view, growling, sharp fangs, facing left |
| boar | wild boar with tusks and a spiky mane, charging pose, facing left |
| spider | forest spider with eight legs, red eyes, small fangs, facing left |
| snake | green snake curled in an S shape, forked tongue, facing left |
| skeleton | skeleton soldier holding a rusty sword, glowing eye sockets, facing left |
| ghost | round white ghost with a wavy bottom, sad-angry big eyes, facing left |
| scorpion | orange scorpion with raised tail and big claws, facing left |
| golem | stone golem with glowing green core on the chest and mossy shoulders, facing left |
| imp | small red demon imp with yellow horns, bat wings and a pointed tail, mischievous grin, facing left |
| ogre | big green ogre holding a wooden club, angry expression with two tusks, facing left |
| dragon | small dragon with wings spread, horns, breathing a little fire, facing left |

지역별 색 변형을 원하면 위 프롬프트에 "icy blue / sand yellow / lava red / ghostly purple" 같은 색 지시를 바꿔서 `golem_3.png` 식으로 저장하세요.

### 아이콘 (`icons/`)

| 이름 | 그림 | 이름 | 그림 |
|---|---|---|---|
| sword | steel sword | shield | blue shield with a gold star |
| boots | leather boots with small wings | party | three little goblin heads together |
| pouch | brown pouch full of gold coins | coin | shiny gold coin |
| crown | golden royal crown with a red gem | heart | red heart |
| bolt | yellow lightning bolt | burst | orange-yellow explosion burst |
| anvil | iron blacksmith anvil | cap | graduation cap |
| scroll | rolled parchment scroll | star | gold star |
| skull | white skull | hand | pointing hand, finger tapping |
| lock | golden padlock | check | green check mark |
| book | open old book | gem | blue faceted gemstone |
| arrowup | bold green arrow pointing up | dot | small glossy red dot |

### 배경 (`backgrounds/`)

| 이름 | 지역 | 프롬프트 뒷부분 |
|---|---|---|
| biome0 | 고블린 숲 | sunny green forest hills with tall pine trees, blue sky with clouds, a small floating island in the sky |
| biome1 | 어둠의 동굴 | dark purple cave interior with glowing crystals, stalactites, misty floor |
| biome2 | 불타는 사막 | orange desert with sand dunes and cacti, big warm sun, hot hazy sky |
| biome3 | 얼음 산맥 | snowy mountains under a pale blue sky, snow-covered pine trees, frozen ground |
| biome4 | 화산 지대 | volcanic landscape with lava rivers, dark red sky with ash clouds, jagged black rocks |
| biome5 | 저주받은 성 | haunted castle silhouette under a purple sky with a giant pink moon, dead trees, foggy ground |
