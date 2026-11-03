// EVDO Kıraathanesi salonu: 3×3 masa + teras, kolonlar, ocak tezgahı, dolap, tablolar, saat, camekân, ışıklar.
// Koordinatlar: +z camekâna/terasa, -z ocağa doğru. Masa koltukları: 0 güney (+z), 1 doğu, 2 kuzey, 3 batı.
using System.Collections.Generic;
using UnityEngine;

namespace Alemdar.World
{
    public class Hall : MonoBehaviour
    {
        public const float MinX = -6.6f, MaxX = 6.6f, MinZ = -6.2f, MaxZ = 5.0f, Height = 3.0f, TerraceZ = 8.2f;
        public const int Home = 4;
        public static readonly float SeatDist = Props.TableSize / 2 + .3f;
        public readonly List<Vector3> Tables = new();
        public readonly List<GameObject> Decor = new(); // masa başına dekor oyun takımı
        public void SetDecor(int table, bool on) { if (table >= 0 && table < Decor.Count && Decor[table]) Decor[table].SetActive(on); }
        public Vector3 WaiterSpot { get; private set; }
        public Transform Root { get; private set; }

        public static Quaternion SeatRot(int dir) => Quaternion.Euler(0, dir * 90, 0);
        public Vector3 Seat(int table, int dir, float extra = 0) => Tables[table] + SeatRot(dir) * new Vector3(0, 0, SeatDist + extra);
        // Oyuncunun kendi köşe bardaklığı: oturduğu yerin sol köşesi (sağ köşe taş atma yeri). Her köşe tek oyuncunun.
        public Vector3 Corner(int table, int dir) => Tables[table] + SeatRot(dir) * new Vector3(Props.CornerOut, Props.TableTop + .002f, Props.CornerOut);
        // Yancı tabureleri: masanın iki köşesinde
        public Vector3 Stool(int table, int k) => Tables[table] + Quaternion.Euler(0, 45 + k * 180, 0) * new Vector3(0, 0, .95f);

