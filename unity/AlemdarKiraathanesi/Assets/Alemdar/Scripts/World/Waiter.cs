// Kahveci: siparişleri sırayla ocaktan alıp masaya götürür, siparişi verenin köşe bardaklığına bırakır, ocağa döner.
// Orada eski bir bardak varsa tepsiye alır; biten bardakları da gelip toplar (TableService söyler).
// Herkes aynı servisi görür (sunucu 'world:serve' yayınlar).
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.AI;

namespace Alemdar.World
{
    public class Waiter : MonoBehaviour
    {
        public static readonly (string id, string name)[] Menu = { ("cay", "Çay"), ("kahve", "Türk kahvesi"), ("oralet", "Oralet"), ("tost", "Kaşarlı tost"), ("simit", "Simit"), ("ayran", "Ayran"), ("su", "Su"), ("nargile", "Nargile") };
        struct Order { public string item; public int table, dir; public bool collect; }
        readonly Queue<Order> queue = new();
        Hall hall; NavMeshAgent agent; Chars.Person body; bool busy;

        public void Init(Hall h)
        {
            hall = h;
            body = Chars.Person.Create("Kahveci Evdo", transform, true, "waiter");
            transform.position = hall.WaiterSpot;
            agent = gameObject.AddComponent<NavMeshAgent>();
            agent.radius = .25f; agent.height = 1.75f; agent.speed = 1.5f; agent.acceleration = 6; agent.angularSpeed = 420; agent.stoppingDistance = .05f; agent.autoBraking = true;
            agent.obstacleAvoidanceType = ObstacleAvoidanceType.LowQualityObstacleAvoidance;
        }

        // dir: siparişi verenin sandalye yönü; ikram onun köşe bardaklığına (nargile sandalyesinin yanına) konur
        public void Serve(string item, int table, int dir) { queue.Enqueue(new Order { item = item, table = table, dir = dir }); if (!busy) StartCoroutine(Work()); }
        public void Collect(int table, int dir) { pickups.Enqueue(new Order { table = table, dir = dir, collect = true }); if (!busy) StartCoroutine(Work()); }
        readonly Queue<Order> pickups = new(); // boş toplama: siparişler her zaman önce

        IEnumerator Work()
        {
            busy = true;
            while (queue.Count > 0 || pickups.Count > 0)
            {
                var o = queue.Count > 0 ? queue.Dequeue() : pickups.Dequeue();
                if (o.table < 0 || o.table >= hall.Tables.Count) continue;
                Transform tray = null, item = null;
                if (!o.collect)
                {
                    yield return Go(hall.WaiterSpot + new Vector3(-.6f, 0, -.35f)); // tezgahtan al
                    yield return Face(hall.WaiterSpot + new Vector3(-.6f, 1, -1));
                    body.Serve(); yield return new WaitForSeconds(1.1f);
                    (tray, item) = Tray(o.item);
                }
                // masanın o köşesinin dışında, oturanın arkasına girmeden durur
                var t = hall.Tables[o.table]; var corner = hall.Corner(o.table, o.dir);
                var dir = corner - t; dir.y = 0;
                var stand = t + dir.normalized * (Hall.SeatDist + .35f) + Quaternion.Euler(0, 90, 0) * dir.normalized * .45f;
                yield return Go(stand);
                yield return Face(o.item == "nargile" ? hall.Seat(o.table, o.dir) : corner);
                body.Serve(); yield return new WaitForSeconds(.6f);
                Transform old;
                if (o.collect) old = TableService.I.TakeEmpty(o.table, o.dir);
                else old = TableService.I.Place(item, o.item, o.table, o.dir); // yalnızca ikram masaya iner; tepsi kahvecide kalır
                if (old)
                {
                    if (!tray) tray = Props.Tray(transform);
                    tray.localPosition = new Vector3(.12f, 1.05f, .32f);
                    old.SetParent(tray, true); old.localPosition = new Vector3(-.06f, .007f, .03f); old.localRotation = Quaternion.identity;
                    if (old.name == "nargile") old.localPosition = new Vector3(0, -.62f, .12f); // nargile elde, tepsinin altında
                }
                yield return new WaitForSeconds(.6f);
                if (old) { yield return Go(hall.WaiterSpot + new Vector3(-.6f, 0, -.35f)); yield return Face(hall.WaiterSpot + new Vector3(-.6f, 1, -1)); body.Serve(); yield return new WaitForSeconds(.8f); }
                if (tray) Destroy(tray.gameObject); // her siparişte yeni tepsi kurulur; gizli tepsi birikmesin (boşlar tezgaha bırakıldı)
            }
            yield return Go(hall.WaiterSpot);
            yield return Face(hall.WaiterSpot + Vector3.forward);
            busy = false;
        }

