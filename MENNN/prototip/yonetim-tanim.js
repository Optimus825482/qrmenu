/* ============================================================================
   MENNN · Tanımlama rehberi, rol ve yetki yönetimi ekranları
   - menu-haritasi   : yönetim menüsünün hiyerarşik haritası
   - kullanici-rol   : kullanıcı rol tanımları (garson, kat sorumlusu, mutfak şefi...)
   - kullanici-yetki : role göre otel × modül × ekran × işlem yetkisi
   - tanim-akisi     : tanımlama sırası, bağımlılık kuralları ve akış şeması
   Bu dosya yonetim-ek.js ve yonetim-menu.js'den SONRA yüklenir.
   ========================================================================= */

/* ---------------- rol kataloğu ---------------- */
const ROLE_CAT = [
  {k:'R-SYS', n:'Sistem Yöneticisi',        tip:'Sistem',   prof:'TAM',  mods:['CORE','MINIBAR','QR_MENU','QR_ORDER','QR_ROOM_SERVICE'], home:'Komuta Merkezi', users:1},
  {k:'R-OTM', n:'Otel Müdürü',              tip:'Yönetim',  prof:'ISLET',mods:['CORE','MINIBAR','QR_MENU','QR_ORDER'], home:'Rapor Merkezi', users:3},
  {k:'R-FBM', n:'F&B Müdürü',               tip:'Yönetim',  prof:'ISLET',mods:['CORE','QR_MENU','QR_ORDER','QR_ROOM_SERVICE'], home:'Sipariş Onay Kuyruğu', users:3},
  {k:'R-SGF', n:'Şef Garson / Süpervizör',  tip:'Outlet',   prof:'ISLET',mods:['QR_ORDER','QR_MENU'], home:'Sipariş Onay Kuyruğu', users:6},
  {k:'R-GAR', n:'Garson',                   tip:'Outlet',   prof:'SAHA', mods:['QR_ORDER','QR_MENU'], home:'Sipariş Onay Kuyruğu (kendi outleti)', users:24},
  {k:'R-BAR', n:'Barmen',                   tip:'Outlet',   prof:'SAHA', mods:['QR_ORDER'], home:'Bar Sipariş Kuyruğu', users:8},
  {k:'R-BUT', n:'Butler (VIP)',             tip:'Outlet',   prof:'SAHA', mods:['QR_ORDER','QR_ROOM_SERVICE'], home:'Öncelikli (VIP) Kuyruk', users:4},
  {k:'R-OUT', n:'Outlet Görevlisi',         tip:'Outlet',   prof:'SAHA', mods:['QR_MENU'], home:'Menü Görünümü', users:12},
  {k:'R-ODS', n:'Oda Servisi Görevlisi',    tip:'Outlet',   prof:'SAHA', mods:['QR_ROOM_SERVICE'], home:'Oda Servisi Talep Ekranı', users:9},
  {k:'R-MUS', n:'Mutfak Şefi',              tip:'Mutfak',   prof:'ISLET',mods:['QR_ORDER','QR_ROOM_SERVICE'], home:'Mutfak Ekranı (KDS)', users:3},
  {k:'R-MUP', n:'Mutfak Personeli',         tip:'Mutfak',   prof:'SAHA', mods:['QR_ORDER'], home:'KDS Kuyruğu', users:14},
  {k:'R-KDS', n:'KDS Operatörü',            tip:'Mutfak',   prof:'SAHA', mods:['QR_ORDER'], home:'Mutfak Ekranı (KDS)', users:5},
  {k:'R-KAT', n:'Kat Sorumlusu (Kat Formu)',tip:'Minibar',  prof:'SAHA', mods:['MINIBAR'], home:'Kat Planı', users:14},
  {k:'R-DEP', n:'Depo Sorumlusu',           tip:'Minibar',  prof:'ISLET',mods:['MINIBAR'], home:'Zimmet & Stok', users:5},
  {k:'R-HKS', n:'Housekeeping Süpervizörü', tip:'Minibar',  prof:'IZLE', mods:['MINIBAR'], home:'Tüketim Raporları', users:3},
  {k:'R-ITT', n:'Otel IT (Destek)',         tip:'Sistem',   prof:'IZLE', mods:['CORE'], home:'Sistem Ayarları', users:2}
];
const PROFILES = {TAM:['V','O','D','A','R'], ISLET:['V','O','D','A'], SAHA:['V','O','D'], IZLE:['V','R']};
const PERM_LABEL = {V:'Görüntüle', O:'Oluştur', D:'Düzenle', A:'Onayla', R:'Rapor'};

