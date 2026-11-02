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
        public RuntimeAnimatorController controller;
        [Header("Malzeme şablonları")] public Material opaque, opaqueNormal, cutout, transparent, emissive, character, text, smoke;
        [Header("Poly Haven CC0 dokular (renk, normal)")]
        public Texture2D plasterD, plasterN, darkWoodD, darkWoodN, lightWoodD, lightWoodN, marbleD, marbleN, leatherD, leatherN, fabricN;
        [Header("Tablolar (CC0 fotoğraflar)")] public Texture2D[] photos;
        void Awake() { I = this; }
    }
}
