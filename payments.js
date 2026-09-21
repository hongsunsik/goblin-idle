// 고블린 키우기 - 크리스탈 충전(결제) 어댑터
//
// mode:
//   'off'  결제 없음 (충전 버튼이 "준비 중"으로 나온다)
//   'demo' 시연용 결제 (기본). 결제 확인 창만 보여 주고 실제 돈은 청구하지 않으며, 카드 정보도 받지 않는다.
//   'live' 실제 결제. 아직 구현되지 않았다: 결제대행사(PG) 계약과, 결제 성공을 서버가 확인해 크리스탈을 지급하는 서버가 필요하다. → docs/PAYMENTS.md
//
// 결제가 성공하면 { status: 'paid', orderId } 를 돌려준다. 게임은 orderId로 같은 주문이 두 번 지급되지 않게 막는다 (game.js creditCrystals).
// 실제 결제에서는 이 결과를 화면(클라이언트)이 만들어 내면 안 된다. 서버가 PG에 결제를 확인한 뒤에만 지급해야 한다 (누구나 결과를 조작할 수 있으므로).
(function (root) {
  const makeOrderId = () => `demo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

  // config: { mode }   deps: { confirmDemo(pack) -> Promise<boolean> }  (시연 결제 확인 창은 화면 쪽이 그린다)
  function createPayments(config, deps) {
    const mode = (config && config.mode) || 'demo';
    return {
      mode,
      available: mode === 'demo' || mode === 'live',
      isDemo: mode === 'demo',
      async checkout(pack) {
        if (mode === 'demo') {
          const ok = await deps.confirmDemo(pack);
          return ok ? { status: 'paid', orderId: makeOrderId(), demo: true } : { status: 'cancelled' };
        }
        if (mode === 'live') return { status: 'unavailable', reason: '실제 결제는 결제대행사와 서버 연동이 필요해요. (docs/PAYMENTS.md)' };
        return { status: 'unavailable', reason: '결제가 아직 준비되지 않았어요.' };
      },
    };
  }

  const api = { createPayments, makeOrderId };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GoblinPayments = api;
})(typeof window !== 'undefined' ? window : globalThis);
