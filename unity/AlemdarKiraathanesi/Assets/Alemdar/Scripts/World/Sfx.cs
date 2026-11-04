// Oyundaki bütün sesler kodla üretilir (ses dosyası ve lisans yok): konuşma mırıltısı (formant sentezi, kişiye göre ses tonu),
// kahvenin uğultusu, kuşlar, yağmur, araba motoru, taş şakırtısı, kâğıt, bardak, höpürtü, çakmak ve nefes.
// Konuşma: her cümle için harf sayısına göre hecelerden kısa bir ses kurulur; bağıranın sesi yüksek ve tizdir.
using System.Collections.Generic;
using UnityEngine;

namespace Alemdar.World
{
    public static class Sfx
    {
        const int Rate = 22050;
        static readonly Dictionary<string, AudioClip> clips = new();
        static Transform root; static readonly List<AudioSource> pool = new();
        public static float Volume = 1f; // menüdeki ses ayarı
        static AudioSource rain, crowd;

        public static void Init()
        {
            if (root) return;
            root = new GameObject("Sesler").transform;
            Volume = PlayerPrefs.GetFloat("ses", 1f);
            AudioListener.volume = Volume;
            // kahvenin içinde sürekli uğultu (uzak sohbet, kaşık şıngırtısı), parkta kuşlar
            crowd = Loop("ugultu", Murmur(), new Vector3(0, 1.4f, -.5f), .32f, 3, 14);
            Loop("kuslar", Birds(), new Vector3(-6, 4, 30), .55f, 6, 38);
            Loop("kuslar2", Birds(7), new Vector3(16, 4, 36), .45f, 6, 38);
            rain = Loop("yagmur", Noise(6f, .0f, true), Vector3.zero, 0f, 1, 500); rain.spatialBlend = 0;
        }
        public static void SetVolume(float v) { Volume = Mathf.Clamp01(v); AudioListener.volume = Volume; PlayerPrefs.SetFloat("ses", Volume); }
        public static void Raining(bool on) { if (rain) rain.volume = Mathf.MoveTowards(rain.volume, on ? .55f : 0, Time.deltaTime * .3f); }

        static AudioSource Loop(string name, AudioClip clip, Vector3 pos, float vol, float minD, float maxD)
        {
            var s = new GameObject(name).AddComponent<AudioSource>(); s.transform.SetParent(root, false); s.transform.position = pos;
            s.clip = clip; s.loop = true; s.volume = vol; s.spatialBlend = 1; s.rolloffMode = AudioRolloffMode.Linear; s.minDistance = minD; s.maxDistance = maxD; s.dopplerLevel = 0;
            s.Play(); return s;
        }
        static AudioSource Source()
        {
            foreach (var s in pool) if (!s.isPlaying) { if (s.clip && s.clip.name == "soz") { Object.Destroy(s.clip); s.clip = null; } return s; } // konuşma sesi tek kullanımlık: bellekte birikmesin
            var n = new GameObject("ses").AddComponent<AudioSource>(); n.transform.SetParent(root, false); n.spatialBlend = 1; n.rolloffMode = AudioRolloffMode.Logarithmic; n.dopplerLevel = 0;
            pool.Add(n); return n;
        }
        public static void Play(string kind, Vector3 pos, float vol = 1, float pitch = 1, float minD = 1.2f)
        {
            if (!root || Volume <= 0) return;
            if (!clips.TryGetValue(kind, out var c)) clips[kind] = c = Make(kind);
            if (!c) return;
            var s = Source(); s.transform.position = pos; s.clip = c; s.volume = vol; s.pitch = pitch * Random.Range(.94f, 1.06f); s.minDistance = minD; s.maxDistance = 30; s.Play();
        }

