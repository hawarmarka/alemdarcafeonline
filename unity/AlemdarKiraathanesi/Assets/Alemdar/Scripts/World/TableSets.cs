// Boş masalardaki oyun takımları: her masada ayrı oyun oynanıyormuş gibi (okey, batak/pişti kâğıtları, domino, tavla).
// Hepsi durağandır; salon kurulurken bir kez çizilir ve diğer eşyalarla birleşir (StaticBatchingUtility).
using System.Collections.Generic;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace Alemdar.World
{
    public static class TableSets
    {
        static readonly string[] Colors = { "Kirmizi", "Yesil", "Mavi", "Siyah" };
        static Quaternion R(int dir) => Hall.SeatRot(dir);

        // ---------- okey: dört ıstaka, dizilmiş taşlar, ortada deste, köşelerde atılan taşlar ----------
        public static void OkeySet(Transform p, Vector3 table, int seed)
        {
            var rng = new System.Random(seed); float top = Props.TableTop;
            for (int dir = 0; dir < 4; dir++)
            {
                var rack = new GameObject("istaka").transform; rack.SetParent(p, false);
                rack.localPosition = table + R(dir) * new Vector3(0, top, Alemdar.Okey.OkeyTable.RackZ); rack.localRotation = R(dir);
                Alemdar.Okey.OkeyTable.BuildRack(rack);
                // üst sırada serisi dizilmiş, alt sırada karışık: oyun ortasındaki bir el
                int start = rng.Next(1, 8);
                for (int c = 0; c < 11; c++) Tile(rack, Alemdar.Okey.OkeyTable.RackSpot(0, c + 2), Colors[(c / 4 + dir) % 4], (start + c % 4 - 1) % 13 + 1);
                for (int c = 0; c < 10; c++) if (rng.NextDouble() < .85) Tile(rack, Alemdar.Okey.OkeyTable.RackSpot(1, c + 3), Colors[rng.Next(4)], rng.Next(1, 14));
                // sağ köşede atılan taş yığını
                var pile = table + R(dir) * new Vector3(-.39f, top, .39f);
                for (int k = 0; k < 2 + rng.Next(3); k++) Flat(p, pile + Vector3.up * (k * Alemdar.Okey.TileView.D), Colors[rng.Next(4)], rng.Next(1, 14), dir * 90 + 180);
            }
            // ortada deste (sırtı dönük beşerli sıralar) ve gösterge
            for (int s = 0; s < 4; s++) for (int k = 0; k < 4; k++) Flat(p, table + new Vector3(-.06f + s * .034f, top + k * Alemdar.Okey.TileView.D, -.02f), null, 0, 0);
            Flat(p, table + new Vector3(.1f, top, .04f), Colors[rng.Next(4)], rng.Next(1, 14), 0);
        }
        static void Tile(Transform parent, Vector3 local, string color, int number)
        {
            var t = Alemdar.Okey.TileView.Make(parent); Object.Destroy(t.GetComponent<Collider>());
            t.transform.localPosition = local; t.transform.localRotation = Quaternion.Euler(Alemdar.Okey.OkeyTable.Lean, 0, 0);
            t.Set(new JObject { ["color"] = color, ["number"] = number }, false);
        }
        static void Flat(Transform parent, Vector3 pos, string color, int number, float ry)
        {
            var t = Alemdar.Okey.TileView.Make(parent); Object.Destroy(t.GetComponent<Collider>());
            t.transform.localPosition = pos + Vector3.up * (Alemdar.Okey.TileView.D / 2); t.transform.localRotation = Quaternion.Euler(90, ry, 0);
            t.Set(color == null ? null : new JObject { ["color"] = color, ["number"] = number }, false);
        }

        // ---------- kâğıt: batak (dört el + ortada el) ya da pişti (ortada yığın + alınan kâğıtlar) ----------
        static Material cardBack, cardFace;
        public static void Cards(Transform p, Vector3 table, int seed, bool pisti)
        {
            var rng = new System.Random(seed); float top = Props.TableTop + .001f;
            cardBack ??= Props.M(Color.white, .35f, 0, Tex.CardBack());
            cardFace ??= Props.M(new Color(.98f, .98f, .96f), .3f);
            for (int dir = 0; dir < 4; dir++)
            {
                // oyuncunun önünde yelpaze halinde kapalı kâğıtlar
                var c = table + R(dir) * new Vector3(rng.Next(-5, 5) * .01f, top, .3f);
                for (int i = 0; i < (pisti ? 4 : 9); i++) Card(p, c + new Vector3(0, i * .0006f, 0), dir * 90 + (i - 4) * 7f + 180, null);
                // aldığı eller / kâğıtlar: yanına kapalı küçük deste
                if (rng.NextDouble() < .7) for (int k = 0; k < 3 + rng.Next(6); k++) Card(p, table + R(dir) * new Vector3(.3f, top + k * .0007f, .2f), dir * 90 + 90 + rng.Next(-6, 6), null);
            }
            // ortada açık kâğıtlar
            string[] suits = { "♠", "♥", "♦", "♣" }; string[] ranks = { "A", "K", "Q", "J", "10", "9", "7", "5" };
            int n = pisti ? 6 : 4;
            for (int i = 0; i < n; i++)
            {
                var pos = pisti ? table + new Vector3(rng.Next(-3, 3) * .004f, top + .003f + i * .0007f, rng.Next(-3, 3) * .004f)
                                : table + R(i) * new Vector3(0, top + .003f, .07f);
                Card(p, pos, pisti ? rng.Next(0, 360) : i * 90 + rng.Next(-12, 12), suits[rng.Next(4)] + ranks[rng.Next(ranks.Length)]);
            }
        }
        static void Card(Transform p, Vector3 pos, float ry, string face) => Furniture.Card(p, pos, ry, face);
        // ---------- domino: ortada yılan gibi dizilmiş taşlar, oyuncuların önünde ayakta taşlar ----------
        static readonly Dictionary<int, Material> dominoFaces = new();
        public static void Domino(Transform p, Vector3 table, int seed)
        {
            var rng = new System.Random(seed); float top = Props.TableTop;
            var backM = Props.M(new Color(.08f, .08f, .09f), .7f);
            int a = rng.Next(7);
            Vector3 pos = table + new Vector3(-.28f, top, -.05f); float ry = 90;
            for (int i = 0; i < 11; i++)
            {
                int b = rng.Next(7);
                DominoTile(p, pos, ry, a, b, true);
                // yılan: düz gider, kenara gelince döner
                var step = Quaternion.Euler(0, ry, 0) * new Vector3(0, 0, .06f);
                pos += step;
                if (i == 6) { ry += 90; pos += Quaternion.Euler(0, ry, 0) * new Vector3(0, 0, .015f); }
                a = b;
            }
            for (int dir = 0; dir < 4; dir++)
                for (int k = 0; k < 4; k++)
                {
                    Furniture.DominoStanding(p, table + R(dir) * new Vector3((k - 1.5f) * .034f, top, .36f), dir * 90);
                }
        }
        static void DominoTile(Transform p, Vector3 pos, float ry, int a, int b, bool flat) => Furniture.DominoFlat(p, pos, ry, a, b);

        // ---------- tavla: üçgenli tahta, pullar, zarlar ----------
        public static void Backgammon(Transform p, Vector3 table, float ry, int seed)
        {
            var rng = new System.Random(seed); float top = Props.TableTop;
            var g = Furniture.Backgammon(p, table + Vector3.up * top, ry);
            // başlangıç dizilişine yakın: 2-5-3-5 pul, iki tarafta
            int[] cols = { 0, 5, 7, 11 }; int[] counts = { 2, 5, 3, 5 };
            for (int side = 0; side < 2; side++)
                for (int s = 0; s < 4; s++)
                    for (int k = 0; k < counts[s]; k++)
                    {
                        int col = cols[s] + (rng.NextDouble() < .2 ? 1 : 0);
                        float x = -.215f + col * .036f + (col >= 6 ? .02f : 0), z = (side == 0 ? -.16f : .16f) + (side == 0 ? 1 : -1) * k * .026f;
                        Furniture.Checker(g, new Vector3(x, .0205f, z), (s + side) % 2 == 0);
                    }
            // zarlar
            for (int d = 0; d < 2; d++)
            {
                Furniture.Die(g, new Vector3(.07f + d * .025f, .0275f, rng.Next(-3, 3) * .01f), rng.Next(0, 90), 1 + rng.Next(6));
            }
        }
    }
}
