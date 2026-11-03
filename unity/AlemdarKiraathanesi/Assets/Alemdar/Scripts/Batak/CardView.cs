// İskambil kâğıdı (Batak): yuvarlak köşeli ince kart. Yerel düzen: yüz +y; yazıların üstü +z kenarı (elde ve masada bakana göre yukarıda).
// Yüzde köşe indeksleri ve ortada büyük simge (resimli kâğıtlarda harf); kapalı kartta iki yüzde de sırt deseni.
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace Alemdar.Batak
{
    public class CardView : MonoBehaviour
    {
        public const float W = .058f, H = .088f;
        public string Id; public string Suit; public int Rank;
        public Vector3 Home; public Quaternion HomeRot;
        bool dim;
        static Material face, faceDim, back;
        static Mesh body, backQuad;

        static readonly string[] Ranks = { "", "", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A" };
        public static string Glyph(string s) => s switch { "S" => "♠", "H" => "♥", "D" => "♦", _ => "♣" };
        public static bool Red(string s) => s == "H" || s == "D";

        public static CardView Make(Transform parent, JToken card, bool collider = false)
        {
            face ??= World.Props.M(new Color(.99f, .98f, .96f), .45f);
            back ??= World.Props.M(Color.white, .5f, 0, World.Tex.CardBack());
            faceDim ??= World.Props.M(new Color(.62f, .62f, .6f), .3f); // oynanamayan: gri yüz (yazıyı örtmez)
            body ??= World.Furniture.RBox(new Vector3(W, .0009f, H), .0004f);
            backQuad ??= QuadUp(W - .004f, H - .004f);
            var g = new GameObject("kagit"); g.transform.SetParent(parent, false);
            g.AddComponent<MeshFilter>().sharedMesh = body; g.AddComponent<MeshRenderer>().sharedMaterial = face;
            var v = g.AddComponent<CardView>();
            if (collider) { var c = g.AddComponent<BoxCollider>(); c.size = new Vector3(W, .006f, H); }
            v.Set(card);
            return v;
        }

        public void Set(JToken card)
        {
            foreach (Transform c in transform) Destroy(c.gameObject);
            dim = false; GetComponent<MeshRenderer>().sharedMaterial = face;
            Id = (string)card?["id"]; Suit = (string)card?["suit"]; Rank = (int?)card?["rank"] ?? 0;
            if (card == null)
            {
                Child(backQuad, back, new Vector3(0, .00048f, 0), Quaternion.identity);
                Child(backQuad, back, new Vector3(0, -.00048f, 0), Quaternion.Euler(180, 0, 0));
                return;
            }
            // Sade, okunaklı yüz: sol üstte büyük rakam/harf, sağ üstte simge, ortada büyük simge. Altta ters köşe yok.
            var ink = Red(Suit) ? new Color(.88f, .06f, .09f) : new Color(.05f, .05f, .07f);
            string r = Ranks[Mathf.Clamp(Rank, 0, 14)], s = Glyph(Suit);
            // yazı yatık: Euler(90, 0, 0); ekranda denendi: kartın üstü +z kenarında okunur, bakanın solu -x
            TextMesh T(string text, Vector3 at, float h) { var tm = World.Props.Text3D(transform, text, at, 0, h, ink); tm.transform.localRotation = Quaternion.Euler(90, 0, 0); return tm; }
            var rank = T(r, new Vector3(-W / 2 + .0055f, .0006f, H / 2 - .0105f), .02f); rank.anchor = TextAnchor.MiddleLeft;
            if (r.Length > 1) rank.transform.localScale = new Vector3(.78f, 1, 1); // "10" sığsın
            var small = T(s, new Vector3(W / 2 - .0055f, .0006f, H / 2 - .0105f), .017f); small.anchor = TextAnchor.MiddleRight;
            T(s, new Vector3(0, .0006f, -.009f), .052f);
        }
        // Oynanamayan kâğıt soluk görünür: yüzü griye döner, yazılar okunur kalır.
        public void SetDim(bool on)
        {
            if (on == dim || Id == null) return;
            dim = on; GetComponent<MeshRenderer>().sharedMaterial = on ? faceDim : face;

        }

        GameObject Child(Mesh m, Material mat, Vector3 pos, Quaternion rot)
        {
            var g = new GameObject("yuz", typeof(MeshFilter), typeof(MeshRenderer)); g.transform.SetParent(transform, false); g.transform.SetLocalPositionAndRotation(pos, rot);
            g.GetComponent<MeshFilter>().sharedMesh = m; var r = g.GetComponent<MeshRenderer>(); r.sharedMaterial = mat; r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            return g;
        }
        // yukarı bakan dikdörtgen (sırt deseni, gölge)
        static Mesh QuadUp(float w, float h)
        {
            var m = new Mesh();
            m.vertices = new[] { new Vector3(-w / 2, 0, -h / 2), new Vector3(w / 2, 0, -h / 2), new Vector3(w / 2, 0, h / 2), new Vector3(-w / 2, 0, h / 2) };
            m.uv = new[] { new Vector2(0, 0), new Vector2(1, 0), new Vector2(1, 1), new Vector2(0, 1) };
            m.triangles = new[] { 0, 2, 1, 0, 3, 2 }; m.RecalculateNormals(); m.RecalculateBounds();
            if (m.normals[0].y < 0) { m.triangles = new[] { 0, 1, 2, 0, 2, 3 }; m.RecalculateNormals(); }
            return m;
        }
    }
}
