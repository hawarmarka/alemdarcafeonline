// 80'ler Türk apartmanı: sıvalı cephe (Poly Haven dokuları), alüminyum pencereler, demir korkuluklu balkonlar, çamaşır ipi,
// çatıda su deposu ve televizyon anteni, zemin katta dükkânlar ve kepenkler. Önü +z (sokak) tarafı.
using System.Collections.Generic;
using UnityEngine;

namespace Alemdar.World
{
    public static class Apartment
    {
        public const float FloorH = 3f;
        static Material winDark, frame, iron, slab, curtain;
        public static Material WinLit;             // gece yanan pencereler (Weather ışığı açar)

        static void Mats()
        {
            if (winDark) return;
            winDark = Props.M(new Color(.16f, .19f, .22f), .92f, .2f);
            WinLit = Props.Emissive(new Color(.95f, .8f, .52f), 0f);
            frame = Props.M(new Color(.82f, .83f, .82f), .55f, .5f);
            iron = Props.M(new Color(.1f, .1f, .1f), .4f, .6f);
            slab = Props.MN(new Color(.82f, .8f, .76f), .1f, Lib.I.T("concrete_pavement", "diff"), Lib.I.T("concrete_pavement", "nor"), new Vector2(1, .3f), .5f);
            curtain = Props.M(new Color(.86f, .82f, .72f), .1f);
        }
        public static Material Plaster(string id, Color tint, float w, float h) =>
            Props.MN(tint, .08f, Lib.I.T(id, "diff"), Lib.I.T(id, "nor"), new Vector2(w / 2.5f, h / 2.5f), .7f);

        // x0..x1 genişlik, z0 arka, z1 ön cephe; base: üst katların başladığı yükseklik; floors: üst kat sayısı.
        public static void Build(Transform p, float x0, float x1, float z0, float z1, float baseY, int floors, Material wall, int seed, bool groundShops, string[] shopNames, System.Func<int, int, bool> open = null)
        {
            Mats();
            var rng = new System.Random(seed);
            float w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, top = baseY + floors * FloorH;
            // gövde (arka ve yanlar tek kutu, ön cephe ayrı: pencereler önüne)
            Props.Box(p, new Vector3(w, top - baseY, d - .3f), wall, new Vector3(cx, (baseY + top) / 2, z0 + (d - .3f) / 2), 0, true);
            Props.Box(p, new Vector3(w, top - baseY, .3f), wall, new Vector3(cx, (baseY + top) / 2, z1 - .15f), 0, true);
            // kat silmeleri
            for (int f = 0; f <= floors; f++) Props.Box(p, new Vector3(w + .06f, .14f, .1f), slab, new Vector3(cx, baseY + f * FloorH, z1 + .02f));
            int cols = Mathf.Max(2, Mathf.FloorToInt(w / 2.3f)); float step = w / cols;
            curSeed = seed;
            for (int f = 0; f < floors; f++)
            {
                float y = baseY + f * FloorH; curFloor = f;
                for (int c = 0; c < cols; c++)
                {
                    float x = x0 + step * (c + .5f);
                    bool balcony = c % 2 == 1 && w > 6;
                    if (balcony) Balcony(p, x, y, z1, step * .9f, rng);
                    else Window(p, x, y + 1.55f, z1, 1.3f, 1.35f, rng);
                    if (!balcony && !(open != null && open(f, c)) && rng.NextDouble() < .25 && Lib.I.Model("exterior_aircon_unit")) Place(p, "exterior_aircon_unit", new Vector3(x, y + .32f, z1 + .25f), 180, .8f, false); // pencerenin altında, yandaki balkona taşmaz
                }
            }
            Roof(p, x0, x1, z0, z1, top, rng);
            if (groundShops) Shops(p, x0, x1, z1, baseY, wall, shopNames, rng);
        }

