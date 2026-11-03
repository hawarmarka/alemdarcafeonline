// Batak masasının arayüzü: bekleme (bot ekle / botlarla başlat), üst bilgi (tür, el, koz, ihale), puan tablosu,
// söz verme ve koz seçme düğmeleri, sıra ve süre, el sonu / maç sonu tablosu. Kart oynamak masada tıklayarak (BatakTable).
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.UI;

namespace Alemdar.UI
{
    public class BatakHud : MonoBehaviour
    {
        App app; Batak.BatakTable t;
        RectTransform root, wait, top, board, bar, bidRow, result, resultRows;
        Text waitInfo, topInfo, turnInfo, resultTitle, resultFoot; Button bAdd, bBots, bCancel, bRematch;
        readonly Text[,] cells = new Text[5, 4]; // satır 0 başlık; sütunlar: oyuncu, söz, aldı, puan
        static readonly float[] ColW = { 150, 46, 46, 56 };
        static readonly string[] TypeNames = { "ihaleli", "İhaleli", "kozmaca", "Koz Maça", "esli", "Eşli" };
        static string TypeName(string k) { int i = System.Array.IndexOf(TypeNames, k); return i >= 0 ? TypeNames[i + 1] : k; }
        static string SuitName(string s) => s switch { "S" => "♠ Maça", "H" => "♥ Kupa", "D" => "♦ Karo", "C" => "♣ Sinek", _ => "-" };

