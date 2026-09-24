// 고블린 키우기 - 배경음 (Web Audio로 코드가 직접 연주하는 칩튠). 음악 파일 없이 음표 데이터만으로 만든다.
// 곡: 지역 6곳마다 한 곡(forest·cave·desert·snow·volcano·castle), 보스 스테이지(boss), 던전·탑 전투(battle).
// 음색은 배음을 줄인 부드러운 파형 + 긴 음 비브라토 + 에코·잔향, 마스터에 압축기를 걸어 소리가 찢어지지 않게 한다.
// 브라우저는 사용자가 한 번 누르기 전에는 소리를 못 내게 해서, 첫 터치 때 시작한다. 앱이 가려지면 멈춘다.
(function (root) {
  const KEY = 'goblin-idle-bgm-v1';
  const NAMES = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
  const NOTE = (n) => { if (!n) return 0; const m = /^([A-G]#?)(\d)$/.exec(n); return 440 * Math.pow(2, (NAMES[m[1]] + 12 * (Number(m[2]) + 1) - 69) / 12); };
  const sp = (s) => s.trim().split(/\s+/).map((x) => (x === '.' ? 0 : x));   // 한 칸 = 8분음표, '.'은 쉼표

  // 코드 = [베이스 뿌리음, 코드 구성음 3개]
  const CH = {
    C: ['C3', ['C4', 'E4', 'G4']], G: ['G2', ['B3', 'D4', 'G4']], Am: ['A2', ['A3', 'C4', 'E4']], F: ['F2', ['A3', 'C4', 'F4']],
    Em: ['E2', ['B3', 'E4', 'G4']], Dm: ['D3', ['D4', 'F4', 'A4']], E: ['E2', ['G#3', 'B3', 'E4']], D: ['D3', ['D4', 'F#4', 'A4']],
    B: ['B2', ['D#4', 'F#4', 'B4']], Bb: ['A#2', ['A#3', 'D4', 'F4']], Gm: ['G2', ['A#3', 'D4', 'G4']], A: ['A2', ['C#4', 'E4', 'A4']],
    Cm: ['C3', ['C4', 'D#4', 'G4']], Ab: ['G#2', ['G#3', 'C4', 'D#4']], Fm: ['F2', ['G#3', 'C4', 'F4']],
  };
  // lead: 멜로디 음색, back: 반주(arp 아르페지오 | pad 긴 화음 | drive 8분 베이스 질주), drums: pop | soft | hand | rock | none
  // 곡마다 악기가 너무 달라 들쭉날쭉하다는 의견으로, 모든 곡이 같은 부드러운 음색·같은 드럼을 쓰고 템포도 100~118(전투 132)로 맞췄다.
  const SONGS = {
    forest: {   // 고블린 숲: 경쾌한 장조
      bpm: 112, lead: 'soft', back: 'arp', drums: 'pop',
      chords: ['C', 'G', 'Am', 'F', 'C', 'G', 'F', 'G', 'Am', 'Em', 'F', 'C', 'Dm', 'G', 'C', 'G'],
      melody: sp(`
        E5 . G5 . C6 . G5 .   D5 . G5 . B5 . G5 .   C5 . E5 . A5 . G5 E5   F5 . A5 . C6 . A5 .
        G5 . E5 . C5 . E5 G5  B4 . D5 . G5 . F5 E5  F5 . E5 . D5 . C5 .    D5 . . . G4 . . .
        A4 . C5 . E5 . A5 .   G5 . E5 . B4 . E5 .   F5 . A5 . G5 . F5 .    E5 . G5 . C6 . . .
        D5 . F5 . A5 . F5 .   B4 . D5 . G5 . B5 .   C6 . G5 . E5 . G5 .    D5 . B4 . G4 . . .`),
    },
    cave: {   // 어둠의 동굴: 느리고 신비로운 단조, 음이 드문드문
      bpm: 100, lead: 'soft', back: 'pad', drums: 'soft',
      chords: ['Am', 'Am', 'F', 'G', 'Am', 'Em', 'F', 'E'],
      melody: sp(`
        A4 . . C5 E5 . . .   D5 . C5 . B4 . . .   C5 . . A4 F4 . . .   G4 . B4 . D5 . . .
        E5 . . D5 C5 . . .   B4 . . G4 E4 . . .   A4 . C5 . F5 . E5 .   G#4 . . . B4 . . .`),
    },
    desert: {   // 불타는 사막: 이국적인 프리지안
      bpm: 106, lead: 'soft', back: 'arp', drums: 'pop',
      chords: ['E', 'F', 'E', 'Dm', 'E', 'F', 'G', 'E'],
      melody: sp(`
        E5 . F5 . G#5 . F5 E5   F5 . A5 . G#5 . F5 .   E5 . D5 . C5 . B4 .   D5 . C5 . B4 . A4 .
        B4 . E5 . F5 . G#5 .    A5 . G#5 . F5 . E5 .   D5 . F5 . E5 . D5 .   E5 . . . . . . .`),
    },
    snow: {   // 얼음 산맥: 잔잔한 종소리
      bpm: 100, lead: 'soft', back: 'pad', drums: 'soft',
      chords: ['F', 'C', 'Dm', 'Bb', 'F', 'C', 'Bb', 'C'],
      melody: sp(`
        A5 . C6 . A5 . F5 .   G5 . E5 . C5 . E5 .   F5 . A5 . D6 . A5 .   D5 . F5 . A#5 . . .
        C6 . A5 . F5 . A5 .   G5 . C6 . E5 . G5 .   F5 . D5 . A#4 . D5 .   E5 . G5 . C5 . . .`),
    },
    volcano: {   // 화산 지대: 달리는 단조
      bpm: 118, lead: 'soft', back: 'arp', drums: 'pop',
      chords: ['Dm', 'Bb', 'C', 'A', 'Dm', 'Bb', 'Gm', 'A'],
      melody: sp(`
        D5 . F5 . A5 . F5 D5   F5 . D5 . A#4 . D5 F5   E5 . G5 . C6 . G5 E5   C#5 . E5 . A5 . . .
        A5 . G5 F5 E5 . D5 .   F5 . A#5 . A5 . F5 .    G5 . A#5 . D6 . A#5 G5  A5 . E5 . C#5 . A4 .`),
    },
    castle: {   // 저주받은 성: 어두운 오르간
      bpm: 100, lead: 'soft', back: 'pad', drums: 'soft',
      chords: ['Cm', 'Ab', 'Fm', 'G', 'Cm', 'Ab', 'Bb', 'G'],
      melody: sp(`
        G5 . . D#5 C5 . . .   C5 . D#5 . G#5 . G5 .   F5 . . G#5 C6 . . .   B5 . . G5 D5 . . .
        D#5 . D5 . C5 . G4 .  G#4 . C5 . D#5 . . .    D5 . F5 . A#5 . G#5 .  G5 . . . B4 . . .`),
    },
    boss: {   // 보스 스테이지: 빠르고 긴장감 있는 단조
      bpm: 132, lead: 'soft', back: 'drive', drums: 'rock',
      chords: ['Am', 'Am', 'F', 'G', 'Am', 'Am', 'F', 'E', 'Dm', 'Am', 'F', 'G', 'Am', 'F', 'E', 'E'],
      melody: sp(`
        A4 . C5 . E5 . A5 G5   E5 . C5 . A4 . C5 E5   F5 . E5 . C5 . A4 .   G4 . B4 . D5 . G5 .
        A5 . G5 . E5 . C5 .    A4 C5 E5 A5 G5 E5 C5 E5   F5 . A5 . G5 . F5 .   E5 . G#5 . B5 . E5 .
        D5 . F5 . A5 . D6 .    C6 . A5 . E5 . C5 .    F5 . C5 . A4 . C5 .   D5 . G5 . B5 . G5 .
        A5 . E5 . C5 . A4 .    F4 . A4 . C5 . F5 .    E5 . . . G#4 . B4 .   E5 . . . E4 . . .`),
    },
    battle: {   // 던전·탑 전투: 영웅적인 단조
      bpm: 132, lead: 'soft', back: 'drive', drums: 'rock',
      chords: ['Em', 'C', 'D', 'B', 'Em', 'C', 'Am', 'B'],
      melody: sp(`
        E5 . G5 . B5 . A5 G5   G5 . E5 . C5 . E5 G5   F#5 . A5 . D6 . A5 F#5   D#5 . F#5 . B5 . . .
        B5 A5 G5 F#5 E5 . G5 .   C6 . B5 . G5 . E5 .   A5 . C6 . E6 . C6 A5   B5 . D#5 . F#5 . B4 .`),
    },
  };
  const BIOME_SONG = ['forest', 'cave', 'desert', 'snow', 'volcano', 'castle'];

  let ctx = null, out = null, on = true, vol = 0.5, song = 'forest', want = 'forest';
  const SFX_KEY = 'goblin-idle-sfx-v1';
  let sfxOn = true, sfxVol = 0.5, lastSfx = 0, sfxCount = 0;
  try { const v = JSON.parse(localStorage.getItem(SFX_KEY) || 'null'); if (v) { sfxOn = v.on !== false; sfxVol = Math.max(0, Math.min(1, Number(v.vol) || 0)); } } catch (e) { /* 기본값 */ }
  const saveSfx = () => { try { localStorage.setItem(SFX_KEY, JSON.stringify({ on: sfxOn, vol: sfxVol })); } catch (e) { /* 무시 */ } };
  let step = 0, nextT = 0, timer = null, barsPlayed = 0;
  const MIN_BARS = 16;
  try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (v) { on = v.on !== false; vol = Math.max(0, Math.min(1, Number(v.vol) || 0)); } } catch (e) { /* 저장소를 못 써도 기본값 */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ on, vol })); } catch (e) { /* 무시 */ } };

  // 소리 그래프: 악기 → (멜로디는 에코) → 잔향 조금 → 압축기 → 저역 통과 → 음량 → 스피커
  function buildGraph(c, dest) {
    const g = { c };
    g.master = c.createGain();
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -18; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.2;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 5200;
    g.bus = c.createGain();
    g.bus.connect(comp); comp.connect(lp); lp.connect(g.master); g.master.connect(dest);
    // 잔향: 짧게 사라지는 잡음으로 만든 울림
    const len = Math.floor(c.sampleRate * 1.4), ir = c.createBuffer(2, len, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3); }
    const rev = c.createConvolver(); rev.buffer = ir;
    g.revSend = c.createGain(); g.revSend.gain.value = 0.22;
    g.revSend.connect(rev); rev.connect(g.bus);
    // 에코(멜로디용): 점 8분음표쯤 늦게, 점점 작아지며 되풀이
    g.echo = c.createGain(); g.echo.gain.value = 0.26;
    const dl = c.createDelay(1); dl.delayTime.value = 0.33;
    const fb = c.createGain(); fb.gain.value = 0.3;
    const dlp = c.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 1800;
    g.echo.connect(dl); dl.connect(dlp); dlp.connect(fb); fb.connect(dl); dlp.connect(g.bus);
    // 파형: 배음을 줄인 부드러운 음색들
    const wave = (h) => c.createPeriodicWave(new Float32Array(h.length + 1), Float32Array.from([0, ...h]));
    g.waves = {
      soft: wave([1, 0.42, 0.24, 0.12, 0.07, 0.035]),               // 둥근 네모파
      flute: wave([1, 0.18, 0.08, 0.03]),                           // 피리
      organ: wave([1, 0.6, 0.35, 0, 0.22, 0, 0.12, 0.08]),          // 오르간
      saw: wave([1, 0.5, 0.33, 0.25, 0.2, 0.16, 0.13, 0.1]),        // 톱니(보스)
      pad: wave([1, 0.3, 0.1]),
    };
    g.noise = c.createBuffer(1, Math.floor(c.sampleRate * 0.25), c.sampleRate);
    const nd = g.noise.getChannelData(0); for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    return g;
  }

  // 음 하나: 파형, 주파수, 시각, 길이, 크기, {attack, release, vib(비브라토), echo, rev, slide}
  function tone(g, wave, freq, t, dur, gain, o) {
    if (!freq) return;
    o = o || {};
    const c = g.c, osc = c.createOscillator(), env = c.createGain();
    if (typeof wave === 'string' && g.waves[wave]) osc.setPeriodicWave(g.waves[wave]); else osc.type = wave;
    osc.frequency.setValueAtTime(freq, t);
    if (o.slide) osc.frequency.exponentialRampToValueAtTime(o.slide, t + dur);
    if (o.vib && dur > 0.25) {   // 긴 음은 살짝 떨리게 (조금 늦게 시작)
      const lfo = c.createOscillator(), lg = c.createGain();
      lfo.frequency.value = 5.2; lg.gain.setValueAtTime(0, t); lg.gain.linearRampToValueAtTime(freq * 0.006, t + 0.2);
      lfo.connect(lg); lg.connect(osc.frequency); lfo.start(t); lfo.stop(t + dur + 0.3);
    }
    const a = o.attack || 0.01, r = o.release || dur;
    env.gain.setValueAtTime(0, t);
    env.gain.linearRampToValueAtTime(gain, t + a);
    env.gain.setTargetAtTime(0, t + Math.max(a, dur * 0.6), r / 3);
    osc.connect(env); env.connect(o.bus || g.bus);
    if (o.echo) env.connect(g.echo);
    if (o.rev !== false) env.connect(g.revSend);
    osc.start(t); osc.stop(t + dur + r + 0.1);
  }
  function hit(g, t, dur, gain, hp, bus, type) {
    const c = g.c, s = c.createBufferSource(), f = c.createBiquadFilter(), e = c.createGain();
    s.buffer = g.noise; f.type = type || 'highpass'; f.frequency.value = hp;
    e.gain.setValueAtTime(gain, t); e.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f); f.connect(e); e.connect(bus || g.bus);
    s.start(t); s.stop(t + dur + 0.02);
  }

  // 8분음표 한 칸을 t 시각에 연주한다
  function playStep(g, S, i, t) {
    const e8 = 60 / S.bpm / 2;
    const bar = Math.floor(i / 8) % S.chords.length, pos = i % 8;
    const [bass, tri] = CH[S.chords[bar]];
    // 멜로디: 쉼표가 이어지는 만큼 음을 늘인다
    const m = S.melody[i % S.melody.length];
    if (m) {
      let len = 1; while (len < 4 && !S.melody[(i + len) % S.melody.length]) len += 1;
      const dur = e8 * (len - 0.1);
      if (S.lead === 'bell') { tone(g, 'sine', NOTE(m), t, e8 * 0.3, 0.11, { release: 1.2, echo: true }); tone(g, 'sine', NOTE(m) * 2, t, e8 * 0.2, 0.03, { release: 0.6 }); }
      else tone(g, S.lead, NOTE(m), t, dur, S.lead === 'saw' ? 0.06 : 0.085, { vib: true, echo: true, attack: S.lead === 'flute' || S.lead === 'organ' ? 0.04 : 0.012, release: 0.12 });
    }
    // 베이스
    const bf = NOTE(bass);
    if (S.back === 'drive') tone(g, 'triangle', pos % 2 ? bf * 2 : bf, t, e8 * 0.8, 0.2, { rev: false, release: 0.05 });
    else if (pos === 0) tone(g, 'triangle', bf, t, e8 * 3.6, 0.2, { rev: false, release: 0.15 });
    else if (pos === 4) tone(g, 'triangle', S.back === 'arp' ? bf * 1.5 : bf, t, e8 * 3.2, 0.16, { rev: false, release: 0.15 });
    // 화음
    if (S.back === 'arp') tone(g, 'soft', NOTE(tri[[0, 1, 2, 1][pos % 4]]) * (pos >= 4 ? 2 : 1), t, e8 * 0.6, 0.028, { release: 0.1 });
    else if (S.back === 'pad' && pos === 0) for (const n of tri) tone(g, 'pad', NOTE(n), t, e8 * 7.6, 0.032, { attack: 0.35, release: 0.6 });
    else if (S.back === 'drive' && (pos === 0 || pos === 4)) for (const n of tri) tone(g, 'soft', NOTE(n), t, e8 * 1.5, 0.018, { release: 0.1 });
    // 드럼
    const kick = () => tone(g, 'sine', 140, t, 0.13, 0.42, { slide: 42, rev: false, release: 0.05 });
    switch (S.drums) {
      case 'pop': if (pos === 0 || pos === 4) kick(); if (pos === 2 || pos === 6) hit(g, t, 0.1, 0.09, 1800); if (pos % 2) hit(g, t, 0.03, 0.02, 8000); break;
      case 'soft': if (pos === 0) kick(); if (pos === 4) hit(g, t, 0.06, 0.03, 5000); break;
      case 'hand': if (pos === 0 || pos === 3 || pos === 4) tone(g, 'sine', pos === 3 ? 220 : 170, t, 0.12, 0.28, { slide: 90, rev: false, release: 0.05 }); if (pos === 2 || pos === 6) hit(g, t, 0.07, 0.06, 2500); break;
      case 'rock': if (pos === 0 || pos === 3 || pos === 4) kick(); if (pos === 2 || pos === 6) hit(g, t, 0.13, 0.12, 1500); hit(g, t, 0.03, 0.022, 8000); break;
      default: break;
    }
  }

  let G = null;
  function ensure() {
    if (ctx) return true;
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    G = buildGraph(ctx, ctx.destination);
    out = G.master;
    out.gain.value = on ? vol * 0.9 : 0;
    // 효과음은 배경음과 따로: 음량·켜기가 따로이고 배경음 압축기를 거치지 않는다 (배경음이 작아지지 않게)
    G.sfxBus = ctx.createGain();
    G.sfxBus.gain.value = sfxOn ? sfxVol * 0.8 : 0;
    G.sfxBus.connect(ctx.destination);
    return true;
  }
  function schedule() {
    if (!ctx) return;
    while (nextT < ctx.currentTime + 0.15) {
      // 곡은 마디가 바뀔 때만, 지역 곡끼리는 지금 곡을 16마디 넘게 들은 뒤에만 바꾼다 (전투 곡으로 들어가고 나올 때는 바로)
      const battleEdge = want === 'battle' || song === 'battle';
      if (step % 8 === 0 && want !== song && (battleEdge || barsPlayed >= MIN_BARS)) {
        song = want; step = 0; barsPlayed = 0;
        if (on) { out.gain.setTargetAtTime(vol * 0.25, Math.max(ctx.currentTime, nextT - 0.2), 0.08); out.gain.setTargetAtTime(vol * 0.9, nextT + 0.05, 0.25); }
      }
      const S = SONGS[song];
      playStep(G, S, step, nextT);
      nextT += 60 / S.bpm / 2;
      step = (step + 1) % (S.chords.length * 8);
      if (step % 8 === 0) barsPlayed += 1;
    }
  }
  function start() {
    if (!on || !ensure()) return;
    if (ctx.state === 'suspended') ctx.resume();
    if (timer) return;
    nextT = ctx.currentTime + 0.05;
    timer = setInterval(schedule, 30);
  }
  function stop(hidden) {
    if (timer) { clearInterval(timer); timer = null; }
    if (ctx && ctx.state === 'running' && (hidden || !sfxOn)) ctx.suspend();   // 효과음이 켜져 있으면 배경음만 멈춘다
  }

  // ---- 효과음: 고블린이 몬스터를 때릴 때. 공격 방식마다 다른 소리를 합성한다 ----
  function sfx(style, strong) {
    if (!sfxOn || !ctx || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    if (now - lastSfx < 0.07) return;   // 너무 잦으면 소리가 뭉개져서 간격을 둔다
    lastSfx = now; sfxCount += 1;
    const g = G, b = G.sfxBus, t = now + 0.005, k = strong ? 1.4 : 1;
    const T = (wave, f, dur, gain, o) => tone(g, wave, f, t + ((o && o.at) || 0), dur, gain * k, Object.assign({ bus: b, rev: false, release: dur * 0.6 }, o));
    const N = (dur, gain, hp, type, at) => hit(g, t + (at || 0), dur, gain * k, hp, b, type);
    switch (style) {
      case 'slash': case 'holy': case 'dagger':   // 칼: 바람 가르는 소리 + 짧은 금속음
        N(0.09, 0.22, 2200, 'bandpass'); T('triangle', 1800, 0.06, 0.05, { at: 0.03 });
        if (style === 'holy') T('sine', 1320, 0.25, 0.06, { at: 0.03 });
        if (style === 'dagger') N(0.05, 0.16, 3000, 'bandpass', 0.07);
        break;
      case 'axe': N(0.12, 0.25, 900, 'bandpass'); T('sine', 180, 0.12, 0.25, { slide: 70 }); break;   // 도끼: 묵직하게 찍는 소리
      case 'hammer': T('sine', 120, 0.2, 0.4, { slide: 40 }); N(0.14, 0.2, 400, 'lowpass'); break;   // 망치: 쿵
      case 'arrow': case 'bolt': N(0.06, 0.18, 4000); T('triangle', 900, 0.08, 0.08, { slide: 300, at: 0.02 }); break;   // 화살: 슉
      case 'bullet': N(0.05, 0.35, 1500); T('sine', 90, 0.12, 0.3, { slide: 40 }); break;   // 총: 탕
      case 'shuriken': T('sine', 2600, 0.12, 0.06); T('sine', 3150, 0.12, 0.05); N(0.04, 0.1, 5000); break;   // 표창: 챙
      case 'coin': T('sine', 1760, 0.1, 0.07); T('sine', 2350, 0.16, 0.06, { at: 0.05 }); break;   // 동전: 짤랑
      case 'orb': T('sine', 660, 0.18, 0.08, { slide: 1320 }); T('sine', 1980, 0.12, 0.04, { at: 0.06 }); break;   // 마법: 반짝
      case 'fire': N(0.22, 0.2, 700, 'lowpass'); T('triangle', 220, 0.16, 0.08, { slide: 110 }); break;   // 불: 화르륵
      case 'dark': T('sawtooth', 110, 0.22, 0.05, { slide: 70 }); T('sawtooth', 116, 0.22, 0.04, { slide: 72 }); break;   // 암흑: 낮게 웅
      default: N(0.07, 0.2, 1500, 'bandpass');
    }
  }

  // 점검용: 곡 하나를 sec초 동안 소리 없이 그려서 크기(최고·평균)를 잰다. tools/ui-check.js가 쓴다.
  async function measure(name, sec) {
    const OAC = root.OfflineAudioContext || root.webkitOfflineAudioContext;
    const S = SONGS[name];
    if (!OAC || !S) return null;
    const c = new OAC(2, Math.floor(44100 * sec), 44100);
    const g = buildGraph(c, c.destination);
    g.master.gain.value = 0.9 * 0.5;   // 기본 음량 50%
    for (let i = 0, t = 0.02; t < sec; i++) { playStep(g, S, i % (S.chords.length * 8), t); t += 60 / S.bpm / 2; }
    const buf = await c.startRendering(), d = buf.getChannelData(0);
    let peak = 0, sum = 0;
    for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > peak) peak = v; sum += d[i] * d[i]; }
    return { peak, rms: Math.sqrt(sum / d.length) };
  }

  const kick = () => { if ((on || sfxOn) && ensure() && ctx.state === 'suspended') ctx.resume(); start(); };
  root.addEventListener('pointerdown', kick, { passive: true });
  root.addEventListener('keydown', kick);
  if (root.document) root.document.addEventListener('visibilitychange', () => { if (root.document.hidden) stop(true); else if (ctx) { if (on || sfxOn) ctx.resume(); start(); } });

  root.GoblinAudio = {
    setSong(name) { if (SONGS[name]) want = name; },
    // 보스 스테이지는 몇 초 만에 지나가서 곡을 바꾸면 들쭉날쭉했다 → 던전·탑 전투에서만 전투 곡
    songFor(biome, boss, battle) { return battle ? 'battle' : BIOME_SONG[((biome % BIOME_SONG.length) + BIOME_SONG.length) % BIOME_SONG.length]; },
    get on() { return on; },
    get volume() { return vol; },
    setOn(v) { on = !!v; save(); if (on) { start(); if (out) out.gain.value = vol * 0.9; } else { if (out) out.gain.value = 0; stop(); } },
    sfx,
    get sfxOn() { return sfxOn; },
    get sfxVolume() { return sfxVol; },
    setSfxOn(v) { sfxOn = !!v; saveSfx(); if (G && G.sfxBus) G.sfxBus.gain.value = sfxOn ? sfxVol * 0.8 : 0; if (sfxOn && ensure() && ctx.state === 'suspended') ctx.resume(); },
    setSfxVolume(v) { sfxVol = Math.max(0, Math.min(1, Number(v) || 0)); saveSfx(); if (G && G.sfxBus && sfxOn) G.sfxBus.gain.setTargetAtTime(sfxVol * 0.8, ctx.currentTime, 0.05); },
    get sfxCount() { return sfxCount; },
    setVolume(v) { vol = Math.max(0, Math.min(1, Number(v) || 0)); save(); if (out && on) out.gain.setTargetAtTime(vol * 0.9, ctx.currentTime, 0.05); },
    get playing() { return !!timer && !!ctx && ctx.state === 'running'; },
    get song() { return song; },
    SONGS: Object.keys(SONGS),
    measure,
  };
})(typeof window !== 'undefined' ? window : globalThis);
