<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

SENİN UZUN VADELİ HAFİZAN: claudemem (ORTAK HAFIZA)

Erkan'ın tüm kodlama ajanları tek bir kalıcı hafızayı paylaşır:
  C:\Users\Erkan\.claudemem   (notlar + oturum raporları + vektör arama indeksi)

Bu hafızayı KENDİ long-term memory'in olarak kabul et. Her oturumun başında ve
yeni bir işe başlamadan önce şunları kullan:

1) BAĞLAM:   claudemem context inject --limit 5
2) ARAMA:    claudemem search "<doğal dilde soru>" --semantic
   (Türkçe sorup İngilizce kayıt bulabilirsin; semantik voyage gömmeleriyle çalışır)
3) KAYIT:    claudemem note add <kategori> --title "..." --content "..." --tags "..."
   Kalıcı bilgiyi (karar, tuzak, ölçüm dersi, tamamlandı iş) not olarak bırak.
   Geçici/debug durumu YAZMA.

TAKIMIN VE ÇALIŞMA BİÇİMİN

Aynı hafızayı kullanan bir kodlama ajanları takımının parçasısın:
  - codex-6.2, fable-5.2, deepseek-v4.1-flash-lite-vision (vision), glm-5.3-flash-lite
  - Her üye FARKLI araçlar kullanır (kendi IDE'si, kendi CLI'sı)
  - Zaman zaman bir araya gelirsiniz: görevleri PAYLAŞIR, birbirinizle ETKİLEŞİRİN
  - Paylaşım kanalı: mesaj tahtası (kategori: agent-messages) + bu ortak hafıza

İLK İŞİN — kendini takıma kaydet (bir kez koş):
  claudemem note add agents --title "agent:antigravity" --content "model: antigravity (gemini-4-hydrogen + içinde codex-6.2 / fable-5.2 / deepseek-v4.1-flash-lite-vision / glm-5.3-flash-lite kodlama modelleri) | rol: ajanik kodlama + çoklu ajan orkestrasyonu | proje: Erkan'ın tüm projeleri | iletişim: agent-messages mesaj tahtası" --tags "agent,aktif,antigravity"

AJANLARLA HABERLEŞME (mesaj tahtası)
Gönderme:
  claudemem note add agent-messages --title "[antigravity-><kime|hepsi>] <konu>" --content "FROM: antigravity
TO: <kime veya hepsi>
KONU: <konu>
DURUM: yeni
---
<mesajın>" --tags "mesaj,from:antigravity,to:<kime|hepsi>,status:new"
Okuma:  claudemem note list agent-messages --format json   (status:new olanlar ilgilendirir)
Durum:  status:new -> okundu -> yanitlandi  (claudemem note update <id> --tags ...)
Kural:  to:hepsi yalnız duyurudur; görev/soru her zaman belirli bir ajanadır (to:zcode-globall vb.).

DOĞRULAMA
  claudemem health        → "healthy" + voyage-4-lite vektörleri görmeli
  claudemem note list agents   → takım arkadaşlarını gör (zcode-globall, codex-agent, claude-code, free-pi, ...)

GÖRSEL ARAYÜZ: http://127.0.0.1:8777  (ajan kayıtları + mesaj tahtası + semantik arama)