/* ---------------- ekran kataloğu (modül → ekranlar) ---------------- */
const SCREENS_CAT = [
  {m:'MINIBAR', n:'Minibar Takip', items:[
    ['MB-KAT','Kat Planı (oda durumları)'], ['MB-KF','Kat Formu — QR okutma'], ['MB-TUK','Tüketim Girişi'],
    ['MB-ZIM','Zimmet & Stok'], ['MB-PERS','Kişiselleştirme Talepleri'], ['MB-DND','DND / Ara Kayıtlar'],
    ['MB-RAP','Tüketim Raporları'], ['MB-TAN','Minibar Tanımları']
  ]},
  {m:'QR_MENU', n:'QR Menü', items:[
    ['QM-MIS','Misafir Menü Görünümü'], ['QM-CAG','Garson Çağrı Ekranı'], ['QM-MEN','Menü / Kategori / Öğe Yönetimi'],
    ['QM-TEM','Tema Yönetimi'], ['QM-RAP','Menü Raporları']
  ]},
  {m:'QR_ORDER', n:'QR Sipariş', items:[
    ['QS-KUY','Sipariş Onay Kuyruğu'], ['QS-KDS','Mutfak Ekranı (KDS)'], ['QS-FIS','Fiş Yazıcı Kuyruğu'],
    ['QS-IPT','İptal / Düzeltme Onayı'], ['QS-RAP','Sipariş Raporları']
  ]},
  {m:'QR_ROOM_SERVICE', n:'QR Oda Servisi', items:[
    ['RO-TAL','Oda Servisi Talep Ekranı'], ['RO-TEL','Telefon Teyidi'], ['RO-TES','Teslim Takibi'], ['RO-SLA','SLA Raporları']
  ]},
  {m:'CORE', n:'Ortak / Çekirdek', items:[
    ['CR-KOM','Komuta Merkezi'], ['CR-ONL','Kullanıcı Takibi (Online)'], ['CR-RAP','Rapor Merkezi'],
    ['CR-KUL','Kullanıcı & Rol Yönetimi'], ['CR-SYS','Sistem Ayarları'], ['CR-DEN','Denetim Günlüğü']
  ]}
];
const ALL_SCREENS = SCREENS_CAT.reduce((a,g)=>a.concat(g.items.map(i=>({code:i[0], name:i[1], mod:g.m, modName:g.n}))), []);
const scrByCode = c => ALL_SCREENS.find(s=>s.code===c);
const PERMS = {};                       // 'R-KAT|MB-TUK' → ['V','O','D']
const MOD_ACCESS = {};                  // 'R-KAT|MINIBAR' → true/false
function defaultPerms(role, sc){
  const prof = PROFILES[role.prof] || ['V'];
  if(role.mods.indexOf(sc.mod) >= 0) return prof.slice();
  if(sc.mod==='CORE'){
    if(sc.code==='CR-RAP') return ['V','R'];
    if(sc.code==='CR-KOM' || sc.code==='CR-ONL') return (role.tip==='Yönetim'||role.tip==='Sistem') ? ['V','R'] : [];
  }
  return [];
}
function permOf(roleK, code){
  const k = roleK+'|'+code;
  if(!PERMS[k]){
    const r = ROLE_CAT.find(x=>x.k===roleK), sc = scrByCode(code);
    PERMS[k] = (r && sc) ? defaultPerms(r, sc) : [];
  }
  return PERMS[k];
}
function modAccess(roleK, mod){
  const k = roleK+'|'+mod;
  if(MOD_ACCESS[k]===undefined){
    const r = ROLE_CAT.find(x=>x.k===roleK);
    MOD_ACCESS[k] = !!(r && r.mods.indexOf(mod)>=0);
  }
  return MOD_ACCESS[k];
}
function roleName(k){ const r=ROLE_CAT.find(x=>x.k===k); return r? r.n : '—'; }
function grantedScreens(roleK){ return ALL_SCREENS.filter(s=>permOf(roleK,s.code).length).length; }

/* ================= 1) YÖNETİM MENÜSÜ HARİTASI ================= */
function nvMenuHaritasi(){
  function tree(list, depth){
    return list.map(function(n){
      if(n.g){
        return '<div style="padding-left:'+(depth*16)+'px"><b>'+(depth?'└ ':'▸ ')+esc(n.ic+' '+n.t)+'</b></div>'
             + tree(n.items, depth+1);
      }
      const b=menuBadge(n.v);
      return '<div style="padding-left:'+((depth)*16)+'px">'+
             '<a href="#/'+n.v+'">'+esc(n.ic+' '+n.t)+'</a>'+(b?' <span class="tag">'+b+'</span>':'')+'</div>';
    }).join('');
  }
  return `
  <p class="sub">Yönetim menüsü üç kademeli <b>akordeon</b> yapıdadır: ana kategori → alt kategori → ekran. Bir kategori açıldığında kardeş kategoriler kapanır;
  aktif ekranın üst kategorileri otomatik açılır. Üstteki arama kutusu menüyü anında süzer.</p>
  <div class="grid g2">
    <div class="card">
      <div class="ct">Menü hiyerarşisi</div>
      <div class="tree" style="font-size:12.6px;line-height:1.85">${tree(MENU_TREE,0)}</div>
    </div>
    <div class="card">
      <div class="ct">Kategorizasyon mantığı</div>
      <table class="t">
        <tr><th>Ana kategori</th><th>Ne içerir</th><th>Bağlı olduğu yer</th></tr>
        <tr><td><b>Tanımlar</b></td><td>Otel → Kat → Oda, Oda Tipi &amp; Konsept ataması, personel, kullanıcı/rol/yetki</td><td>Sistemin temel verisi; her modül buradan beslenir</td></tr>
        <tr><td><b>Ürün</b></td><td>Ürün grubu → ürün → konsept</td><td>Konsept, oda tipine atanır ve odanın minibar içeriğini belirler</td></tr>
        <tr><td><b>Merkezi Yönetim</b></td><td>Modül girişi, modül bazlı outletler, ekipler</td><td>Tanımlar tamamlandıktan sonra modül bazlı yapılandırma</td></tr>
        <tr><td><b>Minibar Operasyon</b></td><td>Zimmet, tüketim, kişiselleştirme, DND</td><td>Tanımlar + ürün verisine bağlı günlük işleyiş</td></tr>
        <tr><td><b>QR Menü / Sipariş / Oda Servisi</b></td><td>Menü kurgusu, onay kuyruğu, KDS, talepler</td><td>Outlet tanımlarına bağlı</td></tr>
        <tr><td><b>Oturum &amp; Takip</b></td><td>Online kullanıcı izleme, oturum ve süre ayarları</td><td>Tüm modüllerin ortak katmanı</td></tr>
      </table>
      <div class="note blue" style="margin-top:12px">Aynı ekran birden fazla yerden açılabilir: örneğin <b>Konsept</b>, hem <i>Tanımlar → Oda Tipi</i> altında
      (oda tipine atama amacıyla) hem <i>Ürün</i> altında (içerik tanımlama amacıyla) yer alır. Böylece yönetici işini yaptığı bağlamdan kopmaz.</div>
    </div>
  </div>`;
}

