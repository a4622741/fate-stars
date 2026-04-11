#!/usr/bin/env python3
"""Generate dark fantasy RPG background music tracks using Python + ffmpeg."""
import wave, struct, math, random, os, subprocess, sys

SAMPLE_RATE = 44100
OUTPUT_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'assets', 'bgm')
os.makedirs(OUTPUT_DIR, exist_ok=True)

def note_freq(name, octave):
    notes = {'C':0,'Db':1,'D':2,'Eb':3,'E':4,'F':5,'Gb':6,'G':7,'Ab':8,'A':9,'Bb':10,'B':11}
    return 440.0 * (2.0 ** ((int(octave) - 4) + (notes[name] - 9) / 12.0))

def sin_wave(freq, t, sr=SAMPLE_RATE):
    return math.sin(2 * math.pi * freq * t / sr)

def saw_wave(freq, t, sr=SAMPLE_RATE):
    phase = (freq * t / sr) % 1.0
    return 2.0 * phase - 1.0

def pad_sound(freq, t, sr=SAMPLE_RATE, detune=0.003):
    """Rich pad: 3 detuned sines + slow vibrato"""
    vib = math.sin(2 * math.pi * 4.5 * t / sr) * 2.0  # vibrato
    f = freq + vib
    return (sin_wave(f, t, sr) * 0.4 +
            sin_wave(f * (1 + detune), t, sr) * 0.3 +
            sin_wave(f * (1 - detune), t, sr) * 0.3)

def filtered_noise(t, sr=SAMPLE_RATE, cutoff=0.02):
    """Very soft filtered noise for atmosphere"""
    global _noise_state
    raw = random.random() * 2 - 1
    _noise_state = _noise_state * (1 - cutoff) + raw * cutoff
    return _noise_state

_noise_state = 0.0

def generate_track(filename, duration_sec, bpm, chord_prog, melody_notes, bass_notes,
                   mood='calm', pad_vol=0.12, melody_vol=0.08, bass_vol=0.1, noise_vol=0.03):
    """Generate a complete music track."""
    global _noise_state
    _noise_state = 0.0
    random.seed(42 + hash(filename))

    n_samples = int(SAMPLE_RATE * duration_sec)
    beat_len = 60.0 / bpm  # seconds per beat
    samples = []

    # Pre-calculate chord timing
    chord_times = []
    t_acc = 0
    for chord, beats in chord_prog:
        chord_times.append((t_acc, t_acc + beats * beat_len, chord))
        t_acc += beats * beat_len
    total_chord_dur = t_acc

    # Pre-calculate melody timing
    melody_times = []
    t_acc = 0
    for note, beats in melody_notes:
        melody_times.append((t_acc, t_acc + beats * beat_len, note))
        t_acc += beats * beat_len
    total_melody_dur = t_acc if t_acc > 0 else total_chord_dur

    # Pre-calculate bass timing
    bass_times = []
    t_acc = 0
    for note, beats in bass_notes:
        bass_times.append((t_acc, t_acc + beats * beat_len, note))
        t_acc += beats * beat_len
    total_bass_dur = t_acc if t_acc > 0 else total_chord_dur

    for i in range(n_samples):
        t_sec = i / SAMPLE_RATE

        # Fade in/out
        fade_in = min(1.0, t_sec / 3.0)
        fade_out = min(1.0, (duration_sec - t_sec) / 3.0)
        envelope = fade_in * fade_out

        sample = 0.0

        # === PAD (chords) ===
        chord_t = t_sec % total_chord_dur
        for start, end, chord in chord_times:
            if start <= chord_t < end:
                chord_env = min(1.0, (chord_t - start) / 1.5) * min(1.0, (end - chord_t) / 1.0)
                for note_name, octave in chord:
                    freq = note_freq(note_name, octave)
                    sample += pad_sound(freq, i) * pad_vol * chord_env
                break

        # === MELODY ===
        if melody_notes:
            mel_t = t_sec % total_melody_dur
            for start, end, note in melody_times:
                if start <= mel_t < end and note is not None:
                    freq = note_freq(note[0], note[1])
                    mel_env = min(1.0, (mel_t - start) / 0.08) * min(1.0, (end - mel_t) / 0.3)
                    # Flute-like: sine + slight overtone
                    sample += (sin_wave(freq, i) * 0.7 + sin_wave(freq * 2, i) * 0.2 +
                              sin_wave(freq * 3, i) * 0.1) * melody_vol * mel_env
                    break

        # === BASS ===
        if bass_notes:
            bass_t = t_sec % total_bass_dur
            for start, end, note in bass_times:
                if start <= bass_t < end and note is not None:
                    freq = note_freq(note[0], note[1])
                    bass_env = min(1.0, (bass_t - start) / 0.1) * min(1.0, (end - bass_t) / 0.5)
                    sample += sin_wave(freq, i) * bass_vol * bass_env
                    break

        # === ATMOSPHERE (filtered noise) ===
        sample += filtered_noise(i) * noise_vol

        # Soft saturation
        sample = math.tanh(sample * 1.5) * envelope
        samples.append(sample)

    # Normalize
    peak = max(abs(s) for s in samples) or 1.0
    samples = [s / peak * 0.85 for s in samples]

    # Write WAV
    wav_path = os.path.join(OUTPUT_DIR, filename.replace('.mp3', '.wav'))
    mp3_path = os.path.join(OUTPUT_DIR, filename)

    with wave.open(wav_path, 'w') as wf:
        wf.setnchannels(1)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        for s in samples:
            wf.writeframes(struct.pack('<h', int(s * 32767)))

    # Convert to MP3
    subprocess.run([
        'ffmpeg', '-y', '-i', wav_path, '-b:a', '128k', '-ar', '44100', mp3_path
    ], capture_output=True)
    os.remove(wav_path)

    size_kb = os.path.getsize(mp3_path) / 1024
    print(f"  ✓ {filename} ({duration_sec}s, {size_kb:.0f}KB)")

