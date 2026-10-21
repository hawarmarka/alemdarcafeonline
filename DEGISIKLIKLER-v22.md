# v22 – 101 Okey Plus kural eksikleri ve hata düzeltmeleri

## Yeni (Okey Plus ile uyum)
- El açan oyuncu sonraki turlarda **SERİ AÇ** ile puan sınırı olmadan yeni seri/per indirebilir.
- Çift açan oyuncu sonraki turlarda **ÇİFT AÇ** ile yeni çiftlerini indirebilir (önceden hiç bitiremiyordu).
- Çift açılışında 5 ile sınırlı kalmadan eldeki bütün çiftler indirilir.
- **Masadaki okeyi alma:** seçili taşı masadaki okeyin üstüne tıkla/bırak; taş okeyin temsil ettiği yere uyuyorsa okey ele geçer.
- Masadaki gruplarda okey, temsil ettiği yuvada gösterilir; seri puanı bu sıraya göre hesaplanır.

## Hata düzeltmeleri
- Açılışta tüm taşlar indirilip elde atılacak taş kalmayınca oyunun kilitlenmesi (oyuncu ve bot). Artık en az 1 taş elde kalır; son taş işlenemez.
- İstemcide sahte okeyin gösterge değeriyle (gösterge+1 yerine) hesaplanması.
- Bot ölü yer taşını almaya çalışınca elin "deste bitti" diye kapanması.
- Süre dolunca/botlarda en küçük taşın atılması: artık okey ve masaya işlenebilen taş (101 ceza) atılmaz, per dışı en yüksek taş atılır.
- Elde kalan okeyin cezası `sayı + 101` yerine 101.
- Eller arasında masadan çıkan oyuncunun koltuk sırasını kaydırıp skor sütunlarını karıştırması.
- Açık masalarda kuralların istemciden gelmesi; artık mod anahtarına göre sunucu belirler. Bitmiş/devam eden maçlara yeni oyuncu alınmaz.

## Test
- `tests/v22Rules.test.js`: yeni kurallar.
- `tests/botSimulation.test.js`: 40 maç × 4 el tamamen botla; 106 taş korunumu, grup geçerliliği, kilitlenme kontrolü.

