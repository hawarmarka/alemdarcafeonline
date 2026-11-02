// Kahveci: siparişleri sırayla ocaktan alıp masaya götürür, siparişi verenin önüne bırakır, ocağa döner.
// Herkes aynı servisi görür (sunucu 'world:serve' yayınlar). Bırakılan ikram 3 dakika masada kalır.
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.AI;

namespace Alemdar.World
{
    public class Waiter : MonoBehaviour
    {
        public static readonly (string id, string name)[] Menu = { ("cay", "Çay"), ("kahve", "Türk kahvesi"), ("oralet", "Oralet"), ("tost", "Kaşarlı tost"), ("simit", "Simit"), ("ayran", "Ayran"), ("su", "Su") };
        struct Order { public string item; public int table; public Vector3 spot; }
        readonly Queue<Order> queue = new();
        Hall hall; NavMeshAgent agent; Chars.Person body; bool busy;

        public void Init(Hall h)
        {
            hall = h;
            body = Chars.Person.Create("Kahveci Rıza", transform, true, "waiter");
            transform.position = hall.WaiterSpot;
            agent = gameObject.AddComponent<NavMeshAgent>();
            agent.radius = .25f; agent.height = 1.75f; agent.speed = 1.5f; agent.acceleration = 6; agent.angularSpeed = 420; agent.stoppingDistance = .05f; agent.autoBraking = true;
            agent.obstacleAvoidanceType = ObstacleAvoidanceType.LowQualityObstacleAvoidance;
        }

        // spot: masada ikramın bırakılacağı yer (siparişi verenin önü)
        public void Serve(string item, int table, Vector3 spot) { queue.Enqueue(new Order { item = item, table = table, spot = spot }); if (!busy) StartCoroutine(Work()); }

        IEnumerator Work()
        {
            busy = true;
            while (queue.Count > 0)
            {
                var o = queue.Dequeue();
                yield return Go(hall.WaiterSpot + new Vector3(-.6f, 0, -.35f)); // tezgahtan al
                yield return Face(hall.WaiterSpot + new Vector3(-.6f, 1, -1));
                body.Serve(); yield return new WaitForSeconds(1.1f);
                var (tray, item) = Tray(o.item);
                var t = hall.Tables[o.table];
                var dir = (o.spot - t); dir.y = 0;
                var stand = t + dir.normalized * (Hall.SeatDist + .35f) + Quaternion.Euler(0, 90, 0) * dir.normalized * .45f;
                yield return Go(stand);
                yield return Face(o.spot);
                body.Serve(); yield return new WaitForSeconds(.6f);
                // yalnızca ikram masaya iner; tepsi kahvecide kalır
                item.SetParent(hall.Root, true); item.position = o.spot; item.rotation = Quaternion.Euler(0, Random.Range(0, 360), 0);
                Destroy(item.gameObject, 180);
                yield return new WaitForSeconds(.6f);
                if (queue.Count == 0) Destroy(tray.gameObject); else tray.gameObject.SetActive(false);
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
                _ => Props.TeaGlass(tray, Vector3.zero, true),
            };
            if (item == "oralet") Tint(t, new Color(.85f, .42f, .05f));
            if (item == "ayran") Tint(t, new Color(.95f, .95f, .92f));
            if (item == "su") Tint(t, new Color(.8f, .9f, 1f, .4f));
            t.localPosition = new Vector3(0, .007f, 0); t.localRotation = Quaternion.identity;
            return (tray, t);
        }
        static void Tint(Transform t, Color c)
        {
            foreach (var r in t.GetComponentsInChildren<Renderer>()) if (r.sharedMaterial == Props.Tea) { var m = new Material(Props.Tea) { color = c }; m.SetColor("_EmissionColor", c * .12f); r.sharedMaterial = m; }
        }
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
