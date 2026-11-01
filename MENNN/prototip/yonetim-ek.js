/* ============================================================================
   MENNN · Yönetici paneli EKİ
   Merkezi Otel & Operasyon Yönetimi hiyerarşisi · modül bazlı outlet tanımları ·
   modül bazlı rol tanımları · outlet ekipleri ve kullanıcı atamaları ·
   online kullanıcı takip sistemi · oturum/süre ayarları
   Bu dosya yonetim-paneli.html tarafından yüklenir; panelin mevcut
   yardımcılarını (HOTELS, HN, esc, sel, hotelSel, toast, VIEWS, NAV, buildNav...)
   yeniden kullanır.
   ========================================================================= */

/* ---------------- veri ---------------- */
const MOD_LIST = [
  {k:'QR_MENU',         n:'QR Menü',          ic:'🍽', d:'Ambiyansa özel görsel menü, garson çağırma, outlet teması'},
  {k:'QR_ORDER',        n:'QR Sipariş',       ic:'🛎', d:'Garson ön onayı → mutfak fiş yazıcısı + KDS'},
  {k:'QR_ROOM_SERVICE', n:'QR Oda Servisi',   ic:'🛏', d:'Oda QR’ından talep, opsiyonel telefon teyidi, SLA'},
  {k:'MINIBAR',         n:'Minibar Takip',    ic:'📦', d:'Otel/kat/oda/ürün bazlı tüketim, zimmet, kişiselleştirme'}
];
const MOD_OUTLETS = [
  {id:'MO1', mod:'QR_MENU',         hotel:'H1', name:'Royal Ana Havuz & Pool Bar', meta:'22 masa · tema: Deniz mavisi / akik'},
  {id:'MO2', mod:'QR_MENU',         hotel:'H1', name:'Kaptan Köşkü Piano Bar',     meta:'18 masa · tema: Koyu ceviz / altın'},
  {id:'MO3', mod:'QR_MENU',         hotel:'H2', name:'Diamond Infinity Pool',      meta:'16 şezlong · tema: Obsidyen / şampanya'},
  {id:'MO4', mod:'QR_MENU',         hotel:'H3', name:'Lagoon Aile Havuzu',         meta:'26 masa · tema: Turkuaz / kum'},
  {id:'MO5', mod:'QR_ORDER',        hotel:'H1', name:'Havuz Bar İstasyonu',        meta:'istasyon: Havuz Bar · yazıcı: ESC/POS · ön onay: açık'},
  {id:'MO6', mod:'QR_ORDER',        hotel:'H1', name:'Piano Bar İstasyonu',        meta:'istasyon: Bar · yazıcı: ESC/POS · ön onay: açık'},
  {id:'MO7', mod:'QR_ORDER',        hotel:'H3', name:'Ana Mutfak İstasyonu',       meta:'istasyon: Mutfak · KDS + fiş yazıcı · ön onay: açık'},
  {id:'MO8', mod:'QR_ROOM_SERVICE', hotel:'H1', name:'Oda Servisi Birimi (MR)',    meta:'07:00–01:00 · SLA 30 dk · telefon teyidi: opsiyonel'},
  {id:'MO9', mod:'QR_ROOM_SERVICE', hotel:'H2', name:'Oda Servisi Birimi (MRD)',   meta:'07:00–01:00 · SLA 25 dk · telefon teyidi: zorunlu'},
  {id:'MO10',mod:'MINIBAR',         hotel:'H1', name:'Merit Royal · Merkez Depo',  meta:'zimmet kaynağı · depo sorumlusu atanır'},
  {id:'MO11',mod:'MINIBAR',         hotel:'H1', name:'Merit Royal · 1–2. Kat',     meta:'kat sorumlusu bölgesi · 152 oda'},
  {id:'MO12',mod:'MINIBAR',         hotel:'H1', name:'Merit Royal · 3–4. Kat',     meta:'kat sorumlusu bölgesi · 148 oda'},
  {id:'MO13',mod:'MINIBAR',         hotel:'H3', name:'Premium · Merkez Depo',      meta:'zimmet kaynağı · depo sorumlusu atanır'},
  {id:'MO14',mod:'MINIBAR',         hotel:'H3', name:'Premium · 1–5. Kat',         meta:'kat sorumlusu bölgesi · 420 oda'}
];
const MOD_ROLES = [
  {k:'R01', mod:'QR_MENU',         name:'Outlet Görevlisi',        perms:['menü görüntüleme','garson çağrısı','masa yönlendirme']},
  {k:'R02', mod:'QR_ORDER',        name:'Garson',                  perms:['sipariş ön onayı','teslim teyidi','masa taşıma']},
  {k:'R03', mod:'QR_ORDER',        name:'Şef Garson / Süpervizör', perms:['sipariş onayı','iptal onayı','eskalasyon hedefi','vardiya planı']},
  {k:'R04', mod:'QR_ORDER',        name:'Barmen',                  perms:['bar siparişi görüntüleme','hazır bildirimi']},
  {k:'R05', mod:'QR_ORDER',        name:'KDS Operatörü',           perms:['mutfak kuyruğu','hazır bildirimi','fiş tekrar baskısı']},
  {k:'R06', mod:'QR_ROOM_SERVICE', name:'Oda Servisi Görevlisi',   perms:['talep alma','telefon teyidi','teslim teyidi']},
  {k:'R07', mod:'MINIBAR',         name:'Kat Sorumlusu',           perms:['tüketim girişi','zimmet kullanımı','kişiselleştirme karşılama','DND ara kaydı']},
  {k:'R08', mod:'MINIBAR',         name:'Depo Sorumlusu',          perms:['zimmet dağıtımı','depo stoğu','ikmal talebi onayı']},
  {k:'R09', mod:'MINIBAR',         name:'Housekeeping Süpervizörü',perms:['kat raporu','personel performansı','DND uyarı takibi']},
  {k:'R10', mod:'MINIBAR',         name:'Butler (VIP)',            perms:['suit/cabana ikramı','öncelikli kuyruk']}
];
/* komuta merkezi kullanıcı yönetiminde TANIMLI kullanıcılar (atama havuzu) */
const REG_USERS = [
  {id:'U1', name:'Deniz Yücel',   user:'deniz.yucel',   mfa:true,  scopes:['H1','H2']},
  {id:'U2', name:'Elif Demir',    user:'elif.demir',    mfa:false, scopes:['H1']},
  {id:'U3', name:'Murat Aksoy',   user:'murat.aksoy',   mfa:false, scopes:['H1']},
  {id:'U4', name:'Zeynep Arslan', user:'zeynep.arslan', mfa:false, scopes:['H3']},
  {id:'U5', name:'Hakan Yıldız',  user:'hakan.yildiz',  mfa:true,  scopes:['H1']},
  {id:'U6', name:'Selin Kaya',    user:'selin.kaya',    mfa:true,  scopes:['H2']},
  {id:'U7', name:'Emre Şahin',    user:'emre.sahin',    mfa:false, scopes:['H3']},
  {id:'U8', name:'Kerem Doğan',   user:'kerem.dogan',   mfa:false, scopes:['H3']},
  {id:'U9', name:'Ayşe Bozkurt',  user:'ayse.bozkurt',  mfa:false, scopes:['H2']},
  {id:'U10',name:'Burak Tuna',    user:'burak.tuna',    mfa:false, scopes:['H1','H3']}
];
/* outlet ekipleri: kullanıcı ↔ outlet ↔ modül rolü */
const OUTLET_TEAMS = [
  {id:'T1', userId:'U1', outletId:'MO5', roleK:'R03', since:'01.05.2026'},
  {id:'T2', userId:'U1', outletId:'MO6', roleK:'R03', since:'01.05.2026'},
  {id:'T3', userId:'U1', outletId:'MO3', roleK:'R02', since:'12.06.2026'},
  {id:'T4', userId:'U2', outletId:'MO11',roleK:'R07', since:'01.04.2026'},
  {id:'T5', userId:'U5', outletId:'MO10',roleK:'R08', since:'01.04.2026'},
  {id:'T6', userId:'U3', outletId:'MO12',roleK:'R07', since:'15.05.2026'},
  {id:'T7', userId:'U6', outletId:'MO9', roleK:'R06', since:'01.06.2026'},
  {id:'T8', userId:'U4', outletId:'MO14',roleK:'R07', since:'20.06.2026'},
  {id:'T9', userId:'U7', outletId:'MO13',roleK:'R08', since:'20.06.2026'},
  {id:'T10',userId:'U9', outletId:'MO3', roleK:'R02', since:'02.07.2026'},
  {id:'T11',userId:'U8', outletId:'MO14',roleK:'R07', since:'01.07.2026'},
  {id:'T12',userId:'U1', outletId:'MO8', roleK:'R06', since:'01.08.2026'}
];
/* oturum ayarları (komuta merkezi · Ayarlar) */
const CFG = {
  maxOnlineMin: 480,        // varsayılan maksimum online süre (dakika)
  warnBeforeMin: 60,        // süre bitmeden uyarı
  autoLogout: true,         // süre aşımında otomatik çıkış
  idleLogoutMin: 45,        // hareketsizlik sonrası çıkış
  singleOutletAuto: true,   // tek outleti olan kullanıcıda otomatik seçim
  hotelFirst: true,         // girişte önce otel seçimi zorunlu
  minibarMaxOnlineMin: 600, // modül bazlı farklılaştırma
  qrMaxOnlineMin: 480,
  forceLogoutAtShiftEnd: true,
  multiDevice: false        // aynı kullanıcı tek cihazda online
};
/* online oturumlar (canlı izleme) */
const ONLINE_SESSIONS = [
  {id:'OS1', userId:'U1', hotel:'H1', outletId:'MO5', roleK:'R03', login:'09:12', sec:6420,  status:'ONLINE', act:'Sipariş onayı (SP-5521)'},
  {id:'OS2', userId:'U2', hotel:'H1', outletId:'MO11',roleK:'R07', login:'08:00', sec:3540,  status:'ONLINE', act:'Kat formu QR — oda 211'},
  {id:'OS3', userId:'U3', hotel:'H1', outletId:'MO12',roleK:'R07', login:'10:04', sec:2820,  status:'ONLINE', act:'Tüketim kaydı (C-88412)'},
  {id:'OS4', userId:'U6', hotel:'H2', outletId:'MO9', roleK:'R06', login:'08:30', sec:9240,  status:'UYARI',  act:'Oda servisi teslim (RS-902)'},
  {id:'OS5', userId:'U4', hotel:'H3', outletId:'MO14',roleK:'R07', login:'12:02', sec:120,   status:'ONLINE', act:'Kat planı görüntüledi'},
  {id:'OS6', userId:'U9', hotel:'H2', outletId:'MO3', roleK:'R02', login:'06:40', sec:30600, status:'CIKTI',  act:'Süre aşımı · otomatik çıkış', reason:'SURE_ASIMI'},
  {id:'OS7', userId:'U7', hotel:'H3', outletId:'MO13',roleK:'R08', login:'07:55', sec:6600,  status:'ONLINE', act:'Zimmet dağıtımı onayı'}
];
const OS_LOG = [
  {t:'11:44', x:'elif.demir · Merit Royal · 1–2. Kat · tüketim kaydı (oda 211)'},
  {t:'11:42', x:'deniz.yucel · Havuz Bar İstasyonu · SP-5521 siparişini onayladı'},
  {t:'11:39', x:'ayse.bozkurt · Oda Servisi (MRD) · RS-902 teslim edildi'},
  {t:'11:35', x:'hakan.yildiz · Merkez Depo · zimmet dağıtımı (Elif Demir)'}
];
const osTpl = [
  'kat formu QR okuttu — oda {r}',
  'sipariş onayladı — {o}',
  'kişiselleştirme talebini karşıladı — oda {r}',
  'KDS kuyruğundan fiş bastı',
  'zimmet dağıtımını onayladı',
  'oda servisi talebini yola çıkardı'
];
let osSeq = 0;

