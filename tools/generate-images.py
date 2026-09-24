#!/usr/bin/env python3
"""Pollinations API로 게임 그림을 만들어 images/ 에 넣는다.

사용법 (저장소 루트에서):
  python3 tools/generate-images.py                 # 아직 없는 그림 전부 만들기
  python3 tools/generate-images.py goblins         # 한 종류만 (goblins | monsters | bosses | icons | gear | skills | vfx | backgrounds)
  python3 tools/generate-images.py goblins/knight  # 그림 한 장만
  python3 tools/generate-images.py --list          # 만들지 않고 어떤 그림이 몇 장 필요한지와 예상 비용만 보기 (종류도 함께 줄 수 있음)
  python3 tools/generate-images.py skills vfx --workers 1 --max-requests 100   # 유료 작업은 상한을 걸고 한 장씩
  python3 tools/generate-images.py --force --retry 1 goblins/knight   # 다른 결과로 다시 뽑기 (retry 번호가 씨앗을 바꿈)
  python3 tools/generate-images.py --reprocess goblins                # 원본은 그대로 두고 배경 제거만 다시

API 키는 ~/.pollinations-key 파일에서 읽는다 (저장소에는 넣지 않는다).
만든 뒤에는 `node tools/make-manifest.js` 로 목록 파일을 갱신한다.
필요한 것: Python 3, Pillow, numpy
"""
import argparse
import re
import os
import threading
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
    # 5차 (64종): 4차보다 확실히 화려하고 거대하게, 날개·오라·빛무리 같은 초월적 효과를 더해 한눈에 구분되게 한다
    'archangel': 'radiant white and gold armor with six large glowing feathered wings, a blinding golden halo, holding a massive holy greatsword wreathed in light',
    'redeemer': 'pure white judge robe with golden chains of light wrapped around, glowing golden eyes, holding a beam of concentrated holy light shaped like a spear',
    'sunmonarch': 'blazing golden armor fused with a miniature sun on the chest, a crown of solar flares, holding a radiant golden scepter',
    'heavenlord': 'floating golden armor plates orbiting the body with golden clouds swirling below the feet, holding twin glowing scales of judgement',
    'condemner': 'black and red judge robe with burning brand marks glowing across the arms, holding a massive glowing branding-iron blade',
    'judgment': 'golden scale-plate armor with glowing scales of justice floating behind like wings, holding a flaming judgement sword',
    'grandduke': 'ornate golden ducal armor with a long flowing crimson cape and a war banner on the back, holding a glowing golden lance',
    'immortalknight': 'cracked ancient stone-gold armor glowing with self-healing golden light, holding an unbreakable glowing shield and sword',
    'earthconqueror': 'armor of fused gold and stone plates, standing atop a small floating chunk of conquered land, holding a colossal golden battleaxe',
    'tyrant': 'spiked black iron crown fused into a cracked obsidian helmet, armor glowing with red fissures, holding a massive spiked iron flail',
    'legionfather': 'towering banner-back armor with dozens of tiny glowing spectral soldiers swirling around, holding a massive war standard',
    'allarmyking': 'golden imperial armor with a faint ghostly army silhouette marching behind, holding a crown-topped scepter and a giant war horn',
    'apocalypse': 'shattered black armor leaking red cracks of pure void energy, massive wings of drifting ash, holding a blade that tears reality',
    'chaoslord': 'swirling purple and black armor that constantly warps and shifts, glowing chaotic runes, holding an ever-changing chaotic blade',
    'colossus': 'gigantic mountain-sized stone armor with glowing molten cracks running through it, holding an enormous stone warhammer bigger than its own body',
    'mountainlord': 'armor fused with real rock and green moss, small trees growing from the shoulders, holding a mountain-peak shaped hammer',
    'farsight': 'sleek golden sniper armor with a glowing all-seeing third eye set in a crown, holding an impossibly long ornate golden rifle',
    'judgearrow': 'holy archer armor with glowing golden judgement runes running along the bowstring, holding a massive bow made of solid light',
    'skyhawk': 'feathered hawk-wing armor with a beak-shaped golden helmet, mid-dive pose, holding a lightning-fast crossbow, wind trailing behind',
    'stormsniper': 'storm-gray armor crackling with electricity, a glowing targeting eye embedded in the helmet, holding a thunder-charged sniper rifle',
    'wallbreaker': 'massive siege armor with a battering-ram shoulder piece, holding an enormous stone-shattering ballista bolt',
    'siegemaster': 'fortress-like heavy armor with a small siege engine mounted on the back, holding several giant glowing bolts, commanding stance',
    'dragonbane': 'dragon-scale armor forged from a slain dragon with a dragon-skull helmet, holding a massive fire-wreathed dragon-slaying spear',
    'legendhunter': 'golden trophy-adorned hunter armor decked with trophies of legendary beasts, holding an ornate glowing legendary bow',
    'thunderavatar': 'armor made entirely of crackling blue lightning bolts, glowing electric-blue eyes, holding a bow woven from pure lightning',
    'galeforce': 'wind-swept armor with a small tornado constantly swirling around the body, holding a bow bent by hurricane-force wind',
    'windarchsage': 'flowing sage robe woven from wind and pale green energy, floating leaves and glowing orbs circling around, holding an ancient wind-carved staff',
    'stormjudge': 'dark storm-cloud robe crackling with lightning from the hands, a golden judge mask, holding a thunderbolt-shaped staff',
    'primalwolf': 'ancient primal wolf-fur armor with glowing tribal markings, a huge translucent ghost-wolf spirit looming behind, holding a bone spear',
    'packlord': 'wolf-king armor topped with a crown of fangs, a whole pack of glowing spectral wolves surrounding, howling commanding pose',
    'ancientspirit': 'armor made of living bark and glowing green moss, small antlers sprouting tiny glowing flowers, a tree-spirit face on the chest',
    'naturejudge': 'thorny living-vine armor etched with glowing green judgement runes, holding a staff that blooms with flowers and thorns',
    'firegod': 'colossal armor of solid magma and living fire, a crown of pure flame, holding a scepter channeling a miniature erupting volcano',
    'infernolord': 'black obsidian armor cracked with molten lava, massive wings made of fire, holding a scepter topped with a swirling black flame',
    'doomstar': 'cosmic dark robe scattered with tiny burning stars, a crown made of a captured meteor, holding a staff with a burning comet trapped inside',
    'celestialbreaker': 'armor plated with glowing fragments of a shattered planet floating around it, holding a staff that cracks reality with cosmic energy',
    'eternalflame': 'gold and blue phoenix-feather armor with an eternal blue-gold flame burning on the chest, large flaming phoenix wings spread wide',
    'rebirthlord': 'ashen robe constantly reforming itself from drifting golden ash, a crown of phoenix ash, holding a staff topped with a newly reborn firebird',
    'sungodpriest': 'radiant golden priest armor with a full glowing sun-disc halo, holding a scepter channeling a beam of concentrated sunlight',
    'dawnsaint': 'soft pastel gold and pink priest robe glowing like a sunrise, small wings made of light, holding a staff crowned with dawn light',
    'deathgrandduke': 'imperial bone and shadow armor with a floating black crown above the head, holding a scepter radiating pure death energy',
    'eternalking': 'ancient undead king armor fused with ice and bone, a faint endless spectral army visible behind, holding a frozen crown-topped staff',
    'soullord': 'dark robe wrapped in countless glowing blue soul-chains, a crown of floating souls, holding a lantern staff that holds trapped souls',
    'thousandsouls': 'robe woven from swirling translucent souls, a thousand tiny ghostly faces faintly visible in the fabric, holding a staff of bound souls',
    'endscythe': 'imperial reaper armor trimmed in gold, wielding a massive black and gold scythe glowing with a final golden edge',
    'judgereaper': 'hooded reaper robe with glowing golden scales of judgement on the chest, holding a scythe wrapped in golden chains',
    'skeletonking': 'ornate bone-plate armor forming a crown of small skulls, a tiny skeleton legion marching faintly behind, holding a bone scepter',
    'tomblord': 'ancient cursed tomb-stone armor etched with glowing purple runes, ghostly tomb doors floating behind, holding a cursed stone staff',
    'voidlord': 'armor made of swirling black void fabric cracked with purple lightning, a small portal opening on the back, holding a void-forged blade',
    'dimensionslayer': 'sleek dark armor with glowing dimensional rift lines running across it, holding a blade that visibly cuts a crack in the air',
    'thousandphantom': 'translucent spectral armor with faint afterimages trailing constantly, holding a katana, surrounded by ghostly duplicate silhouettes',
    'phantomlord': 'ghostly semi-transparent commander armor, a crown of drifting spirit flames, holding a katana wreathed in spectral mist',
    'bloodlord': 'crimson armor with a cape that drips like flowing blood, a crown of thorns, holding a katana with a glowing blood-red edge',
    'slaughterer': 'battle-worn dark red armor covered in scars and dried blood streaks, wild fierce expression, holding a massive blood-stained blade',
    'shadowgrandmaster': 'elite black and violet ninja armor with a golden sash, commanding a ring of faint shadow-clone silhouettes, holding twin kunai',
    'tenthousandninja': 'sleek black ninja armor with countless faint shadow duplicates fading around it, holding shuriken in both hands, dynamic action pose',
    'abysslord': 'deep-sea armor made of dark coral and pearls with glowing bioluminescent markings, holding a massive abyssal trident',
    'stormseaking': 'stormy blue and gold sea-king armor with lightning crackling over crashing waves, holding a lightning-charged golden trident',
    'cursedfleetlord': 'tattered ghostly admiral coat glowing sickly green, a faint ghost-ship silhouette looming behind, holding a cursed cutlass',
    'deathvoyager': 'skeletal captain armor draped in a tattered dark cloak, glowing lantern-like eyes, holding a spectral anchor-chain weapon',
    'goldenlord': 'armor entirely plated in gleaming gold and jewels, golden coins raining faintly around, holding a jewel-encrusted golden cutlass',
    'infinitehoard': 'armor with an endless stream of gold coins and gems spilling from an open treasure chest mounted on the back, holding a treasure-laden blade',
    'raidavatar': 'wild raider armor wreathed in raiding flames, a tattered banner cape, holding a burning cleaver, fierce battle stance',
    'doomraider': 'dark spiked raider armor with a skull-flag cape, an ominous dark aura, holding a massive cleaver dripping with dark energy',
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
# 지역별 일반 몬스터 전용 그림 48종 (game.js MONSTER_TABLE의 세 번째 값과 이름이 같아야 한다)
MONSTERS.update({
    # 고블린 숲
    'forest_slime': 'glossy green forest slime blob with a leaf and a small flower on top, big cute eyes',
    'forest_wolf': 'grey-brown forest wolf, side view, growling, bushy tail, leaves stuck in its fur',
    'forest_boar': 'brown wild boar with big white tusks and a spiky mane, charging pose, mud on its hooves',
    'forest_spider': 'green and brown forest spider with eight legs, a leaf pattern on its back, red eyes',
    'forest_snake': 'legless purple and green poison snake coiled on the ground, dripping green venom from its fangs, no arms, no legs',
    'mushroom': 'cute walking mushroom creature with a big red cap with white spots, tiny legs, grumpy face',
    'treant_sprout': 'small walking tree spirit with a bark body, leafy head, twig arms and glowing green eyes',
    'forest_bee': 'giant chubby bumblebee with yellow and black stripes, big stinger, buzzing wings, angry eyes',
    # 어둠의 동굴
    'cave_bat': 'dark purple cave bat with huge ears, glowing yellow eyes and wide wings, fangs',
    'cave_spider': 'black cave spider with glowing blue markings, eight long legs and many shining eyes',
    'cave_slime': 'a round translucent dark blue jelly slime blob, no arms, no legs, no hair, glowing crystals floating inside the jelly, big cute eyes',
    'miner_skeleton': 'skeleton miner wearing a helmet with a candle lamp, holding a pickaxe, glowing eye sockets',
    'cave_ghost': 'pale blue cave ghost holding a small lantern, wavy tail, spooky big eyes',
    'crystal_crab': 'crab with a shell made of glowing purple crystals, two big pincers, eight legs',
    'mole_digger': 'chubby mole miner wearing tiny goggles, big digging claws, holding a small shovel',
    'glow_worm': 'long legless cave worm with glowing cyan spots along its body, round mouth with small teeth, no legs',
    # 불타는 사막
    'desert_scorpion': 'sand-colored desert scorpion seen from the side, two big pincers, eight legs, curved segmented tail with a stinger',
    'desert_snake': 'legless sand-yellow desert rattlesnake with diamond patterns coiled on the sand, rattle tail, no arms, no legs',
    'sand_golem': 'golem made of packed sand and sandstone blocks with glowing orange eyes, sand crumbling off',
    'sand_slime': 'sandy tan slime blob with a tiny cactus sprouting on top, big eyes',
    'desert_bat': 'sand-colored desert bat with big ears and tattered wings, squinting eyes, fangs',
    'mummy': 'mummy wrapped in old bandages with one glowing red eye showing, arms stretched forward',
    'cactus_man': 'angry walking cactus warrior with spiky arms, a pink flower on its head, tiny feet',
    'vulture': 'bald desert vulture with dark brown feathers, hunched pose, sharp hooked beak, spread wings',
    # 얼음 산맥
    'frost_wolf': 'white and icy blue frost wolf with frosty fur, snowflakes around it, growling, icy breath',
    'ice_slime': 'translucent light blue ice slime blob with small icicles on top and frost sparkles, big eyes',
    'ice_golem': 'golem made of blue ice blocks with glowing white eyes and sharp icicle shoulders',
    'frost_bat': 'pale blue frost bat with icicle-tipped wings, frosty breath, glowing blue eyes',
    'snow_ghost': 'white snow ghost made of swirling snowflakes, wavy tail, cold blue eyes',
    'penguin_knight': 'small penguin knight wearing a tiny steel helmet, holding a little spear and a round shield',
    'yeti_cub': 'fluffy white baby yeti with big blue eyes, small horns and big furry fists, angry pout',
    'ice_fox': 'white arctic fox with glowing icy blue tail tips and frost crystals on its fur, pouncing pose',
    # 화산 지대
    'lava_imp': 'small red lava imp with yellow horns, bat wings, a pointed tail and a tiny fireball in its hand, grin',
    'lava_slime': 'glowing orange molten lava slime blob with bubbling magma and small flames on top, big eyes',
    'lava_golem': 'golem made of black volcanic rock with glowing orange lava cracks and a magma core',
    'fire_scorpion': 'red fire scorpion with a flaming tail stinger, two big glowing pincers, eight legs, side view',
    'fire_bat': 'a small round-bodied bat with big pointy ears and leathery bat wings edged with flames, orange fur, fangs, not a dragon, no tail, no horns',
    'salamander': 'red and orange fire salamander lizard with flames running along its back, four short legs, long tail',
    'magma_hound': 'black hellhound with a glowing magma-cracked body and a flaming mane, snarling',
    'fire_spirit': 'floating fire spirit made of dancing flames with a cute angry face and small flame arms',
    # 저주받은 성
    'skeleton_soldier': 'skeleton soldier in rusty armor holding a notched sword and a cracked shield, glowing eye sockets',
    'castle_ghost': 'noble ghost wearing a translucent old ruffled collar and a crown, holding a candle, wavy tail',
    'vampire_bat': 'dark red vampire bat with a cape-like wing pattern, long fangs, glowing red eyes',
    'gargoyle': 'grey stone gargoyle with horns, stone wings and claws, crouching, glowing purple eyes',
    'curse_spider': 'black spider with a glowing purple skull pattern on its back, eight legs, cursed purple mist',
    'living_armor': 'empty knight armor walking by itself with glowing blue light inside the helmet visor, holding a greatsword',
    'cursed_doll': 'creepy cursed rag doll with button eyes, stitched mouth, holding a needle, floating slightly',
    'shadow_wolf': 'wolf made of black shadow smoke with glowing purple eyes and wispy dark tendrils, growling',
})
# 옆으로 흐르는 층별 배경 (지역마다 하늘·먼 산·중간·가까운 땅 4겹). 하늘 말고는 마젠타 배경을 지워 투명하게 만든다.
LAYER = 'side-scrolling 2D mobile game parallax background layer, cartoon style, cel-shaded, soft vibrant colors, wide horizontal panorama, no characters, no text, no border'
LAYER_BIOMES = [
    dict(sky='bright blue sky with fluffy white clouds and a warm sun', far='distant blue-green mountains', mid='green pine forest treeline and rolling grassy hills', near='grassy dirt ground with grass tufts, small flowers and pebbles'),
    dict(sky='dark purple cave ceiling with glowing crystals and hanging stalactites', far='distant dark purple rock pillars and crystal formations', mid='glowing purple and cyan crystal clusters and big rocks', near='dark cave floor with small glowing crystals and pebbles'),
    dict(sky='hot orange desert sky with a big sun and hazy clouds', far='distant sand dunes and flat-topped mesas', mid='tall cacti, sand dunes and desert rocks', near='sandy ground with small rocks, old bones and dry grass'),
    dict(sky='pale blue winter sky with soft clouds and falling snowflakes', far='distant snowy mountain peaks', mid='snow-covered pine trees and snowy hills', near='snowy ground with ice chunks and snow drifts'),
    dict(sky='dark red smoky volcanic sky with ash clouds and glowing embers', far='distant erupting volcano silhouettes', mid='black volcanic rocks with glowing orange lava cracks', near='cracked black ground with small lava pools and embers'),
    dict(sky='dark purple night sky with a big full moon and small bats', far='distant haunted castle towers silhouettes', mid='dead twisted trees, tombstones and iron fences', near='cursed stone ground with cracked tiles, small skulls and purple mist'),
]
LAYERS = {}
for _b, _d in enumerate(LAYER_BIOMES):
    LAYERS[f'biome{_b}_sky'] = f'sky only: {_d["sky"]}, no ground, no mountains, fills the whole image'
    LAYERS[f'biome{_b}_far'] = f'a row of {_d["far"]} along the bottom half of the image, the top half is empty, {BG}'
    LAYERS[f'biome{_b}_mid'] = f'{_d["mid"]} along the bottom third of the image, everything above is empty, {BG}'
    LAYERS[f'biome{_b}_near'] = f'a close-up strip of {_d["near"]} along the very bottom quarter of the image, everything above is empty, {BG}'
