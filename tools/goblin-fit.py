"""고블린 그림 125장의 '머리 크기·얼굴 위치·발 위치'를 재서 images/goblin-fit.js를 만든다.

AI 그림마다 날개·오라·큰 무기 때문에 캐릭터가 차지하는 비율과 얼굴 위치가 달라서,
- 전투 화면: 머리(초록 피부 귀~귀 폭)가 모두 같은 크기로 보이게 배율을 맞추고 발을 같은 선에 세운다
- 프로필(얼굴만 잘라 쓰는 곳): 그림마다 실제 얼굴 가운데를 잘라 쓴다
고블린 피부가 초록색인 것을 이용한다(초록 픽셀 중 가장 위쪽 덩어리 = 머리).
사용법: python3 tools/goblin-fit.py [--sheet 확인용그림.jpg]
"""
import json, os, sys, colorsys
import numpy as np
from PIL import Image

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR = os.path.join(ROOT, 'images', 'goblins')


def measure(path):
    im = Image.open(path).convert('RGBA')
    a = np.asarray(im).astype(np.float32) / 255
    h, w = a.shape[:2]
    alpha = a[:, :, 3] > 0.5
    ys, xs = np.where(alpha)
    top, bottom = ys.min() / h, ys.max() / h
    left, right = xs.min() / w, xs.max() / w
    r, g, b = a[:, :, 0], a[:, :, 1], a[:, :, 2]
    mx, mn = np.maximum(np.maximum(r, g), b), np.minimum(np.minimum(r, g), b)
    sat = (mx - mn) / (mx + 1e-6)
    # 초록 피부: 초록이 가장 크고, 채도·밝기가 어느 정도 있는 픽셀
    green = alpha & (g >= r) & (g > b + 0.04) & (sat > 0.25) & (mx > 0.3) & (g - r < 0.6)
    gy, gx = np.where(green)
    if len(gy) < 200:
        return dict(ok=False, top=float(top), bottom=float(bottom), wide=float(right - left))
    # 행마다 초록 픽셀 수 → 가장 위쪽에서 시작하는 큰 덩어리(머리+귀)
    rows = np.bincount(gy, minlength=h)
    thresh = max(6, rows.max() * 0.15)
    ys_on = np.where(rows >= thresh)[0]
    head_top = ys_on.min()
    # 머리는 대략 머리 꼭대기부터 귀 폭의 0.9배 높이까지
    band = green[head_top:head_top + int(h * 0.3)]
    by, bx = np.where(band)
    width = np.percentile(bx, 97) - np.percentile(bx, 3)
    head_h = min(int(width * 0.85), band.shape[0])
    band = green[head_top:head_top + head_h]
    by, bx = np.where(band)
    fx = float(np.median(bx)) / w
    fy = float(head_top + np.median(by)) / h
    fw = float(np.percentile(bx, 97) - np.percentile(bx, 3)) / w
    return dict(ok=True, top=float(top), bottom=float(bottom), wide=float(right - left), fx=fx, fy=fy, fw=fw)


# 초록 불꽃·잎사귀·독 빛처럼 피부가 아닌 초록에 속는 그림은 눈으로 보고 얼굴 위치를 직접 적는다 (그림 크기 대비 비율)
OVERRIDES = {
    'assassin':    dict(fx=0.52, fy=0.33, fw=0.56),
    'naturejudge': dict(fx=0.33, fy=0.31, fw=0.52),
    'necromancer': dict(fx=0.48, fy=0.47, fw=0.48),
    'nightblade':  dict(fx=0.58, fy=0.30, fw=0.62),
    'soulreaper':  dict(fx=0.53, fy=0.38, fw=0.50),
    'lich':        dict(fx=0.37, fy=0.39, fw=0.56),
    'sungodpriest': dict(fx=0.37, fy=0.33, fw=0.46),
    'rogue':       dict(fx=0.53, fy=0.29, fw=0.52),
}


def main():
    names = sorted(f[:-5] for f in os.listdir(DIR) if f.endswith('.webp') and not f.endswith('_head.webp'))
    data = {n: measure(os.path.join(DIR, n + '.webp')) for n in names}
    for n, o in OVERRIDES.items():
        if n in data: data[n].update(o, ok=True)
    ok = [d for d in data.values() if d['ok']]
    ref_fw = float(np.median([d['fw'] for d in ok]))
    ref_bottom = float(np.median([d['bottom'] for d in data.values()]))
    out = {}
    for n, d in data.items():
        if not d['ok']:
            out[n] = {'s': 1, 'b': round(d['bottom'], 4)}
            continue
        # 머리 폭을 기준에 맞추는 배율 (너무 크거나 작게는 안 한다), 전체가 칸을 크게 넘지 않게도 막는다
        s = ref_fw / d['fw']
        s = max(0.75, min(1.3, s))
        s = min(s, 1.12 / max(0.3, d['bottom'] - d['top']), 1.25 / max(0.3, d['wide']))   # 날개가 넓은 그림이 옆으로 너무 삐져나가지 않게
        out[n] = {'s': round(s, 3), 'b': round(d['bottom'], 4), 'fx': round(d['fx'], 4), 'fy': round(d['fy'], 4), 'fw': round(d['fw'], 4)}
    js = ('// tools/goblin-fit.py가 만든 파일 (직접 고치지 말 것). 고블린 그림마다 머리 크기 맞춤 배율(s), 발 위치(b), 얼굴 가운데(fx, fy)와 폭(fw) — 그림 크기 대비 비율\n'
          f'window.GOBLIN_FIT = {json.dumps(out, separators=(",", ":"))};\n')
    open(os.path.join(ROOT, 'images', 'goblin-fit.js'), 'w').write(js)
    bad = [n for n, d in data.items() if not d['ok']]
    odd = [n for n, d in data.items() if d['ok'] and n not in OVERRIDES and abs(d['fw'] - ref_fw) > 0.12]
    if odd: print('머리 폭이 기준과 많이 달라 눈으로 확인할 그림(대부분은 실제로 크게/작게 그려진 것):', odd)
    print(f'{len(names)}장 측정, 기준 머리 폭 {ref_fw:.3f}, 발 {ref_bottom:.3f}, 얼굴 못 찾음 {len(bad)}장: {bad}')
    if '--sheet' in sys.argv:   # 얼굴 자른 결과를 한 장에 모아 눈으로 확인
        path = sys.argv[sys.argv.index('--sheet') + 1]
        cell = 72
        cols = 16
        sheet = Image.new('RGB', (cols * cell, ((len(names) + cols - 1) // cols) * cell), (30, 40, 70))
        for i, n in enumerate(names):
            d = out[n]
            im = Image.open(os.path.join(DIR, n + '.webp')).convert('RGBA')
            W, H = im.size
            if 'fx' in d:
                half = d['fw'] * W * 0.62
                box = (int(d['fx'] * W - half), int(d['fy'] * H - half), int(d['fx'] * W + half), int(d['fy'] * H + half))
            else:
                box = (0, 0, W, W)
            c = im.crop(box).resize((cell, cell))
            bg = Image.new('RGBA', (cell, cell), (30, 40, 70, 255)); bg.alpha_composite(c)
            sheet.paste(bg.convert('RGB'), ((i % cols) * cell, (i // cols) * cell))
        sheet.save(path, quality=80)


if __name__ == '__main__':
    main()