/* ---------------- yardımcılar ---------------- */
function modOf(k){ return MOD_LIST.find(m=>m.k===k) || {n:'—', ic:'•'}; }
function modName(k){ return modOf(k).n; }
function moById(id){ return MOD_OUTLETS.find(o=>o.id===id); }
function moName(id){ const o=moById(id); return o? o.name : '—'; }
function mroleByK(k){ return MOD_ROLES.find(r=>r.k===k); }
function regUser(id){ return REG_USERS.find(u=>u.id===id); }
function teamsOfUser(uid){ return OUTLET_TEAMS.filter(t=>t.userId===uid); }
function outletsOfUser(uid){ return teamsOfUser(uid).map(t=>t.outletId); }
function mmss(sec){ const h=Math.floor(sec/3600), m=Math.floor((sec%3600)/60), s=sec%60;
  return (h?h+':':'')+String(m).padStart(2,'0')+':'+String(s).padStart(2,'0'); }
function sessUser(s){ return regUser(s.userId); }
function osStatusTag(st){
  return st==='ONLINE' ? '<span class="tag ok">online</span>'
       : st==='UYARI'  ? '<span class="tag warn">süre uyarısı</span>'
       : st==='CIKTI'  ? '<span class="tag err">otomatik çıkış</span>'
       : '<span class="tag">çevrimdışı</span>';
}

