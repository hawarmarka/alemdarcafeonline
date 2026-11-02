// Oyun arayüzü (kıraathane teması): üst çubuk, masa paneli, kahveci menüsü, okey alt çubuğu, bekleme ve el sonu.
using System;
using System.Collections;
using System.Linq;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.Networking;
using UnityEngine.UI;

namespace Alemdar.UI
{
    public class Hud : MonoBehaviour
    {
        static readonly string[] ModeNames = { "klasik", "Klasik (yardımlı)", "yardimsiz", "Yardımsız", "katlamali", "Katlamalı" };
        App app; Text online, prompt, turnInfo, waitInfo, resultText, resultFoot; RectTransform resultRows;
        RectTransform tablePanel, seatsBox, orderMenu, gameBar, waitPanel, resultPanel, promptBox, menuPanel;
        Text tableTitle, tableInfo; int shownTable = -1; JObject roomsCache;
        Button bSeriesSort, bPairsSort, bOpen, bPairs, bProcess, bRetract, bReturn, bFinish;
        Button createBtn; int modeIdx, roundIdx = 2;
        static readonly int[] Rounds = { 1, 2, 4 };

        public void Build(App a)
        {
            app = a; var root = Ui.Canvas.transform;
            // üst çubuk
            var top = Ui.Rect(root, "ust"); Ui.Anchor(top, new Vector2(0, 1), new Vector2(1, 1), new Vector2(0, -38), new Vector2(0, 76));
            var shade = Ui.Box(top, new Color(0, 0, 0, .42f)); Ui.Stretch(shade.rectTransform); shade.raycastTarget = false;
            var brand = Ui.Label(top, "ALEMDAR  <size=16><color=#D4A85A>KIRAATHANESİ</color></size>", 30, Ui.Ink, TextAnchor.MiddleLeft, FontStyle.Bold); brand.supportRichText = true;
            Ui.Anchor(brand.rectTransform, new Vector2(0, .5f), new Vector2(0, .5f), new Vector2(200, 0), new Vector2(360, 60));
            online = Ui.Label(top, "", 20, Ui.Muted, TextAnchor.MiddleCenter); Ui.Anchor(online.rectTransform, new Vector2(.5f, .5f), new Vector2(.5f, .5f), Vector2.zero, new Vector2(400, 40));
            var right = Ui.Row(top, 10, TextAnchor.MiddleRight); Ui.Anchor(right, new Vector2(1, .5f), new Vector2(1, .5f), new Vector2(-250, 0), new Vector2(480, 56));
            Ui.Button(right, "KAHVECİ", Ui.Kind.Plain, ToggleOrder, new Vector2(170, 50));
            Ui.Button(right, "MENÜ", Ui.Kind.Ghost, () => menuPanel.gameObject.SetActive(!menuPanel.gameObject.activeSelf), new Vector2(130, 50));
            // yakınlık ipucu
            promptBox = Ui.Card(root, new Vector2(520, 58)); Ui.Anchor(promptBox, new Vector2(.5f, 0), new Vector2(.5f, 0), new Vector2(0, 110), new Vector2(520, 58));
            prompt = Ui.Label(promptBox, "", 22, Ui.Ink, TextAnchor.MiddleCenter); Ui.Stretch(prompt.rectTransform, 16, 4); promptBox.gameObject.SetActive(false);
            BuildTablePanel(root); BuildOrder(root); BuildGameBar(root); BuildWait(root); BuildResult(root); BuildMenu(root);
            app.Okey.OnState = OnGameState;
            app.Io.On("lobbyUpdate", OnLobby);
            app.Io.On("gameFinished", OnFinished);
            StartCoroutine(PollRooms());
        }

