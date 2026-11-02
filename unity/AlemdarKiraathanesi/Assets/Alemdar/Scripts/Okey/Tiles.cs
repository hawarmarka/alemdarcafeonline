// Okey taşı: krem gövde + renkli sayı + alt nokta. Okey (gösterge+1) arkası dönük düz taş görünür (web sürümüyle aynı).
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace Alemdar.Okey
{
    public class TileView : MonoBehaviour
    {
        public const float W = .03f, H = .044f, D = .0125f; // gerçek okey taşı oranları
        const float NumHeight = .032f, NumBottom = -.0093f, DotY = -.0146f;
        public string Id; public JToken Data; public int Slot = -1;
        public Vector3 Home; public Quaternion HomeRot;
        TextMesh num; Transform dot; static Material body, bodyBack;

        // gerçek okey takımındaki mürekkep renkleri (kırmızı, sarı/turuncu, mavi, siyah; sahte okey yeşil yonca)
        static Color Ink(string c) => c switch { "Kirmizi" => new Color(.84f, .06f, .09f), "Yesil" => new Color(.96f, .58f, .02f), "Mavi" => new Color(.03f, .27f, .72f), "Siyah" => new Color(.06f, .06f, .07f), _ => new Color(.05f, .5f, .22f) };

        public static TileView Make(Transform parent)
        {
            body ??= World.Props.M(new Color(.97f, .95f, .88f), .78f);   // parlak fildişi plastik
            bodyBack ??= World.Props.M(new Color(.95f, .92f, .84f), .72f);
            var g = GameObject.CreatePrimitive(PrimitiveType.Cube); g.name = "tas";
            g.transform.SetParent(parent, false); g.transform.localScale = Vector3.one;
            var mf = g.GetComponent<MeshFilter>(); mf.sharedMesh = SharedMesh();
            g.GetComponent<Renderer>().sharedMaterial = body;
            Object.Destroy(g.GetComponent<BoxCollider>()); var col = g.AddComponent<BoxCollider>(); col.size = new Vector3(W, H, D);
            var t = g.AddComponent<TileView>();
            // Bütün sayılar aynı boyda ve aynı alt çizgide (simetri); iki haneliler yalnızca yatayda daralır.
            t.num = World.Props.Text3D(g.transform, "", new Vector3(0, NumBottom, D / 2 + .0006f), 180, NumHeight, Color.black);
            t.num.anchor = TextAnchor.LowerCenter; t.num.fontStyle = FontStyle.Bold;
            t.num.fontSize = 192; t.num.characterSize = NumHeight / 19.2f; // yüksek çözünürlüklü yazı tipi: rakamlar keskin
            var d = GameObject.CreatePrimitive(PrimitiveType.Cylinder); Object.Destroy(d.GetComponent<Collider>());
            d.transform.SetParent(g.transform, false); d.transform.localPosition = new Vector3(0, DotY, D / 2 + .0003f); d.transform.localRotation = Quaternion.Euler(90, 0, 0); d.transform.localScale = new Vector3(.0058f, .0003f, .0058f);
            t.dot = d.transform;
            return t;
        }
        static Mesh mesh;
        static Mesh SharedMesh() => mesh ? mesh : mesh = RoundedBox(new Vector3(W, H, D), .0028f, 5);

        // Yuvarlatılmış kenarlı kutu: alt bölümlü küpün her noktası iç kutuya kırpılıp yarıçap kadar dışarı itilir.
        public static Mesh RoundedBox(Vector3 size, float r, int n)
        {
            var half = size / 2; var inner = half - Vector3.one * r;
            var verts = new System.Collections.Generic.List<Vector3>(); var norms = new System.Collections.Generic.List<Vector3>(); var tris = new System.Collections.Generic.List<int>();
            Vector3[] dirs = { Vector3.right, Vector3.left, Vector3.up, Vector3.down, Vector3.forward, Vector3.back };
            foreach (var f in dirs)
            {
                var u = Mathf.Abs(f.y) > .5f ? Vector3.right : Vector3.Cross(f, Vector3.up).normalized; var v = Vector3.Cross(u, f);
                int b = verts.Count;
                for (int j = 0; j <= n; j++) for (int i = 0; i <= n; i++)
                {
                    var p = Vector3.Scale(f + u * (i / (float)n * 2 - 1) + v * (j / (float)n * 2 - 1), half);
                    var c = new Vector3(Mathf.Clamp(p.x, -inner.x, inner.x), Mathf.Clamp(p.y, -inner.y, inner.y), Mathf.Clamp(p.z, -inner.z, inner.z));
                    var nrm = (p - c).normalized; verts.Add(c + nrm * r); norms.Add(nrm);
                }
                for (int j = 0; j < n; j++) for (int i = 0; i < n; i++)
                {
                    int a = b + j * (n + 1) + i, a1 = a + 1, a2 = a + n + 1, a3 = a2 + 1;
                    tris.AddRange(new[] { a, a2, a1, a1, a2, a3 });
                }
            }
            var m = new Mesh { name = "yuvarlakKutu" }; m.SetVertices(verts); m.SetNormals(norms); m.SetTriangles(tris, 0); m.RecalculateBounds();
            // yön tutarlılığı: üçgen yüzü normalle ters ise çevir
            var t = m.triangles; var vs = m.vertices; var ns = m.normals;
            for (int k = 0; k < t.Length; k += 3) { var fn = Vector3.Cross(vs[t[k + 1]] - vs[t[k]], vs[t[k + 2]] - vs[t[k]]); if (Vector3.Dot(fn, ns[t[k]]) < 0) (t[k + 1], t[k + 2]) = (t[k + 2], t[k + 1]); }
            m.triangles = t;
            return m;
        }

        // tile null → sırtı dönük (rakip, deste). isOkey → okey: düz arka yüz.
        public void Set(JToken tile, bool isOkey)
        {
            Data = tile; Id = (string)tile?["id"];
            bool face = tile != null && !isOkey;
            GetComponent<Renderer>().sharedMaterial = face ? body : bodyBack;
            num.gameObject.SetActive(face); dot.gameObject.SetActive(face);
            if (!face) return;
            bool fake = (bool?)tile["isFakeJoker"] == true;
            var c = Ink((string)tile["color"]);
            num.text = fake ? "♣" : ((int)tile["number"]).ToString(); num.color = c;
            num.transform.localScale = new Vector3(num.text.Length > 1 ? .7f : 1f, 1, 1); // iki hane: aynı boy, dar yazı
            dot.GetComponent<Renderer>().sharedMaterial = DotMat(c);
        }
        static readonly System.Collections.Generic.Dictionary<Color, Material> dots = new();
        static Material DotMat(Color c) { if (!dots.TryGetValue(c, out var m)) dots[c] = m = World.Props.M(c, .4f); return m; }

        public static bool IsOkey(JToken t, JToken okey) => t != null && okey != null && (bool?)t["isFakeJoker"] != true && (string)t["color"] == (string)okey["color"] && (int)t["number"] == (int)okey["number"];
    }

    // Masadaki seri/per: işlemek için sürüklenen taş bunun üstüne bırakılır.
    public class GroupDrop : MonoBehaviour { public int Owner, Index; public bool Pairs; }
    public class ClickZone : MonoBehaviour { public string Kind; }
}
