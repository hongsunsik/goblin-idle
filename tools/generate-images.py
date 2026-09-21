#!/usr/bin/env python3
"""Pollinations API로 게임 그림을 만들어 images/ 에 넣는다.

사용법 (저장소 루트에서):
  python3 tools/generate-images.py                 # 아직 없는 그림 전부 만들기
  python3 tools/generate-images.py goblins         # 한 종류만 (goblins | monsters | icons | gear | backgrounds)
  python3 tools/generate-images.py goblins/knight  # 그림 한 장만
  python3 tools/generate-images.py --list          # 만들지 않고 어떤 그림이 몇 장 필요한지만 보기 (종류도 함께 줄 수 있음)
  python3 tools/generate-images.py --force --retry 1 goblins/knight   # 다른 결과로 다시 뽑기 (retry 번호가 씨앗을 바꿈)
  python3 tools/generate-images.py --reprocess goblins                # 원본은 그대로 두고 배경 제거만 다시

API 키는 ~/.pollinations-key 파일에서 읽는다 (저장소에는 넣지 않는다).
만든 뒤에는 `node tools/make-manifest.js` 로 목록 파일을 갱신한다.
필요한 것: Python 3, Pillow, numpy
"""
import argparse
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from collections import deque
from concurrent.futures import ThreadPoolExecutor

import numpy as np
from PIL import Image, ImageFilter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
IMG = os.path.join(ROOT, 'images')
RAW = os.path.join(IMG, '_raw')          # 배경 제거 전 원본 (git에는 올리지 않는다)
MODEL = 'klein'                          # FLUX.2 klein: 화풍이 게임에 잘 맞고 빠르다
MAGENTA = (255, 0, 255)                  # 고블린 피부가 초록이라 배경은 마젠타로 만들어서 지운다

BG = 'isolated on a plain flat solid pure magenta (#FF00FF) background, no text, no ground shadow'
CHAR = ('cute cartoon mobile game character, thick dark purple outline, cel-shaded with hard-edged shadows, '
        'vibrant saturated colors, chibi proportions, full body, centered, ' + BG)
ICON = ('game UI icon, bold dark purple outline, glossy cel-shaded, vibrant colors, centered, '
        'square composition, ' + BG)
SCENE = ('2D side-view mobile game background, painterly cartoon style, vibrant colors, '
         'empty flat ground across the bottom quarter for characters to stand on, no characters, no text, wide 4:3 composition')