        // ---------- ad ----------
        public static void AskName(Action<string> done)
        {
            var card = Ui.Card(Ui.Canvas.transform, new Vector2(560, 300)); Ui.Anchor(card, new Vector2(.5f, .5f), new Vector2(.5f, .5f), Vector2.zero, new Vector2(560, 300));
            var col = Ui.Column(card, 16, new RectOffset(36, 36, 30, 30)); Ui.Stretch(col);
            Ui.Size(Ui.Label(col, "Kıraathaneye hoş geldin", 32, Ui.Ink, TextAnchor.MiddleCenter, FontStyle.Bold), -1, 50);
            Ui.Size(Ui.Label(col, "Masada görünecek adın:", 20, Ui.Muted, TextAnchor.MiddleCenter), -1, 30);
            var inBg = Ui.Box(col, new Color(1, 1, 1, .08f)); Ui.Size(inBg, -1, 58);
            var txt = Ui.Label(inBg.transform, "", 26, Ui.Ink, TextAnchor.MiddleLeft); Ui.Stretch(txt.rectTransform, 16, 4); txt.raycastTarget = true;
            var input = inBg.gameObject.AddComponent<InputField>(); input.textComponent = txt; input.characterLimit = 20;
            var ph = Ui.Label(inBg.transform, "Adın", 26, Ui.Muted, TextAnchor.MiddleLeft); Ui.Stretch(ph.rectTransform, 16, 4); input.placeholder = ph;
            Button ok = null;
            void Submit()
            {
                var n = new string(input.text.Where(c => char.IsLetterOrDigit(c) || c == ' ' || c == '_' || c == '.' || c == '-').ToArray()).Trim();
                if (n.Length < 2) { Ui.Toast("Ad en az 2 harf olmalı."); return; }
                Destroy(card.gameObject); done(n);
            }
            ok = Ui.Button(col, "İÇERİ GİR", Ui.Kind.Primary, Submit, new Vector2(300, 60));
            input.onSubmit.AddListener(_ => Submit());
            input.Select(); input.ActivateInputField();
        }

        // ---------- masa paneli ----------
        void BuildTablePanel(Transform root)
        {
            tablePanel = Ui.Card(root, new Vector2(480, 690)); Ui.Anchor(tablePanel, new Vector2(1, .5f), new Vector2(1, .5f), new Vector2(-270, 0), new Vector2(480, 690));
            var col = Ui.Column(tablePanel, 14); Ui.Stretch(col);
            tableTitle = Ui.Label(col, "Masa", 32, Ui.Ink, TextAnchor.MiddleLeft, FontStyle.Bold); Ui.Size(tableTitle, -1, 44);
            tableInfo = Ui.Label(col, "", 19, Ui.Muted); Ui.Size(tableInfo, -1, 54);
            seatsBox = Ui.Rect(col, "koltuklar"); var grid = seatsBox.gameObject.AddComponent<GridLayoutGroup>(); grid.cellSize = new Vector2(205, 92); grid.spacing = new Vector2(12, 12); Ui.Size(seatsBox, -1, 200);
            // masa ayarları: yan yana seçenekler (çip/bahis yok)
            var create = Ui.Rect(col, "ayarlar"); var cv = create.gameObject.AddComponent<VerticalLayoutGroup>(); cv.spacing = 8; cv.childControlWidth = cv.childControlHeight = true; cv.childForceExpandHeight = false;
            Ui.Segmented(create, "TÜR", new[] { "Klasik", "Yardımsız", "Katlamalı" }, () => modeIdx, i => modeIdx = i, 430);
            Ui.Segmented(create, "EL SAYISI", new[] { "1 el", "2 el", "4 el" }, () => roundIdx, i => roundIdx = i, 430);
            Ui.Size(create, -1, 152);
            createBtn = Ui.Button(col, "MASAYI KUR VE OTUR", Ui.Kind.Primary, CreateHere, new Vector2(430, 60));
            var foot = Ui.Row(col, 10); Ui.Size(foot, -1, 56);
            Ui.Button(foot, "YANCI OL", Ui.Kind.Plain, () => { int t = shownTable; HideTable(); app.Me.WalkTo(app.Hall.Stool(t, 1) + (app.Hall.Stool(t, 1) - app.Hall.Tables[t]).normalized * .4f, () => app.Me.SitAt(app.Hall.Stool(t, 1), Quaternion.LookRotation(app.Hall.Tables[t] - app.Hall.Stool(t, 1)))); }, new Vector2(200, 52));
            Ui.Button(foot, "KAPAT", Ui.Kind.Ghost, HideTable, new Vector2(200, 52));
            tablePanel.gameObject.SetActive(false);
        }
        void PaintCreate() { }
        public void HideTable() { shownTable = -1; tablePanel.gameObject.SetActive(false); }
        public void ShowTable(int t) { shownTable = t; tablePanel.gameObject.SetActive(true); PaintCreate(); RenderTable(); }

