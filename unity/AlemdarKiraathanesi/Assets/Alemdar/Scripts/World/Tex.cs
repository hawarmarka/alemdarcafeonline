// Kıraathane dokuları: kodla bir kez üretilir (zemin karosu, boya, örtü, ahşap, tablolar, tabela, dolap, ferforje).
using UnityEngine;

namespace Alemdar.World
{
    public static class Tex
    {
        static float Hash(int x, int y, int s = 0) { unchecked { int h = x * 374761393 + y * 668265263 + s * 982451653; h = (h ^ (h >> 13)) * 1274126177; return ((h ^ (h >> 16)) & 0xffff) / 65535f; } }
        static float Noise(float x, float y, int s = 0)
        {
            int xi = Mathf.FloorToInt(x), yi = Mathf.FloorToInt(y); float xf = x - xi, yf = y - yi;
            float a = Hash(xi, yi, s), b = Hash(xi + 1, yi, s), c = Hash(xi, yi + 1, s), d = Hash(xi + 1, yi + 1, s);
            float u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
            return Mathf.Lerp(Mathf.Lerp(a, b, u), Mathf.Lerp(c, d, u), v);
        }
        static float Fbm(float x, float y, int s = 0) { float f = 0, amp = .5f; for (int i = 0; i < 4; i++) { f += Noise(x, y, s + i) * amp; x *= 2; y *= 2; amp *= .5f; } return f; }

        static Texture2D Make(int w, int h, System.Func<int, int, Color> px, bool repeat = true, bool linear = false)
        {
            var t = new Texture2D(w, h, TextureFormat.RGBA32, true, linear) { wrapMode = repeat ? TextureWrapMode.Repeat : TextureWrapMode.Clamp, anisoLevel = 8, filterMode = FilterMode.Trilinear };
            var c = new Color[w * h];
            for (int y = 0; y < h; y++) for (int x = 0; x < w; x++) c[y * w + x] = px(x, y);
            t.SetPixels(c); t.Apply(true, false); return t;
        }

// 60 cm bej seramik (doku başına 2×2 karo), gri derz, kenarda hafif pah; her karoda gerçek mermer damarı (Poly Haven, CC0).
        public static Texture2D Floor(Texture2D marble = null) => Make(1024, 1024, (x, y) =>
        {
            int tile = 512, gx = x % tile, gy = y % tile, tx = x / tile, ty = y / tile;
            int edge = Mathf.Min(Mathf.Min(gx, tile - gx), Mathf.Min(gy, tile - gy));
            if (edge < 4) return new Color(.5f, .48f, .45f);
            float vein = 0;
            if (marble) { var m = marble.GetPixelBilinear((x + tx * 311) / 1024f, (y + ty * 197) / 1024f); vein = 1 - m.grayscale; }
            float n = Fbm(x / 120f, y / 120f, 3) * .05f + Hash(tx, ty, 9) * .035f + vein * .18f;
            float bevel = edge < 10 ? (10 - edge) / 10f * .06f : 0; // karo kenarı hafif koyu
            return new Color(.88f, .85f, .79f) * (1 - n - bevel);
        });
        // Açık gri boya: çok hafif dalga, alt kenarda kirlenme (v=0 alt).
        public static Texture2D Wall() => Make(256, 512, (x, y) =>
        {
            float n = Fbm(x / 40f, y / 40f, 5) * .05f, dirt = Mathf.Clamp01(1 - y / 60f) * .25f * Fbm(x / 12f, 0, 7);
            return new Color(.74f, .75f, .76f) * (1 - n - dirt);
        });
        public static Texture2D Cloth() => Make(256, 256, (x, y) =>
        {
            float weave = ((x + y) % 2 == 0 ? .03f : 0) + Fbm(x / 8f, y / 8f, 2) * .1f;
            return new Color(.05f, .36f, .33f) * (1 - weave);
        });
        public static Texture2D Wood(Color a, Color b) => Make(256, 256, (x, y) =>
        {
            float g = Mathf.Sin((y + Fbm(x / 50f, y / 15f, 4) * 40) * .25f) * .5f + .5f;
            return Color.Lerp(a, b, g * .6f + Fbm(x / 6f, y / 30f, 8) * .3f);
        });
        public static Texture2D Fabric(int seed) => Make(128, 128, (x, y) =>
        {
            float v = .9f + Fbm(x / 6f, y / 6f, seed) * .15f + (((x / 2) + (y / 2)) % 2 == 0 ? .02f : -.02f);
            return new Color(v, v, v);
        }, true, true);

