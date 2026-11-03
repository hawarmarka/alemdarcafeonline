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
            (lib.men, lib.waiterBody) = Rocketbox("Assets/ThirdParty/Rocketbox", "Business_Male_06");
            (lib.women, _) = Rocketbox("Assets/ThirdParty/RocketboxWomen", null);
            (lib.children, _) = Rocketbox("Assets/ThirdParty/RocketboxChildren", null);
            lib.phModels = PolyHavenModels();
            // Asset Store paketlerinden yalnızca kullanılan kalıplar (derlemeye yalnız bunlar girer)
            lib.storeModels = new[] { "Props_SM_NewsPaper_15", "Blinds_SM_VenetianBlind_Open_5", "WallProps_SM_Chalkboard_6", "SM_PlantPot_74", "WallProps_SM_WallShelves3_2",
                                      "Ext_Apt_01_Wall_Window_01", "Ext_Apt_01_Wall_01", "Fridge_01", "Range_Hood" }
                .Select(n => AssetDatabase.FindAssets(n + " t:Prefab").Select(AssetDatabase.GUIDToAssetPath).FirstOrDefault(p => Path.GetFileNameWithoutExtension(p) == n))
                .Where(p => p != null).Select(p => AssetDatabase.LoadAssetAtPath<GameObject>(p)).ToArray();
            // mahalle dokuları: modeli olmayan Poly Haven klasörlerindeki diff/nor (anahtar "klasör/harita")
            var texKeys = new System.Collections.Generic.List<string>(); var texs = new System.Collections.Generic.List<Texture2D>();
            foreach (var dir in Directory.GetDirectories("Assets/ThirdParty/PolyHaven"))
                foreach (var f in Directory.GetFiles(dir).Where(f => f.EndsWith(".jpg") || f.EndsWith(".png")))
                {
                    var tex = AssetDatabase.LoadAssetAtPath<Texture2D>(f.Replace('\\', '/')); if (!tex) continue;
                    texKeys.Add(Path.GetFileName(dir) + "/" + Path.GetFileNameWithoutExtension(f)); texs.Add(tex);
                }
            lib.phTexKeys = texKeys.ToArray(); lib.phTex = texs.ToArray();
            (lib.skies, lib.skybox) = Skies();
            (lib.opaque, lib.cutout, lib.transparent, lib.emissive, lib.character, lib.text) = mats;
            Texture2D PH(string id, string map) => AssetDatabase.LoadAssetAtPath<Texture2D>($"Assets/ThirdParty/PolyHaven/{id}/{map}.jpg");
            lib.plasterD = PH("painted_plaster_wall", "diff"); lib.plasterN = PH("painted_plaster_wall", "nor");
            lib.darkWoodD = PH("dark_wood", "diff"); lib.darkWoodN = PH("dark_wood", "nor");
            lib.lightWoodD = PH("fine_grained_wood", "diff"); lib.lightWoodN = PH("fine_grained_wood", "nor");
            lib.marbleD = PH("marble_01", "diff"); lib.marbleN = PH("marble_01", "nor");
            lib.leatherD = PH("fabric_leather_02", "diff"); lib.leatherN = PH("fabric_leather_02", "nor");
            lib.fabricN = PH("fabric_pattern_07", "nor");
            lib.photos = Directory.Exists("Assets/ThirdParty/Photos")
                ? Directory.GetFiles("Assets/ThirdParty/Photos", "*.jpg").Select(f => AssetDatabase.LoadAssetAtPath<Texture2D>(f.Replace('\\', '/'))).Where(t => t).ToArray()
                : new Texture2D[0];
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

        // Microsoft Rocketbox (MIT) erkek karakterleri: her model için gövde/baş/saydam malzemeleri dokulardan kurulur ve hazır kalıp kaydedilir.
        // Business_Male_06 (beyaz gömlek) kahveci; diğerleri müşteri.
        static (GameObject[], GameObject) Rocketbox(string RB, string waiterName)
        {
            string Out = Gen + "/" + Path.GetFileName(RB); if (!Directory.Exists(RB)) return (new GameObject[0], null);
            Directory.CreateDirectory(Out);
            var std = Shader.Find("Standard");
            GameObject waiter = null; var men = new System.Collections.Generic.List<GameObject>();
            foreach (var dir in Directory.GetDirectories(RB).OrderBy(d => d))
            {
                string name = Path.GetFileName(dir), fbx = $"{RB}/{name}/{name}.fbx";
                var model = AssetDatabase.LoadAssetAtPath<GameObject>(fbx); if (!model) continue;
                Texture2D Tex(string file) => AssetDatabase.LoadAssetAtPath<Texture2D>($"{RB}/{name}/{file}");
                var inst = (GameObject)PrefabUtility.InstantiatePrefab(model);
                foreach (var smr in inst.GetComponentsInChildren<SkinnedMeshRenderer>(true))
                {
                    var mats = smr.sharedMaterials.Select(src =>
                    {
                        string part = src ? src.name : "body"; // ör. m003_body, m003_head, m003_opacity
                        bool alpha = part.Contains("opacity");
                        var m = new Material(std) { name = part, enableInstancing = true };
                        var col = Tex(part + "_color.jpg") ?? Tex(part + "_color.png"); var nor = Tex(part + "_normal.png");
                        m.SetTexture("_MainTex", col);
                        if (nor) { m.SetTexture("_BumpMap", nor); m.EnableKeyword("_NORMALMAP"); }
                        m.SetFloat("_Glossiness", part.Contains("head") ? .32f : .18f); m.SetFloat("_Metallic", 0);
                        if (alpha)
                        {
                            m.SetFloat("_Mode", 1); m.EnableKeyword("_ALPHATEST_ON"); m.SetFloat("_Cutoff", .45f);
                            m.SetOverrideTag("RenderType", "TransparentCutout"); m.renderQueue = 2450;
                        }
                        string matPath = $"{Out}/{name}_{part}.mat";
                        AssetDatabase.DeleteAsset(matPath); AssetDatabase.CreateAsset(m, matPath);
                        if (!col) Debug.LogWarning($"Rocketbox dokusu yok: {name}/{part}");
                        return m;
                    }).ToArray();
                    smr.sharedMaterials = mats;
                }
                var prefab = PrefabUtility.SaveAsPrefabAsset(inst, $"{Out}/{name}.prefab");
                Object.DestroyImmediate(inst);
                if (name == waiterName) waiter = prefab; else men.Add(prefab);
            }
            if (men.Count == 0) Debug.LogWarning("Rocketbox karakteri bulunamadı; Quaternius kullanılacak.");
            return (men.ToArray(), waiter);
        }

        // Poly Haven (CC0) sokak eşyaları: her modelin bütün parçalarına renk (+alfa varsa kesik) ve normal haritalı tek malzeme; hazır kalıp adı = klasör adı.
        static GameObject[] PolyHavenModels()
        {
            const string PH = "Assets/ThirdParty/PolyHaven", Out = Gen + "/PolyHaven";
            Directory.CreateDirectory(Out);
            var std = Shader.Find("Standard"); var list = new System.Collections.Generic.List<GameObject>();
            foreach (var dir in Directory.GetDirectories(PH).OrderBy(d => d))
            {
                string id = Path.GetFileName(dir), fbx = $"{PH}/{id}/model.fbx";
                var model = AssetDatabase.LoadAssetAtPath<GameObject>(fbx); if (!model) continue;
                var col = AssetDatabase.LoadAssetAtPath<Texture2D>($"{PH}/{id}/diff.png") ?? AssetDatabase.LoadAssetAtPath<Texture2D>($"{PH}/{id}/diff.jpg");
                var nor = AssetDatabase.LoadAssetAtPath<Texture2D>($"{PH}/{id}/nor.jpg");
                bool alpha = false; // lamba camının saydamlık haritası bütün lambayı kesiyordu: sokak eşyaları opak
                var m = new Material(std) { name = id, enableInstancing = true };
                m.SetTexture("_MainTex", col); m.SetFloat("_Glossiness", .3f);
                if (nor) { m.SetTexture("_BumpMap", nor); m.EnableKeyword("_NORMALMAP"); }
                if (alpha) { m.SetFloat("_Mode", 1); m.EnableKeyword("_ALPHATEST_ON"); m.SetFloat("_Cutoff", .5f); m.SetOverrideTag("RenderType", "TransparentCutout"); m.renderQueue = 2450; }
                AssetDatabase.DeleteAsset($"{Out}/{id}.mat"); AssetDatabase.CreateAsset(m, $"{Out}/{id}.mat");
                var inst = (GameObject)PrefabUtility.InstantiatePrefab(model); inst.name = id;
                foreach (var r in inst.GetComponentsInChildren<Renderer>(true)) r.sharedMaterials = Enumerable.Repeat(m, r.sharedMaterials.Length).ToArray();
                list.Add(PrefabUtility.SaveAsPrefabAsset(inst, $"{Out}/{id}.prefab"));
                Object.DestroyImmediate(inst);
            }
            return list.ToArray();
        }

        // Gökyüzü (Poly Haven HDRI, CC0): açık, kapalı, gün batımı, gece; Panoramic gökyüzü malzemesi (Weather değiştirir).
        static (Texture[], Material) Skies()
        {
            string[] ids = { "kloofendal_48d_partly_cloudy_puresky", "kloofendal_overcast_puresky", "qwantani_dusk_2_puresky", "rogland_clear_night" };
            var skies = ids.Select(i => (Texture)AssetDatabase.LoadAssetAtPath<Texture2D>($"Assets/ThirdParty/PolyHavenSky/{i}/sky.hdr")).ToArray();
            var m = new Material(Shader.Find("Skybox/Panoramic")); m.SetTexture("_MainTex", skies.FirstOrDefault(s => s));
            AssetDatabase.DeleteAsset(Gen + "/Gokyuzu.mat"); AssetDatabase.CreateAsset(m, Gen + "/Gokyuzu.mat");
            return (skies, m);
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
            Gestures(ac);
            return ac;
        }

        // Üst gövde katmanı (Kevin Iglesias, Human Basic Motions): oturan ya da duran kişi çay içer, konuşur, başını sallar, güler.
        // Maske yalnızca gövde, baş ve kollar: bacaklar ve kök alt katmandan (yürüme/oturma) gelir, yön sorunu olmaz.
        // Person.Gesture(id): 1 çay iç, 2-4 konuş, 5 baş salla (evet), 6 baş salla (hayır), 7 gül, 8 el salla, 9 alkış, 10 soru sor
        static readonly string[] GestureClips = { "Misc/Drink/HumanM@Drink01_R", "Social/Conversation/HumanM@Talk01", "Social/Conversation/HumanM@Talk02", "Social/Conversation/HumanM@Talk03",
            "Social/Conversation/HumanM@HeadNod01", "Social/Conversation/HumanM@HeadShake01", "Social/Emotions/HumanM@Laugh01", "Social/Conversation/HumanM@HandWave01",
            "Social/Conversation/HumanM@HandClap01", "Social/Conversation/HumanM@Question01" };
        static void Gestures(AnimatorController ac)
        {
            const string HBM = "Assets/Kevin Iglesias/Human Animations/Animations/Male/";
            AnimationClip Load(string rel) => AssetDatabase.LoadAllAssetsAtPath(HBM + rel + ".fbx").OfType<AnimationClip>().FirstOrDefault(c => !c.name.StartsWith("__preview"));
            if (!Load(GestureClips[0])) { Debug.LogWarning("Human Basic Motions yok: el kol hareketleri kapalı."); return; }
            var mask = new AvatarMask { name = "UstGovde" };
            for (int i = 0; i < (int)AvatarMaskBodyPart.LastBodyPart; i++)
            {
                var part = (AvatarMaskBodyPart)i;
                // omurga (Body) dahil değil: ayakta çekilmiş kliplerin duruşu oturan gövdeyi geriye yatırıyordu; yalnızca baş, kollar, parmaklar
                mask.SetHumanoidBodyPartActive(part, part is AvatarMaskBodyPart.Head or AvatarMaskBodyPart.LeftArm or AvatarMaskBodyPart.RightArm
                                                       or AvatarMaskBodyPart.LeftFingers or AvatarMaskBodyPart.RightFingers);
            }
            AssetDatabase.DeleteAsset(Gen + "/UstGovde.mask"); AssetDatabase.CreateAsset(mask, Gen + "/UstGovde.mask");
            ac.AddParameter("GestureId", AnimatorControllerParameterType.Int);
            ac.AddParameter("Gesture", AnimatorControllerParameterType.Trigger);
            ac.AddLayer("UstGovde");
            var layers = ac.layers; var L = layers[^1]; L.avatarMask = mask; L.defaultWeight = 0; /* Person.Gesture hareket süresince açar */ L.blendingMode = AnimatorLayerBlendingMode.Override; L.iKPass = true; ac.layers = layers;
            var sm = ac.layers[^1].stateMachine;
            var idle = sm.AddState("Bos"); sm.defaultState = idle; // boş durum: alt katman olduğu gibi görünür
            for (int i = 0; i < GestureClips.Length; i++)
            {
                var clip = Load(GestureClips[i]); if (!clip) { Debug.LogWarning("Klip yok: " + GestureClips[i]); continue; }
                var st = sm.AddState("Hareket" + (i + 1)); st.motion = clip;
                var tin = sm.AddAnyStateTransition(st); tin.duration = .25f; tin.hasExitTime = false; tin.canTransitionToSelf = false;
                tin.AddCondition(AnimatorConditionMode.If, 0, "Gesture"); tin.AddCondition(AnimatorConditionMode.Equals, i + 1, "GestureId");
                var tout = st.AddTransition(idle); tout.hasExitTime = true; tout.exitTime = .9f; tout.duration = .35f;
            }
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
            foreach (var name in new[] { "Alemdar/Character", "Alemdar/Text3D", "Standard", "UI/Default", "Legacy Shaders/Diffuse", "Legacy Shaders/Particles/Alpha Blended", "Skybox/Panoramic" })
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
            // canlı TV: FFmpeg (LGPL, paylaşımlı kütüphaneler) varsa Tv/ altına; lisansı yanında
            var ff = Path.Combine(Application.dataPath, "..", "FFmpegRuntime");
            if (File.Exists(Path.Combine(ff, "ffmpeg.exe"))) CopyDir(ff, Path.Combine(outDir, "Tv"), _ => true);
            else Debug.LogWarning("FFmpegRuntime/ffmpeg.exe yok: TV yalnızca MP4/WebM adreslerini oynatır.");
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