# 던전 보스 전용 그림 (일반 몬스터보다 크고 위협적으로). dungeon.js BOSS_ART의 값과 이름이 같아야 한다.
BOSSES = {
    'goblin_chief': 'a massive muscular goblin chieftain with a spiked bone crown, wielding a huge crude club, war paint, roaring',
    'raiding_orc': 'a brutal green orc raider in spiked leather armor, wielding a jagged cleaver, tusks bared, battle scars',
    'cave_troll': 'a hulking gray cave troll with rocky warty skin, hunched posture, wielding a massive stone club, glowing cave crystals nearby',
    'swamp_hydra': 'a three-headed green swamp hydra with long serpentine necks, dripping venom, murky swamp water around its body',
    'frost_giant': 'a towering blue-skinned frost giant in icy armor, wielding a massive ice-covered warhammer, frozen breath, snow swirling',
    'lava_lord': 'a molten rock humanoid lord with glowing lava cracks all over its body, wielding a burning obsidian blade, flames erupting',
    'abyss_warden': 'a dark abyssal guardian with glowing purple eyes, tentacle-like tendrils, heavy dark armor, deep-sea aura',
    'storm_avatar': 'a humanoid avatar made of swirling storm clouds and lightning, crackling electricity, glowing eyes, thunderous aura',
    'thousand_eye_lich': 'an ancient lich in a tattered robe covered in glowing eyes, a crown of skulls, holding a staff radiating dark magic',
    'primal_firedragon': 'a colossal ancient red dragon with massive wings spread, breathing intense fire, glowing molten scales',
    'throne_shadow': 'a shadowy king-like figure made of living darkness sitting atop a broken throne, glowing red eyes, wisps of shadow trailing',
    'doom_gatekeeper': 'a massive armored gatekeeper guardian with a huge glowing rune-covered shield and sword, standing before a cracked dark portal',
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
    'gate': 'a glowing purple magic portal inside a stone archway, dungeon entrance',
    'ticket': 'a golden admission ticket with a dashed perforated line and a checkmark stamp',
    'chest': 'a closed wooden treasure chest with gold trim and a gold lock',
    'medal': 'a gold ribbon medal with a star, first place award',
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
    # 전설 이상 전용 (화려하게)
    'dragonblade': 'a legendary ornate greatsword with a dragon head crossguard, crimson blade glowing with embers, gold filigree',
    'stormspear': 'a legendary spear with a crackling lightning-shaped silver blade, blue electric glow, wrapped in storm ribbons',
    'soulscythe': 'a legendary dark scythe with a curved violet blade, ghostly soul flames swirling around it, bone handle',
    'dragonplate': 'a legendary crimson dragon-scale plate armor chestpiece with horned gold pauldrons and a glowing ruby core',
    'celestialrobe': 'a legendary white and gold celestial robe with starry night patterns and glowing constellation runes',
    'midasring': 'a legendary radiant gold ring with a huge sparkling diamond, gold coins orbiting around it',
    'windwing': 'a legendary silver wing-shaped ornament with cyan wind swirls and a glowing emerald',
    'warhorn': 'a legendary ornate war horn with gold bands and glowing runes, blue light pouring out of its mouth',
    'titangauntlet': 'a legendary massive stone and gold titan gauntlet with glowing orange cracks and rune knuckles',
}
SKILLS = {
    # 1차
    'warrior': 'a steel sword slashing down with a golden shockwave and sparks',
    'archer': 'three arrows fired rapidly in a fan with speed lines',
    'mage': 'four glowing blue magic missiles flying outward in a burst',
    'rogue': 'a shuriken dripping with green poison',
    # 2차
    'knight': 'a large blue shield with a glowing translucent barrier dome around it',
    'berserker': 'a battle axe with red blood drops and a red heart',
    'sniper': 'a rifle scope crosshair with a red bullseye',
    'ranger': 'a glowing green paw print with a small wolf head',
    'pyromancer': 'a burning flame igniting with orange swirls',
    'necromancer': 'a small skeleton soldier rising from a green magic circle',
    'assassin': 'a dagger stabbing a crown shaped target with a red mark',
    'pirate': 'a pirate treasure chest overflowing with gold coins',
    # 3차
    'paladin': 'a glowing golden cross with green healing sparkles',
    'crusader': 'a red banner with a cross and a roaring sound wave',
    'warlord': 'a war banner with lightning and rage flames',
    'destroyer': 'a giant hammer smashing the ground with cracks and rocks flying',
    'deadeye': 'a sniper crosshair on a giant monster silhouette',
    'piercer': 'a heavy crossbow bolt piercing through a steel plate',
    'windwalker': 'a cyan wind gust swirl with a feather',
    'beastmaster': 'a tiger claw slash with a roaring tiger head',
    'infernomage': 'a huge fireball meteor exploding with lava',
    'phoenixmage': 'a glowing flaming phoenix feather inside a shimmering shield',
    'lich': 'a skull draining green life energy into a heart',
    'soulreaper': 'a curved scythe harvesting a blue soul wisp',
    'shade': 'purple shadow chains binding a dark hand',
    'nightblade': 'a crescent moon shaped slash with a katana',
    'captain': 'a pirate cannon firing a cannonball with smoke',
    'buccaneer': 'a treasure map with a gold X and a coin sack',
    # 4차
    'seraph': 'angel wings with a golden halo and a holy shield glow',
    'holyking': 'a golden crown radiating holy light rays',
    'inquisitor': 'a glowing red rune brand with iron chains',
    'templarlord': 'a sword raised high with a golden banner and small wings',
    'conqueror': 'a golden crown on a pile of coins next to a sword',
    'hordelord': 'several small goblin soldiers with spears charging',
    'avatarofruin': 'a black obsidian sword with red cracks and flames',
    'titan': 'a giant stone fist with a red rage aura',
    'godeye': 'a golden third eye with a bullet trail',
    'hawkeye': 'a hawk diving with talons out and speed lines',
    'siegearcher': 'a giant ballista bolt breaking a stone wall',
    'dragonslayer': 'a spear stabbing a dragon head silhouette',
    'stormarcher': 'an arrow crackling with yellow lightning bolts',
    'windsage': 'green healing leaves swirling in the wind',
    'wolfking': 'three wolf heads howling under a moon',
    'forestwarden': 'a wooden shield made of thick vines and leaves',
    'flameemperor': 'a burning flame crown with a fire scepter',
    'meteormage': 'multiple meteors falling from a starry sky',
    'phoenixlord': 'a rising phoenix with wings spread in golden flames',
    'sunpriest': 'a blazing sun disc with a brand mark',
    'lichking': 'a skull crown above a rising skeleton army',
    'soulbinder': 'glowing ghost spirits forming a protective ring',
    'grimreaper': 'a huge scythe with a skull hood',
    'boneemperor': 'a bone crown with crossed bones and skeleton hands',
    'voidwalker': 'a dagger inside a swirling purple void portal',
    'phantom': 'a ghostly translucent samurai with afterimages',
    'bloodblade': 'a katana dripping with blood forming a red heart',
    'ninjamaster': 'three ninja silhouettes with shuriken and smoke',
    'seaking': 'a giant blue tidal wave with a golden trident',
    'ghostcaptain': 'a ghostly ship with green flames',
    'treasureking': 'gold coins and gems raining down',
    'raiderlord': 'a skull flag with a cleaver and a loot sack',
    # 5차
    'archangel': 'a radiant six-winged angel with a golden halo blessing the ground',
    'redeemer': 'a massive beam of holy light striking down from the sky',
    'sunmonarch': 'a golden crown fused with a blazing sun disc',
    'heavenlord': 'clouds parting to reveal a floating golden throne',
    'condemner': 'a burning judgment seal branding a chained silhouette',
    'judgment': 'a giant golden scale of justice wreathed in fire',
    'grandduke': 'a golden banner and warhorn charging with light trails',
    'immortalknight': 'a knight standing unbroken inside a glowing barrier dome',
    'earthconqueror': 'a cracked golden throne rising from conquered land',
    'tyrant': 'a spiked iron crown crushing a battlefield underfoot',
    'legionfather': 'a war standard surrounded by countless spear tips',
    'allarmyking': 'a golden crown above a massive marching army silhouette',
    'apocalypse': 'a black sky splitting open with red apocalyptic light',
    'chaoslord': 'swirling purple chaos energy forming a crown',
    'colossus': 'a colossal stone fist slamming down with shockwaves',
    'mountainlord': 'a mountain range crumbling under a giant footstep',
    'farsight': 'a glowing golden eye with concentric targeting rings',
    'judgearrow': 'a golden arrow wrapped in judgment runes',
    'skyhawk': 'a hawk diving through clouds trailing golden light',
    'stormsniper': 'a rifle scope crackling with storm lightning',
    'wallbreaker': 'a massive arrow shattering a stone wall into rubble',
    'siegemaster': 'multiple ballista bolts raining down on a fortress',
    'dragonbane': 'a spear piercing through a dragon skull silhouette',
    'legendhunter': 'a golden trophy arrow crossed with a hunting horn',
    'thunderavatar': 'a humanoid figure made entirely of crackling lightning',
    'galeforce': 'a spiraling tornado of wind blades',
    'windarchsage': 'green wind leaves swirling around a glowing staff',
    'stormjudge': 'a lightning bolt striking a golden scale of justice',
    'primalwolf': 'an ancient glowing wolf howling under a full moon',
    'packlord': 'a wolf pack silhouette howling together under moonlight',
    'ancientspirit': 'a glowing tree spirit face made of vines and light',
    'naturejudge': 'thorny vines wrapping around a glowing judgment seal',
    'firegod': 'a colossal flame deity crown wreathed in inferno',
    'infernolord': 'a throne of magma erupting with black flames',
    'doomstar': 'a burning meteor falling from a starry sky with a trail',
    'celestialbreaker': 'a cracked planet shattering with cosmic energy',
    'eternalflame': 'an eternal blue-gold flame that never goes out',
    'rebirthlord': 'a phoenix rising again from golden ashes',
    'sungodpriest': 'a sun deity mask radiating golden judgment beams',
    'dawnsaint': 'a saint haloed by the first light of dawn',
    'deathgrandduke': 'a skeletal hand holding a black scepter of death',
    'eternalking': 'a skull crown atop an endless army of undead',
    'soullord': 'countless blue soul wisps orbiting a dark crown',
    'thousandsouls': 'a thousand ghostly faces swirling into one mass',
    'endscythe': 'a massive black scythe cutting a golden thread of fate',
    'judgereaper': 'a hooded reaper holding a glowing judgment scythe',
    'skeletonking': 'a bone crown atop a marching skeleton legion',
    'tomblord': 'a cursed tombstone glowing with purple runes',
    'voidlord': 'a swirling black void portal with purple lightning',
    'dimensionslayer': 'a blade slicing open a crack in reality',
    'thousandphantom': 'a thousand translucent afterimages of a warrior',
    'phantomlord': 'a ghostly figure commanding smaller phantom copies',
    'bloodlord': 'a crimson crown dripping with blood',
    'slaughterer': 'a blood-soaked blade with a trail of red slashes',
    'shadowgrandmaster': 'a shadowy figure commanding an army of shadow clones',
    'tenthousandninja': 'countless ninja silhouettes exploding from smoke',
    'abysslord': 'a giant trident rising from a swirling deep-sea abyss',
    'stormseaking': 'a golden trident summoning a raging ocean storm',
    'cursedfleetlord': 'a ghostly cursed fleet emerging from green fog',
    'deathvoyager': 'a skeletal captain sailing a ship through dark waves',
    'goldenlord': 'a tidal wave of molten gold coins',
    'infinitehoard': 'an endless treasure vault overflowing with gold and gems',
    'raidavatar': 'a pirate captain silhouette engulfed in raiding flames',
    'doomraider': 'a burning skull flag over a plundered ruin',
}
# 전투 이펙트 스프라이트 (화면에서 크기·회전·투명도를 움직여 쓴다)
VFX = {
    'slash_white': 'a bright white crescent sword slash streak with motion blur and a glowing edge',
    'slash_gold': 'a golden holy crescent slash with sparkles',
    'slash_fire': 'a fiery orange crescent slash with flames',
    'slash_dark': 'a purple dark crescent slash with shadow smoke',
    'claw_slash': 'three parallel red claw slash marks',
    'impact_burst': 'a yellow and white star shaped impact burst with sparks radiating outward',
    'explosion_fire': 'a cartoon fire explosion with orange and yellow flames',
    'explosion_magic': 'a blue and purple magic explosion with sparkles',
    'lightning': 'a yellow lightning bolt strike with an electric glow',
    'heal_light': 'a green healing light column with rising sparkles and plus signs',
    'shield_bubble': 'a translucent blue energy shield bubble with a hexagon pattern',
    'magic_circle': 'a glowing cyan runic magic circle seen from a slight angle',
    'summon_circle': 'a green and purple necromancy summoning circle with small skulls',
    'coin_burst': 'a burst of golden coins and sparkles',
    'poison_cloud': 'a green poison cloud with bubbles and small skull wisps',
    'stun_stars': 'a ring of yellow stars and swirls, dizzy effect',
    'wind_swirl': 'a cyan wind vortex swirl with leaves',
    'rage_aura': 'a red flame aura burst with angry energy',
    # 근접 휘두름 궤적: 캐릭터 앞쪽에 고정 방향으로 잠깐 보였다 사라진다 (회전시키지 않는다 — 돌리면 로딩 스피너처럼 보였다)
    'swing_sword': 'a single wide white sword swing trail arc sweeping from upper left down to lower right, thick bright leading edge tapering to a thin fading tail, motion blur speed lines, side view',
    'swing_axe': 'a single heavy orange axe swing trail arc sweeping from upper left down to lower right, thick fiery leading edge with sparks, tapering tail, motion blur',
    'swing_holy': 'a single golden holy sword swing trail arc sweeping from upper left down to lower right, radiant leading edge with light sparkles, tapering tail',
    'swing_hammer': 'a heavy smash motion trail only, a thick curved white and grey arc swooshing down from the top right to the bottom, no weapon, no blade, a round dust cloud burst with flying rocks at the bottom',
    'thrust_dagger': 'two short parallel horizontal white stab streaks pointing right with a small bright star flash at the tips, thin speed lines, no arrow heads, no weapon',
    # 감정 아이콘: 캐릭터·몬스터 머리 위에 잠깐 떠오른다 (만화 말풍선 기호)
    'emo_alert': 'a bold red exclamation mark with a white outline, manga emotion symbol',
    'emo_angry': 'a red cross-shaped anger vein symbol, manga angry emotion mark',
    'emo_sweat': 'a single big light blue sweat drop, manga nervous emotion symbol',
    'emo_sparkle': 'three shining yellow four-pointed sparkle stars, manga excited emotion symbol',
    'emo_heart': 'a cute glossy pink heart with a small shine, manga love emotion symbol',
    'emo_dizzy': 'a spiral swirl with small yellow stars around it, manga dizzy emotion symbol',
    'emo_note': 'two cheerful musical notes, happy humming emotion symbol',
    'emo_fire': 'a small burning flame with determined fiery energy, manga fighting spirit symbol',
}
# 몬스터에 맞는 순간 터지는 타격 이펙트: 공격 방식 13종 × (기본 hit_: 1~3차, 화려한 hitx_: 4~5차)
HIT_STYLES = {
    'slash': 'a white and silver sword slash impact with crossed slash lines and sparks',
    'axe': 'a heavy orange cleaving axe impact with a jagged split and flying chips',
    'hammer': 'a crushing heavy impact with a round shockwave ring and flying rock debris',
    'holy': 'a golden holy light impact with a glowing cross and radiant rays',
    'dagger': 'a quick crimson double stab impact with two small sharp star flashes',
    'arrow': 'an arrow hit impact with green wind swirls, feathers and a small burst',
    'bolt': 'a crossbow bolt piercing impact with steel shards and speed lines',
    'bullet': 'a gunshot bullet impact with a bright white spark star and a smoke puff',
    'shuriken': 'a shuriken hit impact with a purple star burst and thin cut lines',
    'coin': 'a coin hit impact with a splash of gold coins and sparkles',
    'orb': 'a blue arcane orb impact with swirling runes and sparkles',
    'fire': 'a fireball impact explosion with flames and embers',
    'dark': 'a dark necromancy impact with a purple and green skull smoke burst',
}
# 직업 속성 이펙트: 공격 방식 타격 그림 위에 겹쳐 터진다 (skills.js CLASS_ELEMENT)
ELEMENT_FX = {
    'fire': 'an orange fire burst with licking flames and embers flying outward',
    'hellfire': 'a crimson and black hellfire burst with dark red flames and ash',
    'ice': 'an icy blue frost burst with sharp ice crystal shards and snowflakes',
    'lightning': 'a crackling yellow lightning burst with branching electric arcs',
    'poison': 'a toxic green poison splash burst with bubbling droplets',
    'holy': 'a white and gold holy light burst with feathers and a halo ring',
    'shadow': 'a black and deep purple shadow smoke burst with wisps',
    'blood': 'a crimson blood splash burst with sharp red slash streaks',
    'wind': 'a pale cyan wind gust burst with swirling air currents and leaves',
    'earth': 'a brown rock and earth burst with flying stones and dust',
    'water': 'a blue water splash burst with droplets and a ripple ring',
    'nature': 'a green nature burst with spinning leaves, vines and flower petals',
    'gold': 'a shiny gold treasure burst with gold coins and gems flying outward',
    'soul': 'a ghostly teal soul flame burst with wispy spirit faces',
    'void': 'a dark purple void rift burst with a swirling black hole center and violet sparks',
    'star': 'a cosmic starlight burst with twinkling white and blue stars',
    'rune': 'a glowing blue arcane rune circle burst with floating glyphs',
    'bone': 'a pale bone shard burst with small skulls and green ghost fire',
    'sun': 'a radiant golden sun burst with long light rays',
    'beast': 'a wild beast claw burst with three torn claw marks and fur tufts',
    'steel': 'a silver steel spark burst with metal shards and bright sparks',
    'moon': 'a silver crescent moon burst with pale blue moonlight glow',
    'storm': 'a dark storm burst with grey clouds, rain streaks and lightning flashes',
}
for _k, _d in ELEMENT_FX.items():
    VFX['el_' + _k] = _d
