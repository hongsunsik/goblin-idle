// 결제·광고 설정. 기본은 둘 다 'demo'(시연용: 실제 돈이 청구되지 않고, 실제 광고도 나오지 않는다).
// 'off'로 바꾸면 결제·광고 버튼이 "준비 중"으로 바뀐다. 'live'(실제 결제·광고)는 아직 구현되어 있지 않다. → docs/PAYMENTS.md
window.PAYMENTS_CONFIG = { mode: 'demo' };
window.ADS_CONFIG = { mode: 'demo' };
