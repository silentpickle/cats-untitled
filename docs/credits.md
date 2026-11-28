# Asset credits

Everything here is CC0 (public domain) or our own generated audio; no attribution is required, but it is recorded so we know where
each file came from.

| File                            | Source                                                                    | Author     | Licence                                                    |
| ------------------------------- | ------------------------------------------------------------------------- | ---------- | ---------------------------------------------------------- |
| `public/assets/cat.glb`         | poly.pizza, model `qKICY6xla2` ("Cat", Cube World Kit)                    | Quaternius | CC0                                                        |
| `public/assets/furniture/*.glb` | kenney.nl, Furniture Kit 2.0                                              | Kenney     | CC0 (`public/assets/furniture/License.txt`)                |
| `public/assets/sounds/*.wav`    | sound-sommelier library, generated with MOSS-SoundEffect v2.0 (see below) | generated  | generated-moss (commercial use and redistribution allowed) |

The cat is recoloured to black at load time in `src/render/catTexture.ts`; the file itself is unmodified.

## Cat sounds

Generated locally with `sommelier generate` (backend moss, model
`mlx-community/MOSS-SoundEffect-v2.0-4bit@51d53e8b`, 100 steps, cfg 4.0, seed 0, 2026-11-28), then
trimmed to mono, faded and normalised to -6 dBFS peak.

| File               | Library clip (`sounds/curated/generated/moss/`)                | Edit                                                |
| ------------------ | -------------------------------------------------------------- | --------------------------------------------------- |
| `meow_brother.wav` | `a_house_cat_meowing_once_2s_seed0_3d018f06.wav`               | first 1.0 s, 150 ms fade-out                        |
| `meow_sister.wav`  | `a_kitten_mewing_short_and_high_pitched_2s_seed0_989087fb.wav` | first 0.4 s, 120 ms fade-out, low-passed at 2.5 kHz |
| `hiss.wav`         | `an_angry_cat_hissing_2s_seed0_e0d435f3.wav`                   | first 1.0 s, 250 ms fade-out                        |
| `purr_loop.wav`    | `a_cat_purring_contentedly_3s_seed0_3738f5d1.wav`              | 0–1.42 s (one breath), looped                       |