        public void Build()
        {
            Props.Init();
            Root = new GameObject("Salon").transform; Root.SetParent(transform, false);
            foreach (float z in new[] { -3f, 0f, 3f }) foreach (float x in new[] { -4.2f, 0f, 4.2f }) Tables.Add(new Vector3(x, 0, z));
            Tables.Add(new Vector3(-4.2f, 0, 6.6f)); Tables.Add(new Vector3(4.2f, 0, 6.6f));
            Shell(); Storefront(); Windows(); Counter(); Terrace();
            // kolonlar
            foreach (var c in new[] { new Vector3(-2.1f, 0, -1.5f), new Vector3(2.1f, 0, -1.5f), new Vector3(-2.1f, 0, 1.5f), new Vector3(2.1f, 0, 1.5f) })
            {
                Props.Box(Root, new Vector3(.36f, Height, .36f), Props.Plaster, c + new Vector3(0, Height / 2, 0), 0, true);
                Props.Box(Root, new Vector3(.38f, .26f, .38f), Props.Brown, c + new Vector3(0, 1.05f, 0));
            }
            // masalar, sandalyeler, yancı tabureleri, masa süsleri
            var stoolM = Props.Black;
            for (int i = 0; i < Tables.Count; i++)
            {
                var t = Tables[i];
                Props.Table(Root, t);
                for (int d = 0; d < 4; d++) Props.Chair(Root, Seat(i, d, .06f), d * 90);
                for (int k = 0; k < 2; k++) { var s = Stool(i, k); Props.Cyl(Root, .16f, .03f, Props.ChairSeat, s + new Vector3(0, .5f, 0)); Props.Cyl(Root, .02f, .5f, stoolM, s + new Vector3(0, .25f, 0)); }
                // her masada ayrı oyun: okey, batak, pişti, domino, tavla (gerçek oyun o masaya gelince gizlenir: SetDecor)
                var decor = new GameObject("oyunTakimi_" + i).transform; decor.SetParent(Root, false); Decor.Add(decor.gameObject);
                if (i == Home) continue;
                switch (i % 5)
                {
                    case 0: TableSets.OkeySet(decor, t, i); break;
                    case 1: TableSets.Cards(decor, t, i, false); break;   // batak
                    case 2: TableSets.Backgammon(decor, t, i * 17, i); break;
                    case 3: TableSets.Domino(decor, t, i); break;
                    case 4: TableSets.Cards(decor, t, i, true); break;    // pişti
                }
                // köşe bardaklıklarında çay ve küllük (bazılarında sigara tüter)
                Props.TeaGlass(Root, Corner(i, 0)); Props.TeaGlass(Root, Corner(i, 2));
                Props.Ashtray(Root, Corner(i, 1), i % 3 == 0);
            }
            // nargileler: iki masanın yanında, közü tüter
            Props.Nargile(Root, Tables[0] + new Vector3(.95f, 0, -.35f), 20);
            Props.Nargile(Root, Tables[8] + new Vector3(-.95f, 0, .35f), 200);
            foreach (var s in new[] { new Vector3(-2.9f, 0, -3.6f), new Vector3(5.2f, 0, .6f), new Vector3(-5.6f, 0, 3.6f) }) { Props.SideTable(Root, s); Props.TeaGlass(Root, s + new Vector3(0, .635f, 0)); }
            // duvar eşyaları
            Paintings();
            Props.AntenPoster(Root, new Vector3(MaxX - .03f, 1.75f, -3.4f), -90); // yeni uygulamamız Anten
            var clock = new GameObject("saat").AddComponent<WallClock>(); clock.transform.SetParent(Root, false); clock.transform.localPosition = new Vector3(MaxX - .03f, 2.25f, -1f); clock.transform.localRotation = Quaternion.Euler(0, -90, 0); clock.Build();
            Props.Fridge(Root, new Vector3(MaxX - .45f, 0, MinZ + .4f), 180);
            Tv.Build(transform, new Vector3(MaxX - .08f, 2.1f, 0f), -90); // sağ duvarda, salonun her yerinden görünür (StaticBatching dışında: ekranı değişir)
            Props.CoatRack(Root, new Vector3(MinX + .4f, 0, .4f));
            Lights();
            Neighborhood.Build(transform); // üstte apartman, sokak, park, çay bahçesi, teyzeler
            Weather.Install(gameObject);   // gün döngüsü, gökyüzü, yağmur, gece ışıkları
            // Salon ve mahalle hareket etmez: aynı malzemeli parçalar tek çizimde birleşir (binlerce küçük parça → birkaç yüz çizim).
            StaticBatchingUtility.Combine(Root.gameObject);
            StaticBatchingUtility.Combine(Neighborhood.Root.gameObject);
        }

        // Duvarlardaki tablolar: gerçek fotoğraflar (Galata, Kız Kulesi, Boğaz, Kapadokya, Uzungöl, Sümela, yayla, Ölüdeniz); yoksa kendi çizimimiz.
        void Paintings()
        {
            (string photo, float w, Vector3 pos, float ry)[] spots =
            {
                ("galata", 1.15f, new Vector3(-4.2f, 1.9f, MinZ + .03f), 0), ("kapadokya", 1.0f, new Vector3(4.4f, 1.9f, MinZ + .03f), 0),
                ("bogaz", 1.3f, new Vector3(MaxX - .03f, 1.9f, 1.5f), -90), ("uzungol", 1.0f, new Vector3(MaxX - .03f, 1.9f, 3.9f), -90),
                ("kizkulesi", 1.2f, new Vector3(MinX + .03f, 1.9f, -.4f), 90), ("sumela", .8f, new Vector3(MinX + .03f, 1.9f, 4.2f), 90),
                ("yayla", .8f, new Vector3(MinX + .03f, 1.9f, -5.2f), 90),
            };
            var photos = Lib.I.photos ?? new Texture2D[0];
            foreach (var (name, w, pos, ry) in spots)
            {
                var tex = System.Array.Find(photos, t => t && t.name == name);
                if (tex) Props.Photo(Root, tex, w, pos, ry); else Props.Painting(Root, "bogaz", w, w * .62f, pos, ry);
            }
        }

