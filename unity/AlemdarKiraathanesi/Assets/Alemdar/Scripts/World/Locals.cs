// Kıraathane ve mahalle ahalisi: masalarda oyun oynayıp konuşan, arada bağıran dayılar; kaldırımda sohbet eden ve
// tartışan adamlar; balkondan sokağa bakan çocuk, balkonda oturup kahveyi seyreden yaşlı amca; parkta çocuğunu çağıran anne,
// çimende piknik yapan aile. Cümleler kalıplardan her seferinde yeniden kurulur (adlar, sayılar, renkler, ünlemler);
// bir grup son söylediklerini tekrar etmez. Ses: Sfx.Voice (kişiye göre ses tonu). Masa grupları o masanın dekoruna bağlıdır:
// masaya gerçek oyun gelince (Hall.SetDecor) kalkarlar.
using System.Collections.Generic;
using UnityEngine;

namespace Alemdar.World
{
    public static class Locals
    {
        public static void Build(Hall hall)
        {
            var root = new GameObject("Ahali").transform; root.SetParent(hall.transform, false);
            // masalarda oynayan dayılar: okey (4), tavla (2), batak (4), terasta çay içip sohbet (2)
            Table(hall, 0, new[] { 0, 1, 2, 3 }, "okey", new[] { "Rıza Dayı", "Hüsnü Abi", "Cemal Usta", "Kâzım Bey" });
            Table(hall, 2, new[] { 0, 2 }, "tavla", new[] { "Ziya Amca", "Şükrü Abi" });
            Table(hall, 6, new[] { 0, 1, 2, 3 }, "batak", new[] { "Nuri Abi", "Sabri Dayı", "Yaşar Bey", "Tahsin Usta" });
            Table(hall, 10, new[] { 1, 3 }, "sohbet", new[] { "Halil Amca", "Mümtaz Bey" });
            // kaldırım: bakkalın önünde sohbet, karşı kaldırımda tartışma, sokakta yürüyenler
            Group(root, new[] { (new Vector3(10.6f, 0, 8.6f), "Necati Abi"), (new Vector3(11.5f, 0, 9.3f), "Selim Bey") }, "sokak", false);
            Group(root, new[] { (new Vector3(-8.2f, 0, 19.4f), "Bayram"), (new Vector3(-7.2f, 0, 19.6f), "Erol") }, "kavga", false);
            Walker(root, "Mehmet Efendi", new Vector3(-20, 0, 7.4f), new Vector3(20, 0, 7.4f), 1.1f);
            Walker(root, "Gülsüm Hanım", new Vector3(18, 0, 19.4f), new Vector3(-18, 0, 19.4f), .95f, "teyze");
            // balkonlar: komşu apartmanda sokağa bakan çocuk, yandaki balkonda oturup kahveyi seyreden yaşlı amca
            Balcony(root, 3, 1, "Ali", "cocuk", false, "cocuk");
            Balcony(root, 2, 0, "İhsan Amca", null, true, "ihtiyar");
            // park: oyun alanının kenarında çocuğunu çağıran anne; çimende piknik yapan aile
            Group(root, new[] { (Playground.Center + new Vector3(-4.6f, 0, -3.2f), "Ayşe Hanım") }, "anne", false, "teyze");
            Picnic(root, new Vector3(-15.5f, .02f, 25.5f));
        }

