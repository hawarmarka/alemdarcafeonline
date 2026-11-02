// Komut satırı: Unity -batchmode -quit -projectPath ... -executeMethod Alemdar.EditorTools.Build.Windows
// Sahne, animasyon denetleyicisi, şablon malzemeler ve oyuncu ayarları kodla kurulur; çıktı: unity/Build/AlemdarKiraathanesi.exe
// Derleme sonrası oyun sunucusu (Node + server/ + node_modules/) Build/Server altına kopyalanır.
using System.IO;
using System.Linq;
using UnityEditor;
using UnityEditor.Animations;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;

namespace Alemdar.EditorTools
{
    public static class Build
    {
        const string Gen = "Assets/Alemdar/Generated", Q = "Assets/ThirdParty/Quaternius/", ScenePath = "Assets/Alemdar/Main.unity";
        static string Repo => Path.GetFullPath(Path.Combine(Application.dataPath, "..", "..", ".."));

        [MenuItem("Alemdar/Sahneyi Kur")]
        public static void Setup()
        {
            Directory.CreateDirectory(Gen);
            AssetDatabase.Refresh();
            // içe aktarma kuralı (ModelImport) değişince animasyonlar yeniden aktarılsın
            AssetDatabase.ImportAsset(Q + "Animations/UAL1_Standard.fbx", ImportAssetOptions.ForceUpdate);
            var controller = Controller();
            var mats = Materials();
            var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
            var cam = new GameObject("Main Camera", typeof(Camera), typeof(AudioListener)); cam.tag = "MainCamera";
            var c = cam.GetComponent<Camera>(); c.nearClipPlane = .03f; c.farClipPlane = 80; c.allowHDR = true; c.allowMSAA = true; c.fieldOfView = 55;
            cam.transform.position = new Vector3(0, 1.8f, 9.5f);
            var libGo = new GameObject("Kutuphane"); var lib = libGo.AddComponent<Lib>();
            lib.maleBody = Load<GameObject>("Characters/Superhero_Male_FullBody.fbx"); lib.femaleBody = Load<GameObject>("Characters/Superhero_Female_FullBody.fbx");
            lib.maleHair = new[] { "Hair_SimpleParted", "Hair_Buzzed", "Hair_SimpleParted", "Hair_Long" }.Select(n => Load<GameObject>($"Hair/{n}.fbx")).ToArray();
            lib.femaleHair = new[] { "Hair_Long", "Hair_Buns", "Hair_BuzzedFemale" }.Select(n => Load<GameObject>($"Hair/{n}.fbx")).ToArray();
            lib.beard = Load<GameObject>("Hair/Hair_Beard.fbx");
            lib.maleSkins = new[] { Load<Texture2D>("Characters/Textures/T_Superhero_Male_Ligh.png"), Load<Texture2D>("Characters/Textures/T_Superhero_Male_Dark.png") };
            lib.femaleSkins = new[] { Load<Texture2D>("Characters/Textures/T_Superhero_Female_Light_BaseColor.png"), Load<Texture2D>("Characters/Textures/T_Superhero_Female_Dark_BaseColor.png") };
            lib.maleNormal = Load<Texture2D>("Characters/Textures/T_Superhero_Male_Normal.png"); lib.femaleNormal = Load<Texture2D>("Characters/Textures/T_Superhero_Female_Normal.png");
            lib.controller = controller;
            (lib.opaque, lib.cutout, lib.transparent, lib.emissive, lib.character, lib.text) = mats;
            Texture2D PH(string id, string map) => AssetDatabase.LoadAssetAtPath<Texture2D>($"Assets/ThirdParty/PolyHaven/{id}/{map}.jpg");
            lib.plasterD = PH("painted_plaster_wall", "diff"); lib.plasterN = PH("painted_plaster_wall", "nor");
            lib.darkWoodD = PH("dark_wood", "diff"); lib.darkWoodN = PH("dark_wood", "nor");
            lib.lightWoodD = PH("fine_grained_wood", "diff"); lib.lightWoodN = PH("fine_grained_wood", "nor");
            lib.marbleD = PH("marble_01", "diff"); lib.marbleN = PH("marble_01", "nor");
            lib.leatherD = PH("fabric_leather_02", "diff"); lib.leatherN = PH("fabric_leather_02", "nor");
            lib.fabricN = PH("fabric_pattern_07", "nor");
            // normal haritalı ve duman şablonları (shader çeşitleri derlemeye girsin)
            var on = new Material(Shader.Find("Standard")) { enableInstancing = true }; on.SetTexture("_BumpMap", lib.plasterN); on.EnableKeyword("_NORMALMAP");
            AssetDatabase.DeleteAsset(Gen + "/OpakNormal.mat"); AssetDatabase.CreateAsset(on, Gen + "/OpakNormal.mat"); lib.opaqueNormal = on;
            var smoke = new Material(Shader.Find("Legacy Shaders/Particles/Alpha Blended"));
            AssetDatabase.DeleteAsset(Gen + "/Duman.mat"); AssetDatabase.CreateAsset(smoke, Gen + "/Duman.mat"); lib.smoke = smoke;
            var ph = new[] { lib.plasterD, lib.darkWoodD, lib.lightWoodD, lib.marbleD, lib.leatherD };
            if (ph.Any(t => !t)) throw new System.Exception("Poly Haven dokusu eksik");
            new GameObject("Uygulama").AddComponent<App>();
            EditorSceneManager.SaveScene(scene, ScenePath);
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };
            Settings();
            AssetDatabase.SaveAssets();
        }