        // ---------- konuşma ----------
        // seed: kişiye sabit ses tonu; female/child: tiz ses; shout: bağırma. Söz uzunluğu harf sayısından.
        public static void Voice(Vector3 pos, string text, uint seed, bool shout, bool high = false)
        {
            if (!root || Volume <= 0 || string.IsNullOrEmpty(text)) return;
            var cam = Camera.main; if (cam && (cam.transform.position - pos).sqrMagnitude > 30 * 30) return; // uzaktakinin sesi duyulmaz, boşuna üretilmez
            var clip = Speech(text, seed, shout, high);
            var s = Source(); s.transform.position = pos; s.clip = clip; s.pitch = 1; s.volume = shout ? 1f : .7f; s.minDistance = shout ? 4f : 1.6f; s.maxDistance = shout ? 40 : 22; s.Play();
        }
        static readonly (float f1, float f2)[] Vowels = { (800, 1250), (520, 1850), (320, 2300), (520, 900), (360, 820), (430, 1600) }; // a e i o u ı/ö
        static AudioClip Speech(string text, uint seed, bool shout, bool high)
        {
            var rng = new System.Random((int)(seed ^ (uint)text.GetHashCode()));
            float baseF0 = high ? 205 + seed % 60 : 98 + seed % 45; if (shout) baseF0 *= 1.35f;
            int syll = Mathf.Clamp(text.Length / 3, 2, 22); float syllDur = shout ? .17f : .14f;
            int n = (int)(Rate * (syll * syllDur + .1f)); var data = new float[n];
            var b1 = new Reso(); var b2 = new Reso(); float phase = 0;
            for (int k = 0; k < syll; k++)
            {
                var (f1, f2) = Vowels[rng.Next(Vowels.Length)]; if (high) { f1 *= 1.15f; f2 *= 1.18f; }
                b1.Set(f1, 90); b2.Set(f2, 130);
                int s0 = (int)(k * syllDur * Rate), len = (int)(syllDur * Rate * (.75f + (float)rng.NextDouble() * .35f));
                float pitchSlope = (float)(rng.NextDouble() - .5) * .25f + (k == syll - 1 ? (text.EndsWith("?") ? .3f : -.2f) : 0);
                bool stop = rng.NextDouble() < .55; // hecenin başında ünsüz patlaması (t, k, s...)
                for (int i = 0; i < len && s0 + i < n; i++)
                {
                    float noise = (float)(rng.NextDouble() * 2 - 1);
                    float t = i / (float)len, f0 = baseF0 * (1 + pitchSlope * t) * (1 + Mathf.Sin(i * .002f) * .03f);
                    phase += f0 / Rate; if (phase > 1) phase -= 1;
                    float src = (Mathf.Sin(phase * 2 * Mathf.PI) + .35f * Mathf.Sin(phase * 4 * Mathf.PI) + .12f * Mathf.Sin(phase * 6 * Mathf.PI)) * .8f + noise * .18f; // yumuşak ses teli + nefes (keskin darbe vızıltı yapıyordu)
                    float env = Mathf.Sin(Mathf.Clamp01(t * 1.1f) * Mathf.PI); env *= env;
                    float cons = stop && t < .12f ? (1 - t / .12f) : 0;
                    float v = (b1.Do(src) * .7f + b2.Do(src) * .45f) * env + noise * cons * .25f;
                    data[s0 + i] += v * (shout ? .5f : .32f);
                }
            }
            // yumuşak kırpma (bağırınca hafif çatlak ses)
            for (int i = 0; i < n; i++) data[i] = (float)System.Math.Tanh(data[i] * (shout ? 2.2f : 1.4f)) * .8f;
            var c = AudioClip.Create("soz", n, 1, Rate, false); c.SetData(data, 0); return c;
        }
        // iki kutuplu rezonans süzgeci (formant)
        class Reso
        {
            float a1, a2, g, y1, y2;
            public void Set(float f, float bw) { float r = Mathf.Exp(-Mathf.PI * bw / Rate); a1 = 2 * r * Mathf.Cos(2 * Mathf.PI * f / Rate); a2 = -r * r; g = 1 - r; }
            public float Do(float x) { float y = g * x + a1 * y1 + a2 * y2; y2 = y1; y1 = y; return y; }
        }