# ═══ TRACK DEFINITIONS ═══

print("Generating BGM tracks...")

# 1. EXPLORE — 溫柔���五聲旋律，像幻想水滸傳的探索曲
print("1/6 Explore...")
explore_chords = [
    ([('C','3'),('E','3'),('G','3')], 8),
    ([('A','2'),('C','3'),('E','3')], 8),
    ([('F','2'),('A','2'),('C','3')], 8),
    ([('G','2'),('B','2'),('D','3')], 8),
    ([('C','3'),('E','3'),('G','3')], 8),
    ([('F','2'),('A','2'),('C','3')], 4),
    ([('G','2'),('B','2'),('D','3')], 4),
    ([('A','2'),('C','3'),('E','3')], 8),
    ([('D','3'),('F','3'),('A','3')], 4),
    ([('G','2'),('B','2'),('D','3')], 4),
    ([('C','3'),('E','3'),('G','3')], 8),
]
explore_melody = [
    (('E','4'),2), (('G','4'),1), (('A','4'),1), (('C','5'),2), (None,2),
    (('D','5'),1), (('C','5'),1), (('A','4'),1), (('G','4'),1), (None,2),
    (('E','4'),1), (('G','4'),1), (('A','4'),2), (('G','4'),1), (('E','4'),1), (('D','4'),2), (None,2),
    (('A','4'),1), (('C','5'),1), (('D','5'),2), (('C','5'),1), (('A','4'),1), (('G','4'),2), (None,2),
    (('E','5'),2), (('D','5'),1), (('C','5'),1), (('A','4'),2), (None,2),
    (('G','4'),1), (('A','4'),1), (('C','5'),2), (('A','4'),1), (('G','4'),1),
    (('E','4'),2), (('D','4'),1), (('C','4'),3), (None,2),
    (('E','4'),1), (('G','4'),1.5), (('A','4'),0.5), (('G','4'),1), (('E','4'),1),
    (('D','4'),1), (('E','4'),1), (('G','4'),2), (None,2),
    (('A','4'),1), (('G','4'),1), (('E','4'),2), (('D','4'),1), (('C','4'),3), (None,4),
]
explore_bass = [
    (('C','2'),8), (('A','1'),8), (('F','1'),8), (('G','1'),8),
    (('C','2'),8), (('F','1'),4), (('G','1'),4), (('A','1'),8),
    (('D','2'),4), (('G','1'),4), (('C','2'),8),
]
generate_track('explore.mp3', 90, 76, explore_chords, explore_melody, explore_bass,
               pad_vol=0.14, melody_vol=0.09, bass_vol=0.08, noise_vol=0.02)