for _k, _d in HIT_STYLES.items():
    VFX['hit_' + _k] = _d
    VFX['hitx_' + _k] = ('an epic legendary ' + re.sub(r'^an? ', '', _d) +
                         ', huge and extremely flashy, with a glowing magic circle, radiant light beams and many bright sparkles')

FX = ('game visual effect sprite, bold dark outline, glossy cel-shaded, vibrant colors, centered, square composition, '
      'no character, no text, ' + BG)
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
    'bosses':      dict(items=BOSSES,      prompt=lambda d: f'{CHAR}, epic dungeon boss monster, {d}, facing left, dramatic powerful pose', gen=(768, 720), out=(480, 448), pad=0.05, keyed=True),
    'icons':       dict(items=ICONS,       prompt=lambda d: f'{ICON}, {d}', gen=(512, 512), out=(128, 128), pad=0.06, keyed=True),
    'gear':        dict(items=GEAR,        prompt=lambda d: f'{ICON}, {d}', gen=(512, 512), out=(128, 128), pad=0.06, keyed=True),
    'skills':      dict(items=SKILLS,      prompt=lambda d: f'{ICON}, {d}', gen=(512, 512), out=(128, 128), pad=0.06, keyed=True),
    'vfx':         dict(items=VFX,         prompt=lambda d: f'{FX}, {d}', gen=(512, 512), out=(256, 256), pad=0.03, keyed=True),
    'layers':      dict(items=LAYERS,      prompt=lambda d: f'{LAYER}, {d}', gen=(1280, 640), out=(1280, 640), pad=0, keyed=True, layer=True),
    'backgrounds': dict(items=BACKGROUNDS, prompt=lambda d: f'{SCENE}, {d}', gen=(1280, 960), out=(1280, 960), pad=0, keyed=False),
}


