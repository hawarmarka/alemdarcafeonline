// Duvardaki plazma televizyon ve kumandası. Kanallar oyun klasöründeki tv.json dosyasından okunur:
//   { "channels": [ { "name": "Kanal adı", "url": "https://.../yayin.m3u8" } ] }
// Oyunla birlikte yayın adresi dağıtılmaz (yayın hakkı): oyuncu izinli olduğu adresleri kendisi ekler.
// Oynatıcı: oyun klasöründe Tv/ffmpeg.exe varsa FFmpeg (canlı yayın/HLS dahil, ücretsiz); yoksa Unity VideoPlayer (MP4/WebM).
using System.Collections.Generic;
using System.IO;
using Newtonsoft.Json.Linq;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.Video;
using Alemdar.UI;

namespace Alemdar.World
{
    public class Tv : MonoBehaviour
    {
        public static Tv I;
        readonly List<(string name, string url)> channels = new();
        VideoPlayer player; AudioSource sound; Renderer screen; Material screenOn, screenOff;
        RenderTexture rt; TextMesh osd; float osdUntil;
        TvStream stream; Texture2D streamTex; float vol = .6f; // FFmpeg yolu
        RectTransform remote; Text remoteInfo;
        int current = -1; bool on; float volume = .6f;

        static string ListPath => Path.Combine(Path.GetFullPath(Path.Combine(Application.dataPath, "..")), "tv.json");

        // Yerel +z odaya bakar. Genişlik 1,1 m (yaklaşık 50 inç), ince çerçeve, duvar askısı.
        public static Tv Build(Transform p, Vector3 pos, float ry)
        {
            var g = new GameObject("televizyon"); g.transform.SetParent(p, false); g.transform.localPosition = pos; g.transform.localRotation = Quaternion.Euler(0, ry, 0);
            var tv = g.AddComponent<Tv>(); I = tv;
            Props.Box(g.transform, new Vector3(.3f, .2f, .06f), Props.Black, new Vector3(0, 0, -.04f));              // duvar askısı
            Props.Box(g.transform, new Vector3(1.12f, .66f, .045f), Props.M(new Color(.05f, .05f, .06f), .75f), Vector3.zero);
            Props.Box(g.transform, new Vector3(.08f, .012f, .01f), Props.M(new Color(.2f, .2f, .22f), .6f), new Vector3(0, -.31f, .026f)); // marka şeridi yerine düz çıta
            tv.screenOff = Props.M(new Color(.02f, .02f, .025f), .92f);
            tv.screenOn = Props.Emissive(Color.white, 1f);
            var s = Props.Quad(g.transform, new Vector2(1.06f, .6f), tv.screenOff, new Vector3(0, .005f, .0235f), Quaternion.Euler(0, 180, 0));
            tv.screen = s.GetComponent<Renderer>(); tv.screen.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            tv.osd = Props.Text3D(g.transform, "", new Vector3(-.46f, .24f, .026f), 180, .04f, Color.white); tv.osd.anchor = TextAnchor.UpperLeft;
            tv.Setup();
            return tv;
        }

        void Setup()
        {
            rt = new RenderTexture(1280, 720, 0) { name = "tvEkran" };
            sound = gameObject.AddComponent<AudioSource>(); sound.spatialBlend = .85f; sound.minDistance = 2; sound.maxDistance = 14; sound.volume = volume;
            player = gameObject.AddComponent<VideoPlayer>();
            player.playOnAwake = false; player.isLooping = true; player.source = VideoSource.Url;
            player.renderMode = VideoRenderMode.RenderTexture; player.targetTexture = rt;
            player.audioOutputMode = VideoAudioOutputMode.AudioSource; player.SetTargetAudioSource(0, sound);
            player.errorReceived += (_, msg) => { Debug.LogWarning("TV yayını açılmadı: " + msg); Osd("Yayın açılamadı"); };
            if (TvStream.Available)
            {
                stream = new TvStream(); streamTex = new Texture2D(TvStream.W, TvStream.H, TextureFormat.RGB24, false) { name = "tvYayin" };
                screenOn.mainTexture = streamTex; screenOn.SetTexture("_EmissionMap", streamTex);
                sound.spatialBlend = 0; sound.Play(); // ses OnAudioFilterRead ile akar
            }
            else { screenOn.mainTexture = rt; screenOn.SetTexture("_EmissionMap", rt); }
            LoadChannels();
            BuildRemote();
        }

