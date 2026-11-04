// Mahalle: kıraathanenin üstünde 4 katlı apartman, iki yanda komşu apartmanlar (bakkal), kilit taşı kaldırım, asfalt yol,
// karşıda park (ağaçlar, banklar, lambalar) ve çay bahçesi; pencerede dedikodu yapan teyzeler.
// Koordinat: +z sokağa doğru. Teras önü Hall.TerraceZ; yol 11..18; park 20.5..42.
using System.Collections.Generic;
using UnityEngine;

namespace Alemdar.World
{
    public static class Neighborhood
    {
        public const float MinX = -26, MaxX = 26, MaxZ = 42, RoadZ0 = 11, RoadZ1 = 18, ParkZ0 = 20.5f;
        public static readonly List<(Vector3 pos, Quaternion rot)> Seats = new(); // oturulabilir yerler (bank, çay bahçesi sandalyesi)
        public static readonly List<Light> Lamps = new();                          // gece yanan sokak lambaları
        public static Transform Root { get; private set; }
        public static MeshRenderer LawnRenderer;                                           // çim kartları (düşük grafikte kapanır)
        static Material leaves, bark;

        public static void Build(Transform parent)
        {
            Root = new GameObject("Mahalle").transform; Root.SetParent(parent, false);
            var people = new GameObject("MahalleInsanlari").transform; people.SetParent(parent, false);
            var L = Lib.I;
            Ground();
            // bizim apartman: kıraathanenin üstü (4 kat); solda ve sağda komşular
            var beige = Apartment.Plaster("beige_wall_001", new Color(1f, .97f, .9f), 14, 12);
            var blue = Apartment.Plaster("blue_plaster_weathered", Color.white, 12, 15);
            var pink = Apartment.Plaster("beige_wall_002", new Color(1f, .88f, .84f), 12, 12);
            var cream = Apartment.Plaster("clay_plaster", new Color(1f, .96f, .86f), 12, 15);
            Apartment.Build(Root, -6.8f, 6.8f, -6.4f, 5.2f, Hall.Height + .2f, 4, beige, 1, false, null);
            Apartment.Build(Root, -19f, -7f, -6.4f, 5.2f, 3.4f, 4, blue, 2, true, new[] { "-", "TUHAFİYE" }, null);
            Apartment.Build(Root, 7f, 19f, -6.4f, 5.2f, 3.4f, 3, pink, 3, true, new[] { "BAKKAL", "-" }, null);
            Apartment.Build(Root, -31f, -23.2f, -6.4f, 5.2f, 3.4f, 5, cream, 4, true, new[] { "-", "-" }, null);
            Apartment.BuildKit(Root, 23.2f, 31f, -6.4f, 5.2f, 3.4f, 3, cream, 5, new[] { "BERBER", "-" }); // modern apartman (Apartment Kit cephesi)
            // parkın arkasındaki sıra (yüzü parka bakar)
            var back = new GameObject("arkaSira").transform; back.SetParent(Root, false); back.localPosition = new Vector3(0, 0, MaxZ + 2f); back.localRotation = Quaternion.Euler(0, 180, 0);
            Apartment.Build(back, -28f, -10f, -8f, 0f, 3.2f, 4, pink, 6, true, new[] { "-", "-", "-" }, null);
            Apartment.Build(back, -9.6f, 9.6f, -8f, 0f, 3.2f, 5, cream, 7, true, new[] { "-", "-", "-" }, null);
            Apartment.Build(back, 10f, 28f, -8f, 0f, 3.2f, 4, blue, 8, true, new[] { "-", "-", "-" }, null);
            EndBlocks(pink, blue, cream, beige);
            Alleys(pink, blue, cream, beige);
            Street(); Bakkal(); Park(); Lawn(); TeaGarden();
            Gossip(people);
            Playground.Build(Root, people); // salıncak, kaydırak, kum havuzu ve oynayan çocuklar
            Walls();
        }

