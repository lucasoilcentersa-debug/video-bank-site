'use strict';
// File membership comes exclusively from the most recent complete Drive listing.
function reconcile(seed, files) {
  const products = new Map(seed.products.map(p => [p.id, {...p}]));
  const known = new Map();
  for (const m of seed.media) {
    if (!known.has(m.id)) known.set(m.id, []);
    known.get(m.id).push(m.product);
  }
  const media = [];
  const labels = { 'بوستات':'post', 'البوستات':'post', 'فيديوهات':'video', 'الفيديوهات':'video', 'معلومات المنتج':'key', 'مفاتيح المنتج':'key' };
  for (const f of files) {
    const [model, folderBrand, ...folders] = f.path;
    if (!/^نموذج 202[56]$/.test(model)) continue;
    const year = model.slice(-4);
    const brand = folderBrand || 'مواد أخرى';
    const labeled = folders.filter(n => labels[n]).at(-1);
    const filename = f.title.replace(/\.[^.]+$/, '');
    const type = labels[labeled] || (/\.(mp4|m4v|mov|avi|mkv|webm|wmv|mpeg|3gp)$/i.test(f.title) ? 'video' :
      /\.(jpe?g|png|gif|webp|heic|avif)$/i.test(f.title) ? 'post':'key');
    const last = folders.at(-1);
    const folderProduct = last && !labels[last] ? last : '';
    const findName = name => [...products.values()].find(p => p.brand === brand && normalize(p.name) === normalize(name));
    const exact = findName(folderProduct || filename);
    let ids = exact ? [exact.id] : (known.get(f.id) || []).filter(id => products.get(id)?.brand === brand);
    if (!ids.length) {
      const name = folderProduct || filename || f.title;
      const id = 'drive/'+brand+'/'+name;
      if (!products.has(id)) products.set(id,{id,name,brand,category:'',english:'',years:[],source:'',key:''});
      ids = [id];
    }
    for (const product of ids) media.push({id:f.id,title:f.title,year,type,product});
  }
  return {...seed,products:[...products.values()],media};
}
let refreshing = false;
let loadedCatalog = false;
let lastPayload = '';
async function refreshCatalog() {
  if (refreshing || document.hidden) return;
  refreshing = true;
  try {
    const url = 'https://raw.githubusercontent.com/lucasoilcentersa-debug/video-bank-site/main/catalog.json?t='+Math.floor(Date.now()/30000);
    const r = await fetch(url,{cache:'no-store'});
    if (!r.ok) throw Error(String(r.status));
    const payload = await r.text();
    if (lastPayload !== payload) {
      const files = JSON.parse(payload);
      if (!Array.isArray(files)) throw Error('Invalid listing');
      const data = reconcile(window.previewCatalog, files);
      if (state.product && !data.media.some(m => m.product===state.product && m.year===state.year && m.type===state.type) && state.type!=='key') state.product='';
      if (el('viewer').open && !files.some(f => driveUrl(f.id) === el('original').href)) el('viewer').close();
      ready(data);
      lastPayload = payload;
      loadedCatalog = true;
    }
    el('sync-status').textContent='';
  } catch {
    el('sync-status').textContent=loadedCatalog?'تعذّر تحديث القائمة. تظهر آخر قائمة تم تحميلها.':'تعذّر تحميل فهرس Drive. أعد تحميل الصفحة للمحاولة.';
  } finally {refreshing=false}
}
