// Masadaki ikramlar ve hal hareketleri: kahvecinin bıraktığı çay, kahve, yiyecek ve nargile; Q ile içmek, G ile sigara, H ile nargile.
// Her oyuncunun köşe bardaklığında tek ikram durur: yenisi gelince kahveci eskisini tepsiye alır (bardaklar üst üste binmez).
// Biten bardağı ve tabağı kahveci birkaç saniye sonra gelip toplar. Hareketler 'world:act' ile herkese gider; herkes aynı içişi ve dumanı görür.
using System.Collections;
using System.Collections.Generic;
using UnityEngine;

namespace Alemdar.World
{
    public class TableService : MonoBehaviour
    {
        public static TableService I { get; private set; }
        class Item { public Transform root, liquid; public string kind; public int table, dir, left, max; public float servedAt, emptyAt; public bool busy, collecting, keep; public Vector3 home; public Quaternion homeRot; public Vector3 liquidScale, liquidPos; }
        readonly Dictionary<(int, int), Item> cups = new(), hookahs = new();
        Hall hall; Waiter waiter;
        public System.Func<string, Chars.Person> PersonNamed;          // ad → masadaki ya da salondaki kişi
        public System.Func<(int table, int dir, Chars.Person body, bool firstPerson)> Self; // benim yerim; firstPerson: masada, kamera gözümde
        public System.Action<string, int, int> Send;                   // (hareket, masa, koltuk yönü) → sunucu

        public void Init(Hall h, Waiter w)
        {
            I = this; hall = h; waiter = w;
            // salonun köşe bardaklıklarındaki yarım çaylar ve küllükler: masadaki ikram sayılır (yeni sipariş üstüne binmez)
            foreach (var (table, dir, item, kind) in h.CornerItems)
            {
                if (!item) continue;
                var it = new Item { root = item, kind = kind, table = table, dir = dir, max = Sips(kind), left = kind == "kul" ? 0 : 2, keep = kind == "kul",
                                    servedAt = Time.time + Random.Range(-300f, 900f), home = item.position, homeRot = item.rotation };
                it.liquid = item.Find("sivi"); if (it.liquid) { it.liquidScale = it.liquid.localScale; it.liquidPos = it.liquid.localPosition; Level(it); }
                cups[(table, dir)] = it;
            }
        }

        static int Sips(string kind) => kind switch { "kahve" => 3, "tost" or "simit" => 3, "kul" => 1, _ => 4 };
        static bool Food(string kind) => kind == "tost" || kind == "simit";

        // ---------- kahveci bırakır / toplar ----------
        // Masaya bırakılan ikram; aynı yerde eskisi varsa onu döndürür (kahveci tepsiye alır).
        public Transform Place(Transform item, string kind, int table, int dir)
        {
            var map = kind == "nargile" ? hookahs : cups;
            map.TryGetValue((table, dir), out var old);
            item.SetParent(hall.Loose, true);
            if (kind == "nargile")
            {
                var seat = hall.Seat(table, dir); var fw = (hall.Tables[table] - seat).normalized; var right = Vector3.Cross(Vector3.up, fw);
                var pos = seat + right * .52f + fw * .05f; pos.y = 0;
                var toSeat = seat - pos; toSeat.y = 0;
                item.SetPositionAndRotation(pos, Quaternion.LookRotation(Vector3.Cross(toSeat.normalized, Vector3.up))); // hortum (+x) oturana doğru
            }
            else item.SetPositionAndRotation(hall.Corner(table, dir), Quaternion.Euler(0, Random.Range(0f, 360f), 0));
            var it = new Item { root = item, kind = kind, table = table, dir = dir, left = Sips(kind), max = Sips(kind), servedAt = Time.time, home = item.position, homeRot = item.rotation };
            it.liquid = item.Find("sivi"); if (it.liquid) { it.liquidScale = it.liquid.localScale; it.liquidPos = it.liquid.localPosition; }
            map[(table, dir)] = it;
            Sfx.Play("bardak", item.position, .7f);
            return old?.root;
        }
        // Kahveci boşu almaya geldi: bardak hâlâ oradaysa ve boşsa verir.
        public Transform TakeEmpty(int table, int dir)
        {
            if (!cups.TryGetValue((table, dir), out var it) || !it.collecting || it.busy) return null;
            cups.Remove((table, dir)); return it.root;
        }
        public bool HasCup(int table, int dir) => cups.ContainsKey((table, dir));
        public bool HasNargile(int table, int dir) => hookahs.ContainsKey((table, dir));