/* ================= 2) KULLANICI ROL TANIMLARI ================= */
function nvKullaniciRol(){
  return `
  <p class="sub">Roller, kullanıcılar oluşturulmadan <b>önce</b> tanımlanır. Her rol; tipi (Sistem / Yönetim / Outlet / Mutfak / Minibar),
  erişebileceği modüller ve giriş sonrası varsayılan ekranı ile kaydedilir. Yetki ayrıntısı bir sonraki adımda (Yetki Tanımları) verilir.</p>
  <div class="grid g4" style="margin-bottom:16px">
    <div class="card kpi"><div class="k">Tanımlı Rol</div><div class="v">${ROLE_CAT.length}</div><div class="u">kullanıcı sınıflandırması</div></div>
    <div class="card kpi gold"><div class="k">Outlet Rolleri</div><div class="v">${ROLE_CAT.filter(r=>r.tip==='Outlet').length}</div><div class="u">garson, şef garson, barmen, butler…</div></div>
    <div class="card kpi violet"><div class="k">Minibar Rolleri</div><div class="v">${ROLE_CAT.filter(r=>r.tip==='Minibar').length}</div><div class="u">kat/depo sorumlusu, housekeeping</div></div>
    <div class="card kpi ok"><div class="k">Atanmış Kullanıcı</div><div class="v">${REG_USERS.length}</div><div class="u">role bağlı kullanıcı havuzu</div></div>
  </div>
  <div class="card" style="margin-bottom:16px">
    <div class="ct">Rol kataloğu</div>
    <table class="t">
      <tr><th>Kod</th><th>Rol adı</th><th>Tip</th><th>Erişebileceği modüller</th><th>Varsayılan ekran</th>
          <th class="num">Tanımlı yetki</th><th class="num">Kullanıcı</th><th></th></tr>
      ${ROLE_CAT.map(r=>`<tr>
        <td class="mono">${r.k}</td><td><b>${esc(r.n)}</b></td>
        <td><span class="tag ${r.tip==='Minibar'?'violet':r.tip==='Outlet'?'blue':r.tip==='Mutfak'?'gold':'ok'}">${esc(r.tip)}</span></td>
        <td>${r.mods.map(m=>'<span class="tag">'+esc(modName(m))+'</span>').join(' ')}</td>
        <td class="muted">${esc(r.home)}</td>
        <td class="num">${grantedScreens(r.k)} / ${ALL_SCREENS.length}</td>
        <td class="num">${REG_USERS.filter(u=>u.scopes&&u.scopes.length).length? r.users : 0}</td>
        <td><button class="btn sm" onclick="S.yetkiRole='${r.k}';go('kullanici-yetki')">Yetki Ver</button></td></tr>`).join('')}
    </table>
  </div>
  <div class="grid g2">
    <div class="card">
      <div class="ct">Rol tanımla</div>
      <div class="row">
        <div class="fld"><label class="f">Rol adı</label><input id="rkName" placeholder="Örn. Teras Görevlisi"></div>
        <div class="fld"><label class="f">Rol tipi</label>
          ${sel('rkTip',[{v:'Sistem',t:'Sistem'},{v:'Yönetim',t:'Yönetim'},{v:'Outlet',t:'Outlet'},{v:'Mutfak',t:'Mutfak'},{v:'Minibar',t:'Minibar'}],'Outlet','')}
        </div>
      </div>
      <div class="fld"><label class="f">Erişebileceği modüller</label>
        <div>${MOD_LIST.map(m=>'<span class="tag">'+esc(m.n)+'</span>').join(' ')}</div>
      </div>
      <div class="row">
        <div class="fld"><label class="f">Varsayılan ekran</label><input id="rkHome" placeholder="Örn. Sipariş Onay Kuyruğu"></div>
        <div class="fld"><label class="f">Yetki profili</label>
          ${sel('rkProf',[{v:'TAM',t:'Tam yetki (V,O,D,A,R)'},{v:'ISLET',t:'İşletme (V,O,D,A)'},{v:'SAHA',t:'Saha (V,O,D)'},{v:'IZLE',t:'İzleme (V,R)'}],'SAHA','')}
        </div>
      </div>
      <button class="btn pri" onclick="addRoleCat()">Rolü Tanımla</button>
      <div class="note" style="margin-top:12px">Rol tanımlandıktan sonra <b>Yetki Tanımları</b> ekranında otele, modüle ve ekrana göre erişim verilir;
      yetkisi verilmemiş rol hiçbir modülde ekran göremez.</div>
    </div>
    <div class="card">
      <div class="ct">Rol tipleri ve kapsam</div>
      <table class="t">
        <tr><th>Tip</th><th>Kapsam</th><th>Örnek roller</th></tr>
        <tr><td><b>Sistem</b></td><td>Tüm kompleks, tüm modüller, tanımlar</td><td>Sistem Yöneticisi, Otel IT</td></tr>
        <tr><td><b>Yönetim</b></td><td>Otel geneli, rapor ağırlıklı</td><td>Otel Müdürü, F&amp;B Müdürü</td></tr>
        <tr><td><b>Outlet</b></td><td>Atandığı outlet(ler)</td><td>Şef Garson, Garson, Barmen, Butler, Outlet Görevlisi, Oda Servisi Görevlisi</td></tr>
        <tr><td><b>Mutfak</b></td><td>Mutfak ve KDS ekranları</td><td>Mutfak Şefi, Mutfak Personeli, KDS Operatörü</td></tr>
        <tr><td><b>Minibar</b></td><td>Atandığı kat / depo bölgesi</td><td>Kat Sorumlusu (Kat Formu), Depo Sorumlusu, Housekeeping Süpervizörü</td></tr>
      </table>
      <div class="note violet" style="margin-top:12px">Bir kullanıcı birden fazla role sahip olabilir (ör. Elif Demir: <b>Kat Sorumlusu</b> + <b>Outlet Görevlisi</b>);
      oturum açarken seçtiği outletin rolü geçerli olur.</div>
    </div>
  </div>`;
}
function addRoleCat(){
  const nm=document.getElementById('rkName').value.trim();
  if(!nm){ toast('Rol adı giriniz.'); return; }
  const tip=document.getElementById('rkTip').value, prof=document.getElementById('rkProf').value;
  const mods = tip==='Minibar'?['MINIBAR']:tip==='Mutfak'?['QR_ORDER']:tip==='Outlet'?['QR_ORDER','QR_MENU']:['CORE','MINIBAR','QR_MENU','QR_ORDER','QR_ROOM_SERVICE'];
  ROLE_CAT.push({k:'R'+String(ROLE_CAT.length+1).padStart(2,'0'), n:nm, tip:tip, prof:prof, mods:mods,
    home:document.getElementById('rkHome').value||'Oturum ana ekranı', users:0});
  buildNav(); render(); toast('Rol tanımlandı: '+nm);
}

