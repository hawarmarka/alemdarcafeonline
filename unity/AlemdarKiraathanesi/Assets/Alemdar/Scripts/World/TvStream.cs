// Canlı yayın (HLS dahil) için ücretsiz yol: FFmpeg (LGPL) yayını çözer; görüntü kareleri ve ses ham olarak borudan okunur.
// ffmpeg.exe oyun klasöründe Tv/ altında (derlemede FFmpegRuntime'dan kopyalanır). Yoksa Tv, Unity VideoPlayer'ı kullanır.
// Görüntü 640×360, 25 kare/sn (duvardaki televizyon için yeterli, işlemciye yük olmaz); ses 44,1 kHz stereo.
using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using UnityEngine;

namespace Alemdar.World
{
    public class TvStream : IDisposable
    {
        public const int W = 640, H = 360;
        const int FrameBytes = W * H * 3, Rate = 44100;
        public static string Exe => Path.Combine(Path.GetFullPath(Path.Combine(Application.dataPath, "..")), "Tv", "ffmpeg.exe");
        public static bool Available => File.Exists(Exe);

        Process video, audio; Thread vThread, aThread; volatile bool running;
        readonly byte[] back = new byte[FrameBytes], front = new byte[FrameBytes]; volatile bool fresh;
        readonly float[] ring = new float[Rate * 2 * 2]; int head, tail; readonly object ringLock = new();
        public string Error { get; private set; }

        public void Start(string url)
        {
            Stop(); running = true; Error = null;
            string input = $"-hide_banner -loglevel error -reconnect 1 -reconnect_streamed 1 -reconnect_delay_max 4 -re -i \"{url}\"";
            video = Run($"{input} -an -vf scale={W}:{H},vflip -r 25 -pix_fmt rgb24 -f rawvideo pipe:1");
            audio = Run($"{input} -vn -ac 2 -ar {Rate} -f f32le pipe:1");
            vThread = new Thread(ReadVideo) { IsBackground = true, Name = "tv-goruntu" }; vThread.Start();
            aThread = new Thread(ReadAudio) { IsBackground = true, Name = "tv-ses" }; aThread.Start();
        }

        static Process Run(string args)
        {
            var psi = new ProcessStartInfo(Exe, args) { UseShellExecute = false, CreateNoWindow = true, RedirectStandardOutput = true, RedirectStandardError = true };
            var p = new Process { StartInfo = psi }; p.Start(); p.ErrorDataReceived += (_, e) => { }; p.BeginErrorReadLine(); return p;
        }

        void ReadVideo()
        {
            try
            {
                var s = video.StandardOutput.BaseStream;
                while (running)
                {
                    int got = 0;
                    while (got < FrameBytes) { int n = s.Read(back, got, FrameBytes - got); if (n <= 0) { Error = "Yayın kesildi"; return; } got += n; }
                    lock (front) { Buffer.BlockCopy(back, 0, front, 0, FrameBytes); fresh = true; }
                }
            }
            catch (Exception e) { if (running) Error = e.Message; }
        }

        void ReadAudio()
        {
            try
            {
                var s = audio.StandardOutput.BaseStream; var buf = new byte[4096 * 4];
                while (running)
                {
                    int n = s.Read(buf, 0, buf.Length); if (n <= 0) return;
                    lock (ringLock)
                        for (int i = 0; i + 3 < n; i += 4)
                        {
                            ring[head] = BitConverter.ToSingle(buf, i); head = (head + 1) % ring.Length;
                            if (head == tail) tail = (tail + 1) % ring.Length; // dolarsa en eski örnek atılır (gecikme birikmez)
                        }
                }
            }
            catch (Exception) { }
        }

        // ana iş parçacığı: yeni kare varsa dokuya yükler
        public bool Upload(Texture2D tex)
        {
            if (!fresh) return false;
            lock (front) { tex.LoadRawTextureData(front); fresh = false; }
            tex.Apply(false); return true;
        }

        // ses iş parçacığı (OnAudioFilterRead): halkadan çal, yoksa sessiz
        public void Fill(float[] data, float volume)
        {
            lock (ringLock)
                for (int i = 0; i < data.Length; i++)
                {
                    if (tail == head) { data[i] = 0; continue; }
                    data[i] = ring[tail] * volume; tail = (tail + 1) % ring.Length;
                }
        }

        public void Stop()
        {
            running = false;
            foreach (var p in new[] { video, audio }) try { if (p != null && !p.HasExited) p.Kill(); } catch { }
            video = audio = null; fresh = false; lock (ringLock) { head = tail = 0; }
        }
        public void Dispose() => Stop();
    }
}