/* ================= 1) MERKEZİ OTEL & OPERASYON YÖNETİMİ ================= */
function nvModGiris(){
  return `
  <p class="sub">Sistemin merkezindeki <b>ana tanımlar</b> (otel, kullanıcı, rol) tamamlandıktan sonra alt modüller
  <b>otel seçimi üzerinden</b> açılır: otel → modül → modülün kendi outletleri → ekip ataması → canlı.</p>
  <div class="steps" style="margin-bottom:16px">
    <span class="s on">1 · Ana tanımlar</span><span class="ar">→</span>
    <span class="s on">2 · Otel seç</span><span class="ar">→</span>
    <span class="s">3 · Modül seç</span><span class="ar">→</span>
    <span class="s">4 · Modül outletleri</span><span class="ar">→</span>
    <span class="s">5 · Rol &amp; ekip ataması</span><span class="ar">→</span>
    <span class="s">6 · Canlı</span>
  </div>
  <div class="bar">
    <div class="fld"><label class="f">Otel seç (modül girişi buradan yapılır)</label>${hotelSel('mgHotel', S.hotel)}</div>
    <button class="btn pri" onclick="S.hotel=document.getElementById('mgHotel').value;render()">Oteli Getir</button>
    <span class="pill">${esc(HN(S.hotel))} · ${floorsOf(S.hotel).length} kat · ${roomsOf(S.hotel).length}+ oda</span>
  </div>
  <h3>${esc(HN(S.hotel))} · alt modüller</h3>
  <div class="grid g4">
    ${MOD_LIST.map(m=>{
      const outs = MOD_OUTLETS.filter(o=>o.hotel===S.hotel && o.mod===m.k);
      const roles = MOD_ROLES.filter(r=>r.mod===m.k);
      const team = OUTLET_TEAMS.filter(t=>outs.some(o=>o.id===t.outletId));
      return `<div class="card">
        <div class="ct">${m.ic} ${esc(m.n)} <span class="tag ${outs.length?'ok':'warn'}">${outs.length?outs.length+' outlet':'outlet yok'}</span></div>
        <div style="font-size:12.2px;color:var(--muted);min-height:46px">${esc(m.d)}</div>
        <table class="t" style="margin:8px 0">
          <tr><td>Outlet</td><td class="num">${outs.length}</td></tr>
          <tr><td>Tanımlı rol</td><td class="num">${roles.length}</td></tr>
          <tr><td>Atanmış kullanıcı</td><td class="num">${new Set(team.map(t=>t.userId)).size}</td></tr>
        </table>
        <button class="btn sm" onclick="S.mod='${m.k}';go('qrm-outlet-mod')">Outlet Tanımla</button>
        <button class="btn sm" onclick="S.mod='${m.k}';go('rol-tanim')">Roller</button>
        <button class="btn sm" onclick="S.mod='${m.k}';go('ekip-ata')">Ekip</button>
      </div>`;
    }).join('')}
  </div>
  <div class="grid g3" style="margin-top:16px">
    <div class="card">
      <div class="ct">Giriş hiyerarşisi</div>
      <ul class="ck">
        <li>Kullanıcı girişten hemen sonra kendisine atanmış <b>outlet</b> veya <b>minibar sistemi</b> arasından oturum açacağını seçer.</li>
        <li>Tek outleti varsa ve ayar açıksa outlet otomatik seçilir.</li>
        <li>Seçim sonrası kullanıcı <b>online</b> duruma geçer ve bildirim almaya başlar.</li>
      </ul>
    </div>
    <div class="card">
      <div class="ct">Modül bağımsızlığı</div>
      <ul class="ck">
        <li>Her modülün outletleri kendine özeldir; aynı fiziksel alan farklı modülde ayrı outlet olur.</li>
        <li>Modül kapatılsa bile diğer modüller çalışmaya devam eder.</li>
      </ul>
    </div>
    <div class="card">
      <div class="ct">Hızlı erişim</div>
      <button class="btn" onclick="go('ekip-ata')">Outlet Ekipleri &amp; Atama</button>
      <button class="btn" onclick="go('online-takip')">Online Kullanıcı Takibi</button>
      <button class="btn" onclick="go('ayarlar')">Oturum &amp; Süre Ayarları</button>
    </div>
  </div>`;
}