        // ---------- masadaki dayılar ----------
        static void Table(Hall hall, int table, int[] dirs, string topic, string[] names)
        {
            if (table >= hall.Tables.Count || table >= hall.Decor.Count || !hall.Decor[table]) return;
            var parent = hall.Decor[table].transform; // gerçek oyun gelince dekorla birlikte gizlenir
            var people = new List<Chars.Person>();
            for (int k = 0; k < dirs.Length; k++)
            {
                var holder = new GameObject("Musteri_" + names[k]).transform; holder.SetParent(parent, false);
                var seat = hall.Seat(table, dirs[k]); holder.SetPositionAndRotation(seat, Quaternion.LookRotation(hall.Tables[table] - seat));
                var p = Chars.Person.Create(names[k], holder, false); p.SetSit(true); people.Add(p);
            }
            var g = parent.gameObject.AddComponent<Talker>(); g.Init(people, topic, hall.Tables[table] + Vector3.up * Props.TableTop, 9f);
        }
        static void Group(Transform root, (Vector3 pos, string name)[] who, string topic, bool sit, string role = null)
        {
            var people = new List<Chars.Person>(); var center = Vector3.zero;
            foreach (var (pos, _) in who) center += pos; center /= who.Length;
            foreach (var (pos, name) in who)
            {
                var holder = new GameObject("Ahali_" + name).transform; holder.SetParent(root, false);
                var face = who.Length > 1 ? center - pos : (topic == "anne" ? Vector3.forward : Vector3.back); face.y = 0;
                holder.SetPositionAndRotation(pos, Quaternion.LookRotation(face.sqrMagnitude > .01f ? face : Vector3.forward));
                var p = Chars.Person.Create(name, holder, false, role); p.SetSit(sit); people.Add(p);
            }
            root.gameObject.AddComponent<Talker>().Init(people, topic, center + Vector3.up * 1.5f, 20f);
        }
        static void Walker(Transform root, string name, Vector3 a, Vector3 b, float speed, string role = null)
        {
            var holder = new GameObject("Yuruyen_" + name).transform; holder.SetParent(root, false); holder.position = a;
            var p = Chars.Person.Create(name, holder, false, role);
            holder.gameObject.AddComponent<Stroll>().Init(p, a, b, speed);
        }
        static void Balcony(Transform root, int seed, int floor, string name, string role, bool sit, string topic)
        {
            var bal = Apartment.Balconies.Find(x => x.seed == seed && x.floor == floor);
            if (bal.width <= 0) return;
            var holder = new GameObject("Balkon_" + name).transform; holder.SetParent(root, false);
            var fwd = bal.facing; var right = Vector3.Cross(Vector3.up, fwd);
            holder.position = bal.floor0 + fwd * (sit ? .45f : .82f) + right * (sit ? bal.width * .2f : -bal.width * .15f);
            holder.rotation = Quaternion.LookRotation(sit ? (new Vector3(0, 0, 8) - holder.position).normalized : fwd); // amca kahvenin terasına döner
            if (sit) { Props.Chair(root, holder.position + Vector3.down * .0f, holder.eulerAngles.y + 180); holder.position += Vector3.up * .02f; }
            var p = Chars.Person.Create(name, holder, false, role); p.SetSit(sit);
            p.LookAt = sit ? new Vector3(0, 1f, 7f) : holder.position + fwd * 6 + Vector3.down * 5; // çocuk aşağı, sokağa bakar
            if (sit) Props.TeaGlass(root, holder.position + right * .35f + fwd * .1f + Vector3.up * .45f); // yanında çayı (korkuluk dibindeki taburede)
            root.gameObject.AddComponent<Talker>().Init(new List<Chars.Person> { p }, topic, holder.position + Vector3.up * 1.5f, 24f);
        }
        static void Picnic(Transform root, Vector3 c)
        {
            var blanket = Props.Box(root, new Vector3(2.2f, .015f, 1.6f), Props.M(new Color(.78f, .16f, .14f), .1f), c); blanket.transform.localRotation = Quaternion.Euler(0, 15, 0);
            Props.Teapot(root, c + new Vector3(.3f, .01f, .1f)); Props.TeaGlass(root, c + new Vector3(-.2f, .01f, .2f)); Props.TeaGlass(root, c + new Vector3(.1f, .01f, -.3f));
            Props.Box(root, new Vector3(.45f, .25f, .3f), Props.WoodLight, c + new Vector3(-.6f, .13f, -.2f)); // sepet
            var who = new[] { ("Kemal Bey", new Vector3(-1.4f, 0, .3f), (string)null), ("Nermin Hanım", new Vector3(1.4f, 0, -.2f), "teyze"), ("Babaanne", new Vector3(.2f, 0, 1.3f), "teyze"), ("Elif", new Vector3(-.2f, 0, -1.3f), "cocuk") };
            var people = new List<Chars.Person>();
            foreach (var (name, off, role) in who)
            {
                var pos = c + off; Furniture.Stool(root, pos);
                var holder = new GameObject("Piknik_" + name).transform; holder.SetParent(root, false);
                var face = c - pos; face.y = 0; holder.SetPositionAndRotation(pos + Vector3.up * .06f, Quaternion.LookRotation(face));
                var p = Chars.Person.Create(name, holder, false, role); p.SetSit(true); people.Add(p);
            }
            root.gameObject.AddComponent<Talker>().Init(people, "piknik", c + Vector3.up * 1.2f, 20f);
        }
    }

