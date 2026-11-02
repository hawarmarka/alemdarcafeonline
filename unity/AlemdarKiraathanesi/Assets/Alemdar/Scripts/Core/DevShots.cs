// Geliştirici denetimi (yalnızca komut satırıyla): -ad X  -cek klasor  -oyna  -kapat
// -cek: sırayla ekran görüntüleri alır (salon, yürüyüş, masa, oyun). -oyna: bir masa kurar ve botlarla başlatır. -kapat: bitince çıkar.
using System;
using System.Collections;
using System.IO;
using System.Linq;
using UnityEngine;

namespace Alemdar
{
    public class DevShots : MonoBehaviour
    {
        public static string Arg(string key)
        {
            var a = Environment.GetCommandLineArgs();
            for (int i = 0; i < a.Length; i++) if (a[i] == key) return i + 1 < a.Length && !a[i + 1].StartsWith("-") ? a[i + 1] : "";
            return null;
        }

        IEnumerator Start()
        {
            string dir = Arg("-cek"); if (dir == null) yield break;
            Directory.CreateDirectory(dir);
            var app = App.I;
            while (!app.Hud) yield return null;
            yield return new WaitForSeconds(3);
            Shot(dir, "1_teras");
            // salona yürü; konum, yön ve bakış yönü ölçülerek kaydedilir (yüzü gittiği yöne mi bakıyor?)
            StartCoroutine(Track(app));
            app.Me.WalkTo(new Vector3(0, 0, 1.8f));
            yield return new WaitForSeconds(2.2f); Shot(dir, "2_yuruyus");
            yield return new WaitForSeconds(3); Shot(dir, "3_salon");
            app.Order("cay"); yield return new WaitForSeconds(6); Shot(dir, "4_kahveci");
            // sabit kamera görüntüleri: ocak, Anten afişi, nargile ve duman
            app.Me.InputLocked = true;
            yield return CamShot(dir, "k1_ocak", new Vector3(.8f, 1.6f, -3.2f), new Vector3(.5f, 1.0f, -6f));
            yield return CamShot(dir, "k2_afis", new Vector3(4.4f, 1.7f, -3.4f), new Vector3(6.6f, 1.75f, -3.4f));
            yield return CamShot(dir, "k3_nargile", new Vector3(-3.2f, 1.3f, -2.0f), new Vector3(-3.25f, .7f, -3.35f));
            app.Me.InputLocked = false;
            app.Hud.ShowTable(7); yield return new WaitForSeconds(.6f); Shot(dir, "u1_masa_paneli"); yield return new WaitForSeconds(.2f); app.Hud.HideTable(); // görüntü kare sonunda alınır
            Phase("salon");
            if (Arg("-oyna") != null)
            {
                string joinErr = null; app.Io.On("gameError", d => joinErr ??= (string)d["message"]);
                StartCoroutine(TrackSit(app, () => joinErr));
                app.SitAndJoin(4, 0, new { mode = "create", modeKey = "klasik", stackingMode = false, assisted = true, bet = 1000, roundLimit = 1, isPublic = true, seat = 0, teamMode = false, hallTable = 4 });
                float until = Time.time + 20; while (app.Okey.State == null && Time.time < until) { if (app.SeatedTable >= 0) app.Io.Emit("startWithBots"); yield return new WaitForSeconds(1.5f); }
                yield return new WaitForSeconds(3); Shot(dir, "5_masa");
                report.Append("masadaki rakiplerin yönü: " + app.Okey.FacingReport() + "\n");
                // otomatik oyun: sıram geldikçe çek ve at; sunucu hatalarını say; el sonunu bekle
                int errors = 0, draws = 0, discards = 0; bool finished = false; string lastError = "";
                app.Io.On("gameError", d => { errors++; lastError = (string)d["message"]; });
                app.Io.On("gameFinished", _ => finished = true);
                var o = app.Okey;
                if ((bool?)o.State?["assisted"] == true) { o.Arrange("series"); yield return new WaitForSeconds(1); Shot(dir, "6_dizildi"); }
                if (Arg("-senaryo") != null)
                {
                    // Seri açma + rakibin serisine işleme: el sunucuda kurulur (OKEY_DEBUG), hamleler gerçek düğme yolundan.
                    var ok = new System.Collections.Generic.List<string>();
                    app.Io.On("actionSuccess", d => ok.Add((string)d["message"]));
                    object T(string c, int n) => new object[] { c, n };
                    app.Io.Emit("debugSetup", new
                    {
                        reset = true, myTurn = true, drawn = true,
                        hand = new[] { T("Kirmizi", 10), T("Kirmizi", 11), T("Kirmizi", 12), T("Kirmizi", 13), T("Mavi", 10), T("Yesil", 10), T("Siyah", 10),
                                       T("Mavi", 11), T("Yesil", 11), T("Siyah", 11), T("Mavi", 12), T("Yesil", 12), T("Siyah", 12),
                                       T("Mavi", 6), T("Siyah", 2), T("Yesil", 7) }, // okey hangi taş olursa olsun 101'i geçer
                        opponentGroups = new[] { new[] { T("Mavi", 3), T("Mavi", 4), T("Mavi", 5) } },
                    });
                    yield return new WaitForSeconds(1.2f);
                    o.Arrange("series"); o.Zoom = 0; yield return new WaitForSeconds(1.5f); Shot(dir, "s1_dizildi_yakin"); o.Zoom = .35f;
                    o.OpenSeries(); yield return new WaitForSeconds(1.5f); Shot(dir, "s2_acildi");
                    var m6 = (o.State?["tiles"] as Newtonsoft.Json.Linq.JArray)?.FirstOrDefault(t => (string)t["color"] == "Mavi" && (int?)t["number"] == 6);
                    if (m6 != null) { o.Move("addToGroup", new { tileId = (string)m6["id"], targetPlayerIndex = ((int)o.State["playerIndex"] + 1) % 4, targetGroupIndex = 0 }); yield return new WaitForSeconds(1.5f); }
                    Shot(dir, "s3_islendi");
                    report.Append($"senaryo: başarılı {ok.Count} [{string.Join(" | ", ok)}], hata {errors}{(errors > 0 ? " (" + lastError + ")" : "")}, eldeki taş {(o.State?["tiles"] as Newtonsoft.Json.Linq.JArray)?.Count}, açtı {o.State?["myOpenType"]}\n");
                    errors = 0;
                }
                float end = Time.time + 150;
                while (Time.time < end && !finished)
                {
                    yield return new WaitForSeconds(.4f);
                    var s = o.State; if (s == null || !o.MyTurn) continue;
                    if ((bool?)s["hasDrawn"] != true) { o.Move("drawTile", new { fromDiscard = false }); draws++; yield return new WaitForSeconds(.9f); if (draws == 1) Shot(dir, "7_cekti"); continue; }
                    var tiles = (Newtonsoft.Json.Linq.JArray)s["tiles"];
                    Newtonsoft.Json.Linq.JToken pick = null;
                    foreach (var t in tiles) if (!Okey.TileView.IsOkey(t, s["okey"])) pick = t;
                    if (pick != null) { o.Discard((string)pick["id"]); discards++; yield return new WaitForSeconds(.9f); if (discards == 1) Shot(dir, "8_atti"); }
                }
                yield return new WaitForSeconds(1.5f); Shot(dir, "9_elsonu");
                report.Append($"oyun: çekme {draws}, atma {discards}, sunucu hatası {errors}{(errors > 0 ? " (son: " + lastError + ")" : "")}, el bitti {finished}\n");
            }
            File.WriteAllText(Path.Combine(dir, "fps.txt"), report.ToString() + Stats("masa") + $"ekran={Screen.currentResolution.refreshRateRatio.value:0}Hz vsync={QualitySettings.vSyncCount}\n");
            if (Arg("-kapat") != null) Application.Quit();
        }