# 2. TOWN — 溫暖的城鎮曲，琶音和弦
print("2/6 Town...")
town_chords = [
    ([('F','3'),('A','3'),('C','4')], 8),
    ([('C','3'),('E','3'),('G','3')], 8),
    ([('G','2'),('B','2'),('D','3')], 4),
    ([('A','2'),('C','3'),('E','3')], 4),
    ([('F','3'),('A','3'),('C','4')], 8),
    ([('D','3'),('F','3'),('A','3')], 4),
    ([('G','2'),('B','2'),('D','3')], 4),
    ([('C','3'),('E','3'),('G','3')], 8),
]
town_melody = [
    (('C','5'),1), (('D','5'),1), (('E','5'),2), (('D','5'),1), (('C','5'),1), (('A','4'),2),
    (None,1), (('G','4'),1), (('A','4'),1), (('C','5'),1), (('D','5'),2), (None,2),
    (('E','5'),1), (('D','5'),1), (('C','5'),1), (('A','4'),1), (('G','4'),2), (None,2),
    (('A','4'),1), (('C','5'),1), (('D','5'),1.5), (('C','5'),0.5), (('A','4'),2), (None,2),
    (('F','4'),1), (('A','4'),1), (('C','5'),2), (('A','4'),1), (('G','4'),1),
    (('F','4'),1), (('E','4'),1), (('D','4'),1), (('C','4'),3), (None,4),
]
town_bass = [
    (('F','2'),8), (('C','2'),8), (('G','1'),4), (('A','1'),4),
    (('F','2'),8), (('D','2'),4), (('G','1'),4), (('C','2'),8),
]
generate_track('town.mp3', 80, 92, town_chords, town_melody, town_bass,
               pad_vol=0.15, melody_vol=0.10, bass_vol=0.09, noise_vol=0.015)

# 3. BATTLE — 激昂戰鬥曲，快節奏小調
print("3/6 Battle...")
battle_chords = [
    ([('A','2'),('C','3'),('E','3')], 4),
    ([('F','2'),('A','2'),('C','3')], 4),
    ([('D','2'),('F','2'),('A','2')], 4),
    ([('E','2'),('Ab','2'),('B','2')], 4),
    ([('A','2'),('C','3'),('E','3')], 4),
    ([('G','2'),('Bb','2'),('D','3')], 4),
    ([('F','2'),('A','2'),('C','3')], 4),
    ([('E','2'),('Ab','2'),('B','2')], 4),
]
battle_melody = [
    (('A','4'),0.5), (('C','5'),0.5), (('E','5'),1), (('D','5'),0.5), (('C','5'),0.5), (('A','4'),1),
    (('F','4'),0.5), (('A','4'),0.5), (('C','5'),1), (('B','4'),1), (('A','4'),1), (None,1),
    (('E','5'),0.5), (('D','5'),0.5), (('C','5'),0.5), (('B','4'),0.5), (('A','4'),1), (('G','4'),1),
    (('A','4'),1), (('B','4'),0.5), (('C','5'),0.5), (('D','5'),1), (('E','5'),1), (None,1),
    (('A','5'),1), (('G','5'),0.5), (('F','5'),0.5), (('E','5'),1), (('D','5'),1),
    (('C','5'),0.5), (('D','5'),0.5), (('E','5'),1), (('A','4'),2), (None,1),
    (('F','5'),1), (('E','5'),0.5), (('D','5'),0.5), (('C','5'),1), (('B','4'),1),
    (('A','4'),1), (('Ab','4'),0.5), (('A','4'),1.5), (None,2),
]
battle_bass = [
    (('A','1'),1), (None,1), (('A','1'),1), (('A','1'),1),
    (('F','1'),1), (None,1), (('F','1'),1), (('F','1'),1),
    (('D','1'),1), (None,1), (('D','1'),1), (('D','1'),1),
    (('E','1'),1), (None,1), (('E','1'),2),
    (('A','1'),1), (None,1), (('A','1'),1), (('A','1'),1),
    (('G','1'),1), (None,1), (('G','1'),1), (('G','1'),1),
    (('F','1'),1), (None,1), (('F','1'),1), (('F','1'),1),
    (('E','1'),2), (('E','1'),2),
]
generate_track('battle.mp3', 70, 152, battle_chords, battle_melody, battle_bass,
               pad_vol=0.18, melody_vol=0.12, bass_vol=0.15, noise_vol=0.04)

