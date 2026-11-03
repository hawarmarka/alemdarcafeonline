// Parktaki çocuk oyun alanı: salıncak, kaydırak, kum havuzu (kendi çizimimiz, metal boru + ahşap oturak)
// ve orada oynayan çocuklar (Rocketbox çocuk karakterleri, MIT): ikisi kovalamaca, biri salıncakta, biri kaydırakta.
using System.Collections;
using UnityEngine;

namespace Alemdar.World
{
    public static class Playground
    {
        public static readonly Vector3 Center = new(-9.5f, 0, 38.2f);

        public static void Build(Transform root, Transform people)
        {
            var red = Props.M(new Color(.75f, .15f, .12f), .5f, .3f); var yellow = Props.M(new Color(.95f, .75f, .15f), .5f, .3f);
            var steel = Props.Steel; var wood = Props.WoodLight;
            // kum havuzu
            var sand = Props.M(new Color(.86f, .78f, .6f), .05f, 0, null);
            var sandC = Center + new Vector3(.2f, 0, -2.4f);
            Props.Box(root, new Vector3(3f, .06f, 2.2f), sand, sandC + new Vector3(0, .04f, 0));
            foreach (var (s, o) in new[] { (new Vector3(3.2f, .25f, .12f), new Vector3(0, .12f, 1.1f)), (new Vector3(3.2f, .25f, .12f), new Vector3(0, .12f, -1.1f)),
                                           (new Vector3(.12f, .25f, 2.2f), new Vector3(1.55f, .12f, 0)), (new Vector3(.12f, .25f, 2.2f), new Vector3(-1.55f, .12f, 0)) })
                Props.Box(root, s, wood, sandC + o, 0, true);
            // salıncak: A çerçeve, iki oturak (biri sallanır)
            var sw = Center + new Vector3(-1.4f, 0, .4f);
            foreach (float x in new[] { -1.6f, 1.6f })
                foreach (float z in new[] { -.7f, .7f })
                {
                    var leg = Props.Box(root, new Vector3(.07f, 2.6f, .07f), red, sw + new Vector3(x, 1.25f, z * .5f), 0, true);
                    leg.transform.localRotation = Quaternion.Euler(z > 0 ? -15 : 15, 0, 0);
                }
            Props.Box(root, new Vector3(3.4f, .08f, .08f), red, sw + new Vector3(0, 2.5f, 0));
            Swing = new Transform[2];
            for (int i = 0; i < 2; i++)
            {
                var pivot = new GameObject("salincak").transform; pivot.SetParent(people, false); // birleştirilen (durağan) kısmın dışında: sallanabilsin pivot.localPosition = sw + new Vector3(i == 0 ? -.7f : .7f, 2.46f, 0);
                foreach (float x in new[] { -.22f, .22f }) Props.Box(pivot, new Vector3(.015f, 1.95f, .015f), steel, new Vector3(x, -.98f, 0), 0, false, false);
                Props.Box(pivot, new Vector3(.5f, .04f, .22f), yellow, new Vector3(0, -1.96f, 0), 0, false);
                Swing[i] = pivot;
            }
            // kaydırak: merdiven, platform, eğimli kızak
            var sl = Center + new Vector3(2.2f, 0, -.5f);
            Props.Box(root, new Vector3(.9f, .06f, .9f), yellow, sl + new Vector3(0, 1.6f, 0), 0, true);
            foreach (float x in new[] { -.42f, .42f }) foreach (float z in new[] { -.42f, .42f }) Props.Box(root, new Vector3(.06f, 1.6f, .06f), red, sl + new Vector3(x, .8f, z), 0, true);
            for (int k = 0; k < 6; k++) Props.Box(root, new Vector3(.6f, .04f, .04f), steel, sl + new Vector3(0, .25f + k * .25f, -.6f), 0, false, false);
            foreach (float x in new[] { -.32f, .32f }) { var r = Props.Box(root, new Vector3(.04f, 1.8f, .04f), steel, sl + new Vector3(x, .85f, -.6f), 0, false, false); r.transform.localRotation = Quaternion.Euler(-12, 0, 0); }
            var chute = Props.Box(root, new Vector3(.7f, .05f, 3f), red, sl + new Vector3(0, .85f, 1.75f)); chute.transform.localRotation = Quaternion.Euler(30, 0, 0);
            foreach (float x in new[] { -.36f, .36f }) { var e = Props.Box(root, new Vector3(.04f, .15f, 3f), red, sl + new Vector3(x, .92f, 1.75f)); e.transform.localRotation = Quaternion.Euler(30, 0, 0); }
            SlideTop = sl + new Vector3(0, 1.63f, .2f); SlideBottom = sl + new Vector3(0, .1f, 3.1f); SlideLadder = sl + new Vector3(0, 0, -1.1f);
            // çocuklar
            var host = new GameObject("cocuklar").AddComponent<KidsPlay>(); host.transform.SetParent(people, false);
            host.Begin();
        }
        public static Transform[] Swing;
        public static Vector3 SlideTop, SlideBottom, SlideLadder;
    }

