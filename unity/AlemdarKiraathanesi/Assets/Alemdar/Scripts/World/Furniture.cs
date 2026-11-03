// Kıraathane mobilyası ve oyun takımları (kendi çizimimiz, Poly Haven CC0 dokularıyla):
// bükme ahşap (Thonet tarzı) hasır oturaklı sandalye, çuha kaplı pahlı ahşap oyun masası, tornalı ayaklar, tabure,
// iki katlı ceviz ıstaka, yuvarlak köşeli iskambil kâğıdı, domino taşı, ceviz tavla. Ağlar bir kez üretilir, paylaşılır.
using System.Collections.Generic;
using UnityEngine;

namespace Alemdar.World
{
    public static class Furniture
    {
        static Material walnut, walnutDark, cane, felt, brass;
        public static Material Walnut => walnut ??= Props.MN(new Color(.62f, .43f, .3f), .62f, Lib.I.darkWoodD, Lib.I.darkWoodN, new Vector2(1, 2), .6f);
        public static Material WalnutDark => walnutDark ??= Props.MN(new Color(.42f, .28f, .19f), .55f, Lib.I.darkWoodD, Lib.I.darkWoodN, new Vector2(1, 3), .6f);
        static Material Cane => cane ??= Props.M(Color.white, .25f, 0, Tex.Cane());
        static Material Brass => brass ??= Props.M(new Color(.8f, .62f, .32f), .75f, .9f);
        public static Material Felt => felt ??= Props.MN(new Color(.75f, 1f, .92f), .04f, Tex.Cloth(), Lib.I.fabricN, new Vector2(4, 4), .45f);

        static GameObject Mesh(Transform p, Mesh mesh, Material m, Vector3 pos, Quaternion rot, bool shadow = true)
        {
            var g = new GameObject("parca", typeof(MeshFilter), typeof(MeshRenderer)); g.transform.SetParent(p, false);
            g.transform.SetLocalPositionAndRotation(pos, rot);
            g.GetComponent<MeshFilter>().sharedMesh = mesh; var r = g.GetComponent<MeshRenderer>(); r.sharedMaterial = m;
            if (!shadow) r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            return g;
        }
        static readonly Dictionary<string, Mesh> cache = new();
        static Mesh Cached(string key, System.Func<Mesh> make) { if (!cache.TryGetValue(key, out var m)) cache[key] = m = make(); return m; }
        public static Mesh RBox(Vector3 size, float r) => Cached($"rb{size}{r}", () => Okey.TileView.RoundedBox(size, Mathf.Min(r, Mathf.Min(size.x, Mathf.Min(size.y, size.z)) * .49f), 3));
        public static GameObject RoundBox(Transform p, Vector3 size, float r, Material m, Vector3 pos, float ry = 0, bool shadow = true) => Mesh(p, RBox(size, r), m, pos, Quaternion.Euler(0, ry, 0), shadow);

