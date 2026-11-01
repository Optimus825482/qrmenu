/* ============================================================================
   MENNN · Akordeon yönetim menüsü (kategorize menü sistemi)
   Amaç: sistem yöneticisinin tek bakışta anladığı, birbirine bağlı hiyerarşik
   menü:  Ana kategori → Alt kategori → Alt-alt kategori → ekran
   Örnek: Tanımlar → Otel → Kat → Oda  ·  Ürün → Ürün Grubu → Ürün → Konsept
   Bu dosya yonetim-ek.js'den SONRA yüklenir ve buildNav()'i yeniden tanımlar.
   ========================================================================= */

/* ---------------- menü ağacı ---------------- */
const MENU_TREE = [
  {g:'genel', t:'Genel', ic:'▦', open:true, items:[
    {v:'dashboard',    t:'Genel Bakış',                    ic:'▦'},
    {v:'tanim-akisi',  t:'Tanımlama Akışı & Kurulum Rehberi', ic:'🧭'},
    {v:'menu-haritasi',t:'Yönetim Menüsü Haritası',        ic:'🗺'},
    {v:'command',      t:'Komuta Merkezi (canlı)',         ic:'🛰'}
  ]},
  {g:'tanimlar', t:'Tanımlar', ic:'📋', items:[
    {g:'tanimlar.otel', t:'Otel', ic:'🏨', items:[
      {v:'mb-hotel', t:'Otel Tanımla',            ic:'🏨'},
      {v:'mb-floor', t:'Kat Tanımla (otel → kat)',ic:'▤'},
      {v:'mb-room',  t:'Oda Tanımla (kat → oda)', ic:'🚪'},
      {v:'otel-outlet', t:'Outlet Tanımla (otel outletleri)', ic:'🧩'}
    ]},
    {g:'tanimlar.odatipi', t:'Oda Tipi', ic:'🏷', items:[
      {v:'mb-roomtype', t:'Oda Tipi Tanımla',              ic:'🏷'},
      {v:'mb-concept',  t:'Konsept Ata (oda tipine)',      ic:'📋'}
    ]},
    {g:'tanimlar.personel', t:'Personel (Minibar Sorumluları)', ic:'👤', items:[
      {v:'mb-staff', t:'Kat / Depo Sorumlusu Tanımla', ic:'👤'}
    ]},
    {g:'tanimlar.kullanici', t:'Kullanıcı', ic:'🔐', items:[
      {v:'users',          t:'Kullanıcı Tanımla',   ic:'🔐'},
      {v:'kullanici-rol',  t:'Rol Tanımları',       ic:'🎭'},
      {v:'kullanici-yetki',t:'Yetki Tanımları',     ic:'🛡'}
    ]}
  ]},
  {g:'urun', t:'Ürün', ic:'📦', items:[
    {v:'mb-productgroup', t:'Ürün Grubu Tanımla', ic:'🗂'},
    {v:'mb-product',      t:'Ürün Tanımla',       ic:'📦'},
    {v:'mb-concept',      t:'Konsept Tanımla',    ic:'📋'}
  ]},
  {g:'merkez', t:'Merkezi Yönetim (Otel & Modüller)', ic:'🏛', items:[
    {v:'mod-giris',       t:'Modül Girişi (otel → modül)',       ic:'🏛'},
    {v:'qrm-outlet-mod',  t:'Modül Bazlı Outlet Görünümü',       ic:'🧩'},
    {v:'ekip-ata',        t:'Outlet Ekipleri & Kullanıcı Atama', ic:'👥'}
  ]},
  {g:'mbops', t:'Minibar Operasyon', ic:'📦', items:[
    {v:'mb-stock',       t:'Zimmet & Stok',              ic:'⚖'},
    {v:'mb-consumption', t:'Tüketim Kayıtları',          ic:'📝'},
    {v:'mb-pers',        t:'Kişiselleştirme Talepleri',  ic:'✨'},
    {v:'mb-dnd',         t:'DND / Ara Kayıtlar',         ic:'⏱'}
  ]},
  {g:'qrmenu', t:'QR Menü', ic:'🍽', items:[
    {v:'outlet-menu', t:'Outlet Menüsü · Modül & Fiyat', ic:'🍽'},
    {v:'qrm-menu',    t:'Menü / Kategori / Öğe',         ic:'🍴'},
    {v:'qrm-theme',   t:'Ambiyans & Tema',               ic:'🎨'}
  ]},
  {g:'qrsiparis', t:'QR Sipariş', ic:'🛎', items:[
    {v:'qrs-queue',   t:'Garson Onay Kuyruğu',     ic:'🛎'},
    {v:'qrs-adisyon', t:'Adisyon & Fiyat Toplamı', ic:'🧾'},
    {v:'qrs-kds',     t:'Mutfak Ekranı (KDS)',     ic:'👨‍🍳'}
  ]},
  {g:'oda', t:'QR Oda Servisi', ic:'🛏', items:[
    {v:'rs-queue', t:'Oda Servisi Talepleri', ic:'🛏'}
  ]},
  {g:'oturum', t:'Oturum & Kullanıcı Takibi', ic:'📡', items:[
    {v:'online-takip', t:'Kullanıcı Takip (Online)', ic:'📡'},
    {v:'ayarlar',      t:'Oturum & Süre Ayarları',   ic:'⏱'}
  ]},
  {g:'rapor', t:'Raporlar & Sistem', ic:'📈', items:[
    {v:'reports', t:'Raporlar',           ic:'📈'},
    {v:'system',  t:'Sistem & Denetim',   ic:'⚙'}
  ]}
];
/* yer imi (badge) değerleri — canlı veriden hesaplanır */
function menuBadge(v){
  try{
    if(v==='online-takip') return String(ONLINE_SESSIONS.filter(s=>s.status!=='CIKTI').length);
    if(v==='ekip-ata')     return String(new Set(OUTLET_TEAMS.map(t=>t.userId)).size);
    if(v==='users')        return String(REG_USERS.length);
    if(v==='kullanici-rol')return String(ROLE_CAT.length);
    if(v==='mb-room')      return String(ROOMS.length);
    if(v==='mb-hotel')     return String(HOTELS.length);
    if(v==='mb-product')   return String(PRODUCTS.length);
    if(v==='mb-concept')   return String(CONCEPTS.length);
    if(v==='qrm-outlet-mod')return String(MOD_OUTLETS.length);
    if(v==='otel-outlet')  return String(MOD_OUTLETS.filter(o=>o.hotel===(typeof S!=='undefined'?S.hotel:'H1')).length);
  }catch(e){}
  return '';
}
function menuHeader(ic,txt,badge,level){
  return '<button class="mhead'+(level?' l2':'')+'" onclick="menuToggle(this)">'+
         '<span class="ic">'+(ic||'•')+'</span><span>'+txt+'</span>'+
         (badge?'<span class="mcnt">'+badge+'</span>':'')+'<span class="car">▸</span></button>';
}
function menuRenderTree(list, path){
  return list.map(function(n){
    if(n.g){
      const id = n.g.indexOf('.') >= 0 ? n.g : (path ? path+'.'+n.g : n.g);
      return '<div class="mgrp'+(n.open?' open':'')+'" data-g="'+id+'">'+
             menuHeader(n.ic, n.t, n.badge||'', path?true:false)+
             '<div class="mbody">'+menuRenderTree(n.items, id)+'</div></div>';
    }
    const b = menuBadge(n.v);
    return '<a class="nav" data-v="'+n.v+'" data-path="'+path+'" href="#/'+n.v+'">'+
           '<span class="ic">'+(n.ic||'•')+'</span><span>'+n.t+'</span>'+
           (b?'<span class="mcnt">'+b+'</span>':'')+'</a>';
  }).join('');
}
/* akordeon davranışı: bir kategori açılınca kardeşleri kapanır */
function menuToggle(btn){
  const g = btn.parentElement;
  if(!g || !g.classList.contains('mgrp')) return;
  const parent = g.parentElement;
  const sibs = parent.querySelectorAll(':scope > .mgrp');
  const willOpen = !g.classList.contains('open');
  sibs.forEach(function(x){ if(x!==g) x.classList.remove('open'); });
  g.classList.toggle('open', willOpen);
  menuSave();
}
/* aktif ekranın üst kategorilerini aç ve görünür yap */
function menuOpenTrail(v){
  const a = document.querySelector('#nav a.nav[data-v="'+v+'"]');
  if(!a) return;
  let p = a.parentElement;
  while(p && p.id!=='nav'){
    if(p.classList && p.classList.contains('mbody')){
      const g = p.parentElement;
      if(g && g.classList.contains('mgrp')) g.classList.add('open');
    }
    p = p.parentElement;
  }
  try{ a.scrollIntoView({block:'nearest'}); }catch(e){}
}
function menuSave(){
  try{
    const open = [...document.querySelectorAll('#nav .mgrp.open')].map(function(g){ return g.dataset.g; });
    localStorage.setItem('mennn.menu.open', JSON.stringify(open));
  }catch(e){}
}
function menuRestore(){
  try{
    const raw = localStorage.getItem('mennn.menu.open');
    if(!raw) return;
    JSON.parse(raw).forEach(function(id){
      const g = document.querySelector('#nav .mgrp[data-g="'+id+'"]');
      if(g) g.classList.add('open');
    });
  }catch(e){}
}
/* menü içi arama */
function menuFilter(q){
  q = (q||'').toLowerCase().trim();
  const nav = document.getElementById('nav');
  nav.querySelectorAll('a.nav').forEach(function(a){
    const hit = !q || a.textContent.toLowerCase().indexOf(q) >= 0;
    a.style.display = hit ? '' : 'none';
  });
  nav.querySelectorAll('.mgrp').forEach(function(g){
    const any = [...g.querySelectorAll('a.nav')].some(function(a){ return a.style.display !== 'none'; });
    g.style.display = any ? '' : 'none';
    g.style.opacity = '';
    if(q && any) g.classList.add('open');
  });
}
/* ---- buildNav'ı yeniden tanımla: akordeon menü ---- */
buildNav = function(){
  const nav = document.getElementById('nav');
  nav.innerHTML = '<div class="mfilter"><input id="mfilter" placeholder="Menüde ara…  (ör. konsept, kat, yetki)" oninput="menuFilter(this.value)" autocomplete="off"></div>'
                + menuRenderTree(MENU_TREE, '');
  menuRestore();
  menuOpenTrail(current());
};
/* CSS enjeksiyonu (prototipin ana dosyasına dokunmadan) */
(function(){
  const st = document.createElement('style');
  st.textContent = `
  #nav .mfilter{padding:6px 8px 6px}
  #nav .mfilter input{width:100%;font-size:12.3px;padding:7px 9px;border-radius:7px;
    border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);color:#e8eff7}
  #nav .mfilter input::placeholder{color:#8ea6bd}
  #nav .mgrp{margin:1px 0}
  #nav .mhead{display:flex;align-items:center;gap:8px;width:100%;background:none;border:none;
    color:#c9d8e6;font:inherit;font-size:12.6px;font-weight:600;padding:8px 10px;border-radius:7px;cursor:pointer;text-align:left}
  #nav .mhead:hover{background:rgba(255,255,255,.07);color:#fff}
  #nav .mhead .ic{width:16px;text-align:center;font-size:12px;opacity:.95}
  #nav .mhead .car{margin-left:auto;font-size:9.5px;opacity:.65;transition:transform .18s}
  #nav .mgrp.open>.mhead{color:#fff;background:rgba(255,255,255,.06)}
  #nav .mgrp.open>.mhead>.car{transform:rotate(90deg)}
  #nav .mhead.l2{font-weight:500;font-size:12.4px;color:#bdd1e3;padding:6px 9px}
  #nav .mbody{display:none;padding-left:5px;margin-left:11px;border-left:1px dashed rgba(255,255,255,.14)}
  #nav .mgrp.open>.mbody{display:block}
  #nav a.nav{display:flex;align-items:center;gap:7px;padding:6px 9px;border-radius:6px;color:#c9d8e6;
    font-size:12.45px;text-decoration:none}
  #nav a.nav:hover{background:rgba(255,255,255,.07);color:#fff}
  #nav a.nav.on{background:var(--side2);color:#fff;box-shadow:inset 3px 0 0 var(--gold);font-weight:600}
  #nav a.nav .ic{width:16px;text-align:center;font-size:12px;opacity:.9}
  #nav .mcnt{margin-left:auto;font-size:10.2px;background:rgba(255,255,255,.15);border-radius:9px;padding:0 6px;color:#dbe7f1}
  `;
  document.head.appendChild(st);
})();
/* yön değişiminde menü durumunu senkronla */
window.addEventListener('hashchange', function(){ setTimeout(function(){ menuOpenTrail(current()); menuSave(); }, 0); });
buildNav();
