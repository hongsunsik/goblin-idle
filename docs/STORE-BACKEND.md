# 인앱 결제·출석·랭킹 연동 검토 (Google Play Billing · Apple IAP · 뒤끝 · Firebase)

작성 시점의 게임 상태를 기준으로, "개인이 스토어 결제와 게임 백엔드(BaaS)를 붙여 인앱 결제·출석 체크·랭킹을 서비스할 수 있는가"를 검토한 문서입니다. **구현은 하지 않았고**(결제·광고는 여전히 시연 모드), 무엇이 필요하고 무엇이 걸림돌인지, 어떤 순서가 현실적인지를 정리했습니다.

> **확인한 것과 못 한 것.** 아래 "확인됨"은 공식 문서를 직접 읽고 적었습니다(출처는 맨 끝). "확인 못 함"은 문서에서 찾지 못했거나 이번에 조사하지 않은 것이라, 결정 전에 직접 알아봐야 합니다. 특히 **수수료율·연회비·뒤끝의 요금**은 확인하지 못했습니다. 법률 자문이 아닙니다.

## 1. 결론 요약

| 질문 | 답 |
|---|---|
| 지금 코드로 바로 붙일 수 있나? | 아니요. 어느 쪽이든 **서버가 결제를 확인하고 크리스탈을 지급하는 구조**가 먼저 필요합니다. 지금은 브라우저가 크리스탈·출석·기록을 직접 저장해서 조작할 수 있습니다. |
| 가장 현실적인 순서는? | ① Firebase(이미 사용 중)에 서버 지갑·출석·랭킹을 만들고 → ② Android 앱(TWA)으로 감싸 Google Play Billing 연결 → ③ iOS는 나중에 별도 결정. |
| 뒤끝을 쓰면 되나? | **문서에서 확인한 범위로는 우리 게임(순수 HTML/JS)에 바로 맞는지 알 수 없습니다.** 기능(랭킹·출석·영수증 검증)은 있지만 SDK가 Unity 중심으로 보입니다. 쓰려면 먼저 웹(JavaScript) 사용 가능 여부를 문의해야 합니다. |
| Apple IAP는? | 가장 무겁고 위험합니다. 웹사이트를 그대로 감싼 앱은 심사에서 반려될 수 있고(4.2), 앱 안에서 게임 재화를 팔려면 IAP가 필수입니다(3.1.1). 뒤로 미루는 것을 권합니다. |

## 2. 현재 상태와 빠진 것

**이미 있는 것 (연동할 자리)**
- `payments.js` / `ads.js` 어댑터: `mode: 'live'` 자리가 비어 있고, 게임은 `{ status: 'paid', orderId }`만 받는 구조입니다.
- 주문 번호 중복 지급 방지(`creditCrystals`), 서버 시각 기준 날짜(광고 횟수·퀘스트·장비 상점 갱신), 확률 공개(장비 상자·드롭 표), 클라우드 저장(Firebase, `saves/{uid}` 규칙), `wallets/{uid}` 쓰기 금지 규칙(자리만 있고 미사용).
- 일일·주간·월간 퀘스트, 접속일 수, 업적 — **출석 체크의 게임 쪽 틀**은 이미 있습니다.

**없는 것 (서비스하려면 필요)**
1. **서버 지갑**: 크리스탈 잔액을 서버만 고칠 수 있게 두는 것. 지금은 저장 데이터를 고치면 크리스탈이 늘어납니다.
2. **서버 결제 검증**: 스토어 영수증(구매 토큰)을 서버가 확인하고 지급·"승인(acknowledge)"하는 것.
3. **서버 랭킹**: 아래 4번 참고. 지금은 랭킹이 없습니다.
4. **서버 출석**: 지금 "오늘 접속하기"는 브라우저가 계산합니다. 서버 시각 기준이라 시계 조작은 막지만 저장 데이터 조작은 못 막습니다.

## 3. 선택지별 검토

### A. Google Play Billing (Android)

