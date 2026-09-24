// 고블린 키우기 - 배경음 (Web Audio로 코드가 직접 연주하는 8비트 칩튠). 음악 파일 없이 음표 데이터만으로 만든다.
// 곡: field(일반 스테이지, 밝은 장조) / boss(보스 스테이지·던전 전투, 빠른 단조).
// 브라우저는 사용자가 한 번 누르기 전에는 소리를 못 내게 해서, 첫 터치 때 시작한다. 앱이 가려지면 멈춘다.
(function (root) {
  const KEY = 'goblin-idle-bgm-v1';
  // 음 이름 → 주파수. 'C5'처럼 쓰고, 0이면 쉼표
  const NOTE = (() => {
    const names = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
    return (n) => { if (!n) return 0; const m = /^([A-G]#?)(\d)$/.exec(n); return 440 * Math.pow(2, (names[m[1]] + 12 * (Number(m[2]) + 1) - 69) / 12); };
  })();
  const sp = (s) => s.trim().split(/\s+/).map((x) => (x === '.' ? 0 : x));   // 한 칸 = 8분음표, '.'은 쉼표(앞 음을 끌지 않음)

  // 코드 한 마디 = [베이스 뿌리음, 코드 구성음 3개]
  const CH = {
    C: ['C3', ['C4', 'E4', 'G4']], G: ['G2', ['B3', 'D4', 'G4']], Am: ['A2', ['A3', 'C4', 'E4']], F: ['F2', ['A3', 'C4', 'F4']],
    Em: ['E2', ['B3', 'E4', 'G4']], Dm: ['D3', ['D4', 'F4', 'A4']], E: ['E2', ['G#3', 'B3', 'E4']],
  };
  const SONGS = {
    field: {
      bpm: 118,
      chords: ['C', 'G', 'Am', 'F', 'C', 'G', 'F', 'G', 'Am', 'Em', 'F', 'C', 'Dm', 'G', 'C', 'G'],
      melody: sp(`
        E5 . G5 . C6 . G5 .   D5 . G5 . B5 . G5 .   C5 . E5 . A5 . G5 E5   F5 . A5 . C6 . A5 .
        G5 . E5 . C5 . E5 G5  B4 . D5 . G5 . F5 E5  F5 . E5 . D5 . C5 .    D5 . . . G4 . . .
        A4 . C5 . E5 . A5 .   G5 . E5 . B4 . E5 .   F5 . A5 . G5 . F5 .    E5 . G5 . C6 . . .
        D5 . F5 . A5 . F5 .   B4 . D5 . G5 . B5 .   C6 . G5 . E5 . G5 .    D5 . B4 . G4 . . .`),
      lead: 'square', leadVol: 0.07, arp: true,
    },
    boss: {
      bpm: 146,
      chords: ['Am', 'Am', 'F', 'G', 'Am', 'Am', 'F', 'E', 'Dm', 'Am', 'F', 'G', 'Am', 'F', 'E', 'E'],
      melody: sp(`
        A4 . C5 . E5 . A5 G5   E5 . C5 . A4 . C5 E5   F5 . E5 . C5 . A4 .   G4 . B4 . D5 . G5 .
        A5 . G5 . E5 . C5 .    A4 C5 E5 A5 G5 E5 C5 E5   F5 . A5 . G5 . F5 .   E5 . G#5 . B5 . E5 .
        D5 . F5 . A5 . D6 .    C6 . A5 . E5 . C5 .    F5 . C5 . A4 . C5 .   D5 . G5 . B5 . G5 .
        A5 . E5 . C5 . A4 .    F4 . A4 . C5 . F5 .    E5 . . . G#4 . B4 .   E5 . . . E4 . . .`),
      lead: 'sawtooth', leadVol: 0.05, arp: false,
    },
  };

  let ctx = null, master = null, on = true, vol = 0.5, song = 'field', want = 'field';
  let step = 0, nextT = 0, timer = null, noiseBuf = null;
  try { const v = JSON.parse(localStorage.getItem(KEY) || 'null'); if (v) { on = v.on !== false; vol = Math.max(0, Math.min(1, Number(v.vol) || 0)); } } catch (e) { /* 저장소를 못 써도 기본값 */ }
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ on, vol })); } catch (e) { /* 무시 */ } };

  function ensure() {
    if (ctx) return true;
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    const lp = ctx.createBiquadFilter();   // 네모파의 날카로운 고음을 조금 깎아 귀가 덜 피곤하게
    lp.type = 'lowpass'; lp.frequency.value = 3600;
    master.connect(lp); lp.connect(ctx.destination);
    master.gain.value = on ? vol * 0.6 : 0;
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return true;
  }

  function tone(type, freq, t, dur, gain, slide) {
    if (!freq) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(t, dur, gain, hp) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf; f.type = 'highpass'; f.frequency.value = hp;
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t); s.stop(t + dur + 0.02);
  }

  // 8분음표 한 칸을 t 시각에 연주한다
  function playStep(S, i, t) {
    const e8 = 60 / S.bpm / 2;
    const bar = Math.floor(i / 8) % S.chords.length, pos = i % 8;
    const [bass, tri] = CH[S.chords[bar]];
    // 멜로디: 다음 칸이 쉼표가 아니면 짧게, 쉼표면 조금 길게
    const m = S.melody[i % S.melody.length];
    if (m) tone(S.lead, NOTE(m), t, e8 * (S.melody[(i + 1) % S.melody.length] ? 0.9 : 1.7), S.leadVol);
    // 베이스: 일반 곡은 1·3박에 뿌리음과 옥타브, 보스 곡은 8분음표로 달린다
    const bf = NOTE(bass);
    if (S.arp) { if (pos % 4 === 0) tone('triangle', bf, t, e8 * 1.8, 0.16); if (pos === 3 || pos === 7) tone('triangle', bf * 2, t, e8 * 0.8, 0.1); }
    else tone('triangle', pos % 2 ? bf * 2 : bf, t, e8 * 0.85, 0.15);
    // 화음: 일반 곡은 코드음을 번갈아 짚는 아르페지오
    if (S.arp) tone('square', NOTE(tri[pos % 3]), t, e8 * 0.7, 0.022);
    else if (pos === 0 || pos === 4) for (const n of tri) tone('square', NOTE(n), t, e8 * 1.6, 0.012);
    // 드럼: 킥(1·3박), 스네어(2·4박), 하이햇(엇박)
    if (pos === 0 || pos === 4) tone('sine', 150, t, 0.12, 0.3, 45);
    if (pos === 2 || pos === 6) noise(t, 0.09, 0.08, 1500);
    if (pos % 2 === 1 || !S.arp) noise(t, 0.03, 0.025, 7000);
  }

  function schedule() {
    if (!ctx) return;
    while (nextT < ctx.currentTime + 0.12) {
      if (step % 8 === 0 && want !== song) { song = want; step = 0; }   // 곡은 마디가 바뀔 때 바꾼다
      const S = SONGS[song];
      playStep(S, step, nextT);
      nextT += 60 / S.bpm / 2;
      step = (step + 1) % (S.chords.length * 8);
    }
  }
  function start() {
    if (!on || !ensure()) return;
    if (ctx.state === 'suspended') ctx.resume();
    if (timer) return;
    nextT = ctx.currentTime + 0.05;
    timer = setInterval(schedule, 30);
  }
  function stop() {
    if (timer) { clearInterval(timer); timer = null; }
    if (ctx && ctx.state === 'running') ctx.suspend();
  }

  // 첫 터치에 시작한다 (자동 재생 제한). 가려지면 멈추고, 돌아오면 다시.
  const kick = () => { start(); };
  root.addEventListener('pointerdown', kick, { passive: true });
  root.addEventListener('keydown', kick);
  if (root.document) root.document.addEventListener('visibilitychange', () => { if (root.document.hidden) stop(); else if (ctx) start(); });

  root.GoblinAudio = {
    setSong(name) { if (SONGS[name]) want = name; },
    get on() { return on; },
    get volume() { return vol; },
    setOn(v) { on = !!v; save(); if (on) { start(); if (master) master.gain.value = vol * 0.6; } else { if (master) master.gain.value = 0; stop(); } },
    setVolume(v) { vol = Math.max(0, Math.min(1, Number(v) || 0)); save(); if (master && on) master.gain.setTargetAtTime(vol * 0.6, ctx.currentTime, 0.05); },
    get playing() { return !!timer && !!ctx && ctx.state === 'running'; },
    get song() { return song; },
    SONGS: Object.keys(SONGS),
  };
})(typeof window !== 'undefined' ? window : globalThis);