        // ---------- zemin: kaldırım, bordür, yol, park toprağı ----------
        static Material Tex(string id, Vector2 tiling, float smooth = .15f) => Props.MN(Color.white, smooth, Lib.I.T(id, "diff"), Lib.I.T(id, "nor"), tiling, .8f);
        static void Slab(Material m, float x0, float x1, float z0, float z1, float top, float thick = .3f)
            => Props.Box(Root, new Vector3(x1 - x0, thick, z1 - z0), Props.Tiled(m, new Vector2((x1 - x0) / 2f, (z1 - z0) / 2f)), new Vector3((x0 + x1) / 2, top - thick / 2, (z0 + z1) / 2), 0, true);
        static void Ground()
        {
            var walk = Tex("brick_pavement_02", Vector2.one); var road = Tex("asphalt_02", Vector2.one, .25f);
            var curb = Tex("concrete_pavement", Vector2.one); var soil = Props.MN(new Color(.62f, .86f, .45f), .05f, Lib.I.T("leafy_grass", "diff"), Lib.I.T("leafy_grass", "nor"), Vector2.one, .8f); // park çimeni: yeşile çekilmiş
            Slab(walk, MinX, -6.7f, 5.2f, RoadZ0, 0); Slab(walk, 6.7f, MaxX, 5.2f, RoadZ0, 0); Slab(walk, -6.7f, 6.7f, Hall.TerraceZ, RoadZ0, 0);
            Slab(curb, MinX - 6, MaxX + 6, RoadZ0 - .2f, RoadZ0, .02f); Slab(curb, MinX - 6, MaxX + 6, RoadZ1, RoadZ1 + .2f, .02f);
            Slab(road, MinX - 30, MaxX + 30, RoadZ0, RoadZ1, -.15f);
            Slab(walk, MinX - 6, MaxX + 6, RoadZ1 + .2f, ParkZ0, 0);
            Slab(soil, MinX, MaxX, ParkZ0, MaxZ, .01f);
            Slab(walk, -1.4f, 1.4f, ParkZ0, MaxZ, .03f); Slab(walk, MinX, MaxX, 29.2f, 31.6f, .03f); // park yolları
            // yolun yan uçları: sisle kaybolan sokak devamı
            Slab(walk, MinX - 30, MinX, 5.2f, RoadZ0, 0); Slab(walk, MaxX, MaxX + 30, 5.2f, RoadZ0, 0);
            // parkın yanları ve arkası: yan sokakların kaldırımı (uçlardaki binalara kadar)
            Slab(walk, MinX - 30, MinX - 6, RoadZ1 + .2f, ParkZ0, 0); Slab(walk, MaxX + 6, MaxX + 30, RoadZ1 + .2f, ParkZ0, 0);
            Slab(walk, MinX - 30, MinX, ParkZ0, MaxZ, 0); Slab(walk, MaxX, MaxX + 30, ParkZ0, MaxZ, 0);
            Slab(walk, MinX - 30, MaxX + 30, MaxZ, MaxZ + 2.5f, 0);
            Slab(Tex("grass_path_2", Vector2.one, .1f), 13.4f, MaxX - .2f, 33.2f, MaxZ - .1f, .02f); // çay bahçesi: çakıllı toprak
            // yol çizgisi (kesik)
            var line = Props.M(new Color(.92f, .9f, .82f), .2f);
            for (float x = MinX - 28; x < MaxX + 28; x += 4) Props.Box(Root, new Vector3(2f, .005f, .12f), line, new Vector3(x, -.148f, (RoadZ0 + RoadZ1) / 2), 0, false, false);
        }

        // ---------- dört yanı kapalı mahalle: sokağın iki ucunda yola dik apartmanlar (ortada yolun geçtiği boşluk),
        // boşluğun gerisinde, sisin içinde karşı sıra. Sokak boş ufka açılmaz.
        static void EndBlocks(params Material[] walls)
        {
            Transform Side(float x, float ry) { var t = new GameObject("ucSira").transform; t.SetParent(Root, false); t.localPosition = new Vector3(x, 0, 0); t.localRotation = Quaternion.Euler(0, ry, 0); return t; }
            // solda yerel x = -dünya z, sağda yerel x = dünya z; yerel ön (+z) sokağın içine bakar
            var left = Side(MinX - 8, 90); var right = Side(MaxX + 8, -90);
            (float a, float b, int floors, string shop)[] segs = { (-6.4f, 10.2f, 4, "EKMEK FIRINI"), (18.8f, 31.2f, 5, "-"), (31.6f, 44.5f, 4, "-") };
            int s = 20;
            foreach (var (a, b, floors, shop) in segs)
            {
                Apartment.Build(left, -b, -a, -10f, 0f, 3.4f, floors, walls[s % walls.Length], s, true, new[] { shop == "-" ? "-" : "KUAFÖR", "-" }, null); s++;
                Apartment.Build(right, a, b, -10f, 0f, 3.4f, floors + (s % 2), walls[s % walls.Length], s, true, new[] { "-", shop }, null); s++;
            }
            // yolun geçtiği boşluğun gerisi (araba buradan gelip gider)
            Apartment.Build(Side(MinX - 36, 90), -24f, -6f, -10f, 0f, 3.4f, 4, walls[1], 40, true, new[] { "-", "-" }, null);
            Apartment.Build(Side(MaxX + 36, -90), 6f, 24f, -10f, 0f, 3.4f, 4, walls[2], 41, true, new[] { "-", "-" }, null);
        }