        // ---------- ortam sesleri ----------
        static AudioClip Murmur()
        {
            int n = Rate * 16; var d = new float[n]; var rng = new System.Random(3);
            for (int v = 0; v < 9; v++) // uzaktan dokuz kişinin karışık sohbeti
            {
                var clip = Speech(new string('a', 30 + rng.Next(30)), (uint)rng.Next(), rng.NextDouble() < .1, v % 4 == 3);
                var tmp = new float[clip.samples]; clip.GetData(tmp, 0); Object.Destroy(clip);
                for (int rep = 0; rep < 3; rep++) { int at = rng.Next(n); for (int i = 0; i < tmp.Length; i++) d[(at + i) % n] += tmp[i] * .35f; }
            }
            for (int k = 0; k < 14; k++) { int at = rng.Next(n - 3000); Tink(d, at, 2600 + rng.Next(1500), .18f); } // kaşık, bardak
            float lp = 0; for (int i = 0; i < n; i++) { lp += (d[i] - lp) * .35f; d[i] = lp; } // uzaktan geldiği için tok
            return Clip("ugultu", d);
        }
        static AudioClip Birds(int seed = 1)
        {
            int n = Rate * 14; var d = new float[n]; var rng = new System.Random(seed);
            for (int k = 0; k < 22; k++)
            {
                int at = rng.Next(n - Rate); float f = 2600 + (float)rng.NextDouble() * 2400; int notes = 1 + rng.Next(5);
                for (int m = 0; m < notes; m++)
                {
                    int len = (int)(Rate * (.05f + rng.NextDouble() * .09f)), s0 = at + m * (len + rng.Next(800)); float sweep = (float)(rng.NextDouble() - .5) * 1800, ph = 0;
                    for (int i = 0; i < len && s0 + i < n; i++) { float t = i / (float)len; ph += (f + sweep * t) / Rate; d[s0 + i] += Mathf.Sin(ph * 2 * Mathf.PI) * Mathf.Sin(t * Mathf.PI) * .22f; }
                }
            }
            return Clip("kus" + seed, d);
        }
        // pembe gürültü: yağmur (ince damla şakırtılı) ve rüzgâr
        static AudioClip Noise(float seconds, float lowpass, bool drops)
        {
            int n = (int)(Rate * seconds); var d = new float[n]; var rng = new System.Random(5); float b0 = 0, b1 = 0, b2 = 0;
            for (int i = 0; i < n; i++)
            {
                float w = (float)(rng.NextDouble() * 2 - 1);
                b0 = .99765f * b0 + w * .099046f; b1 = .963f * b1 + w * .2965164f; b2 = .57f * b2 + w * 1.0526913f;
                d[i] = (b0 + b1 + b2 + w * .1848f) * .09f;
                if (drops && rng.NextDouble() < .0009) for (int k = 0; k < 120 && i + k < n; k++) d[i + k] += Mathf.Sin(k * .9f) * Mathf.Exp(-k / 25f) * .12f;
            }
            for (int i = 0; i < 2000; i++) { float f = i / 2000f; d[i] *= f; d[n - 1 - i] *= f; } // döngü ekinde çıt olmasın
            return Clip("gurultu", d);
        }
        static void Tink(float[] d, int at, float f, float amp) { for (int i = 0; i < 2600 && at + i < d.Length; i++) d[at + i] += Mathf.Sin(i * 2 * Mathf.PI * f / Rate) * Mathf.Exp(-i / 420f) * amp; }
        static AudioClip Clip(string name, float[] d) { var c = AudioClip.Create(name, d.Length, 1, Rate, false); c.SetData(d, 0); return c; }

