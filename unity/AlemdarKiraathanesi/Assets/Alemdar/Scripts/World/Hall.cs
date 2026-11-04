// Alemdar Kıraathanesi salonu: 3×3 masa + teras, kolonlar, ocak tezgahı, dolap, tablolar, saat, camekân, ışıklar.
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
        public readonly List<(int table, int dir, Transform item, string kind)> CornerItems = new();
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
            Shell(); Storefront(); Windows(); Counter(); Toilet(); Terrace();
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
                for (int k = 0; k < 2; k++) Furniture.Stool(Root, Stool(i, k)); // yancı tabureleri
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
                // köşe bardaklıklarında yarım çay ve küllük (bazılarında sigara tüter). TableService bunları masadaki ikram sayar:
                // o köşeye sipariş gelince kahveci eskisini tepsiye alır (üst üste binmez), bekleyen çaylar zamanla toplanır.
                CornerItems.Add((i, 0, Props.TeaGlass(Root, Corner(i, 0)), "cay")); CornerItems.Add((i, 2, Props.TeaGlass(Root, Corner(i, 2)), "cay"));
                CornerItems.Add((i, 1, Props.Ashtray(Root, Corner(i, 1), i % 3 == 0), "kul"));
            }
            // nargileler: iki masanın yanında, közü tüter
            Props.Nargile(Root, Tables[0] + new Vector3(.95f, 0, -.35f), 20);
            Props.Nargile(Root, Tables[8] + new Vector3(-.95f, 0, .35f), 200);
            foreach (var s in new[] { new Vector3(-2.9f, 0, -3.6f), new Vector3(5.2f, 0, .6f), new Vector3(-5.6f, 0, 3.6f) }) { Props.SideTable(Root, s); Props.TeaGlass(Root, s + new Vector3(0, .635f, 0)); }
            // duvar eşyaları
            Paintings();
            WallDecor();
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
            Locals.Build(this); // masalardaki dayılar, sokaktakiler (birleştirmeden sonra: konuşma yazıları değişebilsin)
        }

        // Coffee Shop (Leartes) ve Apartment Kit (Brick Project) parçalarıyla iç süs: masalarda gazete, camekânda jaluzi,
        // tezgah yanında fiyat tahtası, köşelerde büyük saksılar, duvar rafı, çay ocağında buzdolabı.
        void WallDecor()
        {
            var rng = new System.Random(11);
            for (int i = 0; i < Tables.Count; i++)
                if (i != Home && i % 3 == 1) Apartment.Place(Root, "Props_SM_NewsPaper_15", Tables[i] + SeatRot(i % 4) * new Vector3(.3f, Props.TableTop + .002f, .3f), rng.Next(360), 1, false);
            foreach (var s in new[] { new Vector3(-2.9f, .65f, -3.6f), new Vector3(5.2f, .65f, .6f) }) Apartment.Place(Root, "Props_SM_NewsPaper_15", s, 30, 1, false);
            // camekân jaluzileri: iki yanın üst kısmında, yarı açık (dışarı görünür)
            foreach (float x in new[] { -4.9f, -2.2f, 2.2f, 4.9f }) Apartment.Place(Root, "Blinds_SM_VenetianBlind_Open_5", new Vector3(x, 2.62f, MaxZ - .06f), 0, .9f, false);
            // fiyat tahtası (kara tahta, tebeşir yazısı)
            var board = new Vector3(-2.9f, 1.75f, MinZ + .03f); // dolap (-2.2..-1.3) ile tablo (-4.8..-3.6) arasında
            if (Apartment.Place(Root, "WallProps_SM_Chalkboard_6", board, 0, .8f, false))
            {
                Props.Text3D(Root, "FİYAT LİSTESİ", board + new Vector3(0, .5f, .04f), 180, .07f, new Color(.95f, .93f, .85f));
                string[] menu = { "Çay ............ 10 ₺", "Oralet ........ 10 ₺", "Türk Kahvesi .. 40 ₺", "Tost ........... 60 ₺", "Su ............. 10 ₺", "Ayran ......... 20 ₺" };
                for (int k = 0; k < menu.Length; k++) Props.Text3D(Root, menu[k], board + new Vector3(0, .3f - k * .13f, .04f), 180, .045f, new Color(.92f, .9f, .82f));
            }
            Apartment.Place(Root, "SM_PlantPot_74", new Vector3(MinX + .75f, 0, MaxZ - .8f), 0, .7f);
            Apartment.Place(Root, "SM_PlantPot_74", new Vector3(MaxX - .75f, 0, MaxZ - .9f), 120, .7f);
            Apartment.Place(Root, "WallProps_SM_WallShelves3_2", new Vector3(3f, 1.55f, MinZ + .03f), 0, .8f, false); // tezgah ile Kapadokya tablosu arası
            Sticker(new Vector2(.42f, .63f), Decal(Lib.I.noSmoking), new Vector3(MaxX - .012f, 1.6f, -5.2f), 90); // sağ duvarda sigara içilmez afişi
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
            // camekân çıkartması: kapının iki yanındaki camda logo; dışarıdan düz, içeriden ters okunur
            var logoM = Decal(Lib.I.logo);
            float lh = 1.0f, lw = lh * Lib.I.logo.width / Lib.I.logo.height;
            foreach (float x in new[] { -3.04f, 3.04f }) // kapının yanındaki camın ortası (kayıtların arası)
            {
                Sticker(new Vector2(lw, lh), logoM, new Vector3(x, 1.78f, z + .015f), 180);
                Sticker(new Vector2(-lw, lh), logoM, new Vector3(x, 1.78f, z - .015f), 0); // ayna
            }
            // sigara içilmez afişi: kapının sağındaki camda (içe ve dışa bakar) ve sol duvarda
            var noSmoke = Decal(Lib.I.noSmoking); var ns = new Vector2(.3f, .45f);
            Sticker(ns, noSmoke, new Vector3(1.61f, 1.55f, z + .015f), 180);
            Sticker(ns, noSmoke, new Vector3(1.61f, 1.55f, z - .015f), 0);
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

        // saydam çıkartma malzemesi (camın önünde çizilsin diye cam sırasından sonra)
        static Material Decal(Texture2D t)
        {
            var m = Props.Transparent(Color.white, .6f); m.color = Color.white; m.mainTexture = t; m.renderQueue = 3010; return m;
        }
        void Sticker(Vector2 size, Material m, Vector3 pos, float ry)
            => Props.Quad(Root, size, m, pos, Quaternion.Euler(0, ry, 0)).GetComponent<Renderer>().shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
        // dükkân tabelası: beyaz ışıklı kutu, ince kırmızı çerçeve, ortada logo
        void Sign(Vector3 pos)
        {
            var red = Props.M(new Color(.72f, .03f, .03f), .55f);
            var board = Props.Box(Root, new Vector3(3.4f, .95f, .16f), Props.Emissive(new Color(.97f, .96f, .94f), .35f), pos);
            board.name = "tabela";
            Props.Box(Root, new Vector3(3.5f, 1.05f, .12f), red, pos + new Vector3(0, 0, -.03f));
            var logoM = Decal(Lib.I.logo); logoM.EnableKeyword("_EMISSION"); logoM.SetColor("_EmissionColor", Color.white * .3f); logoM.SetTexture("_EmissionMap", Lib.I.logo);
            float h = .88f; Sticker(new Vector2(h * Lib.I.logo.width / Lib.I.logo.height, h), logoM, pos + new Vector3(0, 0, .082f), 180);
            // iki yanda kırmızı çizgi ve küçük yazı
            foreach (float sx in new[] { -1f, 1f })
            {
                Props.Box(Root, new Vector3(.9f, .025f, .01f), red, pos + new Vector3(sx * 1.17f, .12f, .085f));
                Props.Text3D(Root, sx < 0 ? "ÇAY · KAHVE" : "OKEY · TAVLA", pos + new Vector3(sx * 1.17f, -.05f, .086f), 180, .085f, new Color(.6f, .03f, .03f));
                Props.Box(Root, new Vector3(.9f, .025f, .01f), red, pos + new Vector3(sx * 1.17f, -.2f, .085f));
            }
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

        // Çay ocağı: arka duvarda tezgah (dolaplı), ocak ve semaver; önünde kahvecinin dolaştığı geçit ve servis tezgahı.
        // Servis tezgahının sağ ucu açık: kahveci oradan salona çıkar. Önceki buzlu cam bölme salonu kapatıyordu, kaldırıldı.
        void Counter()
        {
            float x0 = .6f, back = MinZ + .3f, frontZ = MinZ + 1.45f;
            // arka tezgah: ceviz kapaklı alt dolap + mermer üst
            Props.Box(Root, new Vector3(3.4f, .9f, .58f), Props.WoodLight, new Vector3(x0, .45f, back), 0, true);
            Props.Box(Root, new Vector3(3.46f, .04f, .62f), Props.Marble, new Vector3(x0, .92f, back + .01f));
            for (int i = 0; i < 6; i++)
            {
                float cx = x0 - 1.42f + i * .568f;
                Props.Box(Root, new Vector3(.54f, .78f, .015f), Props.Brown, new Vector3(cx, .45f, back + .292f));                        // dolap kapağı
                Props.Box(Root, new Vector3(.12f, .015f, .02f), Props.Steel, new Vector3(cx + (i % 2 == 0 ? .2f : -.2f), .72f, back + .305f)); // kulp
            }
            Props.Box(Root, new Vector3(3.4f, .08f, .02f), Props.Black, new Vector3(x0, .04f, back + .29f)); // süpürgelik
            // ocağın arkasında beyaz fayans
            Props.Box(Root, new Vector3(3.4f, .6f, .02f), Props.Tiled(Props.M(Color.white, .7f, 0, Tex.Tile()), new Vector2(17, 3)), new Vector3(x0, 1.24f, MinZ + .012f));
            // raflarda ince belli bardaklar
            foreach (float sx in new[] { -.9f, .9f })
            {
                Props.Box(Root, new Vector3(1.2f, .04f, .25f), Props.WoodLight, new Vector3(x0 + sx, 1.7f, MinZ + .14f)); Props.Box(Root, new Vector3(1.2f, .04f, .25f), Props.WoodLight, new Vector3(x0 + sx, 2.05f, MinZ + .14f));
                for (int k = 0; k < 7; k++) Props.TeaGlass(Root, new Vector3(x0 + sx - .5f + k * .16f, 1.72f, MinZ + .15f), false);
            }
            Kitchen(x0, back);
            // servis tezgahı: müşteriye bakan ahşap ön, mermer üst; üstünde kek fanusu ve simit sepeti
            Props.Box(Root, new Vector3(2.8f, 1.02f, .5f), Props.WoodLight, new Vector3(x0 - .3f, .51f, frontZ), 0, true);
            Props.Box(Root, new Vector3(2.9f, .05f, .62f), Props.Marble, new Vector3(x0 - .3f, 1.045f, frontZ));
            for (int i = 0; i < 5; i++) Props.Box(Root, new Vector3(.03f, .9f, .02f), Props.Brown, new Vector3(x0 - 1.6f + i * .65f, .5f, frontZ + .26f)); // ön yüzde ahşap çıtalar
            Showcase(x0, frontZ);
            Props.Box(Root, new Vector3(.9f, 2f, .45f), new Material(Props.WoodLight) { color = new Color(.95f, .93f, .9f) }, new Vector3(x0 - 2.35f, 1f, MinZ + .3f), 0, true);
            WaiterSpot = new Vector3(x0 + .4f, 0, MinZ + .95f); // geçidin ortası: arkası ocağa, yüzü salona
        }

        // Arka tezgahın üstü: davlumbazın altında iki gözlü ocak (mavi alev), üstünde çaydanlıklar; yanında semaver,
        // eviye ve musluk, kavanozlar, cezve ve fincanlar, tost makinesi. Marka yok, yalnızca adlar.
        void Kitchen(float x0, float back)
        {
            float top = .94f;
            var stove = new Vector3(x0 - 1.05f, top, back);
            Props.Box(Root, new Vector3(.74f, .06f, .46f), Props.Steel, stove + new Vector3(0, .03f, 0));
            var flame = Props.Emissive(new Color(.25f, .45f, 1f), 2.4f);
            foreach (float dx in new[] { -.18f, .18f })
            {
                Props.Cyl(Root, .075f, .012f, Props.Black, stove + new Vector3(dx, .066f, 0));
                Props.Cyl(Root, .06f, .006f, flame, stove + new Vector3(dx, .074f, 0));
                for (int k = 0; k < 4; k++) Props.Box(Root, new Vector3(.2f, .012f, .012f), Props.Black, stove + new Vector3(dx, .082f, 0), k * 45, false, false);
                Props.Teapot(Root, stove + new Vector3(dx, .088f, 0));
            }
            for (int k = 0; k < 2; k++) Props.Cyl(Root, .015f, .03f, Props.Black, stove + new Vector3(-.18f + k * .36f, .03f, .235f)); // düğmeler
            // davlumbaz: tam ocağın üstünde, duvara yaslı
            var hoodMesh = Props.Lathe(new[] { new Vector2(.56f, 0), new Vector2(.56f, .06f), new Vector2(.18f, .34f), new Vector2(.18f, .36f) }, 4);
            var hood = new GameObject("davlumbaz", typeof(MeshFilter), typeof(MeshRenderer)); hood.transform.SetParent(Root, false);
            hood.transform.localPosition = new Vector3(stove.x, 1.75f, MinZ + .38f); hood.transform.localRotation = Quaternion.Euler(0, 45, 0);
            hood.GetComponent<MeshFilter>().sharedMesh = hoodMesh; hood.GetComponent<MeshRenderer>().sharedMaterial = Props.Steel;
            Props.Box(Root, new Vector3(.24f, Height - 2.1f, .24f), Props.Steel, new Vector3(stove.x, (Height + 2.1f) / 2, MinZ + .38f));
            // semaver: ocağın solunda, musluklu
            var sem = new Vector3(x0 - 1.62f, top, back);
            var semGo = new GameObject("semaver", typeof(MeshFilter), typeof(MeshRenderer)); semGo.transform.SetParent(Root, false); semGo.transform.localPosition = sem;
            semGo.GetComponent<MeshFilter>().sharedMesh = Props.Lathe(new[] { new Vector2(.1f, 0), new Vector2(.13f, .04f), new Vector2(.14f, .3f), new Vector2(.1f, .38f), new Vector2(.05f, .42f), new Vector2(.02f, .5f) }, 24);
            semGo.GetComponent<MeshRenderer>().sharedMaterial = Props.Steel;
            Props.Box(Root, new Vector3(.02f, .02f, .08f), Props.Black, sem + new Vector3(0, .12f, .16f));
            // eviye ve musluk
            var sink = new Vector3(x0 - .35f, top, back);
            Props.Box(Root, new Vector3(.5f, .02f, .4f), Props.Steel, sink + new Vector3(0, .005f, 0));
            Props.Box(Root, new Vector3(.4f, .015f, .3f), Props.Black, sink + new Vector3(0, .012f, 0));
            Props.Box(Root, new Vector3(.025f, .28f, .025f), Props.Steel, sink + new Vector3(0, .14f, -.17f));
            Props.Box(Root, new Vector3(.02f, .02f, .15f), Props.Steel, sink + new Vector3(0, .27f, -.1f));
            // kavanozlar
            var jar = Props.Transparent(new Color(.9f, .95f, .97f, .35f)); jar.color = new Color(.9f, .95f, .97f, .35f);
            (string name, Color fill)[] jars = { ("Çay", new Color(.18f, .1f, .05f)), ("Kahve", new Color(.3f, .18f, .1f)), ("Şeker", new Color(.97f, .97f, .95f)) };
            for (int i = 0; i < jars.Length; i++)
            {
                var p = new Vector3(x0 + .15f + i * .2f, top, back - .12f);
                Props.Cyl(Root, .055f, .14f, Props.M(jars[i].fill, .2f), p + new Vector3(0, .07f, 0));
                Props.Cyl(Root, .062f, .18f, jar, p + new Vector3(0, .09f, 0));
                Props.Cyl(Root, .064f, .02f, Props.Steel, p + new Vector3(0, .19f, 0));
                Props.Label(Root, jars[i].name, p + new Vector3(0, .09f, .066f));
            }
            // cezve ve fincanlar
            var copper = Props.M(new Color(.72f, .4f, .22f), .7f, .9f);
            var cez = new GameObject("cezve", typeof(MeshFilter), typeof(MeshRenderer)); cez.transform.SetParent(Root, false); cez.transform.localPosition = new Vector3(x0 + .82f, top, back);
            cez.GetComponent<MeshFilter>().sharedMesh = Props.Lathe(new[] { new Vector2(0, 0), new Vector2(.045f, 0), new Vector2(.04f, .08f), new Vector2(.05f, .1f) }, 18); cez.GetComponent<MeshRenderer>().sharedMaterial = copper;
            Props.Box(Root, new Vector3(.012f, .01f, .14f), Props.Black, new Vector3(x0 + .82f, top + .08f, back + .1f));
            for (int k = 0; k < 4; k++) Props.Coffee(Root, new Vector3(x0 + 1.02f, top + k * .062f, back - .05f));
            // tost makinesi
            Props.Box(Root, new Vector3(.34f, .1f, .28f), Props.Steel, new Vector3(x0 + 1.38f, top + .05f, back));
            Props.Box(Root, new Vector3(.32f, .03f, .26f), Props.Black, new Vector3(x0 + 1.38f, top + .115f, back));
            Props.Box(Root, new Vector3(.3f, .02f, .02f), Props.Black, new Vector3(x0 + 1.38f, top + .13f, back + .14f));
            Props.Label(Root, "Tost", new Vector3(x0 + 1.38f, top + .05f, back + .145f));
        }
        // Servis tezgahının üstü: fanus altında dilimli kek, sepette simit, servis tepsileri ve bekleyen bir çay.
        void Showcase(float x0, float frontZ)
        {
            float ftop = 1.07f;
            var kek = new Vector3(x0 - 1.1f, ftop, frontZ);
            Props.Cyl(Root, .14f, .015f, Props.White, kek + new Vector3(0, .07f, 0)); Props.Cyl(Root, .025f, .07f, Props.White, kek + new Vector3(0, .035f, 0));
            Props.Cyl(Root, .11f, .08f, Props.M(new Color(.55f, .32f, .14f), .3f), kek + new Vector3(0, .12f, 0));
            Props.Cyl(Root, .112f, .012f, Props.M(new Color(.95f, .9f, .8f), .5f), kek + new Vector3(0, .165f, 0));
            var dome = Props.Transparent(new Color(.95f, .97f, 1f, .2f)); dome.color = new Color(.95f, .97f, 1f, .2f);
            var dm = new GameObject("fanus", typeof(MeshFilter), typeof(MeshRenderer)); dm.transform.SetParent(Root, false); dm.transform.localPosition = kek + new Vector3(0, .077f, 0);
            var prof = new Vector2[10]; for (int i = 0; i < 10; i++) { float a = i / 9f * Mathf.PI / 2; prof[i] = new Vector2(Mathf.Cos(a) * .14f, Mathf.Sin(a) * .16f); }
            dm.GetComponent<MeshFilter>().sharedMesh = Props.Lathe(prof, 28); dm.GetComponent<MeshRenderer>().sharedMaterial = dome;
            Props.Label(Root, "Kek", kek + new Vector3(0, .02f, .16f));
            var basket = new Vector3(x0 - .45f, ftop, frontZ);
            Props.Box(Root, new Vector3(.34f, .06f, .24f), Props.WoodLight, basket + new Vector3(0, .03f, 0));
            for (int i = 0; i < 4; i++) Simit(basket + new Vector3(-.09f + (i % 2) * .17f, .07f + (i / 2) * .02f, -.04f + (i / 2) * .07f));
            Props.Label(Root, "Simit", basket + new Vector3(0, .03f, .13f));
            for (int i = 0; i < 3; i++) Props.Tray(Root).localPosition = new Vector3(x0 + .45f, ftop + .003f + i * .008f, frontZ); // üst üste servis tepsileri
            Props.TeaGlass(Root, new Vector3(x0 + .05f, ftop, frontZ - .1f)); // tezgahta bekleyen çay
        }
        // Tuvalet: salonun sol arka köşesinde fayanslı bölme, yarı açık kapı ve "WC" levhası; içeride klozet, lavabo, ayna, havlu, lamba.
        void Toilet()
        {
            float x0 = MinX, x1 = MinX + 1.6f, z0 = MinZ, z1 = MinZ + 1.6f, doorL = MinX + .7f, doorR = MinX + 1.5f, h = 2.3f;
            var wallM = Props.Tiled(Props.Wall, new Vector2(.7f, 1)); var tile = Props.Tiled(Props.M(Color.white, .7f, 0, Tex.Tile()), new Vector2(6, 4));
            // bölme duvarları (dışı salon sıvası, içi fayans); kapının üstünde lento
            Props.Box(Root, new Vector3(doorL - x0, h, .1f), wallM, new Vector3((x0 + doorL) / 2, h / 2, z1), 0, true);
            Props.Box(Root, new Vector3(x1 - doorR, h, .1f), wallM, new Vector3((doorR + x1) / 2, h / 2, z1), 0, true);
            Props.Box(Root, new Vector3(doorR - doorL, h - 2.05f, .1f), wallM, new Vector3((doorL + doorR) / 2, 2.05f + (h - 2.05f) / 2, z1));
            Props.Box(Root, new Vector3(.1f, h, z1 - z0), wallM, new Vector3(x1, h / 2, (z0 + z1) / 2), 0, true);
            Props.Box(Root, new Vector3(x1 - x0 - .12f, 1.4f, .01f), tile, new Vector3((x0 + x1) / 2, .7f, z0 + .012f));   // iç fayans: arka
            Props.Box(Root, new Vector3(.01f, 1.4f, z1 - z0 - .1f), tile, new Vector3(x0 + .012f, .7f, (z0 + z1) / 2));     // sol
            Props.Box(Root, new Vector3(.01f, 1.4f, z1 - z0 - .1f), tile, new Vector3(x1 - .056f, .7f, (z0 + z1) / 2));     // sağ (içten)
            Props.Box(Root, new Vector3(x1 - x0 - .1f, .02f, z1 - z0 - .1f), Props.Plaster, new Vector3((x0 + x1) / 2, h, (z0 + z1) / 2)); // tavan
            // kapı: menteşe sağda, içe doğru yarı açık; kolu ve kilit
            var hinge = new GameObject("wcKapi").transform; hinge.SetParent(Root, false); hinge.localPosition = new Vector3(doorR, 0, z1); hinge.localRotation = Quaternion.Euler(0, -70, 0);
            Props.Box(hinge, new Vector3(doorR - doorL - .02f, 2.02f, .04f), Props.Brown, new Vector3(-(doorR - doorL) / 2, 1.01f, 0), 0, true);
            Props.Box(hinge, new Vector3(.1f, .02f, .03f), Props.Steel, new Vector3(-(doorR - doorL) + .1f, 1f, .03f));
            Props.Box(hinge, new Vector3(.1f, .02f, .03f), Props.Steel, new Vector3(-(doorR - doorL) + .1f, 1f, -.03f));
            // WC levhası (kapının üstünde, salona bakar)
            Props.Box(Root, new Vector3(.36f, .18f, .02f), Props.Brown, new Vector3((doorL + doorR) / 2, 2.17f, z1 + .06f));
            Props.Text3D(Root, "WC", new Vector3((doorL + doorR) / 2, 2.17f, z1 + .072f), 180, .12f, new Color(.98f, .95f, .85f));
            // klozet: tabanı, hazne ve kapak; arka duvara yaslı
            var white = Props.M(new Color(.97f, .97f, .96f), .85f);
            var bowl = new GameObject("klozet", typeof(MeshFilter), typeof(MeshRenderer)); bowl.transform.SetParent(Root, false); bowl.transform.localPosition = new Vector3(x0 + .45f, 0, z0 + .45f);
            bowl.GetComponent<MeshFilter>().sharedMesh = Props.Lathe(new[] { new Vector2(.1f, 0), new Vector2(.13f, .15f), new Vector2(.2f, .38f), new Vector2(.2f, .4f), new Vector2(.15f, .41f) }, 24);
            bowl.GetComponent<MeshRenderer>().sharedMaterial = white;
            Props.Box(Root, new Vector3(.42f, .02f, .44f), white, new Vector3(x0 + .45f, .42f, z0 + .45f));                     // kapak
            Props.Box(Root, new Vector3(.4f, .4f, .16f), white, new Vector3(x0 + .45f, .62f, z0 + .12f), 0, true);              // hazne
            Props.Box(Root, new Vector3(.06f, .02f, .03f), Props.Steel, new Vector3(x0 + .45f, .83f, z0 + .12f));                // basma düğmesi
            // lavabo, ayna, sabun, havlu
            var sinkP = new Vector3(x1 - .38f, 0, z0 + .2f);
            Props.Box(Root, new Vector3(.42f, .12f, .32f), white, sinkP + new Vector3(0, .82f, 0), 0, true);
            Props.Box(Root, new Vector3(.08f, .7f, .08f), white, sinkP + new Vector3(0, .4f, -.05f));
            Props.Box(Root, new Vector3(.02f, .12f, .02f), Props.Steel, sinkP + new Vector3(0, .94f, -.1f)); Props.Box(Root, new Vector3(.02f, .02f, .08f), Props.Steel, sinkP + new Vector3(0, 1f, -.06f));
            Props.Box(Root, new Vector3(.4f, .5f, .01f), Props.Glass, sinkP + new Vector3(0, 1.45f, -.15f), 0, false, false);
            Props.Box(Root, new Vector3(.44f, .54f, .008f), Props.Steel, sinkP + new Vector3(0, 1.45f, -.157f), 0, false, false);
            Props.Box(Root, new Vector3(.07f, .03f, .05f), Props.M(new Color(.9f, .75f, .4f), .4f), sinkP + new Vector3(.14f, .895f, .02f));
            Props.Box(Root, new Vector3(.3f, .02f, .02f), Props.Steel, new Vector3(x1 - .056f, 1.15f, z0 + .9f)); // havluluk
            Props.Box(Root, new Vector3(.01f, .45f, .28f), Props.M(new Color(.85f, .3f, .25f), .1f), new Vector3(x1 - .07f, .93f, z0 + .9f));
            var l = new GameObject("wcIsigi").AddComponent<Light>(); l.transform.SetParent(Root, false); l.transform.localPosition = new Vector3((x0 + x1) / 2, h - .2f, (z0 + z1) / 2);
            l.type = LightType.Point; l.range = 2.4f; l.intensity = .7f; l.color = new Color(1f, .95f, .85f); l.renderMode = LightRenderMode.ForceVertex;
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
            // duvarlara taş kapak ve koyu süpürgelik: kaldırımdan ayrı, sağlam bir duvar gibi dursun
            var cap = Props.M(new Color(.62f, .6f, .57f), .35f); var plinth = Props.M(new Color(.3f, .29f, .28f), .2f);
            foreach (var (a, b) in new[] { (MinX, -1.1f), (1.1f, MaxX) })
            {
                Props.Box(Root, new Vector3(b - a + .06f, .06f, .32f), cap, new Vector3((a + b) / 2, .93f, TerraceZ));
                Props.Box(Root, new Vector3(b - a + .02f, .12f, .25f), plinth, new Vector3((a + b) / 2, .06f, TerraceZ));
            }
            foreach (float x in new[] { MinX, MaxX })
            {
                Props.Box(Root, new Vector3(.32f, .06f, dz + .1f), cap, new Vector3(x, .93f, mz));
                Props.Box(Root, new Vector3(.25f, .12f, dz), plinth, new Vector3(x, .06f, mz));
            }
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