        public void Build(App a)
        {
            app = a; t = a.Batak; t.OnState += Paint;
            root = Ui.Rect(Ui.Canvas.transform, "batak"); Ui.Stretch(root);

            // bekleme
            wait = Ui.Card(root, new Vector2(640, 220)); Ui.Anchor(wait, new Vector2(.5f, 0), new Vector2(.5f, 0), new Vector2(0, 200), new Vector2(640, 220));
            var wc = Ui.Column(wait, 12); Ui.Stretch(wc);
            waitInfo = Ui.Label(wc, "", 22, Ui.Ink, TextAnchor.MiddleCenter); Ui.Size(waitInfo, -1, 76); waitInfo.supportRichText = true;
            var wr = Ui.Row(wc, 12); Ui.Size(wr, -1, 60);
            bAdd = Ui.Button(wr, "BOT EKLE", Ui.Kind.Plain, () => app.Io.Emit("batak:addBot"), new Vector2(180, 56), "robot");
            bBots = Ui.Button(wr, "BOTLARLA BAŞLAT", Ui.Kind.Primary, () => app.Io.Emit("batak:startBots"), new Vector2(250, 56), "play");
            Ui.Button(wr, "KALK", Ui.Kind.Danger, () => app.LeaveTable(), new Vector2(140, 56), "power");

            // üst bilgi
            top = Ui.Tray(root, new Vector2(900, 54)); Ui.Anchor(top, new Vector2(.5f, 1), new Vector2(.5f, 1), new Vector2(0, -118), new Vector2(900, 54));
            topInfo = Ui.Label(top, "", 21, Ui.Ink, TextAnchor.MiddleCenter); Ui.Stretch(topInfo.rectTransform, 14, 4); topInfo.supportRichText = true;

            // puan tablosu
            board = Ui.Card(root, new Vector2(330, 236)); Ui.Anchor(board, new Vector2(1, 1), new Vector2(1, 1), new Vector2(-185, -300), new Vector2(330, 236));
            var bc = Ui.Column(board, 4, new RectOffset(18, 18, 14, 14)); Ui.Stretch(bc);
            for (int r = 0; r < 5; r++)
            {
                var line = Ui.Row(bc, 4, TextAnchor.MiddleLeft); Ui.Size(line, -1, r == 0 ? 24 : 40);
                for (int k = 0; k < 4; k++)
                {
                    var l = Ui.Label(line, r == 0 ? new[] { "OYUNCU", "SÖZ", "ALDI", "PUAN" }[k] : "", r == 0 ? 13 : 18, r == 0 ? Ui.Muted : Ui.Ink, k == 0 ? TextAnchor.MiddleLeft : TextAnchor.MiddleRight, r == 0 ? FontStyle.Bold : FontStyle.Normal);
                    l.supportRichText = true; l.horizontalOverflow = HorizontalWrapMode.Overflow; Ui.Size(l, ColW[k], r == 0 ? 24 : 40); cells[r, k] = l;
                }
            }

            // alt bant: sıra, söz/koz düğmeleri, kalk
            bar = Ui.Tray(root, new Vector2(1300, 132)); Ui.Anchor(bar, new Vector2(.5f, 0), new Vector2(.5f, 0), new Vector2(0, 26), new Vector2(1300, 132));
            var col = Ui.Column(bar, 8, new RectOffset(16, 16, 10, 10)); Ui.Stretch(col);
            turnInfo = Ui.Label(col, "", 21, Ui.Ink, TextAnchor.MiddleCenter); Ui.Size(turnInfo, -1, 34); turnInfo.supportRichText = true;
            var row = Ui.Row(col, 10); Ui.Size(row, -1, 62);
            bidRow = Ui.Row(row, 6); Ui.Size(bidRow, 1000, 58);
            bCancel = Ui.Button(row, "EL İPTAL", Ui.Kind.Plain, () => app.Io.Emit("batak:cancel"), new Vector2(150, 56), "refresh");
            Ui.Button(row, "MASADAN KALK", Ui.Kind.Danger, () => app.LeaveTable(), new Vector2(200, 56), "power");

            // el sonu / maç sonu
            result = Ui.Card(root, new Vector2(640, 440)); Ui.Anchor(result, new Vector2(.5f, .5f), new Vector2(.5f, .5f), new Vector2(0, 50), new Vector2(640, 440));
            var rc = Ui.Column(result, 10); Ui.Stretch(rc);
            resultTitle = Ui.Label(rc, "", 28, Ui.Ink, TextAnchor.MiddleCenter, FontStyle.Bold); Ui.Size(resultTitle, -1, 48); resultTitle.supportRichText = true;
            resultRows = Ui.Column(rc, 6, new RectOffset(30, 30, 0, 0)); Ui.Size(resultRows, -1, 220);
            resultFoot = Ui.Label(rc, "", 19, Ui.Muted, TextAnchor.MiddleCenter); Ui.Size(resultFoot, -1, 30);
            var rr = Ui.Row(rc, 12); Ui.Size(rr, -1, 60);
            bRematch = Ui.Button(rr, "YENİDEN OYNA", Ui.Kind.Primary, () => app.Io.Emit("batak:rematch"), new Vector2(230, 56), "refresh");
            Ui.Button(rr, "TAMAM", Ui.Kind.Plain, () => result.gameObject.SetActive(false), new Vector2(170, 56), "check");
            Show(false);
        }

        public void Show(bool on)
        {
            root.gameObject.SetActive(on);
            if (on) { wait.gameObject.SetActive(true); top.gameObject.SetActive(false); board.gameObject.SetActive(false); bar.gameObject.SetActive(false); result.gameObject.SetActive(false); waitInfo.text = "Batak masası hazırlanıyor…"; }
        }