/* ================= 3) KULLANICI YETKİ TANIMLARI ================= */
function nvKullaniciYetki(){
  const rk = ROLE_CAT.some(r=>r.k===S.yetkiRole) ? S.yetkiRole : 'R-KAT';
  S.yetkiRole = rk;
  const role = ROLE_CAT.find(r=>r.k===rk);
  const m = S.yetkiMod || 'MINIBAR';
  const grp = SCREENS_CAT.find(g=>g.m===m) || SCREENS_CAT[0];
  const total = ALL_SCREENS.length;
  return `
  <p class="sub">Yetki; <b>rol × otel × modül × ekran × işlem</b> zincirinde verilir. Önce rolün hangi otelde hangi modüle erişeceği,
  sonra o modüldeki ekranlar ve işlem tipleri (görüntüle / oluştur / düzenle / onayla / rapor) belirlenir.</p>
  <div class="bar">
    <div class="fld"><label class="f">Rol</label>${sel('ytRole', ROLE_CAT.map(r=>({v:r.k,t:r.n+'  ('+r.tip+')'})), rk,'')}</div>
    <div class="fld"><label class="f">Otel</label>${sel('ytHotel', [{v:'ALL',t:'Kompleks (3 otel)'}].concat(HOTELS.map(h=>({v:h.id,t:h.name}))), S.yetkiHotel||'H1','')}</div>
    <div class="fld"><label class="f">Modül</label>${sel('ytMod', MOD_LIST.map(x=>({v:x.k,t:x.n})), m,'')}</div>
    <button class="btn pri" onclick="applyYetkiFilter()">Getir</button>
    <span class="pill">${grantedScreens(rk)} / ${total} ekran yetkili</span>
  </div>
  <div class="grid g2" style="margin-bottom:14px">
    <div class="card">
      <div class="ct">${esc(role.n)} · modül erişimi</div>
      <table class="t">
        <tr><th>Modül</th><th class="ctr">Erişim</th><th class="num">Yetkili ekran</th><th>Kapsam notu</th></tr>
        ${MOD_LIST.map(mm=>{
          const on = modAccess(rk, mm.k);
          const cnt = ALL_SCREENS.filter(s=>s.mod===mm.k && permOf(rk,s.code).length).length;
          return `<tr>
            <td>${esc(mm.ic+' '+mm.n)}</td>
            <td class="ctr"><input type="checkbox" style="width:auto" ${on?'checked':''} onchange="toggleMod('${rk}','${mm.k}',this.checked)"></td>
            <td class="num">${cnt}</td>
            <td class="muted">${esc(mm.d)}</td></tr>`;
        }).join('')}
      </table>
    </div>
    <div class="card">
      <div class="ct">Yetkilendirme akışı</div>
      <div class="steps">
        <span class="s on">1 · Rol tanımla</span><span class="ar">→</span>
        <span class="s on">2 · Otel seç</span><span class="ar">→</span>
        <span class="s on">3 · Modül aç</span><span class="ar">→</span>
        <span class="s on">4 · Ekran yetkisi</span><span class="ar">→</span>
        <span class="s">5 · Kullanıcıya ata</span><span class="ar">→</span>
        <span class="s">6 · Outlet ekibi</span>
      </div>
      <table class="t" style="margin-top:12px">
        <tr><th>İşlem tipi</th><th>Anlamı</th></tr>
        <tr><td><b>V</b> · Görüntüle</td><td>Ekranı açma ve kaydı okuma</td></tr>
        <tr><td><b>O</b> · Oluştur</td><td>Yeni kayıt ekleme (tüketim, sipariş, talep)</td></tr>
        <tr><td><b>D</b> · Düzenle</td><td>Var olan kaydı değiştirme, düzeltme hareketi</td></tr>
        <tr><td><b>A</b> · Onayla</td><td>Sipariş onayı, zimmet onayı, iptal onayı</td></tr>
        <tr><td><b>R</b> · Rapor</td><td>Rapor alma ve dışa aktarma</td></tr>
      </table>
      <div class="note warn" style="margin-top:12px">Onay yetkisi (A) verilmeyen kullanıcı sipariş oluşturabilir fakat <b>mutfağa iletemez</b>;
      ikinci kademe onay kuralı gereği şef garson veya süpervizör devreye girer.</div>
    </div>
  </div>
  <div class="card">
    <div class="ct">${esc(modName(m))} · ekran yetkileri <span class="tag blue">${esc(role.n)}</span> <span class="tag">${esc((HOTELS.find(h=>h.id===(S.yetkiHotel||'H1'))||{}).name||'Kompleks')}</span></div>
    <table class="t">
      <tr><th style="width:52mm">Ekran</th><th>Kod</th>${Object.keys(PERM_LABEL).map(p=>'<th class="ctr">'+p+'<div class="muted" style="font-size:10px;font-weight:400">'+PERM_LABEL[p]+'</div></th>').join('')}<th class="ctr">Tümü</th></tr>
      ${grp.items.map(([code,name])=>{
        const cur=permOf(rk,code);
        return `<tr>
          <td><b>${esc(name)}</b></td><td class="mono">${code}</td>
          ${Object.keys(PERM_LABEL).map(p=>`<td class="ctr"><input type="checkbox" style="width:auto" ${cur.indexOf(p)>=0?'checked':''} onchange="togglePerm('${rk}','${code}','${p}',this.checked)"></td>`).join('')}
          <td class="ctr">${cur.length?'<span class="tag ok">'+cur.join('')+'</span>':'<span class="tag err">yok</span>'}</td>
        </tr>`;
      }).join('')}
    </table>
    <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
      <button class="btn pri" onclick="toast('Yetkiler kaydedildi: '+roleName(S.yetkiRole)+' · '+grantedScreens(S.yetkiRole)+' ekran');">Yetkileri Kaydet</button>
      <button class="btn" onclick="resetPerms()">Varsayılana Dön</button>
      <button class="btn" onclick="S.yetkiRole='${rk}';go('ekip-ata')">Bu rolü kullanıcıya ata →</button>
    </div>
  </div>
  <div class="card" style="margin-top:16px">
    <div class="ct">Rol × modül yetki özeti</div>
    <table class="t">
      <tr><th>Rol</th>${SCREENS_CAT.map(g=>'<th class="ctr" style="font-size:10.4px">'+esc(g.n)+'</th>').join('')}<th class="num">Toplam</th></tr>
      ${ROLE_CAT.map(r=>`<tr>
        <td><b>${esc(r.n)}</b><div class="mono muted">${r.k} · ${esc(r.tip)}</div></td>
        ${SCREENS_CAT.map(g=>{
          const c=ALL_SCREENS.filter(s=>s.mod===g.m && permOf(r.k,s.code).length).length;
          const t=g.items.length;
          return '<td class="ctr">'+(c? '<span class="tag '+(c===t?'ok':'warn')+'">'+c+'/'+t+'</span>':'<span class="muted">–</span>')+'</td>';
        }).join('')}
        <td class="num">${grantedScreens(r.k)}/${ALL_SCREENS.length}</td></tr>`).join('')}
    </table>
    <div class="note" style="margin-top:12px">Sistem Yöneticisi tüm ekranlarda <b>tam yetkiye</b> sahiptir ve kendi yetkisini kısıtlayamaz.
    Diğer roller yalnızca kendilerine verilen otel, modül ve ekranları görür; yetkisiz erişim denemesi denetim günlüğüne yazılır.</div>
  </div>`;
}
function applyYetkiFilter(){
  S.yetkiRole=document.getElementById('ytRole').value;
  S.yetkiHotel=document.getElementById('ytHotel').value;
  S.yetkiMod=document.getElementById('ytMod').value;
  buildNav(); render();
}
function togglePerm(rk, code, p, on){
  const k=rk+'|'+code; const cur=PERMS[k]||permOf(rk,code).slice();
  const i=cur.indexOf(p);
  if(on && i<0) cur.push(p);
  if(!on && i>=0) cur.splice(i,1);
  PERMS[k]=Object.keys(PERM_LABEL).filter(x=>cur.indexOf(x)>=0);
  render();
}
function toggleMod(rk, mod, on){ MOD_ACCESS[rk+'|'+mod]=on; render();
  toast(modName(mod)+' erişimi '+(on?'açıldı':'kapatıldı')+' · '+roleName(rk)); }