        // Bükme boru: yol boyunca yuvarlak kesit (paralel taşıma çerçevesi). closed: halka.
        public static Mesh Tube(IList<Vector3> path, float radius, int sides = 10, bool closed = false, float endRadius = -1)
        {
            int n = path.Count; var v = new List<Vector3>(); var nr = new List<Vector3>(); var uv = new List<Vector2>(); var t = new List<int>();
            Vector3 prevN = Vector3.zero;
            for (int i = 0; i < n; i++)
            {
                var a = path[closed ? (i - 1 + n) % n : Mathf.Max(0, i - 1)]; var b = path[closed ? (i + 1) % n : Mathf.Min(n - 1, i + 1)];
                var tan = (b - a).normalized;
                var nn = i == 0 ? Vector3.Cross(tan, Mathf.Abs(tan.y) < .9f ? Vector3.up : Vector3.right).normalized : Vector3.Cross(Vector3.Cross(tan, prevN), tan).normalized;
                prevN = nn; var bn = Vector3.Cross(tan, nn);
                float r = endRadius < 0 ? radius : Mathf.Lerp(radius, endRadius, i / (float)(n - 1));
                for (int s = 0; s <= sides; s++)
                {
                    float ang = s / (float)sides * Mathf.PI * 2; var dir = nn * Mathf.Cos(ang) + bn * Mathf.Sin(ang);
                    v.Add(path[i] + dir * r); nr.Add(dir); uv.Add(new Vector2(s / (float)sides, i / (float)(n - 1) * 4));
                }
            }
            int segs = closed ? n : n - 1;
            for (int i = 0; i < segs; i++)
            {
                int i0 = i * (sides + 1), i1 = ((i + 1) % n) * (sides + 1);
                for (int s = 0; s < sides; s++) t.AddRange(new[] { i0 + s, i1 + s, i0 + s + 1, i0 + s + 1, i1 + s, i1 + s + 1 });
            }
            var m = new Mesh { name = "boru" }; m.SetVertices(v); m.SetNormals(nr); m.SetUVs(0, uv); m.SetTriangles(t, 0);
            FixWinding(m); m.RecalculateBounds(); return m;
        }
        static void FixWinding(Mesh m)
        {
            var t = m.triangles; var vs = m.vertices; var ns = m.normals;
            for (int k = 0; k < t.Length; k += 3) { var fn = Vector3.Cross(vs[t[k + 1]] - vs[t[k]], vs[t[k + 2]] - vs[t[k]]); if (Vector3.Dot(fn, ns[t[k]] + ns[t[k + 1]] + ns[t[k + 2]]) < 0) (t[k + 1], t[k + 2]) = (t[k + 2], t[k + 1]); }
            m.triangles = t;
        }
        static List<Vector3> Bezier(Vector3 a, Vector3 b, Vector3 c, Vector3 d, int steps)
        {
            var l = new List<Vector3>();
            for (int i = 0; i <= steps; i++) { float s = i / (float)steps, u = 1 - s; l.Add(u * u * u * a + 3 * u * u * s * b + 3 * u * s * s * c + s * s * s * d); }
            return l;
        }
        static List<Vector3> Circle(Vector3 c, float r, int n) { var l = new List<Vector3>(); for (int i = 0; i < n; i++) { float a = i / (float)n * Mathf.PI * 2; l.Add(c + new Vector3(Mathf.Cos(a) * r, 0, Mathf.Sin(a) * r)); } return l; }
        // Yatay daire, düzlemsel doku koordinatı (hasır, kumaş): yukarı bakar.
        static Mesh Disc(float r, float y, float tiling, int seg = 40)
        {
            var v = new List<Vector3> { new Vector3(0, y, 0) }; var uv = new List<Vector2> { new Vector2(.5f, .5f) * tiling }; var t = new List<int>();
            for (int i = 0; i < seg; i++) { float a = -i / (float)seg * Mathf.PI * 2; var q = new Vector3(Mathf.Cos(a) * r, y, Mathf.Sin(a) * r); v.Add(q); uv.Add(new Vector2(q.x / r * .5f + .5f, q.z / r * .5f + .5f) * tiling); }
            for (int i = 0; i < seg; i++) t.AddRange(new[] { 0, 1 + i, 1 + (i + 1) % seg });
            var m = new Mesh { name = "disk" }; m.SetVertices(v); m.SetUVs(0, uv); m.SetTriangles(t, 0); m.RecalculateNormals();
            if (m.normals[0].y < 0) { var tt = m.triangles; for (int k = 0; k < tt.Length; k += 3) (tt[k + 1], tt[k + 2]) = (tt[k + 2], tt[k + 1]); m.triangles = tt; m.RecalculateNormals(); }
            m.RecalculateBounds(); return m;
        }
        static Mesh LatheS(string key, Vector2[] prof, int seg = 24) => Cached(key, () => { var m = Props.Lathe(prof, seg); m.name = key; return m; });