        void Shell()
        {
            float W = MaxX - MinX, D = MaxZ - MinZ, cx = 0, cz = (MinZ + MaxZ) / 2;
            var floorM = Props.Tiled(Props.FloorM, new Vector2(W / 1.2f, (TerraceZ - MinZ) / 1.2f));
            Props.Box(Root, new Vector3(W, .1f, TerraceZ - MinZ), floorM, new Vector3(cx, -.05f, (MinZ + TerraceZ) / 2), 0, true);
            var wallBack = Props.Tiled(Props.Wall, new Vector2(W / 2.5f, Height / 2.5f));
            var wallSide = Props.Tiled(Props.Wall, new Vector2(D / 2.5f, Height / 2.5f));
            Props.Box(Root, new Vector3(W + .4f, Height, .2f), wallBack, new Vector3(cx, Height / 2, MinZ - .1f), 0, true);
            Props.Box(Root, new Vector3(.2f, Height, D), wallSide, new Vector3(MinX - .1f, Height / 2, cz), 0, true);
            Props.Box(Root, new Vector3(.2f, Height, D), wallSide, new Vector3(MaxX + .1f, Height / 2, cz), 0, true);
            // kahverengi duvar şeridi
            Props.Box(Root, new Vector3(W, .14f, .02f), Props.Brown, new Vector3(cx, 1.05f, MinZ + .01f));
            Props.Box(Root, new Vector3(.02f, .14f, D), Props.Brown, new Vector3(MinX + .01f, 1.05f, cz));
            Props.Box(Root, new Vector3(.02f, .14f, D), Props.Brown, new Vector3(MaxX - .01f, 1.05f, cz));
            // tavan ve kirişler
            Props.Box(Root, new Vector3(W + .4f, .2f, D + .4f), Props.Plaster, new Vector3(cx, Height + .1f, cz));
            foreach (float x in new[] { -2.1f, 2.1f }) Props.Box(Root, new Vector3(.3f, .32f, D), Props.Plaster, new Vector3(x, Height - .16f, cz));
            foreach (float z in new[] { -1.5f, 1.5f }) Props.Box(Root, new Vector3(W, .28f, .28f), Props.Plaster, new Vector3(cx, Height - .14f, z));
            foreach (float z in new[] { -3f, 0f, 3f }) foreach (float x in new[] { -4.2f, 0f, 4.2f }) Props.Fluorescent(Root, new Vector3(x, Height - .04f, z));
        }