# 4. TENSION — 不安的氛圍，半音和不協和
print("4/6 Tension...")
tension_chords = [
    ([('E','2'),('Ab','2'),('B','2')], 8),
    ([('F','2'),('A','2'),('C','3')], 8),
    ([('Eb','2'),('Gb','2'),('Bb','2')], 8),
    ([('E','2'),('Ab','2'),('B','2')], 8),
    ([('D','2'),('F','2'),('Ab','2')], 8),
    ([('E','2'),('G','2'),('B','2')], 8),
]
tension_melody = [
    (('B','3'),3), (None,1), (('C','4'),2), (('B','3'),2),
    (('A','3'),2), (('Ab','3'),2), (None,4),
    (('Bb','3'),2), (('A','3'),1), (('Ab','3'),1), (('G','3'),2), (None,2),
    (('B','3'),2), (('C','4'),2), (('D','4'),2), (None,2),
    (('Ab','3'),3), (None,1), (('G','3'),2), (('F','3'),2),
    (('E','3'),3), (None,5),
]
tension_bass = [
    (('E','1'),8), (('F','1'),8), (('Eb','1'),8),
    (('E','1'),8), (('D','1'),8), (('E','1'),8),
]
generate_track('tension.mp3', 80, 60, tension_chords, tension_melody, tension_bass,
               pad_vol=0.10, melody_vol=0.06, bass_vol=0.12, noise_vol=0.05)

# 5. NIGHT — 寂靜夜曲，星空氛圍
print("5/6 Night...")
night_chords = [
    ([('A','2'),('C','3'),('E','3')], 8),
    ([('F','2'),('A','2'),('C','3')], 8),
    ([('D','2'),('F','2'),('A','2')], 8),
    ([('E','2'),('G','2'),('B','2')], 8),
    ([('A','2'),('C','3'),('E','3')], 8),
    ([('D','2'),('F','2'),('A','2')], 4),
    ([('E','2'),('Ab','2'),('B','2')], 4),
    ([('A','2'),('C','3'),('E','3')], 8),
]
night_melody = [
    (('E','4'),3), (None,1), (('A','4'),2), (('G','4'),2),
    (('F','4'),2), (('E','4'),2), (('C','4'),2), (None,2),
    (('D','4'),2), (('F','4'),2), (('A','4'),2), (None,2),
    (('G','4'),2), (('E','4'),2), (('D','4'),2), (None,2),
    (('E','4'),2), (('C','5'),3), (None,1), (('A','4'),2),
    (('F','4'),2), (('E','4'),2), (None,2),
    (('D','4'),1), (('E','4'),1), (('A','3'),4), (None,4),
]
night_bass = [
    (('A','1'),8), (('F','1'),8), (('D','1'),8), (('E','1'),8),
    (('A','1'),8), (('D','1'),4), (('E','1'),4), (('A','1'),8),
]
generate_track('night.mp3', 90, 56, night_chords, night_melody, night_bass,
               pad_vol=0.10, melody_vol=0.06, bass_vol=0.07, noise_vol=0.025)

# 6. SAD — 悲傷抒情，緩慢小調
print("6/6 Sad...")
sad_chords = [
    ([('A','2'),('C','3'),('E','3')], 8),
    ([('F','2'),('A','2'),('C','3')], 8),
    ([('D','2'),('F','2'),('A','2')], 8),
    ([('E','2'),('Ab','2'),('B','2')], 8),
    ([('A','2'),('C','3'),('E','3')], 8),
    ([('F','2'),('A','2'),('C','3')], 4),
    ([('E','2'),('G','2'),('B','2')], 4),
    ([('A','2'),('C','3'),('E','3')], 8),
]
sad_melody = [
    (('A','4'),3), (None,1), (('C','5'),2), (('B','4'),2),
    (('A','4'),2), (('G','4'),1), (('F','4'),1), (('E','4'),2), (None,2),
    (('F','4'),2), (('A','4'),2), (('G','4'),1), (('F','4'),1), (('E','4'),2), (None,2),
    (('D','4'),1), (('E','4'),1), (('F','4'),2), (('E','4'),2), (None,2),
    (('A','4'),2), (('C','5'),2), (('E','5'),3), (None,1),
    (('D','5'),1), (('C','5'),1), (('A','4'),2), (None,2),
    (('G','4'),1), (('F','4'),1), (('E','4'),2), (('A','3'),3), (None,5),
]
sad_bass = [
    (('A','1'),8), (('F','1'),8), (('D','1'),8), (('E','1'),8),
    (('A','1'),8), (('F','1'),4), (('E','1'),4), (('A','1'),8),
]
generate_track('sad.mp3', 85, 52, sad_chords, sad_melody, sad_bass,
               pad_vol=0.11, melody_vol=0.07, bass_vol=0.08, noise_vol=0.02)

print("\n✓ All 6 BGM tracks generated in assets/bgm/")
total = sum(os.path.getsize(os.path.join(OUTPUT_DIR, f)) for f in os.listdir(OUTPUT_DIR) if f.endswith('.mp3'))
print(f"  Total size: {total/1024:.0f}KB ({total/1024/1024:.1f}MB)")
