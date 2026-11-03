// Karakter: Quaternius temel gövdesi + saç/sakal + kemik ağırlığına göre boyanan kıyafet (gömlek, pantolon, ayakkabı).
// Görünüm adından türetilir (her istemcide aynı kişi aynı görünür). Animasyon: Speed, Sit, Talk, Serve.
using System.Collections.Generic;
using UnityEngine;

namespace Alemdar.Chars
{
    [RequireComponent(typeof(Animator))]
    public class Person : MonoBehaviour
    {
        static readonly int SpeedId = Animator.StringToHash("Speed"), SitId = Animator.StringToHash("Sit"), TalkId = Animator.StringToHash("Talk"), ServeId = Animator.StringToHash("Serve");
        static readonly Color[] Shirts = { new(.18f, .25f, .38f), new(.45f, .14f, .16f), new(.22f, .36f, .3f), new(.8f, .76f, .68f), new(.27f, .27f, .3f), new(.55f, .4f, .27f), new(.35f, .3f, .45f), new(.92f, .92f, .9f), new(.16f, .35f, .55f), new(.42f, .44f, .3f) };
        static readonly Color[] Pants = { new(.1f, .11f, .13f), new(.22f, .19f, .15f), new(.15f, .2f, .3f), new(.28f, .28f, .28f), new(.07f, .07f, .07f), new(.35f, .3f, .22f) };
        static readonly Dictionary<string, Mesh> clothCache = new();

        public string Display { get; private set; }
        public Animator Anim { get; private set; }
        public Transform Head { get; private set; }
        public Vector3? LookAt;
        TextMesh tag;
        float talk;

        public static readonly Quaternion ModelFix = Quaternion.Euler(0, 180, 0);
        public static uint Hash(string s) { uint h = 2166136261; foreach (char c in s) { h ^= c; h *= 16777619; } return h; }

        // Gövdenin, üst nesnenin önüne (+z) bakması için gereken yerel dönüş (animasyonlar gövdeyi -z'ye çevirir → 180°).
        public Quaternion Fix { get; private set; } = ModelFix;
        public Vector3 Front => transform.rotation * Quaternion.Inverse(Fix) * Vector3.forward;
        // Gerçekte görünen yön: omuz kemiklerinden (animasyon sonrası). Denetim bununla yapılır, nesne yönüyle değil.
        public Vector3 BoneFront
        {
            get
            {
                var l = Anim.GetBoneTransform(HumanBodyBones.LeftUpperArm); var r = Anim.GetBoneTransform(HumanBodyBones.RightUpperArm);
                return l && r ? Vector3.Cross(r.position - l.position, Vector3.up).normalized : Front;
            }
        }

        public static Person Create(string name, Transform parent, bool nameTag = true, string role = null)
        {
            var lib = Lib.I;
            if (lib.men != null && lib.men.Length > 0) return CreateRocketbox(name, parent, nameTag, role);
            uint h = Hash(name);
            const bool female = false; // kıraathane: yalnızca erkek karakterler (kullanıcı isteği)
            var go = Instantiate(female ? lib.femaleBody : lib.maleBody, parent);
            go.name = "Kisi_" + name;
            // Quaternius modellerinin önü kendi ekseninde -z; Unity'de ileri +z → gövde 180° çevrilir.
            // DİKKAT: gövdeyi başka bir nesneye bağlayan kod bu dönüşü sıfırlamamalı (PlayerMotor.Init bunu yapıyordu → ters yürüyüş).
            go.transform.localRotation = ModelFix;
            var av = go.AddComponent<Person>(); av.Display = name;
            av.Anim = go.GetComponent<Animator>(); av.Anim.runtimeAnimatorController = lib.controller; av.Anim.applyRootMotion = false;
            av.Anim.cullingMode = AnimatorCullingMode.CullUpdateTransforms;
            av.Head = av.Anim.GetBoneTransform(HumanBodyBones.Head);
            // kıyafet
            var body = System.Array.Find(go.GetComponentsInChildren<SkinnedMeshRenderer>(), r => r.name.StartsWith("Super"));
            body.sharedMesh = Clothed(body);
            var mat = new Material(lib.character);
            var skins = female ? lib.femaleSkins : lib.maleSkins;
            mat.SetTexture("_MainTex", skins[(h >> 9) % (uint)skins.Length]);
            mat.SetTexture("_BumpMap", female ? lib.femaleNormal : lib.maleNormal);
            Color shirt = Shirts[(h >> 12) % (uint)Shirts.Length], pants = Pants[(h >> 16) % (uint)Pants.Length];
            if (role == "waiter") { shirt = new Color(.95f, .95f, .93f); pants = new Color(.08f, .08f, .09f); }
            mat.SetColor("_Shirt", shirt); mat.SetColor("_Pants", pants); mat.SetColor("_Shoes", new Color(.07f, .05f, .04f));
            body.sharedMaterial = mat; body.updateWhenOffscreen = false;
            // saç, sakal
            var hairs = female ? lib.femaleHair : lib.maleHair;
            if (hairs.Length > 0) Attach(go, body, hairs[(h >> 20) % (uint)hairs.Length], h);
            if (!female && lib.beard && ((h >> 24) % 3 == 0 || role == "waiter")) Attach(go, body, lib.beard, h);
            if (role == "waiter") av.Apron(body);
            if (nameTag) av.MakeTag(name);
            return av;
        }

