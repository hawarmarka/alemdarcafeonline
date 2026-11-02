// Uzun oyun denetimi: AlemdarKiraathanesi.exe -ad Deneme -uzun <klasör> [-el 4] -kapat
// Botlarla çok elli maç oynar; hamleleri gerçek düğmelere basarak yapar (SERİ DİZ, ÇİFT DİZ, SERİ AÇ, ÇİFT AÇ, İŞLE, GERİ BIRAK, BİTİR).
// Sayar: sunucu hataları, Unity hataları, takılmalar, taş bütünlüğü (106), ıstaka ile sunucu eli farkı, el başına FPS.
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Text;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.UI;

namespace Alemdar
{
    public class DevLong : MonoBehaviour
    {
        readonly StringBuilder log = new();
        readonly Dictionary<string, int> serverErrors = new(), unityErrors = new(), pressed = new();
        readonly List<float> frames = new(), cpu = new(), gpu = new();
        readonly FrameTiming[] ft = new FrameTiming[1];
        int unfocused;
        bool atTable;
        // her kare ölçülür (yalnızca masadayken)
        void Update()
        {
            if (!atTable) return;
            if (!Application.isFocused) unfocused++;
            frames.Add(Time.unscaledDeltaTime * 1000);
            FrameTimingManager.CaptureFrameTimings();
            if (FrameTimingManager.GetLatestTimings(1, ft) > 0) { cpu.Add((float)ft[0].cpuMainThreadFrameTime); gpu.Add((float)ft[0].gpuFrameTime); }
        }
        int states, mismatches, rackMismatches, stalls, hands;
        float lastState;

        void Note(string s) { log.AppendLine($"[{Time.time:0.0}] {s}"); }
        static void Count(Dictionary<string, int> d, string k) => d[k] = d.TryGetValue(k, out var n) ? n + 1 : 1;

        // Düğmeye etiketiyle bulup gerçek tıklamayla basar; soluk düğmeye basılmaz.
        bool Press(string label)
        {
            var b = FindObjectsByType<Button>(FindObjectsInactive.Exclude, FindObjectsSortMode.None)
                .FirstOrDefault(x => x.GetComponentInChildren<Text>()?.text == label);
            if (b == null || !b.interactable || !b.gameObject.activeInHierarchy) return false;
            b.onClick.Invoke(); Count(pressed, label); return true;
        }

        IEnumerator Start()
        {
            string dir = DevShots.Arg("-uzun"); Directory.CreateDirectory(dir);
            int handsWanted = int.TryParse(DevShots.Arg("-el"), out var h) ? h : 4;
            Application.logMessageReceived += (msg, st, type) => { if (type is LogType.Error or LogType.Exception or LogType.Assert) Count(unityErrors, msg.Split('\n')[0]); };
            var app = App.I;
            while (!app.Hud) yield return null;
            yield return new WaitForSeconds(2);
            app.Io.On("gameError", d => { Count(serverErrors, (string)d["message"]); Note("sunucu hatası: " + (string)d["message"]); });
            app.Io.On("penalty", d => Note($"ceza: {(string)d["name"]} · {(string)d["reason"]} · +{(int?)d["amount"]}"));
            bool matchEnded = false;
            app.Io.On("gameFinished", d =>
            {
                hands++;
                var pts = string.Join(", ", ((JArray)d["players"]).Select((p, i) => $"{(string)p["name"]} {(int?)((JArray)d["points"])?[i] ?? 0}"));
                Note($"EL {hands} BİTTİ: {(string)d["winnerName"]} · {pts}");
                ScreenCapture.CaptureScreenshot(Path.Combine(dir, $"el{hands}.png"));
                if ((bool?)d["matchEnded"] == true) matchEnded = true;
            });
            var o = app.Okey;
            o.OnState += () => { states++; lastState = Time.time; Check(o); };

            app.SitAndJoin(4, 0, new { mode = "create", modeKey = "klasik", stackingMode = false, assisted = true, bet = 1000, roundLimit = handsWanted, isPublic = false, seat = 0, teamMode = false, hallTable = 4 });
            float until = Time.time + 25; while (o.State == null && Time.time < until) { if (app.SeatedTable >= 0) app.Io.Emit("startWithBots"); yield return new WaitForSeconds(1.5f); }
            if (o.State == null) { Note("MASAYA OTURULAMADI"); Finish(dir); yield break; }
            Note("masa kuruldu: " + (string)o.State["roomCode"]);
            lastState = Time.time; atTable = true;

            float end = Time.time + handsWanted * 240f; int myTurns = 0; bool triedLeft = false, ordered = false; string round = null;
            while (Time.time < end && !matchEnded)
            {
                yield return new WaitForSeconds(.35f);
                // 45 sn hiç durum gelmediyse ve el sonu tablosunda değilsek takılma say
                if (Time.time - lastState > 45) { stalls++; Note("TAKILMA: 45 sn durum gelmedi"); lastState = Time.time; }
                var s = o.State; if (s == null) continue;
                if ((string)s["roundId"] != round) { round = (string)s["roundId"]; triedLeft = false; Note($"yeni el · başlayan {(int)s["currentPlayer"]} · elimde {((JArray)s["tiles"]).Count}"); }
                if (!ordered && myTurns == 3) { app.Order("cay"); ordered = true; }
                if (!o.MyTurn) continue;
                myTurns++;
                var tiles = (JArray)s["tiles"];
                if ((bool?)s["hasDrawn"] != true)
                {
                    // her elde bir kez yandan al, kullanamazsan GERİ BIRAK (101 ceza yolunu da dener)
                    var left = LeftTop(s);
                    if (!triedLeft && left != null && (string)s["myOpenType"] == null && myTurns > 2) { triedLeft = true; o.Move("drawTile", new { fromDiscard = true }); yield return new WaitForSeconds(1); if (Press("GERİ BIRAK")) yield return new WaitForSeconds(1); continue; }
                    o.Move("drawTile", new { fromDiscard = false }); yield return new WaitForSeconds(.8f); continue;
                }
                // çektim: diz, açabiliyorsam aç, işle, bitir; sonra en işe yaramaz taşı at
                bool opened = s["myOpenType"]?.Type == JTokenType.String;
                bool pairsHand = hands % 2 == 1; // tek sayılı ellerde çift dene
                if (!opened)
                {
                    Press(pairsHand ? "ÇİFT DİZ" : "SERİ DİZ"); yield return new WaitForSeconds(.6f);
                    if (pairsHand) { if (o.RackGroups(2).Count(g => g.Count == 2) >= 5 && Press("ÇİFT AÇ")) yield return new WaitForSeconds(1); }
                    else if (Press("SERİ AÇ")) yield return new WaitForSeconds(1.2f);
                }
                else { if (Press("İŞLE")) yield return new WaitForSeconds(1); }
                s = o.State; if (!o.MyTurn || (bool?)s["hasDrawn"] != true) continue;
                tiles = (JArray)s["tiles"];
                if (tiles.Count == 1 && Press("BİTİR")) { yield return new WaitForSeconds(1.5f); continue; }
                var keep = new HashSet<string>(o.RackGroups(s["myOpenType"]?.ToString() == "pairs" || pairsHand ? 2 : 3).SelectMany(g => g));
                var pick = tiles.Where(t => !Okey.TileView.IsOkey(t, s["okey"])).OrderBy(t => keep.Contains((string)t["id"]) ? 1 : 0).ThenByDescending(t => (int)t["number"]).FirstOrDefault()
                           ?? tiles.FirstOrDefault();
                if (pick != null) { o.Discard((string)pick["id"]); yield return new WaitForSeconds(.9f); }
            }
            atTable = false;
            Note($"bitti · el {hands} · maç bitti {matchEnded} · benim turum {myTurns}");
            yield return new WaitForSeconds(2); ScreenCapture.CaptureScreenshot(Path.Combine(dir, "son.png"));
            // masadan kalk, salona dön
            app.LeaveTable(); yield return new WaitForSeconds(4);
            Note($"kalktı: masa {app.SeatedTable}, oturuyor {app.Me.Seated}, okey durumu {(o.State != null)}");
            ScreenCapture.CaptureScreenshot(Path.Combine(dir, "salon_donus.png"));
            yield return new WaitForSeconds(1);
            Finish(dir);
        }

