// Salondaki Batak masası: sunucunun 'batak:state' görüntüsünü 3B masaya çizer, kartı tıklayınca 'batak:play' gönderir.
// Kural ve sıra sunucuda; burada yalnızca gösterim ve oynanabilir kartların vurgusu var.
// Koltuk → sandalye yönü okeydeki gibi (OkeyTable.DirOfSeat); sıradaki oyuncu sağda.
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json.Linq;
using PrimeTween;
using UnityEngine;

namespace Alemdar.Batak
{
    public class BatakTable : MonoBehaviour
    {
        public JObject State { get; private set; }
        public int TableIndex { get; private set; } = -1;
        public bool Spectating;
        public Vector3 Stool; // yancının taburesi
        public bool Active => root;
        public System.Action OnState;

        Net.SocketIO io; World.Hall hall; Chars.PlayerMotor me;
        Transform root, handRoot, trickRoot, oppRoot, lastRoot;
        int myDir;
        readonly Dictionary<int, Chars.Person> people = new();
        readonly Dictionary<string, CardView> hand = new();
        string trickSig = "", handSig = "", oppSig = "";
        float lastPlay;

        public void Init(Net.SocketIO socket, World.Hall h, Chars.PlayerMotor motor)
        {
            io = socket; hall = h; me = motor;
            io.On("batak:state", d => Apply((JObject)d));
        }

        public void Attach(int table, int chairDir)
        {
            Detach();
            TableIndex = table; myDir = chairDir < 0 ? 0 : chairDir;
            hall.SetDecor(table, false);
            root = new GameObject("BatakMasasi").transform; root.position = hall.Tables[table];
            handRoot = Child("el"); trickRoot = Child("yer"); oppRoot = Child("rakipler"); lastRoot = Child("son");
        }
        public void Detach()
        {
            if (root) { foreach (var tw in root.GetComponentsInChildren<Transform>()) Tween.StopAll(tw); Destroy(root.gameObject); hall.SetDecor(TableIndex, true); }
            root = null; fans.Clear(); // Destroy kare sonunda olur: bu karede LateUpdate eski masaya dokunmasın
            foreach (var p in people.Values) if (p) Destroy(p.transform.parent.gameObject);
            people.Clear(); hand.Clear(); State = null; trickSig = handSig = oppSig = ""; TableIndex = -1;
        }
        Transform Child(string n) { var t = new GameObject(n).transform; t.SetParent(root, false); return t; }

        // ---------- durum ----------
        public int Me => (int?)State?["me"] ?? -1;
        public JArray Players => State?["players"] as JArray;
        public string Phase => (string)State?["phase"] ?? "";
        public int Turn => (int?)State?["turn"] ?? -1;
        public bool MyTurn => State != null && !Spectating && Turn == Me && Me >= 0;
        public float TurnLeft => Mathf.Max(0, turnDeadline - Time.time);
        float turnDeadline;
        public int DirOf(int i) => Okey.OkeyTable.DirOfSeat((int?)Players?[i]?["seat"] ?? i);
        public bool HasPlayer(string name) => Players != null && Players.Any(p => (string)p["name"] == name);
        Quaternion R(int dir) => World.Hall.SeatRot(dir);
        float Top => World.Props.TableTop;

        void Apply(JObject s)
        {
            if (!root) return;
            State = s;
            turnDeadline = Time.time + ((float?)s["remainingMs"] ?? 0) / 1000f;
            DrawPeople();
            DrawOpponents();
            DrawTrick(); // önce ortadaki el: oynadığım kâğıt elimdeki yerinden uçsun (DrawHand onu siler)
            DrawHand();
            OnState?.Invoke();
        }

