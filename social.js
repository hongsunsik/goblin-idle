// 고블린 키우기 - 친선 랭킹과 서버 출석 (화면·네트워크와 무관한 순수 함수라서 Node에서 테스트할 수 있다)
//
// 랭킹: 기록은 브라우저가 스스로 알리는 값이라 서버가 진짜인지 확인할 수 없다 → '친선 랭킹'이고 보상을 걸지 않는다 (docs/STORE-BACKEND.md).
// 출석: 날짜는 서버 시각(Firestore 규칙의 request.time)으로만 정해진다. 이 파일의 nextAttend는 firestore.rules의 규칙과 같은 계산이다.
(function (root) {
  const KST_MS = 9 * 3600e3, DAY_MS = 86400e3;

  // 한국 시간 기준 날짜 번호 (1970-01-01 = 0). 규칙에서는 math.floor((request.time.toMillis() + 32400000) / 86400000) 로 계산한다.
  const dayNumOf = (ms) => Math.floor((ms + KST_MS) / DAY_MS);

  // 닉네임: 한글·영문·숫자·공백·밑줄만, 앞뒤 공백 제거, 1~12자. 못 쓰면 빈 문자열.
  function sanitizeNick(text) {
    const t = String(text == null ? '' : text).replace(/[^0-9A-Za-z가-힣ㄱ-ㅎㅏ-ㅣ _]/g, '').replace(/\s+/g, ' ').trim().slice(0, 12).trim();
    return t;
  }

  const num = (x, d) => (typeof x === 'number' && Number.isFinite(x) ? x : d);
  const int = (x, lo, hi) => Math.min(hi, Math.max(lo, Math.floor(num(x, lo))));

  // 랭킹 문서에 올릴 값 (firestore.rules의 validRank가 허용하는 범위와 같다). 닉네임이 없으면 null.
  function rankEntry(state, nick, look) {
    const name = sanitizeNick(nick);
    if (!name) return null;
    return {
      name,
      best: int(state.bestStage, 1, 500),
      tokens: int(state.tokens, 0, 100000),
      ach: int(Object.keys(state.achieved || {}).length, 0, 300),
      prestiges: int(state.prestiges, 0, 99999),
      level: int(state.level, 1, 999),
      look: typeof look === 'string' ? look.slice(0, 24) : 'novice',
    };
  }
  // 마지막으로 올린 것과 달라졌는지 (같으면 서버에 쓰지 않는다: 쓰기 횟수 절약)
  const rankChanged = (prev, next) => !prev || ['name', 'best', 'tokens', 'ach', 'prestiges', 'level', 'look'].some((k) => prev[k] !== next[k]);

  // 랭킹 종류: field는 Firestore 필드 이름
  const RANK_BOARDS = [
    { id: 'best', field: 'best', label: '최고 스테이지', unit: '' },
    { id: 'tokens', field: 'tokens', label: '누적 증표', unit: '개' },
    { id: 'ach', field: 'ach', label: '업적', unit: '개' },
  ];

  // 다음 출석 기록. prev = { day, streak, total, best } 또는 null, today = 오늘의 날짜 번호.
  // 오늘 이미 했으면 null. 어제 했으면 연속 +1, 하루 이상 건너뛰었으면 1부터 다시. (firestore.rules의 attendance 규칙과 같은 계산)
  function nextAttend(prev, today) {
    if (!prev) return { day: today, streak: 1, total: 1, best: 1 };
    if (today <= prev.day) return null;
    const streak = prev.day + 1 === today ? prev.streak + 1 : 1;
    return { day: today, streak, total: prev.total + 1, best: Math.max(prev.best, streak) };
  }
  // 연속 출석 일수 → 그날 보상 (7일 주기). rewards는 store.js의 ATTEND_REWARDS.
  const attendReward = (streak, rewards) => rewards[(Math.max(1, streak) - 1) % rewards.length];

  const api = { dayNumOf, sanitizeNick, rankEntry, rankChanged, RANK_BOARDS, nextAttend, attendReward };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GoblinSocial = api;
})(typeof window !== 'undefined' ? window : globalThis);
