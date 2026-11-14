# Deploy Sırasında Logolu Güncelleme Ekranı (Traefik Yedek Yönlendirmesi)

Coolify ana uygulamayı yeniden başlatırken (25-30 sn) siteye gelen **herkes** (QR'ı ilk kez okutan misafir dahil)
tarayıcının hata ekranı yerine otel logolu "kısa süreli güncelleme" sayfasını görür. Uygulama açılınca sayfa
kendiliğinden yenilenir ve kişi gitmek istediği adrese ulaşır.

Bir kez kurulur; sonraki her deploy'da kendiliğinden çalışır. Alan adı ve QR adresleri değişmez.

## Nasıl çalışır

```
İstek ──> Traefik ──┬── uygulama ayakta  → Coolify'ın uygulama yönlendirmesi (öncelikli) → app:3000
                    └── uygulama kapalı  → yedek yönlendirme (priority 1)             → merit-bakim:80 (503 + logolu sayfa)
```

* `merit-bakim`: çok küçük bir nginx konteyneri (≈ 10 MB RAM). Sayfa `merit/public/offline.html` dosyasının
  kendisidir; telefondaki service worker'ın gösterdiği sayfayla aynıdır.
* Yanıt kodu `503` + `Retry-After` olduğundan arama motorları bunu kalıcı sayfa saymaz.

## Kurulum (Coolify paneli, ~10 dk)

### 1. Bakım servisini ayrı kaynak olarak ekleyin

1. Coolify → Merit projesi → **+ New Resource** → **Docker Compose** (aynı Git deposu, branch `main`).
2. **Compose File Path:** `deploy/maintenance/docker-compose.yaml`
3. **Domains:** BOŞ bırakın (alan adı vermeyin; yönlendirmeyi 2. adım yapar).
4. **Otomatik deploy'u kapatın** (Settings → *Auto Deploy* kapalı) **ya da** *Watch Paths* alanına şunu yazın:
   ```
   deploy/maintenance/**
   merit/public/offline.html
   merit/public/brand/hotels/**
   ```
   Önemli: bu servis ana uygulamayla aynı anda yeniden başlarsa amacına hizmet etmez.
5. **Deploy**. Durum *Running (healthy)* olmalı.

### 2. Traefik yedek yönlendirmesini ekleyin

1. Coolify → **Servers** → sunucu → **Proxy** → **Dynamic Configurations** → **+ Add**.
2. Dosya adı: `merit-bakim.yaml`
3. İçerik: depodaki `deploy/maintenance/traefik-merit-bakim.yaml` dosyasının tamamı.
4. Kaydedin. Traefik dosyayı kendiliğinden okur; proxy'yi yeniden başlatmak gerekmez.

## Test

Uygulamanın etkilenmediğini görün (normal sayfa açılmalı):

```bash
curl -sI https://qrmenu.merithotels.com/api/health
```

`HTTP/2 200` ve `content-type: application/json` gelmeli.

Bakım sayfasını görmek için sakin bir saatte Coolify'da ana uygulamaya **Restart** verin ve 30 sn içinde
siteyi açın (telefonda gizli sekme = ilk kez gelen misafir gibi). Logolu sayfa görünmeli ve uygulama açılınca
kendiliğinden yenilenmeli. Komut satırından:

```bash
curl -sI https://qrmenu.merithotels.com/
```

Restart sırasında `HTTP/2 503` ve `retry-after: 15` görülmeli.

## Sorun giderme

| Belirti | Neden / Çözüm |
|---|---|
| Deploy sırasında hâlâ `404 page not found` | Dinamik ayar okunmadı: dosya adı `.yaml` ile bitmeli; Proxy → Logs'ta hata arayın. |
| `502 Bad Gateway` / `Service Unavailable` (düz metin) | Traefik bakım konteynerine ulaşamıyor: servis *Running* mi, `coolify` ağına bağlı mı? Sunucuda `docker network inspect coolify` çıktısında `merit-bakim` takma adlı konteyner görünmeli. |
| Sertifika uyarısı | `certResolver` adı sunucudakinden farklı olabilir; Proxy ayarındaki çözümleyici adını (`letsencrypt`) kontrol edin. |
| Normal zamanda da bakım sayfası açılıyor | Uygulama yönlendirmesi yok: ana uygulamanın Domains alanı boş kalmış olabilir. Yedek ayar uygulamayı asla ezmez (priority 1). |

## Kaldırma

Dynamic Configurations'tan `merit-bakim.yaml` silinir, bakım kaynağı durdurulur. Ana uygulamaya dokunulmaz.
