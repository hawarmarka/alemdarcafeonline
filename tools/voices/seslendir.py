# Diyalog metinlerini VoxCPM2 (Apache-2.0) ile seslendirir.
# Her kişi için önce tarifle bir referans ses tasarlanır (refs/), sonra bütün sözleri o sesle (ses kopyalama) üretilir:
# böylece bir kişinin sesi her sözünde aynı kalır. Çıktı: Unity Resources/Sesler/<id>.ogg ve diyalog.json.
# Çalıştırma: C:\tts\venv\Scripts\python.exe tools\voices\seslendir.py   (yarıda kalırsa kaldığı yerden devam eder)
import json, os, re, sys, glob
import numpy as np, soundfile as sf, librosa

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', 'unity', 'AlemdarKiraathanesi', 'Assets', 'Alemdar', 'Resources', 'Sesler')
REFS = os.path.join(HERE, 'refs')
RATE = 24000

# kişi → ses tarifi (VoxCPM2 tarif kipi İngilizce tarifi daha iyi anlıyor)
VOICES = {
    'Rıza Dayı': 'An old Turkish man in his late sixties, deep raspy smoker voice, confident and teasing',
    'Hüsnü Abi': 'A Turkish man in his fifties, warm friendly baritone voice, slightly whiny when losing',
    'Cemal Usta': 'A Turkish craftsman in his late fifties, gruff low voice, short tempered',
    'Kâzım Bey': 'A retired Turkish gentleman in his seventies, slow, soft and slightly shaky voice, polite',
    'Nuri Abi': 'A Turkish man in his forties, loud energetic voice, fast talker',
    'Sabri Dayı': 'An old Turkish man in his seventies, hoarse voice, grumbling',
    'Yaşar Bey': 'A Turkish man in his sixties, calm gentle voice, a bit forgetful',
    'Tahsin Usta': 'A Turkish man in his fifties, rough confident voice, cocky',
    'Ziya Amca': 'An elderly Turkish man around seventy five, wise warm voice, slow paced',
    'Şükrü Abi': 'A Turkish man in his forties, cheerful slightly high pitched male voice, excitable',
    'Halil Amca': 'A Turkish man in his sixties, deep calm voice, nostalgic storyteller',
    'Mümtaz Bey': 'A Turkish man in his sixties, clear educated voice, mild mannered',
    'Necati Abi': 'A Turkish man in his forties, friendly neighborly voice, relaxed',
    'Selim Bey': 'A Turkish man in his fifties, polite medium pitched voice',
    'Bayram': 'A Turkish man in his forties, angry loud voice, shouting in a street argument',
    'Erol': 'A Turkish man in his thirties, defensive irritated voice, arguing',
    'Fatma Teyze': 'A Turkish woman in her sixties, chatty gossiping voice, lively',
    'Hatice Teyze': 'A Turkish woman in her fifties, curious warm voice, gasps easily',
    'Ayşe Hanım': 'A Turkish mother in her thirties, clear strong voice, calling her children',
    'Kemal Bey': 'A Turkish father in his late thirties, warm relaxed voice',
    'Nermin Hanım': 'A Turkish woman in her thirties, kind caring mother voice',
    'Babaanne': 'An elderly Turkish grandmother in her late seventies, soft trembling loving voice',
    'Elif': 'A seven year old Turkish girl, cute high pitched child voice',
    'İhsan Amca': 'A very old Turkish man in his eighties, thin shaky voice, talking to himself',
    'Ali': 'An eight year old Turkish boy, excited high pitched child voice',
    'Kahveci Evdo': 'A Turkish tea house waiter in his forties, quick friendly voice, always polite',
    'Mehmet Efendi': 'A Turkish man in his sixties, polite quiet greeting voice',
    'Gülsüm Hanım': 'A Turkish woman in her sixties, polite friendly voice',
}
REF_TEXT = 'Merhaba, nasılsınız? Bugün hava çok güzel, bir çay içelim mi?'


def parse():
    scenes = {}
    for path in sorted(glob.glob(os.path.join(HERE, '*.txt'))):
        scene = None; who = {}; block = []
        def flush():
            if scene and block: scenes.setdefault(scene, []).append(list(block)); block.clear()
        single = os.path.basename(path) == 'tekli.txt'
        for raw in open(path, encoding='utf-8'):
            line = raw.strip()
            if line.startswith('#'): continue
            if line.startswith('@'):
                flush(); parts = line[1:].split(' ', 1); scene = parts[0]
                who = dict(p.split('=', 1) for p in re.findall(r'[A-ZÇĞİÖŞÜ]=[^=]+?(?= [A-ZÇĞİÖŞÜ]=|$)', parts[1]))
                continue
            if not line: flush(); continue
            m = re.match(r'^([A-Z])(!?): (.+)$', line)
            if not m: continue
            block.append({'who': who[m.group(1)].strip(), 'shout': m.group(2) == '!', 'text': m.group(3).strip()})
            if single: flush()
        flush()
    return scenes


def main():
    scenes = parse()
    total = sum(len(l) for d in scenes.values() for l in d)
    print(f'{len(scenes)} sahne, {sum(len(d) for d in scenes.values())} diyalog, {total} söz')
    os.makedirs(OUT, exist_ok=True); os.makedirs(REFS, exist_ok=True)
    from voxcpm import VoxCPM
    model = VoxCPM.from_pretrained('openbmb/VoxCPM2', load_denoiser=False)
    sr = model.tts_model.sample_rate

    def save(wav, path):
        wav = librosa.resample(np.asarray(wav, dtype=np.float32), orig_sr=sr, target_sr=RATE)
        wav, _ = librosa.effects.trim(wav, top_db=40)                     # baştaki ve sondaki sessizlik
        peak = float(np.max(np.abs(wav))) or 1.0; wav = wav / peak * 0.9  # ses seviyesi eşit
        sf.write(path, wav, RATE, format='OGG', subtype='VORBIS')
        return len(wav) / RATE

    # 1) her kişiye bir referans ses
    refs = {}
    for name, desc in VOICES.items():
        ref = os.path.join(REFS, f'{name}.wav'); refs[name] = ref
        if os.path.exists(ref): continue
        wav = model.generate(text=f'({desc}){REF_TEXT}', cfg_value=2.0, inference_timesteps=10)
        sf.write(ref, wav, sr); print('referans', name)

    # 2) bütün sözler
    manifest = {}; done = 0
    for scene, dialogs in scenes.items():
        out = []
        for di, dialog in enumerate(dialogs):
            lines = []
            for li, l in enumerate(dialog):
                sid = f'{scene}_{di:03d}_{li:02d}'
                path = os.path.join(OUT, sid + '.ogg')
                if not os.path.exists(path):
                    text = ('(shouting loudly, angry and excited)' if l['shout'] else '') + l['text']
                    try:
                        wav = model.generate(text=text, reference_wav_path=refs[l['who']], cfg_value=2.0, inference_timesteps=10)
                        save(wav, path)
                    except Exception as e:
                        print('HATA', sid, e, file=sys.stderr); continue
                lines.append({'id': sid, 'who': l['who'], 'shout': l['shout'], 'text': l['text']})
                done += 1
                if done % 25 == 0: print(f'{done}/{total}', flush=True)
            out.append(lines)
        manifest[scene] = out
    with open(os.path.join(OUT, 'diyalog.json'), 'w', encoding='utf-8') as f:
        json.dump(manifest, f, ensure_ascii=False, indent=0)
    print('bitti', done, 'söz')


if __name__ == '__main__':
    main()
