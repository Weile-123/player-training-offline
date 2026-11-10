"""Lossless audio preparation. Requires soundfile + numpy; originals are read-only.

Run from repository root. If present, .tmp/audio-python is the local tool install.
"""
import json
import pathlib
import sys

root = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(root / '.tmp/audio-python'))
import numpy as np
import soundfile as sf

source = root / 'src/videos'
destination = source / 'optimized'
destination.mkdir(exist_ok=True)
report = []
for original in sorted(source.glob('*.wav')):
    info = sf.info(str(original))
    samples, rate = sf.read(str(original), dtype='int32', always_2d=True)
    target = destination / (original.stem + '.flac')
    sf.write(str(target), samples, rate, format='FLAC', subtype=info.subtype, compression_level=1.0)
    decoded, decoded_rate = sf.read(str(target), dtype='int32', always_2d=True)
    if rate != decoded_rate or not np.array_equal(samples, decoded):
        raise RuntimeError(f'Lossless verification failed: {original.name}')
    report.append(dict(file=original.name, originalBytes=original.stat().st_size,
                       losslessBytes=target.stat().st_size, sampleRate=rate,
                       channels=info.channels, subtype=info.subtype, frames=info.frames,
                       decodedSamplesIdentical=True))
(root / 'output').mkdir(exist_ok=True)
(root / 'output/audio-compression-report.json').write_text(json.dumps(report, indent=2), encoding='utf8')
print(json.dumps(report, indent=2))

# UI-specific derivative: remove only the quiet 170ms lead-in. Preserve originals
# and every remaining PCM sample (no resampling, gain, or lossy re-encoding).
click_samples, click_rate = sf.read(str(source / 'click.wav'), dtype='int32', always_2d=True)
responsive = click_samples[round(.17 * click_rate):]
for extension, container in [('wav', 'WAV'), ('flac', 'FLAC')]:
    target = destination / ('click-responsive.' + extension)
    sf.write(str(target), responsive, click_rate, format=container, subtype='PCM_24')
    decoded, rate = sf.read(str(target), dtype='int32', always_2d=True)
    assert rate == click_rate and np.array_equal(responsive, decoded)