        static T Load<T>(string rel) where T : Object
        {
            var a = AssetDatabase.LoadAssetAtPath<T>(Q + rel);
            if (!a) throw new System.Exception("Varlık yok: " + rel);
            return a;
        }
        static AnimationClip Clip(string name)
        {
            var c = AssetDatabase.LoadAllAssetsAtPath(Q + "Animations/UAL1_Standard.fbx").OfType<AnimationClip>().FirstOrDefault(x => x.name == "Armature|" + name);
            if (!c) throw new System.Exception("Klip yok: " + name);
            return c;
        }

        static AnimatorController Controller()
        {
            string path = Gen + "/Kisiler.controller";
            AssetDatabase.DeleteAsset(path);
            var ac = AnimatorController.CreateAnimatorControllerAtPath(path);
            ac.AddParameter("Speed", AnimatorControllerParameterType.Float);
            ac.AddParameter("Sit", AnimatorControllerParameterType.Bool);
            ac.AddParameter("Talk", AnimatorControllerParameterType.Bool);
            ac.AddParameter("Serve", AnimatorControllerParameterType.Trigger);
            var layers = ac.layers; layers[0].iKPass = true; ac.layers = layers;
            var sm = ac.layers[0].stateMachine;
            // yürüyüş: bekle → yürü → koş (hıza göre karışım; ayak kayması olmasın diye eşikler gerçek adım hızına yakın)
            var move = ac.CreateBlendTreeInController("Hareket", out var tree, 0);
            tree.blendType = BlendTreeType.Simple1D; tree.blendParameter = "Speed"; tree.useAutomaticThresholds = false;
            tree.AddChild(Clip("Idle_Loop"), 0f); tree.AddChild(Clip("Walk_Loop"), 1.45f); tree.AddChild(Clip("Jog_Fwd_Loop"), 3.4f);
            sm.defaultState = move;
            var sitIn = sm.AddState("Oturuyor"); sitIn.motion = Clip("Sitting_Enter");
            var sit = sm.AddState("Oturma"); sit.motion = Clip("Sitting_Idle_Loop");
            var talk = sm.AddState("OturupKonusma"); talk.motion = Clip("Sitting_Talking_Loop");
            var sitOut = sm.AddState("Kalkiyor"); sitOut.motion = Clip("Sitting_Exit");
            var serve = sm.AddState("Servis"); serve.motion = Clip("PickUp_Table");
            T(move, sitIn, .15f, false, ("Sit", true)); T(sitIn, sit, .2f, true); T(sit, talk, .3f, false, ("Talk", true)); T(talk, sit, .3f, false, ("Talk", false));
            T(sit, sitOut, .15f, false, ("Sit", false)); T(talk, sitOut, .15f, false, ("Sit", false)); T(sitOut, move, .2f, true);
            var ts = move.AddTransition(serve); ts.AddCondition(AnimatorConditionMode.If, 0, "Serve"); ts.duration = .15f; ts.hasExitTime = false;
            T(serve, move, .2f, true);
            return ac;
        }
        static void T(AnimatorState a, AnimatorState b, float dur, bool exit, params (string p, bool v)[] conds)
        {
            var t = a.AddTransition(b); t.duration = dur; t.hasExitTime = exit; if (exit) t.exitTime = .9f;
            foreach (var (p, v) in conds) t.AddCondition(v ? AnimatorConditionMode.If : AnimatorConditionMode.IfNot, 0, p);
        }