        // Kendi çizimimiz manzara tabloları (Boğaz, gün batımı vapuru, balonlar, orman gölü).
        public static Texture2D Painting(string kind) => Make(480, 320, (x, y) =>
        {
            float u = x / 480f, v = y / 320f, n = Fbm(x / 30f, y / 30f, kind.Length) * .06f;
            Color c;
            switch (kind)
            {
                case "bogaz":
                    c = Color.Lerp(new Color(.82f, .89f, .94f), new Color(.43f, .64f, .84f), v);
                    if (v < .45f) c = new Color(.18f, .43f, .6f);
                    if (v < .3f + Mathf.Sin(u * 6) * .05f) c = new Color(.17f, .29f, .18f);
                    float cable = .47f + Mathf.Pow(u - .45f, 2) * .5f;
                    if (Mathf.Abs(v - cable) < .006f && u > .1f && u < .8f) c = new Color(.85f, .85f, .85f);
                    if ((Mathf.Abs(u - .25f) < .008f || Mathf.Abs(u - .65f) < .008f) && v > .45f && v < .7f) c = new Color(.85f, .85f, .85f);
                    if (v > .52f && v < .6f && Fbm(u * 40, 0, 2) > .45f) c = new Color(.5f, .55f, .6f);
                    break;
                case "vapur":
                    c = Color.Lerp(new Color(.23f, .17f, .15f), new Color(.88f, .63f, .32f), Mathf.Clamp01((v - .3f) * 2.5f));
                    if (v > .75f) c = Color.Lerp(c, new Color(.42f, .29f, .23f), (v - .75f) * 3);
                    if (v < .46f) c = new Color(.16f, .12f, .11f) * (1 + Mathf.Sin(x * .3f) * .05f);
                    if (v > .46f && v < .52f && Fbm(u * 20, 0, 1) > .4f) c = new Color(.2f, .15f, .14f);
                    if (Mathf.Abs(u - .61f) < .015f && v > .46f && v < .7f - Mathf.Abs(u - .61f) * 3) c = new Color(.2f, .15f, .14f);
                    if (u > .38f && u < .68f && v > .34f && v < .42f) c = new Color(.08f, .08f, .1f);
                    if (u > .43f && u < .63f && v > .41f && v < .45f) c = new Color(.1f, .1f, .12f);
                    if (u > .43f && u < .63f && v > .37f && v < .39f && x % 12 < 5) c = new Color(.95f, .75f, .44f);
                    break;
                case "balon":
                    c = Color.Lerp(new Color(.95f, .85f, .69f), new Color(.61f, .78f, .91f), v);
                    if (v < .3f + Fbm(u * 8, 0, 3) * .1f) c = new Color(.72f, .55f, .38f);
                    for (int i = 0; i < 11; i++)
                    {
                        float bx = .08f + Hash(i, 1) * .84f, by = .45f + Hash(i, 2) * .45f, r = .025f + Hash(i, 3) * .03f;
                        if (Mathf.Pow((u - bx) * 1.5f, 2) + Mathf.Pow(v - by, 2) < r * r)
                        { Color[] p = { new(.85f, .28f, .23f), new(.95f, .69f, .2f), new(.25f, .5f, .75f), new(.36f, .63f, .36f), new(.79f, .36f, .6f) }; c = p[i % 5]; }
                    }
                    break;
                default:
                    c = new Color(.79f, .84f, .86f);
                    if (v < .55f + Mathf.Sin(u * 5 + 1) * .12f) c = new Color(.31f, .42f, .32f);
                    if (Mathf.Pow((u - .55f) / .35f, 2) + Mathf.Pow((v - .2f) / .12f, 2) < 1) c = new Color(.24f, .49f, .58f);
                    break;
            }
            return c * (1 - n);
        }, false);