        static void Window(Transform p, float x, float y, float z, float ww, float wh, System.Random rng)
        {
            bool lit = rng.NextDouble() < .45;
            var g = Props.Box(p, new Vector3(ww - .08f, wh - .08f, .02f), lit ? WinLit : winDark, new Vector3(x, y, z + .01f), 0, false, false);
            g.name = lit ? "pencere_isik" : "pencere";
            if (lit) Props.Box(p, new Vector3((ww - .1f) * .35f, wh - .12f, .01f), curtain, new Vector3(x - ww * .28f, y, z + .025f), 0, false, false); // tül perde
            WindowFrame(p, x, y, z, ww, wh);
            Props.Box(p, new Vector3(ww + .12f, .05f, .2f), slab, new Vector3(x, y - wh / 2 - .03f, z + .1f));
        }
        static void WindowFrameSide(Transform p, float x, float y, float z, float wd, float wh)
        {
            Props.Box(p, new Vector3(.04f, .04f, wd), frame, new Vector3(x, y + wh / 2, z), 0, false, false);
            Props.Box(p, new Vector3(.04f, .04f, wd), frame, new Vector3(x, y - wh / 2, z), 0, false, false);
            Props.Box(p, new Vector3(.04f, wh, .04f), frame, new Vector3(x, y, z - wd / 2), 0, false, false);
            Props.Box(p, new Vector3(.04f, wh, .04f), frame, new Vector3(x, y, z + wd / 2), 0, false, false);
        }
        static void WindowFrame(Transform p, float x, float y, float z, float ww, float wh)
        {
            Props.Box(p, new Vector3(ww, .05f, .06f), frame, new Vector3(x, y + wh / 2, z + .03f), 0, false, false);
            Props.Box(p, new Vector3(ww, .05f, .06f), frame, new Vector3(x, y - wh / 2, z + .03f), 0, false, false);
            Props.Box(p, new Vector3(.05f, wh, .06f), frame, new Vector3(x - ww / 2, y, z + .03f), 0, false, false);
            Props.Box(p, new Vector3(.05f, wh, .06f), frame, new Vector3(x + ww / 2, y, z + .03f), 0, false, false);
            Props.Box(p, new Vector3(.04f, wh, .05f), frame, new Vector3(x, y, z + .035f), 0, false, false); // orta kayıt
        }

        // Balkon: beton döşeme, demir korkuluk, kapı-pencere ve bazen saksı. Yerleri Balconies listesinde (balkondaki insanlar için).
        public static readonly List<(int seed, int floor, Vector3 floor0, float width, Vector3 facing)> Balconies = new();
        static int curSeed, curFloor;
        static void Balcony(Transform p, float x, float y, float z, float bw, System.Random rng)
        {
            Balconies.Add((curSeed, curFloor, p.TransformPoint(new Vector3(x, y + .14f, z)), bw, p.TransformDirection(Vector3.forward)));
            const float depth = 1.05f;
            Props.Box(p, new Vector3(bw, .14f, depth), slab, new Vector3(x, y + .07f, z + depth / 2), 0, true);
            float dw = Mathf.Min(.9f, bw * .42f), ww = Mathf.Min(.85f, bw * .4f); // kapı ve pencere balkon genişliğine sığar, üst üste binmez
            float dx = x - bw / 2 + .12f + dw / 2, wx = x + bw / 2 - .12f - ww / 2;
            Props.Box(p, new Vector3(dw, 2.1f, .02f), winDark, new Vector3(dx, y + 1.2f, z + .01f), 0, false, false);
            WindowFrame(p, dx, y + 1.2f, z, dw, 2.1f);
            Window(p, wx, y + 1.55f, z, ww, 1.3f, rng);
            float rz = z + depth - .04f, rh = .95f;
            Props.Box(p, new Vector3(bw, .05f, .05f), iron, new Vector3(x, y + .14f + rh, rz), 0, false, false);
            Props.Box(p, new Vector3(bw, .03f, .03f), iron, new Vector3(x, y + .24f, rz), 0, false, false);
            for (float bx = -bw / 2; bx <= bw / 2 + .01f; bx += .13f) Props.Box(p, new Vector3(.018f, rh, .018f), iron, new Vector3(x + bx, y + .14f + rh / 2, rz), 0, false, false);
            foreach (float sx in new[] { -1f, 1f })
            {
                Props.Box(p, new Vector3(.05f, .05f, depth), iron, new Vector3(x + sx * bw / 2, y + .14f + rh, z + depth / 2), 0, false, false);
                for (float bz = .1f; bz < depth; bz += .13f) Props.Box(p, new Vector3(.018f, rh, .018f), iron, new Vector3(x + sx * bw / 2, y + .14f + rh / 2, z + bz), 0, false, false);
            }
            rng.NextDouble(); // eski çamaşır ipi kaldırıldı (kullanıcı isteği); rastgele sıra aynı kalsın, saksılar yerinde dursun
            if (rng.NextDouble() < .6 && Lib.I.Model("potted_plant_02")) Place(p, "potted_plant_02", new Vector3(x + bw / 2 - .25f, y + .14f, z + depth - .22f), rng.Next(360), .55f, false);
        }

