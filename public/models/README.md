# 3D models

## brain.glb

Used by the hero/About particle constellation ([components/three/particle-field.tsx](../../components/three/particle-field.tsx)).
The mesh is **never rendered** — at runtime its surface is sampled into a point
cloud (`MeshSurfaceSampler`), so only the geometry's positions matter.

### Provenance & license

- **Obtained from:** [`Justin0Brien/Brain`](https://github.com/Justin0Brien/Brain) (`models/brain.glb`), which is **MIT-licensed**.
- **Original tooling:** the file's `generator` metadata is `Sketchfab-12.68.0`, i.e. it was exported from a Sketchfab model. The upstream repo's README does **not** name the original model author or its license.
- **Processing applied here:** decimated to ~30% of the original triangles and pruned/deduped with `@gltf-transform/cli` (2.67 MB → ~0.9 MB). Geometry only (positions + normals); no textures.

> ⚠️ **Provenance caveat:** because the upstream repo doesn't credit the original
> model's author/license, attribution is incomplete. The MIT repo permits reuse,
> but if you want a rigorously-licensed asset, swap this file for a
> **public-domain** brain from [NIH 3D](https://3d.nih.gov) (search "brain"), or a
> clearly **CC-BY** model from Sketchfab (add the required credit). Drop the
> replacement in as `brain.glb` — no code change needed; just keep it a `.glb`
> with a single brain mesh (or a few), Y-up.

To regenerate the optimized file from a source GLB:

```bash
npx @gltf-transform/cli simplify SRC.glb a.glb --ratio 0.3 --error 0.005
npx @gltf-transform/cli prune a.glb b.glb
npx @gltf-transform/cli dedup b.glb public/models/brain.glb
```

## dna.glb

Used by the Experience stage of the same particle constellation. Like the brain, the
mesh is **never rendered** — its surface is sampled into a point cloud, so only the
geometry matters.

### Provenance & license

- **Self-generated** — there is no third-party asset and **no attribution required**.
  It's a procedurally-built B-form DNA double helix written straight to a binary glTF
  (geometry only: positions + triangle indices, Y-up, centred on the origin).
- **Built to real B-DNA parameters:** 20 base pairs over **2 helical turns** (10 bp/turn,
  twist 36°/bp), **3.38 Å** rise per base pair, backbone radius ~10 Å, and the
  **major/minor groove asymmetry** (the two strands phased ~144°/216° apart, not a
  naïve symmetric 180°) — the visual signature of real DNA. Two swept backbone tubes
  plus one base-pair rung per bp.
- If the asset is missing or fails to load, the code falls back to the procedural
  `makeDNA()` helix in `particle-field.tsx`, so the site never breaks.

To replace it, drop in any `.glb` with a DNA double-helix mesh (geometry only, Y-up) as
`dna.glb` — no code change needed.

## vitruvian.glb (optional — Flux Lab only)

Used **only** by the throwaway structure-preview route at `/flux-lab`
([components/flux-lab/](../../components/flux-lab/)), not by the live site. Like the
others, the mesh is **never rendered** — its surface is sampled into a point cloud
(`MeshSurfaceSampler`), so only the geometry matters.

If the file is absent, the "Vitruvian Man" option falls back to a procedural figure (a
humanoid inscribed in a circle + square whose limbs sweep between da Vinci's two poses).
Drop a `.glb` here as `vitruvian.glb` and it renders from the real mesh automatically —
no code change.

### Provenance & license — ⚠️ attribution REQUIRED

- **"The Vitruvian Man"** by **Fri (@manhiac)** on Sketchfab:
  https://sketchfab.com/3d-models/the-vitruvian-man-6c0b99ce8463468fbd00f304dbe7e105
- **License: CC-BY 4.0** — attribution is **required**. Keep this credit, and surface it
  (author + source + license) anywhere this lab is publicly deployed.
- ~13 MB, ~327k triangles. It already **faces front** (drawing in the X/Y plane, thin in
  Z) via its baked node transform, so the samplers apply **no rotation** — rotating a flat
  relief just tips it edge-on. The geometry is auto-centred + scaled to match the other
  models. If you swap in a file that loads edge-on or upside-down, add the needed rotation
  in `makeBrainFromMesh`'s caller ([particle-field.tsx](../../components/three/particle-field.tsx))
  and `sampleGLB` ([flux-lab-scene.tsx](../../components/flux-lab/flux-lab-scene.tsx)).
- Optional: shrink it with `@gltf-transform/cli simplify/prune/dedup` (see brain.glb
  above) — only geometry positions are sampled, so heavy decimation is fine.