GOBLIN = 'small green-skinned goblin with big pointy ears, big orange eyes and small fangs, standing, three-quarter view facing right, '
GOBLINS = {
    'novice': 'red headband, brown loincloth, holding a crude wooden club',
    'warrior': 'gray steel armor and a crested steel helmet, holding a sword and a round wooden shield',
    'archer': 'green hood with a red feather, holding a wooden bow, quiver on the back',
    'mage': 'purple wizard hat with a gold star and a long purple robe, holding a tall wooden magic staff topped with a glowing cyan crystal',
    'rogue': 'dark hood and a face mask, dark clothes, holding a dagger',
    'knight': 'heavy silver plate armor, helmet with a red plume, holding a sword and a large blue shield with a cross',
    'berserker': 'bare chested with red war paint, wild angry expression, holding a huge battle axe',
    'sniper': 'camouflage cloak, holding a long rifle with a scope, one eye squinting',
    'ranger': 'leafy green cloak, holding a fast recurve bow, small wolf pup companion at its feet',
    'pyromancer': 'red pointed wizard hat and red robe, holding a staff topped with a burning flame',
    'necromancer': 'black hooded robe, holding a skull-topped staff with green ghostly flames, tiny skeleton minion beside',
    'assassin': 'wearing a full black ninja outfit with a black hood and face mask covering the body, glowing yellow eyes, holding two curved daggers, crouching pose',
    'pirate': 'tricorn pirate hat, eye patch, holding a cutlass, coin pouch on the belt',
    # ---- 3차 ----
    'paladin': 'radiant white and gold holy plate armor with a winged helmet and a glowing halo, holding a glowing mace and a white tower shield with a golden sun emblem',
    'crusader': 'heavy dark steel armor with a red cross tabard and a great helm, holding a broad sword and a kite shield with a red cross',
    'warlord': 'spiked black armor with a tattered war banner on the back and a horned helmet, holding a huge war hammer, commanding pose',
    'destroyer': 'massive rocky spiked shoulder armor, broken chains on the wrists, furious expression, holding an enormous cracked greataxe glowing with embers',
    'deadeye': 'sleek dark green long coat with a glowing red aiming monocle, holding a long ornate sniper rifle, calm focused expression',
    'piercer': 'light armor with a bandolier of bolts across the chest, holding a large heavy crossbow loaded with a glowing piercing bolt',
    'windwalker': 'flowing teal scarf and light cloak billowing in the wind with small wind swirls around, holding a slender bow',
    'beastmaster': 'leather vest decorated with animal fangs and feathers, holding a hunting horn, a tamed tiger cub companion beside',
    'infernomage': 'dark crimson robe with molten cracks and flames and a horned hat, holding a staff with a swirling ball of fire',
    'phoenixmage': 'orange and gold robe with phoenix feather ornaments, holding a staff topped with a small firebird, warm glow',
    'lich': 'tattered dark purple robe and a crown of bone, glowing green eyes, holding a staff topped with a floating skull, ghostly green aura',
    'soulreaper': 'black hooded cloak with glowing blue soul wisps circling around, holding a curved scythe, small soul lanterns at the belt',
    'shade': 'dark violet hooded cloak with shadowy smoke trailing, glowing purple eyes, holding twin curved daggers, sneaking pose',
    'nightblade': 'sleek midnight blue ninja outfit with a silver crescent moon mask, holding a long thin katana',
    'captain': 'red captain coat with gold buttons and a large feathered tricorn hat, holding a cutlass and a brass spyglass',
    'buccaneer': 'ragged pirate vest with a bandana and a golden earring, holding a dagger and an overflowing sack of treasure',
    # ---- 4차 ----
    'seraph': 'ornate white and gold armor with large feathered angel wings and a glowing halo, holding a radiant sword',
    'holyking': 'majestic golden royal armor with a jeweled crown and a white cape, holding a golden scepter, holy light shining',
    'inquisitor': 'stern dark armor with a hooded helm and glowing red sigils, holding a huge glowing judgement hammer and a chain',
    'templarlord': 'grand steel armor with a long crimson banner cape and a commander plume on the helmet, holding a raised longsword',
    'conqueror': 'black and gold conqueror armor with a crown-shaped helmet and a long red cape, holding a big axe, standing on a small pile of gold',
    'hordelord': 'rough heavy fur armor with a skull crown, holding a huge war horn, several tiny goblin soldiers behind',
    'avatarofruin': 'black obsidian armor with glowing red cracks and huge horns, flames swirling around, holding a colossal jagged blade',
    'titan': 'gigantic stone-plated armor like a mountain with thick arms, holding a colossal warhammer, huge and sturdy',
    'godeye': 'silver hooded cloak with a glowing golden third eye on the forehead, holding an ornate long rifle with golden engravings',
    'hawkeye': 'brown cape with hawk feathers and a leather eye guard, holding a long bow, sharp eagle-like gaze',
    'siegearcher': 'heavy armor with a huge ballista crossbow mounted on the shoulder, holding a giant bolt, sturdy stance',
    'dragonslayer': 'scaled dragon-hide armor with a dragon tooth necklace, holding a long spear, small dragon claw trophies on the belt',
    'stormarcher': 'blue and white armor with lightning crackling around, storm clouds swirling, holding a glowing lightning bow',
    'windsage': 'flowing pale green robe with wind spirals and floating leaves, holding a wooden staff with a feather, serene expression',
    'wolfking': 'gray wolf-pelt cloak with a wolf-head hood, holding a fang spear, two big wolves beside',
    'forestwarden': 'bark and vine armor with leaves and antlers on the head, holding a wooden staff wrapped in vines, a small forest spirit beside',
    'flameemperor': 'imperial red and gold robe with a crown of flames, floating fire orbs, holding a blazing scepter',
    'meteormage': 'deep indigo robe decorated with stars and comets, holding a staff with a burning meteor orb, small meteors falling',
    'phoenixlord': 'gold and crimson robe with large flaming phoenix wings spread behind, holding a staff with a glowing firebird',
    'sunpriest': 'white and golden priest robe with a sun disc headdress, holding a golden sun staff, warm light rays',
    'lichking': 'ornate bone armor with a tall jagged crown of ice and bone, glowing cyan eyes, holding a staff of skulls, frost aura',
    'soulbinder': 'dark robe with glowing chains and floating spirit orbs, holding a lantern staff, ghostly spirits circling',
    'grimreaper': 'black tattered hooded robe with a skull face and glowing eyes, holding a huge scythe, a coin bag on the belt',
    'boneemperor': 'imperial armor made of white bones with a bone crown, holding a bone scepter, skeleton soldiers behind',
    'voidwalker': 'dark purple cloak with swirling void portal effects, glowing magenta eyes, holding a strange glowing dagger',
    'phantom': 'translucent ghostly white and blue samurai armor with flowing spectral trails, holding a katana, floating slightly above the ground',
    'bloodblade': 'crimson leather armor with a red scarf, holding a katana with a blood-red glowing blade, fierce look',
    'ninjamaster': 'elite black ninja outfit with a golden scarf, holding a kunai, many shuriken, action pose',
    'seaking': 'blue and gold sea king armor with a seashell crown and pearl decorations, holding a golden trident',
    'ghostcaptain': 'tattered translucent teal captain coat with glowing green eyes, holding a spectral cutlass and a ghostly lantern',
    'treasureking': 'golden armor covered in jewels and coins with a big jeweled crown, holding a gem-encrusted sword, a treasure chest beside',
    'raiderlord': 'spiked black and red raider armor with a skull flag cape, holding a giant cleaver and a plunder sack',
}
MONSTERS = {
    'slime': 'glossy green slime blob with big cute eyes and a small smile, a small sprout on top',
    'bat': 'small bat with big ears and wide open wings, fangs',
    'wolf': 'brown wolf, side view, growling, sharp fangs',
    'boar': 'wild boar with tusks and a spiky mane, charging pose',
    'spider': 'forest spider with eight legs, red eyes, small fangs',
    'snake': 'a legless limbless green snake, long slithering body in an S curve lying on the ground, forked red tongue, no arms, no legs',
    'skeleton': 'skeleton soldier holding a rusty sword, glowing eye sockets',
    'ghost': 'round white ghost with a wavy bottom, sad-angry big eyes',
    'scorpion': 'orange scorpion seen from the side, eight legs, two big pincer claws in front, long segmented curved tail arched over its back with a stinger',
    'golem': 'stone golem with a glowing green core on the chest and mossy shoulders',
    'imp': 'small red demon imp with yellow horns, bat wings and a pointed tail, mischievous grin',
    'ogre': 'big green ogre holding a wooden club, angry expression with two tusks',
    'dragon': 'small dragon with wings spread, horns, breathing a little fire',
}
ICONS = {
    'sword': 'steel sword', 'shield': 'blue shield with a gold star', 'boots': 'leather boots with small wings',
    'party': 'three little green goblin heads together', 'pouch': 'brown pouch full of gold coins', 'coin': 'shiny gold coin',
    'crown': 'golden royal crown with a red gem', 'heart': 'red heart', 'bolt': 'yellow lightning bolt',
    'burst': 'orange-yellow explosion burst', 'anvil': 'iron blacksmith anvil', 'cap': 'graduation cap',
    'scroll': 'rolled parchment scroll', 'star': 'gold star', 'skull': 'white skull',
    'hand': 'pointing hand, finger tapping', 'lock': 'golden padlock', 'check': 'green check mark',
    'book': 'open old book', 'gem': 'blue faceted gemstone', 'arrowup': 'bold green arrow pointing up',
    'dot': 'a single perfectly round glossy red circle, just one red ball, nothing else',
}
GEAR = {
    # 무기
    'club': 'a crude wooden club with iron studs', 'dagger': 'a short steel dagger with a leather-wrapped handle',
    'hatchet': 'a one-handed steel hatchet with a wooden handle', 'sword': 'a straight steel longsword with a gold crossguard',
    'staff': 'a wooden magic staff topped with a glowing cyan crystal',
    # 방어구
    'leather': 'a brown leather armor vest with buckled straps', 'chainmail': 'a steel chainmail armor shirt with a belt',
    'plate': 'a shiny steel plate armor chestpiece with shoulder guards', 'robe': 'a blue mage robe with gold trim',
    # 액세서리
    'goldring': 'a gold ring with a red gemstone', 'luckynecklace': 'a necklace with a green four-leaf clover pendant',
    'galebracelet': 'a silver bracelet engraved with cyan wind swirls', 'featherearring': 'a pair of earrings with white feathers',
    'charm': 'a small round talisman charm with a paw print on a red string', 'friendring': 'a bronze ring with two small hearts',
    'glove': 'a leather gauntlet glove with a metal knuckle guard', 'armband': 'a red fabric armband with a gold star emblem',
}
BACKGROUNDS = {
    'biome0': 'sunny green forest hills with tall pine trees, blue sky with clouds, a small floating island in the sky',
    'biome1': 'dark purple cave interior with glowing crystals, stalactites, misty floor',
    'biome2': 'orange desert with sand dunes and cacti, big warm sun, hot hazy sky',
    'biome3': 'snowy mountains under a pale blue sky, snow-covered pine trees, frozen ground',
    'biome4': 'volcanic landscape with lava rivers, dark red sky with ash clouds, jagged black rocks',
    'biome5': 'haunted castle silhouette under a purple sky with a giant pink moon, dead trees, foggy ground',
}

