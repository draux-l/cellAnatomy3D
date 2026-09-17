---
name: threejs-cell-modeling
description: "Trigger: cell organelle geometry, cellAnatomy3D 3D model, organelle highlight or isolate, cell process animation. Pick the right procedural Three.js technique per structure and build it without improvising."
license: Apache-2.0
metadata:
  author: "llano"
  version: "1.0"
---

## Activation Contract

Use ONLY in the `cellAnatomy3D` project, when the task touches organelle geometry, cell scene assembly, organelle hover/click/isolate, or the nutrition / movement / reproduction process animations.

Do not activate for unrelated Three.js work or generic UI.

## Hard Rules

- Geometry is procedural Three.js code. No `.glb` assets, no Blender.
- Never use AI text/image-to-3D for organelles: one closed shell, no internal geometry to isolate or animate.
- Animate in code: GSAP for scripted, scrubbable, reversible phases; `useFrame` + uniforms for continuous motion. Never bake clips into a file.
- Tone mapping MUST be `THREE.NeutralToneMapping` (Khronos PBR Neutral). Never ACES — it shifts hue and breaks palette swatches.
- Stack: React + TypeScript + Vite + R3F + drei; Zustand is the only store. Add no other renderer, animation library, or store.
- Never drive per-frame values through React state. Transient values live in refs or a Zustand transient slice, read in `useFrame`.
- Comparison mode is a late milestone: one `<Canvas>`, two groups, one timeline. Keep it out of the base viewer.
- Ship static; respect the 25 MB single-file host cap.
- Accuracy beats spectacle: if an effect would teach something false, cut it.

## Decision Gates

Index of the full table in `references/organelle-geometry.md`.

| Structure | Technique | Why |
| --- | --- | --- |
| Cell membrane | `SphereGeometry` + seed-noise displacement | Fits the silhouette |
| Cytoplasm | Translucent shell + GPU `Points` | Flow is not a mesh |
| Nucleus, nucleolus, pores | `LatheGeometry`; `IcosahedronGeometry`; `TorusGeometry` instances | Isolatable layers |
| Mitochondrion + cristae | `LatheGeometry` shell + `ExtrudeGeometry` on `extrudePath` | Cristae need real surfaces |
| Chloroplast + grana | Capsule shell + stacked flattened `TorusGeometry` | Grana are stacked discs |
| ER | `TubeGeometry` along `CatmullRomCurve3` | Tubule network |
| Golgi apparatus | Stacked flattened `ExtrudeGeometry` arcs | Cisternae are arcs |
| Ribosomes | `InstancedMesh` + `IcosahedronGeometry` | Hundreds, one call |
| Lysosome | `IcosahedronGeometry`, slight displacement | Single vesicle |
| Vacuole | Large `LatheGeometry`, translucent | One big body |
| Cell wall | `LatheGeometry` / `ExtrudeGeometry`, `DoubleSide` | Rigid, outer layer |
| Cytoskeleton, cilia | `TubeGeometry` filaments; cilia `InstancedMesh` | Instancing mandatory |
| Cyclosis, flow, light | Shader + instances, GPU-side | Never mesh deformation |

- **`InstancedMesh` gate:** use it when a structure repeats more than ~20 times (ribosomes, vesicles, pores, grana discs). One draw call replaces hundreds.
- **Simplify gate:** when a structure renders under ~40 px or is never isolated, cut segments and subdivisions. Do not add LOD.
- **Cilia and pseudopods are out of scope** for the canonical cell. Add them only for a specialized cell type.

## Execution Steps

1. Define the real anatomy from a source (textbook, micrograph), not imagination; list what must stay legible when isolated.
2. Pick the technique from the Decision Gates. Do not silently invent another.
3. Build parametrically: expose `size`, `count`, and `seed` with defaults.
4. Render.
5. Capture a headless Playwright screenshot and inspect it.
6. Iterate until the anatomy from step 1 is legible.

A change that was not visually inspected is not verified. Never claim success from code alone.

## Output Contract

Every completed organelle reports: named parameters and defaults; the deterministic seed; polycount
and draw calls; the screenshot inspected and what it showed.

## References

- `references/organelle-geometry.md` — full technique table, placement rules, parameters, verified API signatures.
- `references/performance-and-rendering.md` — budget, materials, tone mapping, animation, screenshots, banned techniques.
