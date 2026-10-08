/* Единый источник данных. В продакшене локальный кэш НИКОГДА не заменяет snapshot сервера. */
(function () {
  'use strict';
  const config = window.KUBA_CONFIG;
  const demo = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname) && new URLSearchParams(location.search).get('demo') === '1';
  const key = demo ? 'kuba_demo_v2' : 'kuba_cache_v2';
  const clone = value => JSON.parse(JSON.stringify(value));
  let state = clone(window.KUBA_DEFAULTS), auth = null, db = null, currentUser = null;
  const listeners = new Set(), authListeners = new Set(), statusListeners = new Set();
  let lastDemoRevision = 0;
  let status = {type: 'loading', text: 'Подключение к базе…'};
  const notify = () => listeners.forEach(fn => fn(clone(state)));
  const setStatus = (type, text) => { status = {type, text}; statusListeners.forEach(fn => fn(status)); };
  const cached = () => { try { return JSON.parse(localStorage.getItem(key) || 'null'); } catch (_) { return null; } };
  function apply(data, persist = true) {
    if (!data || typeof data !== 'object') return;
    if (demo && typeof data.revision === 'number') {
      if (data.revision <= lastDemoRevision) return;
      lastDemoRevision = data.revision;
    }
    if (Array.isArray(data.tours)) state.tours = data.tours;
    if (data.settings && typeof data.settings === 'object') state.settings = {...window.KUBA_DEFAULTS.settings, ...data.settings};
    try { if (persist) localStorage.setItem(key, JSON.stringify(demo ? {...state, revision: lastDemoRevision} : state)); } catch (_) { /* Кэш необязателен. */ }
    notify();
  }
  apply(cached(), false);
  let channel;
  if (demo) {
    setStatus('demo', 'ДЕМО: изменения только в этом браузере. Firebase не используется.');
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel('kuba-demo');
      channel.onmessage = e => { if(e.data?.type === 'config') apply(e.data.data, false); };
    }
    addEventListener('storage', e => { if (e.key === key && e.newValue) { try { apply(JSON.parse(e.newValue), false); } catch (_) {} } });
  } else {
    try {
      if (!window.firebase) throw new Error('Firebase SDK не загружен');
      if (!firebase.apps.length) firebase.initializeApp(config.firebase);
      db = firebase.firestore(); auth = firebase.auth();
      auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});
      auth.onAuthStateChanged(user => { currentUser = user; authListeners.forEach(fn => fn(user)); });
      db.collection('site_config').doc('main').onSnapshot({includeMetadataChanges: true}, doc => {
        if (doc.exists) apply(doc.data());
        else if (!doc.metadata.fromCache) apply(window.KUBA_DEFAULTS);
        setStatus(doc.metadata.fromCache ? 'offline' : 'live', doc.metadata.fromCache ? 'Кэш: ожидаем связь с сервером' : 'Онлайн · обновления в реальном времени');
      }, err => {
        console.warn('Firestore:', err.code);
        setStatus('error', 'Нет доступа к базе. Проверьте подключение и правила Firestore. Показана последняя копия.');
      });
      addEventListener('offline', () => setStatus('offline', 'Нет сети · показана последняя копия'));
    } catch (err) { console.warn(err.message); setStatus('error', 'Firebase недоступен. Показаны исходные данные; публикация отключена.'); }
  }
  const admin = user => !!user && (demo || user.email === config.adminEmail && user.emailVerified);
  const assertAuth = () => { if (!currentUser) throw new Error('Сначала войдите в аккаунт'); };
  const assertAdmin = () => { if (!admin(currentUser)) throw new Error('Требуется аккаунт администратора с подтверждённой почтой'); };
  async function login(email, password) {
    if (demo) { currentUser = {uid: 'demo-user', email, displayName: 'Демо-пользователь', emailVerified: true}; authListeners.forEach(fn => fn(currentUser)); return currentUser; }
    if (!auth) throw new Error('Авторизация недоступна: проверьте Firebase');
    return (await auth.signInWithEmailAndPassword(email, password)).user;
  }
  async function register(name, email, password) {
    if (demo) return login(email, password);
    if (!auth) throw new Error('Авторизация недоступна');
    const result = await auth.createUserWithEmailAndPassword(email, password);
    await result.user.updateProfile({displayName: name});
    authListeners.forEach(fn => fn(result.user));
    return result.user;
  }
  async function logout() {
    if (auth) await auth.signOut();
    currentUser = null; authListeners.forEach(fn => fn(null));
  }
  async function publish(patch) {
    assertAdmin();
    if (!patch || (!Array.isArray(patch.tours) && !patch.settings)) throw new Error('Нет данных для публикации');
    const data = {...patch, lastUpdated: new Date().toISOString()};
    if (demo) {
      const revision = Math.max(lastDemoRevision + 1, Date.now());
      apply({...state, ...data, revision});
      if (channel) channel.postMessage({type: 'config', data: {...state, revision}});
      return;
    }
    if (!db || !navigator.onLine) throw new Error('Нет связи с сервером. Изменения не опубликованы; повторите сохранение.');
    // Частичный merge: сохранение текстов не перезаписывает туры из другой вкладки и наоборот.
    await db.collection('site_config').doc('main').set(data, {merge: true});
  }
  function demoBookings() { try { return JSON.parse(localStorage.getItem('kuba_demo_bookings') || '[]'); } catch (_) { return []; } }
  function listenBookings(all, callback, onError) {
    assertAuth(); if (all) assertAdmin();
    if (demo) {
      const update = () => callback(demoBookings().filter(b => all || b.userId === currentUser?.uid));
      const event = e => { if (e.key === 'kuba_demo_bookings') update(); };
      addEventListener('storage', event); addEventListener('kuba-bookings', update); update();
      return () => { removeEventListener('storage', event); removeEventListener('kuba-bookings', update); };
    }
    if (!db) throw new Error('База недоступна');
    let query = db.collection('bookings');
    if (!all) query = query.where('userId', '==', currentUser.uid);
    return query.onSnapshot(snap => callback(snap.docs.map(doc => ({...doc.data(), id: doc.id}))), onError);
  }
  async function createBooking(tour, name, phone) {
    assertAuth();
    const booking = {id: 'b_' + crypto.randomUUID(), userId: currentUser.uid, userEmail: currentUser.email || '', userName: name, userPhone: phone,
      tourId: tour.id, tourTitle: tour.title, tourPrice: tour.price, status: 'pending', date: new Date().toISOString()};
    if (demo) { localStorage.setItem('kuba_demo_bookings',JSON.stringify([...demoBookings(), booking])); dispatchEvent(new Event('kuba-bookings')); return booking; }
    if (!db || !navigator.onLine) throw new Error('Нет связи с сервером. Заявка НЕ отправлена. Повторите после восстановления сети.');
    await db.collection('bookings').doc(booking.id).set(booking); return booking;
  }
  async function updateBooking(id, status) {
    assertAdmin(); if (!['confirmed', 'cancelled', 'pending'].includes(status)) throw new Error('Недопустимый статус');
    if (demo) {localStorage.setItem('kuba_demo_bookings',JSON.stringify(demoBookings().map(b => b.id === id ? {...b,status} : b)));dispatchEvent(new Event('kuba-bookings'));return;}
    if (!db || !navigator.onLine) throw new Error('Нет связи с сервером. Статус не изменён.');
    await db.collection('bookings').doc(id).update({status});
  }
  function image(value, fallback = 'images/hero.webp') {
    if (typeof value !== 'string' || !value.trim()) return fallback;
    const v=value.trim();
    if (/^images\/[a-zA-Z0-9_./-]+\.(webp|png|jpe?g)$/i.test(v) && !v.includes('..')) return v;
    try {const u = new URL(v); if (u.protocol === 'https:' && !u.username && !u.password) return u.href;} catch (_) {}
    return fallback;
  }
  function escape(value) {return String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  window.Kuba = {demo, admin, image, escape, login, register, logout, publish, listenBookings, createBooking, updateBooking,
    snapshot: () => clone(state), user: () => currentUser,
    subscribe(fn) {listeners.add(fn);fn(clone(state));return () => listeners.delete(fn);},
    onAuth(fn) {authListeners.add(fn);fn(currentUser);return () => authListeners.delete(fn);},
    onStatus(fn) {statusListeners.add(fn);fn(status);return () => statusListeners.delete(fn);},
    async verifyEmail() { assertAuth(); if(!demo) await currentUser.sendEmailVerification(); },
    async resetPassword(email) { if(!auth) throw new Error('Firebase недоступен'); await auth.sendPasswordResetEmail(email); }
  };
  document.addEventListener('DOMContentLoaded', () => {
    const badge = document.createElement('div'); badge.className = 'sync-badge'; badge.setAttribute('role','status');
    document.body.appendChild(badge); Kuba.onStatus(s => {badge.textContent=s.text;badge.dataset.type=s.type;});
    if (demo) {
      document.querySelectorAll('a[href="index.html"]').forEach(a=>a.href='index.html?demo=1');
      const hint=document.getElementById('adminAuthMessage'); if(hint) hint.textContent='Локальное демо. Введите любой email и тестовый пароль. Это НЕ настоящая авторизация.';
    }
    // Защита от битых пользовательских обложек, без бесконечного onerror.
    document.addEventListener('error', e => {if(e.target instanceof HTMLImageElement && !e.target.dataset.fallback){e.target.dataset.fallback='1';e.target.src='images/hero.webp';}}, true);
  });
})();