/* ================= 2) MODÜL BAZLI OUTLET TANIMLARI ================= */
function nvOutletMod(){
  const m = S.mod || 'QR_MENU';
  const list = MOD_OUTLETS.filter(o=>o.mod===m && o.hotel===S.hotel);
  const fields = {
    QR_MENU:['Tema','Masa / şezlong sayısı','Menü dili'],
    QR_ORDER:['İstasyon','Fiş yazıcısı','Garson ön onayı','VIP öncelik'],
    QR_ROOM_SERVICE:['Servis saatleri','SLA (dk)','Telefon teyidi'],
    MINIBAR:['Bölge tipi (Depo / Kat)','Kat aralığı','Zimmet kaynağı']
  }[m] || [];
  return `
  <p class="sub">Seçilen otel ve modül için <b>outlet tanımları</b>. Outletler modüle özeldir; minibar modülünde outlet karşılığı
  <b>merkez depo ve kat bölgeleri</b>dir.</p>
  <div class="bar">
    <div class="fld"><label class="f">Otel</label>${hotelSel('omHotel', S.hotel)}</div>
    <div class="fld"><label class="f">Modül</label>${sel('omMod', MOD_LIST.map(x=>({v:x.k,t:x.n})), m,'')}</div>
    <button class="btn pri" onclick="S.hotel=document.getElementById('omHotel').value;S.mod=document.getElementById('omMod').value;render()">Getir</button>
    <span class="pill">${list.length} outlet</span>
  </div>
  <div class="grid ${list.length?'g2':''}">
    <div class="card">
      <div class="ct">${esc(modOf(m).ic)} ${esc(modName(m))} · outlet listesi (${esc(HN(S.hotel))})</div>
      <table class="t">
        <tr><th>Kod</th><th>Outlet</th><th>Modüle özel alanlar</th><th>Ekip</th><th></th></tr>
        ${list.map(o=>{
          const team=OUTLET_TEAMS.filter(t=>t.outletId===o.id);
          return `<tr><td class="mono">${o.id}</td><td><b>${esc(o.name)}</b></td>
          <td class="muted">${esc(o.meta)}</td>
          <td><span class="tag ${team.length?'ok':'warn'}">${team.length} kullanıcı</span></td>
          <td><button class="btn sm" onclick="S.mod='${o.mod}';S.outletSel='${o.id}';go('ekip-ata')">Ekip</button></td></tr>`;
        }).join('') || '<tr><td colspan="5" class="muted">Bu modülde henüz outlet tanımlanmadı.</td></tr>'}
      </table>
    </div>
    <div class="card">
      <div class="ct">Yeni outlet tanımla — ${esc(modName(m))}</div>
      <div class="row">
        <div class="fld"><label class="f">Outlet adı</label><input id="noName2" placeholder="Örn. Diamond Teras Bar"></div>
        <div class="fld"><label class="f">Modül</label><input value="${esc(modName(m))}" disabled></div>
      </div>
      <div class="row">
        ${fields.slice(0,2).map(f=>`<div class="fld"><label class="f">${esc(f)}</label><input placeholder="${esc(f)}"></div>`).join('')}
      </div>
      ${fields[2]?`<div class="fld"><label class="f">${esc(fields[2])}</label><input placeholder="${esc(fields[2])}"></div>`:''}
      <button class="btn pri" onclick="addModOutlet()">Outlet Tanımla</button>
      <div class="note blue" style="margin-top:12px">Outlet tanımlandıktan sonra <b>rol</b> ve <b>ekip ataması</b> adımları gelir; ekip atanmayan outlet canlıya alınamaz.</div>
    </div>
  </div>`;
}
function addModOutlet(){
  const nm=document.getElementById('noName2').value.trim();
  if(!nm){ toast('Outlet adı giriniz.'); return; }
  MOD_OUTLETS.push({id:'MO'+(MOD_OUTLETS.length+1), mod:S.mod, hotel:S.hotel, name:nm, meta:'yeni tanım · alanlar bekliyor'});
  render(); toast('Outlet tanımlandı: '+nm+' ('+modName(S.mod)+')');
}

/* ================= 3) MODÜL BAZLI ROL TANIMLARI ================= */
function nvRolTanim(){
  const m = S.mod || 'QR_MENU';
  const list = MOD_ROLES.filter(r=>r.mod===m);
  return `
  <p class="sub">Roller <b>komuta merkezi tanımlarından</b> oluşturulur ve modüle bağlanır. Aynı kullanıcı farklı outletlerde
  farklı rol alabilir (ör. bir outlette Şef Garson, diğerinde Garson).</p>
  <div class="bar">
    <div class="fld"><label class="f">Modül</label>${sel('rtMod', MOD_LIST.map(x=>({v:x.k,t:x.n})), m,'')}</div>
    <button class="btn pri" onclick="S.mod=document.getElementById('rtMod').value;render()">Getir</button>
    <span class="pill">${list.length} rol</span>
  </div>
  <div class="grid g2">
    <div class="card">
      <div class="ct">${esc(modOf(m).ic)} ${esc(modName(m))} · roller</div>
      <table class="t">
        <tr><th>Kod</th><th>Rol</th><th>Yetkiler</th><th>Atanan</th></tr>
        ${list.map(r=>`<tr><td class="mono">${r.k}</td><td><b>${esc(r.name)}</b></td>
          <td>${r.perms.map(p=>'<span class="tag">'+esc(p)+'</span>').join(' ')}</td>
          <td class="num">${OUTLET_TEAMS.filter(t=>t.roleK===r.k).length}</td></tr>`).join('')}
      </table>
    </div>
    <div class="card">
      <div class="ct">Rol tanımla / güncelle</div>
      <div class="row">
        <div class="fld"><label class="f">Rol adı</label><input id="nrName" placeholder="Örn. Teras Görevlisi"></div>
        <div class="fld"><label class="f">Modül</label><input value="${esc(modName(m))}" disabled></div>
      </div>
      <div class="fld"><label class="f">Yetkiler</label><div>${['görüntüleme','onay','düzeltme','rapor','atama','çıkış zorlama'].map(p=>'<span class="tag">'+p+'</span>').join(' ')}</div></div>
      <div class="row">
        <div class="fld"><label class="f">Giriş yaptığında varsayılan ekran</label>${sel('nrHome',[{v:'kat-plan',t:'Kat Planı'},{v:'siparis-kuyruk',t:'Sipariş Kuyruğu'},{v:'talep',t:'Talep Ekranı'},{v:'menu',t:'Menü Görünümü'}],'kat-plan','')}</div>
        <div class="fld"><label class="f">Maksimum online süre (dk)</label><input type="number" value="${m==='MINIBAR'?CFG.minibarMaxOnlineMin:CFG.qrMaxOnlineMin}"></div>
      </div>
      <button class="btn pri" onclick="addModRole()">Rolü Tanımla</button>
      <div class="note violet" style="margin-top:12px">Rolün <b>maksimum online süresi</b> ayrıca tanımlanabilir; boş bırakılırsa sistem geneli ayar geçerlidir (bkz. Oturum Ayarları).</div>
    </div>
  </div>`;
}
function addModRole(){
  const nm=document.getElementById('nrName').value.trim();
  if(!nm){ toast('Rol adı giriniz.'); return; }
  MOD_ROLES.push({k:'R'+(MOD_ROLES.length+1), mod:S.mod, name:nm, perms:['görüntüleme']});
  render(); toast('Rol tanımlandı: '+nm);
}

