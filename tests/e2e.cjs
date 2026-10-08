/* Запуск: npm install && npm test. Firebase подменяется только В ЭТОМ ТЕСТЕ.
   Проверяет приложение и обработку snapshot, а не реальные Firestore rules. */
const {chromium}=require('playwright');
const fs=require('fs'),vm=require('vm'),path=require('path'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..'),base=process.env.TEST_BASE_URL||'http://127.0.0.1:8765';
const seed=vm.runInNewContext(fs.readFileSync(path.join(root,'assets/js/defaults.js'),'utf8')+';window.KUBA_DEFAULTS',{window:{}});
let backend=JSON.parse(JSON.stringify(seed)),bookings=[],pages=[],failWrites=false;
const mock = () => {
  let user=null,authCallback,bookingSubs=[];
  const docCallbacks=[];
  const snap=()=>({exists:true,data:()=>window.__mockState,metadata:{fromCache:false}});
  const bookingSnap=filter=>({docs:window.__mockBookings.filter(b=>!filter||b.userId===filter).map(b=>({id:b.id,data:()=>b}))});
  window.__mockPush=(s,b)=>{window.__mockState=s;window.__mockBookings=b;docCallbacks.forEach(fn=>fn(snap()));bookingSubs.forEach(sub=>sub.fn(bookingSnap(sub.filter)));};
  function bookingQuery(filter) {return {where:(field,op,value)=>bookingQuery(value),onSnapshot:(fn)=>{const sub={fn,filter};bookingSubs.push(sub);window.__testRead().then(({state,bookings})=>{window.__mockState=state;window.__mockBookings=bookings;fn(bookingSnap(filter));});return ()=>bookingSubs=bookingSubs.filter(s=>s!==sub);},doc:id=>({set:b=>window.__testBooking('create',id,b),update:patch=>window.__testBooking('update',id,patch)})};}
  const db={collection:name=> name==='bookings'?bookingQuery():({doc:()=>({onSnapshot:(opts,fn,err)=>{docCallbacks.push(fn);window.__testRead().then(({state,bookings})=>{window.__mockState=state;window.__mockBookings=bookings;fn(snap());});return ()=>{};},set:patch=>window.__testWrite(patch)})})};
  const auth={setPersistence:()=>Promise.resolve(),onAuthStateChanged:fn=>{authCallback=fn;fn(user);},signInWithEmailAndPassword:async(email,password)=>{if(password!=='test-password'){const err=new Error('wrong');err.code='auth/invalid-credential';throw err;}user={uid:email==='admin@example.test'?'admin':'customer',email:email==='admin@example.test'?'arsensal06@gmail.com':email,emailVerified:true,displayName:'Тест'};authCallback(user);return {user};},signOut:async()=>{user=null;authCallback(user);}};
  const getAuth=()=>auth;getAuth.Auth={Persistence:{LOCAL:'local'}};
  window.firebase={apps:[],initializeApp(){this.apps.push({});},auth:getAuth,firestore:()=>db};
};
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||require('child_process').execSync('command -v chromium').toString().trim(),headless:true,args:['--no-sandbox']});
 const errors=[];let assertions=0;
 const check=(value,msg)=>{assert(value,msg);assertions++;};
 async function push(){for(const p of pages)if(!p.isClosed())await p.evaluate(({state,bookings})=>window.__mockPush?.(state,bookings),{state:backend,bookings});}
 async function context(){const c=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});await c.route('**/assets/js/vendor/firebase-*-compat.js',r=>r.fulfill({body:'/* test mock */',contentType:'application/javascript'}));await c.addInitScript(mock);await c.exposeFunction('__testRead',()=>({state:backend,bookings}));await c.exposeFunction('__testWrite',async patch=>{if(failWrites)throw new Error('TEST_PERMISSION_DENIED');backend={...backend,...patch};await push();});await c.exposeFunction('__testBooking',async(mode,id,data)=>{if(mode==='create')bookings.push(data);else bookings=bookings.map(b=>b.id===id?{...b,...data}:b);await push();});return c;}
 const ca=await context(),cv=await context(); // Независимые browser contexts, не общий localStorage.
 const admin=await ca.newPage(),visitor=await cv.newPage();pages.push(admin,visitor);
 pages.forEach(p=>p.on('pageerror',e=>errors.push(e.message)));
 await visitor.addInitScript(()=>localStorage.setItem('kuba_cache_v2',JSON.stringify({tours:[],settings:{heroTitle:'Устаревший кэш'}})));
 await Promise.all([admin.goto(base+'/admin.html'),visitor.goto(base+'/index.html')]);
 await visitor.waitForFunction(()=>document.getElementById('heroTitle').textContent==='Откройте Дикую Природу');
 check(await visitor.locator('#tours-sochi .tour-card').count()===4,'Сервер важнее устаревшего localStorage');
 await admin.locator('#adminEmail').fill('admin@example.test');await admin.locator('#adminPassword').fill('wrong-password');await admin.locator('.auth-card [type=submit]').click();await admin.waitForFunction(()=>document.getElementById('adminAuthMessage').textContent.includes('Неверный'));
 check(await admin.locator('#authOverlay').isVisible(),'Неверный пароль не допускает в админку');
 await admin.locator('#adminPassword').fill('test-password');await admin.locator('.auth-card [type=submit]').click();await admin.waitForFunction(()=>document.getElementById('authOverlay').style.display==='none');
 await admin.locator('#tab_content').click();await admin.locator('#cfg_heroTitle').fill('Новый заголовок в реальном времени');await admin.locator('#cfg_footerPhone').fill('+7 (900) 123-45-67');await admin.locator('#content_content button[type=submit]').click();
 await visitor.waitForFunction(()=>document.getElementById('heroTitle').textContent==='Новый заголовок в реальном времени');
 check((await visitor.locator('#footerContacts').textContent()).includes('+7 (900) 123-45-67'),'Контакты синхронизируются');
 await admin.locator('#tab_tours').click();await admin.locator('.tour-list-item .edit').first().click();await admin.locator('#tourTitle').fill('Псахо: обновлено');await admin.locator('#tourPrice').fill('10 000 ₽');await admin.locator('#tourImage').fill('javascript:alert(1)');await admin.locator('#tourSubmitBtn').click();
 check((await admin.locator('#publishStatus').textContent()).includes('HTTPS'),'Опасная схема изображения отклоняется');
 await admin.locator('#tourImage').fill('images/sochi.webp');await admin.locator('#tourSubmitBtn').click();await visitor.waitForFunction(()=>document.getElementById('tours-sochi').textContent.includes('Псахо: обновлено'));
 check((await visitor.locator('#tours-sochi').textContent()).includes('10 000 ₽'),'Цена обновляется без reload');
 await visitor.goto(base+'/index.html#sochi');await visitor.locator('#sochi .tour-card [data-detail]').first().click();await visitor.waitForFunction(()=>document.querySelector('#tour-details.active'));
 check((await visitor.locator('#detailContent').textContent()).includes('Включено в стоимость'),'Полный маршрут отображается');
 await visitor.evaluate(()=>location.hash='');await visitor.waitForTimeout(700);await visitor.locator('#authBtn').click();await visitor.locator('#loginEmail').fill('customer@example.test');await visitor.locator('#loginPassword').fill('test-password');await visitor.locator('#loginForm [type=submit]').click();await visitor.waitForFunction(()=>document.getElementById('cabinetBtn').style.display==='inline-block');
 await visitor.evaluate(()=>location.hash='sochi');await visitor.waitForTimeout(700);await visitor.locator('#sochi .tour-card [data-book]').first().click();await visitor.waitForFunction(()=>document.querySelector('#booking.active'));
 await visitor.locator('#bookingName').fill('Иван');await visitor.locator('#bookingPhone').fill('+7 (999) 123-45-67');await visitor.locator('#bookingForm [type=submit]').click();await visitor.waitForFunction(()=>document.getElementById('bookingMessage').textContent.includes('Заявка отправлена'));
 await admin.locator('#tab_bookings').click();await admin.waitForFunction(()=>document.getElementById('bookingsTableBody').textContent.includes('Иван'));
 check(bookings.length===1,'Заявка появляется в админке');
 await admin.locator('#bookingsTableBody button[aria-label="Подтвердить заявку"]').click();await visitor.evaluate(()=>location.hash='cabinet');await visitor.waitForFunction(()=>document.getElementById('cabinetBookings').textContent.includes('Подтверждено'));
 check(bookings[0].status==='confirmed','Статус синхронизируется с кабинетом');
 failWrites=true;await admin.locator('#tab_content').click();await admin.locator('#cfg_heroTitle').fill('Не должно публиковаться');await admin.locator('#content_content button[type=submit]').click();await admin.waitForFunction(()=>document.getElementById('publishStatus').textContent.includes('Не опубликовано'));
 check(await visitor.locator('#heroTitle').textContent()==='Новый заголовок в реальном времени','Ошибка записи не публикует локальный черновик');failWrites=false;
 // Добавление, XSS-экранирование, удаление, сохранение фильтра.
 await admin.locator('#tab_tours').click();const values={tourTitle:'Новый <img src=x onerror=alert(1)> маршрут',tourDuration:'5 ч',tourPrice:'6 000 ₽',tourDesc:'Описание нового тестового маршрута.',tourLongDesc:'Полное описание нового тестового маршрута с остановками.',tourInclusions:'Гид\nТрансфер',tourEquipment:'Кроссовки'};
 for(const [id,value]of Object.entries(values))await admin.locator('#'+id).fill(value);
 await admin.locator('#tourSubmitBtn').click();await visitor.waitForFunction(()=>document.getElementById('tours-sochi').textContent.includes('Новый <img'));
 check(await visitor.locator('#tours-sochi img[onerror]').count()===0,'Тексты экранируются от XSS');
 const newTour=backend.tours.at(-1);visitor.on('dialog',d=>d.dismiss());admin.once('dialog',d=>d.accept());await admin.locator('.tour-list-item .delete').last().click();await visitor.waitForFunction(()=>!document.getElementById('tours-sochi').textContent.includes('Новый <img'));
 check(!backend.tours.some(t=>t.id===newTour.id),'Удаление синхронизируется');
 await visitor.evaluate(()=>filterTours('sochi','sup'));await admin.locator('.tour-list-item .edit').first().click();await admin.locator('#tourPrice').fill('10 500 ₽');await admin.locator('#tourSubmitBtn').click();await visitor.waitForFunction(()=>document.querySelectorAll('#tours-sochi .tour-card').length===1);
 check((await visitor.locator('#tours-sochi').textContent()).includes('Рассвет'),'Обновление не сбрасывает фильтр');
 // Скриншоты всех разделов и адаптивности.
 const qa=process.env.QA_DIR||path.join(root,'..','qa');fs.mkdirSync(qa,{recursive:true});
 await visitor.evaluate(()=>location.hash='');await visitor.waitForTimeout(800);await visitor.screenshot({path:path.join(qa,'desktop-home.png'),fullPage:true});
 for(const r of ['sochi','gelendzhik','anapa','novorossiysk','polyana','abrau','lagonaki','about','auth','cabinet']){
  await visitor.evaluate(r=>location.hash=r,r);await visitor.waitForTimeout(750);await visitor.screenshot({path:path.join(qa,'route-'+r+'.png'),fullPage:true});
  const overflow=await visitor.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);check(!overflow,'Нет горизонтального overflow: '+r);
 }
 for(const tab of ['bookings','tours','content']){await admin.locator('#tab_'+tab).click();await admin.screenshot({path:path.join(qa,'admin-'+tab+'.png'),fullPage:true});}
 await visitor.setViewportSize({width:390,height:844});await visitor.evaluate(()=>location.hash='');await visitor.waitForTimeout(800);await visitor.screenshot({path:path.join(qa,'mobile-home.png'),fullPage:true});
 await visitor.evaluate(()=>location.hash='sochi');await visitor.waitForTimeout(800);await visitor.screenshot({path:path.join(qa,'mobile-sochi.png'),fullPage:true});check(await visitor.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Мобильная витрина без overflow');
 await admin.setViewportSize({width:390,height:844});await admin.locator('#tab_tours').click();await admin.screenshot({path:path.join(qa,'mobile-admin.png'),fullPage:true});check(await admin.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Мобильная админка без overflow');
 check(errors.length===0,'Нет JS ошибок: '+errors.join(';'));
 console.log(JSON.stringify({passed:assertions,pageErrors:errors,mode:'MOCK FIREBASE — real project not changed',screenshots:qa},null,2));
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
