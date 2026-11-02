# Merit OS Print Gateway

Merit OS sunucusunun fiş kuyruğunu (`print_jobs`) çeken, ESC/POS fiş baytlarını
üretip yerel ağdaki termal yazıcıya TCP (genellikle port 9100) ile basan ve
sonucu sunucuya bildiren bağımsız Node paketidir. Sunucu koduna bağımlılığı
yoktur; kendi `node_modules` ve `tsconfig`'ine sahiptir (merit'in `tsc`/`eslint`
taramaları bu dizini görmez).

## Çalışma mantığı

1. Her `POLL_MS` (varsayılan 2000 ms) aralıkla `GET /api/print-queue?hotel=…&limit=10`
   çağrısıyla kuyruktan iş çekilir (sunucu işleri `BASILIYOR` durumuna alır).
2. Her iş için fiş metni `renderReceipt` ile satırlara dökülür, `encodeReceipt`
   ile ESC/POS baytlarına çevrilir (cp857 kod sayfası) ve `net.Socket` ile
   yazıcının `ip:port` adresine yazılır (3 sn zaman aşımı).
3. Sonuç `POST /api/print-queue/{id}` ile bildirilir: başarılı `{ ok: true }`,
   hata durumunda `{ ok: false, error: "…" }` (sunucu tarafında 3. hatada iş
   `HATA` olur; 60 sn'den eski `BASILIYOR` işleri sunucu süpürücüsü kuyruğa döndürür).
4. Her 30 saniyede bir güncel yazıcı listesi paralel TCP ping ile denetlenir ve
   `POST /api/print-queue/heartbeat` ile bildirilir; yanıt olarak otelin aktif
   yazıcı listesi (`{ printers: [{ id, ip, port }] }`) döner ve sonraki döngüde
   bu liste pinglenir.
5. `SIGTERM`/`SIGINT` alındığında zamanlayıcılar temizlenip düzgün çıkılır.

## Kurulum

Node 24+ gerekir.

```bash
cd merit/tools/print-gateway
npm install
cp .env.example .env   # Windows: copy .env.example .env
# .env dosyasını düzenleyin
npm run dev            # ön planda çalıştırma
```

Test ve tip denetimi:

```bash
npm test               # vitest run (saf fonksiyon testleri; DB/ağ gerektirmez)
npm run typecheck      # tsc --noEmit
```

## `.env` alanları

| Alan             | Açıklama |
| ---------------- | -------- |
| `API_URL`        | Merit sunucusunun kök adresi (örn. `http://192.168.1.10:3000`). Sonunda `/` olmamalı. |
| `GATEWAY_KEY`    | Taşıyıcı anahtar. Sunucu tarafındaki `PRINT_GATEWAY_KEY` ortam değişkeni ile **birebir aynı** olmalıdır; aksi halde uçlar 401 döner. |
| `HOTEL_CODE`     | Basılacak otelin kodu (`ROYAL`, `DIAMOND` veya `PREMIUM`; örn. `ROYAL`). Sunucu bu otelin kuyruğunu ve yazıcılarını döner. |
| `POLL_MS`        | Kuyruk yoklama aralığı, ms cinsinden (varsayılan `2000`). |
| `CODEPAGE_TABLE` | `ESC t <n>` komutuyla seçilen karakter tablosu numarası. **cp857 için 13** — sahada yazıcıyla doğrulanacak; yazıcı farklı tablo numarası kullanıyorsa buradan değiştirilir. |

## Yazıcı notları

- Yazıcı IP'si/portu sunucuda Yazıcılar penceresinden yönetilir; gateway listeyi
  heartbeat yanıtından alır, elle yapılandırılmaz.
- Kod sayfası **cp857** (Türkçe karakterler) kabul edilir ve `CODEPAGE_TABLE=13`
  ile seçilir. Bu numara yazıcı modeline göre değişebilir — sahada test fişiyle
  doğrulanmalıdır (Türkçe karakterler bozuk çıkarsa tablo numarasını değiştirin).
- Kâğıt genişliği: 80 mm → 48 sütun, 58 mm → 32 sütun (sunucudaki yazıcı
  kaydının `paperWidth` alanından okunur).

## Windows servisi (NSSM)

Gateway'i Windows hizmeti olarak çalıştırmak için [NSSM](https://nssm.cc) kullanın:

```bat
nssm install MeritPrintGateway "C:\Program Files\nodejs\node.exe" "D:\PROJECTS\qrmenu\merit\tools\print-gateway\node_modules\tsx\dist\cli.mjs" "D:\PROJECTS\qrmenu\merit\tools\print-gateway\src\index.ts"
nssm set MeritPrintGateway AppDirectory D:\PROJECTS\qrmenu\merit\tools\print-gateway
nssm set MeritPrintGateway AppStdout D:\MeritLogs\print-gateway.log
nssm set MeritPrintGateway AppStderr D:\MeritLogs\print-gateway.err.log
nssm set MeritPrintGateway AppRotateFiles 1
nssm start MeritPrintGateway
```

Notlar:

- `AppDirectory` `.env` dosyasının okunması için önemlidir (`dotenv` orada arar).
- Kaldırmak için: `nssm stop MeritPrintGateway && nssm remove MeritPrintGateway confirm`.
- Alternatif olarak `nssm install MeritPrintGateway "C:\Program Files\nodejs\npx.cmd" tsx src/index.ts`
  de kullanılabilir; doğrudan tsx CLI yolunu vermek servis günlüklerinde daha az
  sarışıklık yaratır.

## Sunucu tarafı

- Uçlar `merit/src/app/api/print-queue/*` altındadır; yetki
  `Authorization: Bearer <PRINT_GATEWAY_KEY>` başlığı ile sabit zamanlı
  karşılaştırma yapılır (anahtar yoksa/yanlışsa 401).
- `PRINT_GATEWAY_KEY` sunucunun ortam değişkenidir; gateway'in `GATEWAY_KEY`
  değeri ile eşleşmelidir.
- İş durumları: `KUYRUKTA → BASILIYOR → BASILDI | HATA`. Yazdırma hatası 3
  denemeye kadar işi kuyruğa döndürür; 3. hatada iş `HATA` olur ve kasaya
  bildirim düşer. 60 sn'den uzun süredir `BASILIYOR`da bekleyen işler sunucudaki
  `print.sweep` görevi tarafından kuyruğa geri alınır.