        // ---------- ara sokaklar: ana caddeden kıraathane sırasının arkasına giden iki dar sokak ----------
        // İki yanı sokağa bakan apartmanlar, dipte sokağı kapatan bir bina; kaldırım taşı, lamba, çöp kutusu ve sokak tabelası.
        public const float AlleyZ = -16f;
        public static readonly (float x0, float x1, string name)[] AlleyList = { (-23f, -19f, "ÇINAR SOKAK"), (19f, 23f, "MENEKŞE SOKAK") };
        static void Alleys(params Material[] walls)
        {
            var walk = Tex("brick_pavement_02", Vector2.one);
            int s = 60;
            foreach (var (x0, x1, name) in AlleyList)
            {
                Slab(walk, x0, x1, AlleyZ, 5.2f, 0);                                   // sokağın zemini (ana kaldırıma bağlanır)
                Slab(walk, x0 - 4, x1 + 4, AlleyZ - 1, AlleyZ, 0);
                // batı yakası: yüzü doğuya (sokağa); doğu yakası: yüzü batıya
                var west = new GameObject("araSokakBati").transform; west.SetParent(Root, false); west.localPosition = new Vector3(x0, 0, 0); west.localRotation = Quaternion.Euler(0, 90, 0);
                var east = new GameObject("araSokakDogu").transform; east.SetParent(Root, false); east.localPosition = new Vector3(x1, 0, 0); east.localRotation = Quaternion.Euler(0, -90, 0);
                Apartment.Build(west, 6.6f, AlleyZ * -1, -10f, 0f, 3.2f, 3 + s % 2, walls[s % walls.Length], s, true, new[] { "TERZİ", "-" }, null); s++;
                Apartment.Build(east, AlleyZ, -6.6f, -10f, 0f, 3.2f, 4 - s % 2, walls[s % walls.Length], s, true, new[] { "-", "KÖFTECİ" }, null); s++;
                // binaların zemin katı içi dolu: cephe (dükkânlar) dışında arkası boştu, sokaktan bakınca altlarından gökyüzü görünüyordu
                Props.Box(Root, new Vector3(9.7f, 3.3f, 9.4f), walls[(s + 1) % walls.Length], new Vector3(x0 - 5.15f, 1.65f, (AlleyZ - 6.6f) / 2), 0, true);
                Props.Box(Root, new Vector3(9.7f, 3.3f, 9.4f), walls[s % walls.Length], new Vector3(x1 + 5.15f, 1.65f, (AlleyZ - 6.6f) / 2), 0, true);
                Props.Box(Root, new Vector3(x1 - x0 + 8, 3.3f, 10.6f), walls[s % walls.Length], new Vector3((x0 + x1) / 2, 1.65f, AlleyZ - 5.6f), 0, true);
                // dipte sokağı kapatan apartman (yüzü caddeye)
                Apartment.Build(Root, x0 - 4, x1 + 4, AlleyZ - 11, AlleyZ, 3.2f, 4, walls[s % walls.Length], s, true, new[] { "-", "-" }, null); s++;
                float cx = (x0 + x1) / 2;
                Lamp("street_lamp_01", new Vector3(x0 + .45f, 0, -5.5f), 90);
                TrashCan(new Vector3(x1 - .5f, 0, -11.5f));
                // sokak tabelası: köşe binasının yan duvarında, caddeden okunur
                var sign = Props.Box(Root, new Vector3(.9f, .26f, .03f), Props.M(new Color(.1f, .25f, .55f), .3f), new Vector3(x0 + .02f, 2.6f, 4.4f), 90);
                Props.Text3D(Root, name, new Vector3(x0 + .04f, 2.6f, 4.4f), -90, .07f, Color.white);
                Props.Text3D(Root, name, new Vector3(x0 - .0f + .005f, 2.6f, 4.4f), 90, .07f, Color.white);
            }
        }

