// Oyun sunucusu (Node) uygulamanın içinde, bu bilgisayarda çalışır: botlu oyun internetsiz ve gecikmesiz.
// Derlemede: <oyun klasörü>/Server/{node.exe, server/, node_modules/}. Editörde depo kökündeki sunucu kullanılır.
// Oyun klasöründe config.json { "serverUrl": "https://..." } varsa çevrimiçi sunucuya bağlanılır; ulaşılamazsa yerel sunucu açılır.
using System;
using System.Collections;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.Networking;
using Debug = UnityEngine.Debug;

namespace Alemdar.Net
{
    public class LocalServer : MonoBehaviour
    {
        Process proc;
        public string Url { get; private set; }
        public string Error { get; private set; }
        public bool Online { get; private set; }
        public bool Offline { get; private set; } // çevrimiçi sunucuya ulaşılamadı, yerel sunucuyla açıldı

        static string GameDir => Path.GetFullPath(Path.Combine(Application.dataPath, ".."));

        public IEnumerator Run(Action<string> ready)
        {
            var cfg = Path.Combine(GameDir, "config.json");
            if (File.Exists(cfg) && DevShots.Arg("-senaryo") == null && DevShots.Arg("-yerel") == null && DevShots.Arg("-uzun") == null) // denetim ve -yerel her zaman bu bilgisayarda
            {
                try { var u = (string)JObject.Parse(File.ReadAllText(cfg))["serverUrl"]; if (!string.IsNullOrWhiteSpace(u)) { Url = u.TrimEnd('/'); Online = true; } }
                catch (Exception e) { Debug.LogWarning("config.json okunamadı: " + e.Message); }
            }
            if (DevShots.Arg("-sunucu") is { Length: > 7 } forced) { Url = forced.TrimEnd('/'); Online = true; } // denetim: iki oyunu aynı sunucuya bağla
            if (Online)
            {
                bool ok = false;
                yield return Wait(Url, 20f, r => ok = r); // yavaş bağlantıda hemen çevrimdışına düşmesin
                if (ok) { ready(Url); yield break; }
                Debug.LogWarning("Çevrimiçi sunucuya ulaşılamadı, bu bilgisayardaki sunucu açılıyor: " + Url);
                Url = null; Online = false; Offline = true;
            }
            if (Url == null)
            {
                string root = Application.isEditor ? Path.GetFullPath(Path.Combine(GameDir, "..", "..")) : Path.Combine(GameDir, "Server");
                string node = Application.isEditor ? Path.Combine(GameDir, "NodeRuntime", "node.exe") : Path.Combine(root, "node.exe");
                string script = Path.Combine(root, "server", "index.js");
                if (!File.Exists(node) || !File.Exists(script)) { Error = "Oyun sunucusu dosyaları eksik."; ready(null); yield break; }
                int port = FreePort();
                string data = Path.Combine(Application.persistentDataPath, "data");
                Directory.CreateDirectory(data);
                var psi = new ProcessStartInfo(node, $"\"{script}\"")
                {
                    WorkingDirectory = root, UseShellExecute = false, CreateNoWindow = true,
                    RedirectStandardOutput = true, RedirectStandardError = true,
                };
                psi.EnvironmentVariables["PORT"] = port.ToString();
                psi.EnvironmentVariables["HOST"] = "127.0.0.1";
                psi.EnvironmentVariables["DATA_DIR"] = data;
                psi.EnvironmentVariables["BOT_AI"] = "mc";
                psi.EnvironmentVariables["NODE_ENV"] = "production";
                psi.EnvironmentVariables["LOG_LEVEL"] = "warn";
                psi.EnvironmentVariables["PARENT_PID"] = Process.GetCurrentProcess().Id.ToString(); // oyun kapanınca sunucu da kapanır
                if (DevShots.Arg("-senaryo") != null) psi.EnvironmentVariables["OKEY_DEBUG"] = "1"; // yalnızca geliştirici denetimi
                var log = new StreamWriter(Path.Combine(data, "server.log"), true) { AutoFlush = true };
                proc = new Process { StartInfo = psi, EnableRaisingEvents = true };
                proc.OutputDataReceived += (_, e) => { if (e.Data != null) lock (log) log.WriteLine(e.Data); };
                proc.ErrorDataReceived += (_, e) => { if (e.Data != null) lock (log) log.WriteLine(e.Data); };
                proc.Start(); proc.BeginOutputReadLine(); proc.BeginErrorReadLine();
                Url = "http://127.0.0.1:" + port;
            }
            bool up = false;
            yield return Wait(Url, 25f, r => up = r);
            if (up) { ready(Url); yield break; }
            Error = "Oyun sunucusu açılamadı.";
            ready(null);
        }

        // sunucu hazır olana kadar /health dener
        static IEnumerator Wait(string url, float seconds, Action<bool> done)
        {
            float until = Time.realtimeSinceStartup + seconds;
            while (Time.realtimeSinceStartup < until)
            {
                using var req = UnityWebRequest.Get(url + "/health");
                req.timeout = 3;
                yield return req.SendWebRequest();
                if (req.result == UnityWebRequest.Result.Success) { done(true); yield break; }
                yield return new WaitForSecondsRealtime(0.3f);
            }
            done(false);
        }

        static int FreePort()
        {
            var l = new TcpListener(IPAddress.Loopback, 0); l.Start();
            int p = ((IPEndPoint)l.LocalEndpoint).Port; l.Stop(); return p;
        }

        void OnApplicationQuit() { try { if (proc != null && !proc.HasExited) proc.Kill(); } catch { } }
    }
}
