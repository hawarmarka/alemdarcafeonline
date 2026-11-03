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
            yield return CamShot(dir, "k4_tabela", new Vector3(1.5f, 1.7f, World.Hall.TerraceZ + 5f), new Vector3(0, 2f, World.Hall.TerraceZ));
            yield return CamShot(dir, "k5_salon", new Vector3(-5.8f, 2.3f, 4.6f), new Vector3(.5f, .5f, -1.5f));
            yield return CamShot(dir, "k6_masalar", new Vector3(-2.6f, 1.45f, -1.6f), new Vector3(-4.2f, .76f, -3f));
            yield return CamShot(dir, "k7_tv", new Vector3(3.6f, 1.7f, .2f), new Vector3(World.Hall.MaxX, 2.1f, 0));
            yield return CamShot(dir, "k8_domino_tavla", new Vector3(1.2f, 1.5f, -1.6f), new Vector3(0, .76f, -3f));
            // mahalle: sokak, bina, bakkal, teyzeler, park, çay bahçesi; sonra gün batımı, gece ve yağmur
            yield return CamShot(dir, "m1_sokak", new Vector3(-14f, 1.7f, 16.5f), new Vector3(2f, 4f, 5f));
            yield return CamShot(dir, "m2_bina", new Vector3(4f, 1.6f, 24f), new Vector3(0, 7f, 5f));
            yield return CamShot(dir, "m3_bakkal", new Vector3(10.5f, 1.6f, 12.5f), new Vector3(9.5f, 1f, 5.5f));
            yield return CamShot(dir, "m4_teyzeler", new Vector3(-6.6f, 3.2f, 11f), new Vector3(-6.8f, 4.6f, 5.4f));
            yield return CamShot(dir, "m5_park", new Vector3(-4f, 1.7f, 21.5f), new Vector3(2f, 1.5f, 34f));
            yield return CamShot(dir, "m6_cay_bahcesi", new Vector3(12f, 1.8f, 32f), new Vector3(18f, .7f, 37.5f));
            yield return CamShot(dir, "m13_modern_apartman", new Vector3(18f, 1.8f, 16f), new Vector3(25f, 6f, 5f));
            yield return CamShot(dir, "k9_fiyat_jaluzi", new Vector3(-2.5f, 1.6f, -1.5f), new Vector3(-2.9f, 1.6f, -6.2f));
            yield return CamShot(dir, "k10_camekan", new Vector3(-3f, 1.6f, 1.5f), new Vector3(-3.5f, 1.8f, 5f));
            yield return CamShot(dir, "m12_cocuklar", World.Playground.Center + new Vector3(4.5f, 2.2f, -5f), World.Playground.Center + new Vector3(0, .6f, -.5f));
            if (World.Weather.I)
            {
                World.Weather.I.Show(2); yield return new WaitForSeconds(1.5f); yield return CamShot(dir, "m7_gun_batimi", new Vector3(-14f, 1.7f, 16.5f), new Vector3(2f, 4f, 5f));
                World.Weather.I.Show(3); yield return new WaitForSeconds(1.5f); yield return CamShot(dir, "m8_gece", new Vector3(-14f, 1.7f, 16.5f), new Vector3(2f, 4f, 5f));
                World.Weather.I.Show(1); World.Weather.I.ForceRain = true; yield return new WaitForSeconds(3f); yield return CamShot(dir, "m9_yagmur", new Vector3(-4f, 1.7f, 21.5f), new Vector3(2f, 1.5f, 34f));
                World.Weather.I.ForceRain = false; World.Weather.I.Show(0);
            }
            // parkta banka otur: oturunca gövde bankın önüne mi bakıyor?
            if (World.Neighborhood.Seats.Count > 0)
            {
                var (sp, sr) = World.Neighborhood.Seats[0];
                app.Me.InputLocked = false; app.Me.transform.position = sp + sr * Vector3.forward * 1.2f + Vector3.up * .05f;
                bool sat = false; app.Me.WalkTo(sp + sr * Vector3.forward * .5f, () => { app.Me.SitAt(sp, sr); sat = true; });
                float until2 = Time.time + 12; while (!sat && Time.time < until2) yield return null;
                yield return new WaitForSeconds(2.5f);
                float ang = Vector3.Angle(Vector3.ProjectOnPlane(app.Me.Body.BoneFront, Vector3.up), sr * Vector3.forward);
                report.Append($"bank: oturdu {app.Me.Seated}, gövde-bank önü açısı {ang:0}°\n");
                yield return CamShot(dir, "m10_bank", sp + sr * new Vector3(.8f, 1.3f, 2.2f), sp + Vector3.up * .7f);
                app.Me.StandUp(); yield return new WaitForSeconds(1);
                var (cp, cr) = World.Neighborhood.Seats[World.Neighborhood.Seats.Count - 1];
                yield return CamShot(dir, "m11_sandalye", cp + cr * new Vector3(.6f, 1.4f, 1.8f), cp + Vector3.up * .5f);
            }
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
                app.Okey.DebugGesture(Chars.Person.Drink); yield return new WaitForSeconds(1.6f); Shot(dir, "5b_cay_iciyor");
                yield return new WaitForSeconds(3.6f);
                app.Okey.DebugGesture(Chars.Person.Talk); yield return new WaitForSeconds(1.2f); Shot(dir, "5c_konusuyor");
                yield return new WaitForSeconds(3f);
                report.Append("hareketten sonra yön: " + app.Okey.FacingReport() + "\n");
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
            if (Time.unscaledDeltaTime > .2f) report.Append($"UZUN KARE {Time.unscaledDeltaTime * 1000:0} ms, t={Time.time:0.0}, son çekim: {lastShot}\n");
            FrameTimingManager.CaptureFrameTimings();
            if (FrameTimingManager.GetLatestTimings(1, ft) > 0) { cpu.Add((float)ft[0].cpuMainThreadFrameTime); gpu.Add((float)ft[0].gpuFrameTime); }
        }
        static string lastShot = "-";
        static void Shot(string dir, string name) { lastShot = name; ScreenCapture.CaptureScreenshot(Path.Combine(dir, name + ".png")); }
    }
}