# 종류별 (프롬프트 만드는 법, 생성 크기, 최종 크기, 여백 비율)
SPECS = {
    'goblins':     dict(items=GOBLINS,     prompt=lambda d: f'{CHAR}, {GOBLIN}{d}', gen=(768, 896), out=(512, 616), pad=0.05, keyed=True),
    'monsters':    dict(items=MONSTERS,    prompt=lambda d: f'{CHAR}, {d}, facing left', gen=(768, 720), out=(480, 448), pad=0.05, keyed=True),
    'icons':       dict(items=ICONS,       prompt=lambda d: f'{ICON}, {d}', gen=(512, 512), out=(128, 128), pad=0.06, keyed=True),
    'gear':        dict(items=GEAR,        prompt=lambda d: f'{ICON}, {d}', gen=(512, 512), out=(128, 128), pad=0.06, keyed=True),
    'backgrounds': dict(items=BACKGROUNDS, prompt=lambda d: f'{SCENE}, {d}', gen=(1280, 960), out=(1280, 960), pad=0, keyed=False),
}


def api_key():
    with open(os.path.expanduser('~/.pollinations-key')) as f:
        return f.read().strip()


def request_image(prompt, w, h, seed, key, tries=4):
    url = ('https://gen.pollinations.ai/image/' + urllib.parse.quote(prompt) +
           f'?model={MODEL}&width={w}&height={h}&seed={seed}&nologo=true')
    err = ''
    for i in range(tries):
        try:
            req = urllib.request.Request(url, headers={'Authorization': 'Bearer ' + key, 'User-Agent': 'Mozilla/5.0'})
            data = urllib.request.urlopen(req, timeout=240).read()
            if data[:2] == b'\xff\xd8' or data[:4] == b'\x89PNG' or data[:4] == b'RIFF':
                return data
            err = data[:200]
        except urllib.error.HTTPError as e:
            err = f'{e.code} {e.read()[:160]}'
            if e.code in (401, 402, 403):
                break
        except Exception as e:  # 네트워크 오류는 잠깐 쉬었다가 다시 시도
            err = str(e)
        time.sleep(3 + 4 * i)
    raise RuntimeError(err)


