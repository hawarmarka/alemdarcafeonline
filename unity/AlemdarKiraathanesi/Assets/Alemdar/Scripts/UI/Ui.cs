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
        public static readonly Color Panel = new(.09f, .075f, .06f, .93f), Line = new(.7f, .55f, .32f, .55f), Ink = new(.95f, .92f, .85f), Muted = new(.72f, .67f, .58f);
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
            round = RoundSprite(64, 18); roundSmall = RoundSprite(32, 8);
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
            int w = 64, h = 64, r = 12; var t = new Texture2D(w, h, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp };
            for (int y = 0; y < h; y++) for (int x = 0; x < w; x++)
            {
                float dx = Mathf.Max(0, Mathf.Max(r - x - .5f, x + .5f - (w - r))), dy = Mathf.Max(0, Mathf.Max(r - y - .5f, y + .5f - (h - r)));
                float a = Mathf.Clamp01(r - Mathf.Sqrt(dx * dx + dy * dy) + .5f);
                float v = Mathf.Lerp(.78f, 1.08f, y / (float)(h - 1));            // alttan üste aydınlanır
                if (y >= h - 3 && x > 6 && x < w - 7) v = 1.25f;                  // üst parlaklık
                if (y <= 2) v *= .8f;                                            // alt gölge kenarı
                t.SetPixel(x, y, new Color(Mathf.Min(1, v), Mathf.Min(1, v), Mathf.Min(1, v), a));
            }
            t.Apply();
            return bevel = Sprite.Create(t, new Rect(0, 0, w, h), new Vector2(.5f, .5f), 100, 0, SpriteMeshType.FullRect, new Vector4(r, r, r, r));
        }
        static Color KindColor(Kind k) => k switch { Kind.Primary => new Color(.11f, .5f, .43f), Kind.Danger => new Color(.6f, .15f, .14f), Kind.Ghost => new Color(.3f, .27f, .24f, .55f), _ => new Color(.29f, .22f, .16f) };
        public static Button Button(Transform parent, string text, Kind kind, Action onClick, Vector2? size = null)
        {
            var img = Box(parent, KindColor(kind), BevelSprite()); var r = img.rectTransform; r.sizeDelta = size ?? new Vector2(220, 56);
            var b = img.gameObject.AddComponent<Button>();
            var cb = b.colors; cb.normalColor = Color.white; cb.highlightedColor = new Color(1.15f, 1.15f, 1.12f); cb.pressedColor = new Color(.82f, .82f, .82f); cb.selectedColor = Color.white; cb.disabledColor = new Color(.5f, .5f, .5f, .55f); cb.fadeDuration = .07f; b.colors = cb;
            var sh = img.gameObject.AddComponent<Shadow>(); sh.effectColor = new Color(0, 0, 0, .45f); sh.effectDistance = new Vector2(0, -3);
            var ol = img.gameObject.AddComponent<Outline>(); ol.effectColor = kind == Kind.Primary ? new Color(.45f, .9f, .78f, .3f) : new Color(.85f, .68f, .4f, .32f); ol.effectDistance = new Vector2(1, -1);
            var l = Label(r, text, 21, Ink, TextAnchor.MiddleCenter, FontStyle.Bold); Stretch(l.rectTransform, 10, 4);
            var ls = l.gameObject.AddComponent<Shadow>(); ls.effectColor = new Color(0, 0, 0, .5f); ls.effectDistance = new Vector2(0, -1);
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
            var edge = Box(parent, new Color(.42f, .29f, .17f, .95f)); edge.rectTransform.sizeDelta = size;
            var inner = Box(edge.transform, new Color(.1f, .075f, .055f, .94f)); Stretch(inner.rectTransform, 3, 3);
            var sh = edge.gameObject.AddComponent<Shadow>(); sh.effectColor = new Color(0, 0, 0, .5f); sh.effectDistance = new Vector2(0, -4);
            return edge.rectTransform;
        }
        public static bool PointerOverUi => EventSystem.current && EventSystem.current.IsPointerOverGameObject();
    }
}
