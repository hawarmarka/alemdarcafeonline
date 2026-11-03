// Kıraathane eşyaları: basit geometriden, ortak malzemelerle (aynı malzeme → toplu çizim). Çarpışan eşyaya kutu çarpıştırıcı.
using UnityEngine;

namespace Alemdar.World
{
    public static class Props
    {
        public const float TableSize = 1.0f, TableTop = 0.76f; // okey masası: 4 ıstaka köşelerde birbirine değmeden sığar
        // Malzemeler Lib'deki şablonlardan türetilir (derlemede shader çeşitleri korunur).
        static Material From(Material template, Color c, float smooth, float metal, Texture tex, Vector2? tiling)
        {
            var m = new Material(template) { color = c, enableInstancing = true };
            m.SetFloat("_Glossiness", smooth); m.SetFloat("_Metallic", metal);
            m.mainTexture = tex; if (tex && tiling.HasValue) m.mainTextureScale = tiling.Value;
            return m;
        }
        public static Material M(Color c, float smooth = .2f, float metal = 0, Texture tex = null, Vector2? tiling = null) => From(Lib.I.opaque, c, smooth, metal, tex, tiling);
        // Aynı malzemenin döşenmiş kopyası: renk ve normal haritası birlikte ölçeklenir.
        public static Material Tiled(Material m, Vector2 s) { var c = new Material(m); c.SetTextureScale("_MainTex", s); c.SetTextureScale("_BumpMap", s); return c; }
        // Gerçek doku (Poly Haven CC0): renk + normal haritası.
        public static Material MN(Color c, float smooth, Texture diff, Texture nor, Vector2 tiling, float bump = 1)
        {
            var m = From(Lib.I.opaqueNormal, c, smooth, 0, diff, tiling);
            m.SetTexture("_BumpMap", nor); m.SetTextureScale("_BumpMap", tiling); m.SetFloat("_BumpScale", bump); m.EnableKeyword("_NORMALMAP");
            return m;
        }
        public static Material Transparent(Color c, float smooth = .95f) => From(Lib.I.transparent, c, smooth, 0, null, null);
        public static Material Cutout(Texture t) => From(Lib.I.cutout, Color.white, .3f, 0, t, null);
        public static Material Emissive(Color c, float power = 1.5f) { var m = From(Lib.I.emissive, c, .5f, 0, null, null); m.SetColor("_EmissionColor", c * power); return m; }

        // ortak malzemeler
        public static Material Cloth, Black, ChairSeat, Steel, WoodDark, WoodLight, Brown, White, Marble, Glass, Tea, Saucer, Wall, Plaster, FloorM, Grout;
        public static void Init()
        {
            var L = Lib.I;
            Cloth = MN(Color.white, .06f, Tex.Cloth(), L.fabricN, new Vector2(3, 3), .6f);
            Black = M(new Color(.07f, .07f, .08f), .55f, .6f);
            ChairSeat = MN(new Color(.22f, .22f, .23f), .45f, L.leatherD, L.leatherN, new Vector2(1.5f, 1.5f), .8f);
            Steel = M(new Color(.78f, .8f, .82f), .85f, .9f);
            WoodDark = MN(new Color(.72f, .6f, .52f), .45f, L.darkWoodD, L.darkWoodN, new Vector2(1, 1), .7f);
            WoodLight = MN(Color.white, .35f, L.lightWoodD, L.lightWoodN, new Vector2(1, 1), .7f);
            Brown = M(new Color(.22f, .13f, .08f), .25f);
            White = M(new Color(.93f, .93f, .91f), .3f);
            Marble = MN(Color.white, .75f, L.marbleD, L.marbleN, new Vector2(1, 1), .4f);
            // ince cam: az yansıma, içindeki tavşan kanı çay koyu kırmızı görünsün
            Glass = Transparent(new Color(.92f, .96f, .98f, .1f), .55f); Glass.color = new Color(.92f, .96f, .98f, .1f);
            Tea = Emissive(new Color(.5f, .1f, .03f), .55f); Tea.SetFloat("_Glossiness", .85f);
            // yazı tipi: kullanılan bütün karakterler baştan hazırlanır (oyun sırasında doku yeniden kurulup takılma yapmasın)
            const string chars = "ABCÇDEFGĞHIİJKLMNOÖPRSŞTUÜVYZXWQabcçdefgğhıijklmnoöprsştuüvyzxwq0123456789 .,:;!?%+-−·/()[]◀▶♠♥♦♣●'\"&";
            UiFont.RequestCharactersInTexture(chars, 96, FontStyle.Bold); UiFont.RequestCharactersInTexture(chars, 192, FontStyle.Bold);
            UiFont.RequestCharactersInTexture(chars, 96, FontStyle.Normal);
            foreach (int size in new[] { 16, 20, 21, 22, 24, 26, 30 }) { UiFont.RequestCharactersInTexture(chars, size, FontStyle.Normal); UiFont.RequestCharactersInTexture(chars, size, FontStyle.Bold); } // arayüz yazıları
            Saucer = M(Color.white, .7f, 0, Tex.Saucer());
            Wall = MN(new Color(1.02f, 1.02f, 1.04f), .08f, L.plasterD, L.plasterN, new Vector2(1, 1), .8f);
            Plaster = MN(new Color(1.05f, 1.05f, 1.06f), .06f, L.plasterD, L.plasterN, new Vector2(.6f, .6f), .6f);
            FloorM = MN(Color.white, .58f, Tex.Floor(L.marbleD), L.marbleN, new Vector2(1, 1), .25f);
        }