        // ---------- park çimeni: çim tutamları (alfa kesik çapraz kartlar), çit dibinde çalılar, saksılarda çiçek ----------
        static void Lawn()
        {
            var tuft = Props.Cutout(World.Tex.GrassTuft()); tuft.SetFloat("_Cutoff", .4f); tuft.enableInstancing = true; tuft.SetFloat("_Glossiness", .05f);
            var rng = new System.Random(7);
            bool Free(float x, float z) => Mathf.Abs(x) > 1.8f && (z < 28.9f || z > 31.9f)                       // park yolları
                && !(x > 12.8f && z > 32.6f)                                                                       // çay bahçesi
                && (new Vector2(x, z) - new Vector2(Playground.Center.x, Playground.Center.z)).sqrMagnitude > 25; // oyun alanı
            // bütün tutamlar tek bir ağda (tek çizim çağrısı); her tutam iki çapraz kart, iki yüzlü
            var verts = new List<Vector3>(); var uvs = new List<Vector2>(); var norms = new List<Vector3>(); var tris = new List<int>();
            int n = 0;
            for (int i = 0; i < 9000 && n < 2600; i++)
            {
                float x = MinX + .6f + (float)rng.NextDouble() * (MaxX - MinX - 1.2f), z = ParkZ0 + .5f + (float)rng.NextDouble() * (MaxZ - ParkZ0 - 1f);
                if (!Free(x, z)) continue;
                float s = .22f + (float)rng.NextDouble() * .2f, a = (float)rng.NextDouble() * 180f, hw = s * .9f, h = s * .75f; // kısa, sık çim
                foreach (float cross in new[] { 0f, 90f })
                    foreach (float side in new[] { 1f, -1f })
                    {
                        var rot = Quaternion.Euler(0, a + cross, 0); var r = rot * Vector3.right * hw; var nrm = rot * Vector3.back * side;
                        var p0 = new Vector3(x, .01f, z); int b0 = verts.Count;
                        verts.AddRange(new[] { p0 - r, p0 + r, p0 + r + Vector3.up * h, p0 - r + Vector3.up * h });
                        uvs.AddRange(new[] { new Vector2(0, 0), new Vector2(1, 0), new Vector2(1, 1), new Vector2(0, 1) });
                        var up = Vector3.Lerp(nrm, Vector3.up, .6f).normalized; norms.AddRange(new[] { up, up, up, up }); // yukarı eğik normal: çim yumuşak ışık alır
                        if (side > 0) tris.AddRange(new[] { b0, b0 + 2, b0 + 1, b0, b0 + 3, b0 + 2 }); else tris.AddRange(new[] { b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3 });
                    }
                n++;
            }
            var mesh = new Mesh { name = "cimen", indexFormat = UnityEngine.Rendering.IndexFormat.UInt32 };
            mesh.SetVertices(verts); mesh.SetUVs(0, uvs); mesh.SetNormals(norms); mesh.SetTriangles(tris, 0); mesh.RecalculateBounds();
            var lawn = new GameObject("cimen", typeof(MeshFilter), typeof(MeshRenderer)); lawn.transform.SetParent(Root, false);
            lawn.GetComponent<MeshFilter>().sharedMesh = mesh; var lr = lawn.GetComponent<MeshRenderer>(); lr.sharedMaterial = tuft;
            lr.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            LawnRenderer = lr; lr.enabled = !Quality.I || Quality.I.Level <= 1;            // çalılar: çitin dibinde, aralıklı
            var shrubRng = new System.Random(9);
            foreach (float x in new[] { -24f, -18f, -14.5f, -4.5f, 4.5f, 9f, 16f, 23f })
                Apartment.Place(Root, shrubRng.Next(2) == 0 ? "shrub_01" : "shrub_02", new Vector3(x, .01f, ParkZ0 + .9f), shrubRng.Next(360), .8f, false);
            foreach (float z in new[] { 24.5f, 34.5f, 39.5f })
            {
                Apartment.Place(Root, "shrub_02", new Vector3(MinX + .9f, .01f, z), shrubRng.Next(360), .8f, false);
                Apartment.Place(Root, "shrub_01", new Vector3(MaxX - .9f, .01f, z - 1), shrubRng.Next(360), .8f, false);
            }
            // saksılarda çiçek
            foreach (float x in new[] { -4f, 4f }) for (int k = -1; k <= 1; k++) Apartment.Place(Root, "flower_gazania", new Vector3(x + k * .35f, .45f, 30.4f), shrubRng.Next(360), 1.2f, false);
        }

        // ---------- sokak: lambalar, direkler, teller, rögar, çöp kutusu, elektrik kutusu ----------
        static void Street()
        {
            foreach (float x in new[] { -20f, -10f, 10f, 20f }) Lamp("street_lamp_01", new Vector3(x, 0, RoadZ0 - .45f), 0);
            foreach (float x in new[] { -15f, 0f, 15f }) Lamp("street_lamp_01", new Vector3(x, 0, RoadZ1 + .5f), 180);
            var wood = Props.M(new Color(.3f, .22f, .15f), .2f); var wire = Props.M(new Color(.05f, .05f, .05f), .3f);
            float[] poles = { -24f, -12f, 0f, 12f, 24f }; const float pz = ParkZ0 - .3f;
            foreach (float x in poles)
            {
                Props.Cyl(Root, .12f, 8f, wood, new Vector3(x + 1.6f, 4f, pz), true);
                Props.Box(Root, new Vector3(1.6f, .1f, .12f), wood, new Vector3(x + 1.6f, 7.6f, pz));
            }
            for (int i = 0; i < poles.Length - 1; i++)
                foreach (float off in new[] { -.6f, 0f, .6f })
                {
                    float a = poles[i] + 1.6f, b = poles[i + 1] + 1.6f;
                    Props.Box(Root, new Vector3(b - a, .015f, .015f), wire, new Vector3((a + b) / 2 + off * 0, 7.55f + off * .05f, pz + off * .1f), 0, false, false);
                }
            Apartment.Place(Root, "water_manhole_cover", new Vector3(-8, -.148f, 14.5f), 0, 1, false);
            Apartment.Place(Root, "water_manhole_cover", new Vector3(9, -.148f, 15.2f), 30, 1, false);
            TrashCan(new Vector3(3.2f, 0, 10.2f)); TrashCan(new Vector3(-2.5f, .03f, 22f));
            Apartment.Place(Root, "utility_box_01", new Vector3(-7.4f, 0, 5.6f), 0);
            Cars();
        }
        // arada bir yoldan geçen araba (park etmiş araba yok): şerit z, yön ve model her seferinde rastgele
        static void Cars()
        {
            var t = new GameObject("trafik").AddComponent<Traffic>(); t.transform.SetParent(Root.parent, false);
        }        static void Lamp(string id, Vector3 pos, float ry)
        {
            Apartment.Place(Root, id, pos, ry, 1, false);
            // yalnızca direk çarpışır: modelin tüm kutusu sokağa uzanan kolu da kapsıyor, bordürün üstünü kapatıyordu
            var pole = new GameObject("lambaDiregi").AddComponent<CapsuleCollider>(); pole.transform.SetParent(Root, false);
            pole.transform.localPosition = pos + Vector3.up * 1.5f; pole.radius = .14f; pole.height = 3f;
            var l = new GameObject("lamba").AddComponent<Light>(); l.transform.SetParent(Root, false);
            l.transform.localPosition = pos + new Vector3(0, 3.5f, 0); // lamba başı (model 3,9 m)
            l.type = LightType.Point; l.range = 11; l.intensity = 0; l.color = new Color(1f, .82f, .55f); l.shadows = LightShadows.None; l.renderMode = LightRenderMode.ForceVertex;
            Lamps.Add(l);
        }

