// Uygulamanın akışı: sunucu (gömülü ya da çevrimiçi) → bağlantı → salon → karakter → salon ağı, kahveci, okey masası, arayüz.
using System.Collections;
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.AI;
using Alemdar.UI;

namespace Alemdar
{
    public class App : MonoBehaviour
    {
        public static App I;
        public Net.SocketIO Io { get; private set; }
        public World.Hall Hall { get; private set; }
        public Chars.PlayerMotor Me { get; private set; }
        public World.WorldNet Net { get; private set; }
        public World.Waiter Waiter { get; private set; }
        public Okey.OkeyTable Okey { get; private set; }
        public Hud Hud { get; private set; }
        public string MyName { get; private set; }
        public int SeatedTable = -1, SeatedDir = -1;
        string pendingToken;

        void Awake()
        {
            I = this;
            Application.targetFrameRate = -1; QualitySettings.vSyncCount = 1; // ekran tazelemesiyle eşit, takılmasız
            Ui.Init();
            if (DevShots.Arg("-cek") != null) gameObject.AddComponent<DevShots>();
        }

        IEnumerator Start()
        {
            var loading = Ui.Label(Ui.Canvas.transform, "Kıraathane hazırlanıyor…", 30, Ui.Muted, TextAnchor.MiddleCenter);
            Ui.Stretch(loading.rectTransform);
            var server = gameObject.AddComponent<Net.LocalServer>();
            string url = null;
            yield return server.Run(u => url = u);
            if (url == null) { loading.text = server.Error + "\nOyunu yeniden başlat."; yield break; }
            Io = gameObject.AddComponent<Net.SocketIO>(); Io.Connect(url);
            Io.On("gameError", d => Ui.Toast((string)d["message"]));
            Io.On("actionSuccess", d => Ui.Toast((string)d["message"]));
            Io.On("penalty", d => Ui.Toast((string)d["message"] ?? "Ceza!"));
            Io.On("autoDiscard", d => Ui.Toast((string)d["message"]));
            Io.On("joinedGame", OnJoined);
            Io.On("leftGame", _ => LeaveTable(false));
            Io.On("world:serve", OnServe);

            Hall = new GameObject("Kiraathane").AddComponent<World.Hall>(); Hall.Build();
            yield return null;
            BakeNavMesh();
            Destroy(loading.gameObject);

            MyName = DevShots.Arg("-ad") is { Length: > 1 } devName ? devName : PlayerPrefs.GetString("ad", "");
            if (MyName.Length < 2) { bool done = false; Hud.AskName(n => { MyName = n; PlayerPrefs.SetString("ad", n); done = true; }); while (!done) yield return null; }

            var meGo = new GameObject("Ben");
            var body = Chars.Person.Create(MyName, meGo.transform, false);
            Me = meGo.AddComponent<Chars.PlayerMotor>(); Me.Init(body, Camera.main, new Vector3(0, 0, 6.8f), 180);
            Me.OnClickWorld += OnClickWorld;
            Net = gameObject.AddComponent<World.WorldNet>(); Net.Init(Io, Me, MyName);
            Waiter = new GameObject("Kahveci").AddComponent<World.Waiter>(); Waiter.Init(Hall);
            Okey = gameObject.AddComponent<Okey.OkeyTable>(); Okey.Init(Io, Hall, Me);
            Net.Hidden = n => Okey.State != null && Okey.HasPlayer(n);
            Hud = gameObject.AddComponent<Hud>(); Hud.Build(this);
        }

        void BakeNavMesh()
        {
            var bounds = new Bounds(new Vector3(0, 1, 1), new Vector3(16, 4, 18));
            var sources = new List<NavMeshBuildSource>();
            NavMeshBuilder.CollectSources(bounds, ~(1 << 2), NavMeshCollectGeometry.PhysicsColliders, 0, new List<NavMeshBuildMarkup>(), sources);
            var s = NavMesh.GetSettingsByID(0); s.agentRadius = .22f; s.agentHeight = 1.75f; s.agentClimb = .2f; s.voxelSize = .05f; s.overrideVoxelSize = true;
            var data = NavMeshBuilder.BuildNavMeshData(s, sources, bounds, Vector3.zero, Quaternion.identity);
            NavMesh.AddNavMeshData(data);
        }

