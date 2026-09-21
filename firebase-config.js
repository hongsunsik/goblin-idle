// Firebase 웹 앱 설정. 비워 두면(null) 로그인·클라우드 저장 기능이 꺼지고, 게임은 지금처럼 이 기기에만 저장한다.
// 채우는 방법은 docs/FIREBASE-SETUP.md 를 보세요. (이 값들은 공개돼도 안전한 '웹 앱 식별자'이고, 데이터 보호는 firestore.rules가 합니다.)
window.FIREBASE_CONFIG = null;
// 예:
// window.FIREBASE_CONFIG = {
//   apiKey: '...', authDomain: '내프로젝트.firebaseapp.com', projectId: '내프로젝트',
//   storageBucket: '내프로젝트.firebasestorage.app', messagingSenderId: '...', appId: '...',
// };