        void Storefront()
        {
            var frame = Props.White; float z = MaxZ, doorL = -.9f, doorR = .9f;
            foreach (var (a, b) in new[] { (MinX, doorL), (doorR, MaxX) })
            {
                float w = b - a, mx = (a + b) / 2;
                Props.Box(Root, new Vector3(w, .8f, .18f), Props.Plaster, new Vector3(mx, .4f, z), 0, true);
                Props.Box(Root, new Vector3(w, 1.85f, .02f), Props.Glass, new Vector3(mx, 1.72f, z), 0, true, false);
                int n = Mathf.Max(1, Mathf.RoundToInt(w / 1.5f));
                for (int i = 0; i <= n; i++) Props.Box(Root, new Vector3(.07f, 1.9f, .09f), frame, new Vector3(a + w * i / n, 1.72f, z));
                Props.Box(Root, new Vector3(w, .07f, .09f), frame, new Vector3(mx, .8f, z)); Props.Box(Root, new Vector3(w, .07f, .09f), frame, new Vector3(mx, 2.65f, z));
            }
            Props.Box(Root, new Vector3(MaxX - MinX, Height - 2.65f, .2f), Props.Plaster, new Vector3(0, (Height + 2.65f) / 2, z), 0, true);
            foreach (float x in new[] { doorL, doorR }) Props.Box(Root, new Vector3(.09f, 2.65f, .12f), frame, new Vector3(x, 1.325f, z));
            // camekân yazısı (EVDO logosu): dışarıdan okunur, içeriden ters görünür
            var signM = Props.Cutout(Tex.Badge(false));
            var outside = Props.Quad(Root, new Vector2(1.7f, 1.06f), signM, new Vector3(3.2f, 1.85f, z + .015f), Quaternion.Euler(0, 180, 0));
            var inside = Props.Quad(Root, new Vector2(-1.7f, 1.06f), signM, new Vector3(3.2f, 1.85f, z - .015f), Quaternion.identity); // ayna
            foreach (var s in new[] { outside, inside }) s.GetComponent<Renderer>().shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            foreach (var (zz, ry, mirror) in new[] { (z + .02f, 180f, false), (z - .02f, 0f, true) }) Logo(new Vector3(3.2f, 1.85f, zz), ry, 1f, mirror);
            // kepenk kutuları: her camın üstünde, dışarıda; kepenk gündüz yukarıda, alt çıtası görünür
            var shutter = Props.Tiled(Props.M(new Color(.62f, .63f, .64f), .45f, .6f, Tex.Shutter()), new Vector2(4, 1));
            foreach (var (a, b) in new[] { (MinX, doorL), (doorR, MaxX) })
            {
                float w = b - a, mx = (a + b) / 2;
                Props.Box(Root, new Vector3(w, .26f, .26f), Props.M(new Color(.55f, .56f, .57f), .4f, .6f), new Vector3(mx, 2.8f, z + .2f));
                Props.Box(Root, new Vector3(w - .04f, .1f, .02f), shutter, new Vector3(mx, 2.63f, z + .2f));
                foreach (float x in new[] { a + .04f, b - .04f }) Props.Box(Root, new Vector3(.05f, 2.6f, .06f), Props.Steel, new Vector3(x, 1.3f, z + .12f)); // ray
            }
            // dükkân tabelası: teras saçağının önünde, sokağa bakar; ışıklı
            Sign(new Vector3(0, 2.45f, TerraceZ + .05f));
        }

        // EVDO yazısı: büyük EVDO, altında KIRAATHANESİ · 1987 (ölçek 1 = camekân boyu)
        void Logo(Vector3 pos, float ry, float s, bool mirror)
        {
            var gold = Tex.EvdoGold;
            Props.Text3D(Root, "EVDO", pos + Vector3.down * .02f * s, ry, .3f * s, gold, mirror);
            Props.Text3D(Root, "KIRAATHANESİ · 1987", pos + Vector3.down * .3f * s, ry, .07f * s, new Color(.95f, .92f, .84f), mirror);
        }
        void Sign(Vector3 pos)
        {
            var board = Props.Box(Root, new Vector3(3.2f, .9f, .14f), Props.M(Tex.EvdoGreen, .35f), pos);
            board.name = "tabela";
            Props.Box(Root, new Vector3(3.28f, .98f, .1f), Props.M(Tex.EvdoGold, .6f, .7f), pos + new Vector3(0, 0, -.03f));
            var badge = Props.Emissive(Color.white, .25f); badge.mainTexture = Tex.Badge(true); badge.SetTexture("_EmissionMap", badge.mainTexture);
            Props.Quad(Root, new Vector2(1.3f, .81f), badge, pos + new Vector3(-.9f, 0, .075f), Quaternion.Euler(0, 180, 0));
            Props.Text3D(Root, "EVDO", pos + new Vector3(.55f, .14f, .08f), 180, .36f, Tex.EvdoGold);
            Props.Text3D(Root, "KIRAATHANESİ", pos + new Vector3(.55f, -.2f, .08f), 180, .12f, new Color(.95f, .92f, .84f));
            var l = new GameObject("tabelaIsigi").AddComponent<Light>(); l.transform.SetParent(Root, false); l.transform.localPosition = pos + new Vector3(0, -.2f, .9f);
            l.type = LightType.Point; l.range = 3f; l.intensity = .6f; l.color = new Color(1f, .93f, .78f); l.renderMode = LightRenderMode.ForceVertex;
        }

