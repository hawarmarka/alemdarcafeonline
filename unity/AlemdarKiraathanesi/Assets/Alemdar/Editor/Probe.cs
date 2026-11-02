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
            File.WriteAllText(Path.Combine(Application.dataPath, "../probe.txt"), sb.ToString());
        }
    }
}