        static (Material, Material, Material, Material, Material, Material) Materials()
        {
            Material Save(string n, Material m) { AssetDatabase.DeleteAsset($"{Gen}/{n}.mat"); AssetDatabase.CreateAsset(m, $"{Gen}/{n}.mat"); return m; }
            var std = Shader.Find("Standard");
            var opaque = new Material(std) { enableInstancing = true };
            var cutout = new Material(std); cutout.SetFloat("_Mode", 1); cutout.EnableKeyword("_ALPHATEST_ON"); cutout.SetFloat("_Cutoff", .5f); cutout.SetOverrideTag("RenderType", "TransparentCutout"); cutout.renderQueue = 2450;
            var transparent = new Material(std);
            transparent.SetFloat("_Mode", 3); transparent.SetOverrideTag("RenderType", "Transparent"); transparent.SetInt("_SrcBlend", (int)BlendMode.One); transparent.SetInt("_DstBlend", (int)BlendMode.OneMinusSrcAlpha);
            transparent.SetInt("_ZWrite", 0); transparent.EnableKeyword("_ALPHAPREMULTIPLY_ON"); transparent.renderQueue = 3000;
            var emissive = new Material(std); emissive.EnableKeyword("_EMISSION"); emissive.globalIlluminationFlags = MaterialGlobalIlluminationFlags.None; emissive.SetColor("_EmissionColor", Color.white);
            var character = new Material(Shader.Find("Alemdar/Character"));
            var text = new Material(Shader.Find("Alemdar/Text3D"));
            return (Save("Opak", opaque), Save("Kesik", cutout), Save("Saydam", transparent), Save("Isikli", emissive), Save("Karakter", character), Save("Yazi", text));
        }

        static void Settings()
        {
            PlayerSettings.companyName = "Alemdar"; PlayerSettings.productName = "Alemdar Kıraathanesi";
            PlayerSettings.colorSpace = ColorSpace.Linear;
            PlayerSettings.fullScreenMode = FullScreenMode.FullScreenWindow; PlayerSettings.defaultScreenWidth = 1920; PlayerSettings.defaultScreenHeight = 1080;
            PlayerSettings.enableFrameTimingStats = true; // FPS ölçümü (işlemci/ekran kartı süreleri)
            PlayerSettings.resizableWindow = true; PlayerSettings.runInBackground = true; PlayerSettings.visibleInBackground = true;
            PlayerSettings.SetApiCompatibilityLevel(UnityEditor.Build.NamedBuildTarget.Standalone, ApiCompatibilityLevel.NET_Standard);
            var icon = AssetDatabase.LoadAssetAtPath<Texture2D>("Assets/Alemdar/icon.png");
            if (icon) PlayerSettings.SetIcons(UnityEditor.Build.NamedBuildTarget.Unknown, new[] { icon }, IconKind.Any);
            for (int i = 0; i < QualitySettings.names.Length; i++)
            {
                QualitySettings.SetQualityLevel(i, false);
                QualitySettings.shadows = ShadowQuality.All; QualitySettings.shadowResolution = ShadowResolution.High; QualitySettings.shadowDistance = 22; QualitySettings.shadowCascades = 2;
                QualitySettings.antiAliasing = 4; QualitySettings.anisotropicFiltering = AnisotropicFiltering.ForceEnable; QualitySettings.pixelLightCount = 6; QualitySettings.vSyncCount = 1;
            }
            QualitySettings.SetQualityLevel(QualitySettings.names.Length - 1, true);
            // kodla açılan shader'lar derlemeye girsin
            var gs = AssetDatabase.LoadAssetAtPath<Object>("ProjectSettings/GraphicsSettings.asset");
            var so = new SerializedObject(gs); var arr = so.FindProperty("m_AlwaysIncludedShaders");
            foreach (var name in new[] { "Alemdar/Character", "Alemdar/Text3D", "Standard", "UI/Default", "Legacy Shaders/Diffuse", "Legacy Shaders/Particles/Alpha Blended" })
            {
                var sh = Shader.Find(name); if (!sh) continue;
                bool has = false; for (int i = 0; i < arr.arraySize; i++) if (arr.GetArrayElementAtIndex(i).objectReferenceValue == sh) has = true;
                if (!has) { arr.InsertArrayElementAtIndex(arr.arraySize); arr.GetArrayElementAtIndex(arr.arraySize - 1).objectReferenceValue = sh; }
            }
            so.ApplyModifiedProperties();
        }

