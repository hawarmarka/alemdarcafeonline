// Hava ve gün döngüsü: açık gündüz → bulutlu (bazen yağmur) → gün batımı → gece → sabah. Gökyüzü Poly Haven HDRI'leri.
// Gece sokak lambaları, tabela ve pencereler yanar; yağmur kameranın üstünde yağar, salonun ve terasın içinde yağmaz.
using UnityEngine;

namespace Alemdar.World
{
    public class Weather : MonoBehaviour
    {
        public static Weather I;
        // her evre: gökyüzü dokusu, güneş açısı/rengi/şiddeti, ortam ışığı, sis rengi, lamba açık mı
        struct Phase { public int sky; public float pitch, sun, amb, exposure; public Color sunC, fog; public bool lamps; public float rain; public string name; }
        static readonly Phase[] Phases =
        {
            new() { name = "Gündüz", sky = 0, pitch = 42, sun = 1.25f, amb = 1f, exposure = 1f, sunC = new(1f, .95f, .86f), fog = new(.8f, .85f, .9f) },
            new() { name = "Bulutlu", sky = 1, pitch = 55, sun = .55f, amb = .8f, exposure = .9f, sunC = new(.9f, .92f, .95f), fog = new(.66f, .69f, .72f), rain = .5f },
            new() { name = "Gün batımı", sky = 2, pitch = 8, sun = .9f, amb = .62f, exposure = .95f, sunC = new(1f, .62f, .35f), fog = new(.75f, .6f, .5f), lamps = true },
            new() { name = "Gece", sky = 3, pitch = 30, sun = .08f, amb = .28f, exposure = .7f, sunC = new(.55f, .65f, 1f), fog = new(.07f, .08f, .12f), lamps = true },
        };
        const float PhaseSeconds = 300; // her evre 5 dakika; geçiş son 25 saniyede
        Light sun; Material sky; ParticleSystem rain; bool raining;
        Color ambSky, ambEq, ambGround;
        public float Offset;   // denetim: evreyi ileri sarmak için (saniye)
        public bool ForceRain; // denetim: yağmuru zorla
        float Clock => Time.time + Offset;
        public string Now => Phases[Index].name;
        int Index => (int)(Clock / PhaseSeconds) % Phases.Length;
        public void Show(int phase) => Offset = phase * PhaseSeconds + PhaseSeconds * .5f - Time.time;

        public static void Install(GameObject host) { I = host.AddComponent<Weather>(); }

        void Start()
        {
            sun = RenderSettings.sun;
            ambSky = RenderSettings.ambientSkyColor; ambEq = RenderSettings.ambientEquatorColor; ambGround = RenderSettings.ambientGroundColor;
            if (Lib.I.skybox) { sky = new Material(Lib.I.skybox); RenderSettings.skybox = sky; if (Camera.main) Camera.main.clearFlags = CameraClearFlags.Skybox; }
            RenderSettings.fogStartDistance = 25; RenderSettings.fogEndDistance = 95;
            rain = MakeRain();
            raining = Random.value < .5f;
        }

