// Geliştirici denetimi: arkadaşla aynı masa. İki oyun aynı sunucuya bağlanır (-sunucu URL).
// -arkadas kur:   masayı salondaki 5. masada kurar, ikinci oyuncu oturunca botlarla başlatır.
// -arkadas katil: salonda o masayı bulur, kendi kullandığı arayüz yolundan (masa paneli → OTUR) oturur.
// Rapor -rapor klasöründe arkadas_<ad>.txt; -kapat ile biter.
using System.Collections;
using System.IO;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.Networking;

namespace Alemdar
{
    public class DevFriends : MonoBehaviour
    {
        readonly System.Text.StringBuilder log = new();
        void L(string s) { log.Append($"[{Time.time:0.0}] {s}\n"); Debug.Log("ARKADAS " + s); }

        IEnumerator Start()
        {
            string role = DevShots.Arg("-arkadas"), dir = DevShots.Arg("-rapor") ?? Application.persistentDataPath;
            var app = App.I;
            while (!app.Hud || app.Me == null) yield return null;
            yield return new WaitForSeconds(3);
            L($"rol {role}, ad {app.MyName}, sunucu {app.Io.Url}");
            app.Io.On("gameError", d => L("HATA: " + (string)d["message"]));
            app.Io.On("joinedGame", d => L("masaya katıldı " + (string)d["code"]));
            app.Io.On("lobbyUpdate", d => L($"bekleme: {string.Join(", ", ((JArray)d["players"]).Select(p => (string)p["name"]))} kurucu {(int?)d["hostIndex"]}"));
            bool started = false; app.Io.On("gameState", d => { if (!started) { started = true; L("oyun başladı: " + string.Join(", ", ((JArray)d["players"]).Select(p => (string)p["name"]))); } });
            const int table = 4;
            if (role == "kur")
            {
                app.Hud.ShowTable(table); yield return new WaitForSeconds(.5f);
                app.Hud.DebugCreate();
                float until = Time.time + 60;
                while (Time.time < until && !started)
                {
                    yield return new WaitForSeconds(1);
                    if (app.Okey.State == null && app.SeatedTable >= 0 && LastLobbyCount(app) >= 2) { yield return new WaitForSeconds(2); L("ikinci oyuncu geldi, botlarla başlatılıyor"); app.Io.Emit("startWithBots"); yield return new WaitForSeconds(3); }
                }
            }
            else if (role == "izle")
            {
                // oyun süren masayı izle, izleyici görüntüsü gelsin, sonra izlemeyi bırakıp kalk
                float until = Time.time + 90; string code = null;
                while (Time.time < until && code == null)
                {
                    yield return new WaitForSeconds(2);
                    using var req = UnityWebRequest.Get(app.Io.Url + "/api/rooms"); yield return req.SendWebRequest();
                    var playing = (JObject.Parse(req.downloadHandler.text)["playing"] as JArray) ?? new JArray();
                    code = (string)playing.FirstOrDefault(r => (int?)r["hallTable"] == table)?["code"];
                }
                L(code == null ? "izlenecek masa bulunamadı" : "izleniyor: " + code);
                if (code != null)
                {
                    app.Watch(table, code); yield return new WaitForSeconds(9);
                    L($"izleyici görüntüsü: {(app.Okey.State != null)}, izliyor {app.Watching}");
                    app.LeaveTable(); yield return new WaitForSeconds(2);
                    L($"kalktı: masa {app.SeatedTable}, izliyor {app.Watching}");
                }
            }
            else
            {
                // salondaki masa listesinde arkadaşın masası görünene kadar bekle, sonra masaya yaklaşıp panelden boş koltuğa otur
                float until = Time.time + 60; bool sat = false;
                while (Time.time < until && !sat)
                {
                    yield return new WaitForSeconds(2);
                    using var req = UnityWebRequest.Get(app.Io.Url + "/api/rooms"); yield return req.SendWebRequest();
                    var rooms = JObject.Parse(req.downloadHandler.text);
                    var mine = ((JArray)rooms["waiting"]).FirstOrDefault(r => (int?)r["hallTable"] == table);
                    L(mine == null ? "masa listede yok" : $"masa listede: {(string)mine["code"]} oyuncu {(int)mine["players"]}");
                    if (mine == null) continue;
                    app.Me.WalkTo(app.Hall.Tables[table] + new Vector3(0, 0, -1.6f)); yield return new WaitForSeconds(5);
                    app.Hud.ShowTable(table); yield return new WaitForSeconds(4); // panel kendi listesini tazelesin (3 sn)
                    L("panel: " + app.Hud.DebugTableText());
                    sat = app.Hud.DebugPressSit();
                    L(sat ? "OTUR'a basıldı" : "panelde OTUR yok");
                }
                yield return new WaitForSeconds(25);
            }
            yield return new WaitForSeconds(6);
            L($"son durum: masada {app.SeatedTable}, oyun {(app.Okey.State != null)}, izleyici {app.Okey.Spectating}");
            File.WriteAllText(Path.Combine(dir, $"arkadas_{app.MyName}.txt"), log.ToString());
            if (DevShots.Arg("-kapat") != null) Application.Quit();
        }
        static int LastLobbyCount(App app) => app.Hud.LobbyCount;
    }
}
