// Firebase 웹 앱 설정 (프로젝트 goblin-ff157). 비우면(null) 로그인·클라우드 저장 기능이 꺼지고, 게임은 이 기기에만 저장한다.
// 이 값들은 웹 앱을 구분하는 공개용 식별자라서 저장소에 올려도 안전하다. 데이터는 firestore.rules(본인 문서만 접근)가 지킨다.
// 다른 프로젝트로 바꾸려면 docs/FIREBASE-SETUP.md 를 보세요.
window.FIREBASE_CONFIG = {
  apiKey: 'AIzaSyC18urA-AO_hODRqWJ_V2bcNZE0gLDsDUw',
  authDomain: 'goblin-ff157.firebaseapp.com',
  projectId: 'goblin-ff157',
  storageBucket: 'goblin-ff157.firebasestorage.app',
  messagingSenderId: '999778690862',
  appId: '1:999778690862:web:c818353ff6e5fc67fa7cbf',
};