        // EVDO logosu: koyu yeşil oval pano, altın çift çerçeve, üstte küçük çay bardağı simgesi; yazılar (EVDO / KIRAATHANESİ · 1987) 3B metinle üstüne yazılır.
        // Kendi tasarımımız; başka bir oyunun logosu örnek alınmadı.
        public static readonly Color EvdoGreen = new(.06f, .25f, .2f), EvdoGold = new(.86f, .69f, .36f);
        public static Texture2D Badge(bool solid) => Make(512, 320, (x, y) =>
        {
            float u = (x - 256) / 250f, v = (y - 160) / 150f, e = u * u + v * v; // oval
            if (e > 1) return solid ? new Color(EvdoGreen.r, EvdoGreen.g, EvdoGreen.b, 1) : new Color(0, 0, 0, 0); // tabelada panoyla aynı yeşil
            var gold = EvdoGold; gold.a = 1;
            if (e > .9f || (e > .78f && e < .82f)) return gold;                     // çift çerçeve
            // üstte çay bardağı simgesi (belli bardak + tabak)
            float gx = x - 256, gy = y - 228;
            float half = 9 + Mathf.Abs(gy + 4) * .32f;
            if (gy > -26 && gy < 20 && Mathf.Abs(gx) < half) return new Color(.72f, .3f, .12f, 1);
            if (Mathf.Pow(gx / 30f, 2) + Mathf.Pow((gy + 30) / 6f, 2) < 1) return gold;
            if (!solid) return new Color(EvdoGreen.r, EvdoGreen.g, EvdoGreen.b, .82f); // camda hafif saydam
            float n = Fbm(x / 20f, y / 20f, 11) * .06f;
            return new Color(EvdoGreen.r * (1 - n), EvdoGreen.g * (1 - n), EvdoGreen.b * (1 - n), 1);
        }, false);

        // Anten logosu (anten.memati.dev/favicon.svg ile aynı çizim): koyu yuvarlak kare, ortada nokta, iki yanda anten dalgaları.
        public static Texture2D AntenLogo() => Make(256, 256, (x, y) =>
        {
            float u = x / 256f * 32, v = (255 - y) / 256f * 32; // SVG koordinatı (0..32, y aşağı)
            var bg = new Color(.055f, .067f, .086f, 1); var teal = new Color(.24f, .86f, .71f, 1);
            float cx = Mathf.Clamp(u, 9, 23), cy = Mathf.Clamp(v, 9, 23);
            if (Vector2.Distance(new Vector2(u, v), new Vector2(cx, cy)) > 9) return new Color(0, 0, 0, 0); // rx=9 yuvarlak köşe
            float d = Vector2.Distance(new Vector2(u, v), new Vector2(16, 16));
            if (d < 1.9f) return teal;
            float ang = Mathf.Abs(Mathf.Atan2(v - 16, u - 16) * Mathf.Rad2Deg); bool side = ang < 45 || ang > 135; // sol ve sağ yaylar
            if (side && (Mathf.Abs(d - 4) < 1.1f || Mathf.Abs(d - 8.06f) < 1.1f)) return teal;
            return bg;
        }, false);

        public static Texture2D Fridge() => Make(128, 256, (x, y) =>
        {
            int row = y / 40; if (y % 40 < 3) return new Color(.6f, .64f, .66f);
            Color[] cols = { new(.78f, .12f, .16f), new(.91f, .64f, .12f), new(.18f, .6f, .29f), new(.16f, .42f, .77f), new(.95f, .95f, .95f) };
            int bottle = x / 14; if (x % 14 < 2 || y % 40 > 34) return new Color(.85f, .9f, .92f);
            var c = cols[(row + bottle) % cols.Length]; return x % 14 == 4 ? Color.Lerp(c, Color.white, .5f) : c;
        }, false);