    // ---------- konuşan grup: seslendirilmiş diyaloglar sırayla oynar (Dialogues); her sözü kendi kişisi söyler ----------
    // Ses dosyası yoksa eski kodla üretilen mırıltıya düşer. Yazı yok: kullanıcı isteğiyle konuşmalar yalnızca sesli.
    public class Talker : MonoBehaviour
    {
        List<Chars.Person> people; string topic; Vector3 focus; float hear, next; int speaker = -1; bool talking;
        System.Random rng;
        public void Init(List<Chars.Person> p, string t, Vector3 f, float hearDistance)
        {
            people = p; topic = t; focus = f; hear = hearDistance; rng = new System.Random((int)Chars.Person.Hash(t + p.Count + f));
            next = Time.time + 1.5f + (float)rng.NextDouble() * 6;
        }
        float gameMove;
        void Update()
        {
            if (people == null || !Camera.main) return;
            var cam = Camera.main.transform.position;
            // masadakiler oyun oynar: sırası gelen taşa/kâğıda uzanır, diğerleri ona (ya da konuşana) bakar
            if (Game && Time.time > gameMove)
            {
                gameMove = Time.time + 2.2f + (float)rng.NextDouble() * 2.5f;
                int turn = (int)(Time.time / 5f) % people.Count; var p = people[turn];
                if (p) { p.Reach(focus + (p.transform.position - focus).normalized * .25f + Vector3.up * .02f, 0, .8f); Sfx.Play(topic == "tavla" ? "zar" : topic == "okey" ? "tas" : "kagit", focus, .6f); }
                if (!talking) foreach (var o in people) if (o && o != p) o.LookAt = p ? p.Head.position : (Vector3?)null;
            }
            if (talking || Time.time < next) return;
            bool near = (cam - focus).sqrMagnitude < hear * hear;
            if (!near) { next = Time.time + 2f; return; } // uzaktaki grup konuşmaz (duyulmaz, işlemci de harcanmaz)
            var dialog = Dialogues.Next(topic, rng);
            if (dialog != null) StartCoroutine(Play(dialog));
            else { next = Time.time + 4f + (float)rng.NextDouble() * 4f; Babble(); }
        }
        // bir diyalog: sözler arka arkaya, arada kısa nefes; konuşana herkes döner
        System.Collections.IEnumerator Play(List<Dialogues.Line> dialog)
        {
            talking = true;
            foreach (var l in dialog)
            {
                var who = people.Find(p => p && p.Display == l.who) ?? (people.Count > 0 ? people[0] : null);
                var clip = Dialogues.Clip(l.id);
                if (!who || !clip) { Dialogues.Missing++; continue; }
                Dialogues.Played++; if (Dialogues.Log.Count < 60) Dialogues.Log.Add($"{Time.time:0.0} {topic} {who.Display}: {l.id} ({clip.length:0.0} sn)");
                foreach (var o in people) if (o && o != who) o.LookAt = who.Head.position;
                who.Gesture(l.shout ? (topic == "kavga" ? Chars.Person.No : Chars.Person.Talk) : (rng.NextDouble() < .75 ? Chars.Person.Talk : Chars.Person.Ask), Mathf.Max(2f, clip.length));
                who.SetTalk(1);
                Sfx.PlayVoice(clip, who.Head ? who.Head.position : who.transform.position + Vector3.up * 1.5f, l.shout);
                yield return new WaitForSeconds(clip.length + .25f + (float)rng.NextDouble() * .5f);
                who.SetTalk(0);
                // dinleyenler arada güler, başını sallar ya da itiraz eder
                foreach (var o in people) if (o && o != who && rng.NextDouble() < .35) o.Gesture(topic == "kavga" ? Chars.Person.No : rng.NextDouble() < .4 ? Chars.Person.Laugh : Chars.Person.Yes, 2f);
            }
            talking = false;
            next = Time.time + (people.Count > 1 ? 6f : 14f) + (float)rng.NextDouble() * 10f; // diyaloglar arası sessizlik
        }
        void Babble()
        {
            speaker = people.Count == 1 ? 0 : (speaker + 1 + rng.Next(people.Count - 1)) % people.Count;
            var who = people[speaker]; if (!who) return;
            bool shout = Lines.ShoutChance(topic) > rng.NextDouble();
            who.Gesture(Chars.Person.Talk, 3.2f);
            bool high = who.Display.EndsWith("Hanım") || who.Display == "Babaanne" || topic == "cocuk" || who.Display == "Elif";
            Sfx.Voice(who.Head ? who.Head.position : who.transform.position + Vector3.up * 1.5f, Lines.Make(topic, shout, rng, new List<string>()), Chars.Person.Hash(who.Display), shout, high);
        }
        bool Game => topic == "okey" || topic == "tavla" || topic == "batak";
    }