        void Update()
        {
            foreach (var it in cups.Values)
            {
                if (it.collecting || it.busy || it.keep || !it.root) continue;
                bool empty = it.left <= 0 && Time.time - it.emptyAt > 6f, stale = Time.time - it.servedAt > 480f; // biten 6 sn sonra, dokunulmayan 8 dk sonra
                if (empty || stale) { it.collecting = true; waiter.Collect(it.table, it.dir); }
            }
            gone.Clear();
            foreach (var kv in held) { if (kv.Key && kv.Value.cig) Hold(kv.Key, kv.Value.cig); else gone.Add(kv.Key); }
            foreach (var k in gone) { if (held[k].cig) Destroy(held[k].cig.gameObject); held.Remove(k); } // kişi salondan ayrıldı
            if (myCig) HoldFirstPerson(myCig, myPuffing);
        }

        // ---------- içmek (Q) ----------
        public bool SipMine()
        {
            var s = Self(); if (s.table < 0 || s.dir < 0) return false;
            if (!cups.TryGetValue((s.table, s.dir), out var it) || it.left <= 0 || it.collecting || it.keep) return false;
            if (it.busy) return true;
            StartCoroutine(Sip(it, s.body, s.firstPerson)); Send?.Invoke("sip", s.table, s.dir); return true;
        }
        IEnumerator Sip(Item it, Chars.Person p, bool fp)
        {
            it.busy = true; var cam = Camera.main.transform;
            var hand = p && !fp ? p.Anim.GetBoneTransform(HumanBodyBones.RightHand) : null;
            if (hand) p.Gesture(Chars.Person.Drink, 3.6f);
            if (!Food(it.kind)) StartCoroutine(Later(fp ? 1.0f : 1.6f, () => Sfx.Play("hopurtu", fp ? cam.position : it.home + Vector3.up * .5f, fp ? .5f : .7f)));
            float total = fp ? 2.1f : 3.4f;
            for (float t = 0; t < total && it.root; t += Time.deltaTime)
            {
                float k = Mathf.SmoothStep(0, 1, Mathf.Clamp01(t / .55f)) * Mathf.SmoothStep(0, 1, Mathf.Clamp01((total - t) / .55f));
                Vector3 to; Quaternion rot = it.homeRot;
                if (fp) { var f = cam.forward; f.y = 0; f.Normalize(); to = cam.position + cam.forward * .34f - cam.up * .05f + cam.right * .06f; rot = Quaternion.LookRotation(f) * Quaternion.Euler(-24 * Mathf.Clamp01((t - .5f) / .6f), 0, 0); } // ekranın altından ağza gelir
                else if (hand) to = hand.position + Vector3.down * .035f;
                else to = it.home + Vector3.up * .2f;
                it.root.SetPositionAndRotation(Vector3.Lerp(it.home, to, k), Quaternion.Slerp(it.homeRot, rot, k));
                yield return null;
            }
            if (!it.root) yield break;
            it.root.SetPositionAndRotation(it.home, it.homeRot);
            Sfx.Play("bardak", it.home, .45f, 1.1f);
            it.left--; Level(it);
            if (it.left <= 0) it.emptyAt = Time.time;
            it.busy = false;
        }
        static IEnumerator Later(float s, System.Action a) { yield return new WaitForSeconds(s); a(); }
        // Bardaktaki çay iner, kahve fincanın dibine çekilir, yiyecek ısırıldıkça küçülür.
        void Level(Item it)
        {
            float f = Mathf.Clamp01(it.left / (float)it.max);
            if (Food(it.kind))
            {
                for (int i = 1; i < it.root.childCount; i++) { var c = it.root.GetChild(i); if (f <= 0) c.gameObject.SetActive(false); else c.localScale *= .8f; } // 0. çocuk tabak
                return;
            }
            if (!it.liquid) return;
            if (it.kind == "kahve") it.liquid.localPosition = new Vector3(it.liquidPos.x, Mathf.Lerp(.016f, it.liquidPos.y, f), it.liquidPos.z);
            else it.liquid.localScale = new Vector3(it.liquidScale.x, it.liquidScale.y * Mathf.Max(.08f, f), it.liquidScale.z);
            it.liquid.gameObject.SetActive(f > 0);
        }

