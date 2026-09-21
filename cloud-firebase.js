// 고블린 키우기 - Firebase 어댑터 (cloud.js가 요구하는 규격을 Firebase Auth + Firestore로 구현한다)
// 저장 위치: Firestore 문서 saves/{uid} = { save(문자열), summary, rev(정수), updatedAt }
// 필요한 설정은 docs/FIREBASE-SETUP.md 참고. 설정(firebase-config.js)이 비어 있으면 이 파일은 쓰이지 않는다.
(function (root) {
  const SDK_VERSION = '10.14.1';
  const CDN = `https://www.gstatic.com/firebasejs/${SDK_VERSION}/`;

  // Firebase SDK는 로그인 기능을 쓸 때만 내려받는다 (설정이 없으면 게임은 SDK 없이 그대로 동작)
  async function loadSdk() {
    const [app, auth, firestore] = await Promise.all([
      import(CDN + 'firebase-app.js'), import(CDN + 'firebase-auth.js'), import(CDN + 'firebase-firestore.js'),
    ]);
    return { app, auth, firestore };
  }

  const toUser = (u) => (u ? {
    uid: u.uid,
    name: u.displayName || u.email || '플레이어',
    email: u.email || '',
    photo: u.photoURL || '',
    provider: (u.providerData && u.providerData[0] && u.providerData[0].providerId) || '',
  } : null);

  // config: Firebase 웹 앱 설정. sdk: 테스트에서 가짜 SDK를 넣을 때만 쓴다.
  function createFirebaseAdapter(config, sdk) {
    let ready = null;   // SDK를 불러와 앱을 초기화하는 작업 (한 번만)
    const boot = () => ready || (ready = (async () => {
      const m = sdk || await loadSdk();
      const app = m.app.initializeApp(config);
      const auth = m.auth.getAuth(app);
      const db = m.firestore.getFirestore(app);
      // 로그인 창 대신 '리다이렉트'로 돌아온 경우의 결과를 마무리한다 (실패하면 콘솔에만 남긴다)
      try { await m.auth.getRedirectResult(auth); } catch (e) { console.warn('로그인 결과를 확인하지 못했어요:', e && e.code); }
      return { m, auth, db };
    })());

    const ref = ({ m, db }, uid) => m.firestore.doc(db, 'saves', uid);
    const toRemote = (snap) => {
      if (!snap.exists()) return null;
      const d = snap.data();
      return { save: d.save, rev: d.rev, summary: d.summary || {}, updatedAt: d.updatedAt && d.updatedAt.toMillis ? d.updatedAt.toMillis() : 0 };
    };

    return {
      configured: true,

      onAuth(cb) {
        let off = null, cancelled = false;
        boot().then((b) => {
          if (cancelled) return;
          off = b.m.auth.onAuthStateChanged(b.auth, (u) => cb(toUser(u)));
        }).catch((e) => { console.error('Firebase를 시작하지 못했어요:', e); cb(null); });
        return () => { cancelled = true; if (off) off(); };
      },

      async signIn(provider) {
        const b = await boot();
        const { GoogleAuthProvider, OAuthProvider, signInWithPopup, signInWithRedirect } = b.m.auth;
        let p;
        if (provider === 'google') {
          p = new GoogleAuthProvider();
          p.setCustomParameters({ prompt: 'select_account' });   // 기기에 로그인된 계정이 있어도 매번 계정을 고르게 한다 (계정을 여러 개 쓰는 사람용)
        }
        else if (provider === 'apple') { p = new OAuthProvider('apple.com'); p.addScope('email'); p.addScope('name'); }
        else throw new Error('지원하지 않는 로그인 방식이에요: ' + provider);
        try {
          await signInWithPopup(b.auth, p);
        } catch (e) {
          // 팝업을 쓸 수 없는 환경(일부 모바일·인앱 브라우저)에서는 페이지 이동 방식으로 다시 시도한다
          if (e && (e.code === 'auth/operation-not-supported-in-this-environment')) { await signInWithRedirect(b.auth, p); return; }
          throw e;
        }
      },

      async signOut() { const b = await boot(); await b.m.auth.signOut(b.auth); },

      async read() {
        const b = await boot();
        const u = b.auth.currentUser;
        if (!u) throw Object.assign(new Error('로그인이 필요해요'), { code: 'auth/requires-login' });
        return toRemote(await b.m.firestore.getDoc(ref(b, u.uid)));
      },

      // 트랜잭션으로 "내가 마지막으로 본 rev와 서버 rev가 같을 때만" 저장한다. 다르면 다른 기기가 먼저 저장한 것이라 덮어쓰지 않고 알린다.
      async write({ save, summary, expectedRev }) {
        const b = await boot();
        const u = b.auth.currentUser;
        if (!u) throw Object.assign(new Error('로그인이 필요해요'), { code: 'auth/requires-login' });
        const r = ref(b, u.uid);
        return b.m.firestore.runTransaction(b.db, async (tx) => {
          const snap = await tx.get(r);
          const cur = snap.exists() ? snap.data().rev : 0;
          if (cur !== expectedRev) return { conflict: true, remote: toRemote(snap) };
          tx.set(r, { save, summary, rev: cur + 1, updatedAt: b.m.firestore.serverTimestamp() });
          return { ok: true, rev: cur + 1 };
        });
      },
    };
  }

  const api = { createFirebaseAdapter, SDK_VERSION };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CloudFirebase = api;
})(typeof window !== 'undefined' ? window : globalThis);
