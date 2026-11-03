// Sahnedeki varlık kütüphanesi: editör derleme betiği (Build.cs) doldurur. Kod içinden Lib.I ile erişilir.
// Şablon malzemeler derlemede shader çeşitlerinin atılmamasını sağlar (saydam, kesik, ışıklı).
using UnityEngine;

namespace Alemdar
{
    public class Lib : MonoBehaviour
    {
        public static Lib I;
        [Header("Karakter")] public GameObject maleBody, femaleBody;
        public GameObject[] maleHair, femaleHair; public GameObject beard;
        public Texture2D[] maleSkins, femaleSkins; public Texture2D maleNormal, femaleNormal;
        [Tooltip("Microsoft Rocketbox (MIT) erkek karakterleri, malzemeleri takılı hazır kalıplar")] public GameObject[] men; public GameObject waiterBody;
        public GameObject[] women;                 // pencerede dedikodu yapan teyzeler (Rocketbox)
        public GameObject[] children;              // parkta oynayan çocuklar (Rocketbox)
        [Tooltip("Poly Haven CC0 sokak eşyaları, ad = klasör adı")] public GameObject[] phModels;
        public Texture[] skies; public Material skybox; // açık, kapalı, gün batımı, gece
        public RuntimeAnimatorController controller;
        public GameObject Model(string id) => System.Array.Find(phModels ?? new GameObject[0], g => g && g.name == id)
                                           ?? System.Array.Find(storeModels ?? new GameObject[0], g => g && g.name == id);
        [Tooltip("Asset Store paketlerinden kullanılan kalıplar (Coffee Shop, Apartment Kit), ad = kalıp adı")] public GameObject[] storeModels;
        // Poly Haven dokuları: anahtar "klasör/harita" (ör. "beige_wall_001/diff")
        public string[] phTexKeys; public Texture2D[] phTex;
        public Texture2D T(string id, string map) { if (phTexKeys == null) return null; int i = System.Array.IndexOf(phTexKeys, id + "/" + map); return i >= 0 ? phTex[i] : null; }
        [Header("Malzeme şablonları")] public Material opaque, opaqueNormal, cutout, transparent, emissive, character, text, smoke;
        [Header("Poly Haven CC0 dokular (renk, normal)")]
        public Texture2D plasterD, plasterN, darkWoodD, darkWoodN, lightWoodD, lightWoodN, marbleD, marbleN, leatherD, leatherN, fabricN;
        [Header("Tablolar (CC0 fotoğraflar)")] public Texture2D[] photos;
        [Header("Kıraathane logosu (saydam) ve sigara içilmez afişi")] public Texture2D logo, noSmoking;
        void Awake() { I = this; }
    }
}