        public static GameObject Box(Transform p, Vector3 size, Material m, Vector3 pos, float ry = 0, bool collide = false, bool shadow = true)
        {
            var g = GameObject.CreatePrimitive(PrimitiveType.Cube);
            g.transform.SetParent(p, false); g.transform.localPosition = pos; g.transform.localScale = size; g.transform.localRotation = Quaternion.Euler(0, ry, 0);
            g.GetComponent<Renderer>().sharedMaterial = m;
            if (!shadow) g.GetComponent<Renderer>().shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            if (!collide) Object.Destroy(g.GetComponent<Collider>());
            return g;
        }
        public static GameObject Cyl(Transform p, float r, float h, Material m, Vector3 pos, bool collide = false)
        {
            var g = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
            g.transform.SetParent(p, false); g.transform.localPosition = pos; g.transform.localScale = new Vector3(r * 2, h / 2, r * 2);
            g.GetComponent<Renderer>().sharedMaterial = m;
            if (!collide) Object.Destroy(g.GetComponent<Collider>());
            return g;
        }
        public static GameObject Quad(Transform p, Vector2 size, Material m, Vector3 pos, Quaternion rot)
        {
            var g = GameObject.CreatePrimitive(PrimitiveType.Quad);
            g.transform.SetParent(p, false); g.transform.localPosition = pos; g.transform.localRotation = rot; g.transform.localScale = new Vector3(size.x, size.y, 1);
            g.GetComponent<Renderer>().sharedMaterial = m; Object.Destroy(g.GetComponent<Collider>());
            return g;
        }

        // Dönel yüzey (çay bardağı, çaydanlık): profil noktaları (yarıçap, yükseklik).
        public static Mesh Lathe(Vector2[] prof, int seg = 24)
        {
            var v = new Vector3[prof.Length * (seg + 1)]; var uv = new Vector2[v.Length]; var tri = new System.Collections.Generic.List<int>();
            for (int s = 0; s <= seg; s++)
            {
                float a = s / (float)seg * Mathf.PI * 2;
                for (int i = 0; i < prof.Length; i++) { v[s * prof.Length + i] = new Vector3(Mathf.Cos(a) * prof[i].x, prof[i].y, Mathf.Sin(a) * prof[i].x); uv[s * prof.Length + i] = new Vector2(s / (float)seg, i / (float)(prof.Length - 1)); }
            }
            for (int s = 0; s < seg; s++) for (int i = 0; i < prof.Length - 1; i++)
            {
                int a = s * prof.Length + i, b = a + prof.Length;
                tri.AddRange(new[] { a, a + 1, b, b, a + 1, b + 1 });
            }
            var m = new Mesh { vertices = v, uv = uv, triangles = tri.ToArray() }; m.RecalculateNormals(); m.RecalculateBounds(); return m;
        }
        static GameObject MeshGo(Transform p, Mesh mesh, Material m, Vector3 pos, bool shadow = true)
        {
            var g = new GameObject("mesh", typeof(MeshFilter), typeof(MeshRenderer));
            g.transform.SetParent(p, false); g.transform.localPosition = pos;
            g.GetComponent<MeshFilter>().sharedMesh = mesh; var r = g.GetComponent<MeshRenderer>(); r.sharedMaterial = m;
            if (!shadow) r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            return g;
        }