        void LoadChannels()
        {
            channels.Clear();
            try
            {
                if (!File.Exists(ListPath)) File.WriteAllText(ListPath, "{\n  \"channels\": []\n}\n");
                foreach (var c in (JArray)JObject.Parse(File.ReadAllText(ListPath))["channels"] ?? new JArray())
                {
                    string name = (string)c["name"], url = (string)c["url"];
                    if (!string.IsNullOrWhiteSpace(name) && !string.IsNullOrWhiteSpace(url) && (url.StartsWith("http://") || url.StartsWith("https://") || File.Exists(url))) channels.Add((name.Trim(), url.Trim()));
                }
            }
            catch (System.Exception e) { Debug.LogWarning("tv.json okunamadı: " + e.Message); }
        }

        // ---------- kumanda ----------
        void BuildRemote()
        {
            remote = Ui.Card(Ui.Canvas.transform, new Vector2(380, 470)); Ui.Anchor(remote, new Vector2(1, .5f), new Vector2(1, .5f), new Vector2(-220, 0), new Vector2(380, 470));
            var col = Ui.Column(remote, 10, new RectOffset(20, 20, 18, 18)); Ui.Stretch(col);
            Ui.Size(Ui.Label(col, "TELEVİZYON", 26, Ui.Ink, TextAnchor.MiddleCenter, FontStyle.Bold), -1, 36);
            remoteInfo = Ui.Label(col, "", 20, Ui.Muted, TextAnchor.MiddleCenter); Ui.Size(remoteInfo, -1, 70);
            var r1 = Ui.Row(col, 10); Ui.Size(r1, -1, 58);
            Ui.Button(r1, "AÇ / KAPA", Ui.Kind.Primary, Power, new Vector2(150, 54));
            Ui.Button(r1, "SES −", Ui.Kind.Plain, () => Volume(-.1f), new Vector2(76, 54));
            Ui.Button(r1, "SES +", Ui.Kind.Plain, () => Volume(.1f), new Vector2(76, 54));
            var r2 = Ui.Row(col, 10); Ui.Size(r2, -1, 58);
            Ui.Button(r2, "◀ KANAL", Ui.Kind.Plain, () => Step(-1), new Vector2(150, 54));
            Ui.Button(r2, "KANAL ▶", Ui.Kind.Plain, () => Step(1), new Vector2(150, 54));
            Ui.Button(col, "LİSTEYİ YENİLE", Ui.Kind.Ghost, () => { LoadChannels(); Paint(); Ui.Toast(channels.Count + " kanal yüklendi."); }, new Vector2(320, 50));
            Ui.Button(col, "KAPAT", Ui.Kind.Ghost, () => remote.gameObject.SetActive(false), new Vector2(320, 50));
            remote.gameObject.SetActive(false);
        }
        public void ToggleRemote() { remote.gameObject.SetActive(!remote.gameObject.activeSelf); Paint(); }
        void Paint()
        {
            if (!remoteInfo) return;
            remoteInfo.text = channels.Count == 0 ? "Kanal listesi boş.\nOyun klasöründeki tv.json dosyasına izinli yayın adreslerini ekle."
                : !on ? $"{channels.Count} kanal · televizyon kapalı" : $"{current + 1}. {channels[current].name}\nSes %{Mathf.RoundToInt(volume * 100)}";
        }

        void Power()
        {
            if (channels.Count == 0) { Paint(); Ui.Toast("Önce tv.json dosyasına kanal ekle."); return; }
            on = !on;
            if (on) Tune(current < 0 ? 0 : current); else { player.Stop(); stream?.Stop(); screen.sharedMaterial = screenOff; osd.text = ""; }
            Paint();
        }
        void Step(int d) { if (!on || channels.Count == 0) return; Tune((current + d + channels.Count) % channels.Count); Paint(); }
        void Volume(float d) { volume = Mathf.Clamp01(volume + d); sound.volume = volume; vol = volume; Osd("Ses %" + Mathf.RoundToInt(volume * 100)); Paint(); }
        void Tune(int i)
        {
            current = i;
            if (stream != null) stream.Start(channels[i].url);
            else { player.Stop(); player.url = channels[i].url; player.Prepare(); player.prepareCompleted -= Started; player.prepareCompleted += Started; }
            screen.sharedMaterial = screenOn; Osd($"{i + 1}  {channels[i].name}");
        }
        void Started(VideoPlayer v) { if (on) v.Play(); }
        void Osd(string text) { osd.text = text; osdUntil = Time.time + 3; }

        void Update()
        {
            if (osd.text.Length > 0 && Time.time > osdUntil) osd.text = "";
            if (on && stream != null) { stream.Upload(streamTex); if (stream.Error != null && osd.text.Length == 0) Osd("Yayın açılamadı"); }
            if (Input.GetKeyDown(KeyCode.T) && !Ui.TypingText) ToggleRemote();
        }
        void OnAudioFilterRead(float[] data, int channels) { if (stream != null && on) stream.Fill(data, vol); }
        void OnDestroy() { if (rt) rt.Release(); stream?.Dispose(); }
        void OnApplicationQuit() => stream?.Dispose();
    }
}