        // Rocketbox: gerçek kıyafet ve yüz dokulu hazır erkek karakterler; kişi adından seçilir (her istemcide aynı).
        static Person CreateRocketbox(string name, Transform parent, bool nameTag, string role)
        {
            var lib = Lib.I; uint h = Hash(name);
            var prefab = role == "waiter" && lib.waiterBody ? lib.waiterBody
                       : role == "teyze" && lib.women is { Length: > 0 } ? lib.women[h % (uint)lib.women.Length] // mahalledeki teyzeler (kıraathanede yalnız erkek)
                       : role == "cocuk" && lib.children is { Length: > 0 } ? lib.children[h % (uint)lib.children.Length] // parkta oynayan çocuklar
                       : lib.men[h % (uint)lib.men.Length];
            var go = Instantiate(prefab, parent); go.name = "Kisi_" + name;
            // Modelin kendisi +z'ye baksa da humanoid klipler (Quaternius, keepOriginalOrientation) gövdeyi -z'ye çevirir; düzeltme aynı 180°.
            go.transform.localRotation = ModelFix;
            var av = go.AddComponent<Person>(); av.Display = name; av.Fix = ModelFix;
            av.Anim = go.GetComponent<Animator>(); av.Anim.runtimeAnimatorController = lib.controller; av.Anim.applyRootMotion = false;
            av.Anim.cullingMode = AnimatorCullingMode.CullUpdateTransforms;
            av.Head = av.Anim.GetBoneTransform(HumanBodyBones.Head);
            foreach (var r in go.GetComponentsInChildren<SkinnedMeshRenderer>()) r.updateWhenOffscreen = false;
            if (role == "waiter") av.Apron(null);
            if (nameTag) av.MakeTag(name);
            return av;
        }

        // Köşe rengi maskesi: en ağır kemiğe göre bölge; kumaş bölgeler normal boyunca biraz şişirilir (giyilmiş görünsün).
        static Mesh Clothed(SkinnedMeshRenderer smr)
        {
            if (clothCache.TryGetValue(smr.sharedMesh.name, out var cached)) return cached;
            var src = smr.sharedMesh; var mesh = Instantiate(src); mesh.name = src.name + "_kiyafet";
            var bones = smr.bones; var w = src.boneWeights; var v = src.vertices; var n = src.normals;
            var cols = new Color[v.Length];
            for (int i = 0; i < v.Length; i++)
            {
                var bw = w[i];
                string b = bones[bw.boneIndex0].name.ToLowerInvariant();
                Color c = Color.clear;
                if (b.Contains("spine") || b.Contains("clavicle") || b.Contains("upperarm") || b.Contains("lowerarm")) c = new Color(1, 0, 0);
                else if (b.Contains("pelvis") || b.Contains("thigh") || b.Contains("calf")) c = new Color(0, 1, 0);
                else if (b.Contains("foot") || b.Contains("ball")) c = new Color(0, 0, 1);
                // pelvisin üstü gömlek (kemer hizası)
                if (b.Contains("pelvis") && bones[bw.boneIndex1].name.Contains("spine") && bw.weight1 > .3f) c = new Color(1, 0, 0);
                // bilekte kol biter: el kemiği karışıyorsa ten
                if (b.Contains("lowerarm") && bones[bw.boneIndex1].name.Contains("hand") && bw.weight1 > .25f) c = Color.clear;
                cols[i] = c;
                if (c.a > 0 || c.r + c.g + c.b > 0) v[i] += n[i] * (c.b > 0 ? .006f : .009f);
            }
            mesh.vertices = v; mesh.colors = cols; mesh.RecalculateBounds();
            clothCache[src.name] = mesh; return mesh;
        }

