# Firebase 설정 방법 (Google·Apple 로그인 + 클라우드 저장)

게임에는 로그인과 클라우드 저장 기능이 들어 있지만, **Firebase 프로젝트를 직접 만들어서 설정 값을 넣어야 켜집니다.** 설정을 비워 두면(지금 상태) 기능이 꺼지고 게임은 예전처럼 이 기기에만 저장합니다.

> 아래는 Firebase 공식 문서를 바탕으로 정리한 절차입니다. 콘솔 화면의 글자나 위치는 바뀔 수 있으니, 다르면 [공식 문서](https://firebase.google.com/docs)를 함께 보세요. 요금은 무료 등급(Spark)으로 시작할 수 있습니다.

## 어떻게 동작하나요

- 로그인: Firebase Authentication (Google, Apple)
- 저장: Firestore의 `saves/{내 계정 ID}` 문서 하나에 게임 저장 데이터(JSON)를 넣습니다.
- 로그인하면 이 기기의 저장과 클라우드의 저장을 비교해서 알아서 맞춥니다.
  - 새 기기이면 클라우드 저장을 그대로 이어받습니다.
  - 양쪽이 모두 진행됐으면 **어느 쪽으로 계속할지 묻습니다** (더 앞선 쪽을 추천).
- 저장은 환생·전직·상점 구매 뒤 4초 안에, 평소에는 3분마다, 창을 가릴 때 올립니다. **바뀐 게 없으면 서버에 쓰지 않습니다.**
- 여러 기기가 동시에 저장하는 경우를 막으려고 저장마다 번호(`rev`)를 붙여서, 오래된 화면이 최신 저장을 덮어쓰지 못하게 합니다 (앱과 서버 규칙 양쪽에서 확인).

## 1. 프로젝트 만들기

1. [Firebase 콘솔](https://console.firebase.google.com/)에서 **프로젝트 추가**를 누르고 이름을 정합니다. (Google 애널리틱스는 꺼도 됩니다.)
2. 프로젝트 홈에서 **웹 앱(`</>`)** 을 추가합니다. 앱 이름은 아무거나, *Firebase Hosting*은 체크하지 않아도 됩니다.
3. 등록하면 `firebaseConfig` 값이 나옵니다. 이것을 저장소의 **`firebase-config.js`** 에 넣습니다.

```js
window.FIREBASE_CONFIG = {
  apiKey: '...',
  authDomain: '내프로젝트.firebaseapp.com',
  projectId: '내프로젝트',
  storageBucket: '내프로젝트.firebasestorage.app',
  messagingSenderId: '...',
  appId: '...',
};
```

이 값들은 웹 앱을 구분하는 식별자라서 저장소(공개)에 올려도 됩니다. 데이터는 아래 **보안 규칙**이 지킵니다. 다만 5번의 API 키 제한은 해 두기를 권합니다.

## 2. 로그인 방법 켜기 (Authentication)

콘솔에서 **Authentication → 시작하기 → 로그인 방법**으로 갑니다.

### Google (무료, 가장 쉬움)

1. **Google**을 눌러 사용 설정하고, 프로젝트 지원 이메일을 고른 뒤 저장합니다.

### Apple (선택, 유료)

Apple 로그인은 **Apple Developer Program 가입(연 99달러)** 이 있어야 합니다. 가입되어 있다면:

1. Apple Developer 계정에서 **App ID**(Sign in with Apple 켬), **Services ID**, **Sign in with Apple 키(.p8)** 를 만듭니다.
2. Services ID의 웹 설정에 도메인 `내프로젝트.firebaseapp.com` 과 반환 URL `https://내프로젝트.firebaseapp.com/__/auth/handler` 를 등록합니다.
3. Firebase 콘솔의 **Apple** 제공업체에서 Services ID, Apple 팀 ID, 키 ID, 비공개 키 내용을 입력하고 저장합니다.

자세한 순서는 공식 문서 [Apple로 인증](https://firebase.google.com/docs/auth/web/apple)을 따르세요. Apple을 설정하지 않으면 'Apple로 로그인'을 눌렀을 때 "이 로그인 방식이 아직 켜져 있지 않아요"라고 안내됩니다. (Google만 써도 됩니다.)

## 3. 승인된 도메인 추가

**Authentication → 설정 → 승인된 도메인**에 게임이 올라간 주소를 추가합니다.

- `hongsunsik.github.io` (GitHub Pages)
- `localhost` 는 기본으로 들어 있습니다.

추가하지 않으면 로그인할 때 "이 주소는 Firebase에서 허용되지 않았어요"라고 나옵니다.

## 4. 저장소 만들기 (Firestore)와 보안 규칙

1. **Firestore Database → 데이터베이스 만들기**를 누르고, 위치는 가까운 곳(예: 서울 `asia-northeast3`)을 고릅니다. **프로덕션 모드**로 시작합니다.
2. **규칙** 탭을 열어 이 저장소의 **`firestore.rules`** 내용을 붙여 넣고 **게시**합니다.

이 규칙이 하는 일:

| 규칙 | 뜻 |
|---|---|
| `request.auth.uid == uid` | 로그인한 본인만 자기 문서(`saves/내 uid`)를 읽고 쓸 수 있다 |
| 허용된 필드만 | `save`, `summary`, `rev`, `updatedAt` 외의 데이터는 넣을 수 없다 |
| `save.size() < 200000` | 저장 문자열은 20만 자 미만 (남용 방지) |
| `rev == 이전 rev + 1` | 저장할 때마다 번호가 정확히 1씩 늘어야 한다 (오래된 화면이 덮어쓰기 방지) |
| `updatedAt == request.time` | 저장 시각은 서버 시각만 허용 |

## 5. (권장) API 키 제한

[Google Cloud 콘솔 → API 및 서비스 → 사용자 인증 정보](https://console.cloud.google.com/apis/credentials)에서 Firebase가 만든 **브라우저 키**를 열고, **애플리케이션 제한사항 → 웹사이트**에 다음을 넣습니다.

- `https://hongsunsik.github.io/*`
- `http://localhost:*` (로컬 테스트용)

키가 공개돼 있어도 다른 사이트에서 쓰지 못하게 막는 설정입니다.

## 6. 내 컴퓨터에서 시험하기

`index.html`을 더블클릭해서 여는 방식(`file://`)에서는 **로그인 창이 동작하지 않습니다.** 작은 웹 서버로 열어야 합니다.

```
python3 -m http.server 8000
```

그다음 브라우저에서 <http://localhost:8000> 을 열고 **기록 탭 → 클라우드 저장 → Google로 로그인**을 눌러 보세요.

## 무료 한도

Spark(무료) 등급의 Firestore는 하루 쓰기 2만 회, 읽기 5만 회 정도입니다(정확한 값은 [요금 안내](https://firebase.google.com/pricing) 확인). 이 게임은 사용자 한 명당 접속 중 3분에 최대 1번, 바뀐 게 없으면 0번 쓰므로 소규모로는 넉넉합니다.

## 문제 해결

| 증상 | 원인과 해결 |
|---|---|
| 기록 탭에 "이 기기에만 저장돼요"만 보인다 | `firebase-config.js`가 아직 `null`입니다. 1번을 하세요. |
| "이 주소는 Firebase에서 허용되지 않았어요" | 3번 승인된 도메인에 주소를 추가하세요. |
| "이 로그인 방식이 아직 켜져 있지 않아요" | 2번에서 해당 제공업체를 사용 설정하세요. |
| "로그인 창이 막혔어요" | 브라우저의 팝업 차단을 풀고 다시 누르세요. (일부 모바일 브라우저는 자동으로 페이지 이동 방식으로 바뀝니다.) |
| "저장할 권한이 없어요" | 4번 보안 규칙을 게시했는지, 문서 경로가 `saves/내 uid`인지 확인하세요. |
| 로그인은 되는데 저장이 안 된다 | 브라우저 개발자 도구(F12)의 콘솔에서 오류 코드를 확인하세요. |

## 알아 두기 (보안의 한계)

- 게임 계산이 브라우저에서 돌아가기 때문에, 저장 데이터를 직접 고쳐서 올리는 **부정행위는 막을 수 없습니다.** 보안 규칙은 "남의 데이터에 접근 못 함", "크기 제한", "덮어쓰기 방지"까지만 보장합니다. 순위표처럼 남과 비교하는 기능을 만든다면 서버에서 검증하는 구조(Cloud Functions 등)가 따로 필요합니다.
- 저장에는 게임 진행 데이터와 로그인 계정의 ID가 들어갑니다. 이메일·이름은 화면에만 보여 주고 저장 문서에는 넣지 않습니다.
- **로그인 흐름과 실제 Firestore 규칙은 프로젝트 설정이 끝난 뒤에야 실제로 확인할 수 있습니다.** 이 저장소의 자동 점검(`node tools/test.js`, `node tools/ui-check.js`)은 가짜 서버와 가짜 Firebase SDK로 동작을 확인한 것이며, 실제 Google·Apple 로그인과 규칙 게시 결과를 대신하지는 않습니다.