        // ---------- oturanlar (ben hariç; izlerken herkes) ----------
        void DrawPeople()
        {
            var want = new Dictionary<int, string>();
            for (int i = 0; i < Players.Count; i++) if (Spectating || i != Me) want[DirOf(i)] = (string)Players[i]["name"];
            foreach (var d in people.Keys.ToList()) if (!want.TryGetValue(d, out var n) || people[d].Display != n) { Destroy(people[d].transform.parent.gameObject); people.Remove(d); }
            foreach (var kv in want)
            {
                if (people.ContainsKey(kv.Key)) continue;
                var holder = new GameObject("Oturan_" + kv.Value).transform;
                var seat = hall.Seat(TableIndex, kv.Key);
                holder.SetPositionAndRotation(seat, Quaternion.LookRotation(hall.Tables[TableIndex] - seat));
                var p = Chars.Person.Create(kv.Value, holder); p.SetSit(true); people[kv.Key] = p;
                // el hareketi yok: iki eli kâğıtları tutuyor (Person.Hold)
            }
            for (int i = 0; i < Players.Count; i++)
                if (people.TryGetValue(DirOf(i), out var pp))
                {
                    var pl = Players[i]; bool on = i == Turn;
                    var bid = pl["bid"]; string b = bid == null || bid.Type == JTokenType.Null ? ((bool?)pl["passed"] == true ? " · pas" : "") : $" · söz {(int)bid}";
                    pp.SetTag($"{(string)pl["name"]}{b} · aldı {(int?)pl["tricks"] ?? 0}", on ? new Color(1f, .8f, .35f) : Color.white);
                    // sırası gelen elindeki kâğıtlara bakar; diğerleri sırası gelene (ya da bana)
                    pp.LookAt = on ? (fans.TryGetValue(DirOf(i), out var myFan) && myFan ? myFan.position : hall.Tables[TableIndex] + Vector3.up * .8f) : (Turn >= 0 && people.TryGetValue(DirOf(Turn), out var a) ? a.Head.position : me.Cam.transform.position);
                }
        }

        // ---------- benim elim: masanın kenarında, bana eğik yelpaze ----------
        static readonly Dictionary<string, int> SuitOrder = new() { ["S"] = 0, ["H"] = 1, ["C"] = 2, ["D"] = 3 }; // renkler sırayla karışık: siyah, kırmızı, siyah, kırmızı
        void DrawHand()
        {
            var cards = ((State["hand"] as JArray) ?? new JArray()).OrderBy(c => SuitOrder.TryGetValue((string)c["suit"], out var o) ? o : 9).ThenByDescending(c => (int)c["rank"]).ToList();
            var legal = new HashSet<string>(((State["legal"] as JArray) ?? new JArray()).Select(x => (string)x));
            string sig = string.Join(",", cards.Select(c => (string)c["id"])) + "|" + string.Join(",", legal) + "|" + MyTurn;
            if (sig == handSig) return; handSig = sig;
            var keep = new HashSet<string>(cards.Select(c => (string)c["id"]));
            foreach (var id in hand.Keys.ToList()) if (!keep.Contains(id)) { Destroy(hand[id].gameObject); hand.Remove(id); }
            int n = cards.Count; float spread = Mathf.Min(.034f, .46f / Mathf.Max(1, n));
            for (int k = 0; k < n; k++)
            {
                var c = cards[k]; string id = (string)c["id"];
                if (!hand.TryGetValue(id, out var v)) { v = CardView.Make(handRoot, c, true); hand[id] = v; v.transform.position = SlotWorld(k, n, spread, false, out _); }
                bool ok = legal.Contains(id);
                v.Home = SlotWorld(k, n, spread, MyTurn && ok, out var rot); v.HomeRot = rot;
                v.SetDim(MyTurn && !ok);
            }
        }
        // Benim kenarımda kartın yeri: soldan sağa (benim gözümden), hafif kavis; oynanabilirse biraz yukarıda.
        Vector3 SlotWorld(int k, int n, float spread, bool raised, out Quaternion rot)
        {
            float t = k - (n - 1) / 2f;
            var local = new Vector3(-t * spread, Top + .145f, World.Props.TableSize / 2 + .12f);
            rot = root.rotation * R(myDir) * Quaternion.Euler(66, 0, 0) * Quaternion.Euler(0, 180, 0) * Quaternion.Euler(0, t * .9f, 0); // dik, bana dönük; yelpaze açısı kâğıdın kendi düzleminde (yana yatırmak sırayı bozuyordu)
            // Sıra kâğıdın kendi ekseninde: yüz normali (rot*up) boyunca sağdaki hep 1,5 mm önde. Kavis ve kalkma kâğıdın düzleminde (rot*forward =
            // kâğıdın üstü); dünyada aşağı/yukarı taşımak eğik kâğıdı öne-arkaya da kaydırır ve sağ yarıda sırayı bozardı.
            return root.TransformPoint(R(myDir) * local) + rot * Vector3.up * (k * .0015f) + rot * Vector3.forward * ((raised ? .026f : 0) - t * t * .00045f);
        }

