// Quaternius karakter, saç ve animasyon FBX'leri: insan (Humanoid) iskeleti, okunabilir mesh (kıyafet maskesi için).
using UnityEditor;

namespace Alemdar.EditorTools
{
    public class ModelImport : AssetPostprocessor
    {
        void OnPreprocessModel()
        {
            if (assetPath.Contains("ThirdParty/PolyHaven"))
            {
                // Poly Haven sokak eşyaları: iskeletsiz, malzemeler Build.Setup'ta kurulur
                var ph = (ModelImporter)assetImporter;
                ph.animationType = ModelImporterAnimationType.None; ph.importAnimation = false;
                ph.materialImportMode = ModelImporterMaterialImportMode.None;
                ph.importCameras = false; ph.importLights = false; ph.useFileScale = true; ph.bakeAxisConversion = true; // Blender ekseni gövdeye işlenir
                return;
            }
            if (assetPath.Contains("ThirdParty/Rocketbox"))
            {
                // Microsoft Rocketbox (MIT): insan iskeleti, malzemeler Build.Setup'ta dokulardan kurulur
                var rb = (ModelImporter)assetImporter;
                rb.animationType = ModelImporterAnimationType.Human; rb.importAnimation = false;
                rb.materialImportMode = ModelImporterMaterialImportMode.ImportStandard;
                rb.importCameras = false; rb.importLights = false; rb.importBlendShapes = false;
                return;
            }
            if (!assetPath.Contains("ThirdParty/Quaternius")) return;
            var mi = (ModelImporter)assetImporter;
            bool anim = assetPath.Contains("/Animations/");
            bool body = assetPath.Contains("/Characters/");
            mi.animationType = (anim || body) ? ModelImporterAnimationType.Human : ModelImporterAnimationType.Generic;
            if (body) mi.isReadable = true;
            mi.importAnimation = anim;
            mi.materialImportMode = ModelImporterMaterialImportMode.ImportStandard;
            mi.importCameras = false; mi.importLights = false;
            mi.useFileScale = true;
        }

        void OnPreprocessTexture()
        {
            var ti = (TextureImporter)assetImporter;
            if (assetPath.Contains("ThirdParty/PolyHavenSky")) { ti.maxTextureSize = 2048; ti.mipmapEnabled = false; ti.textureCompression = TextureImporterCompression.CompressedHQ; return; }
            if (assetPath.Contains("ThirdParty/PolyHaven"))
            {
                if (assetPath.EndsWith("/diff.png")) ti.alphaIsTransparency = true; // yaprak ve lamba camı: alfa kesik
                // Poly Haven CC0: normal haritası, pürüzlülük doğrusal; mermer zemine işlenmek için okunabilir
                if (assetPath.EndsWith("/nor.jpg")) ti.textureType = TextureImporterType.NormalMap;
                if (assetPath.EndsWith("/rough.jpg")) ti.sRGBTexture = false;
                ti.isReadable = assetPath.Contains("marble_01/diff");
                ti.maxTextureSize = 1024; ti.anisoLevel = 8; ti.mipmapEnabled = true;
                return;
            }
            if (assetPath.Contains("Alemdar/Icons/"))
            {
                ti.alphaIsTransparency = true; ti.mipmapEnabled = true; ti.maxTextureSize = 128; ti.wrapMode = UnityEngine.TextureWrapMode.Clamp;
                ti.textureCompression = TextureImporterCompression.Uncompressed; // ince çizgiler bozulmasın (128 px, küçük)
                return;
            }
            if (assetPath.Contains("Alemdar/Brand/"))
            {
                // logo cama yapışan saydam çıkartma; kenarlar yumuşak kalsın
                ti.alphaIsTransparency = true; ti.maxTextureSize = 2048; ti.anisoLevel = 8; ti.mipmapEnabled = true; ti.npotScale = TextureImporterNPOTScale.None;
                ti.textureCompression = TextureImporterCompression.CompressedHQ; ti.wrapMode = UnityEngine.TextureWrapMode.Clamp;
                return;
            }
            if (assetPath.Contains("ThirdParty/Photos"))
            {
                ti.maxTextureSize = 1024; ti.anisoLevel = 4; ti.mipmapEnabled = true; ti.npotScale = TextureImporterNPOTScale.None;
                return;
            }
            if (assetPath.Contains("ThirdParty/Rocketbox"))
            {
                if (assetPath.EndsWith("_normal.png")) ti.textureType = TextureImporterType.NormalMap;
                if (assetPath.Contains("_opacity")) ti.alphaIsTransparency = true;
                ti.maxTextureSize = 1024; ti.anisoLevel = 4; ti.mipmapEnabled = true;
                return;
            }
            if (!assetPath.Contains("ThirdParty/Quaternius")) return;
            if (assetPath.EndsWith("_Normal.png")) ti.textureType = TextureImporterType.NormalMap;
            if (assetPath.Contains("Roughness")) ti.sRGBTexture = false;
            ti.maxTextureSize = 2048;
        }

        // Animasyon kliplerinde döngü: yürüme, koşu, bekleme, oturma döner.
        void OnPreprocessAnimation()
        {
            if (!assetPath.Contains("ThirdParty/Quaternius/Animations")) return;
            var mi = (ModelImporter)assetImporter;
            var clips = mi.defaultClipAnimations;
            foreach (var c in clips)
            {
                string n = c.name.ToLowerInvariant();
                bool loop = n.Contains("idle") || n.Contains("walk") || n.Contains("jog") || n.Contains("run") || n.Contains("sprint") || n.Contains("sit") || n.Contains("loop");
                c.loopTime = loop; c.loopPose = loop;
                c.lockRootRotation = true; c.keepOriginalOrientation = true; // bütün klipler aynı yönde (model düzeltmesi Person.ModelFix)
                c.lockRootHeightY = true; c.keepOriginalPositionY = true;
                c.lockRootPositionXZ = true; c.keepOriginalPositionXZ = true;
            }
            mi.clipAnimations = clips;
        }
    }
}