def remove_magenta(im):
    """가장자리에서 이어진 마젠타 계열 픽셀만 투명하게 만든다 (그림 안쪽의 분홍색은 그대로 둔다)."""
    a = np.asarray(im.convert('RGB')).astype(np.int16)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    # 마젠타/그 그림자: 빨강·파랑이 초록보다 확실히 높다
    cand = (r - g > 60) & (b - g > 60) & (np.abs(r - b) < 90)
    h, w = cand.shape
    seen = np.zeros_like(cand)
    q = deque()
    for x in range(w):
        for y in (0, h - 1):
            if cand[y, x] and not seen[y, x]:
                seen[y, x] = True; q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if cand[y, x] and not seen[y, x]:
                seen[y, x] = True; q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and cand[ny, nx] and not seen[ny, nx]:
                seen[ny, nx] = True; q.append((ny, nx))
    # 후드·팔 사이처럼 가장자리와 이어지지 않은 배경 조각은, 아주 진한 마젠타일 때만 지운다
    seen |= (r > 190) & (b > 190) & (g < 110)
    alpha = Image.fromarray(np.where(seen, 0, 255).astype(np.uint8))
    alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.7))   # 마젠타 테두리를 1픽셀 깎고 부드럽게
    out = im.convert('RGBA')
    out.putalpha(alpha)
    return out