        static Mesh glassMesh, teaMesh, saucerMesh;
        // İnce belli çay bardağı, tabağında; isteğe bağlı dolu.
        public static Transform TeaGlass(Transform p, Vector3 pos, bool full = true)
        {
            glassMesh ??= Lathe(new[] { new Vector2(.016f, 0), new Vector2(.019f, .008f), new Vector2(.0125f, .04f), new Vector2(.0195f, .082f), new Vector2(.0205f, .086f) });
            teaMesh ??= Lathe(new[] { new Vector2(0, .004f), new Vector2(.017f, .008f), new Vector2(.011f, .04f), new Vector2(.017f, .07f), new Vector2(0, .07f) }, 16);
            saucerMesh ??= Lathe(new[] { new Vector2(0, 0), new Vector2(.04f, 0), new Vector2(.052f, .012f), new Vector2(.054f, .014f) }, 20);
            var root = new GameObject("cay").transform; root.SetParent(p, false); root.localPosition = pos;
            MeshGo(root, saucerMesh, Saucer, Vector3.zero);
            if (full) MeshGo(root, teaMesh, Tea, new Vector3(0, .008f, 0), false);
            MeshGo(root, glassMesh, Glass, new Vector3(0, .008f, 0), false);
            var spoon = Box(root, new Vector3(.003f, .11f, .003f), Steel, new Vector3(.011f, .065f, 0), 0, false, false); spoon.transform.localRotation = Quaternion.Euler(0, 0, -18);
            return root;
        }
        // Servis çayı: bardak + tabak + kaşık + tabakta iki küp şeker.
        public static Transform ServedTea(Transform p, Vector3 pos)
        {
            var t = TeaGlass(p, pos, true);
            Sugar ??= M(new Color(.98f, .98f, .97f), .1f);
            Box(t, new Vector3(.014f, .014f, .014f), Sugar, new Vector3(-.033f, .019f, .008f), 20, false, false);
            Box(t, new Vector3(.014f, .014f, .014f), Sugar, new Vector3(-.03f, .019f, -.012f), -35, false, false);
            return t;
        }
        static Material Sugar;
        // Yuvarlak metal servis tepsisi, kenarlı.
        public static Transform Tray(Transform p)
        {
            var t = new GameObject("tepsi").transform; t.SetParent(p, false);
            Cyl(t, .17f, .006f, Steel, Vector3.zero);
            var rim = Lathe(new[] { new Vector2(.165f, 0), new Vector2(.175f, .012f), new Vector2(.172f, .014f) }, 32);
            MeshGo(t, rim, Steel, Vector3.zero);
            return t;
        }
        public static Transform Coffee(Transform p, Vector3 pos) // Türk kahvesi fincanı
        {
            var root = new GameObject("kahve").transform; root.SetParent(p, false); root.localPosition = pos;
            MeshGo(root, saucerMesh ?? Lathe(new[] { new Vector2(0, 0), new Vector2(.04f, 0), new Vector2(.052f, .012f) }), White, Vector3.zero);
            MeshGo(root, Lathe(new[] { new Vector2(.017f, 0), new Vector2(.024f, .01f), new Vector2(.027f, .05f), new Vector2(.028f, .055f) }), White, new Vector3(0, .01f, 0));
            Cyl(root, .025f, .002f, M(new Color(.2f, .11f, .06f), .4f), new Vector3(0, .058f, 0));
            return root;
        }
        public static Transform Toast(Transform p, Vector3 pos) // tabakta kaşarlı tost
        {
            var root = new GameObject("tost").transform; root.SetParent(p, false); root.localPosition = pos;
            Cyl(root, .1f, .01f, White, new Vector3(0, .005f, 0));
            var bread = M(new Color(.78f, .55f, .27f), .2f);
            var a = Box(root, new Vector3(.12f, .022f, .1f), bread, new Vector3(-.03f, .022f, 0)); a.transform.localRotation = Quaternion.Euler(0, 20, 0);
            var b = Box(root, new Vector3(.12f, .022f, .1f), bread, new Vector3(.035f, .03f, .02f)); b.transform.localRotation = Quaternion.Euler(0, -15, 4);
            return root;
        }

