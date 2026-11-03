// Geliştirici denetimi: Batak. -batak klasor [-kapat]
// Salondaki 4. masada Batak kurar, botlarla başlatır; sırası geldikçe söz verir, koz seçer, oynanabilir ilk kâğıdı oynar.
// Ekran görüntüleri ve rapor (batak.txt) klasöre yazılır.
using System.Collections;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace Alemdar
{
    public class DevBatak : MonoBehaviour
    {
        readonly System.Text.StringBuilder log = new();
        void L(string s) { log.Append($"[{Time.time:0.0}] {s}\n"); Debug.Log("BATAK " + s); }
        string dir;
        IEnumerator Shot(string name) { yield return new WaitForEndOfFrame(); ScreenCapture.CaptureScreenshot(Path.Combine(dir, name + ".png")); yield return null; }

        IEnumerator Start()
        {
            dir = DevShots.Arg("-batak"); if (string.IsNullOrEmpty(dir)) dir = Application.persistentDataPath; Directory.CreateDirectory(dir);
            var app = App.I;
            while (!app.Hud || !app.BatakUi) yield return null;
            yield return new WaitForSeconds(3);
            int errors = 0, plays = 0, bids = 0; string lastErr = "";
            app.Io.On("batak:error", d => { errors++; lastErr = (string)d["message"]; L("HATA " + lastErr); });
            const int table = 3;
            app.Hud.ShowTable(table); yield return new WaitForSeconds(.6f);
            yield return Shot("b0_panel");
            app.SitAndJoinBatak(table, 0, new { mode = "create", type = DevShots.Arg("-tur") ?? "ihaleli", rounds = 5, isPublic = true, seat = 0, hallTable = table });
            float until = Time.time + 20; while (app.Batak.State == null && Time.time < until) yield return null;
            L($"masa: {(string)app.Batak.State?["code"]} faz {app.Batak.Phase}");
            yield return new WaitForSeconds(1); yield return Shot("b1_bekleme");
            app.Io.Emit("batak:startBots");
            until = Time.time + 10; while (app.Batak.Phase == "waiting" && Time.time < until) yield return null;
            yield return new WaitForSeconds(1.5f); yield return Shot("b2_ihale");
            bool shotPlay = false, shotTrick = false, shotEnd = false; int round = 0;
            until = Time.time + 170;
            while (Time.time < until)
            {
                var t = app.Batak; var s = t.State; if (s == null) break;
                int r = (int?)s["round"] ?? 0; if (r != round) { round = r; L($"el {r} başladı"); }
                if (t.Phase == "matchEnd") { L("maç bitti"); yield return new WaitForSeconds(1.5f); yield return Shot("b6_mac_sonu"); break; }
                if (t.Phase == "roundEnd" && !shotEnd) { shotEnd = true; yield return new WaitForSeconds(1); yield return Shot("b5_el_sonu"); }
                if (t.Phase == "trickEnd" && !shotTrick) { shotTrick = true; yield return Shot("b4_el_aldi"); }
                if (t.MyTurn)
                {
                    yield return new WaitForSeconds(.8f);
                    s = t.State; if (!t.MyTurn) continue;
                    if (t.Phase == "bidding")
                    {
                        bool declare = (bool?)s["declare"] == true; int min = (int?)s["bidding"]?["minNext"] ?? 0;
                        if (bids == 0) yield return Shot("b2b_soz_sirasi");
                        app.Io.Emit("batak:bid", new { value = declare ? (int?)3 : (bids == 0 ? (int?)min : null) }); bids++;
                    }
                    else if (t.Phase == "trump") { yield return Shot("b3a_koz_sec"); var hand = (JArray)s["hand"]; var best = hand.GroupBy(c => (string)c["suit"]).OrderByDescending(g => g.Count()).First().Key; app.Io.Emit("batak:trump", new { suit = best }); }
                    else if (t.Phase == "playing")
                    {
                        if (!shotPlay) { shotPlay = true; yield return Shot("b3_oyun"); }
                        var legal = ((JArray)s["legal"]).Select(x => (string)x).ToList();
                        app.Io.Emit("batak:play", new { cardId = legal.FirstOrDefault() }); plays++;
                    }
                    float wait = Time.time + 3; while (t.MyTurn && Time.time < wait) yield return null;
                }
                yield return null;
            }
            var fin = app.Batak.State;
            L($"sonuç: faz {app.Batak.Phase}, el {(int?)fin?["round"]}, söz {bids}, oynanan {plays}, hata {errors} {lastErr}");
            if (fin != null) L("puanlar: " + string.Join(", ", ((JArray)fin["players"]).Select(p => $"{(string)p["name"]} {(int?)p["total"]}")));
            File.WriteAllText(Path.Combine(dir, "batak.txt"), log.ToString());
            if (DevShots.Arg("-kapat") != null) Application.Quit();
        }
    }
}