        // ---------- sandalye: bükme ahşap, yuvarlak hasır oturak, sırtı tek parça kavis + iç halka. Yerel -z masaya bakar. ----------
        static Mesh chairFrame, chairInner, chairRing, chairFrontLeg;
        public static Transform Chair(Transform p, Vector3 pos, float ry)
        {
            var c = new GameObject("sandalye").transform; c.SetParent(p, false); c.SetLocalPositionAndRotation(pos, Quaternion.Euler(0, ry, 0));
            const float seatY = .46f;
            if (!chairFrame)
            {
                // arka ayaklar sırta kadar tek parça: yerden oturağa, oradan geriye yatık yükselip üstte kavisle birleşir
                var path = new List<Vector3>();
                var left = Bezier(new Vector3(-.17f, 0, .22f), new Vector3(-.16f, .25f, .17f), new Vector3(-.165f, .5f, .14f), new Vector3(-.17f, .72f, .2f), 10);
                var leftUp = Bezier(new Vector3(-.17f, .72f, .2f), new Vector3(-.175f, .86f, .235f), new Vector3(-.15f, .98f, .25f), new Vector3(0, 1f, .255f), 8);
                path.AddRange(left); path.AddRange(leftUp.GetRange(1, leftUp.Count - 1));
                var right = new List<Vector3>(path); right.Reverse(); for (int i = 0; i < right.Count; i++) right[i] = new Vector3(-right[i].x, right[i].y, right[i].z);
                path.AddRange(right.GetRange(1, right.Count - 1));
                chairFrame = Tube(path, .015f, 10);
                // iç halka: sırtın ortasında oval
                var inner = new List<Vector3>();
                for (int i = 0; i < 24; i++) { float a = i / 24f * Mathf.PI * 2; inner.Add(new Vector3(Mathf.Cos(a) * .1f, .76f + Mathf.Sin(a) * .13f, .2f + Mathf.Sin(a) * .025f)); }
                chairInner = Tube(inner, .009f, 8, true);
                chairRing = Tube(Circle(new Vector3(0, .2f, -.005f), .17f, 28), .009f, 8, true);
                chairFrontLeg = Tube(new[] { new Vector3(0, 0, 0), new Vector3(0, seatY - .02f, 0) }, .0145f, 10, false, .019f);
            }
            var wood = WalnutDark;
            Mesh(c, chairFrame, wood, Vector3.zero, Quaternion.identity);
            Mesh(c, chairInner, wood, Vector3.zero, Quaternion.identity);
            Mesh(c, chairRing, wood, Vector3.zero, Quaternion.identity, false);
            foreach (float x in new[] { -.15f, .15f })
            {
                var leg = Mesh(c, chairFrontLeg, wood, new Vector3(x * 1.08f, 0, -.17f), Quaternion.Euler(-3, 0, -x * 18)); // hafif dışa açık
            }
            // oturak: ahşap çember + hasır
            Mesh(c, LatheS("oturak", new[] { new Vector2(.0f, seatY - .03f), new Vector2(.19f, seatY - .03f), new Vector2(.205f, seatY - .022f), new Vector2(.208f, seatY), new Vector2(.2f, seatY + .012f), new Vector2(.18f, seatY + .012f), new Vector2(.18f, seatY + .004f), new Vector2(0, seatY + .004f) }, 32), wood, new Vector3(0, 0, -.005f), Quaternion.identity);
            Mesh(c, Cached("hasir", () => Disc(.181f, seatY + .0065f, 3.2f)), Cane, new Vector3(0, 0, -.005f), Quaternion.identity, false); // düz (gezegen gibi halka değil) örgü
            return c;
        }

        // ---------- tabure: yuvarlak ahşap oturak, üç tornalı ayak, ara halka ----------
        public static void Stool(Transform p, Vector3 pos)
        {
            var g = new GameObject("tabure").transform; g.SetParent(p, false); g.localPosition = pos;
            Mesh(g, LatheS("tabureUst", new[] { new Vector2(0, .48f), new Vector2(.15f, .48f), new Vector2(.165f, .495f), new Vector2(.16f, .515f), new Vector2(0, .52f) }, 28), Walnut, Vector3.zero, Quaternion.identity);
            Mesh(g, Cached("tabureYuz", () => Disc(.158f, .5205f, 1f)), Walnut, Vector3.zero, Quaternion.identity, false); // üst yüz: düz ahşap damarı
            var leg = Cached("tabureAyak", () => Tube(new[] { new Vector3(.13f, 0, 0), new Vector3(.08f, .48f, 0) }, .016f, 8, false, .02f));
            for (int k = 0; k < 3; k++) Mesh(g, leg, WalnutDark, Vector3.zero, Quaternion.Euler(0, k * 120, 0));
            Mesh(g, Cached("tabureHalka", () => Tube(Circle(new Vector3(0, .2f, 0), .113f, 24), .008f, 6, true)), WalnutDark, Vector3.zero, Quaternion.identity, false);
        }