        void Windows()
        {
            var grille = Props.Cutout(Tex.Grille()); grille.mainTextureScale = new Vector2(3, 2);
            foreach (float z in new[] { -3f, 2.2f })
            {
                Props.Quad(Root, new Vector2(2.2f, 1.3f), grille, new Vector3(MinX + .012f, 1.9f, z), Quaternion.Euler(0, -90, 0));
                foreach (float dz in new[] { -1.12f, 1.12f }) Props.Box(Root, new Vector3(.06f, 1.38f, .06f), Props.White, new Vector3(MinX + .03f, 1.9f, z + dz));
                Props.Box(Root, new Vector3(.06f, .06f, 2.3f), Props.White, new Vector3(MinX + .03f, 2.57f, z)); Props.Box(Root, new Vector3(.12f, .06f, 2.3f), Props.White, new Vector3(MinX + .05f, 1.23f, z));
                Props.Radiator(Root, new Vector3(MinX + .09f, .55f, z), 90, 1.5f);
            }
        }

        void Counter()
        {
            float z0 = MinZ + .45f, x0 = .6f;
            Props.Box(Root, new Vector3(3.4f, 1.05f, .5f), Props.Plaster, new Vector3(x0, .525f, z0 + .6f), 0, true);
            Props.Box(Root, new Vector3(3.5f, .05f, .6f), Props.Marble, new Vector3(x0, 1.07f, z0 + .6f));
            var frost = Props.Transparent(new Color(.86f, .9f, .92f, .5f), .6f);
            for (int i = 0; i < 6; i++)
            {
                Props.Quad(Root, new Vector2(.5f, .5f), frost, new Vector3(x0 - 1.4f + i * .56f, 1.35f, z0 + .62f), Quaternion.Euler(0, 180, 0)); // yüzü müşteriye (+z)
                Props.Box(Root, new Vector3(.04f, .55f, .05f), Props.White, new Vector3(x0 - 1.68f + i * .56f, 1.35f, z0 + .62f));
            }
            Props.Box(Root, new Vector3(3.4f, .9f, .55f), Props.WoodLight, new Vector3(x0, .45f, MinZ + .3f), 0, true);
            Props.Box(Root, new Vector3(3.4f, .04f, .6f), Props.Marble, new Vector3(x0, .92f, MinZ + .3f));
            for (int i = 0; i < 3; i++) Props.Teapot(Root, new Vector3(x0 - 1.2f + i * .32f, .94f, MinZ + .32f));
            foreach (float sx in new[] { -.9f, .9f })
            {
                Props.Box(Root, new Vector3(1.2f, .04f, .25f), Props.WoodLight, new Vector3(x0 + sx, 1.7f, MinZ + .14f)); Props.Box(Root, new Vector3(1.2f, .04f, .25f), Props.WoodLight, new Vector3(x0 + sx, 2.05f, MinZ + .14f));
                for (int k = 0; k < 7; k++) Props.TeaGlass(Root, new Vector3(x0 + sx - .5f + k * .16f, 1.72f, MinZ + .15f), false);
            }
            Kitchen(x0, z0);
            Props.Box(Root, new Vector3(.9f, 2f, .45f), new Material(Props.WoodLight) { color = new Color(.95f, .93f, .9f) }, new Vector3(x0 - 2.35f, 1f, MinZ + .3f), 0, true);
            WaiterSpot = new Vector3(x0 + 2.2f, 0, z0 + 1.0f);
        }