        // ---------- rakiplerin kapalı kartları: kendi önlerinde ayakta yelpaze; eşlide açılan el yüzü yukarı ----------
        void DrawOpponents()
        {
            var rev = State["revealed"];
            string sig = string.Join(",", Players.Select(p => (string)p["cards"])) + "|" + (rev?.Type == JTokenType.Object ? rev.ToString(Newtonsoft.Json.Formatting.None) : "");
            if (sig == oppSig) return; oppSig = sig;
            foreach (Transform c in oppRoot) Destroy(c.gameObject);
            fans.Clear();
            int revSeat = rev?.Type == JTokenType.Object ? (int)rev["seat"] : -1;
            for (int i = 0; i < Players.Count; i++)
            {
                if (i == Me) continue; // kendi elim (ya da yancıysam yanımdakinin eli) masanın kenarında açık durur
                int d = DirOf(i), n = (int?)Players[i]["cards"] ?? 0;
                if (i == revSeat)
                {
                    var open = ((JArray)rev["cards"]).ToList();
                    for (int k = 0; k < open.Count; k++)
                    {
                        var v = CardView.Make(oppRoot, open[k]);
                        float t = k - (open.Count - 1) / 2f;
                        v.transform.SetPositionAndRotation(root.TransformPoint(R(d) * new Vector3(t * .036f, Top + .001f + k * .0002f, World.Props.TableSize / 2 - .18f)),
                                                           root.rotation * R(myDir) * Quaternion.Euler(0, 180, 0)); // bana dönük okunur
                    }
                    continue;
                }
                if (!people.TryGetValue(d, out var holderP) || n == 0) continue;
                var fan = new GameObject("yelpaze").transform; fan.SetParent(oppRoot, true);
                fans[d] = fan; holderP.Hold = fan;
                for (int k = 0; k < n; k++)
                {
                    var v = CardView.Make(fan, null);
                    float a = (k - (n - 1) / 2f) * Mathf.Min(7f, 70f / n); // yelpaze açısı
                    var q = Quaternion.Euler(0, 0, -a);
                    v.transform.localRotation = q * Quaternion.Euler(90, 0, 0);                      // yüz tutana (+z), üstü yukarı
                    v.transform.localPosition = q * new Vector3(0, CardView.H * .38f, 0) + new Vector3(0, 0, k * .0009f);
                }
            }
            foreach (var kv in people) if (!fans.ContainsKey(kv.Key) || !fans[kv.Key]) kv.Value.Hold = null;
        }
        // Yelpazenin yeri: oturanın göğsünün önünde, ellerinin arasında; yüzü ona dönük, hafif geriye yatık.
        readonly Dictionary<int, Transform> fans = new();
        void PlaceFans()
        {
            foreach (var kv in fans)
            {
                if (!kv.Value || !people.TryGetValue(kv.Key, out var p) || !p) continue;
                var seat = hall.Seat(TableIndex, kv.Key); var toMe = seat - hall.Tables[TableIndex]; toMe.y = 0; toMe.Normalize();
                var pos = seat - toMe * .25f + Vector3.up * .93f; // göğsün önü: kollar masaya uzanmaz
                kv.Value.SetPositionAndRotation(pos, Quaternion.LookRotation(toMe, Vector3.up) * Quaternion.Euler(-22, 0, 0));
            }
        }
        // ---------- ortadaki el: her kart oynayanın önünde; el bitince alana doğru süpürülür ----------
        void DrawTrick()
        {
            var trick = (State["trick"] as JArray) ?? new JArray();
            string sig = Phase + "|" + string.Join(",", trick.Select(t => (string)t["card"]["id"]));
            if (sig == trickSig) return;
            bool wasFull = trickSig.Split('|').Length > 1 && trickSig.Split('|')[1].Split(',').Length == 4 && trickSig.StartsWith("trickEnd");
            trickSig = sig;
            if (wasFull && trick.Count == 0)
            {
                // el bitti: kartlar alanın kenarına kayar ve kaybolur
                int win = (int?)(State["lastTrick"] as JObject)?["winner"] ?? -1;
                var target = win >= 0 ? root.TransformPoint(R(DirOf(win)) * new Vector3(.25f, Top + .002f, .3f)) : root.position;
                if (win >= 0 && people.TryGetValue(DirOf(win), out var taker) && taker) taker.Reach(root.position + Vector3.up * (Top + .02f), 0, .55f); // eli alan ortadan toplar
                // el bitti: kartlar kazananın önüne kayıp küçülerek kaybolur (PrimeTween)
                foreach (var cv in trickRoot.GetComponentsInChildren<CardView>())
                {
                    var tr = cv.transform; tr.SetParent(lastRoot, true);
                    Tween.Position(tr, target, .45f, Ease.InCubic);
                    Tween.Scale(tr, tr.localScale.x * .55f, .45f, Ease.InCubic).OnComplete(() => { if (tr) Destroy(tr.gameObject); });
                }
                return;
            }
            var have = trickRoot.GetComponentsInChildren<CardView>().ToDictionary(c => c.Id);
            foreach (var kv in have) if (!trick.Any(t => (string)t["card"]["id"] == kv.Key)) { Tween.StopAll(kv.Value.transform); Destroy(kv.Value.gameObject); }
            for (int k = 0; k < trick.Count; k++)
            {
                var t = trick[k]; string id = (string)t["card"]["id"]; int seat = (int)t["seat"]; int d = DirOf(seat);
                if (have.ContainsKey(id)) continue;
                var v = CardView.Make(trickRoot, t["card"]);
                float jitter = ((id.GetHashCode() & 15) - 7) * 1.5f;
                v.transform.localScale = Vector3.one * 1.7f; // uzaktan da net okunsun
                v.Home = root.TransformPoint(R(d) * new Vector3(0, Top + .002f + k * .0012f, .11f));
                v.HomeRot = root.rotation * R(myDir) * Quaternion.Euler(0, 180 + jitter, 0);
                // oynayanın elinden gelir
                Vector3 start = seat == Me && hand.TryGetValue(id, out var src) ? src.transform.position
                              : fans.TryGetValue(d, out var fan) && fan ? fan.position : root.TransformPoint(R(d) * new Vector3(0, Top + .1f, .45f));
                v.transform.SetPositionAndRotation(start, v.HomeRot * Quaternion.Euler(0, 0, 25));
                Tween.Position(v.transform, v.Home, .34f, Ease.OutCubic); Tween.Rotation(v.transform, v.HomeRot, .34f, Ease.OutCubic); // elden ortaya süzülür
                if (people.TryGetValue(d, out var thrower) && thrower) thrower.Reach(v.Home, 0, .6f); // kâğıdı sağ eliyle ortaya bırakır
                if (seat == Me && hand.TryGetValue(id, out var mine)) { Destroy(mine.gameObject); hand.Remove(id); }
            }
            if (Phase == "trickEnd")
            {
                int w = (int?)State["turn"] ?? -1; // el sonunda sıra kazananda
                foreach (var c in trickRoot.GetComponentsInChildren<CardView>()) if (w >= 0) { var tt = trick.FirstOrDefault(x => (string)x["card"]["id"] == c.Id); if (tt != null && (int)tt["seat"] == w) { c.Home += Vector3.up * .004f; Tween.Position(c.transform, c.Home, .2f, Ease.OutQuad); Tween.Scale(c.transform, c.transform.localScale.x * 1.08f, .2f, Ease.OutBack); } } // kazanan kâğıt öne çıkar
            }
        }