        // ---------- oyun masası: çuha kaplı üst, pahlı ceviz çerçeve, etek, tornalı ayaklar, köşelerde yuvarlak bardaklık ----------
        public static Transform Table(Transform p, Vector3 pos)
        {
            var t = new GameObject("masa").transform; t.SetParent(p, false); t.localPosition = pos;
            float S = Props.TableSize, T = Props.TableTop, rim = .04f;
            Props.Box(t, new Vector3(S - rim * 1.5f, .02f, S - rim * 1.5f), Felt, new Vector3(0, T - .01f, 0));                       // çuha (üst yüzü T)
            Props.Box(t, new Vector3(S - .02f, .03f, S - .02f), WalnutDark, new Vector3(0, T - .035f, 0), 0, false, false);           // tabla
            for (int i = 0; i < 4; i++)
            {
                var q = Quaternion.Euler(0, i * 90, 0);
                var bar = Mesh(t, RBox(new Vector3(S + .01f, .036f, rim), .012f), Walnut, q * new Vector3(0, T - .004f, S / 2 - rim / 2 + .005f), q);  // pahlı kenar (çuhadan 1,4 cm yüksek)
                Mesh(t, RBox(new Vector3(S - .16f, .085f, .022f), .008f), WalnutDark, q * new Vector3(0, T - .09f, S / 2 - .07f), q, false);               // etek
            }
            // tornalı ayaklar: kaide, ince boyun, şişkin gövde, ayak ucu
            var legProf = new[] { new Vector2(0, 0), new Vector2(.022f, 0), new Vector2(.026f, .03f), new Vector2(.02f, .08f), new Vector2(.03f, .2f), new Vector2(.034f, .34f), new Vector2(.026f, .46f),
                                  new Vector2(.021f, .52f), new Vector2(.03f, .56f), new Vector2(.03f, .58f), new Vector2(.036f, .6f), new Vector2(.036f, T - .12f), new Vector2(.04f, T - .1f), new Vector2(.04f, T - .05f), new Vector2(0, T - .05f) };
            var legMesh = LatheS("masaAyak", legProf, 16);
            for (int x = -1; x <= 1; x += 2) for (int z = -1; z <= 1; z += 2) Mesh(t, legMesh, Walnut, new Vector3(x * (S / 2 - .085f), 0, z * (S / 2 - .085f)), Quaternion.identity);
            var col = t.gameObject.AddComponent<BoxCollider>(); col.center = new Vector3(0, T / 2, 0); col.size = new Vector3(S + .04f, T, S + .04f);
            // köşelerde yuvarlak bardaklık: pirinç kollu ahşap tabla (çay, kahve, küllük buraya konur)
            var dish = LatheS("bardaklik", new[] { new Vector2(0, -.012f), new Vector2(.07f, -.012f), new Vector2(.078f, -.004f), new Vector2(.08f, .006f), new Vector2(.072f, .006f), new Vector2(.07f, 0), new Vector2(0, 0) }, 28);
            for (int i = 0; i < 4; i++)
            {
                var cp = Quaternion.Euler(0, i * 90, 0) * new Vector3(Props.CornerOut, 0, Props.CornerOut);
                Mesh(t, dish, Walnut, cp + new Vector3(0, T, 0), Quaternion.identity);
                var arm = Props.Box(t, new Vector3(.03f, .01f, .14f), Brass, Quaternion.Euler(0, i * 90, 0) * new Vector3(Props.CornerOut - .055f, 0, Props.CornerOut - .055f) + new Vector3(0, T - .018f, 0));
                arm.transform.localRotation = Quaternion.Euler(0, i * 90 + 45, 0);
            }
            return t;
        }

        // ---------- ıstaka: ceviz, iki kat (alt raf + bir basamak yukarıda üst raf), yuvarlatılmış kenarlar. Yerel +z oyuncuya. ----------
        public static void Rack(Transform r, float len, float lean)
        {
            var w = Walnut; var d = WalnutDark;
            Mesh(r, RBox(new Vector3(len, .014f, .13f), .006f), w, new Vector3(0, .007f, 0), Quaternion.identity);                          // taban
            Mesh(r, RBox(new Vector3(len, .012f, .01f), .004f), d, new Vector3(0, .02f, .062f), Quaternion.identity);                       // ön kenar (alt sıra dayanır)
            Mesh(r, RBox(new Vector3(len, .036f, .05f), .006f), w, new Vector3(0, .032f, -.04f), Quaternion.identity);                      // arka basamak
            Mesh(r, RBox(new Vector3(len, .009f, .007f), .003f), d, new Vector3(0, .054f, -.013f), Quaternion.identity);                    // üst sıra kenarı
            Mesh(r, RBox(new Vector3(len, .03f, .012f), .005f), w, new Vector3(0, .063f, -.062f), Quaternion.Euler(lean, 0, 0));            // sırt
            foreach (float x in new[] { -len / 2, len / 2 }) Mesh(r, RBox(new Vector3(.014f, .064f, .132f), .006f), d, new Vector3(x, .032f, 0), Quaternion.identity); // uçlar
            Mesh(r, RBox(new Vector3(len - .02f, .002f, .1f), .001f), Felt, new Vector3(0, .0145f, .012f), Quaternion.identity, false);    // alt rafta çuha şerit
        }