        // Ocak: davlumbaz, kavanozlar (Çay/Kahve/Şeker), cezve ve fincanlar, tost makinesi, eviye; ön tezgahta kek ve simit.
        // Marka yok: her ürünün yalnızca adı yazar.
        void Kitchen(float x0, float z0)
        {
            float back = MinZ + .3f, top = .94f, front = z0 + .6f, ftop = 1.095f;
            // davlumbaz: aşağı doğru genişleyen paslanmaz çelik + baca
            var hoodMesh = Props.Lathe(new[] { new Vector2(.62f, 0), new Vector2(.62f, .06f), new Vector2(.2f, .36f), new Vector2(.2f, .38f) }, 4);
            var hood = new GameObject("davlumbaz", typeof(MeshFilter), typeof(MeshRenderer)); hood.transform.SetParent(Root, false);
            hood.transform.localPosition = new Vector3(x0 - 1.05f, 1.95f, back + .1f); hood.transform.localRotation = Quaternion.Euler(0, 45, 0);
            hood.GetComponent<MeshFilter>().sharedMesh = hoodMesh; hood.GetComponent<MeshRenderer>().sharedMaterial = Props.Steel;
            Props.Box(Root, new Vector3(.26f, .7f, .26f), Props.Steel, new Vector3(x0 - 1.05f, 2.65f, back + .1f));
            // kavanozlar
            var jar = Props.Transparent(new Color(.9f, .95f, .97f, .35f)); jar.color = new Color(.9f, .95f, .97f, .35f);
            (string name, Color fill)[] jars = { ("Çay", new Color(.18f, .1f, .05f)), ("Kahve", new Color(.3f, .18f, .1f)), ("Şeker", new Color(.97f, .97f, .95f)) };
            for (int i = 0; i < jars.Length; i++)
            {
                var p = new Vector3(x0 + .15f + i * .2f, top, back + .05f);
                Props.Cyl(Root, .055f, .14f, Props.M(jars[i].fill, .2f), p + new Vector3(0, .07f, 0));
                Props.Cyl(Root, .062f, .18f, jar, p + new Vector3(0, .09f, 0));
                Props.Cyl(Root, .064f, .02f, Props.Steel, p + new Vector3(0, .19f, 0));
                Props.Label(Root, jars[i].name, p + new Vector3(0, .09f, .066f));
            }
            // cezve ve fincanlar
            var copper = Props.M(new Color(.72f, .4f, .22f), .7f, .9f);
            var cez = new GameObject("cezve", typeof(MeshFilter), typeof(MeshRenderer)); cez.transform.SetParent(Root, false); cez.transform.localPosition = new Vector3(x0 + .8f, top, back + .08f);
            cez.GetComponent<MeshFilter>().sharedMesh = Props.Lathe(new[] { new Vector2(0, 0), new Vector2(.045f, 0), new Vector2(.04f, .08f), new Vector2(.05f, .1f) }, 18); cez.GetComponent<MeshRenderer>().sharedMaterial = copper;
            Props.Box(Root, new Vector3(.012f, .01f, .14f), Props.Black, new Vector3(x0 + .8f, top + .08f, back + .18f));
            for (int k = 0; k < 4; k++) Props.Coffee(Root, new Vector3(x0 + 1.0f, top + k * .062f, back + .08f));
            // tost makinesi
            Props.Box(Root, new Vector3(.34f, .1f, .28f), Props.Steel, new Vector3(x0 + 1.35f, top + .05f, back + .06f));
            Props.Box(Root, new Vector3(.32f, .03f, .26f), Props.Black, new Vector3(x0 + 1.35f, top + .115f, back + .06f));
            Props.Box(Root, new Vector3(.3f, .02f, .02f), Props.Black, new Vector3(x0 + 1.35f, top + .13f, back + .2f));
            Props.Label(Root, "Tost", new Vector3(x0 + 1.35f, top + .05f, back + .205f));
            // eviye ve musluk
            Props.Box(Root, new Vector3(.45f, .02f, .36f), Props.Steel, new Vector3(x0 - .45f, top + .005f, back));
            Props.Box(Root, new Vector3(.02f, .25f, .02f), Props.Steel, new Vector3(x0 - .45f, top + .12f, back - .16f));
            Props.Box(Root, new Vector3(.02f, .02f, .14f), Props.Steel, new Vector3(x0 - .45f, top + .24f, back - .1f));
            // ön tezgah: fanus altında kek (dilimli), sepette simit
            var kek = new Vector3(x0 - .9f, ftop, front);
            Props.Cyl(Root, .14f, .015f, Props.White, kek + new Vector3(0, .07f, 0)); Props.Cyl(Root, .025f, .07f, Props.White, kek + new Vector3(0, .035f, 0));
            Props.Cyl(Root, .11f, .08f, Props.M(new Color(.55f, .32f, .14f), .3f), kek + new Vector3(0, .12f, 0));
            Props.Cyl(Root, .112f, .012f, Props.M(new Color(.95f, .9f, .8f), .5f), kek + new Vector3(0, .165f, 0));
            var dome = Props.Transparent(new Color(.95f, .97f, 1f, .2f)); dome.color = new Color(.95f, .97f, 1f, .2f);
            var dm = new GameObject("fanus", typeof(MeshFilter), typeof(MeshRenderer)); dm.transform.SetParent(Root, false); dm.transform.localPosition = kek + new Vector3(0, .077f, 0);
            var prof = new Vector2[10]; for (int i = 0; i < 10; i++) { float a = i / 9f * Mathf.PI / 2; prof[i] = new Vector2(Mathf.Cos(a) * .14f, Mathf.Sin(a) * .16f); }
            dm.GetComponent<MeshFilter>().sharedMesh = Props.Lathe(prof, 28); dm.GetComponent<MeshRenderer>().sharedMaterial = dome;
            Props.Label(Root, "Kek", kek + new Vector3(0, .02f, .15f));
            var basket = new Vector3(x0 + .3f, ftop, front);
            Props.Box(Root, new Vector3(.34f, .06f, .24f), Props.WoodLight, basket + new Vector3(0, .03f, 0));
            for (int i = 0; i < 4; i++) Simit(basket + new Vector3(-.09f + (i % 2) * .17f, .07f + (i / 2) * .02f, -.04f + (i / 2) * .07f));
            Props.Label(Root, "Simit", basket + new Vector3(0, .03f, .125f));
        }
        void Simit(Vector3 p)
        {
            var m = Props.M(new Color(.62f, .36f, .14f), .25f);
            for (int i = 0; i < 14; i++) { float a = i / 14f * Mathf.PI * 2; Props.Box(Root, new Vector3(.03f, .022f, .035f), m, p + new Vector3(Mathf.Cos(a) * .055f, 0, Mathf.Sin(a) * .055f), -a * Mathf.Rad2Deg); }
        }

