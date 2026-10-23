# Alemdar Cafe 101 Okey — Proje Rehberi ve Düzeltme Planı

Bu dosya, projede çalışacak herkesin (insan veya Claude) önce okuması gereken rehberdir.
Son inceleme: 2026-10-22. Bütün testler geçiyordu (`npm test`, 12 dosya).

---

## 1. Karar: Baştan yazma, buradan devam et

**Baştan yazmayın.** Gerekçe:

- Oyun kuralları sunucuda yetkili (server-authoritative) ve doğru kurulmuş: istemcinin gönderdiği taş nesnelerine veya puanlara güvenilmiyor, her hamle sunucuda doğrulanıyor.
- 101 kurallarının çoğu (katlamalı, çift açma, okey alma, işlek ceza, geri topla, yerden alma zorunluluğu) yazılmış ve testli. `botSimulation` testi 160 eli 106 taş bütünlüğüyle oynuyor.
- Takılma ve gecikmenin sebebi seçilen dil ya da framework değil. Sebep aşağıda listelenen belirli kod noktaları ve hepsi yerinde düzeltilebilir.
- Go, Redis, React/Next.js, Pixi.js **şu aşamada gerekli değil** (bkz. Bölüm 6).

Önce Faz 1 ve Faz 2 yapılmalı, sonra telefonda ölçülmeli. Pixi.js ancak ölçümden sonra hâlâ takılma varsa düşünülmeli.

---

## 2. Mimari özeti