        public static void Teapot(Transform p, Vector3 pos) // çift katlı çaydanlık
        {
            var low = Lathe(new[] { new Vector2(.09f, 0), new Vector2(.11f, .03f), new Vector2(.11f, .16f), new Vector2(.08f, .2f), new Vector2(.06f, .2f) });
            var up = Lathe(new[] { new Vector2(.055f, 0), new Vector2(.075f, .03f), new Vector2(.07f, .11f), new Vector2(.03f, .14f), new Vector2(0, .15f) });
            MeshGo(p, low, Steel, pos); MeshGo(p, up, Steel, pos + new Vector3(0, .2f, 0));
            Box(p, new Vector3(.02f, .02f, .12f), Black, pos + new Vector3(.12f, .14f, 0), 90);
        }

        // Masa: çuha kaplı ceviz oyun masası (Furniture.Table).
        public static Transform Table(Transform p, Vector3 pos) => Furniture.Table(p, pos);
        public static readonly float CornerOut = TableSize / 2 + .075f;

        // Küllük (koyu cam) ve isteğe bağlı tüten sigara.
        public static void Ashtray(Transform p, Vector3 pos, bool smoking)
        {
            var glass = Transparent(new Color(.25f, .22f, .2f, .75f), .9f); glass.color = new Color(.25f, .22f, .2f, .75f);
            MeshGo(p, Lathe(new[] { new Vector2(0, 0), new Vector2(.05f, 0), new Vector2(.055f, .02f), new Vector2(.045f, .022f), new Vector2(.035f, .01f), new Vector2(0, .01f) }, 20), glass, pos);
            if (!smoking) return;
            var cig = Box(p, new Vector3(.007f, .007f, .06f), White, pos + new Vector3(.02f, .025f, 0), 30, false, false); cig.transform.localRotation = Quaternion.Euler(-8, 30, 0);
            Box(cig.transform, new Vector3(1, 1, .3f), M(new Color(.75f, .5f, .2f), .3f), new Vector3(0, 0, -.35f), 0, false, false);
            var ember = cig.transform.TransformPoint(new Vector3(0, 0, .5f));
            Box(p, new Vector3(.008f, .008f, .006f), Emissive(new Color(1f, .35f, .05f), 3f), p.InverseTransformPoint(ember), 30, false, false);
            Smoke(p, p.InverseTransformPoint(ember), .45f);
        }

        // Nargile: cam gövde, metal boru, lüle ve köz, hortum; közden duman yükselir.
        public static void Nargile(Transform p, Vector3 pos, float ry)
        {
            var g = new GameObject("nargile").transform; g.SetParent(p, false); g.localPosition = pos; g.localRotation = Quaternion.Euler(0, ry, 0);
            var vase = Transparent(new Color(.2f, .45f, .5f, .55f), .95f); vase.color = new Color(.2f, .45f, .5f, .55f);
            MeshGo(g, Lathe(new[] { new Vector2(0, 0), new Vector2(.08f, 0), new Vector2(.11f, .08f), new Vector2(.1f, .18f), new Vector2(.04f, .26f), new Vector2(.025f, .3f) }, 24), vase, Vector3.zero);
            var brass = M(new Color(.75f, .55f, .25f), .7f, .9f);
            Cyl(g, .012f, .42f, brass, new Vector3(0, .5f, 0));
            MeshGo(g, Lathe(new[] { new Vector2(.02f, 0), new Vector2(.09f, .01f), new Vector2(.09f, .015f), new Vector2(.02f, .02f) }, 24), brass, new Vector3(0, .62f, 0)); // tabla
            MeshGo(g, Lathe(new[] { new Vector2(.015f, 0), new Vector2(.04f, .05f), new Vector2(.045f, .07f) }, 18), M(new Color(.55f, .25f, .15f), .4f), new Vector3(0, .64f, 0)); // lüle
            for (int i = 0; i < 3; i++) Box(g, new Vector3(.025f, .015f, .025f), Emissive(new Color(1f, .3f, .05f), 2.2f), new Vector3(-.015f + i * .015f, .715f, (i % 2) * .01f), i * 30, false, false); // köz
            // hortum: yere doğru sarkan kavis
            var hose = M(new Color(.12f, .1f, .09f), .5f);
            for (int i = 0; i < 14; i++)
            {
                float t = i / 13f; var a = new Vector3(.05f + t * .35f, .45f - Mathf.Sin(t * Mathf.PI) * .38f + t * .2f, 0);
                var s = GameObject.CreatePrimitive(PrimitiveType.Sphere); Object.Destroy(s.GetComponent<Collider>()); s.transform.SetParent(g, false); s.transform.localPosition = a; s.transform.localScale = Vector3.one * .022f; s.GetComponent<Renderer>().sharedMaterial = hose;
            }
            Smoke(g, new Vector3(0, .74f, 0), 1f);
        }