        string lastBidSig = "", lastPhase = "";
        void Paint()
        {
            var s = t.State; if (s == null || !root.gameObject.activeSelf) return;
            var players = t.Players; string phase = t.Phase, type = (string)s["type"];
            bool waiting = phase == "waiting", spect = t.Spectating;
            wait.gameObject.SetActive(waiting && !spect);
            top.gameObject.SetActive(!waiting); board.gameObject.SetActive(!waiting); bar.gameObject.SetActive(!waiting && !spect);
            if (waiting)
            {
                bool host = (bool?)s["isHost"] == true;
                bAdd.gameObject.SetActive(host); bBots.gameObject.SetActive(host);
                waitInfo.text = $"<b>Batak · {TypeName(type)}</b> · {(int?)s["roundLimit"] ?? 5} el · masa {(string)s["code"]}\n{players.Count}/4 oyuncu · " +
                                (host ? "Arkadaşların oturabilir; 4 kişi olunca başlar ya da botlarla başlat." : "Masayı kuran başlatacak; 4 kişi olunca kendiliğinden başlar.");
                return;
            }
            // üst bilgi
            var contract = s["contract"] as JObject; string trump = (string)s["trump"];
            string ihale = contract != null ? $" · İhale: <b>{Name((int)contract["seat"])} {(int)contract["bid"]}</b>" : "";
            topInfo.text = $"<b>Batak · {TypeName(type)}</b> · El {(int?)s["round"] ?? 1}/{(int?)s["roundLimit"] ?? 5} · Koz: <b>{(trump == null ? "seçilmedi" : SuitName(trump))}</b>{ihale}" +
                           (string.IsNullOrEmpty((string)s["notice"]) ? "" : $"\n<size=16><color=#D6A95B>{(string)s["notice"]}</color></size>");
            top.sizeDelta = new Vector2(900, string.IsNullOrEmpty((string)s["notice"]) ? 54 : 82);
            // puan tablosu (oturma sırasıyla)
            for (int i = 0; i < 4; i++)
            {
                if (i >= players.Count) { for (int k = 0; k < 4; k++) cells[i + 1, k].text = ""; continue; }
                var p = players[i]; var bid = p["bid"]; bool on = i == t.Turn;
                string b = bid == null || bid.Type == JTokenType.Null ? ((bool?)p["passed"] == true ? "pas" : "-") : ((int)bid).ToString();
                string nm = (string)p["name"]; if (nm.Length > 11) nm = nm.Substring(0, 11);
                string col = on ? "#F0CD8A" : i == t.Me ? "#9FE3C8" : "#F4ECDD";
                cells[i + 1, 0].text = $"<color={col}>{(on ? "▶ " : "")}{nm}</color>";
                cells[i + 1, 1].text = b; cells[i + 1, 2].text = ((int?)p["tricks"] ?? 0).ToString(); cells[i + 1, 3].text = $"<b>{(int?)p["total"] ?? 0}</b>";
            }
            PaintBar(s, phase, players);
            PaintResult(s, phase, players);
        }
        string Name(int i) => (string)t.Players?[i]?["name"] ?? "?";

        void PaintBar(JToken s, string phase, JArray players)
        {
            bool mine = t.MyTurn;
            string who = t.Turn >= 0 && t.Turn < players.Count ? Name(t.Turn) : "";
            int sec = Mathf.CeilToInt(t.TurnLeft);
            turnInfo.text = phase switch
            {
                "bidding" => mine ? $"<color=#F0CD8A><b>Sıra sende:</b></color> söz ver ({sec} sn)" : $"İhale: sıra {who}",
                "trump" => mine ? $"<color=#F0CD8A><b>İhale sende:</b></color> kozu seç ({sec} sn)" : $"{who} kozu seçiyor",
                "playing" => mine ? $"<color=#F0CD8A><b>Sıra sende:</b></color> oynayacağın kâğıda tıkla ({sec} sn)" : $"Sıra: {who}",
                "trickEnd" => $"Eli {who} aldı",
                "roundEnd" => "El bitti, yeni el birazdan",
                "matchEnd" => "Maç bitti",
                _ => ""
            };
            bCancel.gameObject.SetActive((bool?)s["canCancel"] == true);
            // söz / koz düğmeleri: yalnızca değişince yeniden kurulur
            var bidding = s["bidding"] as JObject; bool declare = (bool?)s["declare"] == true; // ihale yokken sunucu null gönderir
            string sig = $"{phase}|{mine}|{bidding?["minNext"]}|{declare}";
            if (sig == lastBidSig) return; lastBidSig = sig;
            foreach (Transform c in bidRow) Destroy(c.gameObject);
            if (!mine) return;
            if (phase == "bidding")
            {
                int min = (int?)bidding?["minNext"] ?? 0;
                if (!declare) Ui.Button(bidRow, "PAS", Ui.Kind.Plain, () => app.Io.Emit("batak:bid", new { value = (int?)null }), new Vector2(90, 54));
                for (int v = min; v <= 13; v++) { int val = v; Ui.Button(bidRow, declare && v == 0 ? "0 (el almam)" : v.ToString(), Ui.Kind.Primary, () => app.Io.Emit("batak:bid", new { value = val }), new Vector2(declare && v == 0 ? 130 : 56, 54)); }
            }
            else if (phase == "trump")
                foreach (var suit in new[] { "S", "H", "D", "C" }) { string su = suit; Ui.Button(bidRow, SuitName(su), Batak.CardView.Red(su) ? Ui.Kind.Danger : Ui.Kind.Plain, () => app.Io.Emit("batak:trump", new { suit = su }), new Vector2(150, 54)); }
        }

