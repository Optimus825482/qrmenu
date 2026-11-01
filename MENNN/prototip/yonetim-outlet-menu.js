/* ============================================================================
   MENNN · Outlet modül ataması ve outlete özel menü
   QR Menü (opsiyonel fiyatlı) ve QR Sipariş (opsiyonel fiyatlı) bir outlete
   atanır. Seçilen outlet için kategori → alt kategori → grup → öğe tanımlanır.
   Görsel, detay, alerjen ve fiyat kaydı her seviyeye girilebilir.
   Fiyat gösterimi outlet bazında kapalı başlar: tutar durur, ekranda gizlenir.
   Gösterim açık QR Sipariş outletlerinde adisyon satır toplamı basılır ve yazdırılır.
   ========================================================================= */

(function(){
  const KINDN = {KAT:'Kategori', ALT:'Alt kategori', GRUP:'Grup', OGE:'Öğe'};
  const KINDL = {KAT:'l1', ALT:'l2', GRUP:'l3', OGE:'l4'};
  const ALGS = ['gluten','süt','yumurta','kuruyemiş','deniz ürünü','alkol'];

  MOD_OUTLETS.forEach(function(o){
    if(o.mod!=='QR_MENU' && o.mod!=='QR_ORDER') return;
    if(typeof o.priceShow!=='boolean') o.priceShow = (o.id==='MO5' || o.id==='MO3');
  });
  if(!MOD_OUTLETS.some(function(o){ return o.id==='MO15'; })){
    MOD_OUTLETS.push({id:'MO15', mod:'QR_ORDER', hotel:'H2', name:'Diamond Infinity Pool', priceShow:true,
      meta:'istasyon: Infinity Pool · yazıcı: ESC/POS · fiyat gösterimi: açık'});
  }

  let OM_SEQ = 40;
  const OM_NODES = [
    {id:'N1', outletId:'MO1', parent:null, kind:'KAT',  name:'Soğuk İçecekler', detail:'Havuz serinleticileri, buzlu servis', allergens:[], price:null, img:'', imgName:''},
    {id:'N2', outletId:'MO1', parent:'N1', kind:'ALT', name:'Kokteyller', detail:'İmza ve klasik bardaklar', allergens:[], price:null, img:'', imgName:''},
    {id:'N3', outletId:'MO1', parent:'N2', kind:'GRUP', name:'İmza', detail:'Otele özel tarifler', allergens:[], price:null, img:'', imgName:''},
    {id:'N4', outletId:'MO1', parent:'N3', kind:'OGE', name:'Royal Akik', detail:'Böğürtlen, nane, limon', allergens:[], price:240, img:'', imgName:''},
    {id:'N5', outletId:'MO1', parent:'N3', kind:'OGE', name:'Zephyros Cooler', detail:'Salatalık, tonik, misket limonu', allergens:[], price:180, img:'', imgName:''},
    {id:'N6', outletId:'MO1', parent:'N1', kind:'ALT', name:'Alkolsüz', detail:'Serinletici grup', allergens:[], price:null, img:'', imgName:''},
    {id:'N7', outletId:'MO1', parent:'N6', kind:'GRUP', name:'Serinletici', detail:'Buzlu kahve ve soğuk demleme', allergens:[], price:null, img:'', imgName:''},
    {id:'N8', outletId:'MO1', parent:'N7', kind:'OGE', name:'Buzlu Türk Kahvesi', detail:'Soğuk demleme', allergens:['süt'], price:160, img:'', imgName:''},
    {id:'N9', outletId:'MO1', parent:null, kind:'KAT', name:'Atıştırmalık', detail:'Havuz atıştırmalıkları', allergens:[], price:null, img:'', imgName:''},
    {id:'N10',outletId:'MO1', parent:'N9', kind:'ALT', name:'Sıcak', detail:'Izgara grup', allergens:[], price:null, img:'', imgName:''},
    {id:'N11',outletId:'MO1', parent:'N10', kind:'GRUP', name:'Izgara', detail:'Dana ve tavuk', allergens:['gluten'], price:null, img:'', imgName:''},
    {id:'N12',outletId:'MO1', parent:'N11', kind:'OGE', name:'Mini Burger Tabağı', detail:'Dana köfte, cheddar, brioche', allergens:['gluten','süt'], price:320, img:'', imgName:''},

    {id:'N20',outletId:'MO5', parent:null, kind:'KAT', name:'Soğuk İçecekler', detail:'Havuz bar istasyonu', allergens:[], price:null, img:'', imgName:''},
    {id:'N21',outletId:'MO5', parent:'N20', kind:'ALT', name:'Kokteyller', detail:'Bardak servis', allergens:[], price:null, img:'', imgName:''},
    {id:'N22',outletId:'MO5', parent:'N21', kind:'GRUP', name:'İmza', detail:'Serinletici grup', allergens:[], price:null, img:'', imgName:''},
    {id:'N23',outletId:'MO5', parent:'N22', kind:'OGE', name:'Zephyros Cooler', detail:'Salatalık, tonik, misket limonu', allergens:[], price:180, img:'', imgName:''},
    {id:'N24',outletId:'MO5', parent:null, kind:'KAT', name:'Atıştırmalık', detail:'Havuz meze', allergens:[], price:null, img:'', imgName:''},
    {id:'N25',outletId:'MO5', parent:'N24', kind:'ALT', name:'Soğuk', detail:'Soğuk servis', allergens:[], price:null, img:'', imgName:''},
    {id:'N26',outletId:'MO5', parent:'N25', kind:'GRUP', name:'Meze', detail:'Peynir ve meyve', allergens:['süt'], price:null, img:'', imgName:''},
    {id:'N27',outletId:'MO5', parent:'N26', kind:'OGE', name:'Karpuz & Beyaz Peynir', detail:'Nane yağı, soğuk servis', allergens:['süt'], price:220, img:'', imgName:''},

    {id:'N30',outletId:'MO6', parent:null, kind:'KAT', name:'Bar', detail:'Piano bar', allergens:[], price:null, img:'', imgName:''},
    {id:'N31',outletId:'MO6', parent:'N30', kind:'ALT', name:'Klasik', detail:'Kadeh servis', allergens:[], price:null, img:'', imgName:''},
    {id:'N32',outletId:'MO6', parent:'N31', kind:'GRUP', name:'Martini', detail:'Kuru ve tatlı', allergens:[], price:null, img:'', imgName:''},
    {id:'N33',outletId:'MO6', parent:'N32', kind:'OGE', name:'Martini', detail:'Klasik servis', allergens:['alkol'], price:260, img:'', imgName:''}
  ];

  const BILLS = [
    {id:'SP-5521', hotel:'H1', outletId:'MO5', table:'Ş-14', when:'11:42', status:'GARSON_ONAYI',
     lines:[{n:'Zephyros Cooler', q:2, p:180},{n:'Karpuz & Beyaz Peynir', q:1, p:220}]},
    {id:'SP-5522', hotel:'H1', outletId:'MO6', table:'M-06', when:'11:44', status:'GARSON_ONAYI',
     lines:[{n:'Martini', q:2, p:260}]},
    {id:'SP-5524', hotel:'H2', outletId:'MO15', table:'Ş-08', when:'11:38', status:'SERVIS_EDILDI',
     lines:[{n:'Şampanya 375', q:1, p:890},{n:'Kuruyemiş', q:1, p:140}]}
  ];

  S.omOutlet = S.omOutlet || 'MO1';
  S.omImg = null;
  S.omImgName = '';

  function eur(n){
    return Number(n).toLocaleString('tr-TR', {minimumFractionDigits:2, maximumFractionDigits:2})+' EUR';
  }
  function billSum(b){ return b.lines.reduce(function(a,l){ return a + l.q * l.p; }, 0); }
  function omBy(id){ return MOD_OUTLETS.find(function(o){ return o.id===id; }); }
  function eligible(){
    return MOD_OUTLETS.filter(function(o){
      return o.hotel===S.hotel && (o.mod==='QR_MENU' || o.mod==='QR_ORDER');
    });
  }
  function currentOutlet(){
    const list = eligible();
    let o = omBy(S.omOutlet);
    if(!o || o.hotel!==S.hotel || (o.mod!=='QR_MENU' && o.mod!=='QR_ORDER')) o = list[0] || null;
    S.omOutlet = o ? o.id : null;
    return o;
  }
  function kids(outletId, parent){
    return OM_NODES.filter(function(n){ return n.outletId===outletId && n.parent===parent; });
  }
  function priceTag(show){
    return show
      ? '<span class="tag ok">fiyat gösterimi açık</span>'
      : '<span class="tag gold">fiyat kayıtlı · gösterim kapalı</span>';
  }

  function omParentField(kind){
    const o = currentOutlet();
    if(!o) return '<input value="Önce outlet seçin" disabled>';
    if(kind==='KAT') return '<input value="Köke eklenir (kategori)" disabled>';
    const need = kind==='ALT' ? 'KAT' : kind==='GRUP' ? 'ALT' : 'GRUP';
    const parents = OM_NODES.filter(function(n){ return n.outletId===o.id && n.kind===need; });
    if(!parents.length) return '<input value="Önce '+KINDN[need]+' tanımlayın" disabled>';
    return sel('omParent', parents.map(function(p){ return {v:p.id, t:p.name}; }), parents[0].id, '');
  }

  window.omKindChange = function(k){
    const box = document.getElementById('omParentBox');
    if(box) box.innerHTML = omParentField(k);
  };
  window.omPickImg = function(inp){
    const f = inp.files && inp.files[0];
    const lbl = document.getElementById('omImgLbl');
    if(!f){ S.omImg=null; S.omImgName=''; if(lbl) lbl.textContent='görsel seçilmedi'; return; }
    if(!/^image\//.test(f.type)){ toast('Yalnızca görsel dosyası yüklenir.'); inp.value=''; return; }
    const r = new FileReader();
    r.onload = function(){
      S.omImg = r.result;
      S.omImgName = f.name;
      if(lbl) lbl.textContent = f.name;
    };
    r.readAsDataURL(f);
  };
  window.omTogglePrice = function(id){
    const o = omBy(id);
    if(!o) return;
    o.priceShow = !o.priceShow;
    render();
    toast(o.priceShow
      ? 'Fiyat gösterimi açıldı. Menüde ve adisyonda tutarlar görünür.'
      : 'Fiyat gösterimi kapatıldı. Kayıtlı tutarlar durur, ekranda gizlenir.');
  };
  window.omPick = function(id){
    S.omOutlet = id;
    S.omImg = null;
    S.omImgName = '';
    render();
  };
  window.omAssign = function(){
    const base = OUTLETS.find(function(o){ return o.id===document.getElementById('omBase').value; });
    const mod = document.getElementById('omMod').value;
    const show = document.getElementById('omShow').value==='1';
    if(!base){ toast('Outlet seçiniz.'); return; }
    if(MOD_OUTLETS.some(function(o){ return o.hotel===base.hotel && o.mod===mod && o.name===base.name; })){
      toast('Bu outlete bu modül zaten atanmış.');
      return;
    }
    const id = 'MO'+(MOD_OUTLETS.length+1);
    MOD_OUTLETS.push({
      id:id, mod:mod, hotel:base.hotel, name:base.name, priceShow:show, placeId:base.id,
      meta:(mod==='QR_MENU'?'QR Menü menüsü':'QR Sipariş menüsü')+' · fiyat gösterimi: '+(show?'açık':'kapalı')
    });
    S.hotel = base.hotel;
    S.omOutlet = id;
    buildNav();
    render();
    toast((mod==='QR_MENU'?'QR Menü':'QR Sipariş')+' atandı: '+base.name);
  };
  window.omAdd = function(){
    const o = currentOutlet();
    if(!o){ toast('Önce QR Menü veya QR Sipariş atanmış bir outlet seçin.'); return; }
    const kind = document.getElementById('omKind').value;
    const name = document.getElementById('omName').value.trim();
    const detail = document.getElementById('omDetail').value.trim();
    const priceRaw = document.getElementById('omPriceVal').value.trim();
    if(!name){ toast('Ad giriniz.'); return; }
    let parent = null;
    if(kind!=='KAT'){
      const p = document.getElementById('omParent');
      if(!p || p.disabled || !p.value){ toast('Önce üst seviyeyi tanımlayıp seçin.'); return; }
      parent = p.value;
    }
    let price = null;
    if(priceRaw!==''){
      const n = Number(String(priceRaw).replace(',','.'));
      if(!isFinite(n) || n<0){ toast('Fiyat sıfır ya da pozitif bir sayı olmalı.'); return; }
      price = Math.round(n*100)/100;
    }
    const allergens = Array.prototype.map.call(
      document.querySelectorAll('input[name=omAlg]:checked'),
      function(x){ return x.value; }
    );
    OM_NODES.push({
      id:'N'+(++OM_SEQ), outletId:o.id, parent:parent, kind:kind, name:name, detail:detail,
      allergens:allergens, price:price, img:S.omImg||'', imgName:S.omImgName||''
    });
    S.omImg = null;
    S.omImgName = '';
    render();
    toast(KINDN[kind]+' eklendi: '+name);
  };
  window.omDelete = function(id){
    const drop = {};
    (function walk(pid){
      drop[pid] = true;
      OM_NODES.filter(function(n){ return n.parent===pid; }).forEach(function(n){ walk(n.id); });
    })(id);
    for(let i=OM_NODES.length-1; i>=0; i--) if(drop[OM_NODES[i].id]) OM_NODES.splice(i,1);
    render();
    toast('Kayıt ve altındaki seviye silindi.');
  };

  function branch(outletId, parent, show){
    return kids(outletId, parent).map(function(n){
      const alg = n.allergens.length
        ? n.allergens.map(function(a){ return '<span class="tag err">'+esc(a)+'</span>'; }).join(' ')
        : '<span class="tag">alerjen yok</span>';
      const img = n.img
        ? '<img alt="" src="'+n.img+'" style="width:34px;height:34px;object-fit:cover;border-radius:6px">'
        : '<span class="tag warn">görsel yok</span>';
      const money = n.price==null
        ? '<span class="muted">fiyat girilmedi</span>'
        : '<b>'+eur(n.price)+'</b> '+(show?'<span class="tag ok">gösterimde</span>':'<span class="tag gold">gizli</span>');
      return '<div class="'+KINDL[n.kind]+'">'+
        '<span>'+(n.kind==='KAT'?'📂':n.kind==='ALT'?'📁':n.kind==='GRUP'?'🏷':'🍽')+'</span>'+
        '<b>'+esc(n.name)+'</b> <span class="tag">'+KINDN[n.kind]+'</span> '+img+
        '<span class="muted">'+esc(n.detail||'detay yok')+'</span> '+alg+' '+money+
        '<button class="btn sm" onclick="omDelete(\''+n.id+'\')">Sil</button></div>'+
        branch(outletId, n.id, show);
    }).join('');
  }

  function nvOutletMenu(){
    const o = currentOutlet();
    const list = eligible();
    const places = OUTLETS.filter(function(x){ return x.hotel===S.hotel; });
    const show = !!(o && o.priceShow);
    return `
    <p class="sub">Outlet tanımının altına <b>QR Menü</b> ve <b>QR Sipariş</b> modülü ayrıca atanır. Atanan modül seçilince o outlete özel
    kategori, alt kategori ve grup menüsü tanımlanır. Görsel, detay, alerjen ve fiyat kaydı girilir.
    Fiyat gösterimi kapalıyken tutar durur ama menüde ve adisyonda basılmaz; istendiğinde aynı outlet için açılır.</p>
    <div class="bar">
      <div class="fld"><label class="f">Otel</label>${hotelSel('omHotel', S.hotel)}</div>
      <button class="btn pri" onclick="S.hotel=document.getElementById('omHotel').value;S.omOutlet=null;render()">Outletleri getir</button>
      <span class="pill">${list.length} QR Menü / QR Sipariş ataması</span>
    </div>
    <div class="card" style="margin-bottom:16px">
      <div class="ct">${esc(HN(S.hotel))} · modül atamaları <span class="tag blue">opsiyonel fiyat</span></div>
      <table class="t">
        <tr><th>Kod</th><th>Outlet</th><th>Modül</th><th>Fiyat kaydı</th><th>Gösterim</th><th></th></tr>
        ${list.map(function(x){
          const priced = OM_NODES.some(function(n){ return n.outletId===x.id && n.price!=null; });
          return '<tr style="'+(S.omOutlet===x.id?'background:#f2f8fd':'')+'">'+
            '<td class="mono">'+x.id+'</td><td><b>'+esc(x.name)+'</b></td>'+
            '<td><span class="tag blue">'+esc(modName(x.mod))+'</span></td>'+
            '<td>'+(priced?'<span class="tag ok">fiyat kayıtlı</span>':'<span class="muted">fiyat yok</span>')+'</td>'+
            '<td>'+priceTag(x.priceShow)+'</td>'+
            '<td><button class="btn sm" onclick="omPick(\''+x.id+'\')">Menü</button> '+
            '<button class="btn sm" onclick="omTogglePrice(\''+x.id+'\')">'+(x.priceShow?'Gösterimi kapat':'Gösterimi aç')+'</button></td></tr>';
        }).join('') || '<tr><td colspan="6" class="muted">Bu otelde QR Menü veya QR Sipariş ataması yok.</td></tr>'}
      </table>
    </div>
    <div class="grid g2">
      <div class="card">
        <div class="ct">Outlete modül ata</div>
        <div class="row">
          <div class="fld"><label class="f">Outlet</label>${sel('omBase', places.map(function(p){ return {v:p.id, t:p.name}; }), places[0]?places[0].id:'', '')}</div>
          <div class="fld"><label class="f">Modül</label>${sel('omMod', [{v:'QR_MENU',t:'QR Menü (opsiyonel fiyatlı)'},{v:'QR_ORDER',t:'QR Sipariş (opsiyonel fiyatlı)'}], 'QR_MENU', '')}</div>
        </div>
        <div class="fld"><label class="f">Fiyat gösterimi</label>${sel('omShow', [{v:'0',t:'Kapalı (tutar kaydedilir, gizlenir)'},{v:'1',t:'Açık (menü ve adisyonda görünür)'}], '0', '')}</div>
        <button class="btn pri" onclick="omAssign()">Modülü Ata</button>
        <div class="note" style="margin-top:12px">Aynı mekân iki modülde ayrı menü taşır. Gösterim kapalı olsa da fiyat alanı dolu kaydedilir.</div>
      </div>
      <div class="card">
        <div class="ct">${o?esc(o.name)+' · '+esc(modName(o.mod)):'Menü kaydı'} ${o?priceTag(show):''}</div>
        ${o?`
        <div class="row">
          <div class="fld"><label class="f">Seviye</label>${sel('omKind', [{v:'KAT',t:'Kategori'},{v:'ALT',t:'Alt kategori'},{v:'GRUP',t:'Grup'},{v:'OGE',t:'Öğe'}], 'KAT', '')}</div>
          <div class="fld"><label class="f">Bağlanacağı üst kayıt</label><div id="omParentBox">${omParentField('KAT')}</div></div>
        </div>
        <div class="row">
          <div class="fld"><label class="f">Ad</label><input id="omName" placeholder="Örn. Soğuk İçecekler"></div>
          <div class="fld"><label class="f">Fiyat (opsiyonel, EUR)</label><input id="omPriceVal" inputmode="decimal" placeholder="Boş bırakılabilir"></div>
        </div>
        <div class="fld"><label class="f">Detay bilgisi</label><input id="omDetail" placeholder="Kısa açıklama, servis notu, içindekiler"></div>
        <div class="fld"><label class="f">Alerjen</label>
          <div>${ALGS.map(function(a){ return '<label style="margin-right:10px;font-size:12.2px"><input type="checkbox" name="omAlg" value="'+a+'"> '+a+'</label>'; }).join('')}</div>
        </div>
        <div class="fld"><label class="f">Görsel</label>
          <input type="file" accept="image/*" onchange="omPickImg(this)">
          <span id="omImgLbl" class="muted">görsel seçilmedi</span>
        </div>
        <button class="btn pri" onclick="omAdd()">Menüye Kaydet</button>`
        :'<div class="note warn">Bu otelde atanmış QR Menü veya QR Sipariş outleti yok.</div>'}
      </div>
    </div>
    <div class="card" style="margin-top:16px">
      <div class="ct">Outlete özel menü ağacı ${o?'<span class="tag">'+esc(o.name)+'</span>':''}</div>
      <div class="tree">${o? (branch(o.id, null, show) || '<div class="muted">Henüz kategori yok.</div>') : ''}</div>
      <div class="note blue" style="margin-top:12px">Yönetici her zaman kayıtlı tutarı görür. Misafir ve adisyon, gösterim kapalıyken bu tutarı basmaz.
      ${o && o.mod==='QR_ORDER' ? ' Bu outlet QR Sipariş: gösterim açıksa <a href="#/qrs-adisyon">adisyon ekranında</a> toplam yazdırılır.' : ''}</div>
    </div>`;
  }

  function billCard(b){
    const o = omBy(b.outletId);
    const show = !!(o && o.mod==='QR_ORDER' && o.priceShow);
    const sum = billSum(b);
    return `<div class="card">
      <div class="ct">${esc(b.id)} ${show?'<span class="tag ok">fiyatlı adisyon</span>':'<span class="tag gold">tutarsız adisyon</span>'}</div>
      <div class="mono" style="font-size:11.4px;margin-bottom:8px">${o?esc(o.name):'—'} · ${esc(b.table)} · ${esc(b.when)} · ${esc(HN(b.hotel))}</div>
      <table class="t">
        <tr><th>Ürün</th><th class="num">Adet</th>${show?'<th class="num">Birim</th><th class="num">Tutar</th>':''}</tr>
        ${b.lines.map(function(l){
          return '<tr><td>'+esc(l.n)+'</td><td class="num">'+l.q+'</td>'+
            (show?'<td class="num">'+eur(l.p)+'</td><td class="num"><b>'+eur(l.q*l.p)+'</b></td>':'')+'</tr>';
        }).join('')}
        ${show?'<tr><td colspan="3"><b>Genel toplam</b></td><td class="num"><b>'+eur(sum)+'</b></td></tr>':
               '<tr><td colspan="2" class="muted">Fiyat gösterimi kapalı. Tutarlar kayıtlı, adisyona basılmıyor.</td></tr>'}
      </table>
      ${show
        ? '<button class="btn pri" style="margin-top:10px" onclick="printBill(\''+b.id+'\')">Adisyon Yazdır</button>'
        : '<button class="btn" style="margin-top:10px" disabled>Yazdırma tutar için gösterim açık olmalı</button>'}
    </div>`;
  }

  function nvAdisyon(){
    const rows = BILLS.filter(function(b){ return b.hotel===S.hotel; });
    return `
    <div class="note gold"><b>Kural:</b> fiyat gösterimi açık olan QR Sipariş (ve fiyatlı menü) outletlerinde kayıtlı siparişin adisyonunda
    satır tutarları ve genel toplam görünür; aynı fiş yazdırılır. Gösterim kapalıysa adisyon yalnızca ürün ve adetle çıkar. Ödeme alınmaz, kasaya tutar işlenmez.</div>
    <div class="bar">
      <div class="fld"><label class="f">Otel</label>${hotelSel('adHotel', S.hotel)}</div>
      <button class="btn pri" onclick="S.hotel=document.getElementById('adHotel').value;render()">Getir</button>
      <a class="btn" href="#/outlet-menu">Fiyat gösterimini yönet</a>
    </div>
    <div class="grid g2">${rows.map(billCard).join('') || '<div class="card muted">Bu otelde kayıtlı sipariş adisyonu yok.</div>'}</div>`;
  }

  window.printBill = function(id){
    const b = BILLS.find(function(x){ return x.id===id; });
    const o = b && omBy(b.outletId);
    if(!b || !o || o.mod!=='QR_ORDER' || !o.priceShow){
      toast('Bu outlette fiyat gösterimi kapalı. Tutarlı adisyon basılmaz.');
      return;
    }
    const sum = billSum(b);
    const sheet = document.getElementById('adisyonKagit');
    sheet.innerHTML =
      '<div style="font-family:Segoe UI,Tahoma,sans-serif;width:72mm;color:#111;padding:8px">'+
      '<div style="text-align:center;font-weight:700;letter-spacing:.08em">MENNN · ADİSYON</div>'+
      '<div style="text-align:center;font-size:12px;margin:4px 0 8px">'+esc(HN(b.hotel))+'<br>'+esc(o.name)+'</div>'+
      '<div style="font-size:12px">Fiş '+esc(b.id)+' · Masa '+esc(b.table)+'<br>Saat '+esc(b.when)+'</div>'+
      '<hr>'+
      b.lines.map(function(l){
        return '<div style="display:flex;justify-content:space-between;font-size:12.5px;margin:4px 0"><span>'+l.q+' × '+esc(l.n)+'</span><span>'+eur(l.q*l.p)+'</span></div>';
      }).join('')+
      '<hr><div style="display:flex;justify-content:space-between;font-weight:700"><span>TOPLAM</span><span>'+eur(sum)+'</span></div>'+
      '<div style="text-align:center;font-size:11px;margin-top:10px">Gösterim tutarıdır. Bu fiş ödeme belgesi değildir.</div></div>';
    document.body.classList.add('adisyon-bas');
    window.print();
  };

  const css = document.createElement('style');
  css.textContent = '#adisyonKagit{display:none}body.adisyon-bas #adisyonKagit{display:block}'+
    '@media print{body.adisyon-bas .app{display:none!important}body.adisyon-bas #adisyonKagit{display:block!important}}'+
    '#omKind{ }';
  document.head.appendChild(css);
  const sheet = document.createElement('div');
  sheet.id = 'adisyonKagit';
  document.body.appendChild(sheet);
  window.addEventListener('afterprint', function(){ document.body.classList.remove('adisyon-bas'); });

  document.addEventListener('change', function(ev){
    if(ev.target && ev.target.id==='omKind') omKindChange(ev.target.value);
  });

  Object.assign(VIEWS, {'outlet-menu':nvOutletMenu, 'qrs-adisyon':nvAdisyon});
  if(!NAV.some(function(x){ return x.v==='outlet-menu'; })) NAV.push({v:'outlet-menu', t:'Outlet Menüsü · Modül & Fiyat'});
  if(!NAV.some(function(x){ return x.v==='qrs-adisyon'; })) NAV.push({v:'qrs-adisyon', t:'Adisyon & Fiyat Toplamı'});

  if(VIEWS['qrs-queue']){
    const origQ = VIEWS['qrs-queue'];
    VIEWS['qrs-queue'] = function(){
      const mine = BILLS.filter(function(b){ return b.hotel===S.hotel; });
      return origQ()+
        '<div class="card" style="margin-top:16px"><div class="ct">Kayıtlı siparişlerin adisyonu <a href="#/qrs-adisyon">tümünü aç</a></div>'+
        '<div class="grid g2" style="margin-top:8px">'+mine.map(billCard).join('')+'</div></div>';
    };
  }
  if(VIEWS['otel-outlet']){
    const origO = VIEWS['otel-outlet'];
    VIEWS['otel-outlet'] = function(){
      return '<div class="note blue"><b>QR Menü ve QR Sipariş</b> bu outletlere ayrıca atanır. Atamadan sonra <a href="#/outlet-menu">Outlet Menüsü</a> ekranında kategori, alt kategori, grup, görsel, alerjen ve opsiyonel fiyat tanımlanır. Gösterim kapalıyken tutar gizlenir.</div>'+origO();
    };
  }

  buildNav();
  render();
})();