function resetPerms(){
  Object.keys(PERMS).forEach(k=>{ if(k.indexOf(S.yetkiRole+'|')===0) delete PERMS[k]; });
  Object.keys(MOD_ACCESS).forEach(k=>{ if(k.indexOf(S.yetkiRole+'|')===0) delete MOD_ACCESS[k]; });
  buildNav(); render(); toast('Yetkiler varsayılana döndürüldü: '+roleName(S.yetkiRole));
}

/* ================= 4) TANIMLAMA AKIŞI ================= */
function nvTanimAkisi(){
  const checks = [
    {t:'Otel tanımlı (3 standart kayıt)', ok:HOTELS.length>=3, v:'mb-hotel', n:HOTELS.length+' tesis', g:'Zorunlu ilk adım'},
    {t:'Oda tipi tanımlı', ok:ROOMTYPES.length>0, v:'mb-roomtype', n:ROOMTYPES.length+' tip', g:'Konsept bağlantısı zorunlu'},
    {t:'Konsept tanımlı (oda tipine atanmış)', ok:CONCEPTS.length>0, v:'mb-concept', n:CONCEPTS.length+' konsept', g:'Ürün + adet listesi'},
    {t:'Kat tanımlı', ok:FLOORS.length>0, v:'mb-floor', n:FLOORS.length+' kat', g:'Otelin iç yapısı'},
    {t:'Oda tanımlı (oda no + oda tipi)', ok:ROOMS.length>0, v:'mb-room', n:ROOMS.length+' oda', g:'Minibar içeriği otomatik atanır'},
    {t:'Ürün grubu tanımlı', ok:GROUPS.length>0, v:'mb-productgroup', n:GROUPS.length+' grup', g:'Konseptin yapı taşı'},
    {t:'Ürün tanımlı', ok:PRODUCTS.length>0, v:'mb-product', n:PRODUCTS.length+' ürün', g:'Gruba bağlı kayıt'},
    {t:'Rol tanımlı', ok:ROLE_CAT.length>0, v:'kullanici-rol', n:ROLE_CAT.length+' rol', g:'Kullanıcı öncesi adım'},
    {t:'Yetki tanımlı (otel × modül × ekran)', ok:Object.keys(PERMS).length>0, v:'kullanici-yetki', n:Object.keys(PERMS).length+' ekran kaydı', g:'Rol bazlı erişim'},
    {t:'Kullanıcı atandı (outlet ekibi)', ok:OUTLET_TEAMS.length>0, v:'ekip-ata', n:OUTLET_TEAMS.length+' atama', g:'Outlet ekibi oluşturuldu'},
    {t:'Tüm outletlere ekip atandı', ok:MOD_OUTLETS.every(o=>OUTLET_TEAMS.some(t=>t.outletId===o.id)), v:'ekip-ata',
     n:(MOD_OUTLETS.length - new Set(OUTLET_TEAMS.map(t=>t.outletId)).size)+' outlet ekipsiz', g:'Ekipsiz outlet canlıya alınamaz'}
  ];
  const done=checks.filter(c=>c.ok).length, pct=Math.round(100*done/checks.length);
  const next=checks.find(c=>!c.ok);
  return `
  <p class="sub">Sistem üç zincir üzerine kurulur: <b>fiziksel yapı</b> (otel → kat → oda), <b>minibar içeriği</b> (oda tipi → ürün grubu → ürün → konsept)
  ve <b>yetkilendirme</b> (rol → yetki → kullanıcı → outlet ekibi). Üç zincir oda tanımında birleşir; odaya minibar içeriği otomatik atanır.</p>
  <div class="card" style="margin-bottom:16px">
    <div class="ct">Oda tanımı nasıl oluşur? <span class="tag gold">zincir</span></div>
    <div class="grid g3">
      <div>
        <div class="muted" style="font-size:11.6px;margin-bottom:6px">A · FİZİKSEL YAPI</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          <span class="tag blue">1 · Otel tanımla</span><span style="color:var(--muted)">↓</span>
          <span class="tag blue">2 · Kat tanımla (seçili otel)</span><span style="color:var(--muted)">↓</span>
          <span class="tag blue">3 · Oda tanımla (kat + oda no + oda tipi)</span>
        </div>
      </div>
      <div>
        <div class="muted" style="font-size:11.6px;margin-bottom:6px">B · MİNİBAR İÇERİĞİ</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          <span class="tag gold">1 · Ürün grubu tanımla</span><span style="color:var(--muted)">↓</span>
          <span class="tag gold">2 · Ürün tanımla (gruba bağlı)</span><span style="color:var(--muted)">↓</span>
          <span class="tag gold">3 · Konsept tanımla (ürün + adet)</span><span style="color:var(--muted)">↓</span>
          <span class="tag gold">4 · Konsepti oda tipine ata</span>
        </div>
      </div>
      <div>
        <div class="muted" style="font-size:11.6px;margin-bottom:6px">C · YETKİLENDİRME</div>
        <div style="display:flex;flex-direction:column;gap:6px">
          <span class="tag violet">1 · Rol tanımla</span><span style="color:var(--muted)">↓</span>
          <span class="tag violet">2 · Yetki ver (otel × modül × ekran)</span><span style="color:var(--muted)">↓</span>
          <span class="tag violet">3 · Kullanıcı tanımla</span><span style="color:var(--muted)">↓</span>
          <span class="tag violet">4 · Outlet ekibine ata</span>
        </div>
      </div>
    </div>
    <div class="note ok" style="margin-top:14px;margin-bottom:0"><b>Birleşme noktası:</b> Oda tanımında seçilen <b>oda tipi</b>, o tipe atanmış <b>konsepti</b>,
    konsept de <b>standart minibar içeriğini ve miktarlarını</b> belirler. Böylece odaya ayrıca ürün girilmez; tüm odalar aynı standartla açılır.</div>
  </div>
  <div class="grid g2">
    <div class="card">
      <div class="ct">Kurulum kontrol listesi <span class="tag ${pct===100?'ok':'warn'}">%${pct} tamam</span></div>
      <div class="prog" style="margin-bottom:12px"><i style="width:${pct}%;background:${pct===100?'var(--ok)':'var(--blue)'}"></i></div>
      <table class="t">
        <tr><th style="width:8mm"></th><th>Adım</th><th>Durum</th><th>Not</th><th></th></tr>
        ${checks.map((c,i)=>`<tr style="${!c.ok && next===c ? 'background:#fdf7ea' : ''}">
          <td class="ctr">${c.ok?'<span style="color:var(--ok);font-weight:700">✓</span>':'<span style="color:#c6d1dc">•</span>'}</td>
          <td><b>${esc(c.t)}</b></td>
          <td>${c.ok?'<span class="tag ok">'+esc(c.n)+'</span>':'<span class="tag warn">bekliyor</span>'}</td>
          <td class="muted">${esc(c.g)}</td>
          <td><button class="btn sm ${(!c.ok && next===c)?'pri':''}" onclick="go('${c.v}')">${(!c.ok && next===c)?'Sıradaki adım →':'Aç'}</button></td></tr>`).join('')}
      </table>
      ${next?`<div class="note gold" style="margin-top:12px;margin-bottom:0"><b>Sıradaki adım:</b> ${esc(next.t)} — ${esc(next.g)}. <b>“Sıradaki adım →”</b> düğmesi ilgili ekranı açar.</div>`
            :`<div class="note ok" style="margin-top:12px;margin-bottom:0">Tüm tanımlar tamamlandı; sistem modülleri canlıya alınabilir.</div>`}
    </div>
    <div class="card">
      <div class="ct">Bağımlılık ve engelleme kuralları</div>
      <table class="t">
        <tr><th>Kural</th><th>Sonuç</th></tr>
        <tr><td>Otel seçilmeden kat/oda/ürün/konsept tanımlanamaz</td><td><span class="tag err">engellenir</span></td></tr>
        <tr><td>Kat olmadan oda açılamaz</td><td><span class="tag err">engellenir</span></td></tr>
        <tr><td>Oda tipi olmadan oda tanımlanamaz (oda tipi → konsept zorunlu)</td><td><span class="tag err">engellenir</span></td></tr>
        <tr><td>Ürün grubu olmadan ürün eklenemez</td><td><span class="tag err">engellenir</span></td></tr>
        <tr><td>Ürün olmadan konsept oluşturulamaz</td><td><span class="tag err">engellenir</span></td></tr>
        <tr><td>Konsept atanmamış oda tipiyle oda açılamaz</td><td><span class="tag err">engellenir</span></td></tr>
        <tr><td>Rol tanımlanmadan yetki verilemez; yetkisiz rol hiçbir ekran göremez</td><td><span class="tag err">engellenir</span></td></tr>
        <tr><td>Outlet ekibi atanmamış outlet canlıya alınamaz</td><td><span class="tag err">engellenir</span></td></tr>
        <tr><td>Zimmeti olmayan kat sorumlusu oda ikamesi yapamaz</td><td><span class="tag err">engellenir</span></td></tr>
      </table>
      <div class="note" style="margin-top:12px">Engellenen işlem kullanıcıya <b>hangi adımın eksik olduğunu</b> söyleyen bir uyarı ve doğrudan o ekrana götüren
      bir kısayol gösterir (kurulum rehberi).</div>
    </div>
  </div>`;
}