        static Texture2D puff;
        // Duman: yumuşak gri bulutlar, yavaş yükselir, büyür, dağılır; hafif dalgalanır.
        public static ParticleSystem Smoke(Transform p, Vector3 pos, float strength)
        {
            if (!puff)
            {
                puff = new Texture2D(64, 64, TextureFormat.RGBA32, true);
                for (int y = 0; y < 64; y++) for (int x = 0; x < 64; x++) { float d = Vector2.Distance(new Vector2(x, y), new Vector2(31.5f, 31.5f)) / 32f; puff.SetPixel(x, y, new Color(1, 1, 1, Mathf.Pow(Mathf.Clamp01(1 - d), 2.2f))); }
                puff.Apply();
            }
            var go = new GameObject("duman"); go.transform.SetParent(p, false); go.transform.localPosition = pos;
            var ps = go.AddComponent<ParticleSystem>(); ps.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            var main = ps.main; main.startLifetime = new ParticleSystem.MinMaxCurve(3f, 5f); main.startSpeed = new ParticleSystem.MinMaxCurve(.03f, .07f);
            main.startSize = new ParticleSystem.MinMaxCurve(.03f, .06f); main.startColor = new Color(.85f, .85f, .85f, .35f * strength); main.maxParticles = 80;
            main.simulationSpace = ParticleSystemSimulationSpace.World; main.gravityModifier = -.012f; main.startRotation = new ParticleSystem.MinMaxCurve(0, Mathf.PI * 2);
            var em = ps.emission; em.rateOverTime = 4 + 6 * strength;
            var sh = ps.shape; sh.shapeType = ParticleSystemShapeType.Sphere; sh.radius = .005f;
            var sz = ps.sizeOverLifetime; sz.enabled = true; sz.size = new ParticleSystem.MinMaxCurve(1, AnimationCurve.EaseInOut(0, .4f, 1, 6f));
            var col = ps.colorOverLifetime; col.enabled = true; var grad = new Gradient();
            grad.SetKeys(new[] { new GradientColorKey(Color.white, 0), new GradientColorKey(new Color(.8f, .8f, .82f), 1) }, new[] { new GradientAlphaKey(0, 0), new GradientAlphaKey(1, .15f), new GradientAlphaKey(.5f, .6f), new GradientAlphaKey(0, 1) });
            col.color = grad;
            var noise = ps.noise; noise.enabled = true; noise.strength = .06f; noise.frequency = .6f; noise.scrollSpeed = .3f;
            var rot = ps.rotationOverLifetime; rot.enabled = true; rot.z = new ParticleSystem.MinMaxCurve(-.4f, .4f);
            var r = go.GetComponent<ParticleSystemRenderer>(); r.sharedMaterial = new Material(Lib.I.smoke) { mainTexture = puff }; r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            ps.Play();
            return ps;
        }

        // Sandalye: bükme ahşap, hasır oturaklı (Furniture.Chair). Yerel -z masaya bakar.
        public static Transform Chair(Transform p, Vector3 pos, float ry) => Furniture.Chair(p, pos, ry);

        // Gerçek fotoğraf tablosu (Wikimedia Commons, lisanslar Photos/CREDITS.txt): yükseklik fotoğrafın oranından; koyu ahşap çerçeve + paspartu.
        public static void Photo(Transform p, Texture2D photo, float w, Vector3 pos, float ry)
        {
            float h = w * photo.height / photo.width;
            var g = new GameObject("tablo_" + photo.name).transform; g.SetParent(p, false); g.localPosition = pos; g.localRotation = Quaternion.Euler(0, ry, 0);
            Box(g, new Vector3(w + .08f, h + .08f, .035f), WoodDark, Vector3.zero);
            Box(g, new Vector3(w + .02f, h + .02f, .002f), White, new Vector3(0, 0, .018f), 0, false, false);
            Quad(g, new Vector2(w, h), M(Color.white, .45f, 0, photo), new Vector3(0, 0, .0195f), Quaternion.Euler(0, 180, 0));
        }
        public static void Painting(Transform p, string kind, float w, float h, Vector3 pos, float ry)
        {
            var g = new GameObject("tablo").transform; g.SetParent(p, false); g.localPosition = pos; g.localRotation = Quaternion.Euler(0, ry, 0);
            Box(g, new Vector3(w + .06f, h + .06f, .03f), Brown, Vector3.zero);
            // yerel +z odaya bakar; Unity quad'ı -z'ye baktığı için 180° çevrilir
            Quad(g, new Vector2(w, h), M(Color.white, .3f, 0, Tex.Painting(kind)), new Vector3(0, 0, .017f), Quaternion.Euler(0, 180, 0));
        }