        // Masa salonda kurulduysa (hallTable) kendi masasında; diğerleri (webden açılanlar) boş masalara koda göre sırayla yerleşir.
        (string kind, JObject room)[] slotMap = new (string, JObject)[0];
        void MapSlots()
        {
            var map = new (string, JObject)[app.Hall.Tables.Count];
            if (roomsCache != null)
            {
                var all = ((JArray)roomsCache["waiting"]).Select(r => ("waiting", (JObject)r)).Concat(((JArray)(roomsCache["playing"] ?? new JArray())).Select(r => ("playing", (JObject)r))).OrderBy(x => (string)x.Item2["code"]).ToList();
                var rest = new System.Collections.Generic.List<(string, JObject)>();
                foreach (var x in all) { int h = (int?)x.Item2["hallTable"] ?? -1; if (h >= 0 && h < map.Length && map[h].Item2 == null) map[h] = x; else rest.Add(x); }
                int k = 0; for (int i = 0; i < map.Length && k < rest.Count; i++) if (map[i].Item2 == null && i != app.SeatedTable) map[i] = rest[k++];
            }
            slotMap = map;
        }
        (string kind, JObject room) Slot(int t) => t >= 0 && t < slotMap.Length ? slotMap[t] : (null, null);
        void RenderTable()
        {
            if (shownTable < 0) return;
            var (kind, r) = Slot(shownTable);
            tableTitle.text = $"Masa {shownTable + 1}" + (shownTable >= 9 ? " · Teras" : "");
            tableInfo.text = r == null ? "Boş masa. Türü seç, kur ve otur; boş koltuklara birkaç saniyede bilgisayar oyuncuları oturur."
                : $"{ModeTitle((string)r["modeKey"])} · " + (kind == "playing" ? "oyun sürüyor" : "oyuncu bekleniyor");
            foreach (Transform c in seatsBox) Destroy(c.gameObject);
            string[] labels = { "GÜNEY", "DOĞU", "KUZEY", "BATI" };
            for (int dir = 0; dir < 4; dir++)
            {
                int seat = (4 - dir) % 4;
                string name = null;
                if (r != null) { var seats = (JArray)r["seats"]; var s = seat < seats.Count ? seats[seat] : null; name = s == null || s.Type == JTokenType.Null ? null : (string)s["name"]; }
                var cell = Ui.Card(seatsBox, new Vector2(205, 92));
                var l = Ui.Label(cell, $"<size=13><color=#B8AE9A>{labels[dir]}</color></size>\n{name ?? "Boş"}", 21, Ui.Ink, TextAnchor.UpperLeft); l.supportRichText = true; Ui.Stretch(l.rectTransform, 12, 8);
                if (name == null && kind == "waiting")
                {
                    int d = dir, tbl = shownTable; string code = (string)r["code"];
                    var b = Ui.Button(cell, "OTUR", Ui.Kind.Primary, () => app.SitAndJoin(tbl, d, new { mode = "code", roomCode = code, seat = (4 - d) % 4 }), new Vector2(100, 40));
                    var br = (RectTransform)b.transform; br.anchorMin = br.anchorMax = new Vector2(1, 0); br.pivot = new Vector2(1, 0); br.anchoredPosition = new Vector2(-10, 10);
                }
            }
            createBtn.transform.parent.GetChild(createBtn.transform.GetSiblingIndex() - 1).gameObject.SetActive(r == null);
            createBtn.gameObject.SetActive(r == null || kind == "playing");
            Ui.SetText(createBtn, r == null ? "MASAYI KUR VE OTUR" : "MASAYI İZLE");
        }
        static string ModeTitle(string k) => k switch { "katlamali" => "Katlamalı", "yardimsiz" => "Yardımsız", "yardimli" => "Yardımlı", _ => "Klasik" };
        void CreateHere()
        {
            int t = shownTable; if (t < 0) return;
            var (kind, r) = Slot(t);
            if (kind == "playing") { app.Watch(t, (string)r["code"]); return; }
            string mode = ModeNames[modeIdx * 2];
            app.SitAndJoin(t, 0, new { mode = "create", modeKey = mode, stackingMode = mode == "katlamali", assisted = mode != "yardimsiz", bet = 1000, roundLimit = Rounds[roundIdx], isPublic = true, seat = 0, teamMode = false, hallTable = t }); // misafirden bahis alınmaz; çip arayüzde yok
        }
        IEnumerator PollRooms()
        {
            while (true)
            {
                using (var req = UnityWebRequest.Get(app.Io.Url + "/api/rooms"))
                {
                    yield return req.SendWebRequest();
                    if (req.result == UnityWebRequest.Result.Success) { try { roomsCache = JObject.Parse(req.downloadHandler.text); MapSlots(); RenderTable(); } catch (Exception e) { Debug.LogWarning(e.Message); } }
                }
                yield return new WaitForSeconds(3f);
            }
        }