        // ---------- bakkal: önünde kasalarda meyve-sebze, tüp ve su ----------
        static void Bakkal()
        {
            Color[] fruit = { new(.95f, .55f, .1f), new(.8f, .1f, .1f), new(.35f, .65f, .2f), new(.95f, .85f, .25f) };
            for (int i = 0; i < 4; i++)
            {
                var pos = new Vector3(8.2f + i * .62f, 0, 6.1f);
                var crate = Apartment.Place(Root, "plastic_crate_01", pos, 0, 1, true);
                var m = Props.M(fruit[i], .5f);
                for (int k = 0; k < 9; k++)
                {
                    var s = GameObject.CreatePrimitive(PrimitiveType.Sphere); Object.Destroy(s.GetComponent<Collider>()); s.transform.SetParent(Root, false);
                    s.transform.localPosition = pos + new Vector3((k % 3 - 1) * .13f, .28f + (k / 3) * .02f, (k / 3 - 1) * .1f); s.transform.localScale = Vector3.one * .085f; s.GetComponent<Renderer>().sharedMaterial = m;
                }
            }
            Apartment.Place(Root, "wooden_crate_01", new Vector3(11.1f, 0, 6.1f), 10);
            Apartment.Place(Root, "wooden_crate_01", new Vector3(11.1f, .45f, 6.1f), -5);
            Props.Label(Root, "Domates", new Vector3(8.82f, .45f, 6.45f)); Props.Label(Root, "Portakal", new Vector3(8.2f, .45f, 6.45f));
        }

        // ---------- park: çit, ağaçlar, banklar, lambalar ----------
        static void Park()
        {
            var iron = Props.M(new Color(.12f, .14f, .12f), .4f, .6f);
            void Fence(Vector3 a, Vector3 b)
            {
                var d = b - a; float len = d.magnitude; var dir = d / len; float ry = Mathf.Atan2(dir.x, dir.z) * Mathf.Rad2Deg;
                Props.Box(Root, new Vector3(.04f, .04f, len), iron, (a + b) / 2 + Vector3.up * .8f, ry, false, false);
                Props.Box(Root, new Vector3(.04f, .04f, len), iron, (a + b) / 2 + Vector3.up * .15f, ry, false, false);
                for (float t = 0; t <= len; t += .16f) Props.Box(Root, new Vector3(.02f, .85f, .02f), iron, a + dir * t + Vector3.up * .42f, 0, false, false);
                var col = new GameObject("cit").AddComponent<BoxCollider>(); col.transform.SetParent(Root, false); col.transform.localPosition = (a + b) / 2 + Vector3.up * .45f;
                col.transform.localRotation = Quaternion.Euler(0, ry, 0); col.size = new Vector3(.1f, .9f, len);
            }
            float z0 = ParkZ0 + .1f;
            Fence(new Vector3(MinX, 0, z0), new Vector3(-1.6f, 0, z0)); Fence(new Vector3(1.6f, 0, z0), new Vector3(MaxX, 0, z0));
            Fence(new Vector3(MinX, 0, z0), new Vector3(MinX, 0, 29.1f)); Fence(new Vector3(MinX, 0, 31.7f), new Vector3(MinX, 0, MaxZ));
            Fence(new Vector3(MaxX, 0, z0), new Vector3(MaxX, 0, 29.1f)); Fence(new Vector3(MaxX, 0, 31.7f), new Vector3(MaxX, 0, MaxZ));
            Fence(new Vector3(MinX, 0, MaxZ), new Vector3(MaxX, 0, MaxZ));
            bark = Props.MN(Color.white, .1f, Lib.I.T("tree_bark", "diff"), Lib.I.T("tree_bark", "nor"), new Vector2(1, 2), .8f);
            leaves = Props.Cutout(Lib.I.T("tree_leaves", "diff")); leaves.SetFloat("_Cutoff", .45f); leaves.enableInstancing = true;
            var rng = new System.Random(42);
            foreach (float x in new[] { -21f, -13f, -6f, 6f, 13f }) foreach (float z in new[] { 25f, 36f }) Tree(new Vector3(x + (float)rng.NextDouble() - .5f, 0, z + (float)rng.NextDouble() - .5f), rng);
            Tree(new Vector3(21, 0, 25), rng); Tree(new Vector3(-21, 0, 40), rng);
            // banklar: ana yolun iki yanında yola bakar, çapraz yolda karşılıklı
            foreach (float z in new[] { 24f, 35f }) { Bench(new Vector3(-2.3f, 0, z), 90); Bench(new Vector3(2.3f, 0, z), -90); }
            Bench(new Vector3(-10, 0, 28.6f), 0); Bench(new Vector3(-16, 0, 32.2f), 180); Bench(new Vector3(9, 0, 28.6f), 0);
            foreach (var (x, z) in new[] { (-2.1f, 27.5f), (2.1f, 33f), (-12f, 31.9f), (12f, 28.8f) }) Lamp("street_lamp_01", new Vector3(x, .03f, z), x < 0 ? 90 : -90);
            Apartment.Place(Root, "planter_box_01", new Vector3(-4f, .01f, 30.4f), 0); Apartment.Place(Root, "planter_box_01", new Vector3(4f, .01f, 30.4f), 0);
        }