def fit(im, out_size, pad):
    """투명 여백을 잘라내고, 발이 아래쪽 끝(여백 pad)에 닿도록 가운데 정렬해서 out_size 캔버스에 넣는다."""
    bbox = im.getchannel('A').point(lambda v: 255 if v > 24 else 0).getbbox()
    if bbox:
        im = im.crop(bbox)
    W, H = out_size
    scale = min(W * (1 - 2 * pad) / im.width, H * (1 - 2 * pad) / im.height)
    im = im.resize((max(1, round(im.width * scale)), max(1, round(im.height * scale))), Image.LANCZOS)
    canvas = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    canvas.paste(im, ((W - im.width) // 2, H - im.height - round(H * pad)), im)
    return canvas


def make(kind, name, retry, force, key, reprocess=False):
    spec = SPECS[kind]
    dest = os.path.join(IMG, kind, name + '.webp')
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    if os.path.exists(dest) and not force and not reprocess:
        return f'skip  {kind}/{name}'
    os.makedirs(RAW, exist_ok=True)
    idx = list(spec['items']).index(name)
    seed = 1000 + idx + 100 * retry
    raw_path = os.path.join(RAW, f'{kind}_{name}.jpg')
    if not (reprocess and os.path.exists(raw_path)):
        data = request_image(spec['prompt'](spec['items'][name]), *spec['gen'], seed, key)
        with open(raw_path, 'wb') as f:
            f.write(data)
    im = Image.open(raw_path)
    if spec['keyed']:
        im = fit(remove_magenta(im), spec['out'], spec['pad'])
        im.save(dest, 'WEBP', quality=90, method=6)
    else:
        im.convert('RGB').resize(spec['out'], Image.LANCZOS).save(dest, 'WEBP', quality=85, method=6)
    return f'ok    {kind}/{name} (seed {seed})'


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('targets', nargs='*', help='goblins | monsters | icons | backgrounds | 종류/이름 (없으면 전부)')
    ap.add_argument('--force', action='store_true', help='이미 있는 그림도 다시 만든다')
    ap.add_argument('--retry', type=int, default=0, help='씨앗을 바꿔 다른 결과를 뽑는다 (0, 1, 2 ...)')
    ap.add_argument('--reprocess', action='store_true', help='새로 생성하지 않고 images/_raw/ 원본으로 배경 제거·크기 정리만 다시 한다')
    ap.add_argument('--workers', type=int, default=4)
    ap.add_argument('--list', action='store_true', help='아무것도 만들지 않고, 만들 그림 목록과 장수만 보여 준다 (비용 확인용)')
    args = ap.parse_args()

    jobs = []
    for t in args.targets or list(SPECS):
        kind, _, name = t.partition('/')
        if kind not in SPECS:
            sys.exit(f'모르는 종류: {kind}')
        names = [name] if name else list(SPECS[kind]['items'])
        for n in names:
            if n not in SPECS[kind]['items']:
                sys.exit(f'모르는 이름: {kind}/{n}')
            jobs.append((kind, n))

    if args.list:
        todo = [(k, n) for k, n in jobs if args.force or not os.path.exists(os.path.join(IMG, k, n + '.webp'))]
        for k, n in todo:
            print(f'{k}/{n}')
        print(f'\n새로 만들 그림 {len(todo)}장 (이미 있어서 건너뜀 {len(jobs) - len(todo)}장). 요청은 장당 1번, 실패하면 최대 4번까지 다시 시도해요.')
        return

    key = api_key()
    fails = 0
    with ThreadPoolExecutor(args.workers) as ex:
        futs = [(k, n, ex.submit(make, k, n, args.retry, args.force, key, args.reprocess)) for k, n in jobs]
        for k, n, f in futs:
            try:
                print(f.result(), flush=True)
            except Exception as e:
                fails += 1
                print(f'FAIL  {k}/{n}: {e}', flush=True)
    print(f'\n끝: {len(jobs) - fails}/{len(jobs)}장 성공' + (f', {fails}장 실패' if fails else ''))
    print('다음: node tools/make-manifest.js')


if __name__ == '__main__':
    main()