        // ---------- kahveci ----------
        void BuildOrder(Transform root)
        {
            orderMenu = Ui.Card(root, new Vector2(320, 520)); Ui.Anchor(orderMenu, new Vector2(1, 1), new Vector2(1, 1), new Vector2(-180, -350), new Vector2(320, 520));
            var col = Ui.Column(orderMenu, 8); Ui.Stretch(col);
            Ui.Size(Ui.Label(col, "Kahveciye söyle", 24, Ui.Ink, TextAnchor.MiddleLeft, FontStyle.Bold), -1, 40);
            foreach (var (id, name) in World.Waiter.Menu) { var i = id; Ui.Button(col, name, Ui.Kind.Plain, () => { app.Order(i); orderMenu.gameObject.SetActive(false); }, new Vector2(270, 54)); }
            orderMenu.gameObject.SetActive(false);
        }
        void ToggleOrder() => orderMenu.gameObject.SetActive(!orderMenu.gameObject.activeSelf);

        void BuildMenu(Transform root)
        {
            menuPanel = Ui.Card(root, new Vector2(300, 260)); Ui.Anchor(menuPanel, new Vector2(1, 1), new Vector2(1, 1), new Vector2(-170, -220), new Vector2(300, 260));
            var col = Ui.Column(menuPanel, 10); Ui.Stretch(col);
            Ui.Button(col, "Tam ekran", Ui.Kind.Plain, () => Screen.fullScreen = !Screen.fullScreen, new Vector2(250, 54));
            Ui.Button(col, "Adımı değiştir", Ui.Kind.Plain, () => { PlayerPrefs.DeleteKey("ad"); Ui.Toast("Oyunu yeniden açınca yeni adını sorarız."); }, new Vector2(250, 54));
            Ui.Button(col, "Oyundan çık", Ui.Kind.Danger, Application.Quit, new Vector2(250, 54));
            menuPanel.gameObject.SetActive(false);
        }