        // Ağaç (çınar benzeri): kabuk dokulu gövde ve dallar, yaprak kümeleri çapraz kartlar (Poly Haven yaprak dokusu, alfa kesik).
        // Hafif: gövde birkaç silindir, taç ~36 kart; hepsi tek malzemede birleşir.
        static void Tree(Vector3 pos, System.Random rng)
        {
            float h = 3.6f + (float)rng.NextDouble() * 1.6f, r = 1.8f + (float)rng.NextDouble() * .8f;
            var t = new GameObject("agac").transform; t.SetParent(Root, false); t.localPosition = pos; t.localRotation = Quaternion.Euler(0, rng.Next(360), 0);
            Props.Cyl(t, .16f, h, bark, new Vector3(0, h / 2, 0), true);
            for (int i = 0; i < 5; i++)
            {
                var br = Props.Cyl(t, .06f, 1.6f, bark, Vector3.zero);
                float a = i * 72 + rng.Next(30);
                br.transform.localPosition = new Vector3(0, h * .75f, 0) + Quaternion.Euler(0, a, 0) * new Vector3(0, .45f, .5f);
                br.transform.localRotation = Quaternion.Euler(50, a, 0);
            }
            var crown = new Vector3(0, h + r * .55f, 0);
            for (int i = 0; i < 36; i++)
            {
                var dir = new Vector3((float)rng.NextDouble() * 2 - 1, ((float)rng.NextDouble() * 2 - 1) * .6f, (float)rng.NextDouble() * 2 - 1).normalized;
                var c = crown + dir * r * (.4f + (float)rng.NextDouble() * .6f);
                float s = 1.3f + (float)rng.NextDouble() * .8f; var rot = Quaternion.Euler(rng.Next(-30, 30), rng.Next(360), rng.Next(-20, 20));
                foreach (float flip in new[] { 0f, 180f }) foreach (float cross in new[] { 0f, 90f })
                {
                    var q = Props.Quad(t, new Vector2(s, s), leaves, c, rot * Quaternion.Euler(0, cross + flip, 0));
                    q.GetComponent<Renderer>().shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.On;
                }
            }
        }

        // Park bankı (kendi çizimimiz): dökme demir yan ayaklar, ahşap oturak ve sırt çıtaları. Yerel +z oturanın baktığı yön.
        static void Bench(Vector3 pos, float ry)
        {
            var b = new GameObject("bank").transform; b.SetParent(Root, false); b.localPosition = pos; b.localRotation = Quaternion.Euler(0, ry, 0);
            var iron = Props.M(new Color(.1f, .1f, .1f), .4f, .5f); var wood = Props.M(new Color(.45f, .26f, .14f), .3f);
            foreach (float x in new[] { -.75f, .75f })
            {
                Props.Box(b, new Vector3(.05f, .44f, .06f), iron, new Vector3(x, .22f, .18f), 0, false);          // ön ayak
                Props.Box(b, new Vector3(.05f, .86f, .06f), iron, new Vector3(x, .43f, -.2f), 0, false).transform.localRotation = Quaternion.Euler(-10, 0, 0); // arka ayak ve sırt dikmesi
                Props.Box(b, new Vector3(.05f, .05f, .46f), iron, new Vector3(x, .42f, -.01f), 0, false);         // oturak taşıyıcı
                Props.Box(b, new Vector3(.05f, .05f, .4f), iron, new Vector3(x, .64f, .02f), 0, false);           // kolçak
            }
            for (int i = 0; i < 4; i++) Props.Box(b, new Vector3(1.6f, .03f, .085f), wood, new Vector3(0, .455f, .14f - i * .1f), 0, false);       // oturak çıtaları
            for (int i = 0; i < 3; i++) Props.Box(b, new Vector3(1.6f, .085f, .025f), wood, new Vector3(0, .62f + i * .11f, -.25f - i * .02f), 0, false).transform.localRotation = Quaternion.Euler(-10, 0, 0); // sırt
            var col = b.gameObject.AddComponent<BoxCollider>(); col.center = new Vector3(0, .4f, -.03f); col.size = new Vector3(1.6f, .8f, .55f);
            var rot = Quaternion.Euler(0, ry, 0);
            foreach (float s in new[] { -.4f, .4f }) Seats.Add((pos + rot * new Vector3(s, 0, .06f), rot)); // iki kişilik
        }
        // ---------- çay bahçesi: çay ocağı, yuvarlak masalar, plastik sandalyeler ----------
        static void TeaGarden()
        {
            var kiosk = new Vector3(21, 0, 40.2f);
            Props.Box(Root, new Vector3(3.2f, 2.6f, 2f), Props.M(new Color(.9f, .88f, .82f), .2f), kiosk + new Vector3(0, 1.3f, 0), 0, true);
            Props.Box(Root, new Vector3(3.4f, .08f, 2.4f), Props.M(new Color(.55f, .12f, .12f), .4f), kiosk + new Vector3(0, 2.65f, -.2f));
            Props.Box(Root, new Vector3(2.4f, .9f, .02f), Props.M(new Color(.1f, .1f, .1f), .5f), kiosk + new Vector3(0, 1.4f, -1.01f));
            Props.Text3D(Root, "ÇAY OCAĞI", kiosk + new Vector3(0, 2.3f, -1.03f), 0, .28f, new Color(.55f, .12f, .12f));
            for (int i = 0; i < 3; i++) Props.Teapot(Root, kiosk + new Vector3(-.6f + i * .5f, .95f, -1.2f));
            Props.Box(Root, new Vector3(2.6f, .06f, .5f), Props.Marble, kiosk + new Vector3(0, .92f, -1.25f), 0, true);
            var tables = new[] { new Vector3(15.5f, 0, 35.5f), new Vector3(19f, 0, 35.2f), new Vector3(15.6f, 0, 38.8f) };
            for (int t = 0; t < tables.Length; t++)
            {
                var c = tables[t];
                Props.Cyl(Root, .42f, .03f, Props.M(new Color(.9f, .9f, .88f), .4f), c + new Vector3(0, .72f, 0), true);
                Props.Cyl(Root, .03f, .72f, Props.Black, c + new Vector3(0, .36f, 0));
                for (int k = 0; k < 4; k++)
                {
                    var rot = Quaternion.Euler(0, k * 90 + 180, 0); var sp = c + Quaternion.Euler(0, k * 90, 0) * new Vector3(0, 0, .62f);
                    if (Apartment.Place(Root, "plastic_monobloc_chair_01", sp, k * 90) == null) Props.Chair(Root, sp, k * 90);
                    Seats.Add((sp, rot));
                    if (k % 2 == 0) Props.TeaGlass(Root, c + Quaternion.Euler(0, k * 90, 0) * new Vector3(0, .735f, .22f));
                }
                if (t == 1) TableSets.Backgammon(Root, c + Vector3.down * (Props.TableTop - .735f), 30, 5);
            }
        }