        void Update()
        {
            float t = Clock / PhaseSeconds; int i = (int)t % Phases.Length; float local = t - Mathf.Floor(t);
            var a = Phases[i]; var b = Phases[(i + 1) % Phases.Length];
            float k = Mathf.SmoothStep(0, 1, Mathf.InverseLerp(1 - 25f / PhaseSeconds, 1, local)); // evre sonunda yumuşak geçiş
            if (sun)
            {
                sun.intensity = Mathf.Lerp(a.sun, b.sun, k); sun.color = Color.Lerp(a.sunC, b.sunC, k);
                sun.transform.rotation = Quaternion.Euler(Mathf.Lerp(a.pitch, b.pitch, k), 200, 0);
            }
            float amb = Mathf.Lerp(a.amb, b.amb, k);
            RenderSettings.ambientSkyColor = ambSky * amb; RenderSettings.ambientEquatorColor = ambEq * amb; RenderSettings.ambientGroundColor = ambGround * amb;
            RenderSettings.fogColor = Color.Lerp(a.fog, b.fog, k);
            if (sky)
            {
                var tex = Lib.I.skies != null && Lib.I.skies.Length > (k < .5f ? a.sky : b.sky) ? Lib.I.skies[k < .5f ? a.sky : b.sky] : null;
                if (tex && sky.GetTexture("_MainTex") != tex) sky.SetTexture("_MainTex", tex);
                sky.SetFloat("_Exposure", Mathf.Lerp(a.exposure, b.exposure, k));
            }
            bool lamps = k < .5f ? a.lamps : b.lamps;
            float glow = lamps ? 1 : 0;
            foreach (var l in Neighborhood.Lamps) if (l) l.intensity = Mathf.MoveTowards(l.intensity, glow * 1.8f, Time.deltaTime);
            if (Apartment.WinLit) Apartment.WinLit.SetColor("_EmissionColor", new Color(.95f, .8f, .52f) * (lamps ? 1.4f : .05f));
            // yağmur: bulutlu evrede (o evreye girerken bir kez kura), yalnızca açık havada
            if (local < .01f) raining = Random.value < Mathf.Max(a.rain, .01f);
            bool wantRain = (ForceRain || raining && a.rain > 0) && Outdoors();
            var em = rain.emission; em.rateOverTime = Mathf.MoveTowards(em.rateOverTime.constant, wantRain ? 900 : 0, Time.deltaTime * 600);
            if (Camera.main) rain.transform.position = Camera.main.transform.position + Vector3.up * 8;
        }

        // yükleme perdesi kapalıyken her gökyüzünü birkaç kare çizer (doku GPU'ya iner, ortam ışığı hesaplanır)
        public System.Collections.IEnumerator Prewarm()
        {
            if (!sky || Lib.I.skies == null) yield break;
            var cur = sky.GetTexture("_MainTex");
            foreach (var s in Lib.I.skies) { if (!s) continue; sky.SetTexture("_MainTex", s); DynamicGI.UpdateEnvironment(); yield return null; yield return null; }
            sky.SetTexture("_MainTex", cur); DynamicGI.UpdateEnvironment();
        }

        // kamera salonun ya da terasın çatısı altında değilse açık havadadır
        static bool Outdoors()
        {
            if (!Camera.main) return false; var p = Camera.main.transform.position;
            bool underRoof = p.x > Hall.MinX - .3f && p.x < Hall.MaxX + .3f && p.z < Hall.TerraceZ && p.y < Hall.Height + .2f;
            return !underRoof;
        }

        ParticleSystem MakeRain()
        {
            var go = new GameObject("yagmur"); var ps = go.AddComponent<ParticleSystem>(); ps.Stop(true, ParticleSystemStopBehavior.StopEmittingAndClear);
            var main = ps.main; main.startLifetime = 1.1f; main.startSpeed = 0; main.startSize = new ParticleSystem.MinMaxCurve(.012f, .02f);
            main.startColor = new Color(.75f, .8f, .88f, .35f); main.maxParticles = 1500; main.simulationSpace = ParticleSystemSimulationSpace.World; main.gravityModifier = 0;
            var vel = ps.velocityOverLifetime; vel.enabled = true; vel.space = ParticleSystemSimulationSpace.World;
            vel.x = new ParticleSystem.MinMaxCurve(-.6f, -.6f); vel.y = new ParticleSystem.MinMaxCurve(-11f, -11f); vel.z = new ParticleSystem.MinMaxCurve(0f, 0f);
            var sh = ps.shape; sh.shapeType = ParticleSystemShapeType.Box; sh.scale = new Vector3(24, .1f, 24);
            var em = ps.emission; em.rateOverTime = 0;
            var r = go.GetComponent<ParticleSystemRenderer>(); r.renderMode = ParticleSystemRenderMode.Stretch; r.velocityScale = .06f; r.lengthScale = 1;
            r.sharedMaterial = new Material(Lib.I.smoke); r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            ps.Play(); return ps;
        }
    }
}
