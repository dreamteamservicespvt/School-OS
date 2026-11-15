# Meera and Arjun: what they are made of

`meera.glb` and `arjun.glb` are our own characters for the School OS Assistant page
(`../avatar-live.html`). They were built on 15 November 2026 in Blender 5.3.0 with the MPFB 2.0.18
extension (from extensions.blender.org), using only assets that are free for commercial use.
Nothing from Ready Player Me, Avatar SDK or the TalkingHead sample avatars is inside them.

## Summary

- **Commercial use: yes.** Every visual asset is CC0 (public domain). The rig and face shapes
  are from the TalkingHead project (MIT licence, plus CC0 for the rig weights).
- **No attribution is legally required** for the CC0 parts. We still list the authors below
  as a courtesy, and the MIT notice for TalkingHead must stay with the page that uses it.
- MPFB itself is GPL-3.0 software. That covers the tool, not the characters made with it.
  MPFB FAQ "Can I sell models made with MPFB?": "Yes. All core assets (the base mesh, targets,
  skins…) are shared under CC0" (static.makehumancommunity.org/mpfb/faq/can_i_sell_models.html).

## Tools (not shipped)

| Tool | Version | Licence | Source |
|---|---|---|---|
| Blender | 5.3.0 | GPL-2.0+ (tool only) | blender.org (official MSI, SHA-256 checked against blender.org) |
| MPFB (MakeHuman plugin for Blender) | 2.0.18 | GPL-3.0+ (tool only) | extensions.blender.org/add-ons/mpfb (SHA-256 checked) |

## Inside the GLB files

| Part | Asset | Author | Licence | Source pack |
|---|---|---|---|---|
| Body mesh and body/face shaping | MakeHuman base mesh and modelling targets | MakeHuman team | CC0 | MPFB built-in data |
| Rig (Mixamo bone names) and weights | `talkinghead.mpfbskel`, `talkinghead.mhw` | Mika Suominen (TalkingHead) | MIT repo; weights file marked CC0 | github.com/met4citizen/TalkingHead `blender/MPFB` |
| 52 ARKit + 15 Oculus viseme face shapes | `talkinghead-targets.zip` | Mika Suominen (TalkingHead) | MIT | same |
| Meera skin | `cutoff3d_indian_female_skin` (colour-graded, scalp and lips repainted by us) | CutOff3D | CC0 | Skins 01 |
| Arjun skin | `toigo_light_skin_male_bronze` (colour-graded, scalp and lips repainted by us) | Margaret Toigo | CC0 | Skins 02 |
| Eyes | `high-poly` eyes, `brown` eye texture (darkened by us) | MakeHuman system | CC0 | MakeHuman system assets |
| Teeth, tongue | `teeth_base`, `tongue01` | MakeHuman system | CC0 | MakeHuman system assets |
| Eyebrows | `mindfront_eyebrows_09` (Meera), `mindfront_eyebrows_06` (Arjun) | Mindfront | CC0 | Eyebrows 01 |
| Eyelashes | `mindfront_eyelashes_04` (Meera), `mindfront_eyelashes_01` (Arjun) | Mindfront | CC0 | Eyelashes 01 |
| Meera hair (bun) | `rehmanpolanski_hair_bun_brown` (recoloured black-brown by us) | Rehman Polanski | CC0 | Hair 01 |
| Arjun hair | `culturalibre_hair_02` (darkened by us) | culturalibre | CC0 | Hair 01 |
| Meera kurta-style top | `wdg_mycenaean_tunic` (recoloured teal with a gold border by us) | WDG | CC0 | Dress 01 |
| Meera trousers | `toigo_harem_pants` (recoloured cream, top part removed by us) | Margaret Toigo | CC0 | Pants 01 |
| Meera shoes | `shoes06` | MakeHuman system | CC0 | MakeHuman system assets |
| Arjun shirt and trousers | `male_casualsuit01` with the `toigo_male_casual_suit_01_white_shirt` material (shirt tinted light blue by us) | MakeHuman system / Margaret Toigo | CC0 | MakeHuman system assets, System clothes materials 01 |
| Arjun shoes | `shoes01` | MakeHuman system | CC0 | MakeHuman system assets |

All asset packs were downloaded from files.makehumancommunity.org (links on
static.makehumancommunity.org/assets/assetpacks.html). The licence column is taken from each
pack's own manifest (`packs/<pack>.json`, field `license`), which marks every asset above as CC0.

**One thing to know:** a few of the older asset files (the hair bun, Arjun's hair, the tunic
and the white-shirt material) still carry an old MakeHuman header comment that says "AGPL3".
That header is boilerplate from before these assets were re-released; the asset repository and
the pack manifests list them as CC0. If a lawyer wants zero doubt, these four parts can be swapped
for MakeHuman system assets (explicitly CC0 in the file itself) without changing the rig or faces.

## Our changes

Recolouring and grading of textures, scalp and lip repainting, face-shape settings, a body
subdivision level, garment trimming, and the export settings. The build scripts live outside the
repo (`C:/Users/chala/avatar-work/scripts/`, main file `build_avatar.py`, configs `meera.json`,
`arjun.json`). Our changes are released under the same terms as the rest of this repository.

## TalkingHead MIT notice

TalkingHead, Copyright (c) Mika Suominen. Permission is hereby granted, free of charge, to any
person obtaining a copy of this software and associated documentation files, to deal in the
Software without restriction, subject to including the copyright notice and this permission
notice in all copies or substantial portions of the Software. THE SOFTWARE IS PROVIDED "AS IS",
WITHOUT WARRANTY OF ANY KIND. (Full text: github.com/met4citizen/TalkingHead/blob/main/LICENSE)
