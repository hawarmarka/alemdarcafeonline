// Arayüz: kıraathane teması (koyu ceviz panel, pirinç kenar, krem yazı, örtü yeşili düğme). Kodla kurulur (uGUI).
using System;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace Alemdar.UI
{
    // Düğme dokunuşu: üzerine gelince hafif büyür, basınca içe göçer (yumuşak geçiş).
    public class ButtonFx : MonoBehaviour, IPointerEnterHandler, IPointerExitHandler, IPointerDownHandler, IPointerUpHandler
    {
        float target = 1; bool over;
        Selectable sel;
        void Awake() => sel = GetComponent<Selectable>();
        public void OnPointerEnter(PointerEventData e) { over = true; target = Usable ? 1.04f : 1; }
        public void OnPointerExit(PointerEventData e) { over = false; target = 1; }
        public void OnPointerDown(PointerEventData e) { if (Usable) target = .96f; }
        public void OnPointerUp(PointerEventData e) => target = over && Usable ? 1.04f : 1;
        bool Usable => !sel || sel.interactable;
        void Update() { float s = Mathf.Lerp(transform.localScale.x, target, 1 - Mathf.Exp(-Time.unscaledDeltaTime * 18)); transform.localScale = new Vector3(s, s, 1); }
    }

    public static class Ui
    {
        public static readonly Color Panel = new(.075f, .065f, .058f, .9f), Line = new(.82f, .66f, .4f, .38f), Ink = new(.97f, .95f, .9f), Muted = new(.74f, .7f, .63f);
        public static readonly Color Green = new(.09f, .42f, .37f), Wood = new(.2f, .15f, .11f), Maroon = new(.5f, .12f, .12f), Brass = new(.83f, .66f, .35f);
        public static Canvas Canvas { get; private set; }
        static Sprite round, roundSmall;
        static Text toast; static float toastUntil;

        public static void Init()
        {
            var go = new GameObject("Arayuz", typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
            Canvas = go.GetComponent<Canvas>(); Canvas.renderMode = RenderMode.ScreenSpaceOverlay; Canvas.sortingOrder = 10;
            var sc = go.GetComponent<CanvasScaler>(); sc.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize; sc.referenceResolution = new Vector2(1920, 1080); sc.matchWidthOrHeight = .5f;
            if (!UnityEngine.Object.FindAnyObjectByType<EventSystem>()) new GameObject("EventSystem", typeof(EventSystem), typeof(StandaloneInputModule));
            round = RoundSprite(72, 22); roundSmall = RoundSprite(32, 8);
            toast = Label(Canvas.transform, "", 26, Ink, TextAnchor.MiddleCenter);
            var tr = toast.rectTransform; Anchor(tr, new Vector2(.5f, 1), new Vector2(.5f, 1), new Vector2(0, -110), new Vector2(900, 60));
            var bg = Box(toast.transform, Panel, round); bg.transform.SetAsFirstSibling(); Stretch(bg.rectTransform, -24, -8);
            toast.gameObject.SetActive(false);
        }
        public static void Toast(string msg, float sec = 3f) { toast.text = msg; toast.gameObject.SetActive(true); toastUntil = Time.unscaledTime + sec; }
        public static void Tick() { if (toast && toast.gameObject.activeSelf && Time.unscaledTime > toastUntil) toast.gameObject.SetActive(false); }

        // Yuvarlak köşeli 9 dilimli sprite (kenarı yumuşak).
        static Sprite RoundSprite(int size, int r)
        {
            var t = new Texture2D(size, size, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
            for (int y = 0; y < size; y++) for (int x = 0; x < size; x++)
            {
                float dx = Mathf.Max(0, Mathf.Max(r - x - .5f, x + .5f - (size - r))), dy = Mathf.Max(0, Mathf.Max(r - y - .5f, y + .5f - (size - r)));
                float d = Mathf.Sqrt(dx * dx + dy * dy); t.SetPixel(x, y, new Color(1, 1, 1, Mathf.Clamp01(r - d + .5f)));
            }
            t.Apply();
            return Sprite.Create(t, new Rect(0, 0, size, size), new Vector2(.5f, .5f), 100, 0, SpriteMeshType.FullRect, new Vector4(r, r, r, r));
        }

        public static RectTransform Rect(Transform parent, string name = "ui")
        {
            var g = new GameObject(name, typeof(RectTransform)); g.transform.SetParent(parent, false); return (RectTransform)g.transform;
        }
        public static void Anchor(RectTransform r, Vector2 min, Vector2 max, Vector2 pos, Vector2 size) { r.anchorMin = min; r.anchorMax = max; r.pivot = (min + max) / 2; r.anchoredPosition = pos; r.sizeDelta = size; }
        public static void Stretch(RectTransform r, float padX = 0, float padY = 0) { r.anchorMin = Vector2.zero; r.anchorMax = Vector2.one; r.offsetMin = new Vector2(padX, padY); r.offsetMax = new Vector2(-padX, -padY); }

        public static Image Box(Transform parent, Color c, Sprite s = null)
        {
            var r = Rect(parent, "kutu"); var img = r.gameObject.AddComponent<Image>(); img.sprite = s ?? round; img.type = Image.Type.Sliced; img.color = c; return img;
        }
        // Panel: koyu zemin + ince pirinç kenar.
        public static RectTransform Card(Transform parent, Vector2 size)
        {
            var edge = Box(parent, Line); edge.rectTransform.sizeDelta = size;
            var sh = edge.gameObject.AddComponent<Shadow>(); sh.effectColor = new Color(0, 0, 0, .35f); sh.effectDistance = new Vector2(0, -5);
            var bg = Box(edge.transform, Panel); Stretch(bg.rectTransform, 1.5f, 1.5f);
            return edge.rectTransform;
        }
        public static Text Label(Transform parent, string text, int size, Color c, TextAnchor align = TextAnchor.MiddleLeft, FontStyle style = FontStyle.Normal)
        {
            var r = Rect(parent, "yazi"); var t = r.gameObject.AddComponent<Text>();
            t.font = World.Props.UiFont; t.text = text; t.fontSize = size; t.color = c; t.alignment = align; t.fontStyle = style;
            t.horizontalOverflow = HorizontalWrapMode.Wrap; t.verticalOverflow = VerticalWrapMode.Overflow; t.raycastTarget = false;
            return t;
        }
        public enum Kind { Primary, Plain, Danger, Ghost }
        static Sprite bevel;
        // Kabartmalı düğme yüzeyi: üstten aşağı yumuşak ışık geçişi, üst kenarda ince parlaklık çizgisi, yuvarlak köşe.
        static Sprite BevelSprite()
        {
            if (bevel) return bevel;
            int w = 96, h = 96, r = 20; var t = new Texture2D(w, h, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Bilinear };
            for (int y = 0; y < h; y++) for (int x = 0; x < w; x++)
            {
                float dx = Mathf.Max(0, Mathf.Max(r - x - .5f, x + .5f - (w - r))), dy = Mathf.Max(0, Mathf.Max(r - y - .5f, y + .5f - (h - r)));
                float dist = Mathf.Sqrt(dx * dx + dy * dy), a = Mathf.Clamp01(r - dist + .5f);
                float k = y / (float)(h - 1), v = Mathf.Lerp(.86f, 1.06f, k * k * (3 - 2 * k));   // alttan üste yumuşak aydınlanma
                float edge = r - dist;                                                                 // kenara uzaklık (köşelerde)
                float inset = Mathf.Min(Mathf.Min(x, w - 1 - x), Mathf.Min(y, h - 1 - y));
                if (Mathf.Min(inset, edge) < 1.6f) v *= y > h / 2 ? 1.18f : .78f;                    // üstte ince ışık, altta ince koyu çizgi
                t.SetPixel(x, y, new Color(Mathf.Min(1, v), Mathf.Min(1, v), Mathf.Min(1, v), a));
            }
            t.Apply();
            return bevel = Sprite.Create(t, new Rect(0, 0, w, h), new Vector2(.5f, .5f), 100, 0, SpriteMeshType.FullRect, new Vector4(r, r, r, r));
        }
        static Color KindColor(Kind k) => k switch { Kind.Primary => new Color(.12f, .54f, .42f), Kind.Danger => new Color(.7f, .2f, .16f), Kind.Ghost => new Color(.24f, .22f, .2f, .62f), _ => new Color(.36f, .26f, .18f) }; // çuha yeşili, tuğla, ceviz
        // İkon (Lib.icons): ad = dosya adı (ör. "cards", "power"); bulunamazsa null.
        static readonly System.Collections.Generic.Dictionary<string, Sprite> icons = new();
        public static Sprite Icon(string name)
        {
            if (string.IsNullOrEmpty(name)) return null;
            if (icons.TryGetValue(name, out var s)) return s;
            var lib = Lib.I ? Lib.I : UnityEngine.Object.FindAnyObjectByType<Lib>();
            var t = lib?.icons == null ? null : Array.Find(lib.icons, x => x && x.name == name);
            return icons[name] = t ? Sprite.Create(t, new Rect(0, 0, t.width, t.height), new Vector2(.5f, .5f), 100) : null;
        }
        public static Button Button(Transform parent, string text, Kind kind, Action onClick, Vector2? size, string icon)
        {
            var b = Button(parent, text, kind, onClick, size);
            var sp = Icon(icon); if (!sp) return b;
            // ikon + yazı ortada yan yana
            var label = b.GetComponentInChildren<Text>(); var r = (RectTransform)b.transform;
            var row = Rect(r, "icerik"); Stretch(row, 10, 0);
            var h = row.gameObject.AddComponent<HorizontalLayoutGroup>(); h.childAlignment = TextAnchor.MiddleCenter; h.spacing = 8; h.childControlWidth = h.childControlHeight = true; h.childForceExpandWidth = h.childForceExpandHeight = false;
            var img = Rect(row, "ikon").gameObject.AddComponent<Image>(); img.sprite = sp; img.color = Ink; img.raycastTarget = false; img.preserveAspect = true;
            float isz = Mathf.Clamp(r.sizeDelta.y * .42f, 16, 26); Size(img, isz, isz);
            label.transform.SetParent(row, false); label.horizontalOverflow = HorizontalWrapMode.Overflow;
            return b;
        }
        public static Button Button(Transform parent, string text, Kind kind, Action onClick, Vector2? size = null)
        {
            var img = Box(parent, KindColor(kind), BevelSprite()); var r = img.rectTransform; r.sizeDelta = size ?? new Vector2(220, 56);
            var b = img.gameObject.AddComponent<Button>();
            var cb = b.colors; cb.normalColor = Color.white; cb.highlightedColor = new Color(1.15f, 1.15f, 1.12f); cb.pressedColor = new Color(.82f, .82f, .82f); cb.selectedColor = Color.white; cb.disabledColor = new Color(.5f, .5f, .5f, .55f); cb.fadeDuration = .07f; b.colors = cb;
            var sh = img.gameObject.AddComponent<Shadow>(); sh.effectColor = new Color(0, 0, 0, .38f); sh.effectDistance = new Vector2(0, -3);
            var l = Label(r, text, 20, Ink, TextAnchor.MiddleCenter, FontStyle.Normal); Stretch(l.rectTransform, 12, 4); // Fira Sans SemiBold: kalın görünür, sentetik kalınlık gerekmez
            var ls = l.gameObject.AddComponent<Shadow>(); ls.effectColor = new Color(0, 0, 0, .35f); ls.effectDistance = new Vector2(0, -1);
            b.onClick.AddListener(() => onClick?.Invoke());
            img.gameObject.AddComponent<ButtonFx>();
            var le = img.gameObject.AddComponent<LayoutElement>(); le.preferredWidth = r.sizeDelta.x; le.preferredHeight = r.sizeDelta.y;
            return b;
        }
        // Yan yana seçenekler: seçili olan vurgulu (dönen düğme yerine).
        public static void Segmented(Transform parent, string title, string[] options, Func<int> selected, Action<int> pick, float width)
        {
            var col = Rect(parent, "secim"); var v = col.gameObject.AddComponent<VerticalLayoutGroup>(); v.spacing = 6; v.childControlWidth = v.childControlHeight = true; v.childForceExpandHeight = false;
            Size(Label(col, title, 15, Muted, TextAnchor.MiddleLeft, FontStyle.Bold), -1, 20);
            var row = Row(col, 6, TextAnchor.MiddleLeft); Size(row, -1, 46);
            var btns = new Button[options.Length];
            void Paint() { for (int i = 0; i < btns.Length; i++) btns[i].GetComponent<Image>().color = KindColor(i == selected() ? Kind.Primary : Kind.Ghost); }
            for (int i = 0; i < options.Length; i++) { int k = i; btns[i] = Button(row, options[i], Kind.Ghost, () => { pick(k); Paint(); }, new Vector2((width - 6 * (options.Length - 1)) / options.Length, 44)); }
            Paint();
            Size(col, width, 72);
        }
        public static void SetText(Button b, string text) => b.GetComponentInChildren<Text>().text = text;

        public static RectTransform Row(Transform parent, float spacing = 12, TextAnchor align = TextAnchor.MiddleCenter)
        {
            var r = Rect(parent, "satir"); var h = r.gameObject.AddComponent<HorizontalLayoutGroup>(); h.spacing = spacing; h.childAlignment = align;
            h.childControlWidth = h.childControlHeight = true; h.childForceExpandWidth = h.childForceExpandHeight = false; return r;
        }
        public static RectTransform Column(Transform parent, float spacing = 10, RectOffset pad = null)
        {
            var r = Rect(parent, "sutun"); var v = r.gameObject.AddComponent<VerticalLayoutGroup>(); v.spacing = spacing; v.padding = pad ?? new RectOffset(24, 24, 20, 20);
            v.childControlWidth = v.childControlHeight = true; v.childForceExpandWidth = true; v.childForceExpandHeight = false; v.childAlignment = TextAnchor.UpperCenter; return r;
        }
        public static LayoutElement Size(Component c, float w = -1, float h = -1) { var le = c.TryGetComponent<LayoutElement>(out var e) ? e : c.gameObject.AddComponent<LayoutElement>(); if (w >= 0) le.preferredWidth = w; if (h >= 0) le.preferredHeight = h; return le; }
        // Tepsi: koyu ahşap çerçeveli, düğmelerin dizildiği bant.
        public static RectTransform Tray(Transform parent, Vector2 size)
        {
            var edge = Box(parent, new Color(.82f, .66f, .4f, .4f)); edge.rectTransform.sizeDelta = size;
            var inner = Box(edge.transform, new Color(.07f, .06f, .055f, .9f)); Stretch(inner.rectTransform, 1.5f, 1.5f);
            var sh = edge.gameObject.AddComponent<Shadow>(); sh.effectColor = new Color(0, 0, 0, .5f); sh.effectDistance = new Vector2(0, -4);
            return edge.rectTransform;
        }
        // Panel açılışı: hafif büyüyerek belirir (PrimeTween).
        public static void Pop(RectTransform r)
        {
            if (!r) return;
            var cg = r.GetComponent<CanvasGroup>() ?? r.gameObject.AddComponent<CanvasGroup>();
            PrimeTween.Tween.StopAll(r); PrimeTween.Tween.StopAll(cg);
            PrimeTween.Tween.Alpha(cg, 0, 1, .16f, PrimeTween.Ease.OutQuad, useUnscaledTime: true);
            PrimeTween.Tween.Scale(r, .94f, 1f, .22f, PrimeTween.Ease.OutBack, useUnscaledTime: true);
        }
        public static bool PointerOverUi => EventSystem.current && EventSystem.current.IsPointerOverGameObject();
        // bir yazı kutusuna yazılıyorsa kısayol tuşları çalışmasın
        public static bool TypingText => EventSystem.current && EventSystem.current.currentSelectedGameObject && EventSystem.current.currentSelectedGameObject.GetComponent<InputField>();
    }
}
