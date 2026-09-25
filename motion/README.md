# Considered.

A 15-second motion piece, 1920×1080 at 60 fps, with a synthesised score. It loops seamlessly.

One point becomes a ring, then a colour field, then an icon, then 91 pixels. The pixels drain back into
a single point, and that point becomes the full stop of a sentence. At the end it returns to where it
started. There are no cuts. Every state transforms into the next one.

## Craft notes

- **Motion.** Every move uses SwiftUI-style springs (`response`, `dampingFraction`) or tuned cubic-béziers.
  The ball-like hop of the full stop uses real ballistic arcs with squash on take-off and landing.
- **Motion blur.** Each frame averages 8 sub-frames over a 180° shutter, so it is true temporal blur,
  not a filter.
- **Colour.** Apple system colours are mixed in OKLab with chroma preservation, so the field never goes
  muddy between hues. The field's scale always tracks the visible content. Because of that, ring, icon,
  pixels and the final dot all read as one continuous surface.
- **Banding.** The 8-bit output is dithered with triangular-PDF noise. The H.264 file is tagged with
  BT.709 primaries/matrix and an sRGB transfer, so QuickTime and Safari display it as authored.
- **Type.** Inter Display SemiBold (opsz 32) at −2.2% tracking, with kerning measured per glyph. The
  letters rise from behind a baseline mask.
- **Sound.** Every cue is placed from the picture's timeline. Each of the 90 pixels plays its own
  D-major-pentatonic note, pitched by its distance from centre and panned by its column. The reverb is
  applied circularly, so the audio loop is seamless too.

## Build

```sh
pip install numpy scipy imageio-ffmpeg
node render.mjs --w 1920 --h 1080 --samples 8 --workers 3 --out video.mp4   # picture
python3 audio.py score.wav                                                  # sound
ffmpeg -i video.mp4 -i score.wav -c:v copy -c:a aac -b:a 256k considered.mp4
node render.mjs --stills 3.9,11 --w 1920 --h 1080 --outdir stills           # single frames
```

Fonts: [Inter](https://rsms.me/inter/) by Rasmus Andersson (SIL Open Font License), with static
instances cut from the variable font.
