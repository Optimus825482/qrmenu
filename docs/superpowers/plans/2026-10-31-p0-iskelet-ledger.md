# SDD ledger — plan: docs/superpowers/plans/2026-10-31-p0-iskelet.md

Spec: docs/superpowers/specs/2026-10-31-merit-platform-design.md (okundu; bağlayıcı otorite)
Dal: p0/iskelet (git deposu 31.10.2026'da bu oturumda oluşturuldu; ayrı worktree yok — depo yeni, izole edilecek başka iş yok)

## Ön uçuş taraması

| Satır | Üretilen / Tüketilen | Bulgu |
|---|---|---|
| T2 time.ts ↔ T3/T7/T12 | businessDate(d) string | uyumlu |
| T3 seed ↔ T5 createSession | DEFAULT_SETTINGS session.* anahtarları | uyumlu (T9 gerçek servisle değiştirir) |
| T3 seed ↔ T6 can() testi | R-GAR visibleScreens | ÇELİŞKİ: seed kuralı "rolün modülündeki tüm ekranlar" → QM 5 + QS 6 + CR-RAP = 12; T6 testi 10 kod listeliyor (QM-MEN, QM-TEM eksik) |
| T3 screens.ts ↔ T5 loginAction/T10 e2e | defaultScreen.path | EKSİK: CORE, QR_MENU, QR_ORDER, ROOM_SERVICE ekranlarının path'leri planda yok; admin → /admin yönlendirmesi path'e bağlı |
| T5 createSession ↔ T7 sweeper | UserSession alanları (expiresAt, warnedAt, lastSeenAt) | uyumlu |
| T7 sweeper ↔ T8 notify | notifier enjeksiyonu | uyumlu |
| T8 publish/subscribe ↔ T11 useSse ↔ T12 CommandCenter | MeritEvent | uyumlu |
| T10 fixtures ↔ T11/T12/T13 e2e | seedAndLogin | uyumlu |
| T11 shell.spec | "Oda Kontrolü simgesi yok…" cümlesi | BELİRSİZ: iki test iç içe yazılmış |
| T1 create-next-app | --turbopack bayrağı | RİSK: Next 16'da Turbopack varsayılan, bayrak reddedilebilir |
| T2 DST testi | 2026-10-25T01:30Z → 25 Ekim | doğru (EET 03:30) |
| Her task kendi içinde | test ↔ kod | tutarlı |

Ruling: T6 visibleScreens(R-GAR) 12 kod (CR-RAP + tüm QM-* + tüm QS-*, sortOrder sırasıyla) — seed kuralı spec §4.1 profil mantığına uygun, test listesi eksikti — yanlışsa maliyet: tek test satırı.
Ruling: Ekran path'leri: CR-KOM /admin, CR-ONL /admin#core.online, CR-RAP /admin#core.rapor, CR-KUL /admin#core.kullanici, CR-SYS /admin#core.ayarlar, CR-DEN /admin#core.denetim, QM-MIS /q, QM-CAG /garson/cagrilar, QM-MEN /admin#menu.yonetim, QM-TEM /admin#menu.tema, QM-RAP /admin#menu.rapor, QS-KUY /garson, QS-KAS /kasa, QS-KDS /kds, QS-FIS /kasa/yazici, QS-IPT /kasa/iptal, QS-RAP /admin#order.rapor, RO-TAL /oda-servisi, RO-TEL /oda-servisi/teyit, RO-TES /oda-servisi/teslim, RO-SLA /admin#rs.rapor — "#" sonrası XP kabuğunda açılacak uygulama id'si — yanlışsa maliyet: path sabitleri değişir, mantık değişmez.
Ruling: T11 shell.spec'teki belirsiz test → "kat.mr ile /admin → /secim yönlendirilir" tek testi — maliyet: yok.
Ruling: T1 create-next-app'te --turbopack bayrağı kaldırıldı (Next 16 varsayılanı) — maliyet: yok.
Ruling: Git deposu ve p0/iskelet dalı kontrolör tarafından oluşturuldu; .env dosyası kullanıcının gösterdiği D:\PROJELLER\qrmenu\.env'deki postgres kimliğiyle `merit`/`merit_test` DB'leri için hazırlandı (.superpowers/.../merit.env; Task 1 bunu merit/.env'e kopyalar) — maliyet: kullanıcı başka DB kullanıcı isterse .env düzenlenir.
Ruling: Tüm commit'ler "Erkan Erdem <ikinciyenikitap54@gmail.com>" kimliğiyle (git config global yok; -c ile) — maliyet: yok.

## İlerleme
Task 1: dispatched (BASE a0cc77d, implementer sonnet)
Task 1: implementer DONE_WITH_CONCERNS (commit 4c0c323). Ruling: next.config.ts'teki `cacheComponents: true` ve `partialPrefetching: true` kaldırılır — RSC'lerde cookies()/DB okuyan sayfalar Suspense zorunluluğuyla derleme hatası verir, P0 klasik dinamik render ister — yanlışsa maliyet: ileride "use cache" ile geri açılabilir. Ruling: npm install-scripts onayı (prisma, esbuild) Task 2 dispatch'ine taşındı. vitest.config.mts, @types/node ^24, !.env.example kabul.
Task 1: review (sonnet) ❌ 1 Important: typecheck `tsc --noEmit` .next/types'a bağımlı → temiz CI'da LayoutProps TS2304. Ruling: CI'daki prisma generate/migrate adımlarının Task 2'ye kadar başarısız olması kabul (plan-mandated; Task 2 kapatır) — maliyet: yok.
Task 1: minor (deferred): eslint globalIgnores'a src/generated/**, coverage/**, playwright-report/**, test-results/** ekle (Task 2 dispatch'ine taşındı)
Task 1: minor (deferred): prisma/@prisma/* ve tailwindcss için ~ (tilde) sürüm sabitleme
Task 1: minor (deferred): ci.yml push+pull_request çift çalışma, permissions: contents: read eksik
Task 1: minor (deferred): scaffold kalıntıları (demo page.tsx, "Create Next App" title, public/*.svg, README, AGENTS.md) — Task 10/11/14 temizler
Task 1: minor (deferred): @types/bcryptjs stub (bcryptjs 3 kendi tiplerini taşır) — Task 5'te düşürülebilir
Task 1: fix round 1/5 (1 addressed, 0 open — typecheck self-sufficient via next typegen; commits 531f9c9..03a9e7c)
Task 1: complete (commits a0cc77d..03a9e7c, review clean)
Task 2: dispatched (BASE 03a9e7c, implementer sonnet)
Task 2: implementer DONE_WITH_CONCERNS (commit 361c124; 56 model, 26 enum). Ruling: kolonlarda @map snake_case kabul (spec tablo adlandırmasıyla uyumlu). Ruling: ModuleKey'e CORE eklenmesi kabul (AppScreen.moduleKey CORE içerir). Ruling: Order.businessDate + unique(hotelId, businessDate, orderNo) kabul (günlük sipariş no için gerekli). Ruling: hotelId NULL olan Setting/RoleScreenPermission/RoleModuleAccess satırlarında unique NULL-distinct → Task 3'te migration 0002 ile kısmi unique indeksler (WHERE hotel_id IS NULL) eklenir ve seed upsert yerine findFirst+create/update kullanır — maliyet: bir migration. Int≥1 kuralları servis katmanında (spec ile uyumlu).
Task 2: review (opus) Approved, 1 Important: @db.Date yazımı için businessDay(day) helper eksik → fix round 1.
Task 2: Ruling: tests/helpers/db.ts'ye DATABASE_URL_TEST === DATABASE_URL koruması fix round 1'e eklendi (dev DB'yi TRUNCATE etme riski; yıkıcı işlem önlemi) — maliyet: yok.
Task 2: Ruling: aşağıdaki minörler Task 3'ün migration 0002'sine taşındı — updatedAt: Notification, PushSubscription, EmailLog; MenuNode.allergens @default([]); Order.table/room onDelete Restrict; TaskStatusLog.from nullable; kısmi unique outlets(hotel_id) WHERE type='ODA_SERVISI'; CHECK setup_items.qty>=1, mybar_request_items.requested_qty>=1; FK indeksleri order_items(order_id), order_events(order_id), print_jobs(printer_id,status), waiter_calls(outlet_id,status), daily_task_items(task_id) — maliyet: bir migration.
Task 2: Ruling: SessionEvent.detail Json? ve PushSubscription.userAgent String? nullable kabul (spec'ten sapma, zararsız).
Task 2: minor (deferred): env.ts safeParse + z.prettifyError ile okunur başlangıç hatası; eager parse (Task 4/14 veya final)
Task 2: minor (deferred): schema.test.ts tekrar eden floor duplicate testi birleştirilsin
Task 2: minor (deferred): EmailSetting tek satır kuralı DB'de yok (servis katmanı, P7)
Task 2: fix round 1/5 (2 addressed, 0 open — businessDay helper + truncate guard; commits 361c124..c7c7e67)
Task 2: minor (deferred): time.ts day parametresi doğrulanmıyor (Invalid Date); db.ts guard tam dizi eşitliği
Task 2: complete (commits 03a9e7c..c7c7e67, review clean)
Task 3: dispatched (BASE c7c7e67, implementer sonnet)
Task 3: implementer DONE_WITH_CONCERNS (commits 03aa625, 19712dd). Ruling: yetki/ayar/modül/admin satırları "yoksa oluştur" (upsert değil) kabul — yeniden seed yönetici düzenlemelerini ve admin şifresini ezmez; otel/rol/ekran upsert kalır — maliyet: ekran kataloğu değişirse yetki satırları elle/ayrı migration ile eklenir. Ruling: CORE ekranlarında yalnızca CORE kuralları (R-OTM/R-FBM CR-KUL/CR-SYS/CR-DEN alamaz) kabul, özete uygun. Ruling: tüm seed rolleri isSystem=true; email.* dört bayrak; qr.baseUrl localhost kabul. Not: 0002'de updated_at NOT NULL default'suz — tablolar boş; göç scripti (P2) updatedAt set eder.
Task 3: Ruling (güvenlik taraması): seed.ts'teki sabit FALLBACK_ADMIN_PASSWORD kaldırılır; SEED_ADMIN_PASSWORD yoksa seed hata verir (fail closed); min 10 karakter; plan metnindeki "yoksa '[ORTAMDAKI_YONETICI_PAROLASI]'" ifadesi geçersiz — fix round'a eklenir — maliyet: .env/CI'da değişken zorunlu (zaten var).
Task 3: review (sonnet) Approved, 0 Important. Ruling: minor #2 (oda servisi outleti ada göre aranıyor; yeniden adlandırılırsa kısmi unique patlar → type bazlı findFirst) güvenlik düzeltmesiyle aynı fix round'a eklendi — maliyet: yok.
Task 3: minor (deferred): seed.test.ts veri assertion'ları ince (maxOnlineMinutes, defaultScreen, path/sortOrder, admin rolü, tam yetki satır sayısı 202, yeniden seed düzenlemeyi ezmez)
Task 3: minor (deferred): seed.ts `value as never` yerine Prisma.InputJsonValue; argv basename regex kırılgan; dotenv/config import
Task 3: minor (deferred): 0002 updated_at için backfill yok (üretim öncesi kabul)
Task 3: fix round 1/5 (2 addressed, 0 open — şifre yedeği kaldırıldı, outlet türe göre; commits 19712dd..43b6ce8)
Task 3: complete (commits c7c7e67..43b6ce8, review clean)
Task 3: Ruling: ci.yml'de DATABASE_URL == DATABASE_URL_TEST (ikisi de merit_test) → tests/helpers/db.ts koruması CI'da fırlatır. Task 4 dispatch'ine ek: CI'da `merit` DB'si de oluşturulur (psql adımı), DATABASE_URL=.../merit, migrate deploy iki DB için çalışır — maliyet: yok. Ruling: .env.example SEED_ADMIN_PASSWORD değeri boş bırakılır (bilinen yer tutucuyla seed yapılmasın) — maliyet: yok.
Task 4: dispatched (BASE 43b6ce8, implementer sonnet)
Task 4: implementer DONE (commits 34b97b4, 58f7551)
Task 4: review (sonnet) Approved, 0 Important.
Task 4: minor (deferred): safeAction Next.js redirect()/notFound() digest hatalarını da yakalar → Task 10 handler'ları redirect'i UI tarafında yapar; final'de `digest` 'NEXT_' ile başlayanı yeniden fırlatma eklenebilir
Task 4: minor (deferred): fromZod path.join'de symbol anahtar riski (.map(String)); audit before/after explicit null → Prisma.JsonNull; test başlıkları abartılı; INTERNAL log etiketi bağlamsız
Task 4: complete (commits 43b6ce8..58f7551, review clean)
Task 5: dispatched (BASE 58f7551, implementer sonnet)
Task 5: implementer DONE_WITH_CONCERNS. Ruling: alt ajan commit'lerinde "Co-Authored-By: Claude Sonnet 5.5" kabul (commit'i yazan modeli yansıtır; amend yapılmaz). Ruling: ZORUNLU çıkış status=CIKTI olmalı (DUSURULDU bağlantı kopması için) → inceleme öncesi düzeltme. Ruling: login.ts ayrı dosya ('use server' yalnız async export) kabul; fixtures.ts ve auth.test.ts ekleri kabul; Ctx.user.role* = oturum rolü kabul (çoklu rol ataması için doğru).
Task 5: minor (deferred): başka kullanıcının çerezi varken giriş eski oturumu kapatmaz (login'de cookie'deki farklı sessionId SISTEM sebebiyle kapatılabilir); x-forwarded-for sahtelenebilir (ters proxy ayarı kurulum belgesine)
Task 5: Ruling (güvenlik taraması): (a) giriş hız sınırı IP'ye ek olarak kullanıcı adına göre de 5/dk; attempts Map'i 10.000 girişle sınırlı (en eskiyi at) — plan yalnız IP demişti — maliyet: yok. (b) /cikis GET ile çıkış CSRF → yalnız POST (Origin başlığı APP_BASE_URL ile eşleşmeli), Task 10/11 "Oturumu Kapat" <form method=post action=/cikis>; Task 10 e2e'de GET yerine POST — plan GET demişti — maliyet: yok. (c) requireUser her istekte oturum hedefini yeniden doğrular: session.roleId == user.roleId veya session.outletId için aktif OutletMember.roleId; outlet aktif; session.hotelId kapsamda; değilse oturum SISTEM sebebiyle kapatılır ve UNAUTHORIZED — maliyet: istek başına 1-2 ek sorgu (request-cache ile).
Task 5: round 0 fixes DONE (commits 3ba2bad, cf72067). Ruling: aktif OutletMember, outletin otelini yetkilendirir (çapraz otel personeli için gerekli) kabul; /cikis 303 redirect kabul; kullanıcı adı bazlı 1 dk kilit (DoS) kabul — kurulum belgesine not.
Task 5: minor (deferred): 10.000 giriş eviction testi yok
Task 5: Ruling (güvenlik taraması 2): (a) hız sınırı: IP ve kullanıcı adı için AYRI haritalar, her biri 10.000 kapasite; dolunca önce süresi dolmuş girişler temizlenir, hâlâ doluysa yeni anahtar RATE_LIMITED (fail closed) — canlı giriş atılmaz — maliyet: saldırı anında yeni IP'ler geçici engellenir (kabul). (b) requireUser rol kontrolü: expectedRole = session.outletId ? (member?.roleId ?? user.roleId) : user.roleId; session.roleId === expectedRole — listTargets ile aynı türetme — maliyet: yok. İkisi de fix round 1'e eklenir.
Task 5: review (opus) ❌ 2 Important: (1) outlet oturumunda override sonradan eklenirse yakalanmıyor; (2) pasif kullanıcı/otel oturumu kapatmadan fırlatıyor (reaktivasyonda eski çerez canlanır). Fix round 1 = bu ikisi + güvenlik kararı (ayrı hız sınırı haritaları, fail closed). Ruling: minör #1 (logout'ta cookie destroy finally) ve #4 (hex uzunluğu 64) güvenlikle ilgili ve trivial → fix round 1'e eklendi — maliyet: yok.
Task 5: minor (deferred): zaman sızıntısı (boş/bilinmeyen hash hızlı döner; werkzeug yavaş); limiter pencere/eviction/pending TTL testleri yok; lib/auth → modules/core import yönü; ACTIVE_STATUSES tekrarı; ikinci kullanıcı girişi ilk oturumu kapatmaz; safeAction console.error Prisma hatasıyla hash sızdırabilir (düşük olasılık); ADMIN hedefi kullanıcının kendi oteli (brief "ilk otel") kabul
Task 5: Ruling (güvenlik taraması 3, önceki kararı REVİZE eder): hız sınırı — kullanıcı adı haritasında kapasite sınırı YOK, her eklemede süresi dolanlar temizlenir (bellek = istek hızı × 60 sn, kabul edilebilir), fail-closed kaldırılır (sahte kullanıcı adlarıyla herkesi kilitleme DoS'u önlenir); IP haritasında 10.000 sınır + en eski atılır (IP sınırı sahte XFF yüzünden zaten en iyi çaba). Kalıcı çözüm (login_attempts tablosu / DB tabanlı sayaç) P1'e not — maliyet: saldırgan 10k+ istek/dk ile IP sınırını aşabilir; kullanıcı adı sınırı korunur. fix round 2'ye girer.
Task 5: fix round 1/5 (5 addressed, 0 open; commits cf72067..2248e2a). Ruling: kök .gitattributes `* text=auto eol=lf` eklenir (CRLF/LF whitespace churn gözlendi) — fix round 2'ye — maliyet: yok.
Task 5: minor (deferred): rateLimitInternals üretim export'u (test kancası) adlandırması
Task 5: fix round 2/5 (2 addressed, 0 open — revize hız sınırı, .gitattributes; commits 2248e2a..f7959eb). (rateLimitInternals adlandırma minörü çözüldü.)
Task 5: complete (commits 58f7551..f7959eb, review clean)
Task 6: dispatched (BASE f7959eb, implementer sonnet)
Task 6: implementer DONE (commit 32784f0). Ruling: hotelId verilmezse oturum oteli hem otel-satırı hem HotelModule için kullanılır kabul; otel satırı sistem satırını tamamen ezer (bayrak bazlı birleştirme yok) kabul; RoleModuleAccess satırı olmayan modül reddedilir kabul.
Task 6: review (sonnet) ❌ 1 Important: assertCan audit'i caller hotelId ile yazıyor (FK P2003 → 500, kapsam dışı otel loga yazılır) → fix round 1.
Task 6: minor (deferred): RoleModuleAccess satırı yok / otel satırı true override / pasif ekran / visibleScreens otel önceliği testleri yok; CORE ekranda gereksiz HotelModule yükü; per-request memo yorumu
Task 6: fix round 1/5 (1 addressed, 0 open; commits 32784f0..3c57a33)
Task 6: minor (deferred): assertCan after.hotelId uzunluk sınırı yok; audit-failure catch dalı testsiz
Task 6: complete (commits f7959eb..3c57a33, review clean)
Task 7: dispatched (BASE 3c57a33, implementer sonnet)
Task 7: implementer DONE (commit 1c6e68e). Ruling: MERIT_DISABLE_JOBS .env.example'a eklenmesi kabul.
Task 7: Ruling (güvenlik taraması): (a) requireUser/loadCtx (auth.ts) hareketsizliği de uygular: now - lastSeenAt ≥ session.idleMinutes → closeSession(HAREKETSIZLIK) + UNAUTHORIZED, touch'tan önce; (b) instrumentation NODE_ENV=production iken MERIT_DISABLE_JOBS'u yoksayar (uyarı loglar) — fix round 1'e eklenir — maliyet: istek başına 1 karşılaştırma.
Task 7: review (sonnet) Approved, 0 Important. Ruling: minör #1 (closeSession hatası süpürmeyi durdurur → oturum başına try/catch) fix round 1'e eklendi; ⚠️ next build doğrulaması fix round'da yapılır.
Task 7: minor (deferred): expired/idle sayaçları bulunan satırı sayar; sınır değer testleri (tam eşitlik) yok; boss.stop() SIGTERM yok; start() başarısızlığında retry yok
Task 7: fix round 1/5 (4 addressed, 0 open; commits 1c6e68e..3fe5e32)
Task 7: minor (deferred): sweeper testinde mock restore afterEach'e alınmalı; idle kontrolü isActive'den önce (pasif+idle HAREKETSIZLIK olur, kozmetik)
Task 7: complete (commits 3c57a33..3fe5e32, review clean)
Task 8: dispatched (BASE 3fe5e32, implementer sonnet)
Task 8: implementer DONE_WITH_CONCERNS (commit 67c2dbf). Ruling: notify() çok alıcıda userIds'i ≤100'lük parçalara bölüp ayrı pg_notify yayınlar (8000 bayt sınırı) → fix round 1'e. Ruling: SSE istemcisine userIds gönderilmemesi kabul; publish tx'siz prisma.$executeRaw kabul; startRealtimeListener ilk bağlantı hatasında arka planda retry kabul; stopRealtimeListener/isListening ekleri kabul.
Task 8: Ruling (güvenlik taraması): (a) closeSession `session.closed` olayı yayınlar (userIds:[userId], payload.sessionId); SSE akışı kendi sessionId'sini görünce kapanır; (b) akış azami ömrü 30 dk (SSE_MAX_LIFETIME_MS), sonra sunucu kapatır, istemci yeniden bağlanır (requireUser yeniden çalışır) → fix round 1'e — maliyet: istemci 30 dk'da bir yeniden bağlanır.
Task 8: review (sonnet) Needs fixes — 3 Important: userIds chunking; session.closed + 30 dk ömür; pg Client connectionTimeoutMillis/keepAlive. Ruling: minör #1 (olay şekli/tip doğrulama — SSE alan enjeksiyonu) ve #3 (listener önce, bağımsız try) fix round 1'e eklendi — maliyet: yok.
Task 8: minor (deferred): backpressure (desiredSize) yok; kesinti sırasında kaybolan olaylar için realtime.resync; startRealtimeListener stopped bayrağını sıfırlar; abort testi zayıf (fake timers); notifications testinde sabit sleep → vi.waitFor; route/useSse testsiz (Task 12 e2e); hotelId'siz olay herkese gider (doküman notu)
Task 8: fix round 1 implementer DONE (commit 2ee44b7); son useSse değişikliği sonrası yalnız lint/tsc/build (useSse testsiz, kabul)
Task 8: fix round 1/5 (5 addressed, 0 open; commits 67c2dbf..2ee44b7)
Task 8: minor (deferred): useSse 401'de sonsuz 30 sn backoff (session.closed kaçırılırsa yönlendirme yok) → Task 12/10 UI'da 401 algılama; 30 dk ömre jitter yok; keepAliveInitialDelayMillis yok
Task 8: Ruling: createSession'daki TEK_CIHAZ kapatması closeSession üzerinden geçmiyorsa session.closed yayınlanmaz → Task 9 dispatch'ine ek (sessions.ts) — maliyet: yok.
Task 8: complete (commits 3fe5e32..2ee44b7, review clean)
Task 9: dispatched (BASE 2ee44b7, implementer sonnet)
Task 9: implementer DONE (commit f3f3f43). Ruling: settings-defs.ts (saf tanımlar) + settings.ts ayrımı kabul; advisory lock kabul; sweeper/login sistem kapsamı okur (otel override henüz yok — P1'de oturum oteliyle çağrılabilir) kabul; aynı istekte set sonrası memo eski değer (kabul, not).
Task 9: Ruling (güvenlik taraması): setSetting hotelId verilmediğinde (sistem kapsamı) ctx.user.roleKind === 'SISTEM' zorunlu, aksi FORBIDDEN + YETKISIZ_DENEME audit; otel kapsamı için assertCan(…, hotelId) kalır → fix round 1 — maliyet: yok.
Task 9: review (sonnet) Approved, 0 Important. fix round 1 = yalnız güvenlik kararı (sistem kapsamı yazımı SISTEM).
Task 9: minor (deferred): readSetting yorumuna stale-after-set notu; seed.ts göreli import; çoklu displaced session testi; sweeper otel override okumuyor (P1); var olmayan hotelId ham FK hatası
Task 9: fix round 1/5 (1 addressed, 0 open; commits f3f3f43..328883d)
Task 9: minor (deferred): setSetting hotelId === undefined yerine == null (açık null fail-closed zaten)
Task 9: complete (commits 2ee44b7..328883d, review clean)
Task 10: dispatched (BASE 328883d, implementer sonnet)
Task 10: Ruling: Playwright e2e testleri dev sunucusunu sürer → DEV veritabanına (DATABASE_URL) karşı koşar; fixtures.resetAndSeed() uygulama tablolarını truncate edip seed + test kullanıcılarını (kat.mr, depo.cok, garson.havuz, bos.kullanici; şifre Test!2026) kurar; merit_test'e asla dokunmaz — maliyet: dev DB her e2e koşusunda sıfırlanır (kabul, P2 göç sonrası ayrı e2e DB'ye geçilebilir). Ruling: scaffold kalıntıları (page.tsx demo, title, public/*.svg) Task 10'da temizlenir; globals.css'e modern tema tokenları eklenir (Task 1 minörü kapanır).
Task 10: implementer DONE (commit d7241d2). Not: e2e dev DB'yi siler (karar gereği); selectTargetAction gerçek imzası number.
Task 10: review (sonnet) Approved, 0 Important.
Task 10: Ruling: başarılı girişte kullanıcı adı hız sınırı sayacı sıfırlanır (login.ts) — e2e tekrarları ve normal kullanım için — Task 11 dispatch'ine ek — maliyet: yok.
Task 10: minor (deferred): /secim tam oturumda "Oturumunuz açık" paneli (devam linki/redirect); LoginForm done sonrası sonsuz busy; ?next= /secim'de düşer; secim/page.tsx doğrudan prisma.role; --gold kontrast text-xs; safe-next percent-encoded test
Task 10: complete (commits 328883d..d7241d2, review clean)
Task 11: dispatched (BASE d7241d2, implementer opus)
Task 11: implementer DONE (commit c6e67cd). Ruling: "Kısayolu kaldır" silme işlemidir → danger:true (spec §5.1 "silme... her zaman sorulur") → fix round'a. Kabul: move pencereyi tamamen ekranda tutar; core.online needsHotel; iframe kind P0'da "henüz desteklenmiyor" (Task 12 ekler); çoklu sekme last-write-wins; sendBeacon yok.
Task 11: review (opus) ❌ 2 Important: Kısayolu kaldır danger değil; ConfirmDialog × düğmesinde Enter Evet sayılır. Ruling: minör #2 (store'da pencere sınırı yok → 31+ pencerede kayıt doğrulaması düşer, layout kaybolur: open() 30'da reddeder) ve #3 (restore'da z 300'den yeniden numaralandır) fix round 1'e eklendi — maliyet: yok.
Task 11: minor (deferred): pending localStorage kopyası sunucuyu ezer (timestamp karşılaştırması); Yenile dirty bayrağını sıfırlamıyor; resize klavye alternatifi yok; e2e testleri sıraya bağımlı; theme.css 735 satır (tek dosya zorunlu)
Task 11: fix round 1/5 (4 addressed, 0 open; commits c6e67cd..1c612d6). Kabul: periyodik z sıkıştırma (10 300'de) rank-koruyucu.
Task 11: complete (commits d7241d2..1c612d6, review clean)
Task 12: dispatched (BASE 1c612d6, implementer sonnet)
Task 12: implementer DONE (commit bef3eea). Kabul: openSessionsByHotel.code ek alanı; 30 sn KPI poll; playwright workers:1 (tek dev DB); About.tsx yok (iframe-only); MERIT_BUILD_DATE next.config'de.
Task 12: Ruling (güvenlik taraması): getCommandCenterKpis hotelId verilmediğinde scope = ctx.hotelIds içinden can(ctx,'CR-KOM','V',h) true olanlar; boşsa FORBIDDEN — otel bazlı yetki kısıtı toplulaştırmada da geçerli → fix round 1 — maliyet: otel başına 1 can() (request-cache'li).
Task 12: review (sonnet) Approved, 0 Important. Ruling: minör #1 (refresh in-flight guard) güvenlik düzeltmesiyle aynı tura eklendi — maliyet: yok.
Task 12: minor (deferred): hotels: hotelId ? 1 : length (pasif otel); session.* refresh ölü kod (SSE_EVENT_TYPES'ta session.* yok); distinct findMany → groupBy; test boşlukları (otel dışı alıcı, YONETIM About)
Task 12: fix round 1/5 (2 addressed, 0 open; commits bef3eea..6b046ce)
Task 12: minor (deferred): commandCenter.ts doc yorumu eski; refresh guard: hotelId değişimi kuyruklu yeniden çalıştırmada eski closure; in-flight guard'da timeout yok (hiç settle olmayan action KPI'ları dondurur); test auditLog.count tüm tabloyu sayıyor ve deleteMany tüm otel satırlarını siliyor
Task 12: complete (commits 1c612d6..6b046ce, review clean)
Task 13: dispatched (BASE 6b046ce, implementer sonnet)
Task 13: implementer DONE (commit 38b35eb). Ruling: mobil modda useShellPersistence viewport takibi ve pencere düzeni kaydı yapılmaz (telefonda açmak masaüstü düzenini sıkıştırıp kaydediyor) → fix round 1 — maliyet: yok. Kabul: Bildirimler event'te listeyi yeniden yükler; KPI refresh hook'u paylaşıldı; duvar kağıdı etiketleri types.ts'de; Tanımlar sekmesi Ayarlar'dan önce.
Task 13: review (sonnet) Approved, 0 Important. fix round 1 = mobil modda persistence klamp/kayıt yok (3 tuzak notuyla) + e2e SSE open bekleme (minör #2, flaky) — ruled in.
Task 13: minor (deferred): ?mobil=1 client-side navigasyonda kaybolur; unread badge aria-label span'da; tabpanel aria-labelledby
Task 13: fix round 1/5 (2 addressed, 0 open; commits 38b35eb..be28602)
Task 13: minor (deferred): mobilde başlayıp aynı sayfada masaüstüne geçişte 1920×1080 üstü ikon klampı (çok dar kenar durumu); waitForPrefsSave herhangi bir server action POST'una denk gelebilir (flake riski); setViewport ikonları yeniden klamplamaz
Task 13: complete (commits 6b046ce..be28602, review clean)
Task 14: dispatched (BASE be28602, implementer sonnet)
Task 14: implementer DONE_WITH_CONCERNS (commit 7fd8da5). Kabul: playwright reporter satırı; health pg-boss'u tembel başlatır (3 s timeout).
Task 14: review (sonnet) Approved, 1 Important (docs): kurulum.md HOSTNAME=127.0.0.1 next start'ta geçersiz → `npm start -- -H 127.0.0.1`. Ruling: minör "build için tüm env değişkenleri gerekli" ve "çoklu instance iddiası + login limiter per-instance" belge düzeltmeleri aynı tura eklendi — maliyet: yok.
Task 14: minor (deferred): README test DB komut sırası ve PowerShell notu; nginx listen http2 deprecated; seed şifresi komut satırında; route.ts yorum "falsy result"
Task 14: fix round 1/5 (4 addressed, 0 open; commits 7fd8da5..b4bf5b0)
Task 14: minor (deferred): kurulum.md migrate/seed için 5 değişken iddiası abartılı; pm2 iç içe -- aktarımı doğrulanmadı; bash source vs systemd EnvironmentFile parse farkı
Task 14: complete (commits be28602..b4bf5b0, review clean)
ALL TASKS COMPLETE — final whole-branch review dispatched (MERGE_BASE 9dbf8e9, HEAD b4bf5b0, opus)
FINAL REVIEW (opus): With fixes — 1 Critical (DateTime kolonları timestamp(3) w/o tz; constraint timestamptz) + 10 Important. Tek düzeltme dalgası dispatch edildi (BASE b4bf5b0, opus).
Ruling: Critical 1 → tüm DateTime (@db.Date hariç) @db.Timestamptz(3); migration 0003 `USING col AT TIME ZONE 'UTC'`; CI postgres servisine TZ=Europe/Istanbul (UTC dışı) — maliyet: bir migration (tablolar boş).
Ruling: Important 3 → OUTLET ve MUTFAK oturumlarında Ctx.hotelIds = [session.hotelId]; MINIBAR/YONETIM/SISTEM kapsam korunur (depo sorumlusu çok otel) — maliyet: outlet rolleri başka otel verisi görmez (spec §4.1 ile uyumlu).
Ruling: Important 7 → notify rol-bazlı fan-out tek yetkilendirme yardımcısıyla (hotelScope ∪ OutletMember oteli; rol = member override ?? base) — maliyet: bir sorgu daha.
Ruling: Important 1 → tek EventSource/sekme (zustand store), useSse abone olur; Important 2 → hata sonrası kimlik probu (HEAD /api/sse) 401 → /giris; Important 5 → /admin ve /admin/hakkinda assertCan ile; Important 6 → visibleScreens otel başına, masaüstü birleşim, HotelPicker can() ile süzülür; Important 8 → CSP frame-ancestors 'self' + X-Frame-Options SAMEORIGIN; Important 9 → safeAction'da unstable_rethrow; Important 10 → R-OTM e2e kullanıcısı + yetkisiz simge görünmez testi; Important 4 → listTargets modül kapılarıyla süzülür.
Deferred (P1 başında): seed matris assertion'ları; can() eksik testleri; başka kullanıcının çerezi varken giriş eski oturumu kapatır; realtime.resync; time.ts day doğrulama. Diğer minörler ertelenmiş kalır (final review triage).
Ruling (kullanıcı isteği 13:17, onaylı kısa tasarım): Task 15 "Denetim Masası + PWA yükle" plana eklendi; final düzeltme dalgası ve yeniden incelemesi bittikten sonra uygulanır (aynı kabuk dosyalarında iki yazar olmaması için) — maliyet: P0 kapanışı bir görev gecikir.
FINAL FIX WAVE: DONE_WITH_CONCERNS (commits 23390d3, bf04dac, e524bbb, 70d7fa7, 96498b8; 267 unit + 30 e2e, build OK). Kabul: usersEntitledTo SISTEM'i her otele dahil eder; restore görünmez otelli pencereyi yeniden bağlar/düşürür; /admin rol-kind kapısı + assertCan. Endişe: pgAdapter.ts tüm bağlantılarda TimeZone=UTC sabitler (adapter-pg offset'siz yazıyor) → re-review'da doğrulanacak. Not: requireUser modül kapılarını oturum ortasında yeniden kontrol etmez (deferred, P1).
FINAL FIX WAVE re-review dispatched (opus, b4bf5b0..96498b8). Ruling: Task 15 uygulayıcısı re-review ile paralel başlatıldı (re-review salt okunur; final sürecinde ikinci düzeltme dalgası yok, kalan bulgular kararla parke edilir) — maliyet: re-review bir shell dosyasında bulgu verirse Task 15 ile elle birleştirme gerekebilir.
Task 15: dispatched (BASE 96498b8, implementer opus)
FINAL FIX WAVE re-review (opus): 11/11 addressed, 0 open. pgAdapter TimeZone=UTC pini doğrulandı (adapter-pg offset'siz yazar/okur) — gerekli ve doğru.
Final: minor (deferred): usersEntitledTo base-rol dalı demote edilmiş üyeyi de bildirir (notify modül kapılarına bakmaz); birleşim görünürlüğü + oturum oteli kontrolü (Hakkında iframe içinde /admin'e yönlenebilir, otel bazlı CR-SYS satırı gerekir); sseStore ilk status "closed" (bir kare "kopuk"); HEAD probu aktivite sayılır (spec ile uyumlu); PgBouncer transaction pooling ile -c TimeZone startup parametresi uyumsuz → ALTER ROLE SET timezone; göç öncesi dev satırları 3 s kaymış (yalnız dev)
Task 15: implementer DONE_WITH_CONCERNS (commit 825eace; 274 unit, 36 e2e, build OK). Kabul: varsayılan M=12px (eski 11px "Küçük"); [data-theme] seçici; .xp-shell button color:inherit CSS hatası düzeltildi; sharp ile PNG ikonlar; mobil yazı tipi paylaşılan ayara bağlı. Endişe: sw.js VERSION elle bump; gerçek kurulum headless'ta test edilemez; Hakkında sayfası tema/yazı ayarını almıyor.
Task 15: review (sonnet) Approved, 0 Important. SW VERSION değerlendirmesi: hashed /_next/static ile eski uygulama sunulamaz; yalnız /icons/* elle bump — kabul.
Task 15: minor (deferred): Hakkında iframe sayfası yazı/tema ayarını almıyor; prompt iptali sonrası yanıltıcı metin; --xp-accent kullanılmıyor; test "0.1.0" sabit; listenForInstall çoklu çağrı; PWA yüzeyi tüm rotalarda (misafir sayfaları için /admin'e sınırla); maskable ikon güvenli alan; eski sekme prefs yazarsa varsayılanlar ezer (geçici); CR-SYS ekran adı "Sistem Ayarları"
Task 15: complete (commits 96498b8..825eace, review clean)
P0 COMPLETE: 15/15 task, final review + fix wave + re-review clean. Workspace docs/superpowers/plans/2026-10-31-p0-iskelet-ledger.md olarak arşivlendi.