        // ---------- iskambil kâğıdı: yuvarlak köşeli ince kart; yüzde köşe indeksi ve ortada büyük simge ----------
        static Material cardBack, cardFace;
        public static void Card(Transform p, Vector3 pos, float ry, string face)
        {
            cardBack ??= Props.M(Color.white, .45f, 0, Tex.CardBack());
            cardFace ??= Props.M(new Color(.99f, .98f, .96f), .4f);
            var g = new GameObject("kagit").transform; g.SetParent(p, false); g.SetLocalPositionAndRotation(pos, Quaternion.Euler(0, ry, 0));
            Mesh(g, RBox(new Vector3(.058f, .0009f, .088f), .0004f), cardFace, Vector3.zero, Quaternion.identity, false);
            if (face == null)
            {
                Mesh(g, Cached("kartArka", () => RoundedQuad(.054f, .084f, .005f)), cardBack, new Vector3(0, .00048f, 0), Quaternion.identity, false);
                return;
            }
            bool red = face[0] == '♥' || face[0] == '♦'; var ink = red ? new Color(.8f, .08f, .1f) : new Color(.08f, .08f, .1f);
            string suit = face.Substring(0, 1), rank = face.Substring(1);
            void T(string s, Vector3 at, float h, float rot) { var tm = Props.Text3D(g, s, at, 0, h, ink); tm.transform.localRotation = Quaternion.Euler(90, rot, 0); }
            T(suit, new Vector3(0, .0006f, 0), .034f, 180);
            T(rank, new Vector3(.019f, .0006f, -.033f), .013f, 180); T(suit, new Vector3(.019f, .0006f, -.024f), .009f, 180);
            T(rank, new Vector3(-.019f, .0006f, .033f), .013f, 0); T(suit, new Vector3(-.019f, .0006f, .024f), .009f, 0);
        }
        // yatay, yuvarlak köşeli ince yüzey (kart arkası deseni): yukarı bakar
        static Mesh RoundedQuad(float w, float h, float r)
        {
            var pts = new List<Vector3>();
            for (int c = 0; c < 4; c++)
            {
                var ctr = new Vector3((c == 0 || c == 3 ? 1 : -1) * (w / 2 - r), 0, (c < 2 ? 1 : -1) * (h / 2 - r));
                for (int k = 0; k <= 4; k++) { float a = (c * 90 + k * 22.5f) * Mathf.Deg2Rad; pts.Add(ctr + new Vector3(Mathf.Cos(a) * r, 0, Mathf.Sin(a) * r)); }
            }
            var v = new List<Vector3> { Vector3.zero }; v.AddRange(pts);
            var uv = new List<Vector2>(); foreach (var q in v) uv.Add(new Vector2(q.x / w + .5f, q.z / h + .5f));
            var t = new List<int>(); for (int i = 1; i <= pts.Count; i++) t.AddRange(new[] { 0, i % pts.Count + 1, i });
            var m = new Mesh(); m.SetVertices(v); m.SetUVs(0, uv); m.SetTriangles(t, 0); m.RecalculateNormals();
            if (m.normals[0].y < 0) { var tt = m.triangles; for (int k = 0; k < tt.Length; k += 3) (tt[k + 1], tt[k + 2]) = (tt[k + 2], tt[k + 1]); m.triangles = tt; m.RecalculateNormals(); }
            m.RecalculateBounds(); return m;
        }

