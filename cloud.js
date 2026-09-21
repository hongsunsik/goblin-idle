// 고블린 키우기 - 클라우드 저장 클라이언트
// 로그인 상태를 관리하고, 이 기기와 클라우드의 저장을 맞춘다. 서버와의 통신은 adapter가 맡고 (실제로는 Firebase, 테스트에서는 가짜),
// 화면과 게임 상태는 deps로 받아서 이 파일은 둘 다 모른다.
//
// adapter 규격:
//   onAuth(cb)               로그인 상태가 바뀔 때 cb(user|null). user = { uid, name, email, photo, provider }. 구독 해제 함수를 돌려준다.
//   signIn('google'|'apple') 로그인 창을 연다
//   signOut()
//   read()                   -> null | { save, rev, summary, updatedAt }
//   write({ save, summary, expectedRev }) -> { ok: true, rev } | { conflict: true, remote }
// deps 규격:
//   getLocal()               -> { text, summary }  지금 게임 저장 (문자열과 요약)
//   applySave(text)          -> boolean            클라우드 저장을 게임에 적용
//   askConflict(info)        -> Promise<'cloud'|'local'|null>  양쪽이 다를 때 사용자가 고르게 한다 (null이면 취소)
//   storage                  { get(key), set(key, value), remove(key) } 기기에 남기는 동기화 기록
//   onChange(state)          화면 갱신용
(function (root) {
  const Sync = typeof module !== 'undefined' && module.exports ? require('./sync.js') : root.Sync;
  const BASE_KEY = 'goblin-idle-cloud-v1';

  function createCloud(adapter, deps) {
    const st = { configured: !!adapter, user: null, status: adapter ? 'signedout' : 'off', lastSyncedAt: 0, rev: 0, error: '' };
    let unsub = null, pushTimer = null, busy = null;

    const emit = () => { if (deps.onChange) deps.onChange(Object.assign({}, st)); };
    const set = (patch) => { Object.assign(st, patch); emit(); };

    // ---- 이 기기가 마지막으로 동기화한 기록 (계정마다 따로) ----
    function readBase() {
      try { const b = JSON.parse(deps.storage.get(BASE_KEY) || 'null'); return b && b.uid === (st.user && st.user.uid) ? b : null; } catch (e) { return null; }
    }
    function writeBase(rev, summary) {
      try { deps.storage.set(BASE_KEY, JSON.stringify({ uid: st.user.uid, rev, sig: Sync.sigOf(summary) })); } catch (e) { /* 저장소를 못 써도 게임은 계속 */ }
    }

    // 한 번에 하나의 동기화만 돌린다 (겹쳐서 부르면 같은 작업을 기다린다)
    function exclusive(fn) {
      if (busy) return busy;
      busy = (async () => {
        set({ status: 'syncing', error: '' });
        try { return await fn(); }
        catch (e) { set({ status: 'error', error: friendlyError(e) }); return { ok: false, error: e }; }
        finally { busy = null; }
      })();
      return busy;
    }

    async function upload(local, expectedRev) {
      const res = await adapter.write({ save: local.text, summary: local.summary, expectedRev });
      if (res.conflict) return { conflict: true, remote: res.remote };
      writeBase(res.rev, local.summary);
      set({ status: 'ok', rev: res.rev, lastSyncedAt: Date.now() });
      return { ok: true, action: 'upload' };
    }
    function download(remote) {
      if (!deps.applySave(remote.save)) throw new Error('클라우드 저장을 읽지 못했어요');
      writeBase(remote.rev, remote.summary);
      set({ status: 'ok', rev: remote.rev, lastSyncedAt: Date.now() });
      return { ok: true, action: 'download' };
    }

    // 양쪽이 다를 때 사용자에게 고르게 한다
    async function resolve(local, remote, recommend) {
      const choice = await deps.askConflict({ local: local.summary, remote: remote.summary, recommend, remoteUpdatedAt: remote.updatedAt });
      if (choice === 'cloud') return download(remote);
      if (choice === 'local') return upload(local, remote.rev);   // 클라우드를 이 기기의 저장으로 덮어쓴다
      set({ status: 'ok' });   // 아무것도 바꾸지 않고 닫는다
      return { ok: true, action: 'cancel' };
    }

    // 로그인 직후나 '지금 동기화'에서 부른다: 두 저장을 비교해 알맞게 맞춘다
    function sync() {
      return exclusive(async () => {
        if (!st.user) return { ok: false };
        const remote = await adapter.read();
        const local = deps.getLocal();
        const remoteInfo = remote ? Object.assign({}, remote.summary, { rev: remote.rev }) : null;
        const d = Sync.decide(local.summary, remoteInfo, readBase());
        if (d.action === 'same') {
          if (remote) writeBase(remote.rev, local.summary);
          set({ status: 'ok', rev: remote ? remote.rev : 0, lastSyncedAt: Date.now() });
          return { ok: true, action: 'same' };
        }
        if (d.action === 'upload') {
          const r = await upload(local, remote ? remote.rev : 0);
          return r.conflict ? resolve(local, r.remote, d.recommend) : r;
        }
        if (d.action === 'download') return download(remote);
        return resolve(local, remote, d.recommend);
      });
    }

    // 지금 진행을 클라우드에 올린다 (자동 저장용). 그 사이 다른 기기가 올렸다면 덮어쓰지 않고 사용자에게 묻는다.
    function push() {
      return exclusive(async () => {
        if (!st.user) return { ok: false };
        const local = deps.getLocal();
        // 마지막으로 맞춘 뒤 바뀐 게 없으면 서버에 쓰지 않는다 (자동 저장이 주기적으로 돌아서, 쓸데없는 쓰기를 줄인다)
        const b = readBase();
        if (b && b.rev === st.rev && b.sig === Sync.sigOf(local.summary)) { set({ status: 'ok' }); return { ok: true, action: 'unchanged' }; }
        const r = await upload(local, st.rev);
        if (!r.conflict) return r;
        const remote = r.remote;
        const remoteInfo = Object.assign({}, remote.summary, { rev: remote.rev });
        const d = Sync.decide(local.summary, remoteInfo, readBase());
        return resolve(local, remote, d.recommend || 'cloud');
      });
    }

    // 잠시 뒤에 올린다 (연달아 부르면 마지막 한 번만)
    function schedulePush(delayMs) {
      if (!st.user) return;
      clearTimeout(pushTimer);
      pushTimer = setTimeout(() => { push(); }, delayMs);
    }

    async function signIn(provider) {
      if (!adapter) return { ok: false };
      set({ error: '' });   // 이전 시도의 오류 문구는 새로 시도할 때 지운다
      try { await adapter.signIn(provider); return { ok: true }; }
      catch (e) {
        const msg = friendlyError(e);
        if (msg) set({ error: msg });
        return { ok: false, error: e, message: msg };
      }
    }
    async function signOut() {
      clearTimeout(pushTimer);
      try { if (st.user) await push(); } catch (e) { /* 로그아웃은 저장 실패와 상관없이 진행 */ }
      await adapter.signOut();
    }

    function start() {
      if (!adapter || unsub) return;
      unsub = adapter.onAuth((user) => {
        set({ user, status: user ? 'syncing' : 'signedout', error: '', rev: user && st.user && st.user.uid === user.uid ? st.rev : 0 });
        if (user) sync();
      });
    }
    function stop() { if (unsub) unsub(); unsub = null; clearTimeout(pushTimer); }

    return { state: () => Object.assign({}, st), start, stop, signIn, signOut, sync, push, schedulePush };
  }

  // 오류를 사용자가 이해할 말로 바꾼다. 빈 문자열이면 알릴 필요 없는 오류(창을 스스로 닫음 등).
  function friendlyError(e) {
    const code = (e && e.code) || '';
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return '';
    if (code === 'auth/popup-blocked') return '로그인 창이 막혔어요. 브라우저의 팝업 차단을 풀고 다시 눌러 주세요.';
    if (code === 'auth/unauthorized-domain') return '이 주소는 Firebase에서 허용되지 않았어요. (설정 방법은 docs/FIREBASE-SETUP.md 참고)';
    if (code === 'auth/configuration-not-found') return '이 프로젝트의 로그인 기능이 아직 시작되지 않았어요. (Firebase 콘솔 → Authentication → 시작하기)';
    if (code === 'auth/operation-not-allowed') return '이 로그인 방식이 아직 Firebase에서 켜져 있지 않아요.';
    if (code === 'auth/network-request-failed' || code === 'unavailable') return '인터넷 연결을 확인해 주세요.';
    if (code === 'permission-denied') return '저장할 권한이 없어요. Firestore 보안 규칙을 확인해 주세요.';
    return (e && e.message) || '알 수 없는 오류가 났어요.';
  }

  const api = { createCloud, friendlyError, BASE_KEY };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.CloudClient = api;
})(typeof window !== 'undefined' ? window : globalThis);