    // ---------- seslendirilmiş diyaloglar (Resources/Sesler: diyalog.json + <id>.ogg; tools/voices/seslendir.py üretir) ----------
    public static class Dialogues
    {
        public class Line { public string id, who; public bool shout; }
        public static int Played, Missing; // denetim: çalınan ve bulunamayan söz sayısı
        public static readonly List<string> Log = new();
        static Dictionary<string, List<List<Line>>> all;
        static readonly Dictionary<string, Queue<int>> bags = new();
        static readonly Dictionary<string, AudioClip> clips = new();
        static void Load()
        {
            if (all != null) return;
            all = new();
            var ta = Resources.Load<TextAsset>("Sesler/diyalog"); if (!ta) return;
            var root = Newtonsoft.Json.Linq.JObject.Parse(ta.text);
            foreach (var kv in root)
            {
                var list = new List<List<Line>>();
                foreach (var d in (Newtonsoft.Json.Linq.JArray)kv.Value)
                {
                    var lines = new List<Line>();
                    foreach (var l in (Newtonsoft.Json.Linq.JArray)d) lines.Add(new Line { id = (string)l["id"], who = (string)l["who"], shout = (bool?)l["shout"] == true });
                    if (lines.Count > 0) list.Add(lines);
                }
                all[kv.Key] = list;
            }
        }
        // karışık sırayla: bütün diyaloglar bir kez oynamadan hiçbiri tekrar etmez
        public static List<Line> Next(string scene, System.Random rng)
        {
            Load();
            if (!all.TryGetValue(scene, out var list) || list.Count == 0) return null;
            if (!bags.TryGetValue(scene, out var bag) || bag.Count == 0)
            {
                var order = new List<int>(); for (int i = 0; i < list.Count; i++) order.Insert(rng.Next(order.Count + 1), i);
                bags[scene] = bag = new Queue<int>(order);
            }
            return list[bag.Dequeue()];
        }
        public static AudioClip Clip(string id)
        {
            if (!clips.TryGetValue(id, out var c)) clips[id] = c = Resources.Load<AudioClip>("Sesler/" + id);
            return c;
        }
        // tek söz: kahvecinin "geliyor abi"si, yürüyenin selamı
        public static void Say(string scene, Chars.Person who, System.Random rng)
        {
            if (!who) return;
            List<Line> d = null;
            for (int i = 0; i < 12 && (d == null || d[0].who != who.Display); i++) d = Next(scene, rng); // o kişinin sözü
            if (d == null || d[0].who != who.Display) return;
            var l = d[0]; var c = Clip(l.id); if (!c) return;
            who.Gesture(Chars.Person.Talk, Mathf.Max(1.5f, c.length));
            Sfx.PlayVoice(c, who.Head ? who.Head.position : who.transform.position + Vector3.up * 1.6f, l.shout);
        }
    }

    // ---------- kaldırımda gidip gelen ----------
    public class Stroll : MonoBehaviour
    {
        Chars.Person p; Vector3 a, b; float speed, wait, greetAt; bool toB = true; readonly System.Random rng = new();
        public void Init(Chars.Person person, Vector3 from, Vector3 to, float s) { p = person; a = from; b = to; speed = s; }
        void Update()
        {
            if (!p) return;
            if (wait > 0) { wait -= Time.deltaTime; p.SetSpeed(0); return; }
            var target = toB ? b : a; var d = target - transform.position; d.y = 0;
            if (d.magnitude < .2f) { toB = !toB; wait = 3 + Random.value * 6; return; } // ucta durur, bakınır, geri döner
            // yanından geçerken selam verir
            if (Camera.main && Time.time > greetAt && (Camera.main.transform.position - transform.position).sqrMagnitude < 16) { greetAt = Time.time + 40; Dialogues.Say("yuruyen", p, rng); }
            transform.rotation = Quaternion.Slerp(transform.rotation, Quaternion.LookRotation(d), Time.deltaTime * 4);
            transform.position += d.normalized * speed * Time.deltaTime; p.SetSpeed(speed);
        }
    }