        // ---------- okey ----------
        void BuildGameBar(Transform root)
        {
            // ahşap çerçeveli tepsi: dizme | açma | işleme/geri alma | bitirme | kalkma (gruplar arası boşluk)
            gameBar = Ui.Tray(root, new Vector2(1560, 84)); Ui.Anchor(gameBar, new Vector2(.5f, 0), new Vector2(.5f, 0), new Vector2(0, 52), new Vector2(1560, 84));
            var row = Ui.Row(gameBar, 9); Ui.Stretch(row, 14, 12);
            var o = app.Okey;
            void Gap() => Ui.Size(Ui.Rect(row, "bosluk"), 14, 10);
            bSeriesSort = Ui.Button(row, "SERİ DİZ", Ui.Kind.Plain, () => o.Arrange("series"), new Vector2(140, 58));
            bPairsSort = Ui.Button(row, "ÇİFT DİZ", Ui.Kind.Plain, () => o.Arrange("pairs"), new Vector2(140, 58));
            Gap();
            bOpen = Ui.Button(row, "SERİ AÇ", Ui.Kind.Primary, o.OpenSeries, new Vector2(140, 58));
            bPairs = Ui.Button(row, "ÇİFT AÇ", Ui.Kind.Primary, () => o.Move("openWithPairs"), new Vector2(140, 58));
            Gap();
            bProcess = Ui.Button(row, "İŞLE", Ui.Kind.Plain, () => o.Move("processAll"), new Vector2(110, 58));
            bRetract = Ui.Button(row, "GERİ TOPLA", Ui.Kind.Plain, () => o.Move("retractTurn"), new Vector2(160, 58));
            bReturn = Ui.Button(row, "GERİ BIRAK", Ui.Kind.Plain, () => o.Move("undoDiscardDraw"), new Vector2(160, 58));
            Gap();
            bFinish = Ui.Button(row, "BİTİR", Ui.Kind.Primary, () => o.Move("finishGame"), new Vector2(120, 58));
            Gap();
            Ui.Button(row, "MASADAN KALK", Ui.Kind.Danger, () => app.LeaveTable(), new Vector2(190, 58));
            var info = Ui.Card(root, new Vector2(760, 52)); Ui.Anchor(info, new Vector2(.5f, 0), new Vector2(.5f, 0), new Vector2(0, 132), new Vector2(760, 52));
            turnInfo = Ui.Label(info, "", 22, Ui.Ink, TextAnchor.MiddleCenter); Ui.Stretch(turnInfo.rectTransform, 12, 4); turnInfo.supportRichText = true;
            turnInfo.transform.parent.SetParent(gameBar, true);
            gameBar.gameObject.SetActive(false);
        }
        void BuildWait(Transform root)
        {
            waitPanel = Ui.Card(root, new Vector2(620, 220)); Ui.Anchor(waitPanel, new Vector2(.5f, 0), new Vector2(.5f, 0), new Vector2(0, 200), new Vector2(620, 220));
            var col = Ui.Column(waitPanel, 12); Ui.Stretch(col);
            waitInfo = Ui.Label(col, "", 22, Ui.Ink, TextAnchor.MiddleCenter); Ui.Size(waitInfo, -1, 70);
            var row = Ui.Row(col, 12); Ui.Size(row, -1, 60);
            Ui.Button(row, "BOT EKLE", Ui.Kind.Plain, () => app.Io.Emit("addBot"), new Vector2(170, 56));
            Ui.Button(row, "BOTLARLA BAŞLAT", Ui.Kind.Primary, () => app.Io.Emit("startWithBots"), new Vector2(240, 56));
            Ui.Button(row, "KALK", Ui.Kind.Danger, () => app.LeaveTable(), new Vector2(130, 56));
            waitPanel.gameObject.SetActive(false);
        }
        void BuildResult(Transform root)
        {
            resultPanel = Ui.Card(root, new Vector2(620, 420)); Ui.Anchor(resultPanel, new Vector2(.5f, .5f), new Vector2(.5f, .5f), new Vector2(0, 60), new Vector2(620, 420));
            var col = Ui.Column(resultPanel, 12); Ui.Stretch(col);
            resultText = Ui.Label(col, "", 22, Ui.Ink, TextAnchor.UpperCenter); resultText.supportRichText = true; Ui.Size(resultText, -1, 80);
            resultRows = Ui.Column(col, 6, new RectOffset(40, 40, 0, 0)); Ui.Size(resultRows, -1, 190);
            resultFoot = Ui.Label(col, "", 22, Ui.Brass, TextAnchor.MiddleCenter, FontStyle.Bold); Ui.Size(resultFoot, -1, 34);
            Ui.Button(col, "TAMAM", Ui.Kind.Primary, () => resultPanel.gameObject.SetActive(false), new Vector2(220, 56));
            resultPanel.gameObject.SetActive(false);
        }

        public void ShowGame(bool on) { gameBar.gameObject.SetActive(on && !app.Okey.Spectating); waitPanel.gameObject.SetActive(on && app.Okey.State == null && !app.Okey.Spectating); if (!on) resultPanel.gameObject.SetActive(false); }