        // Tepsi göğüs hizasında, düz tutulur (el kemiğine bağlanmaz; yürürken devrilmesin).
        (Transform tray, Transform item) Tray(string item)
        {
            var tray = Props.Tray(transform); tray.localPosition = new Vector3(.12f, 1.05f, .32f);
            Transform t = item switch
            {
                "kahve" => Props.Coffee(tray, Vector3.zero),
                "tost" => Props.Toast(tray, Vector3.zero),
                "simit" => Simit(tray),
                "cay" => Props.ServedTea(tray, Vector3.zero),
                "nargile" => Props.Nargile(tray, Vector3.zero, 0),
                _ => Props.TeaGlass(tray, Vector3.zero, true),
            };
            if (item == "nargile") { t.localPosition = new Vector3(.1f, -.62f, .12f); t.localRotation = Quaternion.identity; return (tray, t); } // elde taşınır, yerden biraz yüksekte
            if (item == "oralet") Tint(t, new Color(.85f, .42f, .05f));
            if (item == "ayran") Tint(t, new Color(.95f, .95f, .92f));
            if (item == "su") Tint(t, new Color(.8f, .9f, 1f, .4f));
            t.localPosition = new Vector3(0, .007f, 0); t.localRotation = Quaternion.identity;
            return (tray, t);
        }
        static void Tint(Transform t, Color c)
        {
            if (!tints.TryGetValue(c, out var m)) { tints[c] = m = new Material(Props.Tea) { color = c }; m.SetColor("_EmissionColor", c * .12f); } // renk başına bir malzeme
            foreach (var r in t.GetComponentsInChildren<Renderer>()) if (r.sharedMaterial == Props.Tea) r.sharedMaterial = m;
        }
        static readonly System.Collections.Generic.Dictionary<Color, Material> tints = new();
        static Transform Simit(Transform p)
        {
            var root = new GameObject("simit").transform; root.SetParent(p, false);
            Props.Cyl(root, .1f, .01f, Props.White, new Vector3(0, .005f, 0));
            var m = Props.M(new Color(.62f, .36f, .14f), .25f);
            for (int i = 0; i < 16; i++) { float a = i / 16f * Mathf.PI * 2; var s = GameObject.CreatePrimitive(PrimitiveType.Sphere); Destroy(s.GetComponent<Collider>()); s.transform.SetParent(root, false); s.transform.localPosition = new Vector3(Mathf.Cos(a) * .055f, .025f, Mathf.Sin(a) * .055f); s.transform.localScale = Vector3.one * .035f; s.GetComponent<Renderer>().sharedMaterial = m; }
            return root;
        }

        IEnumerator Go(Vector3 p)
        {
            if (NavMesh.SamplePosition(p, out var hit, 1.5f, NavMesh.AllAreas)) p = hit.position;
            agent.isStopped = false; agent.SetDestination(p);
            float until = Time.time + 25;
            while (Time.time < until && (agent.pathPending || agent.remainingDistance > .12f)) yield return null;
            agent.isStopped = true;
        }
        IEnumerator Face(Vector3 p)
        {
            var d = p - transform.position; d.y = 0; if (d.sqrMagnitude < .001f) yield break;
            var want = Quaternion.LookRotation(d);
            for (float t = 0; t < .35f; t += Time.deltaTime) { transform.rotation = Quaternion.Slerp(transform.rotation, want, t / .35f); yield return null; }
        }

        void Update() { if (agent) body.SetSpeed(agent.velocity.magnitude); }
    }
}