        void PaintResult(JToken s, string phase, JArray players)
        {
            bool show = phase == "roundEnd" || phase == "matchEnd";
            if (phase == lastPhase) return; lastPhase = phase;
            result.gameObject.SetActive(show);
            if (!show) return;
            Ui.Pop(result);
            var hist = (JArray)s["history"]; var last = hist?.LastOrDefault();
            bool team = (bool?)s["team"] == true;
            foreach (Transform c in resultRows) Destroy(c.gameObject);
            for (int i = 0; i < players.Count; i++)
            {
                int sc = (int?)last?["scores"]?[i] ?? 0, tot = (int?)players[i]["total"] ?? 0;
                var l = Ui.Label(resultRows, $"{Name(i)}{(i == t.Me ? " (sen)" : "")}   ·   bu el {(sc >= 0 ? "+" : "")}{sc}   ·   toplam <b>{tot}</b>", 20, Ui.Ink, TextAnchor.MiddleLeft); l.supportRichText = true; Ui.Size(l, -1, 40);
            }
            if (phase == "matchEnd")
            {
                int best = players.Max(p => (int?)p["total"] ?? 0);
                var win = players.Select((p, i) => (p, i)).Where(x => ((int?)x.p["total"] ?? 0) == best).Select(x => Name(x.i));
                resultTitle.text = $"Maç bitti · <color=#F0CD8A>{string.Join(" & ", win)}</color> kazandı";
                resultFoot.text = team ? "Eşli: karşılıklı oturanların puanı birlikte sayılır." : "En yüksek puan kazanır.";
                bRematch.gameObject.SetActive(!t.Spectating);
            }
            else { resultTitle.text = $"{(int?)s["round"] ?? 1}. el bitti"; resultFoot.text = "Yeni el birkaç saniye içinde dağıtılır."; bRematch.gameObject.SetActive(false); }
        }

        float nextTick;
        void Update()
        {
            if (!root || !root.gameObject.activeSelf || t.State == null) return;
            if (Time.time > nextTick) { nextTick = Time.time + .5f; if (t.Phase is "bidding" or "trump" or "playing") PaintTurnOnly(); }
        }
        void PaintTurnOnly()
        {
            var s = t.State; var players = t.Players; string who = t.Turn >= 0 && t.Turn < players.Count ? Name(t.Turn) : ""; int sec = Mathf.CeilToInt(t.TurnLeft);
            if (!t.MyTurn) return;
            turnInfo.text = t.Phase switch { "bidding" => $"<color=#F0CD8A><b>Sıra sende:</b></color> söz ver ({sec} sn)", "trump" => $"<color=#F0CD8A><b>İhale sende:</b></color> kozu seç ({sec} sn)", _ => $"<color=#F0CD8A><b>Sıra sende:</b></color> oynayacağın kâğıda tıkla ({sec} sn)" };
        }
    }
}
