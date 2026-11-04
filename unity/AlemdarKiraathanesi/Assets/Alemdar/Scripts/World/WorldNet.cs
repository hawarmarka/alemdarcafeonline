// Salondaki diğer oyuncular: 'world:state' (8/sn) ile gelir, ara değerleme ile yumuşak yürür; oturanlar sandalyede oturur.
// Kendi konumumuz değiştikçe ≤9/sn 'world:move' gider.
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace Alemdar.World
{
    public class WorldNet : MonoBehaviour
    {
        class Remote { public Chars.Person p; public Vector3 pos, target; public float ry, targetRy, speed; public string pose; }
        readonly Dictionary<string, Remote> remotes = new();
        public string MyId { get; private set; }
        public int Online { get; private set; }
        public System.Func<string, bool> Hidden = _ => false; // masada oyun nesnesi olarak çizilenler (çift görünmesin)
        public Chars.Person PersonNamed(string name) { foreach (var r in remotes.Values) if (r.p && r.p.Display == name && r.p.gameObject.activeSelf) return r.p; return null; }
        Net.SocketIO io; Chars.PlayerMotor me; float lastSend; string lastSig;

        public void Init(Net.SocketIO socket, Chars.PlayerMotor motor, string name)
        {
            io = socket; me = motor;
            io.On("world:welcome", d => MyId = (string)d["id"]);
            io.On("world:state", OnState);
            io.On("world:notice", d => UI.Ui.Toast((string)d["message"]));
            io.On("world:full", d => UI.Ui.Toast((string)d["message"], 5));
            System.Action enter = () => io.Emit("world:enter", new { name });
            io.OnConnect += enter; if (io.Connected) enter();
        }

        void OnState(JToken d)
        {
            var list = (JArray)d["list"]; Online = list.Count;
            var seen = new HashSet<string>();
            foreach (var row in list)
            {
                string id = (string)row[0]; if (id == MyId) continue;
                string name = (string)row[1]; seen.Add(id);
                if (!remotes.TryGetValue(id, out var r))
                {
                    var go = new GameObject("Uzak_" + name);
                    r = new Remote { p = Chars.Person.Create(name, go.transform) };
                    r.pos = r.target = new Vector3((float)row[2], 0, (float)row[3]); r.ry = r.targetRy = (float)row[4] * Mathf.Rad2Deg + 180;
                    go.transform.SetPositionAndRotation(r.pos, Quaternion.Euler(0, r.ry, 0));
                    remotes[id] = r;
                }
                // sunucudaki açı web (three.js) kuralında: ileri = -z; Unity'de ileri = +z → 180° fark
                r.target = new Vector3((float)row[2], 0, (float)row[3]); r.targetRy = (float)row[4] * Mathf.Rad2Deg + 180;
                r.pose = (string)row[5]; r.speed = (float)row[6];
                r.p.SetSit(r.pose == "sit");
                r.p.gameObject.SetActive(!Hidden(name));
            }
            foreach (var id in new List<string>(remotes.Keys)) if (!seen.Contains(id)) { Destroy(remotes[id].p.transform.parent.gameObject); remotes.Remove(id); }
        }

        void Update()
        {
            float k = 1 - Mathf.Exp(-Time.deltaTime * 10);
            foreach (var r in remotes.Values)
            {
                r.pos = Vector3.Lerp(r.pos, r.target, k); r.ry = Mathf.LerpAngle(r.ry, r.targetRy, k);
                var t = r.p.transform.parent; t.SetPositionAndRotation(r.pos, Quaternion.Euler(0, r.ry, 0));
                r.p.SetSpeed(r.pose == "walk" ? r.speed : 0);
            }
            if (!me || io == null || !io.Connected) return;
            if (Time.time - lastSend < .11f) return;
            var pos = me.transform.position; float ry = (me.transform.eulerAngles.y - 180) * Mathf.Deg2Rad;
            string pose = me.Seated ? "sit" : me.Speed > .1f ? "walk" : "stand";
            string sig = $"{pos.x:0.00},{pos.z:0.00},{ry:0.00},{pose}";
            if (sig == lastSig && Time.time - lastSend < 2f) return;
            lastSig = sig; lastSend = Time.time;
            io.Emit("world:move", new { x = pos.x, z = pos.z, ry, pose, speed = me.Speed });
        }
    }
}