        void Terrace()
        {
            var steel = Props.Black; float mz = (MaxZ + TerraceZ) / 2, dz = TerraceZ - MaxZ;
            // ön duvar: ortada sokağa açılan geçit (dükkân kapısının hizasında)
            foreach (var (a, b) in new[] { (MinX, -1.1f), (1.1f, MaxX) }) Props.Box(Root, new Vector3(b - a, .9f, .22f), Props.Plaster, new Vector3((a + b) / 2, .45f, TerraceZ), 0, true);
            Props.Box(Root, new Vector3(.22f, .9f, dz), Props.Plaster, new Vector3(MinX, .45f, mz), 0, true);
            Props.Box(Root, new Vector3(.22f, .9f, dz), Props.Plaster, new Vector3(MaxX, .45f, mz), 0, true);
            foreach (float x in new[] { MinX + .2f, -2.2f, 2.2f, MaxX - .2f }) Props.Box(Root, new Vector3(.1f, 2.8f, .1f), steel, new Vector3(x, 1.4f, TerraceZ - .1f));
            Props.Box(Root, new Vector3(MaxX - MinX, .12f, .12f), steel, new Vector3(0, 2.8f, TerraceZ - .1f));
            var roof = Props.Box(Root, new Vector3(MaxX - MinX, .03f, dz + .4f), new Material(Props.Black) { color = new Color(.25f, .26f, .27f) }, new Vector3(0, 2.95f, mz));
            roof.transform.localRotation = Quaternion.Euler(-3, 0, 0);
            for (float x = MinX; x < MaxX; x += .3f) Props.Box(Root, new Vector3(.04f, .04f, dz + .4f), steel, new Vector3(x, 2.93f, mz), 0, false, false);
        }

