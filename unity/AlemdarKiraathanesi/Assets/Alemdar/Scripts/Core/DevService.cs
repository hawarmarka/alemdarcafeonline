// Geliştirici denetimi: kahveci ve ikramlar. -ikram klasor [-kapat]
// Salondaki 4. masada okey kurar, botlarla başlatır; iki kez çay ister (üst üste binmemeli), içer (Q), kahvecinin boşu toplamasını bekler,
// sigara (G) ve nargile (H) dener. Ekran görüntüleri ve rapor (ikram.txt) klasöre yazılır.
using System.Collections;
using System.IO;
using UnityEngine;

namespace Alemdar
{
    public class DevService : MonoBehaviour
    {
        readonly System.Text.StringBuilder log = new();
        void L(string s) { log.Append($"[{Time.time:0.0}] {s}\n"); Debug.Log("IKRAM " + s); }
        string dir;
        IEnumerator Shot(string name) { yield return new WaitForEndOfFrame(); ScreenCapture.CaptureScreenshot(Path.Combine(dir, name + ".png")); yield return null; }
        int Count(string name) { int n = 0; foreach (Transform t in App.I.Hall.Root) if (t.name == name) n++; return n; }

        IEnumerator Start()
        {
            dir = DevShots.Arg("-ikram"); if (string.IsNullOrEmpty(dir)) dir = Application.persistentDataPath; Directory.CreateDirectory(dir);
            var app = App.I;
            while (!app.Hud || app.Me == null) yield return null;
            yield return new WaitForSeconds(3);
            const int table = 3;
            app.Hud.ShowTable(table); yield return new WaitForSeconds(.5f);
            app.Hud.DebugCreate();
            float wait = Time.time + 15; while (app.Hud.LobbyCount < 1 && Time.time < wait) yield return null;
            yield return new WaitForSeconds(1); app.Io.Emit("startWithBots");
            float until = Time.time + 15; while (app.Okey.State == null && Time.time < until) yield return null;
            L($"masada: {app.SeatedTable}, yön {app.SeatedDir}");
            app.Order("cay"); yield return new WaitForSeconds(4.5f); app.Order("kahve");
            until = Time.time + 40; while (!app.Service.HasCup(table, app.SeatedDir) && Time.time < until) yield return null;
            L($"ilk ikram geldi: {app.Service.HasCup(table, app.SeatedDir)}, salonda çay {Count("cay")}");
            yield return new WaitForSeconds(26); // ikinci sipariş eskisini alıp yerine konsun
            L($"ikinci ikram sonrası: kahve {Count("kahve")}, çay {Count("cay")} (masada tek ikram kalmalı)");
            yield return Shot("i1_ikram");
            for (int i = 0; i < 6; i++)
            {
                bool ok = app.Service.SipMine(); yield return new WaitForSeconds(1f);
                if (i == 0) yield return Shot("i2_yudum");
                yield return new WaitForSeconds(1.4f); L($"yudum {i + 1}: {ok}");
                if (!ok) break;
            }
            yield return Shot("i3_bitti");
            until = Time.time + 60; while (app.Service.HasCup(table, app.SeatedDir) && Time.time < until) yield return null;
            yield return Shot("i3b_toplandi");
            L($"kahveci boşu topladı: {!app.Service.HasCup(table, app.SeatedDir)}");
            app.Service.SmokeMine(); yield return new WaitForSeconds(1.5f); yield return Shot("i4_sigara");
            yield return new WaitForSeconds(2.5f);
            app.Order("nargile");
            until = Time.time + 40; while (!app.Service.HasNargile(table, app.SeatedDir) && Time.time < until) yield return null;
            L($"nargile geldi: {app.Service.HasNargile(table, app.SeatedDir)}");
            yield return new WaitForSeconds(2);
            app.Service.NargileMine(); yield return new WaitForSeconds(1.2f); yield return Shot("i5_nargile");
            // dışarıdan bakış: masadan kalkıp kendi masamı yandan gör
            app.LeaveTable(); yield return new WaitForSeconds(1.5f);
            var cam = Camera.main.transform; app.Me.InputLocked = true; var t = app.Hall.Tables[table];
            cam.SetPositionAndRotation(t + new Vector3(1.6f, 1.5f, 1.6f), Quaternion.LookRotation(t + Vector3.up * .8f - (t + new Vector3(1.6f, 1.5f, 1.6f))));
            yield return new WaitForSeconds(.5f); yield return Shot("i6_masa_disaridan");
            File.WriteAllText(Path.Combine(dir, "ikram.txt"), log.ToString());
            if (DevShots.Arg("-kapat") != null) Application.Quit();
        }
    }
}
