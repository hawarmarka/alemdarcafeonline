# Alemdar Cafe · 101 Okey

Tarayıcıda oynanan, 4 kişilik, botlu, çok oyunculu 101 Okey. Node.js + Express + Socket.IO.

## Bilgisayarda çalıştırma

Node.js 22 veya daha yenisi gerekir.

```bash
npm ci
npm start
```

Tarayıcıda `http://localhost:3000` adresini aç. Windows'ta `BASLAT-WINDOWS.bat` dosyasına çift tıklamak da yeterli.

Testler:

```bash
npm test
```

## GitHub + Coolify ile yayına alma

1. Bu klasörü GitHub'da yeni bir depoya gönder (aşağıdaki "GitHub'a gönderme" bölümü).
2. Coolify'da **New Resource → Public/Private Repository** seç ve depoyu bağla.
3. Ayarlar:
   - **Build Pack:** `Dockerfile`
   - **Dockerfile Location:** `/Dockerfile`
   - **Ports Exposes:** `3000`
   - **Domain:** kendi alan adın (Coolify HTTPS sertifikasını kendisi alır)
4. **Storages → Add → Volume:** Destination Path `/app/data`. **Bu adım zorunlu.** Hesaplar (kullanıcı adı, şifre özeti, XP, profil fotoğrafı), günlük yedekler (`backups/`) ve süren masalar (`rooms/`) burada saklanır. Kalıcı depolama eklenmezse **her güncellemede bütün hesaplar silinir.**
5. **Health Check:** yol `/health`, port `3000` (Dockerfile'da da tanımlı).
6. Deploy. Tarayıcıda `https://alan-adin/health` adresi `{"status":"ok","storage":"persistent",...}` göstermeli. `"storage":"ephemeral"` görürsen 4. adım eksiktir: hesaplar bir sonraki güncellemede silinir. Sunucu logunda da büyük harfli bir uyarı çıkar.

### Ortam değişkenleri (isteğe bağlı)

| Değişken | Varsayılan | Açıklama |
|---|---|---|
| `PORT` | `3000` | Sunucu portu |
| `DATA_DIR` | `/app/data` | Hesap verisi klasörü |
| `TRUST_PROXY` | `1` | Coolify/Traefik arkasında gerçek oyuncu IP'si için. Vekil sunucu yoksa `0` yap. |
| `OKEY_DEBUG` | kapalı | Yalnızca geliştirme testi içindir; **canlıda açma**. |

### Bilinmesi gerekenler

- Süren masalar 2 saniyede bir ve kapanışta `/app/data/rooms/` altına yazılır. Güncelleme sırasında oyuncular birkaç saniye "bağlantı koptu" görür, sonra otomatik olarak aynı masaya ve aynı ele döner. 60 saniye içinde dönmeyen oyuncunun yerine bot geçer. 30 dakikadan eski masa kayıtları silinir.
- Hesap veritabanının günlük yedeği `/app/data/backups/` altında tutulur (son 7 gün).
- Tek kopya (1 replika) çalıştır; birden fazla kopya masaları paylaşamaz.

## GitHub'a gönderme

En kolayı **GitHub Desktop**: File → Add local repository → bu klasörü seç → "create a repository" → Publish repository.

Komut satırıyla (Git kuruluysa), GitHub'da boş bir depo açtıktan sonra:

```bash
git init
git add -A
git commit -m "Alemdar Cafe 101 Okey"
git branch -M main
git remote add origin https://github.com/KULLANICI/alemdar-okey.git
git push -u origin main
```

`.gitignore` sayesinde `node_modules`, `data` (hesaplar) ve `.claude` klasörleri depoya gitmez.

## Arkadaşlarla oynama

- **Özel Masa → Masa Aç:** Kuralları seç, masaya gir. Ekrandaki 6 haneli masa kodunu arkadaşlarına gönder; onlar lobide **ODA KODU** kartına yazıp katılır.
- Masayı açan kişi (👑) eksik koltuklara **BOT EKLE** ile bot koyabilir, botu ✕ ile çıkarabilir veya **BOTLARLA BAŞLAT** ile boş koltukları botla doldurup hemen başlatabilir. Örneğin 3 kişiyseniz 1 bot, 2 kişiyseniz 2 bot.
- Özel masa kendiliğinden botla dolmaz; arkadaşlarını bekler. Açık masalar (HEMEN OYNA, KATIL) 8 saniye içinde botlarla dolar.
- Oyun sırasında masadan ayrılan veya bağlantısı 60 saniye kopan oyuncunun yerine bot geçer.

## Değişiklik geçmişi

Ayrıntılar `DEGISIKLIKLER-v22.md` dosyasında.