/* ================= 4) OUTLET EKİPLERİ & KULLANICI ATAMA ================= */
function nvEkipAta(){
  const m = S.mod || 'QR_ORDER';
  const outs = MOD_OUTLETS.filter(o=>o.mod===m && o.hotel===S.hotel);
  const sel1 = S.outletSel && outs.some(o=>o.id===S.outletSel) ? S.outletSel : (outs[0]||{}).id;
  S.outletSel = sel1;
  const team = OUTLET_TEAMS.filter(t=>t.outletId===sel1);
  const assignedIds = new Set(OUTLET_TEAMS.map(t=>t.userId));
  const available = REG_USERS.filter(u=>u.scopes.includes(S.hotel));
  const unassigned = REG_USERS.filter(u=>!assignedIds.has(u.id));
  return `
  <p class="sub">Komuta merkezinde <b>kayıtlı</b> sistem kullanıcıları, seçilen modülün <b>outletine veya minibar bölgesine</b> (merkez depo / kat bölgesi)
  <b>rol bazlı</b> atanarak outlet ekibi oluşturulur. Bir kullanıcı <b>birden fazla</b> outlette ve/veya bölgede görev alabilir;
  bu durumda girişten hemen sonra oturum açacağı <b>outlet veya minibar sistemi</b> seçimini <b>zorunlu</b> olarak yapar.
  Outlet tanımları <a href="#/otel-outlet">Tanımlar → Otel → Outlet Tanımla</a> ekranındadır.</p>
  <div class="bar">
    <div class="fld"><label class="f">Otel</label>${hotelSel('eaHotel', S.hotel)}</div>
    <div class="fld"><label class="f">Modül</label>${sel('eaMod', MOD_LIST.map(x=>({v:x.k,t:x.n})), m,'')}</div>
    <div class="fld"><label class="f">Outlet</label>${sel('eaOutlet', outs.map(o=>({v:o.id,t:o.name+' ('+o.id+')'})), sel1,'')}</div>
    <button class="btn pri" onclick="S.hotel=document.getElementById('eaHotel').value;S.mod=document.getElementById('eaMod').value;S.outletSel=document.getElementById('eaOutlet').value;render()">Getir</button>
  </div>
  <div class="grid g2">
    <div class="card">
      <div class="ct">${esc(moName(sel1))} · outlet ekibi <span class="tag">${team.length} kullanıcı</span></div>
      <table class="t">
        <tr><th>Kullanıcı</th><th>Rol</th><th>Diğer outletleri</th><th>Başlangıç</th><th>Durum</th><th></th></tr>
        ${team.map(t=>{
          const u=regUser(t.userId), others=teamsOfUser(t.userId).filter(x=>x.outletId!==t.outletId);
          const sess=ONLINE_SESSIONS.find(s=>s.userId===t.userId && s.outletId===t.outletId);
          return `<tr>
            <td><b>${esc(u.name)}</b><div class="mono muted">${esc(u.user)}${u.mfa?' · MFA':''}</div></td>
            <td>${esc((mroleByK(t.roleK)||{}).name)}<div class="mono muted">${t.roleK}</div></td>
            <td>${others.length?others.map(o=>'<span class="tag blue">'+esc(moName(o.outletId))+'</span>').join(' '):'<span class="muted">—</span>'}</td>
            <td class="mono">${esc(t.since)}</td>
            <td>${sess?osStatusTag(sess.status):'<span class="tag">çevrimdışı</span>'}</td>
            <td><button class="btn sm" onclick="removeTeam('${t.id}')">Kaldır</button></td></tr>`;
        }).join('') || '<tr><td colspan="6" class="muted">Bu outlette atanmış kullanıcı yok.</td></tr>'}
      </table>
      <div class="note ok" style="margin-top:12px"><b>Çoklu outlet kuralı:</b> birden fazla outlette kayıtlı kullanıcı (ör. <b>Deniz Yücel</b> → 4 outlet)
      girişte önce <b>otel</b>, sonra <b>outlet</b> seçer; seçtiği outletin rolüyle oturum açar.</div>
    </div>
    <div class="card">
      <div class="ct">Kullanıcı ata</div>
      <div class="row">
        <div class="fld"><label class="f">Kayıtlı kullanıcı</label>
          ${sel('eaUser', available.map(u=>({v:u.id,t:u.name+' — '+u.user+(outletsOfUser(u.id).length?' ('+outletsOfUser(u.id).length+' outlet)':'')})), '', '')}
        </div>
        <div class="fld"><label class="f">Modül rolü</label>
          ${sel('eaRole', MOD_ROLES.filter(r=>r.mod===m).map(r=>({v:r.k,t:r.name})), '', '')}
        </div>
      </div>
      <button class="btn pri" onclick="assignTeam()">Ekip Üyesi Ekle</button>
      <button class="btn" onclick="go('users')">Kullanıcı Yönetimine Git</button>
      <div class="rule"></div>
      <div class="ct">Atama bekleyen kullanıcılar <span class="tag warn">${unassigned.length}</span></div>
      <table class="t">
        <tr><th>Kullanıcı</th><th>Kapsam</th><th></th></tr>
        ${unassigned.map(u=>`<tr><td>${esc(u.name)}<div class="mono muted">${esc(u.user)}</div></td>
          <td>${u.scopes.map(h=>'<span class="tag">'+esc(HN(h))+'</span>').join(' ')}</td>
          <td><button class="btn sm" onclick="S.outletSel='${sel1}';document.getElementById('eaUser').value='${u.id}';toast('Kullanıcı seçildi — rol seçip ekleyin.')">Seç</button></td></tr>`).join('') || '<tr><td colspan="3" class="muted">Tüm kullanıcılar en az bir outlette görevli.</td></tr>'}
      </table>
      <div class="note warn" style="margin-top:12px">Atanmamış kullanıcı sisteme giriş yapabilir fakat <b>hiçbir modülde operational yetki görmez</b>;
      otel/outlet seçimi ekranı boş kalır.</div>
    </div>
  </div>`;
}
function assignTeam(){
  const uid=document.getElementById('eaUser').value, rk=document.getElementById('eaRole').value;
  if(!uid||!rk){ toast('Kullanıcı ve rol seçiniz.'); return; }
  if(OUTLET_TEAMS.some(t=>t.userId===uid && t.outletId===S.outletSel)){ toast('Bu kullanıcı zaten bu outlette görevli.'); return; }
  OUTLET_TEAMS.push({id:'T'+(OUTLET_TEAMS.length+1), userId:uid, outletId:S.outletSel, roleK:rk, since:'31.10.2026'});
  render(); toast('Ekip üyesi eklendi: '+regUser(uid).name+' → '+moName(S.outletSel));
}
function removeTeam(id){
  const i=OUTLET_TEAMS.findIndex(t=>t.id===id);
  if(i>=0) OUTLET_TEAMS.splice(i,1);
  render(); toast('Atama kaldırıldı.');
}

