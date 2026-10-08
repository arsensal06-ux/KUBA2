/* Проверка для GitHub Actions. Никаких npm install, Python или сборки. */
const fs=require('fs'),path=require('path'),vm=require('vm'),assert=require('assert/strict');
const root=path.resolve(__dirname,'..');let checks=0;
function check(value,text){assert(value,text);checks++;}
for(const name of ['index.html','admin.html','setup.html','.nojekyll','.github/workflows/deploy.yml','firestore.rules'])check(fs.existsSync(path.join(root,name)),`Нет обязательного файла: ${name}`);
for(const name of ['index.html','admin.html','setup.html']){
 const html=fs.readFileSync(path.join(root,name),'utf8');
 for(const match of html.matchAll(/(?:src|href)="([^"<>]+)"/g)){
  const url=match[1];if(/^(https?:|data:|#|mailto:|tel:)/.test(url))continue;
  const local=url.split(/[?#]/)[0];if(!local)continue;
  check(!local.startsWith('/'),`Абсолютный путь не подходит для репозитория GitHub Pages: ${url}`);
  check(fs.existsSync(path.join(root,local)),`${name}: отсутствует ${url}`);
 }
}
for(const name of ['config.js','defaults.js','store.js','site.js','admin.js','main.js','setup.js']){
 const source=fs.readFileSync(path.join(root,'assets/js',name),'utf8');new vm.Script(source,{filename:name});checks++;
}
const defaults=vm.runInNewContext(fs.readFileSync(path.join(root,'assets/js/defaults.js'),'utf8')+';window.KUBA_DEFAULTS',{window:{}});
for(const tour of defaults.tours)if(tour.image&&!tour.image.startsWith('https://'))check(fs.existsSync(path.join(root,tour.image)),`Нет обложки: ${tour.image}`);
check(!fs.existsSync(path.join(root,'CNAME')),'Не оставляйте чужой CNAME в новом репозитории');
console.log(`OK: ${checks} file/syntax checks. Website is ready for the GitHub Pages artifact.`);