        // ---------- etkileşim ----------
        CardView hover;
        void Update()
        {
            if (!root) return;
            float k = 1 - Mathf.Exp(-Time.deltaTime * 14);
            foreach (var v in hand.Values)
            {
                var h = v == hover && MyTurn ? v.Home + v.HomeRot * Vector3.forward * .012f : v.Home; // üstüne gelinen kâğıt kendi düzleminde kalkar (öne çıkmaz)
                v.transform.SetPositionAndRotation(Vector3.Lerp(v.transform.position, h, k), Quaternion.Slerp(v.transform.rotation, v.HomeRot, k));
            }
            // ortadaki kâğıtlar PrimeTween ile hareket eder (DrawTrick)
            if (Spectating || !me || UI.Ui.PointerOverUi) { hover = null; return; }
            hover = null;
            if (Physics.Raycast(me.Cam.ScreenPointToRay(Input.mousePosition), out var hit, 4f) && hit.collider.TryGetComponent<CardView>(out var cv) && hand.ContainsKey(cv.Id ?? "")) hover = cv;
            if (Input.GetMouseButtonDown(0) && hover && MyTurn && Phase == "playing" && Time.time - lastPlay > .4f)
            {
                var legal = ((State["legal"] as JArray) ?? new JArray()).Select(x => (string)x);
                if (!legal.Contains(hover.Id)) { UI.Ui.Toast("Bu kâğıt şu an oynanamaz: rengi takip et, geçebiliyorsan büyüt."); return; }
                lastPlay = Time.time; io.Emit("batak:play", new { cardId = hover.Id });
            }
        }