        public static void Fridge(Transform p, Vector3 pos, float ry)
        {
            var g = new GameObject("dolap").transform; g.SetParent(p, false); g.localPosition = pos; g.localRotation = Quaternion.Euler(0, ry, 0);
            var body = Box(g, new Vector3(.7f, 1.95f, .65f), M(new Color(.7f, .1f, .12f), .5f), new Vector3(0, .975f, 0), 0, true);
            var inside = Emissive(Color.white, .9f); inside.mainTexture = Tex.Fridge(); inside.SetTexture("_EmissionMap", inside.mainTexture); inside.EnableKeyword("_EMISSION");
            Quad(g, new Vector2(.56f, 1.42f), inside, new Vector3(0, .93f, -.327f), Quaternion.identity);
            Quad(g, new Vector2(.6f, 1.5f), Glass, new Vector3(0, .93f, -.332f), Quaternion.identity);
            Text3D(g, "SOĞUK İÇECEK", new Vector3(0, 1.82f, -.334f), 0, .07f, Color.white);
            string[] shelves = { "SU", "AYRAN", "GAZOZ", "MEYVE SUYU", "SODA" };
            for (int i = 0; i < shelves.Length; i++) Text3D(g, shelves[i], new Vector3(0, 1.52f - i * .27f, -.338f), 0, .03f, new Color(.15f, .15f, .18f));
            var l = new GameObject("dolapIsigi").AddComponent<Light>(); l.transform.SetParent(g, false); l.transform.localPosition = new Vector3(0, 1f, -.6f);
            l.type = LightType.Point; l.range = 1.6f; l.intensity = .5f; l.color = new Color(.9f, .95f, 1f); l.renderMode = LightRenderMode.ForceVertex;
            body.name = "dolapGovde";
        }

        public static void Radiator(Transform p, Vector3 pos, float ry, float len = 1.4f)
        {
            var g = new GameObject("kalorifer").transform; g.SetParent(p, false); g.localPosition = pos; g.localRotation = Quaternion.Euler(0, ry, 0);
            for (int i = 0; i < len / .05f; i++) Box(g, new Vector3(.035f, .55f, .08f), White, new Vector3(-len / 2 + i * .05f, 0, 0));
        }
        public static void CoatRack(Transform p, Vector3 pos)
        {
            Cyl(p, .015f, 1.8f, Black, pos + new Vector3(0, .9f, 0));
            for (int i = 0; i < 4; i++) { var a = Box(p, new Vector3(.012f, .22f, .012f), Black, pos + Quaternion.Euler(0, i * 90, 0) * new Vector3(.06f, 1.72f, 0)); a.transform.localRotation = Quaternion.Euler(0, i * 90, 40); }
            for (int i = 0; i < 3; i++) { var f = Box(p, new Vector3(.4f, .015f, .02f), Black, pos + Quaternion.Euler(0, i * 120, 0) * new Vector3(.15f, .02f, 0)); f.transform.localRotation = Quaternion.Euler(0, i * 120, 0); }
        }
        public static void SideTable(Transform p, Vector3 pos)
        {
            Box(p, new Vector3(.42f, .03f, .36f), M(new Color(.85f, .81f, .74f), .4f), pos + new Vector3(0, .62f, 0), 0, true);
            for (int x = -1; x <= 1; x += 2) for (int z = -1; z <= 1; z += 2) Box(p, new Vector3(.02f, .62f, .02f), Black, pos + new Vector3(x * .18f, .31f, z * .15f));
        }
        public static void Backgammon(Transform p, Vector3 pos, float ry)
        {
            Box(p, new Vector3(.5f, .03f, .38f), WoodDark, pos + new Vector3(0, .015f, 0), ry);
            Box(p, new Vector3(.46f, .005f, .34f), M(new Color(.62f, .5f, .34f), .3f), pos + new Vector3(0, .032f, 0), ry);
        }
        public static void CardFan(Transform p, Vector3 pos, float ry)
        {
            var back = M(new Color(.78f, .32f, .25f), .3f);
            for (int i = 0; i < 6; i++) Box(p, new Vector3(.058f, .001f, .088f), back, pos + new Vector3(i * .012f, .001f + i * .0006f, 0), ry + (i - 2.5f) * 7);
        }
        // Duvar afişi: Anten (anten.memati.dev). Yerel +z odaya bakar.
        public static void AntenPoster(Transform p, Vector3 pos, float ry)
        {
            var g = new GameObject("afis_anten").transform; g.SetParent(p, false); g.localPosition = pos; g.localRotation = Quaternion.Euler(0, ry, 0);
            var teal = new Color(.24f, .86f, .71f);
            Box(g, new Vector3(.86f, 1.2f, .025f), M(new Color(.05f, .06f, .075f), .4f), Vector3.zero);           // pano
            Box(g, new Vector3(.9f, 1.24f, .02f), M(new Color(.16f, .45f, .38f), .5f), new Vector3(0, 0, -.006f)); // çerçeve
            Quad(g, new Vector2(.32f, .32f), Cutout(Tex.AntenLogo()), new Vector3(0, .3f, .014f), Quaternion.Euler(0, 180, 0));
            void T(string s, float y, float h, Color c) => Text3D(g, s, new Vector3(0, y, .015f), 180, h, c);
            T("YENİ UYGULAMAMIZ", .53f, .042f, teal);
            T("ANTEN", .06f, .13f, Color.white);
            T("piyasada!", -.06f, .05f, new Color(.85f, .88f, .9f));
            T("Uçtan uca şifreli mesajlaşma", -.19f, .036f, new Color(.75f, .78f, .8f));
            T("Takip ve reklam yok", -.25f, .036f, new Color(.75f, .78f, .8f));
            T("Hesap ya da parola gerekmez", -.31f, .036f, new Color(.75f, .78f, .8f));
            T("anten.memati.dev", -.47f, .05f, teal);
        }