        // İskambil arkası: bordo, ince kafes, beyaz kenar.
        public static Texture2D CardBack() => Make(64, 96, (x, y) =>
        {
            if (x < 3 || y < 3 || x > 60 || y > 92) return new Color(.97f, .97f, .95f);
            bool lattice = ((x + y) % 8 < 1) || ((x - y + 96) % 8 < 1);
            return lattice ? new Color(.85f, .6f, .45f) : new Color(.62f, .12f, .14f);
        }, false);
        // Zar ve domino noktaları: n (0..6) noktanın klasik dizilişi, [0,1] karesinde.
        static readonly Vector2[][] Pips =
        {
            new Vector2[0], new[] { new Vector2(.5f, .5f) }, new[] { new Vector2(.25f, .25f), new Vector2(.75f, .75f) },
            new[] { new Vector2(.25f, .25f), new Vector2(.5f, .5f), new Vector2(.75f, .75f) },
            new[] { new Vector2(.25f, .25f), new Vector2(.75f, .25f), new Vector2(.25f, .75f), new Vector2(.75f, .75f) },
            new[] { new Vector2(.25f, .25f), new Vector2(.75f, .25f), new Vector2(.5f, .5f), new Vector2(.25f, .75f), new Vector2(.75f, .75f) },
            new[] { new Vector2(.25f, .2f), new Vector2(.75f, .2f), new Vector2(.25f, .5f), new Vector2(.75f, .5f), new Vector2(.25f, .8f), new Vector2(.75f, .8f) },
        };
        static bool Pip(int n, float u, float v, float r) { foreach (var p in Pips[n]) if ((new Vector2(u, v) - p).sqrMagnitude < r * r) return true; return false; }
        // Domino: fildişi gövde, ortada çizgi, iki yarıda siyah noktalar (uzun kenar v boyunca).
        public static Texture2D Domino(int a, int b) => Make(64, 128, (x, y) =>
        {
            float u = x / 64f, v = y / 128f;
            if (Mathf.Abs(v - .5f) < .012f) return new Color(.2f, .2f, .2f);
            bool pip = v < .5f ? Pip(a, u, v * 2, .1f) : Pip(b, u, (v - .5f) * 2, .1f);
            return pip ? new Color(.07f, .07f, .08f) : new Color(.95f, .93f, .86f);
        }, false);
        public static Texture2D Die(int n) => Make(64, 64, (x, y) => Pip(n, x / 64f, y / 64f, .1f) ? (n == 1 ? new Color(.8f, .1f, .1f) : new Color(.1f, .1f, .1f)) : new Color(.97f, .97f, .95f), false);
        // Tavla tahtası: koyu ahşap zemin, açık ve koyu sivri üçgenler (her yarıda 6+6).
        public static Texture2D BackgammonBoard() => Make(512, 384, (x, y) =>
        {
            float u = x / 512f, v = y / 384f;
            var baseC = Color.Lerp(new Color(.18f, .11f, .07f), new Color(.26f, .16f, .1f), Fbm(x / 30f, y / 6f, 21));
            if (Mathf.Abs(u - .5f) < .02f) return new Color(.12f, .07f, .05f);
            float half = u < .5f ? u / .48f : (u - .52f) / .48f; if (half < 0 || half > 1) return baseC;
            int i = Mathf.FloorToInt(half * 6); float local = half * 6 - i;
            bool topRow = v > .5f; float depth = topRow ? (1 - v) : v; // üçgen kenardan ortaya doğru sivrilir
            float width = 1 - depth / .42f;
            if (depth < .42f && Mathf.Abs(local - .5f) < width * .5f) return ((i + (topRow ? 1 : 0)) % 2 == 0) ? new Color(.86f, .8f, .66f) : new Color(.45f, .1f, .08f);
            return baseC;
        }, false);

        // Kepenk: yatay oluklu metal çıtalar.
        public static Texture2D Shutter() => Make(128, 128, (x, y) =>
        {
            float s = (y % 16) / 16f, rib = s < .12f ? .55f : s < .2f ? 1.08f : 1 - Mathf.Abs(s - .6f) * .25f;
            float n = Fbm(x / 10f, y / 40f, 13) * .08f;
            return new Color(rib - n, rib - n, rib - n);
        });