        void Lights()
        {
            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Trilight;
            RenderSettings.ambientSkyColor = new Color(.62f, .65f, .68f); RenderSettings.ambientEquatorColor = new Color(.45f, .45f, .44f); RenderSettings.ambientGroundColor = new Color(.28f, .26f, .24f);
            RenderSettings.fog = true; RenderSettings.fogMode = FogMode.Linear; RenderSettings.fogColor = new Color(.82f, .85f, .87f); RenderSettings.fogStartDistance = 16; RenderSettings.fogEndDistance = 50;
            var sun = new GameObject("Gunes").AddComponent<Light>(); sun.type = LightType.Directional;
            sun.transform.rotation = Quaternion.Euler(38, 200, 0); sun.intensity = 1.25f; sun.color = new Color(1f, .95f, .86f);
            sun.shadows = LightShadows.Soft; sun.shadowStrength = .85f; sun.shadowBias = .03f; sun.shadowNormalBias = .3f;
            RenderSettings.sun = sun;
            foreach (float z in new[] { -3f, 0f, 3f }) foreach (float x in new[] { -4.2f, 0f, 4.2f })
            {
                var l = new GameObject("Floresan").AddComponent<Light>(); l.transform.SetParent(Root, false); l.transform.localPosition = new Vector3(x, Height - .25f, z);
                // köşe ışığı: her ışık ayrı çizim geçişi istemez (FPS); yumuşak dolgu için yeterli
                l.type = LightType.Point; l.range = 6.5f; l.intensity = .9f; l.color = new Color(.96f, .97f, 1f); l.shadows = LightShadows.None; l.renderMode = LightRenderMode.ForceVertex;
            }
            var probe = new GameObject("Yansima").AddComponent<ReflectionProbe>(); probe.transform.SetParent(Root, false); probe.transform.localPosition = new Vector3(0, 1.4f, -.6f);
            probe.size = new Vector3(MaxX - MinX, Height, MaxZ - MinZ); probe.mode = UnityEngine.Rendering.ReflectionProbeMode.Realtime;
            probe.refreshMode = UnityEngine.Rendering.ReflectionProbeRefreshMode.ViaScripting; probe.boxProjection = true; probe.resolution = 256;
            probe.RenderProbe(); // bir kez: zemin parlaklığı için, karede maliyeti yok
            Camera.main.backgroundColor = new Color(.82f, .87f, .9f); Camera.main.clearFlags = CameraClearFlags.SolidColor;
        }
    }

    // Gerçek saati gösteren duvar saati.
    public class WallClock : MonoBehaviour
    {
        Transform hour, minute;
        public void Build()
        {
            Props.Box(transform, new Vector3(.36f, .36f, .04f), Props.Brown, Vector3.zero);
            Props.Box(transform, new Vector3(.32f, .32f, .01f), Props.White, new Vector3(0, 0, .022f));
            for (int i = 0; i < 12; i++) Props.Box(transform, new Vector3(.008f, .025f, .005f), Props.Black, Quaternion.Euler(0, 0, i * 30) * new Vector3(0, .13f, 0) + new Vector3(0, 0, .028f)).transform.localRotation = Quaternion.Euler(0, 0, i * 30);
            hour = Pivot(.07f, .012f); minute = Pivot(.11f, .008f);
        }
        Transform Pivot(float len, float w)
        {
            var p = new GameObject("ibre").transform; p.SetParent(transform, false); p.localPosition = new Vector3(0, 0, .03f);
            Props.Box(p, new Vector3(w, len, .004f), Props.Black, new Vector3(0, len / 2, 0)); return p;
        }
        void Update()
        {
            if (Time.frameCount % 30 != 0) return;
            var now = System.DateTime.Now;
            minute.localRotation = Quaternion.Euler(0, 0, -now.Minute * 6f);
            hour.localRotation = Quaternion.Euler(0, 0, -((now.Hour % 12) * 30f + now.Minute * .5f));
        }
    }
}
