// Grafik ayarı: Otomatik (varsayılan) ya da elle Yüksek / Orta / Düşük / En düşük. Otomatikte 4 saniyelik ortalama 40 FPS'in
// altına inerse bir kademe düşürülür (geri yükseltilmez: gidip gelme takılma yapar). Seçim PlayerPrefs "grafik" içinde.
using UnityEngine;

namespace Alemdar
{
    public class Quality : MonoBehaviour
    {
        public static Quality I;
        public static readonly string[] Names = { "Yüksek", "Orta", "Düşük", "En düşük" };
        public int Level { get; private set; }
        public bool Auto { get; private set; }
        float windowStart, startAt;
        int baseW, baseH;

        void Awake()
        {
            I = this; baseW = Screen.width; baseH = Screen.height;
            int saved = PlayerPrefs.GetInt("grafik", -1);
            if (DevShots.Arg("-grafik") is { Length: > 0 } g && int.TryParse(g, out int forced)) saved = forced;
            Auto = saved < 0; Apply(Auto ? 0 : Mathf.Clamp(saved, 0, 3));
            startAt = Time.realtimeSinceStartup + 12; // yükleme ve ısınma turu sayılmasın
        }

        // Menüdeki düğme: Otomatik → Yüksek → Orta → Düşük → En düşük → Otomatik
        public string Cycle()
        {
            int next = Auto ? 0 : Level + 1;
            if (next > 3) { Auto = true; PlayerPrefs.SetInt("grafik", -1); Apply(0); }
            else { Auto = false; PlayerPrefs.SetInt("grafik", next); Apply(next); }
            return Label;
        }
        public string Label => "Grafik: " + (Auto ? $"Otomatik ({Names[Level]})" : Names[Level]);

        public void Apply(int level)
        {
            Level = level;
            QualitySettings.shadows = level == 0 ? ShadowQuality.All : level == 1 ? ShadowQuality.HardOnly : ShadowQuality.Disable;
            QualitySettings.shadowResolution = level == 0 ? ShadowResolution.High : ShadowResolution.Medium;
            QualitySettings.shadowDistance = level == 0 ? 22 : 16;
            QualitySettings.antiAliasing = level == 0 ? 4 : level == 1 ? 2 : 0;
            QualitySettings.pixelLightCount = level == 0 ? 6 : level == 1 ? 3 : 1;
            QualitySettings.lodBias = level <= 1 ? 1f : .7f;
            QualitySettings.globalTextureMipmapLimit = level >= 3 ? 1 : 0;
            if (World.Neighborhood.LawnRenderer) World.Neighborhood.LawnRenderer.enabled = level <= 1; // çim kartları dolgu yükü getirir
            var cam = Camera.main; if (cam) { cam.allowMSAA = level <= 1; cam.allowHDR = level <= 1; }
            // en düşükte çözünürlük %75 (pencere boyutu aynı kalır)
            if (level >= 3) Screen.SetResolution(Mathf.RoundToInt(baseW * .75f), Mathf.RoundToInt(baseH * .75f), Screen.fullScreenMode);
            else if (Screen.width != baseW && Screen.width == Mathf.RoundToInt(baseW * .75f)) Screen.SetResolution(baseW, baseH, Screen.fullScreenMode);
        }

        // Ortanca kare süresine bakılır (tek tük takılmalar sayılmaz); arka arkaya iki kötü pencerede bir kademe düşer.
        readonly System.Collections.Generic.List<float> win = new(); int bad;
        void Update()
        {
            if (!Auto || Level >= 3 || Time.realtimeSinceStartup < startAt) return;
            if (win.Count == 0) windowStart = Time.realtimeSinceStartup;
            win.Add(Time.unscaledDeltaTime);
            if (Time.realtimeSinceStartup - windowStart < 4) return;
            win.Sort(); float med = win[win.Count / 2]; win.Clear();
            bad = med > 1f / 38 ? bad + 1 : 0;
            if (bad < 2) return;
            bad = 0; Apply(Level + 1);
            UI.Ui.Toast($"Akıcılık için grafik ayarı düşürüldü: {Names[Level]} (Menü > Grafik)", 4);
            startAt = Time.realtimeSinceStartup + 3;
        }    }
}