        void Update() { Ui.Tick(); if (Input.GetKeyDown(KeyCode.E) && Me && SeatedTable < 0) { int t = NearTable(); if (t >= 0) Hud.ShowTable(t); } }

        public int NearTable(float max = 1.8f)
        {
            int best = -1; float bd = max;
            for (int i = 0; i < Hall.Tables.Count; i++) { var d = Vector3.Distance(Flat(Me.transform.position), Hall.Tables[i]); if (d < bd) { bd = d; best = i; } }
            return best;
        }
        static Vector3 Flat(Vector3 v) => new(v.x, 0, v.z);

        void OnClickWorld(Vector3 p)
        {
            if (SeatedTable >= 0) return;
            for (int i = 0; i < Hall.Tables.Count; i++)
                if (Mathf.Abs(p.x - Hall.Tables[i].x) < .7f && Mathf.Abs(p.z - Hall.Tables[i].z) < .7f && p.y > .5f)
                {
                    int t = i; var dir = Flat(Me.transform.position) - Hall.Tables[t];
                    Me.WalkTo(Hall.Tables[t] + dir.normalized * (World.Hall.SeatDist + .55f), () => Hud.ShowTable(t));
                    return;
                }
            Me.WalkTo(p);
        }

        // ---------- masaya oturma / kalkma ----------
        public void SitAndJoin(int table, int dir, object joinData)
        {
            Hud.HideTable();
            var seat = Hall.Seat(table, dir); var front = Hall.Seat(table, dir, .55f);
            Me.WalkTo(front, () =>
            {
                Me.SitAt(seat, Quaternion.LookRotation(Hall.Tables[table] - seat));
                SeatedTable = table; SeatedDir = dir;
                if (joinData == null) return; // yancı/sohbet oturuşu
                pendingToken = System.Guid.NewGuid().ToString("N") + System.Guid.NewGuid().ToString("N").Substring(0, 8);
                var j = JObject.FromObject(joinData); j["playerName"] = MyName; j["token"] = pendingToken; j["penaltyMode"] = true;
                Io.Emit("joinGame", j);
            });
        }
        void OnJoined(JToken d)
        {
            PlayerPrefs.SetString("oturum", (string)d["code"] + "|" + pendingToken);
            Okey.Spectating = false; Okey.Attach(SeatedTable, SeatedDir);
            Me.InputLocked = true; Hud.ShowGame(true);
        }
        public void Watch(int table, string code)
        {
            Hud.HideTable();
            int k = 0; var stool = Hall.Stool(table, k);
            Me.WalkTo(stool + (stool - Hall.Tables[table]).normalized * .4f, () =>
            {
                Me.SitAt(stool, Quaternion.LookRotation(Hall.Tables[table] - stool)); SeatedTable = table; SeatedDir = -1;
                Okey.Spectating = true; Okey.Attach(table, 0); Io.Emit("watchGame", new { code });
                Hud.ShowGame(true);
            });
        }
        public void LeaveTable(bool tellServer = true)
        {
            if (tellServer && Okey.State != null) Io.Emit(Okey.Spectating ? "unwatchGame" : "leaveGame");
            Okey.Detach(); Hud.ShowGame(false);
            Me.InputLocked = false; Me.StandUp(); SeatedTable = -1; SeatedDir = -1;
        }

        // ---------- kahveci ----------
        public void Order(string item)
        {
            int t = SeatedTable >= 0 ? SeatedTable : NearTable(2.5f);
            if (t < 0) { Ui.Toast("Bir masaya otur ya da yaklaş, kahveci oraya getirsin."); return; }
            Io.Emit("world:order", new { item, table = t, seat = SeatedDir });
        }
        void OnServe(JToken d)
        {
            int table = (int)d["table"]; if (table < 0 || table >= Hall.Tables.Count) return;
            // ikram siparişi verenin önüne: koltuğu biliniyorsa oraya, yoksa masanın kahveciye yakın kenarına
            int seat = (int?)d["seat"] ?? -1;
            // ikram, siparişi verenin kendi köşe bardaklığına (sol köşesi) konur; koltuk bilinmiyorsa güney köşesi
            Vector3 spot = Hall.Corner(table, seat >= 0 ? seat : 0);
            Waiter.Serve((string)d["item"], table, spot);
            if ((string)d["name"] == MyName) Ui.Toast("Kahveci siparişini getiriyor.");
        }
    }
}