        // ---------- sigara (G) ve nargile (H) ----------
        readonly Dictionary<Chars.Person, (Transform cig, int puffs)> held = new();
        Transform myCig; int myPuffs; bool myPuffing;
        readonly List<Chars.Person> gone = new();
        public void SmokeMine()
        {
            var s = Self();
            if (s.firstPerson) { if (myPuffing) return; StartCoroutine(PuffFirstPerson(false)); }
            else if (s.body) StartCoroutine(Puff(s.body, false));
            Send?.Invoke("smoke", s.table, s.dir);
        }
        public bool NargileMine()
        {
            var s = Self(); if (s.table < 0 || s.dir < 0 || !hookahs.ContainsKey((s.table, s.dir))) return false;
            if (s.firstPerson) { if (!myPuffing) StartCoroutine(PuffFirstPerson(true)); }
            else if (s.body) StartCoroutine(Puff(s.body, true));
            Send?.Invoke("nargile", s.table, s.dir); return true;
        }
        // Başkasının hareketi (sunucudan): o kişi içer, sigarasını çeker ya da nargilesini fokurdatır.
        public void Remote(string name, string act, int table, int dir)
        {
            var p = PersonNamed?.Invoke(name);
            if (p && table >= 0 && table < hall.Tables.Count && (p.transform.position - hall.Tables[table]).sqrMagnitude > 3f * 3f) return; // o masada değil: sahte hareket
            if (act == "sip") { if (table >= 0 && dir >= 0 && cups.TryGetValue((table, dir), out var it) && it.left > 0 && !it.busy && !it.collecting) StartCoroutine(Sip(it, p, false)); }
            else if (p && act == "smoke") StartCoroutine(Puff(p, false));
            else if (p && act == "nargile") StartCoroutine(Puff(p, true));
        }
        IEnumerator Puff(Chars.Person p, bool nargile)
        {
            if (!nargile)
            {
                if (!held.TryGetValue(p, out var h) || !h.cig) { h = (Props.HandCigarette(), 0); h.cig.SetParent(hall.Root, true); Sfx.Play("cakmak", p.transform.position + Vector3.up * 1.2f); }
                held[p] = (h.cig, h.puffs + 1);
            }
            p.Gesture(Chars.Person.Drink, 3.2f); // el ağza (sigara ya da nargile ağızlığı)
            if (nargile) Sfx.Play("fokur", p.transform.position + Vector3.up * .5f, .8f);
            yield return new WaitForSeconds(1.7f);
            if (!p) yield break;
            var head = p.Head ? p.Head.position : p.transform.position + Vector3.up * 1.25f;
            Props.Exhale(head + p.Front * .1f + Vector3.up * .03f, (p.Front + Vector3.up * .12f).normalized, nargile ? 1.4f : .8f);
            Sfx.Play("nefes", head, .6f);
            if (!nargile && held.TryGetValue(p, out var c) && c.puffs >= 6) { yield return new WaitForSeconds(1.2f); if (c.cig) Destroy(c.cig.gameObject); held.Remove(p); } // sigara bitti
        }
        IEnumerator PuffFirstPerson(bool nargile)
        {
            myPuffing = true;
            if (!nargile && !myCig) { myCig = Props.HandCigarette(); myPuffs = 0; Sfx.Play("cakmak", Camera.main.transform.position, .8f); }
            if (nargile) Sfx.Play("fokur", Camera.main.transform.position + Vector3.down * .6f, .7f);
            if (!nargile) myPuffs++;
            yield return new WaitForSeconds(nargile ? .9f : 1.3f); // nefes
            var cam = Camera.main.transform;
            Props.Exhale(cam.position + cam.forward * .14f - cam.up * .07f, (cam.forward + Vector3.up * .1f).normalized, nargile ? 1.4f : .8f);
            Sfx.Play("nefes", cam.position, .5f);
            myPuffing = false;
            if (!nargile && myPuffs >= 6) { yield return new WaitForSeconds(1.5f); if (myCig) Destroy(myCig.gameObject); myCig = null; }
        }
        // Elinde tutar: sağ elin içinde, ucu öne.
        static void Hold(Chars.Person p, Transform cig)
        {
            var hand = p.Anim ? p.Anim.GetBoneTransform(HumanBodyBones.RightHand) : null; if (!hand) return;
            cig.SetPositionAndRotation(hand.position + p.Front * .04f, Quaternion.LookRotation(p.Front + Vector3.down * .2f));
        }
        // Masada kendi gözümden: sağ altta parmak arasında; nefes çekerken ağza gelir.
        void HoldFirstPerson(Transform cig, bool puffing)
        {
            var cam = Camera.main.transform;
            var rest = cam.position + cam.forward * .3f + cam.right * .14f - cam.up * .16f;
            var mouth = cam.position + cam.forward * .14f + cam.right * .02f - cam.up * .06f;
            var want = puffing ? mouth : rest;
            cig.position = Vector3.Lerp(cig.position == Vector3.zero ? rest : cig.position, want, Time.deltaTime * 5);
            cig.rotation = Quaternion.LookRotation(cam.forward + cam.right * .5f);
        }
        // Masadan kalkınca elimdeki sigara söner (masa kamerasından düşmesin).
        public void PutOutMine() { if (myCig) Destroy(myCig.gameObject); myCig = null; myPuffing = false; }
    }
}
