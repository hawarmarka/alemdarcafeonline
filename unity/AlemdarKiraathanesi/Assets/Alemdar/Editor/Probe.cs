// Komut satırından: -executeMethod Alemdar.EditorTools.Probe.Run → içe aktarılan modellerin klip, kemik ve mesh adlarını yazar.
using System.IO;
using System.Linq;
using System.Text;
using UnityEditor;
using UnityEngine;

namespace Alemdar.EditorTools
{
    public static class Probe
    {
        public static void Run()
        {
            AssetDatabase.Refresh();
            var sb = new StringBuilder();
            const string root = "Assets/ThirdParty/Quaternius/";
            var clips = AssetDatabase.LoadAllAssetsAtPath(root + "Animations/UAL1_Standard.fbx").OfType<AnimationClip>().Where(c => !c.name.StartsWith("__preview"));
            sb.AppendLine("KLIPLER: " + string.Join(", ", clips.Select(c => $"{c.name}({c.length:0.0}s,h={c.isHumanMotion})")));
            foreach (var f in new[] { "Characters/Superhero_Male_FullBody.fbx", "Characters/Superhero_Female_FullBody.fbx", "Hair/Hair_Beard.fbx", "Hair/Hair_SimpleParted.fbx", "Hair/Eyebrows_Regular.fbx" })
            {
                var go = AssetDatabase.LoadAssetAtPath<GameObject>(root + f);
                if (!go) { sb.AppendLine("YOK " + f); continue; }
                sb.AppendLine("== " + f + " animator.isHuman=" + (go.TryGetComponent<Animator>(out var an) && an.isHuman));
                foreach (var smr in go.GetComponentsInChildren<SkinnedMeshRenderer>(true))
                    sb.AppendLine($"  SMR {smr.name} verts={smr.sharedMesh.vertexCount} sub={smr.sharedMesh.subMeshCount} mats={string.Join("/", smr.sharedMaterials.Select(m => m ? m.name : "-"))} root={smr.rootBone?.name} bones={smr.bones.Length}");
                foreach (var mr in go.GetComponentsInChildren<MeshRenderer>(true)) sb.AppendLine($"  MR {mr.name}");
                var b = go.GetComponentsInChildren<Transform>(true).Select(t => t.name);
                sb.AppendLine("  KEMIKLER: " + string.Join(",", b.Take(80)));
                var bounds = go.GetComponentsInChildren<Renderer>(true).Select(r => r.bounds).FirstOrDefault();
                sb.AppendLine("  bounds=" + bounds.size);
            }
            foreach (var f in Directory.GetFiles("Assets/ThirdParty/Rocketbox", "*.fbx", SearchOption.AllDirectories).Take(3))
            {
                var go = AssetDatabase.LoadAssetAtPath<GameObject>(f.Replace('\\', '/'));
                var inst = Object.Instantiate(go);
                var an = inst.GetComponent<Animator>();
                sb.AppendLine("== " + f + " isHuman=" + (an && an.isHuman) + " valid=" + (an && an.avatar && an.avatar.isValid));
                foreach (var smr in inst.GetComponentsInChildren<SkinnedMeshRenderer>(true))
                    sb.AppendLine($"  SMR {smr.name} verts={smr.sharedMesh.vertexCount} sub={smr.sharedMesh.subMeshCount} mats={string.Join("/", smr.sharedMaterials.Select(m => m ? m.name + "(" + (m.mainTexture ? m.mainTexture.name : "-") + ")" : "-"))}");
                if (an && an.isHuman)
                {
                    Vector3 P(HumanBodyBones b) => an.GetBoneTransform(b) ? an.GetBoneTransform(b).position : Vector3.zero;
                    var right = P(HumanBodyBones.RightUpperArm) - P(HumanBodyBones.LeftUpperArm);
                    sb.AppendLine($"  boy(baş)={P(HumanBodyBones.Head).y:0.00} ayak={P(HumanBodyBones.LeftFoot).y:0.00} ön={Vector3.Cross(right, Vector3.up).normalized} kalça={P(HumanBodyBones.Hips)}");
                }
                sb.AppendLine("  bounds=" + inst.GetComponentsInChildren<Renderer>().Select(r => r.bounds).FirstOrDefault().size + " ölçek=" + inst.transform.localScale);
                Object.DestroyImmediate(inst);
            }
            sb.AppendLine("== Poly Haven kalıpları (sınır merkezi / boyut / malzeme)");
            foreach (var f in Directory.GetFiles("Assets/Alemdar/Generated/PolyHaven", "*.prefab"))
            {
                var inst = (GameObject)Object.Instantiate(AssetDatabase.LoadAssetAtPath<GameObject>(f.Replace('\\', '/')));
                var rs = inst.GetComponentsInChildren<Renderer>(true);
                if (rs.Length == 0) { sb.AppendLine($"  {inst.name}: RENDERER YOK"); Object.DestroyImmediate(inst); continue; }
                var b = rs[0].bounds; foreach (var r in rs) b.Encapsulate(r.bounds);
                var mf = inst.GetComponentsInChildren<MeshFilter>(true);
                sb.AppendLine($"  {Path.GetFileNameWithoutExtension(f)}: merkez {b.center} boyut {b.size} parça {rs.Length} mesh {mf.Count(m => m.sharedMesh)} ölçek {inst.transform.localScale} mat {rs[0].sharedMaterial?.name} keyword {string.Join(",", rs[0].sharedMaterial ? rs[0].sharedMaterial.shaderKeywords : new string[0])}");
                Object.DestroyImmediate(inst);
            }
            sb.AppendLine("== Asset Store kalıpları (yol / merkez / boyut / ölçek / malzeme shader)");
            foreach (var name in new[] { "Props_SM_NewsPaper_15", "Blinds_SM_VenetianBlind_Close_2", "Blinds_SM_VenetianBlind_Open_5", "WallProps_SM_Chalkboard_6", "SM_PlantPot_74",
                                         "WallProps_SM_WallShelves3_2", "Props_SM_CoffeMug_7", "Cabinet_Base_SD_01", "Cabinet_Base_Sink_01", "Cabinet_Wall_DD_01", "Range_Hood", "Stove_01",
                                         "Fridge_01", "urban_building_Prefab", "CeilingParts_SM_AC_3m_165", "SM_CeilingLamp_14", "Ext_Apt_01_Wall_Window_01", "Ext_apt_01_01" })
            {
                var guid = AssetDatabase.FindAssets(name + " t:Prefab").FirstOrDefault(); if (guid == null) { sb.AppendLine("  YOK " + name); continue; }
                var path = AssetDatabase.GUIDToAssetPath(guid); var inst = (GameObject)Object.Instantiate(AssetDatabase.LoadAssetAtPath<GameObject>(path));
                var rs = inst.GetComponentsInChildren<Renderer>(true);
                if (rs.Length == 0) { sb.AppendLine($"  {name}: renderer yok"); Object.DestroyImmediate(inst); continue; }
                var b = rs[0].bounds; foreach (var r in rs) b.Encapsulate(r.bounds);
                var sh = string.Join(",", rs.SelectMany(r => r.sharedMaterials).Where(m => m).Select(m => m.shader.name).Distinct());
                sb.AppendLine($"  {name}: {path} | merkez {b.center} boyut {b.size} | ölçek {inst.transform.localScale} rot {inst.transform.eulerAngles} | {sh}");
                Object.DestroyImmediate(inst);
            }
            File.WriteAllText(Path.Combine(Application.dataPath, "../probe.txt"), sb.ToString());
        }
    }
}
