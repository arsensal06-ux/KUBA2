/* Настоящие store/site/admin в локальном demo, без подмены Firebase-кода. */
const {chromium}=require('playwright'),assert=require('assert/strict'),fs=require('fs'),path=require('path');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||require('child_process').execSync('command -v chromium').toString().trim(),headless:true,args:['--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1440,height:900},reducedMotion:'reduce'}),base=process.env.TEST_BASE_URL||'http://127.0.0.1:8765',qa=process.env.QA_DIR||path.resolve(__dirname,'../../qa');fs.mkdirSync(qa,{recursive:true});
 // Нет доступа к внешним сервисам: demo обязан работать локально.
 await context.route(/^https:\/\//,r=>r.abort());
 const site=await context.newPage(),admin=await context.newPage();const errors=[];site.on('pageerror',e=>errors.push(e.message));admin.on('pageerror',e=>errors.push(e.message));
 await Promise.all([site.goto(base+'/index.html?demo=1'),admin.goto(base+'/admin.html?demo=1')]);
 await site.waitForFunction(()=>!document.body.classList.contains('is-preload'));await site.waitForTimeout(150);await site.screenshot({path:path.join(qa,'preview-original-home.png'),fullPage:true});await admin.screenshot({path:path.join(qa,'admin-login.png'),fullPage:true});
 assert(await site.evaluate(()=>Kuba.demo),'Demo enabled on loopback');
 await admin.locator('#adminEmail').fill('demo@example.test');await admin.locator('#adminPassword').fill('demo-only');await admin.locator('.auth-card [type=submit]').click();await admin.waitForFunction(()=>document.getElementById('authOverlay').style.display==='none');
 await admin.locator('#tab_content').click();await admin.locator('#cfg_heroTitle').fill('Демо-синхронизация работает');await admin.locator('#content_content button[type=submit]').click();await site.waitForFunction(()=>document.getElementById('heroTitle').textContent==='Демо-синхронизация работает');
 assert((await admin.locator('#publishStatus').textContent()).includes('ДЕМО'),'Demo not confused with cloud publishing');
 await site.evaluate(()=>location.hash='sochi');await site.locator('#sochi [data-detail]').first().click();await site.waitForTimeout(150);await site.screenshot({path:path.join(qa,'details.png'),fullPage:true});
 await site.evaluate(()=>location.hash='auth');await site.evaluate(()=>switchToRegister());await site.waitForTimeout(150);await site.screenshot({path:path.join(qa,'register.png'),fullPage:true});
 await site.evaluate(()=>switchToLogin());await site.locator('#loginEmail').fill('customer@example.test');await site.locator('#loginPassword').fill('demo-only');await site.locator('#loginForm [type=submit]').click();await site.waitForFunction(()=>document.getElementById('cabinetBtn').style.display==='inline-block');
 await site.evaluate(()=>location.hash='sochi');await site.locator('#sochi [data-book]').first().click();await site.waitForTimeout(150);await site.screenshot({path:path.join(qa,'booking.png'),fullPage:true});
 await site.locator('#bookingName').fill('Демо');await site.locator('#bookingPhone').fill('123456');await site.locator('#bookingForm [type=submit]').click();assert((await site.locator('#bookingMessage').textContent()).includes('Проверьте'),'Invalid phone rejected');
 await site.waitForTimeout(150);await site.screenshot({path:path.join(qa,'booking-validation.png'),fullPage:true});
 await site.locator('#bookingPhone').fill('+7 (999) 123-45-67');await site.locator('#bookingForm [type=submit]').click();await site.waitForFunction(()=>document.getElementById('bookingMessage').textContent.includes('Демо-заявка'));
 await admin.locator('#tab_bookings').click();await admin.waitForFunction(()=>document.getElementById('bookingsTableBody').textContent.includes('Демо'));assert(await admin.locator('#bookingsTableBody tr').count()===1,'Storage booking event crosses tabs');
 await admin.locator('#bookingsTableBody button[aria-label="Отменить заявку"]').click();await site.evaluate(()=>location.hash='cabinet');await site.waitForFunction(()=>document.getElementById('cabinetBookings').textContent.includes('Отменено'));assert(await site.locator('.booking-status').textContent()==='Отменено','Status storage event');
 await admin.evaluate(()=>Kuba.publish({tours:[]}));await site.waitForFunction(()=>document.querySelectorAll('#tours-sochi .tour-card').length===0);assert((await site.locator('#tours-sochi').textContent()).includes('пока нет'),'Empty catalog is authoritative');assert(await site.locator('#bookingForm [type=submit]').isDisabled(),'Removed tour cannot receive a new booking');
 await site.setViewportSize({width:390,height:844});await site.evaluate(()=>location.hash='auth');await site.evaluate(()=>switchToRegister());await site.waitForTimeout(150);await site.screenshot({path:path.join(qa,'mobile-register.png'),fullPage:true});
 await site.evaluate(()=>location.hash='booking');await site.waitForTimeout(150);await site.screenshot({path:path.join(qa,'mobile-booking.png'),fullPage:true});
 assert(await site.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Mobile forms no overflow');
 assert(errors.length===0,'No page errors: '+errors.join(';'));
 console.log(JSON.stringify({demoChecks:9,pageErrors:errors,externalNetwork:'blocked'},null,2));await browser.close();
})().catch(e=>{console.error(e);process.exit(1);});