    // ---------- cümle kalıpları ----------
    public static class Lines
    {
        static readonly string[] Colors = { "kırmızı", "sarı", "mavi", "siyah" };
        static readonly Dictionary<string, string[]> T = new()
        {
            ["okey"] = new[] {
                "{ad}, at şu taşı artık!", "Bu el bende, {n} taş kaldı.", "Okeyi kim çekti yine?", "Çifte gidiyorum, haberin olsun.",
                "Yandan aldın, açmak zorundasın!", "Yine 101 ceza yazdık.", "Ver o {renk} {n}'ü bana!", "Abi sen saymayı biliyor musun?",
                "Gösterge {renk} {n}, unutma.", "{ad}, sen açtın mı?", "Bu taşı işlek diye attın değil mi?", "Seri mi açsam çift mi, bilemedim.",
                "Elimde {n} çift var, bekle sen.", "Bir el daha, son el!", "Yazıyı kim tutuyor?", "{ad} yine okeyi saklıyor.",
                "Şu {renk} {n} kimde?", "Deste bitiyor, acele et.", "Çek bakalım, gelsin.", "Ben açarım bu eli.",
            },
            ["batak"] = new[] {
                "Koz maça, haberiniz olsun.", "{n} ihale, kimse geçemez!", "Pas, ben karışmam.", "{ad}, kupayı kesme!",
                "Yine batırdın beni!", "Şu eli ben alırım.", "Koz kırılmadan koz açılmaz!", "Eşim sen misin, rakip mi?",
                "Bastık mı yine?", "{ad}, söylediğini tut bakalım.", "Kızı kim tuttu?", "Papaz bende, bekle.",
            },
            ["tavla"] = new[] {
                "Şeşi beş!", "Düşeş geldi, bak!", "{ad}, kapıyı kapattım.", "Yine pul kırdın!", "Mars ediyorum seni.",
                "Zarı adam gibi at!", "Bu zarla oyun mu olur?", "Dubara, hayırlısı.", "Hep yek atıyorum, olmaz ki.", "Bir el daha, rövanş!",
            },
            ["sohbet"] = new[] {
                "Dün akşam maçı izledin mi?", "Hakem yine bizi yaktı.", "Ekmeğe yine zam gelmiş.", "Emekli maaşı yattı mı?",
                "Benim oğlan askerden geliyor.", "Bu yaz memlekete gidiyoruz.", "Kahveci, iki çay! Biri açık!", "Çaylar soğudu be.",
                "Bizim sokağı yine kazmışlar.", "Bu sene kış erken geldi.", "Torun okula başladı maşallah.", "Rahmetli babam derdi ki...",
                "Bizim zamanımızda böyle miydi?", "Doktor şekeri yasakladı, ben yine içiyorum.", "Bakkal Hasan dükkânı devretmiş.",
            },
            ["sokak"] = new[] {
                "Nasılsın {ad}, hanım nasıl?", "Bakkala uğradın mı?", "Akşam kahvede misin?", "Şu araba kimin, yolu kapatmış.",
                "Benim aküyü bir baksana.", "Hava bozacak gibi.", "Pazara gidiyorum, bir şey lazım mı?", "Oğlan iş buldu, şükür.",
                "Gel bir çay içelim.", "Kira yine arttı.", "Dün seni maçta gördüm.", "Selamün aleyküm, hayırlı işler.",
            },
            ["kavga"] = new[] {
                "Arabayı oraya park etme dedim sana!", "Sen kime ne diyorsun be!", "Borcunu ne zaman vereceksin?",
                "Bir daha kapımın önüne çöp bırakma!", "Sen benim kim olduğumu biliyor musun?", "Bak {ad}, sabrımı taşırma!",
                "Kardeşim yanlış anladın!", "Herkes duysun, haksızlık bu!", "Git işine be!", "Ben sana demedim mi?",
            },
            ["anne"] = new[] {
                "{cocuk}! Eve gel, yemek hazır!", "{cocuk}! Salıncaktan in, düşeceksin!", "Akşam oldu, hadi eve!",
                "{cocuk}, kardeşine iyi bak!", "Üstünü kirletme {cocuk}!", "Beş dakika daha, sonra eve!", "{cocuk}! Montunu giy!",
            },
            ["piknik"] = new[] {
                "Çayı koy, su kaynadı.", "Köfteler pişti mi?", "Çocuklar uzaklaşmayın!", "Şu ağacın gölgesi ne güzel.",
                "Börekten alsana.", "Hava da tam piknik havası.", "Elif, kızım gel bir şey ye.", "Karpuzu kim kesecek?",
            },
            ["ihtiyar"] = new[] {
                "Kahvede bugün kalabalık maşallah.", "Şu okey masası yine bağırıyor.", "Benim zamanımda burası tarlaydı.",
                "Kahveci Evdo'nun çayı bir başka.", "Akşama ben de inerim kahveye.", "Gençler, yavaş oynayın!",
            },
            ["cocuk"] = new[] { "Anneee! Bak araba geçiyor!", "Kediii! Kedi var!", "Ben de parka gidicem!", "Babam kahvede!" },
        };
        static readonly Dictionary<string, string[]> Shouts = new()
        {
            ["okey"] = new[] { "OKEEEY!", "HADİ BE OYNA ARTIK!", "BİTTİ! ELDEN BİTTİ!", "YOK ÖYLE YAĞMA!", "SUS BE, ELİMİ BOZDUN!", "KAHVECİİİ! ÇAAAY!", "ULAN YİNE Mİ SEN!" },
            ["batak"] = new[] { "BATTIN! BATTIN!", "KOZU KESTİ ULAN!", "KAHVECİİİ!", "OYNAMIYORUM ARTIK!", "HİLE VAR BU İŞTE!" },
            ["tavla"] = new[] { "DÜŞEEEŞ!", "MARS OLDUN!", "ZAR HİLELİ BU!", "KAPIYI AÇ ARTIK!", "ŞEŞ BEŞ GELSİN!" },
            ["sohbet"] = new[] { "KAHVECİİİ, İKİ ÇAY!", "YOK ÖYLE BİR ŞEY!", "HAKEM ŞİKE YAPTI!" },
            ["kavga"] = new[] { "SEN KİME BAĞIRIYORSUN!", "ÇEK ARABANI ORADAN!", "AYIP AYIP!", "HERKES ŞAHİT!", "GİT İŞİNE BE!" },
            ["anne"] = new[] { "{COCUK}! EVE GEEEL!", "{COCUK}! YEMEEEK!", "İN ORADAN!" },
            ["cocuk"] = new[] { "ANNEEE!" },
        };
        static readonly string[] Pre = { "", "", "", "Ya ", "Bak ", "Valla ", "Abi, ", "Hacı, ", "Kardeşim, ", "Yahu ", "Haa, " };
        static readonly string[] Kids = { "Ahmet", "Zeynep", "Emre", "Elif", "Mehmet" };
        public static double ShoutChance(string topic) => topic switch { "kavga" => .55, "okey" => .18, "batak" => .16, "tavla" => .2, "anne" => .45, "cocuk" => .3, _ => .05 };
        public static string Make(string topic, bool shout, System.Random rng, List<string> names)
        {
            var src = shout && Shouts.TryGetValue(topic, out var sh) ? sh : (T.TryGetValue(topic, out var t) ? t : T["sohbet"]);
            if (!shout && topic != "cocuk" && rng.NextDouble() < .12) src = T["sohbet"]; // masada da arada gündem konuşulur
            string s = src[rng.Next(src.Length)];
            string other = names.Count > 0 ? First(names[rng.Next(names.Count)]) : "Abi";
            string kid = Kids[rng.Next(Kids.Length)];
            s = s.Replace("{ad}", other).Replace("{n}", (1 + rng.Next(13)).ToString()).Replace("{renk}", Colors[rng.Next(4)])
                 .Replace("{cocuk}", kid).Replace("{COCUK}", kid.ToUpper(new System.Globalization.CultureInfo("tr-TR")));
            string pre = shout || topic == "cocuk" || topic == "anne" ? "" : Pre[rng.Next(Pre.Length)];
            if (pre.Length > 0 && !names.Exists(n => s.StartsWith(First(n)))) s = pre + char.ToLower(s[0], new System.Globalization.CultureInfo("tr-TR")) + s.Substring(1); // "Ya bu el bende."
            else if (pre.Length > 0) s = pre + s;
            return s;
        }
        static string First(string name) { int i = name.IndexOf(' '); return i > 0 ? name.Substring(0, i) : name; }
    }
}