        static void Attach(GameObject body, SkinnedMeshRenderer bodySmr, GameObject prefab, uint h)
        {
            var tmp = Instantiate(prefab);
            var smr = tmp.GetComponentInChildren<SkinnedMeshRenderer>();
            var map = new Dictionary<string, Transform>();
            foreach (var t in body.GetComponentsInChildren<Transform>()) map[t.name] = t;
            var bones = new Transform[smr.bones.Length];
            for (int i = 0; i < bones.Length; i++) bones[i] = smr.bones[i] && map.TryGetValue(smr.bones[i].name, out var t) ? t : null;
            smr.transform.SetParent(body.transform, false);
            smr.bones = bones; smr.rootBone = map.TryGetValue(smr.rootBone ? smr.rootBone.name : "root", out var r) ? r : bodySmr.rootBone;
            // saç rengi: siyah-kahve-kumral-kır
            Color[] hair = { new(.06f, .05f, .04f), new(.18f, .11f, .06f), new(.32f, .22f, .13f), new(.5f, .48f, .46f) };
            var m = new Material(smr.sharedMaterial) { color = hair[(h >> 27) % 4] };
            smr.sharedMaterial = m;
            Destroy(tmp);
        }

        // Kahveci önlüğü: göğüsten dize kadar koyu kumaş.
        void Apron(SkinnedMeshRenderer body)
        {
            var hips = Anim.GetBoneTransform(HumanBodyBones.Hips);
            var a = GameObject.CreatePrimitive(PrimitiveType.Cube); Destroy(a.GetComponent<Collider>());
            // ölçü ve yer dünya biriminde: kemik ölçeği (FBX) önlüğü büyütmesin.
            var front = Front;
            a.transform.SetPositionAndRotation(hips.position + front * .14f + Vector3.down * .1f, Quaternion.LookRotation(front));
            a.transform.SetParent(hips, true);
            var s = hips.lossyScale; a.transform.localScale = new Vector3(.34f / s.x, .5f / s.y, .008f / s.z);
            a.GetComponent<Renderer>().sharedMaterial = World.Props.M(new Color(.12f, .1f, .09f), .1f);
        }

        void MakeTag(string text)
        {
            var g = new GameObject("isim"); g.transform.SetParent(transform, false); g.transform.localPosition = new Vector3(0, 2.02f, 0);
            tag = World.Props.Text3D(g.transform, text, Vector3.zero, 0, .09f, Color.white);
        }

        public void SetTag(string text, Color c) { if (!tag) return; if (tag.text != text) tag.text = text; tag.color = c; }
        public void SetSpeed(float v) => Anim.SetFloat(SpeedId, v, .12f, Time.deltaTime);
        public void SetSit(bool v) { Anim.SetBool(SitId, v); if (tag) tag.transform.parent.localPosition = new Vector3(0, v ? 1.6f : 2.02f, 0); }
        public void SetTalk(float level) { talk = Mathf.Lerp(talk, level, .2f); Anim.SetBool(TalkId, talk > .15f); }
        public void Serve() => Anim.SetTrigger(ServeId);

        // Üst gövde hareketi (Human Basic Motions): 1 çay iç, 2-4 konuş, 5 evet, 6 hayır, 7 gül, 8 el salla, 9 alkış, 10 soru.
        // Katman ağırlığı yalnızca hareket süresince açılır; böylece oturma/yürüme hiç bozulmaz.
        static readonly int GestureIdId = Animator.StringToHash("GestureId"), GestureId = Animator.StringToHash("Gesture");
        public const int Drink = 1, Talk = 2, Yes = 5, No = 6, Laugh = 7, Wave = 8, Clap = 9, Ask = 10;
        int gestureLayer = -2; float gestureUntil;
        public bool Gesturing => Time.time < gestureUntil;
        public void Gesture(int id, float seconds = 3f)
        {
            if (gestureLayer == -2) gestureLayer = Anim.GetLayerIndex("UstGovde");
            if (gestureLayer < 0 || reach.HasValue) return; // katman yoksa ya da el taşa uzanıyorsa
            if (id == Talk) id += Random.Range(0, 3);       // üç farklı konuşma
            Anim.SetInteger(GestureIdId, id); Anim.SetTrigger(GestureId); gestureUntil = Time.time + seconds;
        }

        void LateUpdate()
        {
            if (tag && Camera.main) tag.transform.parent.rotation = Quaternion.LookRotation(tag.transform.parent.position - Camera.main.transform.position);
        }

        // ---------- el hareketi: taş çekme, atma, masaya dizme ----------
        // Sıralı uzanmalar: sağ el hedefe gider, kısa bekler, döner (yumuşak eğri). Bakış da hedefe kayar.
        struct ReachTask { public Vector3 target; public float delay, dur; }
        readonly System.Collections.Generic.Queue<ReachTask> reaches = new();
        ReachTask? reach; float reachT, reachWait;
        public void Reach(Vector3 target, float delay = 0, float dur = .7f) => reaches.Enqueue(new ReachTask { target = target, delay = delay, dur = dur });
        float ReachWeight => reach.HasValue ? Mathf.Sin(Mathf.Clamp01(reachT / reach.Value.dur) * Mathf.PI) : 0;

