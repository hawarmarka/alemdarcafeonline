// Okey masası (Unity): sunucunun 'gameState' görüntüsünü salondaki masaya çizer, ıstaka/sürükle-bırak/hamle isteklerini yollar.
// Kurallar sunucuda; burada yalnızca gösterim ve istek. Koltuk eşlemesi: sunucu koltuğu s ↔ sandalye yönü (4 - s) % 4.
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace Alemdar.Okey
{
    public class OkeyTable : MonoBehaviour
    {
        public const int Slots = 32, Row = 16;
        public static int DirOfSeat(int seat) => (4 - seat % 4) % 4;
        public JObject State { get; private set; }
        public int TableIndex { get; private set; }
        public bool Spectating;
        public int RackCount => slots.Count(s => s != null); // denetim: ıstakada duran taş sayısı
        // denetim: bütün rakiplere aynı üst gövde hareketini yaptır
        public void DebugGesture(int id) { foreach (var p in people.Values) if (p) p.Gesture(id, 5f); }
        // denetim: oturan her rakibin gövdesi (omuz kemikleri) ile masa ortası arasındaki açı; 0° masaya bakıyor, 180° sırtı dönük
        public string FacingReport() => string.Join(", ", people.Select(kv =>
        {
            var p = kv.Value; var to = Vector3.ProjectOnPlane(hall.Tables[TableIndex] - p.transform.position, Vector3.up);
            return $"{p.Display} {Vector3.Angle(Vector3.ProjectOnPlane(p.BoneFront, Vector3.up), to):0}°";
        }));
        public System.Action OnState;

        Net.SocketIO io; World.Hall hall; Chars.PlayerMotor me;
        Transform root, rackRoot, deckRoot, groupsRoot, pilesRoot, oppRoot;
        readonly string[] slots = new string[Slots];
        readonly Dictionary<string, TileView> rack = new();
        readonly Dictionary<int, Chars.Person> people = new(); // sandalye yönü → oturan (ben hariç)
        TileView indicator; string roundId; int myDir;
        TileView dragging; Vector3 dragOffset; float lastClick; string lastClickId;
        readonly Plane rackPlane = new();
        ClickZone deckZone, leftZone, rightZone;

        public void Init(Net.SocketIO socket, World.Hall h, Chars.PlayerMotor motor)
        {
            io = socket; hall = h; me = motor;
            io.On("gameState", d => Apply((JObject)d));
        }

        public void Attach(int table, int myChairDir)
        {
            if (root) hall.SetDecor(TableIndex, true);
            TableIndex = table; myDir = myChairDir;
            hall.SetDecor(table, false); // masadaki dekor oyun takımı canlı oyunun altında kalmasın
            if (root) Destroy(root.gameObject);
            root = new GameObject("OkeyMasasi").transform; root.position = hall.Tables[table];
            rackRoot = Child("istaka"); deckRoot = Child("deste"); groupsRoot = Child("gruplar"); pilesRoot = Child("atiklar"); oppRoot = Child("rakipler");
            for (int i = 0; i < Slots; i++) slots[i] = null; rack.Clear(); roundId = null;
            // kendi ıstakam: masanın benim kenarında, yüzü bana dönük
            rackRoot.SetLocalPositionAndRotation(World.Hall.SeatRot(myDir) * new Vector3(0, World.Props.TableTop + .004f, RackZ), World.Hall.SeatRot(myDir));
            BuildRack(rackRoot);
            indicator = TileView.Make(deckRoot); indicator.gameObject.SetActive(false);
            deckZone = Zone(deckRoot, "deck", new Vector3(-.06f, .03f, 0), new Vector3(.2f, .06f, .14f));
            people.Clear();
        }
        // Gerçek ıstaka: taban + önde alt raf + bir basamak yukarıda arka raf. Yerel +z oyuncuya doğru.
        // Istaka masanın kenarına, oyuncuya yakın; kısa: dört ıstaka köşelerde birbirine değmez, köşeler atık yeri.
        public static readonly float RackZ = World.Props.TableSize / 2 - .07f;
        public static readonly Vector3 PileLocal = new(-.39f, 0, .39f); // sahibinin sağ köşesi (ıstakaların dışında)
        public const float RackLen = Row * (TileView.W + .0015f) + .035f, LowY = .014f, LowZ = .032f, HighY = .05f, HighZ = -.034f, Lean = -20f; // taşlar oturan oyuncunun gözüne dönük
        public static void BuildRack(Transform r)
        {
            var w = World.Props.WoodDark;
            World.Props.Box(r, new Vector3(RackLen, .014f, .13f), w, new Vector3(0, .007f, 0));               // taban
            World.Props.Box(r, new Vector3(RackLen, .01f, .008f), w, new Vector3(0, .019f, .062f));            // ön kenar (alt sıra dayanır)
            World.Props.Box(r, new Vector3(RackLen, .036f, .05f), w, new Vector3(0, .032f, -.04f));            // arka basamak gövdesi
            World.Props.Box(r, new Vector3(RackLen, .008f, .006f), w, new Vector3(0, .054f, -.013f));          // üst sıra kenarı
            World.Props.Box(r, new Vector3(RackLen, .03f, .01f), w, new Vector3(0, .063f, -.062f)).transform.localRotation = Quaternion.Euler(Lean, 0, 0); // sırt: taş üstünü geçmez, masayı kapatmaz
            foreach (float x in new[] { -RackLen / 2, RackLen / 2 }) World.Props.Box(r, new Vector3(.012f, .06f, .13f), w, new Vector3(x, .03f, 0)); // uçlar
        }
        // row 0 üst (arka raf), row 1 alt (ön raf); col 0..15 soldan sağa (oyuncunun gözünden)
        public static Vector3 RackSpot(int row, float col, int count = Row)
        {
            float x = -(col - (count - 1) / 2f) * (TileView.W + .0015f); // yerel +z oyuncuya bakar → sol, -x tarafı değil +x
            return row == 0 ? new Vector3(x, HighY + TileView.H / 2 * .985f, HighZ + .006f) : new Vector3(x, LowY + TileView.H / 2 * .985f, LowZ);
        }
        Transform Child(string n) { var t = new GameObject(n).transform; t.SetParent(root, false); return t; }
        static ClickZone Zone(Transform p, string kind, Vector3 pos, Vector3 size)
        {
            var g = new GameObject("alan_" + kind); g.transform.SetParent(p, false); g.transform.localPosition = pos;
            var c = g.AddComponent<BoxCollider>(); c.size = size; c.isTrigger = false;
            var z = g.AddComponent<ClickZone>(); z.Kind = kind; return z;
        }

        public void Detach()
        {
            if (root) { Destroy(root.gameObject); hall.SetDecor(TableIndex, true); }
            foreach (var p in people.Values) if (p) Destroy(p.transform.parent.gameObject);
            people.Clear(); State = null; rack.Clear();
        }

        // ---------- durum ----------
        int MyIndex => (int?)State?["playerIndex"] ?? 0;
        JToken Okey => State?["okey"];
        public bool MyTurn => State != null && !Spectating && (int)State["currentPlayer"] == MyIndex;
        public JArray Players => State?["players"] as JArray;
        public int DirOf(int playerIndex)
        {
            var p = Players?[playerIndex]; int seat = (int?)p?["seat"] ?? playerIndex;
            return DirOfSeat(seat);
        }
        public bool HasPlayer(string name) => Players != null && Players.Any(p => (string)p["name"] == name);

        void Apply(JObject s)
        {
            if (!root) return;
            bool newRound = (string)s["roundId"] != roundId;
            var before = State;
            State = s;
            if (newRound) { roundId = (string)s["roundId"]; for (int i = 0; i < Slots; i++) slots[i] = null; LoadRack(); }
            if (newRound) { sig.Clear(); dealt = false; }
            var prevPiles = pileCounts.ToArray();
            SyncRack(); dealt = true;
            DrawPeople();
            // her bölüm yalnızca girdisi değişince yeniden kurulur (her hamlede yüzlerce nesne yaratılmasın)
            if (Changed("deste", $"{s["pileCount"]}|{s["indicator"]?["id"]}")) DrawDeck();
            if (Changed("atik", string.Join(";", ((JArray)s["discards"] ?? new JArray()).Select(p => p.Count() + ":" + (string)p.LastOrDefault()?["id"])))) { DrawPiles(); AnimateDiscards(prevPiles); }
            if (Changed("grup", s["openedGroups"]?.ToString(Newtonsoft.Json.Formatting.None) + s["extraPairs"]?.ToString(Newtonsoft.Json.Formatting.None))) DrawGroups();
            if (Changed("rakip", string.Join(",", Players.Select(p => (string)p["tileCount"])))) DrawOpponentRacks();
            if (!newRound) Hands(before, s);
            turnDeadline = Time.time + ((float?)s["turnRemainingMs"] ?? 0) / 1000f;
            if (newRound && (bool?)s["assisted"] == true && !Spectating) Invoke(nameof(AutoArrange), .4f);
            OnState?.Invoke();
        }
        bool dealt;
        // Çekilen taşın geldiği yer: yerden alındıysa soldaki yığın, değilse deste.
        Vector3 DrawSource()
        {
            var fromLeft = State["drawnFromDiscardTileId"];
            if (fromLeft != null && fromLeft.Type != JTokenType.Null)
                return root.TransformPoint(World.Hall.SeatRot(DirOf((MyIndex + 3) % 4)) * PileLocal + Vector3.up * (World.Props.TableTop + .02f));
            return root.TransformPoint(new Vector3(-.09f, World.Props.TableTop + .06f, 0));
        }
        readonly Dictionary<string, string> sig = new();
        bool Changed(string key, string value) { if (sig.TryGetValue(key, out var v) && v == value) return false; sig[key] = value; return true; }
        void AutoArrange() => Arrange("series", false);
        public float TurnSecondsLeft => Mathf.Max(0, turnDeadline - Time.time);
        float turnDeadline;
        readonly List<int> pileCounts = new();

        void SyncRack()
        {
            var tiles = (State["tiles"] as JArray) ?? new JArray();
            var ids = new HashSet<string>(tiles.Select(t => (string)t["id"]));
            for (int i = 0; i < Slots; i++) if (slots[i] != null && !ids.Contains(slots[i])) slots[i] = null;
            foreach (var t in tiles)
            {
                string id = (string)t["id"];
                if (System.Array.IndexOf(slots, id) < 0) { int free = FreeSlot(); if (free >= 0) slots[free] = id; }
            }
            foreach (var id in rack.Keys.ToList()) if (!ids.Contains(id)) { Destroy(rack[id].gameObject); rack.Remove(id); }
            foreach (var t in tiles)
            {
                string id = (string)t["id"];
                if (!rack.TryGetValue(id, out var v)) { v = TileView.Make(rackRoot); rack[id] = v; }
                v.Set(t, TileView.IsOkey(t, Okey));
            }
            LayoutRack(); SaveRack();
        }
        int FreeSlot() { for (int i = 0; i < Slots; i++) if (slots[i] == null) return i; return -1; }
        static Vector3 SlotPos(int i) => RackSpot(i / Row, i % Row);
        void LayoutRack()
        {
            for (int i = 0; i < Slots; i++)
            {
                if (slots[i] == null || !rack.TryGetValue(slots[i], out var v) || v == dragging) continue;
                bool fresh = v.Slot < 0;
                v.Slot = i; v.Home = SlotPos(i); v.HomeRot = Quaternion.Euler(Lean, 0, 0);
                if (!fresh) continue;
                // el başındaki dağıtım yerinde belirir; oyun içinde çekilen taş desteden/yerden gelir
                if (dealt && State != null) { var src = DrawSource(); v.transform.SetLocalPositionAndRotation(rackRoot.InverseTransformPoint(src), Quaternion.Euler(-80, 0, 0)); }
                else v.transform.SetLocalPositionAndRotation(v.Home, v.HomeRot);
            }
        }
        string RackKey => "istaka_" + (string)State?["roomCode"] + "_" + roundId;
        void SaveRack() { PlayerPrefs.SetString(RackKey, string.Join(",", slots.Select(s => s ?? ""))); }
        void LoadRack()
        {
            var raw = PlayerPrefs.GetString(RackKey, ""); if (raw.Length == 0) return;
            var parts = raw.Split(','); for (int i = 0; i < Slots && i < parts.Length; i++) slots[i] = parts[i].Length > 0 ? parts[i] : null;
        }

        // Istaka gruplarını (boşlukla ayrılmış ardışık taşlar) seri açmak için id listesi olarak verir.
        public List<List<string>> RackGroups(int min = 3)
        {
            var groups = new List<List<string>>();
            for (int r = 0; r < 2; r++)
            {
                var cur = new List<string>();
                for (int c = 0; c <= Row; c++)
                {
                    string id = c < Row ? slots[r * Row + c] : null;
                    if (id != null) cur.Add(id); else { if (cur.Count >= min) groups.Add(cur); cur = new List<string>(); }
                }
            }
            return groups;
        }
        // Sunucunun önerdiği dizilim: gruplar arasında bir boşluk, kalanlar sona.
        public void ApplyArrangement(JToken a)
        {
            for (int i = 0; i < Slots; i++) slots[i] = null;
            int pos = 0;
            void Put(string id) { if (pos < Slots) slots[pos++] = id; }
            foreach (var g in (JArray)a["groups"])
            {
                var ids = g.Select(x => (string)x).ToList();
                if (pos % Row + ids.Count > Row) pos = (pos / Row + 1) * Row; // grup satır sonuna sığmazsa alt satıra
                foreach (var id in ids) Put(id);
                if (pos % Row != 0) pos++;
            }
            foreach (var id in (JArray)a["rest"]) Put((string)id);
            LayoutRack(); SaveRack();
        }

        // ---------- çizim ----------
        void DrawPeople()
        {
            var want = new Dictionary<int, string>();
            for (int i = 0; i < Players.Count; i++) { int d = DirOf(i); if (Spectating || i != MyIndex) want[d] = (string)Players[i]["name"]; }
            foreach (var d in people.Keys.ToList()) if (!want.TryGetValue(d, out var n) || people[d].Display != n) { Destroy(people[d].transform.parent.gameObject); people.Remove(d); }
            foreach (var kv in want)
            {
                if (people.ContainsKey(kv.Key)) continue;
                var holder = new GameObject("Oturan_" + kv.Value).transform;
                var seat = hall.Seat(TableIndex, kv.Key);
                holder.SetPositionAndRotation(seat, Quaternion.LookRotation(hall.Tables[TableIndex] - seat));
                var p = Chars.Person.Create(kv.Value, holder); p.SetSit(true); people[kv.Key] = p;
                int dir = kv.Key; // sırası gelen taşla uğraşır; diğerleri çay içer, sohbet eder
                p.gameObject.AddComponent<Chars.SeatedChatter>().Busy = () => State == null || DirOf((int)State["currentPlayer"]) == dir;
            }
            int cur = (int)State["currentPlayer"];
            for (int i = 0; i < Players.Count; i++)
                if (people.TryGetValue(DirOf(i), out var pp))
                {
                    var pl = Players[i]; bool on = i == cur;
                    string opened = (string)pl["openType"] == "pairs" ? " · çift açtı" : pl["openType"]?.Type == JTokenType.String ? " · açtı" : "";
                    pp.SetTag($"{(string)pl["name"]}  ·  {(int?)pl["tileCount"] ?? 0}{opened}", on ? new Color(1f, .8f, .35f) : Color.white);
                }
            foreach (var kv in people)
            {
                bool active = DirOf(cur) == kv.Key;
                kv.Value.LookAt = active ? hall.Tables[TableIndex] + Vector3.up * .8f : (people.TryGetValue(DirOf(cur), out var a) ? a.Head.position : me.Cam.transform.position);
            }
        }

        void DrawDeck()
        {
            int count = (int?)State["pileCount"] ?? 0, stacks = Mathf.CeilToInt(count / 4f);
            foreach (Transform c in deckRoot) if (c.GetComponent<TileView>() && c != indicator.transform) Destroy(c.gameObject);
            for (int s = 0; s < stacks; s++) for (int k = 0; k < Mathf.Min(4, count - s * 4); k++)
            {
                var t = TileView.Make(deckRoot); t.Set(null, false); Destroy(t.GetComponent<Collider>());
                t.transform.localPosition = new Vector3(-.14f + (s % 4) * (TileView.W + .003f), World.Props.TableTop + TileView.D / 2 + k * TileView.D, -.04f + (s / 4) * (TileView.H + .004f));
                t.transform.localRotation = Quaternion.Euler(90, 0, 0);
            }
            deckZone.transform.localPosition = new Vector3(-.09f, World.Props.TableTop + .03f, .0f);
            var ind = State["indicator"];
            indicator.gameObject.SetActive(ind != null && ind.Type != JTokenType.Null);
            if (indicator.gameObject.activeSelf)
            {
                indicator.Set(ind, false); Destroy(indicator.GetComponent<Collider>());
                indicator.transform.localPosition = new Vector3(.1f, World.Props.TableTop + TileView.D / 2, 0);
                indicator.transform.localRotation = World.Hall.SeatRot(myDir) * Quaternion.Euler(-90, 0, 0); // yüzü yukarı, bana okunur
            }
        }

        // Her oyuncunun attığı taşlar sağ ön köşesinde (sağ = sandalyesinden bakınca). Soldaki yığın benim aldığım yer.
        void DrawPiles()
        {
            foreach (Transform c in pilesRoot) Destroy(c.gameObject);
            var discards = State["discards"] as JArray; if (discards == null) return;
            int prev = (MyIndex + 3) % 4;
            for (int i = 0; i < discards.Count; i++)
            {
                var pile = (JArray)discards[i]; int d = DirOf(i);
                var spot = new GameObject("atik" + i).transform; spot.SetParent(pilesRoot, false);
                spot.SetLocalPositionAndRotation(World.Hall.SeatRot(d) * PileLocal + Vector3.up * World.Props.TableTop, World.Hall.SeatRot(myDir)); // yeri sahibinin sağında, yönü bana okunur
                topTiles[i] = null;
                int n = pile.Count, from = Mathf.Max(0, n - 3);
                for (int k = from; k < n; k++)
                {
                    var t = TileView.Make(spot); t.Set(pile[k], TileView.IsOkey(pile[k], Okey)); Destroy(t.GetComponent<Collider>());
                    // Kural: atılan taş bir öncekinin tam üstüne konur, öncekiler görünmez (yalnızca yığın kalınlığı)
                    t.transform.localPosition = new Vector3(0, TileView.D / 2 + (k - from) * TileView.D, 0);
                    t.transform.localRotation = Quaternion.Euler(-90, 0, 0);
                    if (k == n - 1) topTiles[i] = t.transform;
                }
                while (pileCounts.Count <= i) pileCounts.Add(0);
                pileCounts[i] = n;
                if (!Spectating && i == prev) leftZone = Zone(spot, "left", new Vector3(0, .03f, 0), new Vector3(.12f, .08f, .12f));
                if (!Spectating && i == MyIndex) rightZone = Zone(spot, "right", new Vector3(0, .03f, 0), new Vector3(.16f, .1f, .16f));
            }
        }

        // ---------- eller: rakipler taşı eliyle çeker, atar, masaya dizer ----------
        // İki durum arasındaki farktan kimin ne yaptığı çıkarılır (bot çekip atmayı tek yayında yapabilir).
        Vector3 PileWorld(int i) => root.TransformPoint(World.Hall.SeatRot(DirOf(i)) * PileLocal + Vector3.up * (World.Props.TableTop + .01f));
        Vector3 DeckWorld => root.TransformPoint(new Vector3(-.09f, World.Props.TableTop + .03f, 0));
        Vector3 GroupWorld(int i, int k) => root.TransformPoint(World.Hall.SeatRot(DirOf(i)) * new Vector3(ZoneHalf - .05f - (k % 4) * .1f, World.Props.TableTop + .01f, ZoneNear - (k / 4) * GRow));
        void Hands(JObject a, JObject b)
        {
            if (a == null || Players == null) return;
            var da = a["discards"] as JArray; var db = b["discards"] as JArray; if (da == null || db == null) return;
            int actor = (int)a["currentPlayer"];
            Chars.Person P(int i) => (!Spectating && i == MyIndex) ? null : people.TryGetValue(DirOf(i), out var p) ? p : null;
            // çekme: deste azaldı ya da soldaki yığın azaldı
            int left = (actor + 3) % 4;
            if (P(actor) is { } drawer)
            {
                if (((JArray)db[left]).Count < ((JArray)da[left]).Count) drawer.Reach(PileWorld(left));
                else if ((int?)b["pileCount"] < (int?)a["pileCount"]) drawer.Reach(DeckWorld);
            }
            // atma: yığını büyüyen oyuncu
            for (int i = 0; i < db.Count && i < da.Count; i++)
                if (((JArray)db[i]).Count > ((JArray)da[i]).Count && P(i) is { } thrower) thrower.Reach(PileWorld(i), .1f, .65f);
            // seri/çift açma: her yeni grup için ayrı uzanış (per per dizer)
            var ga = a["openedGroups"] as JArray; var gb = b["openedGroups"] as JArray;
            for (int i = 0; gb != null && ga != null && i < gb.Count && i < ga.Count; i++)
            {
                int from = ((JArray)ga[i]).Count, to = ((JArray)gb[i]).Count;
                if (to > from && P(i) is { } opener) for (int k = from; k < to; k++) opener.Reach(GroupWorld(i, k), .12f, .55f);
            }
        }

        // ---------- taş uçuşları ----------
        readonly Transform[] topTiles = new Transform[4];
        readonly Dictionary<string, Vector3> rackWorld = new(); // ıstakadaki taşların son dünya konumu (atınca oradan uçar)
        void AnimateDiscards(int[] prev)
        {
            for (int i = 0; i < topTiles.Length && i < pileCounts.Count; i++)
            {
                if (!topTiles[i] || i >= prev.Length || pileCounts[i] != prev[i] + 1) continue;
                var top = topTiles[i]; string id = top.GetComponent<TileView>().Id;
                Vector3 from = !Spectating && i == MyIndex && id != null && rackWorld.TryGetValue(id, out var w) ? w
                    : root.TransformPoint(World.Hall.SeatRot(DirOf(i)) * new Vector3(0, World.Props.TableTop + .06f, RackZ));
                StartCoroutine(Fly(top, from, .3f));
            }
        }
        System.Collections.IEnumerator Fly(Transform t, Vector3 fromWorld, float dur)
        {
            if (!t) yield break;
            Vector3 toLocal = t.localPosition; var rotTo = t.localRotation;
            Vector3 fromLocal = t.parent.InverseTransformPoint(fromWorld);
            for (float k = 0; k < 1 && t; k += Time.deltaTime / dur)
            {
                float e = 1 - (1 - k) * (1 - k);
                t.localPosition = Vector3.Lerp(fromLocal, toLocal, e) + Vector3.up * Mathf.Sin(k * Mathf.PI) * .05f;
                yield return null;
            }
            if (t) { t.localPosition = toLocal; t.localRotation = rotTo; }
        }

        void DrawGroups()
        {
            foreach (Transform c in groupsRoot) Destroy(c.gameObject);
            var opened = State["openedGroups"] as JArray; if (opened == null) return;
            var extra = State["extraPairs"] as JArray;
            groupsRoot.localRotation = Quaternion.identity;
            for (int owner = 0; owner < opened.Count; owner++)
            {
                bool pairs = (string)Players[owner]["openType"] == "pairs";
                var all = ((JArray)opened[owner]).Select((g, gi) => (g: (JArray)g, gi, pair: pairs)).ToList();
                if (extra?[owner] is JArray ex) all.AddRange(ex.Select((g, gi) => ((JArray)g, -1 - gi, true)));
                // Herkes kendi önüne, kendine dönük dizer (gerçek masadaki gibi). Gruplar yazı gibi akar:
                // aynı satırda boşlukla yan yana, satır dolunca bir alt satıra (ıstakadan ortaya doğru). Bölgeler kesişmez.
                var zone = new GameObject("acilan" + owner).transform; zone.SetParent(groupsRoot, false);
                zone.localRotation = World.Hall.SeatRot(DirOf(owner)); // yerel +z sahibine doğru, +x sahibinin solu
                int row = 0; float x = ZoneHalf;
                foreach (var (g, gi, pair) in all)
                {
                    for (int start = 0; start < g.Count;)
                    {
                        int fit = Mathf.FloorToInt((x + ZoneHalf + .0005f) / GStep);
                        if (fit < Mathf.Min(3, g.Count - start)) { row++; x = ZoneHalf; continue; } // bu satıra sığmıyor → alt satır
                        int n = Mathf.Min(fit, g.Count - start);
                        var seg = new GameObject("grup").transform; seg.SetParent(zone, false);
                        seg.localPosition = new Vector3(x - n * GStep / 2, World.Props.TableTop, ZoneNear - row * GRow);
                        for (int k = 0; k < n; k++)
                        {
                            var t = TileView.Make(seg); t.Set(g[start + k], TileView.IsOkey(g[start + k], Okey)); Destroy(t.GetComponent<Collider>());
                            t.transform.localScale = Vector3.one * GScale;
                            t.transform.localPosition = new Vector3(n * GStep / 2 - (k + .5f) * GStep, TileView.D * GScale / 2, 0); // sahibinin solundan sağına
                            t.transform.localRotation = Quaternion.Euler(-90, 0, 0); // yüzü yukarı, sahibine okunur
                        }
                        if (gi >= 0 && !pair) { var c = seg.gameObject.AddComponent<BoxCollider>(); c.size = new Vector3(n * GStep + .02f, .03f, GRow); c.center = new Vector3(0, .015f, 0); var gd = seg.gameObject.AddComponent<GroupDrop>(); gd.Owner = owner; gd.Index = gi; }
                        x -= n * GStep + GGap; start += n;
                    }
                }
            }
        }
        // Açılan taşlar ıstakadan biraz küçük; bölge: ıstakanın önünde x ±ZoneHalf, ilk satır ZoneNear, satırlar ortaya doğru.
        // Orta (|x|,|z| < ~.19) ve köşeler deste, gösterge ve atıklara ayrılır.
        const float GScale = .8f, GStep = TileView.W * GScale + .001f, GRow = TileView.H * GScale + .007f, GGap = .016f, ZoneHalf = .205f;
        // İlk satır ıstakadan biraz ileride: oturan oyuncunun gözünden ıstakadaki taşların ve sırtın arkasında kalmasın
        // (kamera ~1,45 m, sandalye arkası: ıstakaya ~8 cm'den yakın satır görünmüyordu).
        static float ZoneNear => RackZ - .065f - TileView.H * GScale / 2 - .095f;
        (float left, float right, float top) Zone(int owner) => (ZoneHalf, -ZoneHalf, ZoneNear);

        void DrawOpponentRacks()
        {
            foreach (Transform c in oppRoot) Destroy(c.gameObject);
            for (int i = 0; i < Players.Count; i++)
            {
                if (!Spectating && i == MyIndex) continue;
                int d = DirOf(i), n = Mathf.Min(26, (int?)Players[i]["tileCount"] ?? 0);
                var r = new GameObject("raf").transform; r.SetParent(oppRoot, false);
                r.SetLocalPositionAndRotation(World.Hall.SeatRot(d) * new Vector3(0, World.Props.TableTop + .004f, RackZ), World.Hall.SeatRot(d));
                BuildRack(r);
                for (int k = 0; k < n; k++)
                {
                    int row = k < 13 ? 0 : 1, c = row == 0 ? k : k - 13, cnt = row == 0 ? Mathf.Min(n, 13) : n - 13;
                    var t = TileView.Make(r); t.Set(null, false); Destroy(t.GetComponent<Collider>());
                    t.transform.SetLocalPositionAndRotation(RackSpot(row, c, cnt), Quaternion.Euler(Lean, 0, 0));
                }
            }
        }

        // ---------- giriş ----------
        void Update()
        {
            if (!root || State == null) return;
            // ıstaka taşları yerine yumuşak oturur
            // üzerine gelinen taş hafifçe kalkar (seçilebilir olduğu belli olsun)
            TileView hover = null;
            if (!dragging && !Spectating && Physics.Raycast(me.Cam.ScreenPointToRay(Input.mousePosition), out var hh, 5f)) hh.collider.TryGetComponent(out hover);
            float k = 1 - Mathf.Exp(-Time.deltaTime * 16);
            foreach (var v in rack.Values) if (v != dragging)
            {
                var home = v.Home + (v == hover && MyTurn ? new Vector3(0, .004f, 0) : Vector3.zero); // yalnızca sırandayken, az kalkar
                v.transform.localPosition = Vector3.Lerp(v.transform.localPosition, home, k);
                v.transform.localRotation = Quaternion.Slerp(v.transform.localRotation, v.HomeRot, k);
                if (v.Id != null) rackWorld[v.Id] = v.transform.position;
            }
            if (Spectating || UI.Ui.PointerOverUi && !dragging) return;
            var cam = me.Cam; var ray = cam.ScreenPointToRay(Input.mousePosition);
            if (Input.GetMouseButtonDown(0) && Physics.Raycast(ray, out var hit, 5f))
            {
                var tv = hit.collider.GetComponent<TileView>();
                if (tv && rack.ContainsKey(tv.Id ?? ""))
                {
                    if (lastClickId == tv.Id && Time.time - lastClick < .32f) { Discard(tv.Id); lastClickId = null; return; }
                    lastClickId = tv.Id; lastClick = Time.time;
                    dragging = tv; dragOffset = Vector3.zero;
                }
                else if (hit.collider.TryGetComponent<ClickZone>(out var z))
                {
                    if (z.Kind == "deck") Move("drawTile", new { fromDiscard = false });
                    else if (z.Kind == "left") Move("drawTile", new { fromDiscard = true });
                }
            }
            if (dragging)
            {
                // ıstaka düzleminde sürükle (biraz yukarıda, taş öne gelsin)
                var plane = new Plane(rackRoot.up, rackRoot.position + rackRoot.up * .04f);
                if (plane.Raycast(ray, out float enter))
                {
                    var p = rackRoot.InverseTransformPoint(ray.GetPoint(enter));
                    dragging.transform.localPosition = new Vector3(p.x, .07f, p.z);
                    dragging.transform.localRotation = Quaternion.Euler(-30, 0, 0);
                }
                if (Input.GetMouseButtonUp(0)) Drop(ray);
            }
        }

        void Drop(Ray ray)
        {
            var tv = dragging; dragging = null;
            var hits = Physics.RaycastAll(ray, 5f);
            foreach (var h in hits.OrderBy(h => h.distance))
            {
                if (h.collider.TryGetComponent<ClickZone>(out var z) && z.Kind == "right") { Discard(tv.Id); return; }
                if (h.collider.TryGetComponent<GroupDrop>(out var g)) { Move("addToGroup", new { tileId = tv.Id, targetPlayerIndex = g.Owner, targetGroupIndex = g.Index }); return; }
            }
            // en yakın yuva; doluysa yer değiştir
            var lp = tv.transform.localPosition; int best = 0; float bd = float.MaxValue;
            for (int i = 0; i < Slots; i++) { float d = (new Vector2(SlotPos(i).x, SlotPos(i).z) - new Vector2(lp.x, lp.z)).sqrMagnitude; if (d < bd) { bd = d; best = i; } }
            int from = tv.Slot;
            if (from >= 0 && best != from) { (slots[from], slots[best]) = (slots[best], slots[from]); }
            LayoutRack(); SaveRack();
        }

        public void Discard(string id) => Move("discardTile", new { tileId = id });
        float lastMove;
        public void Move(string ev, object data = null)
        {
            if (Spectating) return;
            if (Time.time - lastMove < .25f) return; lastMove = Time.time;
            if (ev != "newRound" && !MyTurn) { UI.Ui.Toast("Sıranın gelmesini bekle."); return; }
            io.Emit(ev, data);
        }
        public void Arrange(string mode, bool tell = true) => io.Emit("okey:arrange", new { mode }, a => { if (a["error"] != null) { if (tell) UI.Ui.Toast((string)a["error"]); } else { ApplyArrangement(a); if (tell) UI.Ui.Toast(mode == "pairs" ? $"{(int)a["score"]} çift dizildi." : $"Dizildi: {(int)a["score"]} puan."); } });
// Seri açma: ıstakadaki gruplar önce cezasız kontrol edilir; yalnızca geçerli gruplar ve yeterli puan varsa açılır.
        // (Kalan taşlar yan yana durunca "2-6-7" gibi geçersiz üçlü de grup sayılıyordu → 101 ceza.)
        public void OpenSeries()
        {
            if (!MyTurn) { UI.Ui.Toast("Sıranın gelmesini bekle."); return; }
            var groups = RackGroups();
            if (groups.Count == 0) { UI.Ui.Toast("Istakada en az 3 taşlık bir grup diz (gruplar arası bir boşluk)."); return; }
            io.Emit("okey:check", new { groups }, r =>
            {
                if (r["error"] != null) { UI.Ui.Toast((string)r["error"]); return; }
                var valid = groups.Where((g, i) => (bool)r["valid"][i]).ToList();
                if (valid.Count == 0) { UI.Ui.Toast("Istakada geçerli seri veya per yok."); return; }
                bool opened = (bool)r["opened"]; int score = (int)r["score"], need = (int)r["need"];
                if (!opened && score < need) { UI.Ui.Toast($"Istakadaki seri/perler {score} puan; açmak için {need} gerekir."); return; }
                lastMove = 0; Move("openHand", new { groups = valid });
            });
        }
        // Tekerlekle yakınlaştırma: 0 ıstakaya yakın, 1 bütün masa. Varsayılan taşlar rahat okunsun.
        float zoom = .35f;
        public float Zoom { get => zoom; set => zoom = Mathf.Clamp01(value); }
        public Vector3 SeatCamPos => Spectating ? hall.Stool(TableIndex, 0) + (hall.Stool(TableIndex, 0) - hall.Tables[TableIndex]).normalized * .2f + Vector3.up * 1.6f
                                                : hall.Seat(TableIndex, myDir, Mathf.Lerp(.05f, .42f, zoom)) + Vector3.up * Mathf.Lerp(1.36f, 1.72f, zoom);
        public Vector3 TableCenter => hall.Tables[TableIndex] + Vector3.up * World.Props.TableTop;

        // Masadayken kamera kendi sandalyenden; kendi gövden gizlenir (görüşü kapatmasın).
        bool hiddenSelf;
        const float SalonFov = 55f; // Build.Setup'taki kamera açısı
        void LateUpdate()
        {
            bool on = root && me && me.InputLocked;
            if (hiddenSelf != on)
            {
                hiddenSelf = on; foreach (var r in me.Body.GetComponentsInChildren<Renderer>()) r.enabled = !on;
                if (!on) me.Cam.fieldOfView = SalonFov;
            }
            if (!on) return;
            if (!UI.Ui.PointerOverUi) zoom = Mathf.Clamp01(zoom - Input.mouseScrollDelta.y * .08f);
            var cam = me.Cam.transform;
            // masada daha geniş açı: yandaki ve karşıdaki oyuncuların başı da kadraja girsin
            me.Cam.fieldOfView = Mathf.Lerp(me.Cam.fieldOfView, Spectating ? SalonFov : Mathf.Lerp(58f, 64f, zoom), Time.deltaTime * 6);
            var toward = (TableCenter - SeatCamPos); toward.y = 0;
            var look = TableCenter - toward.normalized * Mathf.Lerp(.24f, .02f, zoom) // yakında ıstakaya, uzakta masanın ortasına bakar
                       + Vector3.up * Mathf.Lerp(.02f, .2f, zoom); // uzakta bakış biraz yukarı: rakiplerin yüzü görünsün
            cam.position = Vector3.Lerp(cam.position, SeatCamPos, Time.deltaTime * 6);
            cam.rotation = Quaternion.Slerp(cam.rotation, Quaternion.LookRotation(look - cam.position), Time.deltaTime * 6);
        }
    }
}