        // Ferforje pencere: altıgen desen; alfa ile camdan görünür.
        // Hasır oturak: sekizgen kamış örgüsü (Viyana hasırı), bal rengi şeritler, aralarda koyu boşluk.
        public static Texture2D Cane() => Make(256, 256, (x, y) =>
        {
            float u = x / 256f * 8, v = y / 256f * 8;
            float a = Mathf.Abs(Mathf.Repeat(u, 1) - .5f), b = Mathf.Abs(Mathf.Repeat(v, 1) - .5f);
            float d1 = Mathf.Abs(Mathf.Repeat(u + v, 1) - .5f), d2 = Mathf.Abs(Mathf.Repeat(u - v, 1) - .5f);
            float strand = Mathf.Max(Mathf.Max(a < .09f ? 1 : 0, b < .09f ? 1 : 0), Mathf.Max(d1 < .07f ? .9f : 0, d2 < .07f ? .9f : 0));
            float n = Fbm(x * .05f, y * .05f, 3) * .2f;
            var cane = new Color(.78f + n, .6f + n * .8f, .34f + n * .4f);
            return strand > 0 ? cane * (.85f + strand * .15f) : new Color(.12f, .08f, .05f);
        });

        // Çim tutamı (alfa kesik kart): alttan çıkan, hafif kıvrık 40 yaprak; dipte koyu, uçta sarımsı yeşil.
        public static Texture2D GrassTuft()
        {
            const int W = 256, H = 128; var c = new Color[W * H];
            for (int i = 0; i < c.Length; i++) c[i] = new Color(.2f, .3f, .1f, 0);
            for (int b = 0; b < 40; b++)
            {
                float x0 = 12 + Hash(b, 1) * (W - 24), len = H * (.45f + Hash(b, 2) * .52f), bend = (Hash(b, 3) - .5f) * 60, wid = 2.2f + Hash(b, 4) * 2.4f;
                float tint = Hash(b, 5);
                for (int y = 0; y < (int)len; y++)
                {
                    float t = y / len, cx = x0 + bend * t * t, hw = wid * (1 - t * .9f);
                    for (int x = Mathf.Max(0, (int)(cx - hw - 1)); x <= Mathf.Min(W - 1, (int)(cx + hw + 1)); x++)
                    {
                        float a = Mathf.Clamp01(hw + .5f - Mathf.Abs(x - cx)); if (a <= 0) continue;
                        var col = Color.Lerp(new Color(.13f, .24f, .07f), Color.Lerp(new Color(.42f, .58f, .2f), new Color(.6f, .65f, .28f), tint), t);
                        ref var dst = ref c[y * W + x]; if (a > dst.a) dst = new Color(col.r, col.g, col.b, a);
                    }
                }
            }
            var tex = new Texture2D(W, H, TextureFormat.RGBA32, true) { wrapMode = TextureWrapMode.Clamp, anisoLevel = 4, filterMode = FilterMode.Trilinear };
            tex.SetPixels(c); tex.Apply(true, false); return tex;
        }

        public static Texture2D Grille() => Make(256, 256, (x, y) =>
        {
            float u = (x % 64) / 64f, v = (y % 64) / 64f;
            float d = Mathf.Min(Mathf.Abs(Mathf.Abs(u - .5f) * 2 + Mathf.Abs(v - .5f) - .9f), Mathf.Abs(v - .5f) < .03f && Mathf.Abs(u - .5f) > .4f ? 0 : 1);
            return d < .05f ? new Color(.12f, .12f, .12f, 1) : new Color(.8f, .88f, .92f, .18f);
        });

        public static Texture2D Saucer() => Make(128, 128, (x, y) =>
        {
            float dx = x - 64, dy = y - 64, a = Mathf.Atan2(dy, dx), r = Mathf.Sqrt(dx * dx + dy * dy);
            bool band = r > 44 && r < 58 && Mathf.Repeat(a * 12 / (Mathf.PI * 2), 1) < .5f;
            return band ? new Color(.77f, .09f, .11f) : new Color(.97f, .97f, .97f);
        }, false);
    }
}