/* ================= 5) ONLINE KULLANICI TAKİP SİSTEMİ ================= */
function nvOnlineTakip(){
  const online = ONLINE_SESSIONS.filter(s=>s.status!=='CIKTI');
  const warn   = ONLINE_SESSIONS.filter(s=>s.status==='UYARI');
  const outed  = ONLINE_SESSIONS.filter(s=>s.status==='CIKTI');
  const maxMin = CFG.maxOnlineMin;
  const byHotel = ['H1','H2','H3'].map(h=>({
    h, list: online.filter(s=>s.hotel===h),
    outs: [...new Set(online.filter(s=>s.hotel===h).map(s=>s.outletId))]
  }));
  return `
  <p class="sub">Sisteme giriş yapan tüm kullanıcılar <b>otel ve outlet bazlı</b>, animasyonlu olarak izlenir. Kullanıcı kendi isteğiyle çıkış yapmazsa
  <b>maksimum online süre</b> aşıldığında sistem otomatik çıkış yaptırır ve kullanıcı çevrimdışı duruma alınır.
  <a href="oturum.html" target="_blank">Kullanıcı giriş / oturum akışı prototipini aç →</a></p>
  <div class="grid g5" style="margin-bottom:16px">
    <div class="card kpi ok"><div class="k">Çevrimiçi Kullanıcı</div><div class="v" id="os-online">${online.length}</div><div class="u">${ONLINE_SESSIONS.length} oturum kaydı</div></div>
    <div class="card kpi"><div class="k">İzlenen Otel</div><div class="v">${byHotel.filter(x=>x.list.length).length}</div><div class="u">outlet bazlı gruplama</div></div>
    <div class="card kpi gold"><div class="k">Maksimum Süre</div><div class="v" id="os-max">${maxMin}</div><div class="u">dakika · uyarı ${CFG.warnBeforeMin} dk önce</div></div>
    <div class="card kpi warn"><div class="k">Süre Uyarısı</div><div class="v" id="os-warn">${warn.length}</div><div class="u">otomatik çıkışa yakın</div></div>
    <div class="card kpi violet"><div class="k">Otomatik Çıkış</div><div class="v" id="os-out">${outed.length}</div><div class="u">süre aşımı · bugün</div></div>
  </div>
  <div class="grid g2" style="margin-bottom:16px">
    <div class="card">
      <div class="ct">Otel / outlet yoğunluğu <span class="live"></span></div>
      ${byHotel.map(x=>`<div style="margin-bottom:11px">
        <div style="display:flex;justify-content:space-between;font-size:12.6px">
          <b>${esc(HN(x.h))}</b><span class="tag ${x.list.length?'ok':''}">${x.list.length} online</span>
        </div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-top:6px">
          ${x.outs.length? x.outs.map(o=>{
            const c=x.list.filter(s=>s.outletId===o).length;
            return `<span class="tag blue">${esc(moName(o))} · ${c}</span>`;
          }).join('') : '<span class="muted" style="font-size:12px">çevrimiçi kullanıcı yok</span>'}
        </div>
        <div class="prog" style="margin-top:7px"><i style="width:${Math.min(100,x.list.length*18)}%;background:var(--blue)"></i></div>
      </div>`).join('')}
    </div>
    <div class="card">
      <div class="ct">Canlı aktivite akışı <span class="live"></span></div>
      <div id="os-log" style="font-size:11.6px;background:#0d2740;color:#cfe0ee;border-radius:8px;padding:10px;min-height:168px;font-family:Consolas,monospace">
        ${OS_LOG.map(l=>`<div>${esc(l.t)} · ${esc(l.x)}</div>`).join('')}
      </div>
      <div class="note blue" style="margin-top:11px">Akış; kat formu okutma, sipariş onayı, kişiselleştirme karşılama, fiş baskısı ve zimmet işlemlerini
      kullanıcı + otel + outlet bilgisiyle gösterir.</div>
    </div>
  </div>
  <div class="card">
    <div class="ct">Çevrimiçi oturumlar <span class="tag blue">oturum bazlı izleme</span></div>
    <table class="t">
      <tr><th>Kullanıcı</th><th>Otel</th><th>Seçtiği outlet</th><th>Rol (modül)</th><th>Giriş</th>
          <th class="num">Geçen</th><th style="width:150px">Kalan süre</th><th>Son işlem</th><th>Durum</th><th></th></tr>
      ${ONLINE_SESSIONS.map(s=>{
        const u=regUser(s.userId), r=mroleByK(s.roleK)||{}, remain=Math.max(0,(s.status==='CIKTI'?0:maxMin*60)-s.sec);
        const pc=Math.max(0,Math.min(100,100-(remain/(maxMin*60))*100));
        return `<tr data-sess="${s.id}">
          <td><b>${esc(u.name)}</b><div class="mono muted">${esc(u.user)}</div></td>
          <td>${esc(HN(s.hotel))}</td>
          <td>${esc(moName(s.outletId))}<div class="mono muted">${esc(modName((moById(s.outletId)||{}).mod))}</div></td>
          <td>${esc(r.name||'—')}</td>
          <td class="mono">${esc(s.login)}</td>
          <td class="num mono" data-el="${s.id}">${mmss(s.sec)}</td>
          <td><div class="prog"><i data-bar="${s.id}" style="width:${pc}%;background:${s.status==='UYARI'?'var(--warn)':s.status==='CIKTI'?'var(--err)':'var(--ok)'}"></i></div>
            <span class="mono" data-rem="${s.id}" style="font-size:10.6px">${s.status==='CIKTI'?'oturum kapandı':'kalan '+mmss(remain)}</span></td>
          <td class="muted">${esc(s.act)}</td>
          <td data-st="${s.id}">${osStatusTag(s.status)}${s.reason==='SURE_ASIMI'?'<div class="mono" style="font-size:10.4px">sebep: süre aşımı</div>':''}</td>
          <td>${s.status==='CIKTI'?'<button class="btn sm" onclick="toast(\'Prototip: kullanıcı yeniden giriş yaptığında bu satır yenilenir.\')">Bilgi</button>'
                :'<button class="btn sm" onclick="forceLogout(\''+s.id+'\')">Çıkış Yaptır</button>'}</td></tr>`;
      }).join('')}
    </table>
    <div class="grid g3" style="margin-top:14px">
      <div class="note warn" style="margin:0"><b>Süre aşımı kuralı:</b> ${CFG.autoLogout?'aktif':'kapalı'} — maksimum ${maxMin} dakika.
      Süre dolduğunda oturum kapatılır, kullanıcı çevrimdışı görünür ve yeniden giriş yapması istenir.</div>
      <div class="note" style="margin:0"><b>Uyarı:</b> süre bitmeden ${CFG.warnBeforeMin} dakika önce kullanıcının cihazına ve ekranına uyarı gönderilir.</div>
      <div class="note violet" style="margin:0"><b>Tek cihaz kuralı:</b> ${CFG.multiDevice?'kapalı':'açık'} — aynı kullanıcı tek cihazda online olabilir;
      yeni giriş yapılırsa eski oturum otomatik kapanır.</div>
    </div>
  </div>`;
}
function forceLogout(id){
  const s=ONLINE_SESSIONS.find(x=>x.id===id);
  if(s){ s.status='CIKTI'; s.reason='ZORUNLU'; s.act='Yönetici tarafından çıkış yaptırıldı'; }
  render(); toast('Kullanıcı çevrimdışı duruma alındı (zorunlu çıkış).');
}

