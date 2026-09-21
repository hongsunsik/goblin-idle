# 앱 아이콘 만들기: python3 tools/make-icons.py
# 고블린 그림(images/goblins)을 어두운 파란 배경 위에 얹어 icons/ 아래에 PNG를 만든다. (Pillow 필요: pip3 install pillow)
#   icon-192.png, icon-512.png       일반 아이콘 (웹 앱 설치, 안드로이드 앱)
#   icon-maskable-512.png            안드로이드가 원·둥근 사각형으로 잘라도 가운데 80% 안에 그림이 들어가도록 여백을 넉넉히 둔 아이콘
#   apple-touch-icon.png (180)       아이폰 홈 화면용
import os
from PIL import Image, ImageDraw, ImageFilter

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'icons')
os.makedirs(OUT, exist_ok=True)
SRC = os.path.join(ROOT, 'images', 'goblins', 'mage_head.webp')
if not os.path.exists(SRC):
    SRC = os.path.join(ROOT, 'images', 'goblins', 'mage.webp')
goblin = Image.open(SRC).convert('RGBA')

def background(size):
    # 위는 밝은 파랑, 아래는 어두운 남색인 세로 그라데이션 + 가운데 은은한 빛
    img = Image.new('RGB', (size, size))
    px = img.load()
    for y in range(size):
        t = y / (size - 1)
        r, g, b = int(40 + (7 - 40) * t), int(80 + (13 - 80) * t), int(160 + (28 - 160) * t)
        for x in range(size):
            px[x, y] = (r, g, b)
    glow = Image.new('L', (size, size), 0)
    d = ImageDraw.Draw(glow)
    d.ellipse([size * 0.12, size * 0.12, size * 0.88, size * 0.88], fill=110)
    glow = glow.filter(ImageFilter.GaussianBlur(size * 0.12))
    img.paste(Image.new('RGB', (size, size), (255, 214, 120)), (0, 0), glow)
    return img.convert('RGBA')

def make(size, scale, name):
    bg = background(size)
    w = int(size * scale)
    h = int(goblin.height * w / goblin.width)
    if h > size * scale:
        h = int(size * scale); w = int(goblin.width * h / goblin.height)
    g = goblin.resize((w, h), Image.LANCZOS)
    bg.alpha_composite(g, ((size - w) // 2, (size - h) // 2 + int(size * 0.02)))
    bg.convert('RGB').save(os.path.join(OUT, name), optimize=True)
    print('저장', name, size)

make(192, 0.84, 'icon-192.png')
make(512, 0.84, 'icon-512.png')
make(512, 0.62, 'icon-maskable-512.png')   # 가운데 안전 영역(지름의 80%) 안에 들어가게 작게
make(180, 0.84, 'apple-touch-icon.png')