        IEnumerator TrackSit(App app, System.Func<string> err)
        {
            for (int i = 0; i < 10; i++)
            {
                yield return new WaitForSeconds(1);
                var p = app.Me.transform.position;
                report.Append($"oturma {i}: konum ({p.x:0.00},{p.z:0.00}) oturdu {app.Me.Seated} masa {app.SeatedTable} yol {app.Me.PathLeft} hız {app.Me.Speed:0.0} oyun {(app.Okey.State != null)} hata {err() ?? "-"}\n");
                if (app.Okey.State != null) yield break;
            }
        }
        IEnumerator CamShot(string dir, string name, Vector3 pos, Vector3 look)
        {
            var cam = Camera.main.transform; cam.SetPositionAndRotation(pos, Quaternion.LookRotation(look - pos));
            yield return new WaitForSeconds(1.2f); Shot(dir, name); yield return null;
        }
        // Yürüyüş denetimi: hareket yönü ile gövdenin önü (modelin -z ekseni) arasındaki açı. 90°'den büyükse geri geri yürüyor.
        IEnumerator Track(App app)
        {
            Vector3 last = app.Me.transform.position;
            for (int i = 0; i < 12; i++)
            {
                yield return new WaitForSeconds(.5f);
                var p = app.Me.transform.position; var mv = p - last; mv.y = 0; last = p;
                var body = Vector3.ProjectOnPlane(app.Me.Body.BoneFront, Vector3.up);
                if (mv.magnitude > .05f) report.Append($"yürüyüş: konum ({p.x:0.0},{p.z:0.0}) hareket-gövde açısı {Vector3.Angle(mv, body):0}°\n");
            }
        }
        // Ölçüm: aşama başına medyan FPS, en kötü %5 kare, işlemci ve ekran kartı süreleri.
        readonly System.Collections.Generic.List<float> frames = new(), cpu = new(), gpu = new();
        readonly System.Text.StringBuilder report = new();
        readonly FrameTiming[] ft = new FrameTiming[1];
        string Stats(string phase)
        {
            if (frames.Count < 10) return "";
            frames.Sort(); cpu.Sort(); gpu.Sort();
            float Med(System.Collections.Generic.List<float> l) => l.Count > 0 ? l[l.Count / 2] : 0;
            string s = $"{phase}: medyan {1000f / Med(frames):0} FPS, p95 {frames[(int)(frames.Count * .95f)]:0.0} ms, en kötü {frames[^1]:0.0} ms, işlemci {Med(cpu):0.0} ms, ekran kartı {Med(gpu):0.0} ms\n";
            frames.Clear(); cpu.Clear(); gpu.Clear(); return s;
        }
        public void Phase(string name) => report.Append(Stats(name));
        void Update()
        {
            if (Time.time < 4) return;
            frames.Add(Time.unscaledDeltaTime * 1000);
            FrameTimingManager.CaptureFrameTimings();
            if (FrameTimingManager.GetLatestTimings(1, ft) > 0) { cpu.Add((float)ft[0].cpuMainThreadFrameTime); gpu.Add((float)ft[0].gpuFrameTime); }
        }
        static void Shot(string dir, string name) => ScreenCapture.CaptureScreenshot(Path.Combine(dir, name + ".png"));
    }
}