        // ---------- domino: fildişi, yuvarlak köşeli; üst yüzde iki yarı ve noktalar (doku), ortada pirinç çivi ----------
        static readonly Dictionary<int, Material> dominoFaces = new();
        static Material ivory, ebony;
        public static void DominoFlat(Transform p, Vector3 pos, float ry, int a, int b)
        {
            int key = a * 7 + b;
            if (!dominoFaces.TryGetValue(key, out var face)) dominoFaces[key] = face = Props.M(Color.white, .7f, 0, Tex.Domino(a, b));
            ivory ??= Props.M(new Color(.96f, .94f, .88f), .72f);
            var g = new GameObject("domino").transform; g.SetParent(p, false); g.SetLocalPositionAndRotation(pos, Quaternion.Euler(0, ry, 0));
            Mesh(g, RBox(new Vector3(.03f, .011f, .06f), .0025f), ivory, new Vector3(0, .0055f, 0), Quaternion.identity);
            Props.Quad(g, new Vector2(.027f, .057f), face, new Vector3(0, .01105f, 0), Quaternion.Euler(90, 0, 0)).GetComponent<Renderer>().shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            Props.Cyl(g, .0022f, .0004f, Brass, new Vector3(0, .0112f, 0));
        }
        public static void DominoStanding(Transform p, Vector3 pos, float ry)
        {
            ebony ??= Props.M(new Color(.07f, .06f, .06f), .75f);
            ivory ??= Props.M(new Color(.96f, .94f, .88f), .72f);
            var g = new GameObject("domino_ayakta").transform; g.SetParent(p, false); g.SetLocalPositionAndRotation(pos, Quaternion.Euler(0, ry, 0));
            Mesh(g, RBox(new Vector3(.03f, .06f, .011f), .0025f), ivory, new Vector3(0, .03f, 0), Quaternion.identity);
            Mesh(g, RBox(new Vector3(.03f, .06f, .004f), .0015f), ebony, new Vector3(0, .03f, -.0045f), Quaternion.identity, false); // arka yüz siyah: sırtı rakibe
        }

        // ---------- tavla: ceviz kutu (iki kanat), kenar çıtaları, kakmalı tahta, pullar (kenarı tırtıklı), zarlar ----------
        public static Transform Backgammon(Transform p, Vector3 pos, float ry)
        {
            var g = new GameObject("tavla").transform; g.SetParent(p, false); g.SetLocalPositionAndRotation(pos, Quaternion.Euler(0, ry, 0));
            Mesh(g, RBox(new Vector3(.54f, .02f, .41f), .006f), Walnut, new Vector3(0, .01f, 0), Quaternion.identity);
            foreach (float z in new[] { -.197f, .197f }) Mesh(g, RBox(new Vector3(.54f, .03f, .016f), .006f), WalnutDark, new Vector3(0, .02f, z), Quaternion.identity);
            foreach (float x in new[] { -.262f, .262f, 0f }) Mesh(g, RBox(new Vector3(x == 0 ? .022f : .016f, .03f, .41f), .006f), WalnutDark, new Vector3(x, .02f, 0), Quaternion.identity);
            foreach (float x in new[] { -.13f, .13f }) Props.Quad(g, new Vector2(.235f, .374f), Props.M(Color.white, .5f, 0, Tex.BackgammonBoard()), new Vector3(x, .0205f, 0), Quaternion.Euler(90, 0, 0)).GetComponent<Renderer>().shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            foreach (float x in new[] { -.15f, .15f }) Props.Box(g, new Vector3(.03f, .006f, .012f), Brass, new Vector3(x, .03f, -.205f), 0, false, false); // menteşeler
            return g;
        }
        public static void Checker(Transform p, Vector3 pos, bool white)
        {
            var m = white ? (chW ??= Props.M(new Color(.93f, .9f, .82f), .7f)) : (chB ??= Props.M(new Color(.32f, .07f, .06f), .7f));
            Mesh(p, LatheS("pul", new[] { new Vector2(0, 0), new Vector2(.0125f, 0), new Vector2(.0135f, .002f), new Vector2(.0135f, .005f), new Vector2(.0125f, .007f), new Vector2(.009f, .007f), new Vector2(.0085f, .006f), new Vector2(0, .006f) }, 20), m, pos, Quaternion.identity);
        }
        static Material chW, chB;
        static readonly Dictionary<int, Material> dice = new();
        public static void Die(Transform p, Vector3 pos, float ry, int n)
        {
            if (!dice.TryGetValue(n, out var m)) dice[n] = m = Props.M(Color.white, .6f, 0, Tex.Die(n));
            Mesh(p, RBox(new Vector3(.014f, .014f, .014f), .0025f), m, pos, Quaternion.Euler(0, ry, 0));
        }
    }
}
