'use strict';
const $ = id=>document.getElementById(id), esc=Kuba.escape;
let adminState=Kuba.snapshot(), stopBookings=null, publishing=false, contentDirty=false;
const regionNames={sochi:'Сочи',gelendzhik:'Геленджик',anapa:'Анапа',novorossiysk:'Новороссийск',polyana:'Красная Поляна',abrau:'Абрау-Дюрсо',lagonaki:'Лаго-Наки'};
function notice(text,type='error') {
  $('publishStatus').textContent=text;$('publishStatus').dataset.type=type;
  $('adminAuthMessage').textContent=text;
}
function switchTab(id) {document.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active',b.id==='tab_'+id));document.querySelectorAll('.admin-tab-content').forEach(c=>c.classList.toggle('active',c.id==='content_'+id));}
async function handleAdminLogin(event) {
  event.preventDefault();const button=event.target.querySelector('[type=submit]');button.disabled=true;
  try {const user=await Kuba.login($('adminEmail').value.trim(),$('adminPassword').value);$('adminPassword').value='';if(!Kuba.admin(user))notice('Нужен аккаунт администратора с подтверждённой почтой.');}
  catch(err){notice(({'auth/invalid-credential':'Неверный email или пароль.','auth/too-many-requests':'Слишком много попыток. Повторите позже.'})[err.code]||'Вход не выполнен. Проверьте аккаунт и подключение к Firebase.');}finally{button.disabled=false;}
}
async function sendAdminVerification(){try{await Kuba.verifyEmail();notice('Письмо отправлено. Подтвердите почту, затем выйдите и войдите заново.','info');}catch(err){notice('Сначала войдите с правильным паролем. Затем запросите подтверждение email.');}}
async function handleAdminLogout(){try{await Kuba.logout();}catch(err){notice('Не удалось выйти. Проверьте сеть.');}}
async function publish(patch) {
  if(publishing)return false;publishing=true;
  document.querySelectorAll('button[type=submit],.tour-actions button').forEach(b=>b.disabled=true);
  notice('Отправляем изменения на сервер…','loading');
  try {await Kuba.publish(patch);notice(Kuba.demo?'ДЕМО: сохранено только в этом браузере.':'Опубликовано. Открытые страницы сайта обновятся без перезагрузки.','success');return true;}
  catch(err){notice('Не опубликовано: '+(err.message||'ошибка базы. Повторите сохранение.'));return false;}
  finally{publishing=false;document.querySelectorAll('button[type=submit],.tour-actions button').forEach(b=>b.disabled=false);}
}
function renderToursList() {
  const container=$('toursListContainer');container.innerHTML='';
  if(!adminState.tours.length){container.textContent='Туров пока нет. Создайте первый маршрут.';return;}
  adminState.tours.forEach(t=>{
    const item=document.createElement('div');item.className='tour-list-item';
    item.innerHTML=`<img class="tour-list-thumb" src="${esc(Kuba.image(t.image,`images/${regionNames[t.regionId]?t.regionId:'hero'}.webp`))}" alt="${esc(t.title)}" loading="lazy"><div class="tour-list-copy"><strong>${esc(t.title)}</strong><br><span>${esc(regionNames[t.regionId]||t.regionId)} · ${esc(t.category)} · ${esc(t.price)}</span></div><div class="tour-actions"><button type="button" class="action-btn edit" aria-label="Редактировать тур"><i class="fas fa-pen" aria-hidden="true"></i></button><button type="button" class="action-btn delete" aria-label="Удалить тур"><i class="fas fa-trash" aria-hidden="true"></i></button></div>`;
    item.querySelector('.edit').onclick=()=>editTour(t.id);item.querySelector('.delete').onclick=()=>deleteTour(t.id);container.appendChild(item);
  });
}
function editTour(id) {
  const t=adminState.tours.find(t=>String(t.id)===String(id));if(!t)return;
  const map={tourTitle:'title',tourRegion:'regionId',tourCategory:'category',tourDuration:'duration',tourDifficulty:'difficulty',tourPrice:'price',tourDesc:'desc',tourLongDesc:'longDesc',tourImage:'image'};
  Object.entries(map).forEach(([field,key])=>$(field).value=t[key]||'');
  $('editTourId').value=t.id;$('tourInclusions').value=(t.inclusions||[]).join('\n');$('tourEquipment').value=(t.equipment||[]).join('\n');
  $('tourFormTitle').textContent='Редактировать: '+t.title;$('tourSubmitBtn').textContent='Сохранить и опубликовать';previewImage();window.scrollTo({top:0,behavior:'smooth'});
}
async function deleteTour(id){if(publishing||!confirm('Удалить тур с сайта? Это действие нельзя отменить.'))return;await publish({tours:adminState.tours.filter(t=>String(t.id)!==String(id))});}
function resetTourForm(){$('tourForm').reset();$('editTourId').value='';$('tourFormTitle').textContent='Добавить новый экспедиционный тур';$('tourSubmitBtn').textContent='Создать и опубликовать тур';$('tourImagePreview').hidden=true;}
function previewImage(){const input=$('tourImage').value.trim();$('tourImagePreview').hidden=!input;if(input){$('tourImagePreview').removeAttribute('data-fallback');$('tourImagePreview').src=Kuba.image(input);}}
async function handleTourSave(event) {
  event.preventDefault();if(publishing)return;
  const read=id=>$(id).value.trim(), lines=id=>read(id).split('\n').map(s=>s.trim()).filter(Boolean);
  const id=read('editTourId');
  const tour={id:id?Number(id):Date.now(),title:read('tourTitle'),regionId:read('tourRegion'),category:read('tourCategory'),duration:read('tourDuration'),difficulty:read('tourDifficulty'),price:read('tourPrice'),desc:read('tourDesc'),longDesc:read('tourLongDesc'),inclusions:lines('tourInclusions'),equipment:lines('tourEquipment'),image:read('tourImage')};
  if(tour.title.length<3||tour.desc.length<10||tour.longDesc.length<20||!tour.inclusions.length||!tour.equipment.length){notice('Заполните название, оба описания, включённые услуги и экипировку.');return;}
  if(tour.image&&Kuba.image(tour.image,'INVALID')==='INVALID'){notice('Обложка должна быть HTTPS-ссылкой либо путём к изображению в images/.');return;}
  if(!/\d/.test(tour.price)){notice('Укажите стоимость с цифрами.');return;}
  if(id&&!adminState.tours.some(t=>String(t.id)===id)){notice('Этот тур удалён в другой вкладке. Создайте новый или обновите список.');return;}
  const tours=id?adminState.tours.map(t=>String(t.id)===id?{...t,...tour}:t):[...adminState.tours,tour];
  if(await publish({tours}))resetTourForm();
}
function fillContentForm(){Object.entries(adminState.settings).forEach(([key,value])=>{if($('cfg_'+key))$('cfg_'+key).value=value;});}
async function handleContentSave(event) {
  event.preventDefault();if(publishing)return;
  const settings={...adminState.settings};document.querySelectorAll('[id^=cfg_]').forEach(input=>settings[input.id.slice(4)]=input.value.trim());
  if(settings.heroTitle.length<3||settings.heroSubtitle.length<3||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.footerEmail)){notice('Проверьте заголовок, подзаголовок и email контактов.');return;}
  if(await publish({settings}))contentDirty=false;
}
function renderTableRows(bookings) {
  const tbody=$('bookingsTableBody');tbody.replaceChildren();
  if(!bookings.length){tbody.innerHTML='<tr><td colspan="5">Новых заявок пока нет.</td></tr>';return;}
  const statuses={pending:'Ожидает',confirmed:'Подтверждено',cancelled:'Отменено'};
  bookings.sort((a,b)=>String(b.date).localeCompare(String(a.date))).forEach(b=>{
    const row=document.createElement('tr'),d=new Date(b.date),date=Number.isNaN(d.getTime())?b.date:d.toLocaleString('ru-RU'),status=statuses[b.status]?b.status:'pending';
    row.innerHTML=`<td>${esc(date)}</td><td><strong>${esc(b.userName)}</strong><br>${esc(b.userPhone)}</td><td><strong>${esc(b.tourTitle)}</strong><br>${esc(b.tourPrice)}</td><td><span class="status-badge status-${status}">${statuses[status]}</span></td><td><button class="action-btn" type="button" aria-label="Подтвердить заявку">✓</button><button class="action-btn" type="button" aria-label="Отменить заявку">×</button></td>`;
    const buttons=row.querySelectorAll('button');buttons[0].onclick=()=>changeBookingStatus(b.id,'confirmed',buttons);buttons[1].onclick=()=>changeBookingStatus(b.id,'cancelled',buttons);tbody.appendChild(row);
  });
}
async function changeBookingStatus(id,status,buttons=[]){buttons.forEach(b=>b.disabled=true);try{await Kuba.updateBooking(id,status);notice('Статус заявки сохранён.','success');}catch(err){notice('Статус не изменён: '+err.message);}finally{buttons.forEach(b=>b.disabled=false);}}
document.addEventListener('DOMContentLoaded',()=>{
  // Связать исходные labels с полями для клавиатуры и экранных дикторов.
  document.querySelectorAll('.form-group').forEach(group=>{const label=group.querySelector('label'),input=group.querySelector('input,textarea,select');if(label&&input)label.htmlFor=input.id;});
  Kuba.subscribe(data=>{adminState=data;renderToursList();if(!contentDirty)fillContentForm();});
  Kuba.onAuth(user=>{
    if(stopBookings){stopBookings();stopBookings=null;}
    $('authOverlay').style.display=Kuba.admin(user)?'none':'flex';
    if(Kuba.admin(user)){
      try{stopBookings=Kuba.listenBookings(true,renderTableRows,()=>{$('bookingsTableBody').innerHTML='<tr><td colspan="5">Заявки недоступны. Проверьте правила Firestore.</td></tr>';});}catch(err){notice(err.message);}
    }else{$('bookingsTableBody').replaceChildren();}
  });
  Kuba.onStatus(status=>{if(!publishing) { $('publishStatus').textContent=status.text;$('publishStatus').dataset.type=status.type; }});
  document.querySelectorAll('[id^=cfg_]').forEach(input=>input.addEventListener('input',()=>contentDirty=true));
  $('tourImage').addEventListener('input',previewImage);
  addEventListener('beforeunload',event=>{if(contentDirty||publishing){event.preventDefault();event.returnValue='';}});
});
