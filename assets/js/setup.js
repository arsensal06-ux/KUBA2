'use strict';
document.addEventListener('DOMContentLoaded',()=>{
  const config=window.KUBA_CONFIG,$=id=>document.getElementById(id),project=encodeURIComponent(config.firebase.projectId);
  $('firebaseProject').textContent=config.firebase.projectId;
  $('adminEmail').textContent=config.adminEmail;
  $('openAuthSettings').href=`https://console.firebase.google.com/project/${project}/authentication/settings`;
  $('openFirestore').href=`https://console.firebase.google.com/project/${project}/firestore`;
  const local=['localhost','127.0.0.1','[::1]',''].includes(location.hostname);
  $('siteDomain').textContent=local?'Открой эту страницу на опубликованном сайте':location.hostname;
  $('copyDomain').disabled=local;
  Kuba.onStatus(status=>{
    $('connectionStatus').textContent=status.text;
    document.querySelector('.connection').dataset.type=status.type;
  });
  $('refreshConnection').addEventListener('click',()=>location.reload());
  $('copyDomain').addEventListener('click',async()=>{
    try{await navigator.clipboard.writeText(location.hostname);$('copyStatus').textContent='Домен скопирован. Вставь его в Authorized domains.';}
    catch(_){$('copyStatus').textContent='Скопируй домен вручную: '+location.hostname;}
  });
});