| Katman | Teknoloji | Dosyalar |
|---|---|---|
| Sunucu | Node.js ≥22.13, Express 4, Socket.IO 4, düz JavaScript (CommonJS) | `server/index.js` (oda, tur, bot, tüm socket olayları), `server/gameLogic.js` (taş, doğrulama, puan), `server/accounts.js` (hesap/oturum, yerleşik `node:sqlite`), `server/avatars.js` (yüklenen profil resimleri, `/api/avatar/<id>`), `server/logger.js` |
| Ortak | Seri/per çözücü, hem tarayıcıda hem sunucuda çalışır. `probeGains` botun hızlı "çıkış" hesabı | `public/js/meldSolver.js` |
| İstemci | Düz HTML/CSS/JS, derleme adımı yok, DOM tabanlı çizim | `public/game.html` + `public/js/game.js` (masa), `public/index.html` + `public/js/main.js` (lobi), `public/js/tableGrid.js`, `stage-fit.js`, `transitions.js` |
| Veri | `DATA_DIR` (Coolify'da `/app/data`, **kalıcı volume zorunlu**): `accounts.db` (SQLite), `backups/` (günlük yedek), `rooms/` (süren masalar). Eski `accounts.json` ilk açılışta bir kez aktarılır ve yedek olarak bırakılır. Misafir avatarları yalnızca RAM'de | `server/accounts.js`, `server/roomStore.js` |
| Dağıtım | Dockerfile (node:22-alpine), Coolify, port 3000, `/health` | `Dockerfile`, `BASLAT-WINDOWS.bat` |

Akış: istemci `socket.emit(olay)` gönderir. Sunucu doğrular, durumu değiştirir ve `broadcastGame()` ile **her oyuncuya o oyuncunun tam görüntüsünü** (`snapshot`) yollar. İstemci `gameState` gelince `render()` ile her şeyi yeniden çizer.

---

## 3. Çalışma kuralları

- Değişiklikten sonra mutlaka `npm test` çalıştırılmalı (20 dosya). Testlerin hepsi geçmeden iş bitmiş sayılmaz.
- Yeni bir socket hamlesi eklenirse istemcide `MOVE_EVENTS` listesine de eklenmeli. Sunucu bu hamleye her durumda `gameState` veya `gameError` ile cevap vermeli, yoksa istemci 5 sn boyunca yeni hamle göndermez.
- Yeni bir oda zamanlayıcısı `guardedTimer(room, ad, fn)` ile kurulmalı.
- Testler `DATA_DIR` değişkenine bakar. Gerçek hesap dosyası bozulmasın diye testleri geçici bir klasörle çalıştırın: `$env:DATA_DIR="$env:TEMP\okey-test-data"; npm test`
- Statik dosyalar `?v=N` ile sürümleniyor (`game.html` içindeki `<script src="js/game.js?v=43">`). JS veya CSS değişince **v numarası artırılmalı**, yoksa production'da 7 günlük önbellek eski dosyayı gösterir.
- Yorumlar ve kullanıcıya görünen metinler Türkçe. Mevcut kod stiline uyulmalı.
- Oyun kuralı değişikliği yalnızca sunucuda yapılır. İstemci sadece öneri ve gösterim yapar. `meldSolver.js` her iki tarafta da kullanıldığı için oradaki değişiklik ikisini birden etkiler.
- Dosyalar 500 satırın altında tutulmalı. `server/index.js` (1295 satır) ve `public/js/game.js` (~1600 satır) bu sınırı zaten aşıyor, Faz 4'te bölünecek.
- **Asıl klasör bu kök klasör (`OKEY YENİ`)** ve GitHub'daki `hawarmarka/alemdarcafeonline` deposuna (`main` dalı) bağlı (2026-10-23). `alemdarcafeonline/` alt klasörü değişikliklerden önceki eski kopya; `.gitignore`'da, depoya girmez. Artık düzenlenmemeli, silinebilir.
- Git: sistemde PATH'te yok, GitHub Desktop'un git'i kullanılabilir: `C:\Users\HAWAR\AppData\Local\GitHubDesktop\app-3.6.7\resources\app\git\cmd\git.exe`. GitHub'a göndermek (push) Coolify'da yeni sürüm yayınlatabilir; göndermeden önce kullanıcıya sorulmalı.

---

## 4. Bulunan sorunlar (öncelik sırasıyla)

Önem dereceleri: 🔴 kritik · 🟠 yüksek · 🟡 orta · ⚪ düşük/temizlik

### 4.1 Sunucu: gecikme ve takılma yapanlar

| # | Önem | Yer | Sorun | Etkisi | Çözüm |
|---|---|---|---|---|---|
| S1 ✅ | 🔴 | `server/index.js:259-283`, `327-330` | Bot taş seçerken `seriesOuts()` her aday taş için ~30 farklı taşla `Melds.solve` çağırıyor. **Ölçüm: tur başına ortalama 41 ms, en kötü 108 ms** ve bu süre boyunca event loop tamamen bloke. | Node tek iş parçacığında çalışır. Bot bu hesabı yaparken **bütün masalardaki** oyuncuların hamleleri bekler. 50 botlu masada sunucu saniyenin büyük kısmını bununla geçirir ve herkes gecikme hisseder. | (a) Sonuçları el+tür anahtarıyla önbelleğe al. (b) Adayları önce ucuz `usefulness` puanıyla 4-5 taşa indir, pahalı hesabı yalnızca onlara yap. (c) Gerekirse bot hesabını `worker_threads` ile ayrı iş parçacığına taşı. Hedef: tur başına <5 ms. |
| S2 ✅ | 🔴 | `server/index.js:490-500` (`summary`), `910`; `server/accounts.js:65` | Oyuncu avatarı base64 data-URI olarak saklanıyor (misafirde 90 KB'a, hesapta 180 KB'a kadar) ve `summary()` her `gameState` ve `lobbyUpdate` mesajına 4 oyuncunun avatarını **her seferinde** ekliyor. | Her taş çekme veya atmada oyuncu başına **yüzlerce KB'a kadar** veri gidebiliyor. Mobil ağda gecikmenin bir numaralı adayı bu. | Avatarı bir kez yükle, sunucuda dosya olarak sakla (`/avatars/<id>.webp`) ve mesajda yalnızca URL veya kısa id gönder. Avatar bilgisini `gameState` içinden çıkar, sadece oyuncu katılınca gönder. |
| S3 | 🟠 | `server/index.js:510-534` | Her hamlede tam snapshot gidiyor: bütün atık yığınları, bütün açık gruplar, `roundHistory`, skorlar, oyuncu listesi. | Gereksiz bant genişliği. İstemci de her seferinde her şeyi yeniden çizmek zorunda kalıyor (bkz. İ2). | Kısa vadede S2'yi çöz, `snapshot`'tan değişmeyen alanları çıkar. Orta vadede olay bazlı küçük mesajlara geç (`tileDiscarded {seat, tile}`, `tileDrawn {seat}`) ve tam snapshot'ı yalnızca bağlanınca/yeniden bağlanınca gönder. Her durum mesajına sıra numarası (`seq`) koy. |
| S4 ✅ | 🔴 | `server/accounts.js:10-20` | Her kayıt, giriş, çıkış, avatar/çerçeve değişikliği ve **her el sonunda her oyuncu için** (`award`) bütün hesap veritabanı `writeFileSync` ile baştan yazılıyor. | Senkron disk yazımı event loop'u durdurur. Kullanıcı sayısı arttıkça dosya büyür, takılma da uzar. | SQLite'a (`better-sqlite3`, tek dosya, kurulum yok) veya PostgreSQL'e geç. Ara çözüm: asenkron yazma ve 2 saniyelik toplu yazma (debounce). |
| S5 ✅ | 🟠 | `server/accounts.js:24` | Şifre hash'i `crypto.scryptSync` ile hesaplanıyor. Her giriş/kayıt event loop'u bloke ediyor (bu makinede ölçüm: ~27 ms; Coolify sunucusunun zayıf CPU'sunda daha uzun). | Aynı anda birçok kişi giriş yaparsa oyundaki herkes takılır. | `crypto.scrypt` (asenkron, callback/promise) kullan. |
| S6 ✅ | 🟡 | `server/gameLogic.js:110-112`, `210` | Her el başında ve **her atılan taşta** `console.log` yapılıyor. Okey ve gösterge de loglanıyor. | Linux'ta pipe'a yazılan stdout senkron olduğu için gereksiz yük. Okeyin loglara düşmesi ayrıca bilgi sızıntısı. | Production'da `Logger.game`/`debug` kapat (`LOG_LEVEL` env). Okey/gösterge logunu kaldır. |
| S7 ✅ | 🟡 | `server/index.js:16-24` | `authHits` haritası hiç temizlenmiyor. | Uzun süre açık kalan sunucuda bellek sızıntısı (küçük ama sürekli). | `setInterval` ile süresi geçen kayıtları sil. |
| S8 | 🟡 | `server/accounts.js:46` | Süresi dolmuş oturumlar `db.sessions` içinde sonsuza kadar kalıyor. | Dosya büyür, S4'ü kötüleştirir. | Başlangıçta ve günde bir süresi dolanları sil. |
| S9 | 🟡 | — | Statik dosyalar için sıkıştırma (gzip/brotli) yok. | 330 KB CSS ve büyük JS sıkıştırılmadan gidiyor. İlk açılış yavaş. | Reverse proxy (Coolify/Traefik) sıkıştırma yapıyorsa doğrula, yapmıyorsa `compression` middleware ekle. |

### 4.2 Sunucu: hata ve güvenlik riskleri

| # | Önem | Yer | Sorun | Çözüm |
|---|---|---|---|---|
| H1 ✅ | 🔴 | `server/accounts.js:8` | `accounts.json` okunamaz veya bozuksa hata sessizce yutuluyor ve `db` boş başlıyor. **İlk `save()` çağrısı bütün hesapları siliyor.** | Dosya var ama parse edilemiyorsa sunucu başlamasın (veya `.bak` yedeğe dönsün). Her yazımdan önce yedek al. SQLite'a geçince sorun kökten çözülür. |
| H2 ✅ | 🟠 | `server/index.js:890` + `public/js/game.js:567` | Misafir oyuncu adı hiçbir karakter kontrolünden geçmiyor (sadece 20 karakterle kesiliyor). `showGiftEffect` bu adı `innerHTML` ile sayfaya basıyor. **HTML/JS enjeksiyonu (XSS) mümkün.** Oturum token'ı `localStorage`'da tuttuğu için (`game.js:8`) çalınabilir. | Sunucuda misafir adını hesap adıyla aynı kurala bağla: `/^[\p{L}\p{N}_ -]{2,20}$/u`. İstemcide `innerHTML` yerine `textContent` kullan (`game.js:567`). Diğer `innerHTML` kullanımları (`game.js:415,418`, `main.js:284,288`) sabit metin, ama gözden geçirilmeli. |
| H3 | 🟠 | `server/index.js:1286-1292` | Masalar yalnızca RAM'de. Her deploy veya çökme **devam eden bütün oyunları siliyor**. | Kısa vadede deploy'u oyun az iken yap. Orta vadede her hamleden sonra oda durumunu (JSON) SQLite'a veya Redis'e yaz, açılışta geri yükle. Redis'in gerçekten gerekli olduğu yer burası ve çoklu sunucu durumu. |
| H4 | 🟡 | `server/index.js:686`, `751`, `915` | Skorlar oyuncu **adına** göre tutuluyor (`room.scores[name]`). Koltuk/indeks yerine ad kullanmak; yeniden adlandırma, bot devri ve aynı ada yakın isimlerde kırılgan. | Skoru koltuk indeksine göre tut (`scores[seat]`). |
| H5 | 🟡 | `server/gameLogic.js:67-72` | Karıştırma `Math.random` ile yapılıyor. | Kriptografik olarak tahmin edilebilir değil ama adil dağıtım için `crypto.randomInt` kullanmak doğrusu. |
| H6 | 🟡 | `public/js/meldSolver.js:60` | Arama 65.000 adımda kesiliyor ve kesilince **sessizce 0 puan** dönüyor. | Nadir ellerde bot/öneri yanlış karar verebilir. Kesilince o ana kadarki en iyi sonucu döndür, ya da kesme olduğunu işaretle. |
| H7 | ⚪ | `server/index.js:1287` | Kapanış logu `${signal}` yerine boş yazıyor: `` ` alındı, sunucu kapanıyor...` `` | `` `${signal} alındı...` `` yap. |
| H8 | ⚪ | `server/index.js:1243` | Elle "yeni el" isteği `room.players.some(p => !p.socketId)` kontrolü yüzünden botlu masada hiç çalışmıyor (botların `socketId`'si yok). Otomatik 5 saniyelik geçiş bunu gizliyor. | `!p.socketId && !p.isBot` yap. |
| H9 | ⚪ | `server/index.js:980` | İki socket olayı (`leaveGame`, `throwTomato`) aynı satırda. | Ayrı satırlara böl. |
| H10 | ⚪ | Oyun olayları | Sohbet dışındaki socket olaylarında hız sınırı yok. | Socket başına basit bir token-bucket ekle (örn. saniyede 20 olay). |

### 4.3 İstemci: akıcılık (60 FPS) sorunları

| # | Önem | Yer | Sorun | Çözüm |
|---|---|---|---|---|
| İ1 ✅ | 🔴 | `public/js/game.js:632-647`, `649-673` | Sürüklenen taş `style.left/top` ile taşınıyor. Bu, **her fare/parmak hareketinde** layout (sayfa düzeni) hesaplatır. Aynı olayda `findDropGroup` → `elementFromPoint` + bütün masa taşları için `querySelectorAll` + `getBoundingClientRect` çalışıyor. | `transform: translate3d(x,y,0)` kullan, ghost'a `will-change: transform` ver. Hareketi `requestAnimationFrame` ile kare başına bir kez işle. Masa grubu dikdörtgenlerini sürükleme başında bir kez ölçüp önbelleğe al, hareket sırasında sadece bu önbellekle hesapla. |
| İ2 ✅ | 🟠 | `public/js/game.js:1138-1153`, `861-884`, `1014-1068`, `108-136` | Her `gameState` mesajında (yani herhangi bir oyuncunun her hamlesinde) ıstakanın 32 yuvası, masadaki bütün gruplar, skor tablosu ve atık yığınları **sıfırdan yeniden oluşturuluyor**, olay dinleyicileri de tekrar bağlanıyor. | Değişmeyen parçayı yeniden çizme: her bölüm için bir imza (ör. id listesi) tut, imza aynıysa atla. Istakada taş elemanlarını id ile sakla ve sadece yer değiştir. Olay dinleyicisini her taşa değil kapsayıcıya bir kez bağla (event delegation). |
| İ3 ✅ | 🟠 | `public/js/game.js:500-525` | `updateTurnClock` her 100 ms'de `querySelectorAll` çalıştırıyor ve süre çubuklarının `width`/`left` değerini değiştiriyor, bu da layout tetikler. | Süre çubuğunu tek seferlik CSS animasyonu yap (`transform: scaleX`, `animation-duration = kalan süre`). JS sadece sıra değişince çalışsın. Saniye yazısı için 1 sn'lik güncelleme yeterli. |
| İ3b | 🟡 | `public/js/game.js:871`, `856-860` | `renderRack` her taş için `isIslekTile` çağırıyor. Bu da her masa grubu için `isValidGroup` çalıştırıyor (taş × grup × 2). | El+masa imzasıyla önbelleğe al. |
| İ4 ✅ (ölçüldü, gerek yok) | 🟠 | `public/css/` | 20 CSS dosyası (~330 KB), `game.html` 19 ayrı stylesheet yüklüyor. `v17-fixes.css`'ten `v29-pro.css`'e kadar üst üste yamalar, **3109 adet `!important`**, 277 `box-shadow`, 93 `filter`, 15 `backdrop-filter`. | Tarayıcı her değişiklikte çok pahalı stil hesabı yapıyor. Özellikle `backdrop-filter` ve büyük `filter`/`box-shadow` mobil GPU'da kare düşürür. Yamaları tek bir temiz dosyada birleştir, ölü kuralları at, hareket eden elemanlarda `backdrop-filter`/büyük gölge kullanma. |
| İ5 ✅ | 🟡 | `public/asset/` | Büyük PNG'ler: `ui/skor-tablosu.png` 623 KB, `ui/istaka.png` 523 KB, `ui/masa-bekleme.png` 474 KB, `avatars/alibicim.png` 437 KB. | WebP/AVIF'e çevir ve gerçek gösterim boyutuna küçült. Toplamda ~2 MB kazanç, ilk açılış ve bellek iyileşir. |
| İ6 ✅ | 🟡 | `public/js/game.js:706-720` | İyimser (optimistic) arayüz yok. Taş çekme/atma sunucudan cevap gelene kadar görünmüyor, ağ gecikmesi doğrudan hissediliyor. | Taş atınca taşı hemen atık alanına uçur ve ıstakadan kaldır. Sunucu `gameError` dönerse geri al. Istaka içi taşıma zaten yerel. |
| İ7 | ⚪ | `public/js/game.js:1504-1508` | Saniyelik oturum sayacı ayrı bir `setInterval`. | İ3 ile birleştir. |

### 4.4 Temizlik ve ölü kod

| # | Yer | Not |
|---|---|---|
| T1 | `server/roomManager.js` | Hiçbir yerde kullanılmıyor. Silinebilir. |
| T2 | `server/gameLogic.js:411-641` | `openHand`, `openWithPairs`, `addToTableGroup`, `checkFinish`, `checkInstantFinish`, `backtrackGroups`, `canFinishWithPairs`, `tableGroups` kullanılmıyor (gerçek mantık `index.js` içinde). Silinmeli ki iki farklı kural kaynağı oluşmasın. |
| T3 | `public/js/game.js:474-492` | `renderRoundScoresTable` çağrılmıyor. |
| T4 | `public/js/game.js:1179` | `findAvailablePairs` kapanışı ile `showPairsModal` aynı satırda (`}function`). |
| T5 | Testler | Test çıktısı oyun loglarıyla dolu (S6 ile birlikte çözülür). |
| T6 | Kök dizin | Git deposu değil, depo `alemdarcafeonline/.git` altında. Tek kaynağa inilmeli. |

---

## 5. Yol haritası (yapılacaklar listesi)

Her madde bitince `[x]` yapın ve ilgili tabloya "✅ yapıldı" notu düşün. Her fazın sonunda `npm test`.

### Faz 0 — Hazırlık (yarım gün)
- [x] Asıl çalışma klasörü kök klasör (2026-10-23). `.git` kopyadan köke alındı; kopya klasör yerinde duruyor, silinmesi kullanıcıya bırakıldı. (T6)
- [x] Bu oturumdaki bütün değişiklikler yerel commit olarak kaydedildi (`2189fa5`). GitHub'a henüz gönderilmedi.
- [ ] Ölçüm altyapısı: sunucuya event-loop gecikmesi ölçümü (`perf_hooks.monitorEventLoopDelay`) ekle, `/health` içinde p99 değerini göster. İstemcide geliştirme modunda FPS sayacı.

### Faz 1 — Sunucu gecikmesi (en büyük kazanç, 1-2 gün)
- [x] S1 (2026-10-22): `seriesOuts` artık `Melds.probeGains` kullanıyor. Kalan el bir kez çözülüyor, her deneme taşı için yalnızca o taşı içeren gruplar deneniyor. Aynı türden adaylar bir kez hesaplanıyor. **Bot kararları eskisiyle birebir aynı** (3200 adayda fark 0, `okeyFuzz` testi bunu her çalıştırmada doğruluyor). Ölçüm (150 maç, ~12.500 bot turu): ortalama 11,1 → 4,0 ms, p95 51 → 17 ms, p99 91 → 28 ms, en kötü 412 → 107 ms. Not: "en iyi N adayı hesapla" kısa listesi denendi, kaliteyi ölçülebilir biçimde değiştirmediği ama davranışı değiştirdiği için eklenmedi. Daha fazla hız gerekirse ilk aday odur.
- [x] S2 (2026-10-22): `server/avatars.js` resmi içerik hash'iyle bir kez saklıyor, mesajlarda `/api/avatar/<id>` gidiyor (1 yıllık `immutable` önbellek). 2 profil resimli masada `gameState` 159,6 KB → 3,4 KB, `lobbyUpdate` 157,4 KB → 1,1 KB. Misafir resimleri RAM'de (64 MB sınırı, en eski silinir). Sunucu yeniden başlarsa misafir resmi 404 olur ve istemci varsayılan avatara döner. Hesap resimleri veritabanından tekrar yüklenir.
- [x] S4 + H1 (2026-10-22): Hesaplar `node:sqlite` ile `accounts.db`'de (ek paket yok, Node ≥22.13). Her işlem tek satır yazıyor. `accounts.json` ilk açılışta aktarılıp yedek olarak bırakılıyor. Bozuksa dosyaya dokunulmuyor ve hiçbir hesap silinmiyor, düzeltilince tekrar deneniyor. Açılışta süresi dolan oturumlar siliniyor (S8'in bir kısmı).
- [x] S5 (2026-10-22): `crypto.scrypt` (asenkron). `register`/`login` artık Promise döndürüyor, API rotaları `await` ediyor. Test, giriş sürerken event loop'un serbest kaldığını ve aynı adla eşzamanlı iki kayıtta yalnızca birinin başarılı olduğunu doğruluyor.
- [x] S6 (2026-10-22): `LOG_LEVEL` desteği (`server/logger.js`). `NODE_ENV=production` (Dockerfile'da açık) iken varsayılan `info`, yani `Logger.game`/`debug` sessiz. Hata ayıklamak için `LOG_LEVEL=debug`. Okey/gösterge logu kaldırıldı.
- [x] S7 (2026-10-22): `authHits` her dakika temizleniyor.
- [ ] S8: Kalan kısım: sunucu uzun süre açık kalırsa süresi dolan oturumların periyodik silinmesi (açılışta silme yapılıyor).

### Faz 2 — İstemci akıcılığı (2-3 gün)
- [x] İ1 (2026-10-22): Sürüklenen taş `translate3d` ile taşınıyor ve kare başına bir kez (`requestAnimationFrame`) çiziliyor. Masa taşlarının konumu sürükleme başında bir kez ölçülüyor, masa yeniden çizilirse sıfırlanıyor. Sürükleme sırasında `elementFromPoint` yerine bu ölçülmüş dikdörtgenler kullanılıyor; tek başına kare başına 0,7 ms tutuyordu. Bırakma anında gerçek DOM isabet testi yapılıyor. Vurgu sınıfları yalnızca hedef grup değişince güncelleniyor. Ölçüm (masaüstü Chrome, 150 kare): kare başına JS işi 1,15 ms → 0,13 ms.
- [x] İ3 (2026-10-22): Üst süre çubuğu (`scaleX` + ray `translateX`) ve oyuncu paneli dolgusu (`clip-path`) Web Animations API ile akıyor. JS yalnızca sıra, görünürlük veya aktif oyuncu değişince animasyonu kuruyor; son 10 saniye uyarısı tek bir `setTimeout`. 100 ms'lik `setInterval` ve sürekli `width`/`left` geçişleri (her karede layout) kaldırıldı. Güvenlik için 1 sn'lik kontrol kaldı, değişiklik yoksa hiçbir şey yapmıyor. Gizli `.player-turn-clock` artık güncellenmiyor.
- [x] İ2 (2026-10-22): `game.js` içinde `changed(bölüm, imza)` var. Istaka, masa grupları, atık yığınları, gösterge ve skor tablosu girdileri değişmediyse DOM'a dokunulmuyor. Sık güncellenen metinler `setText` ile yalnızca farklıysa yazılıyor. Ölçüm (masaüstü Chrome, `render()` + layout): değişiklik yok 3,1 → 0,07 ms; rakip taş attı 3,6 → 1,6 ms (uçuş animasyonu dahil); masada grup değişti 2,4 ms (masa ve işlek işaretleri için ıstaka yeniden çiziliyor). **Yeni kural:** bir bölümün çiziminde kullanılan yeni bir değer eklenirse o bölümün imzasına da eklenmeli, yoksa ekran güncellenmez. Event delegation yapılmadı: ıstaka artık yalnızca değişince yeniden kuruluyor, kazancı küçük kaldı.
- [x] İ6 (2026-10-22): Taş atma iyimser (`applyOptimisticDiscard`). Taş hemen ıstakadan kalkıp atık alanına uçuyor ve sıra sonraki oyuncuya geçmiş görünüyor. Sunucudan gelen `gameState` gerçek durumu yazıyor. `gameError`, bağlantı kopması veya 8 sn cevapsızlıkta eski hale dönülüyor. Yerden alınan taş henüz kullanılmadıysa iyimser gösterim yapılmıyor (sunucu zaten reddeder). Taş çekme iyimser değil: desteden gelecek taş bilinmiyor. Yerden çekme ileride yapılabilir.
- [ ] Gerçek bir orta seviye Android telefonda Chrome DevTools Performance kaydıyla ölç. Sürüklemede 60 FPS hedefi.

### Faz 3 — Güvenlik ve sağlamlık (1 gün)
- [x] H2 (2026-10-23): Misafir adında yalnızca harf/rakam/boşluk/`_.-` kalıyor. Hediye bildirimi `textContent` ile yazılıyor.
- [x] H4 (2026-10-23), farklı çözümle: skorlar hâlâ ada göre ama gerçek hata giderildi. Oyundan önce ayrılan oyuncunun 0 puanlık satırı kalıp maç sonunda "şampiyon" görünebiliyordu. Artık `removeSeats` satırı siliyor ve şampiyon yalnızca masadakiler arasından seçiliyor. Takım modunda şampiyon `team1` yerine "A & B" adlarıyla yazılıyor.
- [x] H5 (2026-10-23): Karıştırma ve başlayan oyuncu `crypto.randomInt` ile.
- [x] H6: Ölçüldü, sorun değil. 6000 elde arama sınırı bir kez bile devreye girmedi ve sonuç değişmedi (sınırsız en kötü 9 ms). Kod değişmedi.
- [x] H7, H9 (2026-10-23).
- [x] H8 (2026-10-23): Elle "yeni el" isteği botları hazır sayıyor. Bütün gerçek oyuncular hazır olunca el başlıyor.
- [x] H10 (2026-10-23): Socket başına token bucket (30 anlık, saniyede 15). Fazlası işlenmiyor, 2 saniyede bir uyarı gidiyor.
- [x] Ek (2026-10-23): Socket olay işleyicileri `try/catch` ile sarılı; hatalı bir istek sunucuyu düşürmüyor, oyuncuya hata dönüyor. Bütün oda zamanlayıcıları (`guardedTimer`) hata verirse `recoverRoom` devreye giriyor: önce otomatik hamle deneniyor, olmazsa el iptal edilip yeniden başlatılıyor. Masa donmuyor.
- [x] Ek (2026-10-23): İstemcide sıra hamleleri (`MOVE_EVENTS`) sunucu cevap verene kadar tekrar gönderilmiyor. Çift tıklama ve hızlı dokunuş artık "zaten taş aldınız" gibi hatalar üretmiyor (5 sn güvenlik süresi var). Kendi profilinde hediye düğmeleri gizli.
- [x] S8 (2026-10-23): Süresi dolan oturumlar 6 saatte bir siliniyor.
- [ ] S3: `snapshot`'tan değişmeyen alanları çıkar, `seq` numarası ekle (S2 sonrası mesaj zaten ~3 KB, öncelik düşük).

Canlı kural testi (2026-10-23, tarayıcıda, gerçek düğmeler/fonksiyonlarla): seri açma (+60 sn), geri toplama (101 ceza), işleme ve bir gruba turda en fazla 2 taş, masadaki okeyi alma, yerden alma zorunluluğu + GERİ BIRAK + aynı taşı tekrar alamama, işlek ve okey atma cezası, çift açma penceresi (el puanı ×2), eli bitirme. Hepsi beklendiği gibi çalıştı. Ayrıca 3 ellik eşli ve katlamalı otomatik maç oynandı, ortasında sayfa yenilendi (aynı el ve ıstaka dizilimi geri geldi). Sonuç: 0 hata, 0 JS hatası, takılma yok. Test aracı `debugSetup` (yalnızca `OKEY_DEBUG=1`) artık `reset`, `pairsOpponent` ve `myGroups` alıyor.

Ek (2026-10-23, kullanıcı isteği):
- Yardımsız masada SERİ DİZ / ÇİFT DİZ kapalı.
- Istakada çift dokunuş taşı atıyor (okeyde yüzü çeviriyor). `dblclick` kullanılamaz: ilk dokunuş ıstakayı yeniden çizer; çözüm `pointerEnd` içinde `lastTap`.
- Desteye tıklayınca taş çekiliyor.
- Sürüklerken tutulan taşın yeri soluk (`drag-source`), kopya tam opak ve gerçek boyutta. Bırakınca taş yeni yuvasına kayarak oturuyor.
- Elle işlemede uçan taşın ekranı kaplama hatası giderildi. Sebep: `.grid-table-tile{width:100%!important}` sayfa gövdesinde ekran genişliği oluyordu; `flyTile` ölçüleri artık `!important` ile veriyor.
- Hazır avatarlar artık çizim SVG `av01..av10.svg` (eski fotoğraflar silindi, kayıtlı eski adlar varsayılana döner). Profil penceresinde seçilebiliyor, botlar rastgele birini alıyor.
- Kural: seri açmış oyuncu, masada çift açan biri varsa elindeki okeysiz çiftleri ÇİFT AÇ ile çift panosuna indirebilir (`laySeriesPairs`, `state.extraPairs`; seri gruplarından ayrı tutulur, istemciye `extraPairs` olarak gider). Botlar da aynı kuralı kullanır.
- Istaka düzeni: desteden çekilip bir yuvaya bırakılan taş için kaydırma yalnızca aynı rafta ve en yakın boş yuvaya kadar yapılır. Boş yuvaya bırakılan taş için hiçbir taş oynamaz. Hatırlanan "eski yer" (GERİ TOPLA için) tek taş çekişinde kullanılmaz. Önceden ilk boş yuvaya kadar her şey kayıyordu.
- Okey görünümü (2026-10-24): gerçek okey her yerde (ıstaka, masadaki seri/per, çift panosu, atık) arkası dönük düz beyaz taş (`okey-back`). Yüz, yıldız, "OKEY" yazısı, altın çerçeve ve alt nokta yok. Yüz çevirme kaldırıldı; okeye çift dokunuş taşı atmaz, uyarı verir (101 ceza). `real-okey` sınıfı korunuyor; masadaki okeyi alma bunun üstünden çalışıyor.
- Hediye albümü: 12 hediye (`GIFTS` istemcide, `GIFT_IDS` sunucuda, ikisi aynı olmalı). Her hediyenin alıcıya ve diğerlerine okunan esprili cümlesi var (`speechSynthesis`, ses kapalıysa okunmaz).

Doğrulama (2026-10-23): `tests/v34Stability.test.js` yukarıdakileri test ediyor. Ayrıca tarayıcıda 2 ellik tam maç otomatik oynandı: her turda taş çekme 4 kez, atma 2 kez art arda basıldı. Sonuç: 0 hata mesajı, 0 JS hatası, takılma yok. Bir el seri açılarak oynandı. "YENİ OYUNA BAŞLA" yeni masaya oturttu.

### Faz 4 — Kod düzeni (2-3 gün, davranış değişmeden)
- [ ] `server/index.js`'i böl: `rooms.js` (oda/koltuk), `turns.js` (süre/tur), `bot.js` (bot kararları), `moves.js` (socket hamleleri), `http.js` (API).
- [ ] `public/js/game.js`'i böl: `rack.js`, `table.js`, `drag.js`, `hud.js`, `net.js`.
- [ ] T1-T4 ölü kodu sil.
- [x] İ5 (2026-10-23): Oyunda gerçekten yüklenen PNG'ler WebP'ye çevrildi (tarayıcının kendi kodlayıcısıyla, boyut aynı, kalite 0,9; taş sprite'ı 0,95). Hazır avatarlar 256 px'e küçültüldü. 3,2 MB → 393 KB (%88). Oyun sayfası artık hiç PNG indirmiyor. Taşlar, ıstaka ve skor tablosu ekranda kontrol edildi. Hazır avatarların **kayıtlı adları** (`alibicim.png` vb.) değişmedi; hesaplarda ve tarayıcıda bu adlar duruyor. `webpAvatar()` gösterirken `.webp` sürümünü kullanıyor. Eski PNG'ler (3,2 MB) silinmedi: eski önbellekli CSS'ler hâlâ onları isteyebilir, birkaç hafta sonra silinebilir.
- [x] İ4 (2026-10-23): Ölçüldü; dosyalarda değişiklik yapılmadı. O an hiçbir elemana uymayan 576 kural (%34) tarayıcıda geçici olarak silindi: tam stil hesabı 5,5 → 5,9 ms, yani fark yok. Oyundaki gerçek stil+layout işi (sıra değişince `body.my-turn`) 0,9 ms. Oyun sırasında sürekli çalışan tek ana iş parçacığı animasyonu, aktif paneldeki küçük `fillSparkle` (boyama alanı küçük). Sonuç: CSS oyun akıcılığında darboğaz değil. Kural silmek veya birleştirmek görünümü bozma riski taşıyor ve kazancı yok. Birleştirme yalnızca ilk açılışta 18 isteği 1'e indirir; bunun yerine production'da gzip/brotli açık mı kontrol edilmeli (S9).
- [ ] İsteğe bağlı: JSDoc tipleri + `// @ts-check` ile TypeScript'in faydasını derleme adımı eklemeden al.

### Faz 5 — Büyüme (sadece ihtiyaç olunca)
- [x] H3 (2026-10-24): `server/roomStore.js` her masayı `DATA_DIR/rooms/<KOD>.json` dosyasına yazıyor. Değişen masalar 2 sn'de bir, kapanışta (SIGTERM) hepsi yazılıyor; masa kapanınca dosyası siliniyor, 30 dk'dan eski dosya yüklenmiyor. Yükleme açılışta değil, `rejoinRoom` / kodla katılmada eksik masa istenince yapılıyor (`RoomStore.load`). Sebep: Coolify yeni sürümü eskisi kapanmadan başlatır; eski sürüm kapanırken son hali yazar, oyuncular ancak ondan sonra yeni sürüme bağlanır. `reviveRoom` oyun nesnesini (`GameLogic`) ve zamanlayıcıları yeniden kuruyor; dönmeyen gerçek oyuncunun yerine 60 sn sonra bot geçiyor (`scheduleSeatTakeover`). Tarayıcıda denendi: sunucu kapatılıp açıldı, aynı el, taşlar, ıstaka dizilimi ve atıklar geri geldi, oyun devam etti. Test: `tests/v35Persistence.test.js`. **Yeni kural:** odaya zamanlayıcı dışında kalıcı olmaması gereken alan eklenirse adı `...Timer` ile bitmeli ya da `roomStore` replacer'ına eklenmeli.
- [x] Veri güvenliği (2026-10-24): `/health` artık `storage` döndürüyor: `persistent` / `ephemeral` / `memory` / `unknown`. `/proc/self/mountinfo` ile `DATA_DIR` gerçek bir bağlama noktasında mı diye bakılıyor. `ephemeral` ise production'da büyük bir log uyarısı çıkıyor. Hesap veritabanının günlük yedeği alınıyor (`VACUUM INTO`, `backups/`, son 7 gün). Kapanışta veritabanı kapatılıyor. **Asıl koruma Coolify'da `/app/data` volume'üdür; kod bunu yapamaz, sadece görünür kılar.**
- [x] HEMEN OYNA (2026-10-24): aynı türde bekleyen herkese açık masaya oturuyor. Oyuncunun "Masa Aç" ile açtığı masaya yalnızca kuralları seçilen türle aynıysa giriyor (tekli, aynı katlama/yardım). İçinde gerçek oyuncu bekleyen masa önce seçiliyor.
- [x] Yalnız bot kalan masa kapanıyor (2026-10-24): oyun sürerken son gerçek oyuncu ayrılınca ya da bağlantısı 60 sn kopunca masa siliniyor; önceden botlar sonsuza dek kendi kendine oynuyordu.
- [ ] Birden fazla sunucu gerekirse: Redis + `@socket.io/redis-adapter`, odaları sunucuya sabitle (sticky session).
- [ ] Ölçüm hâlâ istemci tarafında takılma gösteriyorsa: yalnızca masa/ıstaka alanını Pixi.js'e taşı. Lobi ve menüler HTML kalabilir.

---

## 5b. 101 Okey Plus (Zynga) karşılaştırması (2026-10-24)

101okeyplus.com incelendi: lobi, masa, kurallar sayfası. **İlke:** mekanikler ve kurallar kendi kodumuz ve kendi görsellerimizle yapılır. Zynga'nın görselleri, kodu, logosu ve markası kopyalanmaz (telif ve marka hakkı). Gerçek parayla satış yapılmaz.

**Kurallar (bizde zaten aynı):** 21/22 taş, 101 veya 5 çift ile açma, katlamalı (sonraki açan +1 puan / +1 çift), turlu (1-4 el), yardımlı/yardımsız, bir gruba turda en fazla 2 taş işleme, işlek/okey atma ve hatalı açma/geri toplama cezası 101, 12-13-1 geçersiz, yerden alınan taşla açma zorunluluğu.

**Kural farkları:**
- Kazanan: Okey Plus'ta eli bitiren olmasa da **elini açıp en az cezayı alan** kazanır; açmayanlar kaybeder. Bizde puan tablosu var, kazanan en düşük toplam puan; çip dağıtımı yok.
- Okey: Okey Plus'ta yardımlı masada okey ters, yardımsızda yüzü açık. Bizde kullanıcı isteğiyle her yerde ters.
- "Seri açan çift işleme yapabilir": bizde masada çift açan varken yapılabiliyor (kullanıcının tarif ettiği kural).

**Yapılanlar (2026-10-24):**
- ✅ Çip ekonomisi: `server/economy.js` (`settle`, `BET_LEVELS` = 1.000 / 5.000 / 25.000 / 100.000 VIP, `FEE_RATE` = %7). Hesaplarda `chips` (başlangıç 10.000) ve `bonus_at` sütunları var; eski veritabanına `ALTER TABLE` ile ekleniyor. Bahis maç başında (`takeBets`, ilk elde) alınıyor; çip değişimi maç sonunda (`settleMatch`) oluyor. Çipi yetmeyen hesap masaya oturamıyor. Misafir çipsiz oynuyor: bahis alınmıyor, pay da almıyor. Botların payı yok oluyor. Oyun ortasında ayrılanın bahsi gidiyor (yerine geçen botun hesabı yok). `room.openedEver`: maç boyunca açan koltuklar. Eşli oyunda kazanan takım potu paylaşıyor.
- ✅ Hediye çip: `POST /api/bonus`, 4 saatte bir `1.000 + 100 × (seviye-1)`; çipi 1.000'in altındaysa 5.000 destek. Lobide geri sayımlı "HEDİYE ÇİP" düğmesi var.
- ✅ Seviye ödülü: `Accounts.award` seviye atlayınca `seviye × 500` çip veriyor, oyuncuya `levelUp` olayı gidiyor.
- ✅ Lobi: üst çubukta çip miktarı (ZAFER/OYUN yerine), Masa Aç'ta BAHİS seçimi, Oda Seç'te masa bahsi, sıralamada ÇİP / SEVİYE sekmesi (`/api/leaderboard?by=chips`). HEMEN OYNA 1.000'lik masalara oturuyor.
- ✅ Masa: sol üst 🪙 kendi çipin (`myChips`), bekleme panelinde masa bahsi, maç sonunda kazanç/kayıp ve masa ücreti.
- Test: `tests/v36Economy.test.js`.
- ✅ Arkadaşlar, mesajlar ve masaya davet. Yalnızca hesabı olanlar kullanabilir.
  - Veri `server/social.js` içinde: `friends` ve `messages` tabloları, `accounts.db` içinde. İstek gönderilir, kabul edilince iki yönlü arkadaşlık olur. İki taraf birbirine istek gönderirse doğrudan arkadaş olurlar. En fazla 200 arkadaş eklenebilir.
  - Mesajlar yalnızca arkadaşlar arasında gidiyor: en fazla 300 karakter, saniyede bir mesaj. Okunmamış mesajlar rozet olarak görünüyor.
  - Bağlantı `server/socialHub.js` içinde: `/api/friends*` ve `/api/messages` uçları. Sayfa açılınca `hello` olayıyla hangi hesabın çevrimiçi olduğu bildiriliyor (giriş ya da çıkışta tekrar gönderiliyor).
  - Anlık bildirimler `social` olayıyla gidiyor (istek, kabul, mesaj).
  - Davet `inviteFriend` olayıyla gidiyor: yalnızca masadayken, yalnızca çevrimiçi bir arkadaşa ve 3 saniyede en fazla bir kez. Alıcıya `invite` olayıyla masa bilgisi ulaşıyor.
  - İstemci tarafı ortak `public/js/social.js` ve `public/css/social.css` dosyalarında; `Social.init` ile başlatılıyor.
    - Lobide alt çubukta arkadaşlar düğmesi var; rozeti okunmamış mesaj ve bekleyen istek sayısını gösteriyor. Arkadaş masadaysa "MASAYA GİT" düğmesi çıkıyor.
    - Masa bekleme panelinde "ARKADAŞ DAVET ET" ve "MESAJLAR" düğmeleri var.
    - Gelen davet üstte bir kartla gösteriliyor (KATIL / HAYIR).
    - Masadayken bir davet kabul edilirse oyuncu önce masadan ayrılıyor, ardından lobide `sessionStorage.inviteJoin` ile davet edilen masaya oturuyor.
  - Test: `tests/v37Social.test.js`. Tarayıcıda iki hesapla denendi; istek, kabul, sohbet, davet ve masadayken davete katılma çalıştı.
- ✅ Koltuk seçimi (2026-10-24, Okey Plus'taki gibi). ODA SEÇ artık liste değil, masa gezgini: masalar tek tek oval masa olarak görünüyor; dolu koltukta oyuncu, boş koltukta **OTUR** var. Oklar (ve klavye ←/→) masa değiştiriyor, üstte TÜMÜ/TEK/EŞLİ/KATLAMALI/YARDIMSIZ süzgeci var, liste 4 sn'de bir tazeleniyor (`main.js` `tp*`, `css/lobby-tables.css`). Bekleme ekranında panelin üstünde aynı mini masa var: boş koltuğa OTUR ile geçiliyor (`changeSeat`), kendi koltuğun "SEN" (`css/table-wait.css`).
  - Sunucu: oyuncunun `seat` alanı (0 alt, 1 sağ, 2 üst, 3 sol; eşlide 0-2 ve 1-3 takım). `joinGame` `seat` alıyor, dolu koltukta hata dönüyor. `room.players` bekleme sırasında katılış sırasında kalıyor; **maçın ilk elinde `seatPlayers` oyuncuları koltuğa göre diziyor**, ondan sonra sıra numarası = koltuk. Eski kayıtlarda `seat` yoksa sıra numarası kullanılıyor (`seatOf`). `/api/rooms` her bekleyen masa için `seats` dönüyor. Test: `tests/v38Seats.test.js`.
- ✅ Çift açma artık soru penceresi açmıyor: ÇİFT AÇ'a basınca yeterli çift varsa hemen açılıyor; katlamalı sınırını sunucu denetliyor.
- ✅ Masa sayfasından eski, görünmeyen parçalar silindi (parçacıklar, eski bekleme listesi, sağ üst durum kutusu, kalan taş sayacı, "Ana Yerde Aç", eski skor düğmesi, çift açma penceresi).
- Başlayan oyuncu kuralı kontrol edildi: başlayan 22 taş alıyor ve `hasDrawn=true`, yani taş çekmeden atıyor (`v38Seats` testi doğruluyor).
- Bot gücü ölçüldü (2026-10-24, `oldBot` karşılaştırması, 600 maç): ilk tur beklememe, açtıktan sonra "çıkış" hesabı, çiftte ölü taşı önce atma ve 101'e kalan farkla sınırlı değerleme denendi. Hiçbiri gürültünün ötesinde fark yaratmadı (ör. ceza 59,5'e karşı 56,1; katlamalıda 96,7'ye karşı 96,7), hepsi geri alındı. Bot sezgisel olarak tavana yakın; gerçek güç artışı için gelecekteki çekişleri benzeten (Monte Carlo) ve `worker_threads` içinde çalışan bir bot gerekir. Ölçümde dikkat: destede dağıtımdan sonra 20 taş kalıyor, oyuncu başına ~5 çekiş var ve ellerin ~%52'si deste bitince kazanansız bitiyor.
- ✅ Monte Carlo bot (2026-10-24). Açmadan önceki taş atışı benzetimle seçiliyor (`server/botMC.js`). Sezgisel kural adayları sıralıyor (aynı türden biri, en fazla 8). Her aday için görünmeyen taşlardan rastgele gelecekler üretiliyor: kalan çekişler ve soldaki oyuncunun atacağı taşlar. Bot bu geleceği basit kuralla oynuyor, seri ya da çift açıp açamadığına bakılıyor; erken açılış biraz daha değerli. Bütün adaylar aynı rastgele geleceklerle deneniyor. Eşitlikte sezgisel seçim kalıyor. Açtıktan sonraki kararlar değişmedi.
  - Hesap `worker_threads` havuzunda (`server/botPool.js`, `botWorker.js`). `runBotTurn` cevabı bekliyor ve event loop serbest kalıyor. Cevap gelince masa hâlâ aynı durumdaysa taş atılıyor. Worker çökerse, 2,5 sn'de cevap gelmezse ya da havuz kapalıysa sezgisel seçim atılıyor.
  - Ölçüm (yarı koltuklar eski bot, yarısı yeni; maçlar arası koltuk değişiyor; 14 paralel süreç):
    - Katlamasız (5.600 el): MC 54,5 ceza, eski bot 58,4. Fark 3,9 ± 1,0, yani anlamlı (~%7 daha az ceza). El kazanma 1.361'e karşı 1.338.
    - Katlamalı (5.600 el): ceza 96,5'e karşı 97,4, fark 1,0 ± 1,5 (yok). Ama MC daha az el bitirdi: 753'e karşı 835.
    - **Bu yüzden katlamalı masada sezgisel kural kullanılıyor** (`useMonteCarlo`). Katlamalıda da açmak için: `BOT_MC_STACKING=1`.
  - Tarayıcıda (bilgisayar aynı anda ölçüm de çalıştırırken): bot turu medyan 2,1 sn, p90 2,6 sn (1,2 sn bekleme dahil). 0 hata. `v40BotAsync` testinde karar beklenirken en uzun event-loop arası 10 ms.
  - Ortam değişkenleri:
    - `BOT_AI`: `mc` ya da `basic`. Production'da varsayılan `mc`, başka yerde `basic`; testler `basic` ile çalışır. `.claude/launch.json` `mc` verir.
    - `BOT_MC_SAMPLES`: aday başına gelecek sayısı (varsayılan 40).
    - `BOT_MC_CANDIDATES`: en fazla aday sayısı (8).
    - `BOT_MC_TIMEOUT_MS`: worker cevap süresi (2500).
    - `BOT_WORKERS`: havuz boyutu (çekirdek − 1, en fazla 4).
    - `BOT_MC_SYNC=1`: hesap ana iş parçacığında yapılır, yalnızca ölçüm betiği için.
    - `BOT_MC_STACKING=1`: katlamalıda da MC.
  - Ölçüm için `game.baselineSeats` (Set) o koltukları eski kurala bırakır.
  - Testler: `tests/v39BotMC.test.js` (çift sayımı GameLogic ile aynı, bariz karar, tohumla tekrarlanabilirlik, worker sonucu aynı, süre aşımında null) ve `tests/v40BotAsync.test.js` (gerçek eşzamansız yol, 106 taş, sıra ilerliyor).

**Bizde olmayan mekanikler (öncelik önerisi):**
1. ✅ **Çip ekonomisi (sanal, ücretsiz):** başlangıç çipi, masa bahsi (ör. 3.750), kazanana kazanç ve %7 masa ücreti. Dağıtım: yalnız bir kişi açtıysa bütün ortayı o alır; birden çok açan varsa birinci ortanın 3/4'ünü, ikinci 1/4'ünü alır; eşitlikte paylaştırılır. Hesap tablosuna `chips` sütunu, lobide çip göstergesi, bahis seviyeli odalar.
2. ✅ **Günlük ücretsiz çip / hediye toplama** (ör. 4 saatte bir 1.000 çip) ve çipi biten oyuncuya destek çipi.
3. ✅ **Seviye ödülleri:** XP zaten var; seviye atlayınca çip ödülü (rozet yok).
4. **Rizikolu 51 / iki kişilik masa:** 2 oyunculu, daha kısa ve riskli mod. Kuralları netleştirilmeli.
5. **Etkinlikler ve sıralama:** haftalık şampiyona (kazanılan çip/puan sıralaması), geri sayımlı etkinlik kartları. Sıralama zaten var, genişletilir.
6. ✅ **Arkadaşlar ve mesajlar** (2026-10-24): aşağıya bakın.
7. **VIP / kulüp odaları:** yüksek bahisli veya seviye şartlı özel odalar.
8. **Mini oyunlar:** tren tahmini, kahve falı sürprizi (eğlence amaçlı, sanal çiple).
9. Mağaza ve gerçek parayla satın alma: **yapılmaz** (ödeme ve yasal sorumluluk; ayrıca kullanıcı istemedi).

## 5c. Batak (2026-10-24)

**Kural (kullanıcı isteği):** Lobiye eklenen her yeni oyun (Pişti, Domino, Tavla…) okeydeki ortak özelliklerle gelmeli: profil penceresi, arkadaş ekleme/mesaj/masaya davet, masa gezgininden istenen koltuğa oturma ve beklerken koltuk değiştirme, sohbet, bot doldurma, yeniden bağlanma. Görünüm modern ve sade olmalı; kart oyunlarında kartlar klasik deste gibi. Kullanıcıyla Türkçe konuşulur.

Lobideki BATAK kartı artık çalışıyor: **OYNA** (ihaleli, boş koltuklara 6 sn sonra botlar oturur) ve **MASA AÇ** (tür, el sayısı, HEMEN OYNA / ÖZEL MASA AÇ / kodla katıl). Masa sayfası `/batak`.

- Dosyalar:
  - `server/batak/logic.js`: kurallar, saf fonksiyonlar.
  - `server/batak/bot.js`: bot.
  - `server/batak/index.js`: masalar ve `batak:*` socket olayları.
  - `public/batak.html`, `public/js/batak.js`, `public/css/batak.css`: masa sayfası.
  - `public/js/batak-cards.js`: kart çizimi.
  - Lobi tarafı `main.js` içindeki "Batak" bölümünde.
- Kartlar klasik iskambil destesi görünümünde, SVG ile çiziliyor; görsel dosya yok (`batak-cards.js`). Kullanıcının gönderdiği klasik deste örnek alındı:
  - Beyaz zemin, ince siyah kenar.
  - Köşede dar, kalın rakam ve hemen altında küçük renk işareti; sağ altta aynısı ters.
  - 2-10 için standart pip dizilimi. As'ta ortada tek simge, maça ası büyük.
  - J/Q/K: çerçeve içinde sarı-kırmızı-mavi giysili, iri başlı, ayna simetrili figür. Papazda taç ve kılıç, kızda taç ve çiçek, valede şapka ve asa var.
  - Arka yüz lacivert kafes deseni.
  - Her kart bir kez çizilip önbelleğe alınıyor. Renk simgeleri sayfa açılınca `BatakCards.install()` ile ekleniyor.
- Düğmeler sade ve modern ("oyuncak gibi" parlak 3B düğme yok):
  - Düz renk, ince kenar, çizgi ikonlu (SVG) üst düğmeler.
  - `bk-btn.primary` altın, `bk-btn.ghost` şeffaf.
- Okeydeki ortak özellikler Batak'ta da var (her yeni oyunda olmalı, bkz. aşağıdaki kural):
  - **Koltuk seçimi:** lobide Batak kartındaki ODA SEÇ, okeyle ortak masa gezginini açıyor (`showRoomList('batak')`, `/api/batak` → `seats`). Boş koltuğa OTUR ile o koltuğa oturuluyor. Beklerken masada koltuklar sabit yerinde, boş koltukta OTUR var (`batak:changeSeat`). Maç başında `room.players` koltuk sırasına diziliyor.
  - **Herkese açık masa:** lobideki Batak penceresinde MASA AÇ (listede görünür, botları masayı açan ekler), ÖZEL MASA (yalnız kodla) ve HEMEN OYNA (6 sn sonra botlar) var.
  - **Profil:** avatara tıklayınca seviye, oyun, zafer, çip (`/api/profile?name=`) ve ARKADAŞ EKLE çıkıyor; zaten arkadaşsa "ARKADAŞSINIZ" yazıyor. Menüde "Profilim" var.
  - **Arkadaşlar ve davet:** üstte arkadaşlar düğmesi (`social.js`), bekleme ekranında ARKADAŞ DAVET ET.
    - `socialHub` Batak masalarını da tanıyor (`setGames`). Davette `game: 'batak'` gidiyor; arkadaş listesinde "Batak oynuyor" yazıyor.
    - KATIL ve MASAYA GİT doğru oyuna götürüyor (`joinRoom(code, game)`, `sessionStorage.inviteGame`).
- Masa görünümü (2026-10-24 yenilendi):
  - Oval keçe masa, ahşap kenar.
  - Rakiplerin kapalı kartları yelpaze halinde.
  - Ortaya atılan kart oyuncunun yönünden kayarak geliyor; el bitince kartlar alan oyuncuya doğru toplanıyor, kazanan kart parlıyor.
  - El kavisli; seçilebilir kartlar yukarıda, diğerleri soluk. Kartlar arası bindirme ekran genişliğine göre `layoutHand` ile hesaplanıyor.
  - "SIRA SENDE" süre çubuğu ve avatarın etrafında süre halkası var; son 5 saniyede halka kırmızı.
- Düğmeler: sohbet (hazır cümleler + yazı, avatar üstünde balon, okunmamış sayısı), son el, puan tablosu, ses (WebAudio, lobideki ses ayarıyla aynı) ve menü (kurallar, puan tablosu, masadan ayrıl). Bekleme ekranında KODU KOPYALA.
- Kısa ekranda (yükseklik ≤ 520 px) kendi panelin sol alt köşeye geçiyor, el sağa kayıyor.
- Masalar yalnızca RAM'de tutuluyor (okeydeki gibi diske yazılmıyor). Güncelleme sırasında süren Batak maçı kaybolur.
- Masa kodları `B` ile başlıyor; okey kodlarıyla karışmıyor.
- Türler:
  - **İhaleli:** ihale en az 5. Kimse girmezse dağıtanın sağındaki 4 almak zorunda. İhaleyi alan kozu seçer ve ilk eli açar.
  - **Koz Maça:** koz her zaman maça. Herkes 0–13 söyler; 0 "el almaz" demek. Dağıtanın sağındaki açar.
  - **Eşli:** karşılıklı oturanlar takım (0-2, 1-3). İhale en az 8; kimse girmezse dağıtan 7 almak zorunda. İlk kart oynanınca ihaleyi alanın eşinin kartları herkese açılır.
  - El sayısı 5/7/9/11. Dağıtıcı her el saatin tersine bir kayar. Sıra saatin tersine: ekranda sıradaki oyuncu sağda.
- Oynama kuralları:
  - Açılan rengi takip etmek zorunlu. Yer kozlanmadıysa ve geçebiliyorsan büyütmek zorunlu.
  - Rengin yoksa koz atmak zorunlu. Yerde koz varsa ve geçebiliyorsan kozu büyütmek zorunlu.
  - Ne renk ne koz varsa herhangi bir kart (çöp) atılır.
  - Koz kırılmadan (bir kez oynanmadan) koz açılamaz; elinde yalnızca koz varsa açılabilir.
- Puan:
  - Söylediğini tuttuysan `10 × söz + fazla`, tutmadıysan `−10 × söz`.
  - İhaleye girmeyen el aldıysa aldığı el sayısı kadar puan alır, hiç almadıysa `−10 × ihale`.
  - El almaz: tutarsa +50, tutmazsa −50.
  - Eşlide puan takımın toplam eline göre hesaplanır.
- El iptal: ihale başlamadan, elinde 10'dan büyük kart (J, Q, K, A) olmayan oyuncu yeniden dağıtım isteyebilir. Bot bunu kendisi yapar, art arda bir kez.
- Süreler: ihale 20 sn, kart 25 sn. Süre dolarsa ya da bağlantı kopuksa (8 sn) hamleyi bot mantığı yapar.
- Oyundan ayrılanın yerine bot geçer. Bağlı gerçek oyuncu kalmazsa masa 60 sn sonra silinir.
- Hesaplılara maç sonunda XP veriliyor (`Accounts.award`). Çip bahsi yok.
- Masa sohbeti `batak:chat`: en çok 100 karakter, 1,2 saniyede bir mesaj.
- Yapılmayanlar: King, Kanlı, OHEL, Gömmeli türleri ve Batak için çip bahsi.
- Test: `tests/v41Batak.test.js`. Kurallar, ihale, puan ve 360 botlu el test ediliyor (her kart kurala uygun, 52 kart korunuyor). Ayrıca socket üzerinden 5 ellik maç, kural dışı kartın reddi ve sohbet test ediliyor.

## 6. Teknoloji önerileri neden şimdilik gerekli değil

| Öneri | Karar | Neden |
|---|---|---|
| Go | Gerekli değil | Okey sıra tabanlı, saniyede birkaç olay var. Node binlerce masayı taşır. Asıl sorun event loop'u bloke eden kod (S1, S4, S5). Go'ya geçmek bunları çözmez, sadece yeniden yazdırır. |
| TypeScript | İsteğe bağlı | Hız kazandırmaz, bakım kolaylığı sağlar. Faz 4'te `@ts-check` ile kademeli geçilebilir. |
| Socket.IO yerine saf `ws` | Gerekli değil | Kazanç birkaç ms. Socket.IO'nun otomatik yeniden bağlanması mobilde değerli. |
| React / Next.js | Gerekli değil | Next.js SEO ve sayfa yönlendirme için. Oyun ekranına faydası yok, ek yük getirir. |
| Pixi.js / Phaser | Ölçümden sonra karar | 106 taşlık bir masa, doğru yazılmış DOM/CSS ile 60 FPS çalışır. Önce İ1-İ4 yapılmalı. |
| Redis | Şimdilik gerekli değil | Masalar zaten RAM'de ve bu Redis'ten hızlı. Gerekli olduğu durumlar: deploy'da oyunların korunması (H3) ve çoklu sunucu (Faz 5). |
| PostgreSQL / SQLite | **Gerekli** | S4 ve H1. Tek sunucu için SQLite yeterli ve en basit seçenek. Sosyal özellikler (arkadaş listesi, geçmiş) büyürse PostgreSQL'e geçilir. |
