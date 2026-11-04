// Otomatik güncelleme: oyun açılınca sunucudan son sürümü sorar (/api/surum). Yeni sürüm varsa zip'i indirir
// (/indir → GitHub'daki son sürüm), boyutunu doğrular ve oyunu kapatır. Küçük bir PowerShell betiği oyunun ve yerel
// sunucunun kapanmasını bekler, dosyaları yenisiyle değiştirir ve oyunu yeniden açar. Ayarlar ve hesap verisi
// (AppData\LocalLow) etkilenmez. Editor'de ve geliştirici denetimlerinde çalışmaz. Bir sürüm bir kez denenir:
// güncelleme başarısız olursa oyun aynı sürümü tekrar tekrar indirip döngüye girmez.
using System;
using System.Collections;
using System.Diagnostics;
using System.IO;
using System.Text;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.Networking;
using UnityEngine.UI;
using Debug = UnityEngine.Debug;

namespace Alemdar.Net
{
    public static class Updater
    {
        public const string Version = "1.6.0"; // Build.cs PlayerSettings.bundleVersion'ı da buna ayarlar; yeni sürümde artırılmalı
        static readonly string[] DevArgs = { "-cek", "-yerel", "-arkadas", "-batak", "-ikram", "-uzun", "-senaryo", "-sunucu", "-guncelleme-yok" };
        public static string Current => DevShots.Arg("-surum") ?? Version; // denetim: eski sürüm gibi davran

        static bool Enabled()
        {
            if (Application.isEditor || Application.platform != RuntimePlatform.WindowsPlayer) return false;
            foreach (var a in DevArgs) if (DevShots.Arg(a) != null) return false;
            return true;
        }
        static string GameDir => Path.GetFullPath(Path.Combine(Application.dataPath, ".."));
        static string ServerUrl()
        {
            try { return ((string)JObject.Parse(File.ReadAllText(Path.Combine(GameDir, "config.json")))["serverUrl"])?.TrimEnd('/'); }
            catch { return null; }
        }

        // quit(true): güncelleme başladı, oyun kapanıyor
        public static IEnumerator Check(Text label, Action<bool> quit)
        {
            quit(false);
            if (!Enabled()) yield break;
            string url = ServerUrl(); if (string.IsNullOrEmpty(url)) yield break;
            string remote = null; long size = 0;
            using (var req = UnityWebRequest.Get(url + "/api/surum"))
            {
                req.timeout = 6;
                yield return req.SendWebRequest();
                if (req.result != UnityWebRequest.Result.Success) yield break; // sunucuya ulaşılamadı: oyun eski sürümle açılır
                try { var j = JObject.Parse(req.downloadHandler.text); remote = (string)j["version"]; size = (long?)j["size"] ?? 0; } catch { yield break; }
            }
            if (!Newer(remote, Current)) yield break;
            if (PlayerPrefs.GetString("guncelleme_denendi", "") == remote) { Debug.LogWarning("Güncelleme daha önce denendi, tekrar denenmiyor: " + remote); yield break; }

            string zip = Path.Combine(Path.GetTempPath(), $"AlemdarKiraathanesi-{remote}.zip");
            label.text = $"Yeni sürüm {remote} indiriliyor…";
            using (var dl = new UnityWebRequest(url + "/indir", UnityWebRequest.kHttpVerbGET))
            {
                dl.downloadHandler = new DownloadHandlerFile(zip) { removeFileOnAbort = true };
                dl.redirectLimit = 8;
                var op = dl.SendWebRequest();
                while (!op.isDone)
                {
                    float p = size > 0 ? dl.downloadedBytes / (float)size : dl.downloadProgress;
                    label.text = $"Yeni sürüm {remote} indiriliyor…  %{Mathf.Clamp(Mathf.FloorToInt(p * 100), 0, 100)}\n<size=20>{dl.downloadedBytes / 1048576f:0} / {size / 1048576f:0} MB</size>";
                    yield return null;
                }
                if (dl.result != UnityWebRequest.Result.Success) { Fail(label, zip, "İndirme başarısız: " + dl.error); yield return new WaitForSeconds(2.5f); yield break; }
            }
            if (size > 0 && new FileInfo(zip).Length != size) { Fail(label, zip, "İndirilen dosya eksik."); yield return new WaitForSeconds(2.5f); yield break; }

            label.text = $"Sürüm {remote} kuruluyor, oyun birazdan yeniden açılacak…";
            PlayerPrefs.SetString("guncelleme_denendi", remote); PlayerPrefs.Save();
            yield return new WaitForSeconds(.5f);
            if (!Launch(zip)) { Fail(label, zip, "Güncelleyici başlatılamadı."); yield return new WaitForSeconds(2.5f); yield break; }
            quit(true);
            Application.Quit();
        }

        static void Fail(Text label, string zip, string why)
        {
            Debug.LogWarning("Güncelleme: " + why);
            label.text = why + "\nOyun bu sürümle açılıyor.";
            try { if (File.Exists(zip)) File.Delete(zip); } catch { }
        }

        public static bool Newer(string remote, string local)
            => System.Version.TryParse(remote ?? "", out var r) && System.Version.TryParse(local ?? "", out var l) && r > l;

        // Oyun kapanınca çalışan betik: bekle → yerel sunucuyu kapat → aç → kopyala → yeniden başlat.
        static bool Launch(string zip)
        {
            try
            {
                string dir = GameDir, exe = Path.Combine(dir, "AlemdarKiraathanesi.exe");
                string ps = Path.Combine(Path.GetTempPath(), "alemdar_guncelle.ps1");
                string script = @"param([string]$zip, [string]$dir, [string]$exe, [int]$gamePid)
$log = Join-Path $env:TEMP 'alemdar_guncelle.log'
""$(Get-Date) güncelleme başladı"" | Out-File $log -Encoding utf8
Wait-Process -Id $gamePid -Timeout 60 -ErrorAction SilentlyContinue
Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.Path -and $_.Path.StartsWith($dir) } | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep -Seconds 1
$tmp = Join-Path $env:TEMP 'alemdar_yeni'
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
try {
  Expand-Archive -LiteralPath $zip -DestinationPath $tmp -Force
  $src = Get-ChildItem -LiteralPath $tmp -Directory | Select-Object -First 1
  if (-not (Test-Path (Join-Path $src.FullName 'AlemdarKiraathanesi.exe'))) { throw 'zip içinde oyun yok' }
  robocopy $src.FullName $dir /E /R:5 /W:1 /NFL /NDL /NJH /NJS | Out-Null
  ""$(Get-Date) dosyalar kopyalandı (robocopy $LASTEXITCODE)"" | Out-File $log -Append -Encoding utf8
} catch { ""$(Get-Date) HATA: $_"" | Out-File $log -Append -Encoding utf8 }
Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $zip -Force -ErrorAction SilentlyContinue
Start-Process -FilePath $exe -WorkingDirectory $dir
";
                File.WriteAllText(ps, script, new UTF8Encoding(true)); // BOM: Windows PowerShell 5.1 Türkçe karakterleri doğru okusun
                var psi = new ProcessStartInfo("powershell.exe",
                    $"-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"{ps}\" -zip \"{zip}\" -dir \"{dir}\" -exe \"{exe}\" -gamePid {Process.GetCurrentProcess().Id}")
                { UseShellExecute = false, CreateNoWindow = true };
                Process.Start(psi);
                return true;
            }
            catch (Exception e) { Debug.LogWarning("Güncelleyici: " + e.Message); return false; }
        }
    }
}