        // ---------- kısa sesler ----------
        static AudioClip Make(string kind)
        {
            var rng = new System.Random(kind.GetHashCode());
            float[] d;
            switch (kind)
            {
                case "tas": // okey taşı masaya: tok tık
                    d = new float[Rate / 8];
                    for (int i = 0; i < d.Length; i++) d[i] = (Mathf.Sin(i * 2 * Mathf.PI * 1900f / Rate) * .5f + Mathf.Sin(i * 2 * Mathf.PI * 3100f / Rate) * .3f + (float)(rng.NextDouble() * 2 - 1) * .4f * Mathf.Exp(-i / 60f)) * Mathf.Exp(-i / 260f) * .7f;
                    break;
                case "kagit": // iskambil kâğıdı: kısa hışırtı + şap
                    d = new float[Rate / 6];
                    for (int i = 0; i < d.Length; i++) { float t = i / (float)d.Length; d[i] = (float)(rng.NextDouble() * 2 - 1) * (t < .7f ? t / .7f : (1 - t) / .3f) * .35f + (i > d.Length * .7f ? Mathf.Sin(i * .5f) * Mathf.Exp(-(i - d.Length * .7f) / 80f) * .3f : 0); }
                    break;
                case "bardak": d = new float[Rate / 3]; Tink(d, 0, 2900, .45f); Tink(d, 900, 4300, .2f); break;
                case "hopurtu": // çay höpürtüsü: yükselen sızıltı
                    d = new float[(int)(Rate * .5f)];
                    { float lp = 0; for (int i = 0; i < d.Length; i++) { float t = i / (float)d.Length; float w = (float)(rng.NextDouble() * 2 - 1); lp += (w - lp) * (.05f + t * .25f); d[i] = lp * Mathf.Sin(t * Mathf.PI) * 1.4f; } }
                    break;
                case "cakmak": // taşlı çakmak: çıt + kısa fıs
                    d = new float[Rate / 4];
                    for (int i = 0; i < d.Length; i++) d[i] = (i < 300 ? (float)(rng.NextDouble() * 2 - 1) * .8f * Mathf.Exp(-i / 40f) : 0) + (i > 900 ? (float)(rng.NextDouble() * 2 - 1) * .2f * Mathf.Exp(-(i - 900) / 1500f) : 0);
                    break;
                case "nefes": // dumanı üflemek
                    d = new float[(int)(Rate * 1.1f)];
                    { float lp = 0; for (int i = 0; i < d.Length; i++) { float t = i / (float)d.Length; lp += ((float)(rng.NextDouble() * 2 - 1) - lp) * .12f; d[i] = lp * Mathf.Sin(t * Mathf.PI) * (1 - t * .5f) * 1.2f; } }
                    break;
                case "fokur": // nargile fokurtusu: su kabarcıkları
                    d = new float[(int)(Rate * 1.2f)];
                    for (int k = 0; k < 26; k++) { int at = rng.Next(d.Length - 900); float f = 300 + rng.Next(500); for (int i = 0; i < 900; i++) d[at + i] += Mathf.Sin(i * 2 * Mathf.PI * (f + i * .4f) / Rate) * Mathf.Exp(-i / 160f) * .3f; }
                    break;
                case "zar": d = new float[Rate / 3]; for (int k = 0; k < 4; k++) { int at = k * 1300 + rng.Next(400); for (int i = 0; i < 700 && at + i < d.Length; i++) d[at + i] += (float)(rng.NextDouble() * 2 - 1) * Mathf.Exp(-i / 120f) * .5f; } break;
                default: return null;
            }
            return Clip(kind, d);
        }

        // Araba motoru: alçak uğultu + egzoz gürültüsü; hızla ses tonu değişir (Traffic ayarlar).
        public static AudioSource Engine(Transform car)
        {
            if (!clips.TryGetValue("motor", out var c))
            {
                int n = Rate * 2; var d = new float[n]; var rng = new System.Random(9); float ph = 0, lp = 0;
                for (int i = 0; i < n; i++) { ph += 42f / Rate; if (ph > 1) ph -= 1; lp += ((float)(rng.NextDouble() * 2 - 1) - lp) * .04f; d[i] = (ph * 2 - 1) * .25f + Mathf.Sin(i * 2 * Mathf.PI * 84f / Rate) * .2f + lp * .6f; }
                clips["motor"] = c = Clip("motor", d);
            }
            var s = car.gameObject.AddComponent<AudioSource>(); s.clip = c; s.loop = true; s.spatialBlend = 1; s.rolloffMode = AudioRolloffMode.Linear; s.minDistance = 3; s.maxDistance = 45; s.dopplerLevel = .6f; s.volume = .55f;
            s.Play(); return s;
        }
    }
}
