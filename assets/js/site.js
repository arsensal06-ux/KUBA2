'use strict';
const regions = ['sochi','gelendzhik','anapa','novorossiysk','polyana','abrau','lagonaki'];
const categories = {jeep: 'Джип-тур', quad: 'Квадроциклы', sup: 'SUP-прогулка', hiking: 'Хайкинг'};
let siteState = Kuba.snapshot(), currentUser = null, selectedTourId = null, stopBookings = null, bookingSending = false;
const filters = Object.fromEntries(regions.map(r=>[r,'all']));
const el = id => document.getElementById(id), esc = Kuba.escape;
function message(id, text, type='error') {const box=el(id);box.textContent=text;box.className='form-message '+type;box.style.display='block';}
function tourImage(tour) {return Kuba.image(tour.image,`images/${regions.includes(tour.regionId)?tour.regionId:'hero'}.webp`);}
function renderTours(region) {
  const list=siteState.tours.filter(t=>t.regionId===region && (filters[region]==='all' || t.category===filters[region]));
  el('tours-'+region).innerHTML = list.length ? list.map(t=>`<div class="tour-card"><img class="tour-cover" src="${esc(tourImage(t))}" alt="Обложка тура ${esc(t.title)}" loading="lazy" width="740" height="460"><div class="tour-card-body"><p class="eyebrow">${esc(categories[t.category] || 'Путешествие')}</p><h3>${esc(t.title)}</h3><div class="tour-meta"><span>⏱ ${esc(t.duration)}</span><span>${esc(t.difficulty)} сложность</span></div><p>${esc(t.desc)}</p><div class="tour-bottom"><div class="tour-price">${esc(t.price)}</div><div class="tour-actions"><button data-detail="${esc(t.id)}">Маршрут</button><button class="primary" data-book="${esc(t.id)}">Оставить заявку</button></div></div></div></div>`).join('') : '<div class="empty-state"><h3>Скоро новые маршруты</h3><p>В этом разделе пока нет опубликованных туров. Свяжитесь с нами, чтобы подобрать путешествие.</p></div>';
}
function filterTours(region, category) {
  filters[region]=category;
  el(region).querySelectorAll('.filter-btn').forEach(button=>button.classList.toggle('active',button.getAttribute('onclick')?.includes("'"+category+"'")));
  renderTours(region);
}
function applySettings(settings) {
  el('heroTitle').textContent=settings.heroTitle;
  el('heroSubtitle').textContent=settings.heroSubtitle;
  el('aboutStats').innerHTML=[1,2,3,4].map(i=>`<div><strong>${esc(settings['stat'+i+'Num'])}</strong><span>${esc(settings['stat'+i+'Label'])}</span></div>`).join('');
  const phone=String(settings.footerPhone||'').replace(/[^+\d]/g,''), email=String(settings.footerEmail||'');
  el('footerContacts').innerHTML=`<p>${esc(settings.footerDesc)}</p><div class="contact-links"><a href="tel:${esc(phone)}">${esc(settings.footerPhone)}</a>${/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)?`<a href="mailto:${esc(email)}">${esc(email)}</a>`:esc(email)}<span>${esc(settings.footerAddress)}</span></div>`;
}
function findTour(id) {return siteState.tours.find(t=>String(t.id)===String(id));}
function showTour(id) {
  selectedTourId=String(id);renderDetails();location.hash='tour-details';
}
function renderDetails() {
  const t=findTour(selectedTourId);
  if(!t) {el('detailTitle').textContent='Маршрут недоступен';el('detailContent').textContent='Этот тур снят с публикации. Выберите другой маршрут.';return;}
  el('detailTitle').textContent=t.title;
  const list=items=>Array.isArray(items)&&items.length?'<ul>'+items.map(i=>`<li>${esc(i)}</li>`).join('')+'</ul>':'<p>Уточните у менеджера при согласовании маршрута.</p>';
  el('detailContent').innerHTML=`<span class="image main"><img src="${esc(tourImage(t))}" alt="${esc(t.title)}" width="740" height="460"></span><p class="tour-meta">${esc(t.duration)} · ${esc(t.difficulty)} · ${esc(t.price)}</p><p class="long-description">${esc(t.longDesc||t.desc)}</p><h3>Включено в стоимость</h3>${list(t.inclusions)}<h3>Что взять с собой</h3>${list(t.equipment)}<button class="primary" data-book="${esc(t.id)}">Оставить заявку</button><p class="image-note">Изображение передаёт атмосферу, а не точный вид маршрута.</p>`;
}
function bookTour(id) {
  if(!currentUser) {message('authMessage','Войдите или зарегистрируйтесь, чтобы отправить заявку.','info');openAuthModal();return;}
  const t=findTour(id);if(!t) return;
  selectedTourId=String(id);el('bookingTourTitle').textContent=t.title+' · '+t.price;el('bookingName').value=currentUser.displayName||'';
  el('bookingMessage').style.display='none';el('bookingForm').querySelector('[type=submit]').disabled=bookingSending;location.hash='booking';
}
function openAuthModal() {location.hash='auth';}
function switchToRegister() {el('loginForm').style.display='none';el('registerForm').style.display='block';el('authTitle').textContent='Регистрация';}
function switchToLogin() {el('loginForm').style.display='block';el('registerForm').style.display='none';el('authTitle').textContent='Вход в систему';}
async function handleEmailLogin(event) {
  event.preventDefault();const button=event.target.querySelector('[type=submit]');button.disabled=true;
  try {await Kuba.login(el('loginEmail').value.trim(),el('loginPassword').value);el('loginPassword').value='';location.hash='';}
  catch(err) {message('authMessage',authError(err));}finally {button.disabled=false;}
}
function authError(err) {
  return ({'auth/invalid-credential':'Неверный email или пароль.','auth/invalid-login-credentials':'Неверный email или пароль.','auth/email-already-in-use':'Email уже зарегистрирован. Войдите в аккаунт.','auth/weak-password':'Используйте пароль не короче 6 символов.','auth/too-many-requests':'Слишком много попыток. Попробуйте позже.','auth/network-request-failed':'Не удалось подключиться. Проверьте сеть.'})[err.code]||'Не удалось выполнить действие. Проверьте подключение и настройки Firebase.';
}
async function handleEmailRegister(event) {
  event.preventDefault();const button=event.target.querySelector('[type=submit]');button.disabled=true;
  try {const name=el('regName').value.trim();if(!name||name.length>50) {message('authMessage','Имя должно содержать от 1 до 50 символов.');return;}await Kuba.register(name,el('regEmail').value.trim(),el('regPassword').value);el('regPassword').value='';location.hash='';}
  catch(err) {message('authMessage',authError(err));}finally{button.disabled=false;}
}
async function resetPassword() {
  const email=el('loginEmail').value.trim();if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){message('authMessage','Введите email в поле входа.');return;}
  try {await Kuba.resetPassword(email);message('authMessage','Если аккаунт существует, на почту придёт ссылка для сброса пароля.','success');}catch(err){message('authMessage',authError(err));}
}
async function handleLogout() {try {await Kuba.logout();location.hash='';}catch(err){message('authMessage',authError(err));openAuthModal();}}
function openCabinetModal() {if(!currentUser)return openAuthModal();location.hash='cabinet';}
function renderUserBookings(bookings) {
  const status={pending:'Ожидает согласования',confirmed:'Подтверждено',cancelled:'Отменено'};
  el('cabinetBookings').innerHTML=bookings.length?bookings.sort((a,b)=>String(b.date).localeCompare(String(a.date))).map(b=>`<div class="booking-card"><h3>${esc(b.tourTitle)}</h3><p>${esc(b.tourPrice)} · ${esc(formatDate(b.date))}</p><span class="booking-status">${esc(status[b.status]||'Ожидает')}</span><p>${esc(b.userName)} · ${esc(b.userPhone)}</p></div>`).join(''):'<p>У вас пока нет заявок. Выберите маршрут и начните путешествие.</p>';
}
function formatDate(value) {const d=new Date(value);return Number.isNaN(d.getTime())?String(value||''):d.toLocaleString('ru-RU');}
document.addEventListener('DOMContentLoaded',()=>{
  Kuba.subscribe(data=>{siteState=data;applySettings(data.settings);regions.forEach(renderTours);if(selectedTourId){renderDetails();const t=findTour(selectedTourId);el('bookingTourTitle').textContent=t?t.title+' · '+t.price:'Тур больше недоступен. Выберите другой маршрут.';el('bookingForm').querySelector('[type=submit]').disabled=bookingSending||!t;}});
  Kuba.onAuth(user=>{
    if(stopBookings) {stopBookings();stopBookings=null;}
    currentUser=user;el('authBtn').style.display=user?'none':'inline-block';el('cabinetBtn').style.display=user?'inline-block':'none';el('logoutBtn').style.display=user?'inline-block':'none';el('adminBtn').style.display=Kuba.admin(user)?'inline-block':'none';el('userInfo').style.display=user?'inline-block':'none';el('userInfo').textContent=user?.displayName||user?.email||'';
    if(user) {
      el('cabinetUserInfo').textContent=(user.displayName||'')+' · '+user.email;
      try {stopBookings=Kuba.listenBookings(false,renderUserBookings,()=>el('cabinetBookings').textContent='Не удалось загрузить заявки. Проверьте соединение.');}catch(_){el('cabinetBookings').textContent='База заявок недоступна.';}
    }else{el('cabinetBookings').replaceChildren();el('cabinetUserInfo').textContent='';}
    el('adminBtn').onclick=()=>location.href='admin.html'+(Kuba.demo?'?demo=1':'');
  });
  document.addEventListener('click',event=>{const button=event.target.closest('[data-detail], [data-book]');if(!button)return;if(button.hasAttribute('data-detail'))showTour(button.dataset.detail);else bookTour(button.dataset.book);}, true);
  el('bookingForm').addEventListener('submit',async event=>{
    event.preventDefault();if(bookingSending)return;const t=findTour(selectedTourId), name=el('bookingName').value.trim(),phone=el('bookingPhone').value.trim(),digits=phone.replace(/\D/g,'');
    if(!t){message('bookingMessage','Тур больше недоступен. Выберите другой.');return;}
    if(!name||name.length>50||digits.length<10||digits.length>15||!/^[+\d\s()\-.]+$/.test(phone)){message('bookingMessage','Проверьте имя и номер телефона (10–15 цифр).');return;}
    const button=event.target.querySelector('[type=submit]');button.disabled=true;bookingSending=true;
    try {await Kuba.createBooking(t,name,phone);message('bookingMessage',Kuba.demo?'Демо-заявка сохранена только в этом браузере.':'Заявка отправлена. Менеджер свяжется с вами для согласования.','success');event.target.reset();}
    catch(err){message('bookingMessage',err.message||'Заявка не отправлена. Повторите позже.');}finally{bookingSending=false;button.disabled=!findTour(selectedTourId);}
  });
  document.querySelectorAll('input,select,textarea').forEach(input=>{if(input.type==='password')input.autocomplete=input.id.startsWith('reg')?'new-password':'current-password';});
});