        // Poly Haven modelinde yan yana iki kutu var (temiz ve paslı): yalnız temiz olan kalır, her yerde tek çöp kutusu.
        static void TrashCan(Vector3 pos)
        {
            var g = Apartment.Place(Root, "metal_trash_can", pos, 0, 1, false); if (!g) return;
            foreach (var t in g.GetComponentsInChildren<Transform>(true)) if (t != g.transform && t.name.Contains("_rust")) Object.Destroy(t.gameObject);
            var b = g.AddComponent<BoxCollider>(); b.center = new Vector3(0, .45f, 0); b.size = new Vector3(.55f, .9f, .55f); // tek kutunun çarpışması
            var s = g.transform.lossyScale; b.center = new Vector3(b.center.x / s.x, b.center.y / s.y, b.center.z / s.z); b.size = new Vector3(b.size.x / s.x, b.size.y / s.y, b.size.z / s.z);
        }

        // ---------- teyzeler: kahvenin üstündeki balkonda, karşılıklı dedikodu ----------
        static readonly string[] Lines =
        {
            "Duydun mu kız, karşının oğlan evleniyormuş!", "Bakkal yine veresiye defteri açmış...", "Bizimki kahveden çıkmıyor ki!",
            "Bu sene kış çetin geçecek diyorlar.", "Aa, şu okey oynayanlara bak!", "Fiyatlar da ne oldu böyle...",
            "Komşu kızı üniversiteyi kazanmış, maşallah.", "Çamaşırları aldın mı, yağmur geliyor!", "Akşama dolma yapıyorum, gel otur."
        };
        static void Gossip(Transform people)
        {
            // kahvenin üstündeki apartmanın (seed 1) birinci kat balkonu: arada duvar yok, ikisi aynı balkonda yan yana
            var bal = Apartment.Balconies.Find(b => b.seed == 1 && b.floor == 0);
            if (bal.width <= 0) return;
            string[] names = { "Fatma Teyze", "Hatice Teyze" };
            var made = new List<Chars.Person>();
            for (int i = 0; i < names.Length; i++)
            {
                var holder = new GameObject("teyze").transform; holder.SetParent(people, false);
                holder.position = bal.floor0 + new Vector3((i == 0 ? -1 : 1) * Mathf.Min(.55f, bal.width * .24f), 0, .5f);
                made.Add(Chars.Person.Create(names[i], holder, false, "teyze"));
            }
            for (int i = 0; i < made.Count; i++)
            {
                var me = made[i]; var other = made[(i + 1) % made.Count];
                var dir = other.transform.position - me.transform.position; dir.y = 0;
                me.transform.parent.rotation = Quaternion.LookRotation(dir.normalized + Vector3.forward * .55f); // komşusuna döner, biraz da sokağa
                var g = me.gameObject.AddComponent<GossipTalk>(); g.Init(me, other, Lines, i * 2.1f);
            }
        }