        static JToken LeftTop(JToken s)
        {
            int me = (int)s["playerIndex"], left = (me + 3) % 4;
            var piles = s["discards"] as JArray; var pile = piles?[left] as JArray;
            return pile != null && pile.Count > 0 ? pile[pile.Count - 1] : null;
        }

        // taş bütünlüğü: deste + eller + atıklar + masadaki gruplar + gösterge = 106; ıstaka görünümü sunucu eliyle aynı
        void Check(Okey.OkeyTable o)
        {
            var s = o.State;
            int n = (int)s["pileCount"] + ((JArray)s["players"]).Sum(p => (int?)p["tileCount"] ?? 0)
                  + ((JArray)s["discards"]).Sum(p => ((JArray)p).Count)
                  + ((JArray)s["openedGroups"]).Sum(p => ((JArray)p).Sum(g => ((JArray)g).Count))
                  + ((JArray)s["extraPairs"]).Sum(p => ((JArray)p).Sum(g => ((JArray)g).Count)) + 1;
            if (n != 106 && mismatches++ < 5) Note($"TAŞ SAYISI {n} (106 olmalı)");
            int hand = ((JArray)s["tiles"]).Count;
            if (o.RackCount != hand && rackMismatches++ < 5) Note($"ISTAKA {o.RackCount} taş, sunucu eli {hand}");
        }

        void Finish(string dir)
        {
            frames.Sort(); cpu.Sort(); gpu.Sort();
            string fps = frames.Count > 10 ? $"medyan {1000f / frames[frames.Count / 2]:0} FPS, p95 {frames[(int)(frames.Count * .95f)]:0.0} ms, p99 {frames[(int)(frames.Count * .99f)]:0.0} ms, en kötü {frames[^1]:0} ms, işlemci {(cpu.Count > 0 ? cpu[cpu.Count / 2] : 0):0.0} ms, ekran kartı {(gpu.Count > 0 ? gpu[gpu.Count / 2] : 0):0.0} ms, odak dışı kare {unfocused}/{frames.Count}" : "-";
            var sb = new StringBuilder();
            sb.AppendLine($"ÖZET: el {hands}, durum mesajı {states}, takılma {stalls}, taş sayısı hatası {mismatches}, ıstaka farkı {rackMismatches}, {fps}");
            sb.AppendLine("basılan düğmeler: " + string.Join(", ", pressed.Select(kv => $"{kv.Key} {kv.Value}")));
            sb.AppendLine("sunucu hataları: " + (serverErrors.Count == 0 ? "yok" : string.Join(" | ", serverErrors.Select(kv => $"{kv.Key} ×{kv.Value}"))));
            sb.AppendLine("Unity hataları: " + (unityErrors.Count == 0 ? "yok" : string.Join(" | ", unityErrors.Select(kv => $"{kv.Key} ×{kv.Value}"))));
            sb.AppendLine().Append(log);
            File.WriteAllText(Path.Combine(dir, "uzun.txt"), sb.ToString());
            if (DevShots.Arg("-kapat") != null) Application.Quit();
        }
    }
}