        static void Roof(Transform p, float x0, float x1, float z0, float z1, float top, System.Random rng)
        {
            float w = x1 - x0, d = z1 - z0, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
            Props.Box(p, new Vector3(w, .2f, d), slab, new Vector3(cx, top + .1f, cz));
            foreach (var (s, pos) in new[] { (new Vector3(w, .8f, .2f), new Vector3(cx, top + .5f, z1 - .1f)), (new Vector3(w, .8f, .2f), new Vector3(cx, top + .5f, z0 + .1f)),
                                             (new Vector3(.2f, .8f, d), new Vector3(x0 + .1f, top + .5f, cz)), (new Vector3(.2f, .8f, d), new Vector3(x1 - .1f, top + .5f, cz)) })
                Props.Box(p, s, slab, pos);
            // su deposu (paslanmaz silindir, sehpa üstünde) ve TV antenleri
            var tank = new Vector3(cx + w * .2f, top + .2f, cz - d * .2f);
            Props.Box(p, new Vector3(1.4f, .6f, .9f), iron, tank + new Vector3(0, .3f, 0));
            var cyl = Props.Cyl(p, .5f, 1.4f, Props.Steel, tank + new Vector3(0, 1.1f, 0)); cyl.transform.localRotation = Quaternion.Euler(0, 0, 90);
            for (int i = 0; i < 2 + rng.Next(3); i++)
            {
                var a = new Vector3(x0 + .8f + (float)rng.NextDouble() * (w - 1.6f), top + .2f, z0 + .8f + (float)rng.NextDouble() * (d - 1.6f));
                Props.Box(p, new Vector3(.04f, 2.2f, .04f), iron, a + new Vector3(0, 1.1f, 0), 0, false, false);
                for (int k = 0; k < 5; k++) Props.Box(p, new Vector3(1.1f - k * .16f, .02f, .02f), iron, a + new Vector3(0, 1.4f + k * .16f, 0), rng.Next(360), false, false);
            }
        }

        // Zemin kat dükkânları: sıva ayaklar, cam vitrin ya da yarı inik kepenk, tabela.
        static void Shops(Transform p, float x0, float x1, float z1, float baseY, Material wall, string[] names, System.Random rng)
        {
            int n = names?.Length ?? 1; float sw = (x1 - x0) / n;
            for (int i = 0; i < n; i++)
            {
                float a = x0 + i * sw, b = a + sw, mx = (a + b) / 2;
                Props.Box(p, new Vector3(.4f, baseY, .4f), wall, new Vector3(a + .2f, baseY / 2, z1 - .2f), 0, true);
                Props.Box(p, new Vector3(.4f, baseY, .4f), wall, new Vector3(b - .2f, baseY / 2, z1 - .2f), 0, true);
                Props.Box(p, new Vector3(sw - .8f, .5f, .3f), wall, new Vector3(mx, baseY - .25f, z1 - .15f), 0, true);           // kepenk kutusu hizası
                Props.Box(p, new Vector3(sw - .8f, baseY - .5f, .1f), Props.M(new Color(.2f, .18f, .16f), .2f), new Vector3(mx, (baseY - .5f) / 2, z1 - .5f), 0, true); // iç duvar (dükkân içi kapalı)
                string name = names?[i];
                bool open = !string.IsNullOrEmpty(name) && name != "-";
                var shutter = Props.Tiled(Props.M(new Color(.6f, .61f, .62f), .45f, .6f, Tex.Shutter()), new Vector2(3, 2));
                float down = open ? .45f : baseY - .5f; // açık dükkânda kepenk yukarıda, kapalıda inik
                Props.Box(p, new Vector3(sw - .85f, down, .04f), shutter, new Vector3(mx, baseY - .5f - down / 2, z1 - .08f), 0, !open);
                if (open)
                {
                    Props.Box(p, new Vector3(sw - .9f, baseY - .5f - down - .05f, .02f), Props.Glass, new Vector3(mx, (baseY - .5f - down) / 2, z1 - .1f), 0, false, false);
                    // tabela
                    // tabela kepenk kutusunun önünde (üstteki balkon kapatmasın)
                    Props.Box(p, new Vector3(sw - .7f, .46f, .08f), Props.M(new Color(.72f, .12f, .12f), .4f), new Vector3(mx, baseY - .25f, z1 + .06f));
                    Props.Text3D(p, name, new Vector3(mx, baseY - .25f, z1 + .11f), 180, .3f, Color.white);
                }
            }
        }