        const string OnlineUrl = "https://okey.hawarserver.com";

        public static void Windows()
        {
            Setup();
            string outDir = Path.Combine(Repo, "unity", "Build"), exe = Path.Combine(outDir, "AlemdarKiraathanesi.exe");
            var report = BuildPipeline.BuildPlayer(new BuildPlayerOptions { scenes = new[] { ScenePath }, locationPathName = exe, target = BuildTarget.StandaloneWindows64, options = BuildOptions.None });
            if (report.summary.result != UnityEditor.Build.Reporting.BuildResult.Succeeded) throw new System.Exception("Derleme başarısız: " + report.summary.result);
            CopyServer(Path.Combine(outDir, "Server"));
            // arkadaşlar aynı salonda buluşsun diye çevrimiçi sunucu; ulaşılamazsa oyun yerel sunucuyla açılır
            File.WriteAllText(Path.Combine(outDir, "config.json"), "{\n  \"serverUrl\": \"" + OnlineUrl + "\"\n}\n");
            Debug.Log("DERLEME TAMAM: " + exe);
        }

        // Oyun sunucusu: node.exe + server/ + public/js/meldSolver.js + node_modules (three hariç).
        static void CopyServer(string dst)
        {
            if (Directory.Exists(Path.Combine(dst, "server"))) Directory.Delete(Path.Combine(dst, "server"), true);
            Directory.CreateDirectory(dst);
            File.Copy(Path.Combine(Application.dataPath, "..", "NodeRuntime", "node.exe"), Path.Combine(dst, "node.exe"), true);
            File.Copy(Path.Combine(Application.dataPath, "..", "NodeRuntime", "LICENSE"), Path.Combine(dst, "NODE-LICENSE.txt"), true);
            CopyDir(Path.Combine(Repo, "server"), Path.Combine(dst, "server"), _ => true);
            Directory.CreateDirectory(Path.Combine(dst, "public", "js"));
            File.Copy(Path.Combine(Repo, "public", "js", "meldSolver.js"), Path.Combine(dst, "public", "js", "meldSolver.js"), true);
            CopyDir(Path.Combine(Repo, "node_modules"), Path.Combine(dst, "node_modules"), p => !p.Contains(Path.DirectorySeparatorChar + "three" + Path.DirectorySeparatorChar) && !p.EndsWith(".md") && !p.EndsWith(".map") && !p.EndsWith(".d.ts"));
        }
        static void CopyDir(string src, string dst, System.Func<string, bool> keep)
        {
            foreach (var f in Directory.GetFiles(src, "*", SearchOption.AllDirectories))
            {
                if (!keep(f)) continue;
                var to = Path.Combine(dst, Path.GetRelativePath(src, f));
                Directory.CreateDirectory(Path.GetDirectoryName(to)); File.Copy(f, to, true);
            }
        }
    }
}