        // Yürüme sınırı: mahallenin dışına çıkılmaz.
        static void Walls()
        {
            void W(Vector3 c, Vector3 s) { var g = new GameObject("sinir").AddComponent<BoxCollider>(); g.transform.SetParent(Root, false); g.transform.localPosition = c; g.size = s; }
            W(new Vector3(MinX - .3f, 1.5f, 17), new Vector3(.4f, 3, 50)); W(new Vector3(MaxX + .3f, 1.5f, 17), new Vector3(.4f, 3, 50));
            W(new Vector3(0, 1.5f, MaxZ + .4f), new Vector3(60, 3, .4f));
        }
    }

    // Teyzenin dedikodusu: sırayla konuşurlar; konuşan ellerini sallar, yazısı başının üstünde görünür (yakındaysan).
    public class GossipTalk : MonoBehaviour
    {
        Chars.Person me, other; string[] lines; float next; TextMesh bubble; int idx;
        public void Init(Chars.Person p, Chars.Person o, string[] l, float delay)
        {
            me = p; other = o; lines = l; next = Time.time + 2 + delay; idx = (int)(delay * 3) % l.Length;
            var b = new GameObject("lafi"); b.transform.SetParent(transform, false); b.transform.localPosition = new Vector3(0, 2f, 0);
            bubble = Props.Text3D(b.transform, "", Vector3.zero, 0, .12f, new Color(1f, .97f, .85f));
        }
        void Update()
        {
            if (!me || !Camera.main) return;
            me.LookAt = other ? other.Head.position : (Vector3?)null;
            var cam = Camera.main.transform.position;
            bool near = Vector3.Distance(cam, transform.position) < 22;
            bubble.transform.parent.rotation = Quaternion.LookRotation(bubble.transform.parent.position - cam);
            if (Time.time < next) return;
            next = Time.time + 4.5f + Random.value * 3;
            idx = (idx + 1) % lines.Length;
            bubble.text = ""; // yazı yok, yalnızca ses
            me.Gesture(Chars.Person.Talk, 4f); // anlatan elleriyle konuşur
            Sfx.Voice(me.Head ? me.Head.position : transform.position + Vector3.up * 1.6f, lines[idx], Chars.Person.Hash(me.Display), false, true); // sesli dedikodu
            if (other && other.TryGetComponent<GossipTalk>(out var o)) { o.BubbleClear(); o.Listen(); }
        }
        void BubbleClear() { if (bubble) bubble.text = ""; }
        // dinleyen: biraz sonra başını sallar ya da güler
        void Listen() => Invoke(nameof(React), 1.5f + Random.value);
        void React() { if (me) me.Gesture(Random.value < .35f ? Chars.Person.Laugh : Chars.Person.Yes, 2.5f); }
    }

    // Sokaktan arada bir geçen araba: uçtaki boşluktan gelir, sokağı geçer, öbür uçta kaybolur. Önünde biri varsa yavaşlar, durur.
    public class Traffic : MonoBehaviour
    {
        static readonly string[] Models = { "HATCHBACK_1988", "SEDAN", "Traffic B - OldSedan", "Traffic B - Taxi", "Traffic B - OldWagon 2", "Traffic B - MidSedan 1" };
        const float Edge = Neighborhood.MaxX + 40, Cruise = 7.5f;
        GameObject car; float dir, lane, speed, next;

        void Start() { next = Time.time + 8; }
        void Update()
        {
            if (!car)
            {
                if (Time.time < next) return;
                var id = Models[Random.Range(0, Models.Length)]; dir = Random.value < .5f ? 1 : -1;
                lane = dir > 0 ? Neighborhood.RoadZ0 + 1.9f : Neighborhood.RoadZ1 - 1.9f; // sağdan gider
                bool alongZ = id.StartsWith("Traffic");
                car = Apartment.Place(transform, id, new Vector3(-Edge * dir, -.15f, lane), alongZ ? (dir > 0 ? 90 : -90) : (dir > 0 ? 0 : 180), alongZ ? .8f : 1f, false);
                if (!car) { next = Time.time + 30; return; }
                foreach (var r in car.GetComponentsInChildren<Renderer>()) r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.On;
                Sfx.Engine(car.transform);
                speed = Cruise;
            }
            // önünde (aynı şeritte, 7 m içinde) oyuncu ya da biri varsa yavaşla
            float want = Cruise; var me = App.I && App.I.Me ? App.I.Me.transform.position : new Vector3(0, -100, 0);
            float ahead = (me.x - car.transform.position.x) * dir;
            if (ahead > 0 && ahead < 8 && Mathf.Abs(me.z - lane) < 1.6f && me.y < 1) want = ahead < 4.5f ? 0 : Cruise * (ahead - 4.5f) / 3.5f;
            speed = Mathf.MoveTowards(speed, want, Time.deltaTime * (want < speed ? 9 : 3));
            car.transform.position += Vector3.right * dir * speed * Time.deltaTime;
            if (car.transform.position.x * dir > Edge) { Destroy(car); next = Time.time + Random.Range(12f, 30f); }
        }
    }
}