/* ================= 5) OTEL OUTLET TANIMLARI (Tanımlar → Otel altında) ================= */
function ooList(){ const m=S.ooMod||'ALL';
  return MOD_OUTLETS.filter(o=>o.hotel===S.hotel && (m==='ALL'||o.mod===m)); }
function nvOtelOutlet(){
  const list = ooList();
  const target  = MOD_OUTLETS.find(o=>o.id===S.ooOutlet && o.hotel===S.hotel) || list[0] || null;
  S.ooOutlet = target ? target.id : null;
  const team = target ? OUTLET_TEAMS.filter(t=>t.outletId===target.id) : [];
  const selMod = target ? target.mod : ((S.ooMod && S.ooMod!=='ALL') ? S.ooMod : 'QR_MENU');
  const roles  = MOD_ROLES.filter(r=>r.mod===selMod);
  const available = REG_USERS.filter(u=>u.scopes.indexOf(S.hotel)>=0);
  const multi  = REG_USERS.filter(u=>teamsOfUser(u.id).length>1);
  const none   = REG_USERS.filter(u=>teamsOfUser(u.id).length===0);
  const zones  = MOD_OUTLETS.filter(o=>o.hotel===S.hotel && o.mod==='MINIBAR');
  const noTeam = list.filter(o=>!OUTLET_TEAMS.some(t=>t.outletId===o.id));
  return `
  <p class="sub">Otel tanımının hemen ardından gelen adım: <b>outlet tanımları</b>. Outletler otele ve modüle bağlıdır;
  minibar modülünde outlet karşılığı <b>merkez depo</b> veya <b>kat bölgesi</b>dir. Kullanıcılar bu outletlere atanır ve
  girişte oturum açacakları outleti <b>zorunlu olarak</b> seçer.</p>
  <div class="grid g5" style="margin-bottom:16px">
    <div class="card kpi"><div class="k">Outlet (seçili otel)</div><div class="v">${list.length}</div><div class="u">${esc(HN(S.hotel))}</div></div>
    <div class="card kpi gold"><div class="k">Minibar Bölgesi</div><div class="v">${zones.length}</div><div class="u">depo + kat bölgesi</div></div>
    <div class="card kpi ok"><div class="k">Ekipli Outlet</div><div class="v">${list.length-noTeam.length}</div><div class="u">canlıya alınabilir</div></div>
    <div class="card kpi warn"><div class="k">Ekipsiz Outlet</div><div class="v">${noTeam.length}</div><div class="u">atama bekliyor</div></div>
    <div class="card kpi violet"><div class="k">Çoklu Atamalı Kullanıcı</div><div class="v">${multi.length}</div><div class="u">girişte outlet seçer</div></div>
  </div>
  <div class="bar">
    <div class="fld"><label class="f">Otel</label>${hotelSel('ooHotel', S.hotel)}</div>
    <div class="fld"><label class="f">Modül</label>${sel('ooMod', [{v:'ALL',t:'Tüm modüller'}].concat(MOD_LIST.map(x=>({v:x.k,t:x.n}))), S.ooMod||'ALL','')}</div>
    <button class="btn pri" onclick="S.hotel=document.getElementById('ooHotel').value;S.ooMod=document.getElementById('ooMod').value;S.ooOutlet=null;buildNav();render()">Getir</button>
    <span class="pill">${list.length} outlet · ${new Set(list.map(o=>o.mod)).size} modül</span>
  </div>
  <div class="card" style="margin-bottom:16px">
    <div class="ct">${esc(HN(S.hotel))} · outlet listesi <span class="tag blue">otel → modül → outlet</span></div>
    <table class="t">
      <tr><th>Kod</th><th>Outlet / bölge</th><th>Modül</th><th>Tip</th><th>Modüle özel bilgi</th>
          <th>Ekip</th><th>Durum</th><th></th></tr>
      ${list.map(o=>{
        const t=OUTLET_TEAMS.filter(x=>x.outletId===o.id);
        const zone = o.mod==='MINIBAR';
        return `<tr style="${S.ooOutlet===o.id?'background:#f2f8fd':''}">
          <td class="mono">${o.id}</td>
          <td><b>${esc(o.name)}</b>${zone?' <span class="tag gold">minibar bölgesi</span>':''}</td>
          <td><span class="tag ${zone?'gold':'blue'}">${esc(modName(o.mod))}</span></td>
          <td>${zone?(o.name.toLowerCase().indexOf('depo')>=0?'<b>Depo</b>':'<b>Kat bölgesi</b>'):'<span class="tag">'+esc((o.meta.split('·')[0]||'').trim())+'</span>'}</td>
          <td class="muted">${esc(o.meta)}</td>
          <td>${t.length?t.map(x=>'<span class="tag ok">'+esc(regUser(x.userId).name.split(' ')[0])+'</span>').join(' '):'<span class="tag warn">ekip yok</span>'}</td>
          <td>${t.length?'<span class="tag ok">hazır</span>':'<span class="tag err">canlıya alınamaz</span>'}</td>
          <td><button class="btn sm" onclick="S.ooOutlet='${o.id}';S.mod='${o.mod}';render()">Seç</button></td></tr>`;
      }).join('') || '<tr><td colspan="8" class="muted">Bu otelde/ modülde outlet tanımlı değil.</td></tr>'}
    </table>
    <div class="note" style="margin-top:12px">Aynı fiziksel alan farklı modüllerde <b>ayrı outlet</b> olarak tanımlanır (havuz barı hem QR Menü hem QR Sipariş outleti olabilir).
    Minibar Takip modülünde outletler depo ve kat bölgeleridir; kat sorumlusu ve depo sorumlusu bu bölgelere atanır.</div>
  </div>
  <div class="grid g2">
    <div class="card">
      <div class="ct">Outlet tanımla — ${esc(HN(S.hotel))}</div>
      <div class="row">
        <div class="fld"><label class="f">Outlet / bölge adı</label><input id="ooName" placeholder="Örn. Diamond Teras Bar · veya · 5. Kat Bölgesi"></div>
        <div class="fld"><label class="f">Modül</label>${sel('ooNewMod', MOD_LIST.map(x=>({v:x.k,t:x.n})), selMod,'')}</div>
      </div>
      <div class="row">
        <div class="fld"><label class="f">Tip</label>
          ${sel('ooType',[{v:'Havuz',t:'Havuz'},{v:'Bar',t:'Bar'},{v:'Salon',t:'Salon'},{v:'Bahçe',t:'Bahçe'},{v:'Sahil',t:'Sahil'},{v:'Spa',t:'Spa'},{v:'Depo',t:'Minibar · Merkez Depo'},{v:'Kat',t:'Minibar · Kat Bölgesi'}],'Havuz','')}
        </div>
        <div class="fld"><label class="f">Kat aralığı (minibar bölgesi ise)</label><input id="ooFloors" placeholder="1–2"></div>
      </div>
      <div class="fld"><label class="f">Modüle özel bilgi (tema / istasyon+yazıcı / servis saati+SLA / zimmet kaynağı)</label><input id="ooMeta" placeholder="Örn. 18 masa · tema: deniz mavisi"></div>
      <button class="btn pri" onclick="addOtelOutlet()">Outlet Tanımla</button>
      <div class="note gold" style="margin-top:12px"><b>Sıra:</b> otel → <b>outlet tanımı</b> → rol ataması → kullanıcı ataması. Ekip atanmayan outlet
      canlıya alınamaz ve giriş ekranında kullanıcıya görünmez.</div>
    </div>
    <div class="card">
      <div class="ct">Kullanıcıyı outlet / minibar bölgesine ata</div>
      ${target?`<div class="note blue" style="margin-bottom:10px"><b>Seçili hedef:</b> ${esc(target.name)} · ${esc(modName(target.mod))}
        ${target.mod==='MINIBAR'?'<span class="tag gold">minibar bölgesi</span>':''}</div>`:'<div class="note warn">Önce listeden bir outlet seçin.</div>'}
      <div class="row">
        <div class="fld"><label class="f">Kayıtlı kullanıcı</label>
          ${sel('ooUser', available.map(u=>({v:u.id,t:u.name+' — '+u.user+(outletsOfUser(u.id).length?' ('+outletsOfUser(u.id).length+' outlet)':'')})), '', '')}
        </div>
        <div class="fld"><label class="f">Rol (${esc(modName(selMod))})</label>
          ${sel('ooRole', roles.map(r=>({v:r.k,t:r.name})), '', '')}
        </div>
      </div>
      <button class="btn pri" onclick="ooAssign()" ${target?'':'disabled'}>Atamayı Kaydet</button>
      <button class="btn" onclick="S.ooOutlet='${target?target.id:''}';S.outletSel='${target?target.id:''}';go('ekip-ata')">Outlet Ekipleri ekranında aç</button>
      <div class="ct" style="margin-top:14px">${target?esc(target.name):'—'} · görevli kullanıcılar</div>
      <table class="t">
        <tr><th>Kullanıcı</th><th>Rol</th><th>Diğer outletleri</th><th></th></tr>
        ${team.map(t=>{
          const u=regUser(t.userId), others=teamsOfUser(t.userId).filter(x=>x.outletId!==target.id);
          return `<tr><td><b>${esc(u.name)}</b><div class="mono muted">${esc(u.user)}</div></td>
            <td>${esc((mroleByK(t.roleK)||{}).name)}</td>
            <td>${others.length?others.map(x=>'<span class="tag blue">'+esc(moName(x.outletId))+'</span>').join(' '):'<span class="muted">—</span>'}</td>
            <td><button class="btn sm" onclick="removeTeam('${t.id}')">Kaldır</button></td></tr>`;
        }).join('') || '<tr><td colspan="4" class="muted">Bu hedefe atanmış kullanıcı yok.</td></tr>'}
      </table>
    </div>
  </div>
  <div class="card" style="margin-top:16px">
    <div class="ct">Giriş davranışı: çoklu outlet ataması <span class="tag violet">zorunlu seçim</span></div>
    <table class="t">
      <tr><th>Kullanıcı</th><th class="num">Atandığı outlet</th><th>Girişte göreceği seçenekler</th><th>Giriş akışı</th></tr>
      ${multi.map(u=>{
        const outs=teamsOfUser(u.id);
        return `<tr>
          <td><b>${esc(u.name)}</b><div class="mono muted">${esc(u.user)}</div></td>
          <td class="num">${outs.length}</td>
          <td>${outs.map(x=>{
            const o=moById(x.outletId);
            return '<span class="tag '+(o.mod==='MINIBAR'?'gold':'blue')+'">'+esc(o.name)+' · '+esc((mroleByK(x.roleK)||{}).name)+'</span>';
          }).join(' ')}</td>
          <td class="muted">Giriş → <b>hemen outlet veya minibar sistemi seçimi</b> → oturum açılır</td>
        </tr>`;
      }).join('') || '<tr><td colspan="4" class="muted">Çoklu outlet ataması olan kullanıcı yok.</td></tr>'}
      ${none.length?`<tr><td colspan="4" style="background:#fdf4e3"><b>Ataması olmayan ${none.length} kullanıcı:</b>
        ${none.map(u=>esc(u.name)).join(', ')} — girişte outlet listesi boş kalır, operasyonel yetki görünmez.</td></tr>`:''}
    </table>
    <div class="grid g3" style="margin-top:14px">
      <div class="note" style="margin:0"><b>Kural 1:</b> bir kullanıcı <b>birden fazla</b> outlette ve/veya minibar bölgesinde görev alabilir.</div>
      <div class="note violet" style="margin:0"><b>Kural 2:</b> girişten hemen sonra oturum açılacak <b>outlet</b> veya <b>minibar sistemi</b> seçilir. Seçim yapılmadan oturum başlamaz. Birden fazla atamada hangisinin açılacağı kullanıcıya sorulur.</div>
      <div class="note ok" style="margin:0"><b>Kural 3:</b> oturum yalnızca seçilen outletin bildirimlerini ve ekranlarını gösterir; başka outletin verisi görünmez.</div>
    </div>
  </div>`;
}
function addOtelOutlet(){
  const nm=document.getElementById('ooName').value.trim();
  if(!nm){ toast('Outlet adı giriniz.'); return; }
  const mod=document.getElementById('ooNewMod').value;
  const tip=document.getElementById('ooType').value;
  const floors=document.getElementById('ooFloors').value.trim();
  const meta=document.getElementById('ooMeta').value.trim();
  const isZone = mod==='MINIBAR';
  MOD_OUTLETS.push({id:'MO'+(MOD_OUTLETS.length+1), mod:mod, hotel:S.hotel, name:nm,
    meta:(isZone ? ('bölge tipi: '+tip+(floors?' · kat '+floors+' · ':'')) : '') + (meta||'modüle özel alanlar girilecek')});
  S.ooMod = mod==='MINIBAR'?'MINIBAR':S.ooMod;
  buildNav(); render(); toast('Outlet tanımlandı: '+nm+' ('+modName(mod)+')');
}
function ooAssign(){
  const uid=document.getElementById('ooUser').value, rk=document.getElementById('ooRole').value;
  if(!S.ooOutlet){ toast('Önce outlet seçin.'); return; }
  if(!uid||!rk){ toast('Kullanıcı ve rol seçiniz.'); return; }
  if(OUTLET_TEAMS.some(t=>t.userId===uid && t.outletId===S.ooOutlet)){ toast('Bu kullanıcı zaten bu outlette görevli.'); return; }
  OUTLET_TEAMS.push({id:'T'+(OUTLET_TEAMS.length+1), userId:uid, outletId:S.ooOutlet, roleK:rk, since:'31.10.2026'});
  buildNav(); render();
  toast('Atama kaydedildi: '+regUser(uid).name+' → '+moName(S.ooOutlet)+' ('+(mroleByK(rk)||{}).name+')');
}

/* ================= kayıt ve son render ================= */
Object.assign(VIEWS, {
  'menu-haritasi':nvMenuHaritasi, 'kullanici-rol':nvKullaniciRol,
  'kullanici-yetki':nvKullaniciYetki, 'tanim-akisi':nvTanimAkisi,
  'otel-outlet':nvOtelOutlet
});
[['menu-haritasi','Yönetim Menüsü Haritası'],['kullanici-rol','Rol Tanımları'],['kullanici-yetki','Yetki Tanımları'],
 ['tanim-akisi','Tanımlama Akışı & Kurulum Rehberi'],['otel-outlet','Outlet Tanımları']].forEach(function(p){
  if(!NAV.some(x=>x.v===p[0])) NAV.push({v:p[0], t:p[1]});
});
S.yetkiRole = S.yetkiRole || 'R-KAT';
S.yetkiMod  = S.yetkiMod  || 'MINIBAR';
S.yetkiHotel= S.yetkiHotel|| 'H1';
S.ooMod     = S.ooMod     || 'ALL';
buildNav();
render();
