# 안드로이드 앱(TWA)으로 포장하기

웹 게임을 **Trusted Web Activity(TWA)** 로 감싸 Google Play에 올리는 준비 문서입니다. 이 저장소에는 **웹 쪽 준비만** 들어 있고, 실제 앱 빌드·Play Console 작업은 아직 하지 않았습니다.

> **확인한 것**: TWA로 감싸는 방법(`bubblewrap init --manifest=…`, `bubblewrap build`)과 "도메인 루트의 `/.well-known/assetlinks.json`"이 필요하다는 것은 [Chrome 공식 문서](https://developer.chrome.com/docs/android/trusted-web-activity/quick-start)를 읽고 적었습니다. **확인 못 한 것**은 "확인 필요"로 적었습니다. 이 문서는 법률·심사 자문이 아닙니다.

## 1. 저장소에 준비된 것

| 파일 | 역할 |
|---|---|
| `manifest.webmanifest` | 앱 이름·아이콘·화면 방향(세로)·색. Bubblewrap이 이걸 읽어서 안드로이드 프로젝트를 만듭니다. |
| `icons/` | 192·512 아이콘, **maskable** 512(안드로이드가 원·둥근 사각형으로 잘라도 안전), 아이폰용 180. `python3 tools/make-icons.py`로 다시 만듭니다. |
| `sw.js` | 서비스 워커. 항상 네트워크의 최신 파일을 먼저 받고, 오프라인일 때만 저장본을 씁니다. POST·HEAD(서버 시각 확인)·다른 사이트 요청은 건드리지 않습니다. |
| `index.html` | 매니페스트·아이콘 연결과 서비스 워커 등록(https에서만). |
| `twa/twa-manifest.json` | Bubblewrap 설정 **참고용 초안**(패키지 이름·주소·색·아이콘 주소). |
| `twa/assetlinks.sample.json` | 도메인 소유 증명 파일의 견본(지문은 비어 있음). |

`node tools/test.js`의 "배포 파일" 구역이 매니페스트 필드, 아이콘 파일 크기, 서비스 워커의 안전 조건, 견본 파일 모양을 점검합니다.

## 2. 가장 큰 걸림돌: `assetlinks.json`은 **도메인 루트**에 있어야 한다

TWA는 앱과 웹사이트가 같은 주인인지 `https://도메인/.well-known/assetlinks.json` 으로 확인합니다. 지금 게임 주소는 `https://hongsunsik.github.io/goblin-idle/` 인데, 확인해 보니 **`https://hongsunsik.github.io/.well-known/assetlinks.json` 은 404**입니다(루트 페이지도 404). GitHub Pages의 프로젝트 사이트는 `/goblin-idle/` 아래만 다룰 수 있어서, 루트에 파일을 두려면 다음 중 하나가 필요합니다.

1. **사용자 사이트 저장소 만들기**: `hongsunsik/hongsunsik.github.io` 저장소를 새로 만들고 `.well-known/assetlinks.json`과 빈 `.nojekyll` 파일을 올립니다(점(.)으로 시작하는 폴더가 빠지지 않게). 기존 `calculator`·`goblin-idle` 주소는 그대로 유지됩니다. **가장 간단합니다.**
2. **내 도메인 연결**: 도메인을 사서 GitHub Pages에 연결하면 그 도메인 루트를 마음대로 쓸 수 있습니다(도메인 비용 발생, 나중에 Play 결제·서버 주소를 정리하기에도 좋음).

> 사용자 사이트 저장소를 만들면 `https://hongsunsik.github.io/` 루트도 살아납니다. 지금은 비어 있어도 됩니다.

## 3. 결정해야 하는 것

| 항목 | 메모 |
|---|---|
| **패키지 이름** | `io.github.hongsunsik.raisegoblin` (영어로 "고블린 키우기" = Raise Goblin). **Play에 올린 뒤에는 바꿀 수 없습니다.** 다른 이름을 원하면 `twa/twa-manifest.json`을 고치세요. |
| **서명 키(keystore)** | 앱 서명에 씁니다. **파일과 비밀번호를 잃어버리면 업데이트가 어렵습니다.** 저장소에 올리지 말고(`.gitignore`) 안전한 곳에 백업하세요. Play 앱 서명을 쓰면 Play Console이 보여 주는 **앱 서명 키의 SHA-256 지문**을 `assetlinks.json`에 넣어야 하는 경우가 많습니다(확인 필요: Play Console 안내). |
| **Play Console 계정** | 등록비 25달러(한 번). 개인 계정의 본인 인증·출시 전 테스트 요건은 **확인 필요**(가입할 때 안내). |
| **개인정보처리방침 주소** | 로그인·저장을 하므로 필요할 수 있습니다(확인 필요). 저장소의 페이지로 만들어 주소를 적을 수 있습니다. |
| **스토어 등록 자료** | 앱 설명, 스크린샷(`docs/*.jpg` 활용 가능), 대표 이미지, 등급 설문(확률형 아이템 표기 포함). 요구 크기는 Play Console에서 확인. |

## 4. 만드는 순서 (개발 컴퓨터에서)

필요한 것: Node.js, JDK, Android SDK(Bubblewrap이 처음 실행할 때 내려받도록 안내해 줍니다).

```
npm i -g @bubblewrap/cli
mkdir goblin-android && cd goblin-android
bubblewrap init --manifest=https://hongsunsik.github.io/goblin-idle/manifest.webmanifest
bubblewrap build          # app-release-signed.apk (테스트·업로드용)
bubblewrap install        # USB 디버깅을 켠 폰에 설치
```

1. `bubblewrap init` 질문에서 패키지 이름·서명 키 위치를 정합니다(`twa/twa-manifest.json` 참고).
2. 앱 서명 키의 **SHA-256 지문**을 얻어 `assetlinks.json`을 만들고 **도메인 루트**(2번)에 올립니다. 지문이 다르면 주소창이 달린 일반 화면(Custom Tab)으로 열립니다(문서에 나온 증상).
3. Play Console에서 앱을 만들고 **내부 테스트 → 비공개 테스트** 순서로 올려 폰에서 확인합니다.
4. 설치한 앱에서 주소창이 보이지 않고 전체 화면으로 열리는지, 로그인(Google)·저장·자리를 비운 시간 계산이 웹과 같은지 확인합니다.

## 5. 앱에서 확인할 게임 쪽 주의점

- **Google 로그인**: 앱 안(TWA)에서 팝업이 막히면 게임이 자동으로 리다이렉트 방식으로 다시 시도합니다(`cloud-firebase.js`). 실제 폰에서 꼭 시험하세요. Firebase 콘솔의 승인된 도메인에는 이미 `hongsunsik.github.io`가 있습니다.
- **서버 시각**: 게임은 사이트의 응답 헤더(`Date`)로 시간을 잽니다. 서비스 워커는 이 HEAD 요청을 건드리지 않게 만들었습니다.
- **오프라인**: 한 번 열어 본 뒤에는 서비스 워커의 저장본으로 열립니다. 새 버전은 온라인일 때 바로 받습니다.
- **광고**: 지금은 시연 화면입니다. 실제 광고는 별도 승인이 필요합니다(`docs/PAYMENTS.md`).

## 6. 결제(Play Billing)는 그 다음

앱이 뜨는 것을 확인한 **뒤에** 진행합니다. 구글 문서 기준으로 Play Billing은 Bubblewrap 1.8.2 이상에서 `playBilling`·`alphaDependencies`를 켜고, Digital Goods API + Payment Request API로 결제하며, **구매를 서버에서 검증·승인해야** 합니다(승인 안 하면 3일 뒤 자동 환불). 서버(Blaze 요금제의 Cloud Functions)가 필요하므로 [STORE-BACKEND.md](STORE-BACKEND.md)의 순서를 따릅니다. 서버 검증 없이 크리스탈 결제를 열지 마세요.

## 확인 못 한 것 (직접 확인 필요)

- Play Console 개인 계정의 출시 전 테스트 요건, 본인 인증 절차
- 한국에서 유료 상품을 팔 때의 신고 의무, 게임 등급 분류 절차
- Play 앱 서명 사용 시 `assetlinks.json`에 어떤 지문을 넣어야 하는지(Play Console 안내 확인)