    // Çocukların oyunu: basit, kesintisiz döngüler (yol bulma gerekmez: oyun alanı açık ve engelsiz).
    public class KidsPlay : MonoBehaviour
    {
        static readonly string[] Names = { "Ali", "Ayşe", "Mehmet", "Zeynep" };
        Chars.Person[] kids;

        public void Begin()
        {
            kids = new Chars.Person[Names.Length];
            for (int i = 0; i < Names.Length; i++)
            {
                var holder = new GameObject("cocuk_" + Names[i]).transform; holder.SetParent(transform, false); holder.localPosition = Playground.Center;
                kids[i] = Chars.Person.Create(Names[i], holder, false, "cocuk");
            }
            StartCoroutine(Chase(kids[0], 0)); StartCoroutine(Chase(kids[1], Mathf.PI * .7f));
            StartCoroutine(OnSwing(kids[2])); StartCoroutine(OnSlide(kids[3]));
        }

        // kovalamaca: kum havuzunun çevresinde sekiz çizerek koşarlar, arada durup soluklanırlar
        IEnumerator Chase(Chars.Person k, float phase)
        {
            var t = k.transform.parent; var c = Playground.Center + new Vector3(.2f, 0, -2.4f);
            float a = phase;
            while (true)
            {
                float run = 6 + Random.value * 5, end = Time.time + run;
                while (Time.time < end)
                {
                    a += Time.deltaTime * .85f;
                    var p = c + new Vector3(Mathf.Sin(a) * 2.6f, 0, Mathf.Sin(a * 2) * 1.8f);
                    var d = p - t.localPosition; d.y = 0;
                    if (d.sqrMagnitude > 1e-5f) t.localRotation = Quaternion.Slerp(t.localRotation, Quaternion.LookRotation(d), Time.deltaTime * 10);
                    k.SetSpeed(d.magnitude / Mathf.Max(Time.deltaTime, 1e-4f) > .5f ? 3f : 0);
                    t.localPosition = p; yield return null;
                }
                k.SetSpeed(0); yield return new WaitForSeconds(1.5f + Random.value * 2);
            }
        }

        // salıncak: oturur, salıncak ileri geri sallanır (sarkaç)
        IEnumerator OnSwing(Chars.Person k)
        {
            var pivot = Playground.Swing[0]; var t = k.transform.parent;
            t.SetParent(pivot, false); t.localPosition = new Vector3(0, -2.42f, -.12f); t.localRotation = Quaternion.identity;
            k.SetSit(true);
            while (true)
            {
                pivot.localRotation = Quaternion.Euler(Mathf.Sin(Time.time * 2.1f) * 28f, 0, 0);
                yield return null;
            }
        }

        // kaydırak: merdivene yürür, tırmanır, oturup kayar, kalkıp başa döner
        IEnumerator OnSlide(Chars.Person k)
        {
            var t = k.transform.parent;
            while (true)
            {
                yield return Walk(k, t, Playground.SlideLadder, 1.4f);
                k.SetSpeed(0); yield return Lerp(t, Playground.SlideLadder, Playground.SlideTop - new Vector3(0, 0, .2f), 1.6f); // tırmanma
                var slope = Playground.SlideBottom - Playground.SlideTop; slope.y = 0; t.localRotation = Quaternion.LookRotation(slope);
                k.SetSit(true); yield return new WaitForSeconds(.6f);
                yield return Lerp(t, Playground.SlideTop, Playground.SlideBottom, 1.3f);                                   // kayış
                k.SetSit(false); yield return new WaitForSeconds(1f);
                yield return Walk(k, t, Playground.SlideBottom + new Vector3(1.4f, 0, -1.2f), 1.6f);
            }
        }
        static IEnumerator Walk(Chars.Person k, Transform t, Vector3 to, float speed)
        {
            to.y = 0;
            while (true)
            {
                var d = to - t.localPosition; d.y = 0; if (d.magnitude < .08f) break;
                t.localRotation = Quaternion.Slerp(t.localRotation, Quaternion.LookRotation(d), Time.deltaTime * 8);
                var np = t.localPosition + d.normalized * Mathf.Min(d.magnitude, speed * Time.deltaTime); np.y = 0; t.localPosition = np;
                k.SetSpeed(speed); yield return null;
            }
            k.SetSpeed(0);
        }
        static IEnumerator Lerp(Transform t, Vector3 a, Vector3 b, float dur)
        {
            for (float s = 0; s < 1; s += Time.deltaTime / dur) { t.localPosition = Vector3.Lerp(a, b, s); yield return null; }
            t.localPosition = b;
        }
    }
}
