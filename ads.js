// 고블린 키우기 - 보상형 광고 어댑터
//
// mode:
//   'off'  광고 없음 (광고 버튼이 "준비 중"으로 나온다)
//   'demo' 시연용 광고 (기본). 실제 광고가 아니라 카운트다운 화면이고, 끝까지 보면 보상을 받는다.
//   'live' 실제 광고. 아직 구현되지 않았다: 광고 네트워크(예: Google Ad Manager의 웹게임 보상형 광고) 승인과 개인정보 동의 화면이 필요하다. → docs/PAYMENTS.md
//
// showRewarded()는 { status: 'completed' | 'cancelled' | 'unavailable' } 를 돌려준다. 'completed'일 때만 보상을 준다.
(function (root) {
  // config: { mode }   deps: { showDemoAd() -> Promise<boolean> }  (시연 광고 화면은 화면 쪽이 그린다)
  function createAds(config, deps) {
    const mode = (config && config.mode) || 'demo';
    return {
      mode,
      available: mode === 'demo' || mode === 'live',
      isDemo: mode === 'demo',
      async showRewarded() {
        if (mode === 'demo') return { status: (await deps.showDemoAd()) ? 'completed' : 'cancelled' };
        if (mode === 'live') return { status: 'unavailable', reason: '실제 광고는 광고 네트워크 연동이 필요해요. (docs/PAYMENTS.md)' };
        return { status: 'unavailable', reason: '광고가 아직 준비되지 않았어요.' };
      },
    };
  }

  const api = { createAds };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GoblinAds = api;
})(typeof window !== 'undefined' ? window : globalThis);
