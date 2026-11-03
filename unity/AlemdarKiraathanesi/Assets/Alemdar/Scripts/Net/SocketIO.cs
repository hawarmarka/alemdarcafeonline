// Küçük Socket.IO v4 istemcisi (Engine.IO v4, yalnız WebSocket). Sunucu: Node + socket.io 4.
// Olaylar ana iş parçacığında (Update) dağıtılır; Unity nesnelerine güvenle dokunulabilir.
using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using Newtonsoft.Json.Linq;
using UnityEngine;

namespace Alemdar.Net
{
    public class SocketIO : MonoBehaviour
    {
        public string Url { get; private set; }
        public bool Connected { get; private set; }
        public event Action OnConnect, OnDisconnect;

        readonly Dictionary<string, List<Action<JToken>>> handlers = new();
        readonly Dictionary<int, Action<JToken>> acks = new();
        readonly ConcurrentQueue<Action> main = new();
        readonly ConcurrentQueue<string> outbox = new();
        ClientWebSocket ws;
        CancellationTokenSource cts;
        int ackId;
        bool wantOpen;
        readonly SemaphoreSlim sendLock = new(1, 1); // ClientWebSocket aynı anda tek gönderim kabul eder (pong ile oyun mesajı çakışmasın)

        public void Connect(string httpUrl)
        {
            Url = httpUrl.TrimEnd('/'); wantOpen = true;
            _ = Loop();
        }

        public void On(string ev, Action<JToken> fn)
        {
            if (!handlers.TryGetValue(ev, out var list)) handlers[ev] = list = new List<Action<JToken>>();
            list.Add(fn);
        }

        public void Emit(string ev, object data = null, Action<JToken> ack = null)
        {
            var arr = new JArray(ev);
            if (data != null) arr.Add(data is JToken t ? t : JToken.FromObject(data));
            string id = "";
            if (ack != null) { int n = ++ackId; acks[n] = ack; id = n.ToString(); }
            outbox.Enqueue("42" + id + arr.ToString(Newtonsoft.Json.Formatting.None));
        }

        async Task Loop()
        {
            int backoff = 500;
            while (wantOpen)
            {
                cts = new CancellationTokenSource();
                ws = new ClientWebSocket();
                try
                {
                    var wsUrl = Url.Replace("http://", "ws://").Replace("https://", "wss://") + "/socket.io/?EIO=4&transport=websocket";
                    await ws.ConnectAsync(new Uri(wsUrl), cts.Token);
                    backoff = 500;
                    var send = SendLoop(cts.Token);
                    await Receive(cts.Token);
                    try { await send; } catch { } // gönderim döngüsü de kapansın; hatası yutulmasın diye beklenir
                }
                catch (Exception) { /* yeniden bağlanılır */ }
                finally
                {
                    cts.Cancel();
                    if (Connected) { Connected = false; main.Enqueue(() => { acks.Clear(); OnDisconnect?.Invoke(); }); } // cevabı gelmeyecek istekler unutulur
                    try { ws.Dispose(); } catch { }
                }
                if (!wantOpen) break;
                await Task.Delay(backoff); backoff = Math.Min(5000, backoff * 2);
            }
        }

        async Task SendLoop(CancellationToken ct)
        {
            while (!ct.IsCancellationRequested)
            {
                while (Connected && outbox.TryDequeue(out var msg)) await Raw(msg, ct);
                await Task.Delay(8, ct).ContinueWith(_ => { });
            }
        }

        async Task Raw(string msg, CancellationToken ct)
        {
            await sendLock.WaitAsync(ct);
            try { if (ws.State == WebSocketState.Open) await ws.SendAsync(new ArraySegment<byte>(Encoding.UTF8.GetBytes(msg)), WebSocketMessageType.Text, true, ct); }
            finally { sendLock.Release(); }
        }

        async Task Receive(CancellationToken ct)
        {
            var buf = new byte[64 * 1024];
            var all = new System.IO.MemoryStream(); // parçalar bayt olarak birleşir: Türkçe harf parça sınırında bölünmez
            while (ws.State == WebSocketState.Open && !ct.IsCancellationRequested)
            {
                all.SetLength(0);
                WebSocketReceiveResult r;
                do
                {
                    r = await ws.ReceiveAsync(new ArraySegment<byte>(buf), ct);
                    if (r.MessageType == WebSocketMessageType.Close) return;
                    all.Write(buf, 0, r.Count);
                } while (!r.EndOfMessage);
                await Handle(Encoding.UTF8.GetString(all.GetBuffer(), 0, (int)all.Length), ct);
            }
        }

        async Task Handle(string pkt, CancellationToken ct)
        {
            if (pkt.Length == 0) return;
            char type = pkt[0];
            if (type == '0') { await Raw("40", ct); return; }          // Engine.IO açıldı → Socket.IO bağlan
            if (type == '2') { await Raw("3", ct); return; }           // ping → pong
            if (type != '4' || pkt.Length < 2) return;
            char sio = pkt[1];
            if (sio == '0') { Connected = true; main.Enqueue(() => OnConnect?.Invoke()); return; }
            if (sio == '1') { cts.Cancel(); return; }
            int i = 2, num = 0; bool hasId = false;
            while (i < pkt.Length && char.IsDigit(pkt[i])) { num = num * 10 + (pkt[i] - '0'); i++; hasId = true; }
            var arr = JArray.Parse(pkt.Substring(i));
            if (sio == '2')
            {
                string ev = (string)arr[0];
                JToken data = arr.Count > 1 ? arr[1] : JValue.CreateNull();
                main.Enqueue(() => { if (handlers.TryGetValue(ev, out var list)) foreach (var h in list.ToArray()) Safe(() => h(data)); });
            }
            else if (sio == '3' && hasId)
            {
                JToken data = arr.Count > 0 ? arr[0] : JValue.CreateNull();
                main.Enqueue(() => { if (acks.Remove(num, out var a)) Safe(() => a(data)); });
            }
        }

        static void Safe(Action a) { try { a(); } catch (Exception e) { Debug.LogException(e); } }

        void Update() { while (main.TryDequeue(out var a)) a(); }

        void OnDestroy() { wantOpen = false; try { cts?.Cancel(); } catch { } }
    }
}