## v22.1 – kullanıcı geri bildirimi
- **Ortadan taş çekilemiyordu:** ekranı kaplayan `.ui-layer` tıklamaları yutuyordu (`v20-cleanup.css`). Katman artık tıklama yakalamıyor.
- **Botlar hep ilk elde açıyordu:** dağıtım 14 deneme yapıp en güçlü elleri seçiyordu. Dağıtım artık tamamen rastgele; botlar ilk tam turda açmıyor.
- Yandan alınan taş için atana yazılan "taş × 10" ceza kaldırıldı (Okey Plus'ta yok).
- Seri/çift rozetleri yalnızca masada o türden açılış varsa görünür (seri alanının solunda, çift alanının sağında). Önceki seri rozeti gizli bir başlığın içindeydi ve hiç görünmüyordu.
- Yardımlı masada işlek taşlar ıstakada kırmızı hedefle işaretlenir.
- TAŞLARI İŞLE düğmesi işlenebilen bütün taşları masaya işler.
- Botlar yarım seri/per oluşturan taşları tutuyor; ellerin daha çoğu kazananla bitiyor.

## v22.2 – resmi 101 Okey Plus kural sayfasına göre (101okeyplus.com/nasil-oynanir.html)
- Bir sete bir turda en fazla 2 taş işlenebilir (7-8-9'a aynı turda 5-6 olur, 4 olmaz).
- Katlamalı masada çift açılışı da katlanır: sonraki çift açılışı bir çift fazla ister. Eksik çiftle açma denemesi 101 ceza.
- Yardımsız masada Hızlı İşle düğmesi ve işlek işaretleri yok, okey ters dönmez. "Taşları İşle" düğmesinin adı "HIZLI İŞLE" oldu.

## v23 – masa ekranı Okey Plus ekran görüntüsüne göre (public/css/v23-plus-match.css)
- Yan oyuncu panelleri masaya yakın (x=140 / x=1480), para/süre kutuları, sohbet ve menü düğmeleri referans konumlarında.
- El puanı rozeti kendi isim panelinin sağında; gösterge ve deste referans yüksekliğinde.
- Açan oyuncunun panelinde 55 (çift) / 123 (seri) ikonu; alınan son hediye panelin yanında kalıcı.
- Taş renkleri Okey Plus gibi kırmızı-sarı-mavi-siyah (yeşil sarıya çevrildi); sahte okey yeşil yonca.
- SERİ AÇ / ÇİFT AÇ / GERİ TOPLA / HIZLI İŞLE yalnızca o an yapılabiliyorsa görünür.

## v24 – skor tablosu, modern ıstaka, mobil (public/css/v24-modern.css)
- Skor tablosu baştan yazıldı: görsel şablona bağlı değil, masanın üstünde ortada açılır; avatarlar, el satırları, aktif el vurgusu, lider toplam.
- Istaka: eski görsel yerine CSS ceviz ahşap, raf kenarları, kalınlıklı/gölgeli taşlar, seçili taş yukarı kalkar, boş yuvalar belirgin.
- Dikey telefonda "yan çevir" ekranı; dokunmatikte sayfa kayması engellendi; ıstakanın alt kenarı için sahnede pay.

## v25 – el sayacı, ceza bildirimi, uçtan uca test
- Istaka sayacı: açmadan önce ıstakada yan yana dizili seri/perlerin toplamı (Okey Plus gibi); açtıktan sonra elde kalan taşların toplamı (el biterse yazılacak ceza, okey 101).
- SERİ AÇ önce oyuncunun ıstakada dizdiği grupları açar; yetmezse en iyi dizilimi kullanır.
- Ceza yazılınca (işlek atma, okey atma, hatalı açma) oyuncunun panelinde kırmızı "+101" ve sebebiyle bildirim.
- İşlem düğmeleri net yazılı CSS düğmeler; "Geri Topla" → "GERİ BIRAK". Çift alanında her çift yan yana iki taş.
- `tests/penalties.test.js`: işlek/okey atma, hatalı açma, cezasız masa, normal/okeyli/elden bitiş, çift ve deste bitişi.
- Geliştirme test modu: `OKEY_DEBUG=1` ile `debugSetup` (eli ve rakip grubunu kurma). Canlıda kapalı.

## v26 – 101 Okey Plus mobil videosuna göre (public/css/v25-plus-turn.css)
- Sıra sendeyken: üstte uzun süre çubuğu (son 10 sn kırmızı), rakip panelleri ve üst bilgi gizlenir; SERİ AÇ / ÇİFT AÇ / GERİ TOPLA / HIZLI İŞLE beyaz düğmeler yalnızca sıranda.
- GERİ TOPLA: bu tur masaya indirilen/işlenen taşlar geri gelir; aynı tur açılış geri toplanırsa 101 ceza (eli açıp toplama).
- Yandan alınan taş için sol köşede "GERİ BIRAK" kartı.
- Masa dizilimi: her grup kendi satırında, seriler sayı hizasında; sol pano dolunca sağ pano.
- Oyuncu panelinde açılış puanı minik taşlarla (141 → 1·4·1, çift açılışta 5·5) ve bu eldeki ceza kırmızı.
- El sayacı açmadan önce mavi, açtıktan sonra kırmızı.
- Sohbet mesajları panel yanında konuşma balonu; hazır cümleler (Selamlar, Bol şanslar!, Tebrikler!, Teşekkürler, Seri lütfen!, El nasıl?).
- Oyun sonucu: puan sırasına göre oyuncular, kazananda taç; MASADAN AYRIL / MASAYA GÖZ AT / YENİ OYUNA BAŞLA (aynı modda yeni masaya otomatik katılır).

## v27 – kullanıcının düğme görselleri (Desktop\OKEY RESİM → public/asset/ui, css/v26-ui-assets.css)
- 19 görsel saydam kenarları kırpılıp oyundaki boyuta küçültüldü (toplam ~2,7 MB yerine çoğu 25–130 KB).
- SERİ AÇ / ÇİFT AÇ / GERİ TOPLA / TAŞLARI İŞLE, SERİ DİZ / ÇİFT DİZ, GERİ BIRAK kartı, ıstaka, mesaj ve ayarlar düğmeleri, seri/çift/el sayı rozetleri, mod rozetleri, deste ve boş atık yerleri, isim paneli, skor tablosu ve masa ilk giriş bekleme paneli bu görsellerle.
- Skor tablosu: görseldeki kutulara mod etiketleri, avatarlar, her el için puan ve toplam yerleşir.
- Bekleme paneli: masa kodu, Tek/Eşli, el sayısı, Yardımlı/Katlamalı, botların kaç saniye sonra katılacağı, MASADAN AYRIL.
- Hata: oyun başlamadan bağlantısı kopan oyuncu koltuğu kilitliyordu, botlar gelse de oyun 60 sn başlamıyordu. Artık botlar dolarken bu koltuklar boşaltılıyor.

## v28 – taş çekme, animasyon, simetrik ıstaka
- Taş çekince ıstaka artık yeniden dizilmiyor: yalnızca el başında bir kez ve SERİ DİZ / ÇİFT DİZ ile dizilir. Çekilen taş, taşı az olan rafta son taşın yanına gelir; diğer taşlar yerinde kalır.
- Hata: sayfa yenilenince ıstaka düzeni siliniyordu; artık el numarasıyla saklanıp geri yükleniyor.
- Animasyon: çekilen taş desteden/soldan ıstakaya, atılan taş ıstakadan atık yerine, işlenen taş masadaki gruba, rakiplerin attığı taş panelinden atık yerine kayar.
- Simetrik ıstaka: gruplar iki rafa taş sayısı dengeli dağıtılır ve her raf ortalanır.
- Destedeki kalan taş sayısı görseldeki dairenin ortasında.

## v29 – atık yerleri ve bot yapay zekâsı
- Taş atılan yerler yalnızca beyaz çerçeve (desenli görsel kaldırıldı).
- Bot yapay zekâsı:
  - Taş atarken kalan elin "çıkışları" hesaplanır: görünmeyen taşlardan hangileri gelirse seri puanı ne kadar artar; en az potansiyel kaybettiren taş atılır.
  - Plan seçimi: 5+ çift ya da 4 çift ve zayıf seri varsa çift planı; çiftler bozulmaz.
  - Açmadan önce düşük taş atılır (yüksek taş 101'e ulaştırır), açtıktan sonra yüksek taş atılır.
  - Yerdeki taş bir çifti tamamlayıp çift açtırıyorsa alınır.
  - Düşünme süresi 1,2–2,5 sn arası değişken.
  - Ölçüm: 300 maçlık kafa kafaya testte (2 eski + 2 yeni bot) ortalama maç puanı eski 364, yeni 319 (düşük iyi, ~%12 daha iyi).

## v30 – düzen (css/v27-tidy.css)
- İşlem düğmeleri sağ üst atık çerçevesiyle çakışıyordu; artık çerçevenin altından başlıyor.
- Masa sohbeti: opak panel, başlık ve kapatma düğmesi, mesaj listesi, sağda hazır cümleler, altta mesaj kutusu ve GÖNDER. Sohbet düğmesi yerinden kaymıyor.
- Ayarlar menüsü: başlıklı panel; Skor Tablosu, Ses, Oyun Kuralları ikonlu büyük düğmeler, Masadan Ayrıl kırmızı.
- Istaka: taşlar soldan başlıyor (ortalama kaldırıldı); grupsuz taşlar iki rafa sıralı iki parça hâlinde bölünüyor.
- GERİ TOPLA ile dönen taşlar masaya inmeden önceki yuvalarına birebir dönüyor; birden çok taş gelirse sıralı blok hâlinde yerleşiyor.
- Skor tablosunda isimler avatar dairesine binmiyor.

## v31 – oyuna giriş, lobi ve efektler (101 Okey Plus videosuna göre, marka: Alemdar Cafe)
- Yeni logo: `public/asset/ui/alemdar-logo.svg` (tabela + kahve fincanı + kırmızı kurdele + CAFE levhası).
- Açılış ekranı (oturumda bir kez): logo, sallanan sonbahar yaprakları ve parlayan ampuller, çit, yaprak yığını, "Bağlanıyor... Lütfen Bekleyiniz!" yükleme çubuğu.
- Taş geçişi (`js/transitions.js`): beyaz okey taşları ekranı kaplayıp dağılır; açılıştan lobiye, lobiden masaya ve masadan lobiye.
- Lobi (`css/lobby-plus.css`) videodaki düzende: üstte avatar + isim/seviye, XP çubuğu, ortada logo, zafer/oyun sayaçları, hesap düğmesi; solda Oda Kodu / Özel Masa / Profil kartları; yatay kayan mod kartları (Klasik, Katlamalı, Yardımlı, Yardımsız, Özel) ve ODA SEÇ / KATIL düğmeleri; altta sıralama, kurallar, büyük yeşil HEMEN OYNA (çevrimiçi oyuncu sayısıyla), ayarlar.
- Pencereler: Ayarlar (Genel + Hemen Oyna ayarları), En İyi 25 sıralaması (`/api/leaderboard`), Kurallar, Özel Masa ve oda listesi (kırmızı ✕ / yeşil ✓ yuvarlak düğmeler), giriş ve profil.
- Masa: zemindeki "101 PLUS" filigranı Alemdar Cafe logosu oldu; ıstakaya logo ve oda adı kazındı.

## v32 – okey, yapay zekâ, Coolify, arkadaş masası, çerçeveler, sıra göstergesi
- **Okey hatası:** Okey ıstakada ve masada boş beyaz taş olarak çiziliyordu. Artık ıstakada (yardımlı masada) altın yıldızlı "OKEY" yüzü, masada yerine geçtiği taş olarak altın kenar ve yıldızla görünür.
- `tests/okeyFuzz.test.js`: 1.500 rastgele elde (3.101 grup, 825'i okeyli) istemci çözücüsü ile sunucu kuralları tutarlı.
- **Yapay zekâ:** açtıktan sonra yerdeki taş yeni seri/per kuruyorsa alır; okeyi elde bekletmez (el azalınca/deste bitmek üzereyken işler); sağındaki oyuncunun yerden topladığı taşları takip eder. 250 maçlık kafa kafaya testte ortalama maç puanı 376 → 216 (düşük iyi).
- **Arkadaş masası:** özel masa kendiliğinden botla dolmaz; masayı açan kişi bot ekler/çıkarır, "Botlarla Başlat" ile başlatır; kurucu ayrılırsa yönetim kalan oyuncuya geçer. `tests/hostBots.test.js`.
- **Coolify:** `trust proxy` (giriş deneme sınırı kişi başına), SIGTERM ile hızlı ve düzgün kapanma, statik dosya önbelleği, PORT'a göre sağlık kontrolü, veri klasörü yazılamazsa çökmeden uyarı, `.gitignore`/`.dockerignore`/`.gitattributes`, README kurulum adımları.
- **Taşlar:** ıstakada ve masada taşlar arasında eşit boşluk (birbirine değmez).
- **Profil çerçeveleri:** 6 yeni süslemeli çerçeve (Altın Şampiyon, Gümüş Kanat, Kraliyet, Zümrüt Ejder, Neon Siber, Yakut Kanat) lobi, profil ve oyun içi oyuncu kutularında.
- **Sıra göstergesi (Okey Plus gibi):** sırası gelen oyuncunun kutusu parıltılı yeşille dolar, süre bittikçe boşalır (dikeyde aşağıdan yukarı, yatayda sağdan sola); son 10 saniyede turuncuya döner.

## v33 – lobi baştan, sürükle-bırak işleme, okeyli çift, bildirimler, simetri
- **Sürükle-bırak ile işleme:** ıstakadaki taşı masadaki grubun üstüne ya da yanına (1,5 taş mesafeye kadar) bırakmak yeterli; bırakılan kenara göre sola/sağa eklenir, uymazsa diğer kenar denenir; sürüklerken hedef grup parlar. Okeyin üstüne bırakınca okey alınır.
- **Okey çiftte joker:** eşi olmayan bir taşın yanına konunca çift sayılır (önce yüksek taş); iki okey kendi aralarında çift. ÇİFT DİZ ve ÇİFT AÇ bunu kullanır; masada okey eşinin yüzüyle görünür.
- **Yan taş kilidi:** yandan alınıp GERİ BIRAK ile bırakılan taş aynı tur tekrar alınamaz; ortadan çekmek zorunlu.
- **Bildirimler:** ceza ve el açma olayları masanın ortasında büyük kartla (ör. "İŞLEK TAŞ ATTI +101", "BOT 1 · SERİ AÇTI 115"); kısa mesajlar cam görünümlü.
- **Kurumsal logo:** `asset/ui/alemdar-mark.svg` amblem + "ALEMDAR / CAFE · 101 OKEY" yazısı (Oswald).
- **Lobi:** KLASİK (ODA SEÇ / MASA AÇ), ÖZEL (kodla katıl / özel masa aç); BATAK, TAVLA, PİŞTİ, DOMİNO "yakında" kartları; kartlar fareyle sürüklenerek ve tekerlekle kaydırılır. MASA AÇ: Tek/Eşli, el sayısı, yardımlı/yardımsız, katlamalı/katlamasız, ceza seçenekleri. Açılan masa Oda Seç listesinde kurallarıyla görünür; HEMEN OYNA kurallı özel masalara düşmez.
- **Açılış performansı:** yaprak sayısı 36 → 16, gölge filtreleri ve ampul animasyonu kaldırıldı, geçiş taşları 48 → 24.
- **Oyun ekranı:** dört oyuncu kutusu aynı cam tasarım; avatarlar çerçeve deliğine tam oturur; işlem düğmeleri aynı boyutta ve iki atık çerçevesinin tam ortasında; seri ve çift rozetleri tahtaların kenarında aynı yükseklikte; el sayacı ıstakanın hemen üstünde; işlek işareti taşın altındaki mührün tam üstünde; taş arası ince çizgi; çift alanı iki sütun ortalı; menü, sohbet, kurallar ve sonuç pencereleri cam görünüm; Oswald/Barlow fontları; bekleme ekranında arkada masa görünür.
- Testler: `tests/v33Rules.test.js`.

## v34 – logo, çift alanı, oyun sonucu
- Logo eski oyun-kafe tabelasına döndü ve zenginleşti: fincanın iki yanında okey taşları (10 ve 1) ve yıldızlar; lobi, açılış, giriş penceresi, sekme simgesi ve masa filigranında bu logo.
- Çift alanı seri tahtası gibi ızgara kutularına oturur: 6 sütun × 13 satır, her çift 2 kare; önce ilk sütun yukarıdan aşağı dolar.
- Oyun sonucu (101 Okey Plus düzeni): başlık ve alt bilgi; satırlarda avatar (kazananda taç), isim, durum, el puanı; sağ sütunda toplam ve KAZANAN/KAZANANLAR; MASADAN AYRIL ve YENİ OYUNA BAŞLA pencerenin iki yanında simetrik, MASAYA GÖZ AT altta ortada; ara ellerde yeşil düğme "SONRAKİ EL" geri sayımı. Sonuç açılınca masadaki bildirimler kapanır.