        // Modern apartman: ön cephe Apartment Kit (Brick Project Studio) pencereli duvar parçalarından (2,5 m × 4 m),
        // gövde, yanlar ve çatı bizim sıvamız; zemin katta dükkânlar. Kit parçası yoksa klasik apartmana döner.
        public static void BuildKit(Transform p, float x0, float x1, float z0, float z1, float baseY, int floors, Material wall, int seed, string[] shopNames)
        {
            const float TW = 2.5f, TH = 4f;
            if (!Lib.I.Model("Ext_Apt_01_Wall_Window_01")) { Build(p, x0, x1, z0, z1, baseY, floors, wall, seed, true, shopNames); return; }
            Mats();
            var rng = new System.Random(seed);
            int cols = Mathf.FloorToInt((x1 - x0) / TW); float w = cols * TW; x1 = x0 + w; float cx = (x0 + x1) / 2, top = baseY + floors * TH;
            Props.Box(p, new Vector3(w, top - baseY, z1 - z0 - .2f), wall, new Vector3(cx, (baseY + top) / 2, z0 + (z1 - z0 - .2f) / 2), 0, true); // ön yüzü camın arkasında
            for (int f = 0; f < floors; f++)
                for (int c = 0; c < cols; c++)
                {
                    // parçanın duvar düzlemi kendi ekseninde x=-1,3'te: 90° çevrilince pivotun 1,3 m önünde (+z) kalır
                    const string piece = "Ext_Apt_01_Wall_Window_01"; // penceresiz kit duvarı tahta kaplama görünüyordu: her yer pencereli
                    Place(p, piece, new Vector3(x0 + TW * (c + .5f), baseY + f * TH, z1 - 1.3f), 90, 1, false);
                    // pencere boşluğunun arkasına cam: gövde duvarı görünmesin; bazı daireler gece ışıklı
                    if (piece.EndsWith("Window_01")) Props.Box(p, new Vector3(TW - .1f, TH - .1f, .02f), rng.NextDouble() < .45 ? WinLit : winDark, new Vector3(x0 + TW * (c + .5f), baseY + f * TH + TH / 2, z1 - .08f), 0, false, false);
                }
            for (int f = 0; f <= floors; f++) Props.Box(p, new Vector3(w + .1f, .16f, .14f), slab, new Vector3(cx, baseY + f * TH, z1 + .05f));
            Roof(p, x0, x1, z0, z1, top, rng);
            Shops(p, x0, x1, z1, baseY, wall, shopNames, rng);
        }

        // Poly Haven modeli yerleştir: yerel önü +z; isteğe bağlı kutu çarpıştırıcı (yürüme alanı ondan kaçar).
        public static GameObject Place(Transform p, string id, Vector3 pos, float ry, float scale = 1, bool collide = true)
        {
            var prefab = Lib.I.Model(id); if (!prefab) return null;
            // FBX kökünde birim çevirisi (ör. 100 kat ölçek) ve eksen dönüşü olabilir: korunur, üstüne eklenir
            var g = Object.Instantiate(prefab, p); g.transform.localPosition = pos;
            foreach (var mc in g.GetComponentsInChildren<MeshCollider>()) Object.Destroy(mc); // hazır modellerin ağ çarpıştırıcıları okunamaz (yürüme haritası atlar); gerekirse aşağıda kutu eklenir
            g.transform.localRotation = Quaternion.Euler(0, ry, 0) * prefab.transform.localRotation; g.transform.localScale = prefab.transform.localScale * scale;
            if (collide)
            {
                var rs = g.GetComponentsInChildren<Renderer>(); if (rs.Length == 0) return g;
                var b = new Bounds(g.transform.InverseTransformPoint(rs[0].bounds.center), Vector3.zero);
                foreach (var r in rs) { var rb = r.bounds; foreach (var c in new[] { rb.min, rb.max, new Vector3(rb.min.x, rb.min.y, rb.max.z), new Vector3(rb.max.x, rb.max.y, rb.min.z) }) b.Encapsulate(g.transform.InverseTransformPoint(c)); }
                var col = g.AddComponent<BoxCollider>(); col.center = b.center; col.size = b.size;
            }
            return g;
        }
    }
}