/* ================= 6) OTURUM & SÜRE AYARLARI ================= */
function nvAyarlar(){
  return `
  <p class="sub">Komuta merkezi <b>Ayarlar</b> bölümü. Kullanıcı çıkış yapmayı unutursa sistem belirlenen süre sonunda otomatik çıkış yaptırır.</p>
  <div class="grid g2">
    <div class="card">
      <div class="ct">Oturum ve online süre kuralları</div>
      <div class="row">
        <div class="fld"><label class="f">Maksimum online süre (dk)</label><input id="cf1" type="number" value="${CFG.maxOnlineMin}"></div>
        <div class="fld"><label class="f">Süre bitmeden uyarı (dk)</label><input id="cf2" type="number" value="${CFG.warnBeforeMin}"></div>
      </div>
      <div class="row">
        <div class="fld"><label class="f">Hareketsizlik sonrası çıkış (dk)</label><input id="cf3" type="number" value="${CFG.idleLogoutMin}"></div>
        <div class="fld"><label class="f">Vardiya sonunda çıkış</label>${sel('cf4',[{v:'1',t:'Açık'},{v:'0',t:'Kapalı'}], CFG.forceLogoutAtShiftEnd?'1':'0','')}</div>
      </div>
      <div class="row">
        <div class="fld"><label class="f">Süre aşımında otomatik çıkış</label>${sel('cf5',[{v:'1',t:'Açık'},{v:'0',t:'Kapalı'}], CFG.autoLogout?'1':'0','')}</div>
        <div class="fld"><label class="f">Aynı kullanıcı birden fazla cihaz</label>${sel('cf6',[{v:'0',t:'Kapalı (tek cihaz)'},{v:'1',t:'Açık'}], CFG.multiDevice?'1':'0','')}</div>
      </div>
      <h4>Giriş akışı</h4>
      <div class="row">
        <div class="fld"><label class="f">Girişten hemen sonra outlet seçimi</label>${sel('cf7',[{v:'1',t:'Zorunlu'},{v:'0',t:'Tek atamada otomatik'}], '1','')}</div>
        <div class="fld"><label class="f">Tek hedefi olan kullanıcı</label>${sel('cf8',[{v:'0',t:'Yine seçim ekranı göster'},{v:'1',t:'Otomatik aç'}], CFG.singleOutletAuto?'1':'0','')}</div>
      </div>
      <button class="btn pri" onclick="saveCfg()">Ayarları Kaydet</button>
      <button class="btn" onclick="toast('Prototip: ayar geçmişi denetim günlüğüne işlendi')">Değişiklik Geçmişi</button>
    </div>
    <div class="card">
      <div class="ct">Modül bazlı süre farklılaştırması</div>
      <table class="t">
        <tr><th>Modül</th><th class="num">Maks. online süre (dk)</th><th>Not</th></tr>
        <tr><td>${modOf('MINIBAR').ic} Minibar Takip</td><td class="num">${CFG.minibarMaxOnlineMin}</td><td>Kat sorumlusu vardiya boyunca online (8–10 saat)</td></tr>
        <tr><td>${modOf('QR_MENU').ic} QR Menü</td><td class="num">${CFG.qrMaxOnlineMin}</td><td>Outlet görevlisi standart vardiya</td></tr>
        <tr><td>${modOf('QR_ORDER').ic} QR Sipariş</td><td class="num">${CFG.qrMaxOnlineMin}</td><td>Garson vardiyası; vardiya sonunda zorunlu çıkış</td></tr>
        <tr><td>${modOf('QR_ROOM_SERVICE').ic} QR Oda Servisi</td><td class="num">${CFG.qrMaxOnlineMin}</td><td>Gece vardiyası ayrı tanımlanabilir</td></tr>
      </table>
      <div class="note gold" style="margin-top:12px"><b>Kural:</b> modül veya rol bazlı süre tanımlanmışsa o değer geçerlidir; tanımlanmamışsa
      yukarıdaki sistem geneli süre uygulanır.</div>
      <div class="rule"></div>
      <div class="ct">Bildirim kuralları</div>
      <ul class="ck">
        <li>Süre bitmeden ${CFG.warnBeforeMin} dk önce cihaz ve ekran uyarısı.</li>
        <li>Süre aşımında otomatik çıkış + yönetici ekranında "otomatik çıkış" kaydı.</li>
        <li>Zorunlu çıkış yetkisi: Sistem Yöneticisi, Otel Müdürü, Şef Garson.</li>
        <li>Oturum hareketleri denetim günlüğünde saklanır (giriş, çıkış, sebep, cihaz).</li>
      </ul>
    </div>
  </div>`;
}
function saveCfg(){
  CFG.maxOnlineMin = parseInt(document.getElementById('cf1').value,10)||480;
  CFG.warnBeforeMin = parseInt(document.getElementById('cf2').value,10)||60;
  CFG.idleLogoutMin = parseInt(document.getElementById('cf3').value,10)||45;
  CFG.autoLogout = document.getElementById('cf5').value==='1';
  CFG.multiDevice = document.getElementById('cf6').value==='1';
  CFG.hotelFirst = document.getElementById('cf7').value==='1';
  CFG.singleOutletAuto = document.getElementById('cf8').value==='1';
  CFG.forceLogoutAtShiftEnd = document.getElementById('cf4').value==='1';
  render(); toast('Ayarlar kaydedildi — maksimum online süre '+CFG.maxOnlineMin+' dk.');
}