        // ---------- kamera: kendi sandalyemden, eli ve masayı görür ----------
        bool hiddenSelf;
        void LateUpdate()
        {
            if (root && TableIndex >= 0) PlaceFans();
            bool on = root && me && me.InputLocked;
            if (hiddenSelf != on) { hiddenSelf = on; foreach (var r in me.Body.GetComponentsInChildren<Renderer>()) r.enabled = !on || Spectating; if (!on) me.Cam.fieldOfView = 55; }
            if (!on) return;
            var cam = me.Cam.transform;
            var center = hall.Tables[TableIndex] + Vector3.up * Top;
            var pos = Spectating ? Vector3.Lerp(Stool, hall.Seat(TableIndex, myDir, .3f), .62f) + Vector3.up * 1.48f // yancı: yanındakinin omzunun üstünden
                                 : hall.Seat(TableIndex, myDir, .22f) + Vector3.up * 1.5f;
            var toward = center - pos; toward.y = 0;
            var look = center - toward.normalized * .12f + Vector3.up * .05f;
            if (Spectating && Me >= 0) look = Vector3.Lerp(look, hall.Seat(TableIndex, myDir, -.35f) + Vector3.up * (Top + .12f), .5f); // elini ve ortayı birlikte görür
            me.Cam.fieldOfView = Mathf.Lerp(me.Cam.fieldOfView, 60, Time.deltaTime * 6);
            cam.position = Vector3.Lerp(cam.position, pos, Time.deltaTime * 6);
            cam.rotation = Quaternion.Slerp(cam.rotation, Quaternion.LookRotation(look - cam.position), Time.deltaTime * 6);
        }
    }
}