        // Mutfak/ocak ürünü: küçük etiketli (marka yok, yalnızca adı).
        public static void Label(Transform p, string text, Vector3 pos, float ry = 0)
        {
            var g = new GameObject("etiket").transform; g.SetParent(p, false); g.localPosition = pos; g.localRotation = Quaternion.Euler(0, ry, 0);
            Box(g, new Vector3(.12f, .035f, .004f), White, Vector3.zero, 0, false, false);
            Text3D(g, text, new Vector3(0, 0, .0025f), 180, .022f, new Color(.15f, .12f, .1f));
        }

        static Font font;
        static Material textMat;
        public static Font UiFont { get { if (font) return font; var lib = Lib.I ? Lib.I : Object.FindAnyObjectByType<Lib>(); return font = lib && lib.uiFont ? lib.uiFont : Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf"); } } // Fira Sans; yoksa yerleşik (Awake sırasından bağımsız)
        // Dünyada yazı (tabela, isim). mirror: arkadan bakılınca ters okunur.
        public static TextMesh Text3D(Transform p, string text, Vector3 pos, float ry, float height, Color color, bool mirror = false)
        {
            var g = new GameObject("yazi"); g.transform.SetParent(p, false); g.transform.localPosition = pos; g.transform.localRotation = Quaternion.Euler(0, ry, 0);
            var tm = g.AddComponent<TextMesh>(); tm.font = UiFont; tm.text = text; tm.fontSize = 96; tm.characterSize = height / 9.6f;
            tm.anchor = TextAnchor.MiddleCenter; tm.alignment = TextAlignment.Center; tm.color = color; tm.fontStyle = FontStyle.Bold;
            textMat ??= new Material(Lib.I.text) { mainTexture = UiFont.material.mainTexture };
            var r = g.GetComponent<MeshRenderer>(); r.sharedMaterial = textMat; r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            if (mirror) g.transform.localScale = new Vector3(-1, 1, 1);
            return tm;
        }
        public static void Fluorescent(Transform p, Vector3 pos)
        {
            Box(p, new Vector3(1.25f, .03f, .07f), Emissive(new Color(.97f, .98f, 1f), 2.2f), pos, 0, false, false);
            Box(p, new Vector3(1.3f, .03f, .11f), White, pos + new Vector3(0, .028f, 0), 0, false, false);
        }
    }
}