/* ================= kayıt ve canlı döngü ================= */
Object.assign(VIEWS, {
  'mod-giris':nvModGiris, 'qrm-outlet-mod':nvOutletMod, 'rol-tanim':nvRolTanim,
  'ekip-ata':nvEkipAta, 'online-takip':nvOnlineTakip, 'ayarlar':nvAyarlar
});
NAV.push({grp:'MERKEZİ YÖNETİM · MODÜL & OTURUM'});
NAV.push({v:'mod-giris',      t:'Modül Girişi (Otel → Modül)', ic:'🏛'});
NAV.push({v:'qrm-outlet-mod', t:'Modül Bazlı Outletler',      ic:'🧩'});
NAV.push({v:'rol-tanim',      t:'Rol Tanımları (Modül Bazlı)',ic:'🎭'});
NAV.push({v:'ekip-ata',       t:'Outlet Ekipleri & Kullanıcı Atama', ic:'👥'});
NAV.push({v:'online-takip',   t:'Kullanıcı Takip Sistemi (Online)', ic:'📡', n:'canlı'});
NAV.push({v:'ayarlar',        t:'Oturum & Süre Ayarları',     ic:'⏱'});
S.mod = S.mod || 'QR_MENU';
S.outletSel = S.outletSel || 'MO5';
buildNav();

/* canlı döngü: oturum süreleri ilerler, ekran açıksa DOM güncellenir */
setInterval(function(){
  const maxSec = CFG.maxOnlineMin*60, warnSec = CFG.warnBeforeMin*60;
  ONLINE_SESSIONS.forEach(function(s){
    if(s.status==='CIKTI') return;
    s.sec += 1;
    const remain = maxSec - s.sec;
    if(remain <= warnSec && s.status==='ONLINE'){
      s.status='UYARI';
      OS_LOG.unshift({t:new Date().toTimeString().slice(0,5), x:regUser(s.userId).user+' · süre uyarısı gönderildi ('+Math.round(remain/60)+' dk kaldı)'});
    }
    if(remain <= 0){
      s.status='CIKTI'; s.reason='SURE_ASIMI';
      s.act='Maksimum online süre aşıldı · otomatik çıkış';
      OS_LOG.unshift({t:new Date().toTimeString().slice(0,5), x:regUser(s.userId).user+' · süre aşımı, oturum otomatik kapatıldı'});
    }
  });
  if(current()!=='online-takip') return;
  /* canlı aktivite akışına yeni satır */
  osSeq++;
  if(osSeq % 3 === 0){
    const log=document.getElementById('os-log');
    const act=ONLINE_SESSIONS.filter(x=>x.status!=='CIKTI');
    if(log && act.length){
      const s=act[osSeq % act.length];
      const tpl=osTpl[osSeq % osTpl.length]
        .replace('{r}', 100+((osSeq*7)%400))
        .replace('{o}','SP-'+(5580+osSeq));
      const d=document.createElement('div');
      d.textContent=new Date().toTimeString().slice(0,5)+' · '+regUser(s.userId).user+' · '+moName(s.outletId)+' · '+tpl;
      log.prepend(d); while(log.children.length>9) log.lastChild.remove();
    }
  }
  /* satır içi süre güncellemeleri */
  const online=ONLINE_SESSIONS.filter(x=>x.status!=='CIKTI').length;
  const warn=ONLINE_SESSIONS.filter(x=>x.status==='UYARI').length;
  const outed=ONLINE_SESSIONS.filter(x=>x.status==='CIKTI').length;
  const setTxt=function(id,v){ const e=document.getElementById(id); if(e) e.textContent=v; };
  setTxt('os-online',online); setTxt('os-warn',warn); setTxt('os-out',outed);
  ONLINE_SESSIONS.forEach(function(s){
    const remain=Math.max(0,maxSec-s.sec);
    const el=document.querySelector('[data-el="'+s.id+'"]'); if(el) el.textContent=mmss(s.sec);
    const rm=document.querySelector('[data-rem="'+s.id+'"]');
    if(rm) rm.textContent = s.status==='CIKTI' ? 'oturum kapandı' : 'kalan '+mmss(remain);
    const bar=document.querySelector('[data-bar="'+s.id+'"]');
    if(bar){ bar.style.width=Math.max(0,Math.min(100,100-(remain/maxSec)*100))+'%';
      bar.style.background = s.status==='CIKTI' ? 'var(--err)' : (s.status==='UYARI'?'var(--warn)':'var(--ok)'); }
  });
}, 1000);

render();