**확인됨** ([출처 1](https://developer.chrome.com/docs/android/trusted-web-activity/receive-payments-play-billing))
- 웹 게임을 Play에 올리려면 **Trusted Web Activity(TWA)** 로 감싸고, 웹 쪽에서 **Digital Goods API + Payment Request API** 로 Play Billing을 씁니다. 순수 HTML/JS 게임이라 구조상 잘 맞습니다.
- 지원 범위: **Android(및 ChromeOS)의 Chrome 101 이상, TWA 안에서만** 동작합니다. 일반 웹 브라우저에서는 이 결제가 안 됩니다.
- **서버가 필수입니다**: 구매를 서버에서 검증하고 승인해야 하며, 승인하지 않으면 3일 뒤 자동 환불됩니다.
- 필요한 것: Google Play 개발자 계정과 결제 프로필(merchant), Play Console에 상품 등록, 공개/비공개/내부 테스트 트랙 중 하나에 앱 등록, Bubblewrap 프로젝트와 Digital Asset Links 설정.
- Play에 올린 앱에서 앱 내 디지털 상품(크리스탈)은 Play Billing을 써야 한다는 것이 문서의 전제입니다("Play policy will require you to implement Play Billing").

**확인 못 함**: 개발자 계정 등록비, 수수료율, 한국 게임 등급 분류·확률형 아이템 표기 요건이 스토어별로 어떻게 적용되는지.

**우리 게임에서 할 일**: `payments.js`의 `live` 모드를 "TWA 안이면 Digital Goods API, 아니면 비활성"으로 채우고, 서버 함수가 구매 토큰을 검증해 `wallets/{uid}`에 적립. 게임은 잔액을 읽기만 하도록 변경.

### B. Apple In-App Purchase (iOS)

**확인됨** ([출처 2](https://developer.apple.com/app-store/review/guidelines/))
- **3.1.1**: 앱 안의 게임 재화·레벨 등 기능 잠금 해제는 반드시 IAP로 해야 하고, 자체 방식(라이선스 키, 암호화폐 등)은 안 됩니다.
- **3.1.1**: 랜덤 아이템(루트박스)은 **구매 전에 각 아이템의 확률을 공개**해야 합니다. — 이 게임은 장비 상자·드롭 확률을 이미 공개합니다.
- **4.2**: "웹사이트를 다시 포장한 것 이상의 기능·콘텐츠·UI"가 있어야 하고, 그렇지 않으면 심사 대상이 아닙니다. **HTML 게임을 WebView로 감싸기만 하면 반려 위험이 큽니다.**

**필요한 것(일반적인 방식)**: 네이티브 껍데기 앱(예: Capacitor 등)에 StoreKit 결제 플러그인을 넣고, 영수증을 서버로 보내 검증. Apple Developer Program 가입 필요(**연회비·수수료율은 확인 못 함**).

**평가**: 웹과 달리 iOS는 (1) 감싼 앱 심사 위험, (2) IAP 강제, (3) 서버 영수증 검증이 모두 필요해서 가장 부담이 큽니다. Android 결제와 서버 지갑이 자리 잡은 뒤에 결정하는 것을 권합니다.

### C. 뒤끝 (The Backend, 문서 도메인이 `docs.backnd.com`으로 이전됨)

**확인됨** ([출처 3](https://docs.backnd.com/), [출처 4](https://developer.thebackend.io/unity3d/guide/receipt/google/), [출처 5](https://developer.thebackend.io/unity3d/guide/receipt/ios/))
- 문서에 **랭킹, 출석, 영수증 검증(구글·iOS), 우편, 쿠폰, 소셜 로그인** 기능이 있습니다.
- SDK는 문서 기준 **Unity(Base·Chat·Worlds·Database), Unreal(Chat), Web/Platform API(Chat), .NET(Functions)** 입니다. **기본 기능(Base)은 Unity 쪽에만 적혀 있고, 웹은 Chat만 적혀 있습니다.**
- 영수증 검증 문서는 Unity 가이드 안에 있습니다.
- 요금 최적화 문서에는 DB 읽기·쓰기와 저장 용량이 비용에 영향을 준다고 되어 있고, **요금 체계·무료 범위는 문서에서 찾지 못했습니다**(콘솔·별도 안내 확인 필요).

**해석(추측 아님, 확인 필요 표시)**: 게임 전용 백엔드라 랭킹·출석·우편·쿠폰을 직접 만들지 않아도 되는 것이 장점입니다. 하지만 **우리는 Unity가 아니라 순수 웹(JavaScript)** 이라서, 랭킹·출석을 브라우저에서 바로 호출할 수 있는지는 **확인되지 않았습니다.** 안 되면 별도 서버를 한 번 더 거쳐야 하고, 그러면 BaaS를 쓰는 이점이 줄어듭니다. **결정 전에 뒤끝에 "웹(JavaScript) 게임에서 Base(랭킹·출석·영수증 검증)를 쓸 수 있는지, 요금은 어떤지"를 문의하세요.**

### D. Firebase (이미 사용 중) + Cloud Functions

**근거**: 현재 로그인·저장이 Firebase라서 같은 프로젝트에 이어 붙일 수 있고, 순수 JS 웹 게임과 맞습니다. 이번에 새로 확인한 문서는 없고, 이전 문서(`docs/FIREBASE-SETUP.md`, `docs/PAYMENTS.md`)의 설계와 같습니다.
- **서버 지갑**: `wallets/{uid}`를 서버(Admin SDK)만 쓰게 하고 브라우저는 읽기만.
- **결제 검증**: Cloud Functions에서 Google Play Developer API로 구매 토큰 검증·승인 후 지갑 적립(Android). PG를 붙이면 같은 지갑에 웹 결제도 적립.
- **출석·랭킹**: Firestore에 서버 시각(`serverTimestamp`)으로 출석 기록, 랭킹 컬렉션을 Functions로 갱신.
- **비용**: 외부(PG·Google API)로 요청을 보내려면 **Blaze(종량제) 요금제**가 필요합니다(결제 수단 등록 필요, 무료 한도는 있음). 정확한 요금은 확인 못 함.

## 4. 랭킹에서 가장 조심할 점 (부정행위)

이 게임은 계산이 브라우저에서 돌아가서, **"내 최고 스테이지 = 140" 같은 값을 서버가 진짜인지 확인할 방법이 없습니다.** 저장 데이터를 고쳐 올릴 수 있기 때문입니다. 선택지는 다음과 같습니다.
1. **친선 랭킹으로 표시**: "기록은 자기 신고입니다"라고 밝히고, 실제 돈이나 보상과 연결하지 않기. (가장 쉽고 정직함)
2. **그럴듯함 검사**: 시간당 도달 가능한 스테이지 상한, 증표 개수와 최고 스테이지의 관계 등을 서버에서 검사해 명백한 조작만 걸러내기. (완벽하지 않음)
3. **서버가 전투를 재계산**: 봇 시뮬레이션처럼 서버에서 같은 로직을 돌려 검증. 정확하지만 비용·구현이 큼(같은 `game.js`를 서버에서 실행할 수는 있음).

**랭킹 보상에 크리스탈 같은 유료 재화를 걸면 조작 유인이 커지므로**, 1~2번 상태에서는 보상을 걸지 않는 것을 권합니다.

## 5. 결제 채널이 여러 개일 때의 주의

- Play에 올린 앱 안에서는 크리스탈을 **Play Billing으로만** 팔아야 합니다(위 A). iOS도 IAP 강제(위 B). 반면 스토어 밖 웹(GitHub Pages)에서는 PG 결제가 가능합니다(사업자등록·PG 계약 필요, `docs/PAYMENTS.md`).
- 채널마다 가격·환불 규정이 다르므로 **같은 크리스탈 지갑을 서버에서 공유**하되, 어느 채널에서 샀는지 구분해 기록해야 환불 처리가 가능합니다.
- 무료로 얻는 크리스탈(광고·업적·퀘스트)과 결제 크리스탈을 구분해 두는 것이 좋습니다(`docs/PAYMENTS.md` 참고).

## 6. 추천 진행 순서

| 단계 | 내용 | 필요한 것 | 상태 |
|---|---|---|---|
| 0 | 시연 모드 유지, 결제·광고 버튼 비활성(`off`)으로 공개 | 없음 | 지금 |
| 1 | Firebase 서버 지갑 + 서버 출석 + 친선 랭킹(보상 없음) | Blaze 요금제 | 미구현 |
| 2 | Android TWA + Play Billing, Functions에서 구매 검증 | Play 개발자 계정, 상품 등록, Bubblewrap, 서버 함수 | 미구현 |
| 3 | 확률형 아이템·등급 분류·청약철회·약관 정비 | `docs/PAYMENTS.md` 체크리스트 | 미구현 |
| 4 | (선택) 웹 PG 결제 | 사업자등록, PG 계약 | 미구현 |
| 5 | (보류) iOS IAP | 네이티브 앱 껍데기, Apple 계정, 4.2 대응 | 결정 필요 |
| ? | 뒤끝은 단계 1의 대안 — **웹 사용 가능 여부를 문의한 뒤** 비교 | 뒤끝 문의 | 확인 필요 |

## 7. 사용자가 정해 주셔야 하는 것

1. **어느 채널까지 갈 것인가**: 웹만 / Android까지 / iOS까지.
2. **서버**: Firebase(이미 사용 중, 추천)로 갈지, 뒤끝 문의 결과를 보고 결정할지.
3. **사업자등록·PG·스토어 개발자 계정** 보유 여부.
4. **랭킹**: 친선 랭킹으로 충분한지, 보상을 걸고 싶다면 서버 재계산까지 갈지.

## 출처

1. [Receive Payments via Google Play Billing with the Digital Goods API and the Payment Request API (Chrome for Developers)](https://developer.chrome.com/docs/android/trusted-web-activity/receive-payments-play-billing)
2. [App Review Guidelines (Apple Developer)](https://developer.apple.com/app-store/review/guidelines/)
3. [뒤끝(Backnd) 개발자 문서](https://docs.backnd.com/)
4. [뒤끝 구글 영수증 검증](https://developer.thebackend.io/unity3d/guide/receipt/google/)
5. [뒤끝 iOS 영수증 검증](https://developer.thebackend.io/unity3d/guide/receipt/ios/)
6. [뒤끝 요금 최적화 가이드](https://docs.backnd.com/sdk-docs/backend/base/optimize-cost/)
