// 고블린 키우기 - 클라우드 저장 판단 로직 (화면·네트워크와 무관한 순수 함수라서 Node에서 테스트할 수 있다)
// 로그인했을 때 "이 기기의 저장"과 "클라우드의 저장" 중 무엇을 쓸지 정한다.
(function (root) {
  const num = (x, d) => (typeof x === 'number' && Number.isFinite(x) ? x : d);

  // 저장 상태에서 비교에 필요한 값만 뽑은 요약 (클라우드에도 같이 저장해서, 내려받기 전에 비교할 수 있다)
  function summaryOf(state, lookId) {
    return {
      v: 1,
      level: Math.floor(num(state.level, 1)),
      bestStage: Math.floor(num(state.bestStage, 1)),
      prestiges: Math.floor(num(state.prestiges, 0)),
      tokens: Math.floor(num(state.tokens, 0)),
      kills: Math.floor(num(state.totalKills, 0)),
      look: typeof lookId === 'string' ? lookId : 'novice',
      savedAt: Math.floor(num(state.savedAt, 0)),
    };
  }

  // 요약이 같은 진행인지 알아보는 표식. 저장 시각은 5초마다 바뀌므로 넣지 않는다.
  const sigOf = (sum) => (sum ? [sum.kills, sum.bestStage, sum.prestiges, sum.tokens, sum.level].join('|') : '');

  // 아직 시작도 안 한 새 게임인지
  const isFresh = (sum) => !sum || (sum.kills === 0 && sum.bestStage <= 1 && sum.prestiges === 0 && sum.tokens === 0);

  // 어느 쪽이 더 앞선 진행인지 점수 (환생 > 증표 > 최고 스테이지 > 레벨 순으로 중요)
  const scoreOf = (sum) => (sum ? sum.prestiges * 1e9 + sum.tokens * 1e6 + sum.bestStage * 1e3 + sum.level : -1);

  // 로그인(또는 수동 동기화)할 때 무엇을 할지.
  //   local, remote: 요약. remote가 null이면 클라우드에 저장이 없다.
  //   base: 이 기기가 마지막으로 동기화했을 때의 { rev, sig } (없으면 null)
  // 결과 action: 'upload' 이 기기 → 클라우드 | 'download' 클라우드 → 이 기기 | 'same' 할 일 없음 | 'ask' 사용자가 고른다
  function decide(local, remote, base) {
    if (!remote) return { action: isFresh(local) ? 'same' : 'upload' };
    if (isFresh(local)) return { action: 'download' };
    const recommend = scoreOf(remote) > scoreOf(local) ? 'cloud' : scoreOf(remote) < scoreOf(local) ? 'local' : (remote.savedAt >= local.savedAt ? 'cloud' : 'local');
    if (base && typeof base.rev === 'number') {
      const localChanged = sigOf(local) !== base.sig;
      if (remote.rev === base.rev) return { action: localChanged ? 'upload' : 'same' };   // 클라우드는 그대로, 이 기기만 바뀜
      if (!localChanged) return { action: 'download' };                                     // 이 기기는 그대로, 다른 기기에서 바뀜
    }
    if (sigOf(local) === sigOf(remote)) return { action: 'same' };
    return { action: 'ask', recommend };                                                    // 양쪽 다 바뀜 → 사용자가 고른다
  }

  const api = { summaryOf, sigOf, isFresh, scoreOf, decide };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Sync = api;
})(typeof window !== 'undefined' ? window : globalThis);