def api_key():
    with open(os.path.expanduser('~/.pollinations-key')) as f:
        return f.read().strip()


# 요청 1번당 0.005 pollen (klein 모델 정액). 유료 작업이라 요청 횟수에 상한을 두고, 넘기면 스스로 멈춘다.
PRICE_PER_REQUEST = 0.005
_budget = {'left': None, 'used': 0}
_budget_lock = threading.Lock()


def spend_request():
    with _budget_lock:
        if _budget['left'] is not None and _budget['used'] >= _budget['left']:
            raise RuntimeError(f"예산 상한 도달: 요청 {_budget['used']}번({_budget['used'] * PRICE_PER_REQUEST:.3f} pollen)을 이미 썼어요. --max-requests 로 상한을 올릴 수 있어요.")
        _budget['used'] += 1


def request_image(prompt, w, h, seed, key, tries=4):
    url = ('https://gen.pollinations.ai/image/' + urllib.parse.quote(prompt) +
           f'?model={MODEL}&width={w}&height={h}&seed={seed}&nologo=true')
    err = ''
    for i in range(tries):
        try:
            spend_request()   # 재시도도 요청이므로 모두 센다
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
    if spec.get('layer') and name.endswith('_sky'):   # 하늘 층은 배경을 지우지 않는다
        im.convert('RGB').resize(spec['out'], Image.LANCZOS).save(dest, 'WEBP', quality=85, method=6)
    elif spec.get('layer'):   # 층 그림: 마젠타만 지우고 가로 전체를 그대로 둔다 (가운데로 자르지 않는다)
        remove_magenta(im).resize(spec['out'], Image.LANCZOS).save(dest, 'WEBP', quality=88, method=6)
    elif spec['keyed']:
        im = fit(remove_magenta(im), spec['out'], spec['pad'])
        im.save(dest, 'WEBP', quality=90, method=6)
    else:
        im.convert('RGB').resize(spec['out'], Image.LANCZOS).save(dest, 'WEBP', quality=85, method=6)
    return f'ok    {kind}/{name} (seed {seed})'


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('targets', nargs='*', help='goblins | monsters | bosses | icons | backgrounds | 종류/이름 (없으면 전부)')
    ap.add_argument('--force', action='store_true', help='이미 있는 그림도 다시 만든다')
    ap.add_argument('--retry', type=int, default=0, help='씨앗을 바꿔 다른 결과를 뽑는다 (0, 1, 2 ...)')
    ap.add_argument('--reprocess', action='store_true', help='새로 생성하지 않고 images/_raw/ 원본으로 배경 제거·크기 정리만 다시 한다')
    ap.add_argument('--workers', type=int, default=4)
    ap.add_argument('--max-requests', type=int, default=None, help='이 실행에서 보낼 요청 횟수 상한 (재시도 포함). 넘기면 멈춘다. 1번 = 0.005 pollen')
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
        print(f'예상 비용: {len(todo)}장 × {PRICE_PER_REQUEST} = {len(todo) * PRICE_PER_REQUEST:.3f} pollen (최대 재시도까지 가면 {len(todo) * 4 * PRICE_PER_REQUEST:.3f})')
        return

    key = api_key()
    _budget['left'] = args.max_requests
    fails = 0
    with ThreadPoolExecutor(args.workers) as ex:
        futs = [(k, n, ex.submit(make, k, n, args.retry, args.force, key, args.reprocess)) for k, n in jobs]
        for k, n, f in futs:
            try:
                print(f.result(), flush=True)
            except Exception as e:
                fails += 1
                print(f'FAIL  {k}/{n}: {e}', flush=True)
    print(f'\n요청 {_budget["used"]}번 사용 (약 {_budget["used"] * PRICE_PER_REQUEST:.3f} pollen)')
    print(f'\n끝: {len(jobs) - fails}/{len(jobs)}장 성공' + (f', {fails}장 실패' if fails else ''))
    print('다음: node tools/make-manifest.js')


if __name__ == '__main__':
    main()