        void OnLobby(JToken d)
        {
            if (app.SeatedTable < 0 || app.Okey.State != null) return;
            int n = ((JArray)d["players"]).Count;
            waitInfo.text = $"Masa {(string)d["code"]} · {n}/4 oyuncu\nArkadaşlarını bekle ya da bilgisayar oyuncularıyla başla.";
            waitPanel.gameObject.SetActive(true);
        }
        void OnGameState()
        {
            waitPanel.gameObject.SetActive(false);
            if (!app.Okey.Spectating) gameBar.gameObject.SetActive(true);
            var s = app.Okey.State; var players = (JArray)s["players"]; int cur = (int)s["currentPlayer"];
            // o an yapılabilecek hamlelerin düğmesi etkin, diğerleri soluk
            bool mine = app.Okey.MyTurn, drawn = (bool?)s["hasDrawn"] == true, assisted = (bool?)s["assisted"] == true;
            var open = s["myOpenType"]; bool opened = open != null && open.Type == JTokenType.String;
            var tiles = (JArray)s["tiles"]; var fromLeft = s["drawnFromDiscardTileId"];
            bSeriesSort.interactable = bPairsSort.interactable = assisted;
            bOpen.interactable = mine && drawn && (string)open != "pairs";
            bPairs.interactable = mine && drawn;
            bProcess.interactable = mine && drawn && opened && assisted && (bool?)s["canProcess"] != false;
            bRetract.interactable = mine && (bool?)s["canRetract"] == true;
            bReturn.interactable = mine && fromLeft != null && fromLeft.Type != JTokenType.Null;
            bFinish.interactable = mine && opened && tiles != null && tiles.Count == 1;
            turnWho = app.Okey.MyTurn ? ((bool?)s["hasDrawn"] == true ? "<color=#7FD3B5>Sıra sende · taş at</color>" : "<color=#7FD3B5>Sıra sende · taş çek</color>") : $"Sıra: {(string)players[cur]["name"]}";
            int limit = (int?)s["roundLimit"] ?? 4, el = Mathf.Min(limit, ((int?)s["roundsCompleted"] ?? 0) + 1);
            turnRest = $"Destede {(int)s["pileCount"]} taş   ·   El {el}/{limit}";
            PaintTurn();
        }
        string turnWho = "", turnRest = ""; int lastSec = -1;
        void PaintTurn()
        {
            int sec = Mathf.CeilToInt(app.Okey.TurnSecondsLeft); lastSec = sec;
            string clock = sec <= 10 ? $"<color=#FF7A6B>{sec} sn</color>" : $"{sec} sn";
            turnInfo.text = $"{turnWho}  ·  {clock}   ·   {turnRest}";
        }
        void OnFinished(JToken d)
        {
            var hist = (JArray)d["roundHistory"]; var players = (JArray)d["players"];
            bool match = (bool?)d["matchEnded"] == true;
            resultText.text = $"<b><size=30>{(match ? "MAÇ BİTTİ" : "EL BİTTİ")}</size></b>\n<color=#B8AE9A>{((string)d["winnerName"] == "Deste bitti" ? "Deste bitti, eli bitiren yok" : "Eli bitiren: " + (string)d["winnerName"])}</color>";
            foreach (Transform c in resultRows) Destroy(c.gameObject);
            var rows = players.Select((p, i) => (name: (string)p["name"], total: hist.Sum(r => r is JArray ra && i < ra.Count ? (int?)ra[i] ?? 0 : 0))).OrderBy(x => x.total).ToList();
            foreach (var (name, total) in rows)
            {
                var row = Ui.Row(resultRows, 0); Ui.Size(row, -1, 40);
                Ui.Size(Ui.Label(row, name, 24, Ui.Ink, TextAnchor.MiddleLeft), 360, 40);
                Ui.Size(Ui.Label(row, total.ToString(), 24, Ui.Ink, TextAnchor.MiddleRight, FontStyle.Bold), 140, 40);
            }
            resultFoot.text = match ? $"Şampiyon: {(string)d["champion"]}" : "Yeni el birkaç saniye içinde dağıtılıyor…";
            resultPanel.gameObject.SetActive(true);
            CancelInvoke(nameof(HideResult));
            if ((bool?)d["matchEnded"] != true) Invoke(nameof(HideResult), 5.5f); // sunucu 5 sn sonra yeni eli dağıtır
        }
        void HideResult() => resultPanel.gameObject.SetActive(false);

        void Update()
        {
            if (!app || !app.Me) return;
            if (app.Okey.State != null && gameBar.gameObject.activeSelf && Mathf.CeilToInt(app.Okey.TurnSecondsLeft) != lastSec) PaintTurn();
            if (app.Net) online.text = $"<color=#43C486>●</color>  {Mathf.Max(1, app.Net.Online)} kişi salonda"; // liste beni de içerir
            online.supportRichText = true;
            int t = app.SeatedTable < 0 && !tablePanel.gameObject.activeSelf ? app.NearTable() : -1;
            promptBox.gameObject.SetActive(t >= 0);
            if (t >= 0) prompt.text = $"<b>[E]</b>  Masa {t + 1}" + (Slot(t).room == null ? " · boş masa" : Slot(t).kind == "playing" ? " · oyun sürüyor" : " · boş koltuk var");
            prompt.supportRichText = true;
        }
    }
}
