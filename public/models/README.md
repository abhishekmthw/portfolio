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