        void Update()
        {
            if (gestureLayer >= 0) Anim.SetLayerWeight(gestureLayer, Mathf.MoveTowards(Anim.GetLayerWeight(gestureLayer), Gesturing && !reach.HasValue ? 1 : 0, Time.deltaTime * 3));
            if (reach.HasValue) { reachT += Time.deltaTime; if (reachT >= reach.Value.dur) reach = null; }
            else if (reaches.Count > 0)
            {
                reachWait += Time.deltaTime;
                if (reachWait >= reaches.Peek().delay) { reach = reaches.Dequeue(); reachT = 0; reachWait = 0; }
            }
        }

        // İki elle tutulan şey (iskambil yelpazesi): eller hedefin iki yanına gider. Yerel +z tutanın kendisine doğru.
        public Transform Hold;
        float holdW;
        // Baş ve gövde bakışı + el (Animator IK geçişi açık).
        void OnAnimatorIK(int layer)
        {
            float w = ReachWeight;
            holdW = Mathf.MoveTowards(holdW, Hold ? 1 : 0, Time.deltaTime * 3);
            if (holdW > 0 && Hold)
            {
                // sol el yelpazenin sol alt köşesinde (tutanın gözünden), sağ el sağında; sağ el kâğıt atarken uzanmaya geçer
                Anim.SetIKPositionWeight(AvatarIKGoal.LeftHand, holdW * .9f); Anim.SetIKRotationWeight(AvatarIKGoal.LeftHand, holdW * .5f);
                Anim.SetIKPosition(AvatarIKGoal.LeftHand, Hold.TransformPoint(new Vector3(.045f, -.005f, .012f)));
                Anim.SetIKRotation(AvatarIKGoal.LeftHand, Hold.rotation * Quaternion.Euler(0, 180, -60));
                if (w < .05f)
                {
                    Anim.SetIKPositionWeight(AvatarIKGoal.RightHand, holdW * .9f); Anim.SetIKRotationWeight(AvatarIKGoal.RightHand, holdW * .5f);
                    Anim.SetIKPosition(AvatarIKGoal.RightHand, Hold.TransformPoint(new Vector3(-.04f, .02f, .014f)));
                    Anim.SetIKRotation(AvatarIKGoal.RightHand, Hold.rotation * Quaternion.Euler(0, 180, 60));
                    if (LookAt.HasValue) { Anim.SetLookAtWeight(1, .25f, .8f, 1, .6f); Anim.SetLookAtPosition(LookAt.Value); } else Anim.SetLookAtWeight(0);
                    return;
                }
            }
            else Anim.SetIKPositionWeight(AvatarIKGoal.LeftHand, 0);
            Vector3? look = w > .05f ? reach.Value.target : LookAt;
            if (look.HasValue) { Anim.SetLookAtWeight(1, .25f + w * .3f, .8f, 1, .6f); Anim.SetLookAtPosition(look.Value); }
            else Anim.SetLookAtWeight(0);
            Anim.SetIKPositionWeight(AvatarIKGoal.RightHand, w);
            Anim.SetIKRotationWeight(AvatarIKGoal.RightHand, w * .6f);
            if (w > 0)
            {
                Anim.SetIKPosition(AvatarIKGoal.RightHand, reach.Value.target + Vector3.up * .025f);
                Anim.SetIKRotation(AvatarIKGoal.RightHand, Quaternion.LookRotation(reach.Value.target - transform.position, Vector3.up) * Quaternion.Euler(80, 0, 0)); // avuç aşağı
            }
        }
    }
    // Masada oturan rakibin hal hareketleri: sırası değilken arada bir çay içer, konuşur, başını sallar, güler.
    public class SeatedChatter : MonoBehaviour
    {
        public System.Func<bool> Busy; // sırası geldiyse (taş çekip atıyorsa) hareket yapılmaz
        Person p; float next;
        static readonly int[] Pool = { Person.Drink, Person.Drink, Person.Talk, Person.Talk, Person.Talk, Person.Yes, Person.No, Person.Laugh, Person.Ask };
        void Start() { p = GetComponent<Person>(); next = Time.time + Random.Range(2f, 8f); }
        void Update()
        {
            if (Time.time < next || !p) return;
            next = Time.time + Random.Range(6f, 15f);
            if (Busy != null && Busy()) return;
            int id = Pool[Random.Range(0, Pool.Length)];
            p.Gesture(id, id == Person.Drink ? 4.5f : 3.2f);
        }
    }
}