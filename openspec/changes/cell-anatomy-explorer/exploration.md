# Exploration: 3D Cell Anatomy Explorer — Asset Sourcing, Blender MCP, Architecture, Deployment

**Change**: `cell-anatomy-explorer`
**Phase**: explore (investigation only — no proposal/spec/design/tasks written)
**Date**: 2026-09-16
**Revision**: **2** — see Revision History
**Repo state at time of exploration**: greenfield, single commit `ca96d88 "Proyecto Creado"`, no `package.json`, no test runner (`openspec/config.yaml` → `strict_tdd: false`).

## Revision History

### Revision 2 — 2026-09-16 (this version)

**Trigger**: the human answered Revision 1's blocking question, supplied two hard constraints, and asked a conceptual question about Three.js vs. Blender.

1. **RESOLVED — the project is NON-COMMERCIAL / EDUCATIONAL.** No monetization, no ads, no paid licensing, no institutional resale. Consequences:
   - **The sourced-asset column is BACK ON THE TABLE.** Revision 1 concluded that "the only commercially clean scientific route" was CC0 data, and that CC-BY-NC assets could not be shipped. **That conclusion is REVISED and must be read as superseded.** CC-BY-NC assets — including **3DMSL** (CC BY-NC 4.0) and **NIH 3D `3DPX-015797`** (CC-BY-NC-SA) — are usable for this project. See **Section C**.
   - **Vercel Hobby is now an acceptable host** on ToS grounds (its free tier is non-commercial-only). Revision 1's caution implicitly excluded it; that exclusion no longer applies. It is still not my recommendation, for the bandwidth reasons in **Section A**.
   - > **A reader who saw Revision 1 and concluded "CC BY-NC is off the table, only CC0 is clean" should re-read Section C.** That statement was correct for a commercial project and is **wrong** for this one. It is called out here explicitly because a revised conclusion that looks unchanged is a conclusion nobody trusts.
2. **NEW — two hard constraints recorded** (free hosting forever; simple to operate; must not stutter), plus the non-commercial constraint. See **Confirmed Constraints** below.
3. **NEW — Section A** answers the hosting constraint with a verified free-host comparison, and states the central reframe: **the host is not the performance bottleneck; asset weight is.**
4. **NEW — Section B** corrects the conceptual confusion: **Three.js is a renderer, not a modeling tool.** Rejecting the Blender MCP does **not** mean rejecting Blender — Blender is free and is the correct authoring tool.
5. **NEW — Section C** revises asset sourcing under non-commercial, including an explicit **CC-BY-NC-SA ShareAlike** risk assessment rather than a hand-wave.

**Everything from Revision 1 remains in force unless explicitly revised above.** Specifically unchanged: Q2 (Blender MCP verdict, §2.1–2.6), Q3 (architecture, stack, animation, state, performance budget, §3.1–3.5), the §4.1 "no backend" position, §4.3 (CORS / caching / versioning), and §4.4 (CI).

---

## Confirmed Constraints (Revision 2)

The human's stated requirements, recorded so they survive into `sdd-propose` and `sdd-design` without erosion:

| # | Constraint | Source | Consequence for design |
| --- | --- | --- | --- |
| **C1** | **Free hosting only — $0 indefinitely.** No paid tier will ever be used. Vercel / Netlify / Cloudflare / GitHub Pages are all acceptable candidates, but the cost must stay zero. | human, explicit | Rules out any metered backend, any paid object-store tier, and any per-request cost. Reinforces Revision 1's "no runtime backend". See Section A. |
| **C2** | **Simple to operate** — the human's words: *"que no haya tanto lío"*. | human, verbatim | Rules out multi-vendor setups, self-managed servers, bespoke CI infrastructure, and anything needing ongoing ops. One host, one deploy command. See Section A. |
| **C3** | **Must not lag or stutter** — the human's words: *"que se trave mucho"*. | human, verbatim | This is a **rendering** requirement, not a hosting one. Satisfied by the §3.5 performance budget (draw calls, `InstancedMesh`, compressed assets, lazy-loaded 3D bundle, DPR caps) — **not** by host choice. See the reframe in Section A. |
| **C4** | **Non-commercial / educational.** No monetization, no ads, no paid licensing, no institutional resale. | human, explicit | Unlocks the CC-BY-NC asset tier (Section C) and unlocks non-commercial free hosts. The license-compliance burden remains real and bounded — see the ShareAlike assessment in Section C. |

> **C3 is the constraint most likely to be misdiagnosed.** If the finished app stutters, the natural instinct is to blame the host. That instinct is wrong: a heavy `.glb` and per-frame React state will stutter identically on a $0 host and a paid one. Section A states this explicitly so it cannot be re-litigated later.

## Evidence Standard

Every claim below is tagged:

- **[V]** verified by reading the primary source (vendor doc, license page, official manual, repo `package.json`, or a data-repository license field). URL given.
- **[U]** unverified — could not confirm. Treated as a hypothesis, not a fact.
- **[R]** reasoning from verified facts. Says so explicitly.

Corrections to assumptions in the original brief are called out as **BRIEF CORRECTION**. There are several; they matter because the human is treating the brief's citations as evidence.

---

## Q1. Where and how can the `.glb` organelle models be produced or obtained?

### 1.1 The real question is not "where do I get a mitochondrion"

It is: **"can I get a watertight external shell, or do I get internal membrane architecture?"**

The three animated processes in the product concept are *all* about internal structure:

| Process | The teaching object | Geometry required |
| --- | --- | --- |
| Nutrition — cellular respiration | cristae (inner mitochondrial membrane folds) | internal folded surfaces, cuttable/isolatable |
| Nutrition — photosynthesis | thylakoid stacks (grana) inside the chloroplast | internal stacked discs + stroma |
| Movement — cyclosis | cytoplasm streaming | particle/flow field, not a mesh |
| Reproduction — cytokinesis contrast | contractile ring vs. cell plate | internal ring/plate structures + deformation |

A mitochondrion that is only an outer ellipsoid is pedagogically **empty**: it shows the shape and hides the whole lesson. This one constraint eliminates most of the low-effort sourcing options before cost even enters the discussion. **[R]**

### 1.2 Option-by-option

| Option | Cost | License reality | Anatomical fidelity | Human effort |
| --- | --- | --- | --- | --- |
| **A. Procedural geometry in code** (Three.js primitives, Lathe/Extrude/Tube, custom `BufferGeometry`) | $0 | Owned outright, no attribution | **Medium-high for teaching**: cristae ≈ twisted/lofted ribbons, grana ≈ stacked discs, ER ≈ spline-tube, Golgi ≈ stacked flattened arcs. Shapes are *legible and controlled*, not photographic. | High (it is real 3D programming), but every hour is version-controlled, diffable, CI-testable |
| **B. Hand-modelled in Blender** | $0 if the human models; ~$150–800 if commissioned **[U — no quote obtained]** | Owned outright | **Highest achievable** — an artist can build cristae, grana, and a sectionable membrane | 8–24 h per 4–6 hero organelles for a competent artist **[U — estimate, not measured]** |
| **C. Blender-assisted via MCP** | $0 + setup time | N/A (it is a tool, not an asset) | Same as B — **it does not create accuracy, it accelerates editing** | Setup 1–3 h before any asset exists. See Q2. |
| **D. Marketplace assets** (Sketchfab / TurboSquid / CGTrader / Fab) | $0–50 per model | **Minefield.** Free downloads are CC-BY / CC-BY-NC / CC-BY-ND / CC-BY-SA depending on the uploader; Sketchfab's own docs state CC-BY-NC means "Others cannot use your model commercially" and that CC-BY requires attribution + a link back. Purchased Store models are **single-seat** and "you cannot offer others the ability to download models you've purchased… even if you edited the source file significantly" — so you can ship the render but not redistribute the asset. **[V]** sketchfab.com/licenses, support.fab.com/s/article/Store-License-Usage-FAQ | Usually pretty renders of a *whole cell* or a stylized mitochondrion; internal detail is typically texture paint, not geometry | Low to acquire, **high to audit licenses** |
| **E. NIH 3D** (`3d.nih.gov`, successor to the NIH 3D Print Exchange) | $0 | **Per-entry, not per-site.** The Terms state: "While many entries in NIH 3D fall under public domain or Creative Commons licenses (e.g., CC-BY), others may have more restrictive terms." **[V]** 3d.nih.gov/terms. Concretely: entry `3DPX-015797` "Animal Cell" is licensed **CC-BY-NC-SA** **[V]** 3d.nih.gov/entries/3DPX-015797 | Mixed. Real usable GLB exports exist (the site converts input meshes to `glb`/`stl`/`wrl`/`x3d`). But the animal-cell entry is a stylized teaching model, **NC + ShareAlike**. | Low acquire, **mandatory per-entry license audit** |
| **F. EM-derived meshes** (EMDB / EMPIAR / PDB) | $0 | **CC0 1.0** — "wwPDB core archives are made available at no charge and with no limitation on usage under the CC0 1.0 Creative Commons licence." **[V]** PMC10767987 / academic.oup.com/nar/article/52/D1/D456 | Scientifically derived *outer* density surfaces. Resolution limits what you can extract — a tomogram gives you the outer boundary, not clean cristae geometry. | **Very high**: needs segmentation + marching-cubes + retopo. Research-grade toolchain. |
| **G. 3DMSL — 3D Mitochondria Shape Library** (>27k instances, doi:10.18710/JX6JXF) | $0 | **CC BY-NC 4.0 — verified directly on the dataset page.** **[V]** dataverse.no, persistentId `doi:10.18710/JX6JXF`, "License/Data Use Agreement: CC BY-NC 4.0". Nuance worth knowing: the *source* dataset it derives from (EMPIAR-10791) is noted as "Reused under CC0" — so the **derived shapes are NC but the upstream data is CC0**. You may not ship 3DMSL outputs commercially; you could legally derive your own meshes from the CC0 upstream. | High-fidelity real mitochondrial shapes (mesh / point cloud / implicit) | High (the zips are ~8 GB each, 12 files) |
| **H. AI image/text-to-3D** (Tripo, Meshy, Rodin/Hyper3D, Hunyuan3D 2.x, TRELLIS 2, TripoSR) | Free tiers exist; clean-commercial tiers ≈ **$12–20/mo** **[V]** (Tripo: Free = "Public Models · Non-Commercial Use", Pro $19.90 = "Private Models · Commercial Use"; Meshy free = CC BY 4.0 with attribution; TripoSR/TRELLIS are MIT; **Hunyuan3D-2.1 weights are under the `tencent-hunyuan-community` licence, which is not an OSI open-source licence** **[V]** huggingface.co/tencent/Hunyuan3D-2.1) | **Commercial licensing is worse than the free price suggests** — see below | **Unsuitable as a primary source.** Strong technical reasoning in 1.3. | Low per generation, **very high to make usable** |

> **REVISION 2 UPDATE — rows D, E and G above were assessed under a commercial assumption and are now more permissive.** Because the project is **non-commercial** (constraint C4), the CC-BY-NC and CC-BY-NC-SA rows become **usable**: **3DMSL** (row G) and **NIH 3D `3DPX-015797`** (row E) are now in scope, with the ShareAlike caveat analysed in **Section C**. Row D (marketplace) is a mixed case — individual uploads differ, and several Sketchfab free downloads are CC-BY-NC, so **some** marketplace assets are now usable while ND (No-Derivatives) and "display-only" uploads remain unusable regardless of commercial status. Row H (AI generation) is **not** revised: it is rejected on technical grounds (no internal geometry), not licensing, so non-commercial status changes nothing.

### 1.3 Why AI-generated organelles are unsuitable for this product — stated plainly

This is the strongest finding in Q1 and it should not be softened:

1. **Text/image-to-3D produces a single closed shell with baked PBR texture. There is no internal geometry.** The published capability comparisons describe exactly this: "Hunyuan3D 2.1… image-to-3D shape and texture generation", "Image-to-3D… reconstructs geometry from one reference picture", "UV-mapped textures can appear flat" (Meshy's own comparison), "complex structures may lose sharp edges and fine transitions" and "HD generation can produce softer shapes, blurred details, and less reliable geometry on complex assets" (Tripo's own comparison). **[V]** meshy.ai/blog, tripo3d.ai/compare, triposr.org/blog. None of these engines take an internal-structure specification. A crista is not part of the output space.
   For *this* product that is fatal: you cannot isolate, cut, or animate the inside of a shell that has no inside.
2. **No determinism and no scientific spec control.** Text-to-3D samples an internet prior. "Mitochondrion" priors are dominated by stylized textbook art and game assets. Two generations from the same prompt differ in topology. This product needs the *same* mitochondrion to appear in Animal view, in Comparison view, and inside the respiration animation — run-to-run variance is a correctness bug, not a style choice. **[R]**
3. **The free tiers carry the worst licenses.** Tripo's free output is non-commercial and public by design. So the cheapest AI path is also the least shippable one. **[V]**
4. **The legitimate AI use is a blockout accelerator, not a source of truth**: image-to-3D from a reference micrograph to get a rough silhouette in minutes, then retopologise and add internal structure by hand in Blender. That is a genuinely useful workflow — and it is *the same workflow* whether or not the first step happened. It does not change the plan.

**Verdict**: treat AI generation as **not on the critical path**. Budget zero for it. If the human wants to experiment, use it for a blockout only.

### 1.4 Recommendation — staged asset strategy

**Stage 1 (MVP) — procedural geometry in code, everywhere.**
Every organelle in the first shippable version is generated at runtime by parametric geometry functions. This is not a compromise, it is the de-risking move that the verified prior art already made (see Q3): the `cell-architecture-studio` reference implementation ships "staged GLB or procedural 3D cell assets" and explicitly "Procedural fallback geometry for specimens that do not yet have production GLB assets." **[V]** github.com/cclank/cell-architecture-studio.

Why it is the right MVP:
- $0 and zero license exposure. Revision 1 justified this partly as "the commercial / non-commercial question never blocks the first release" — that question is now **resolved** (non-commercial, constraint C4), but the argument survives in a stronger, simpler form: **Stage 1 has no license surface at all**, so there is nothing to audit, nothing to attribute, and nothing to re-audit if the project's status ever changes again.
- Every shape is parameterized → the light-intensity slider, the palette selector, and the animation speed control can all drive *geometry and material* directly instead of fighting a baked asset.
- It ships **zero bytes of asset download**, which is directly relevant to constraint C3 ("must not stutter"): the first render cannot be slowed by a network fetch that does not exist.
- It is CI-verifiable and diff-reviewable (works with the 800-line review budget in a way binary assets are not).
- It establishes the data model and the interaction contract (hover / click / isolate / spec sheet) **before** any asset pipeline exists. If a real GLB arrives later it must satisfy an interface that already works.

**Stage 2 (post-MVP, when the interaction is proven) — replace hero organelles with Blender-authored GLBs, one at a time.**
Target the 4 organelles that carry the teaching load: mitochondrion (cristae), chloroplast (grana), nucleus (chromatin + envelope pores), Golgi. Keep the procedural versions as the fallback path — same component interface, asset-first with procedural fallback, exactly the prior-art pattern. The human's own modelling is the cheapest route; commissioning is the fastest. **Blender is free and open source, so this stage costs $0 in tooling** — consistent with constraint C1. See **Section B** for how the authoring actually works.

**Stage 3 (optional, only if "scientifically-derived" becomes a product requirement) — derived outer shapes.**
**REVISION 2 — this stage is now materially wider than Revision 1 described.** Revision 1 said the only clean scientific route was CC0 data and that 3DMSL and `3DPX-015797` must not be shipped. Under non-commercial status that is **no longer true**:
- **CC0 route (unchanged, still cleanest):** derive meshes yourself from EMDB/EMPIAR/PDB. No attribution obligation, no ShareAlike, no status dependency.
- **CC-BY-NC route (NEW, now available):** **3DMSL** — >27k EM-derived mitochondria in mesh/point-cloud/implicit form, CC BY-NC 4.0. Requires attribution and a citation; forbids commercial use, which is fine here.
- **CC-BY-NC-SA route (NEW, now available with a caveat):** **NIH 3D `3DPX-015797`** — the share-alike clause carries real obligations. Read the assessment in **Section C** before adopting this asset.
- Note that none of these routes solves cristae — they give accurate *outer* envelopes. The internal teaching geometry still has to come from Blender or from procedural code.


**Cost of being wrong on this recommendation**: if the human's real intent is a photoreal asset showcase rather than a teaching tool, Stage 1 looks cheap-but-ugly and 6–10 weeks get spent on procedural geometry that gets thrown away. If that is the intent, say so now and go straight to Stage 2 with a commissioned artist. **This is the single most important thing to confirm before proposing.**

---

## Q2. Is a Blender MCP server feasible here, and what does it actually buy us?

### 2.1 Machine state — confirmed, no re-litigation

Blender is **not installed** and **no Blender MCP is configured** (only `obsidian`, `engram`, `context7` are connected). Honored as given.

### 2.2 The 2026 landscape — what I actually found

**Official — Blender Foundation MCP Server** **[V]** blender.org/lab/mcp-server, projects.blender.org/lab/blender_mcp
- Lives under **Blender Lab**, the Foundation's innovation space. Lab's own page describes its projects as "initially not part of the current Blender roadmap, and do not have a release timeline or target" — though the MCP Server row is marked **"Released"**. Wiki last edited 2026-05-01; releases tagged from `v1.0.0` (2026-04-27).
- Requires **Blender 5.1 or newer** plus an add-on, an LLM client, and the MCP server — the install is explicitly four manual steps: "three external tools must be manually downloaded, installed, and run."
- Architecture **[V]**: `MCP Client ⇐ MCP/stdio ⇒ blender-mcp ⇐ TCP socket ⇒ Blender Add-on`. "A Blender extension that allows the MCP server to communicate with a running Blender instance. **It must be installed and enabled for any of the MCP tools to work.**"
- **Carries an explicit security warning from the Blender Foundation itself**: "The MCP server will execute LLM generated code in Blender **without any guards in place** to protect your data from removal or being sent to a remote location. To keep your data safe it is recommended to use a virtual machine, or a system without access to sensitive information." **[V]**
- Blender version cadence is fast: 5.0 (2025-11-18), 5.1 (2026-03-17), 5.2 LTS (2026-07-14), current stable **5.2.1 LTS (2026-08-25)**. **[V]** blender.org/download/releases, blender.org/download/ **[R]** Three minor versions in ten months is a real add-on-API-breakage risk for any MCP add-on.

**Community — `ahujasid/blender-mcp`** **[V]** github.com/ahujasid/blender-mcp
- The original community project, **~22.7k stars, 2.2k forks, MIT**, created 2025-03-07, 159 commits. Published on PyPI as `blender-mcp`; add-on `bl_info` declares `"blender": (3, 0, 0)`.
- Install: `uvx blender-mcp`, then `uvx blender-mcp install-addon` and enable "Interface: MCP for Blender". Client config for OpenCode is documented:
  `{"mcp": {"blender-mcp": {"type": "local", "command": ["uvx","blender-mcp"], "environment": {"BLENDER_HOST":"localhost","BLENDER_PORT":"9876"}}}}`
- Documented Windows-specific failure modes that are worth taking literally: MCP clients launched from the Start menu do not inherit terminal `PATH`, so a bare `"command": "uvx"` fails with `spawn uvx ENOENT`; the README's own workaround is `{"command":"cmd","args":["/c","uvx","blender-mcp"]}`. It also warns "DO NOT run the uvx command in the terminal" and "Only run one instance of the MCP server… not both" — i.e. the failure surface is real and documented by the maintainers.

**HTTP variant — `zorak1103/blender-mcp`** **[V]** github.com/zorak1103/blender-mcp
- Small project (**2 stars**, **GPL-3.0**, created 2026-03-24). The brief's description is accurate: the add-on exposes a Streamable HTTP MCP endpoint at **`http://localhost:8400/mcp`**, and the endpoint **requires a Bearer token the add-on writes to `~/.config/blender-mcp/token`**. A `launcher.py` acts as a stdio-to-HTTP proxy for clients without HTTP transport.
- Notably: GPL-3.0 — a copyleft license on the *tool*, which is fine for a build tool but worth noting if any of its code were ever vendored.

**Others in the brief**: I did **not** independently verify `RFingAdam/mcp-blender` (218 tools), `glonorce/Blender_mcp` (69 tools), `mackson/blender-mcp` v2, or `PatrykIti/blender-ai-mcp` — mark those **[U]**. I found one adjacent data point: a `korwinteo/blender-mcp` listing describing a BlenderMCP variant with **Hunyuan3D backends**, whose "official api" mode requires **Tencent Cloud SecretId/SecretKey billed per job** and whose default "local api" mode expects *you* to run a Hunyuan3D inference server at `http://localhost:8081` and POSTs to `{API URL}/generate`. **[V]** mcprepository.com/korwinteo/blender-mcp. Two implications: (a) these forks are proliferating and are not interchangeable, (b) "AI generation inside Blender MCP" means an external billed or self-hosted GPU service, not a free capability.

### 2.3 The architectural constraint, confirmed

**Blender MCP is local-only and GUI-required. There is no cloud version.** `bpy` exists only inside Blender's own Python. Every implementation found proxies to a **running Blender GUI session** over a local socket (TCP 9876 / 9877 / 8400), with an add-on enabled inside Blender. This is confirmed by three independent primary sources: the official Lab readme's data-flow diagram, `ahujasid`'s "socket server within Blender to receive and execute commands", and `zorak1103`'s "Blender must be running with the add-on enabled." **[V]**

### 2.4 What it buys, and what it does not

**Does buy** (all of these are `bpy` operations, and all of them are the kind of work that has real value here):
- Batch export of many objects to `.glb` with consistent export settings.
- Deterministic material / Principled-BSDF setup matched to our Three.js `MeshPhysicalMaterial` targets (baseColor, metallic, roughness, clearcoat).
- Mesh decimation and LOD generation.
- UV unwrapping and texture bake orchestration.
- Render-based visual verification loops (render a turntable, look at it, adjust).
- Interactive, conversational iteration while authoring.

**Does NOT buy**:
- Scientific accuracy. It will not produce cristae from a prompt. An LLM driving `bpy` still has to be told *what geometry to build*, and that knowledge has to come from the human or from a reference model. This is the same limitation as Q1's AI generators, one layer down.
- Any form of team reproducibility. A conversational session is not a script; its output is a `.blend`/`.glb`, and the *process* is not ledgered.

### 2.5 Setup cost and platform risk (Windows)

What the human would install: Blender **5.1+** (current stable 5.2.1 LTS, 348 MB installer) **[V]**; `uv` / `uvx` (README warns "Do not proceed before installing uv. Use the official installer — not `pip install uv`") **[V]**; the add-on (`uvx blender-mcp install-addon`); an MCP client entry (`mcpServers`/`mcp` block with `uvx blender-mcp` or the bare `uvx.exe` full path, or the `cmd /c uvx` wrapper for the PATH problem).

Platform risks, all documented rather than speculative:
- **Windows Firewall** prompts / blocks on the local listening socket (9876/9877/8400).
- **`EPERM`** in sandboxed or permission-restricted environments.
- **GUI-mode requirement** — Blender must be open. This makes it unusable in CI and in any headless workflow.
- **PATH inheritance** — `spawn uvx ENOENT` from GUI-launched clients; needs an absolute path or the `cmd /c` wrapper. **[V]**
- **Add-on API breakage** across Blender 4.x → 5.0 → 5.1 → 5.2. The official server *requires* 5.1+, which means the human is on the fast-moving branch by definition. **[R]**
- **Security surface** — the Foundation's own VM recommendation, and `ahujasid`'s add-on ships a `TERMS_AND_CONDITIONS.md` and a `hashlib/hmac` import set, i.e. the ecosystem is aware the socket is a trust boundary. **[V]**

### 2.6 Verdict: is Blender MCP worth wiring up for THIS project?

**No — not at this stage. And when it does become useful, its value is optimization/export automation, which you should do with a script, not with MCP.**

The decisive argument is that **MCP adds no capability; it adds an interface.**

- Everything listed under "does buy" is `bpy` work, and `bpy` is fully driveable **headless and deterministically**: the official Blender 5.2 manual documents `--background` ("Run in background i.e. without a graphical interface") alongside `--python-expr` and `--factory-startup`. **[V]** docs.blender.org/manual/en/latest/advanced/command_line/arguments.html — I confirmed the presence of `--background`, `--python-expr`, and `--factory-startup` flags in the fetched official 5.2 manual page.
- That gives you `blender --background --factory-startup --python tools/build_assets.py`. Compare it to an MCP session:

| | `blender --background --python` | Blender MCP |
| --- | --- | --- |
| Reproducible | Yes — the script is the artifact | No — the process is a conversation |
| Runs in CI | Yes | **No** (GUI + add-on + socket required) |
| Diff-reviewable | Yes (text) | No |
| Needs a human present | No | Yes |
| Needs Blender installed locally | Yes | Yes |
| Extra install (Blender + add-on + uv + MCP config) | Blender only | Blender + add-on + `uv` + MCP config + firewall |
| Security warning | None | Foundation recommends a VM; executes unguarded LLM code |
| Can a non-coder use it | No | Yes |

- And the single most valuable "optimization" step — `.glb` compression — **does not need Blender at all**. `gltf-transform` (Node CLI) does Draco (70–90% geometry reduction), Meshopt (60–80%, *with* animation and morph-target support), KTX2/Basis (75–85% texture reduction), and `webp` (25–35%). **[V]** Khronos "3D on the Web 2026 — Best Practices for Compressing glTF Textures" (khronos.org), three.js-community best-practices rule sheets.

**When MCP *would* be worth it**: if the human is a non-programmer 3D artist who wants conversational control while modelling, or if the human wants an interactive feedback loop during authoring (render → look → adjust). That is a legitimate reason to set it up — **as a personal authoring tool during Stage 2, not as a project dependency.** It should never appear in `package.json`, in CI, or in the build path.

**Cost of being wrong**: if the human is a non-coder who will not write `bpy` scripts, then the script-based verdict is wrong for them and MCP is the *only* route to automated asset processing. In that case: install Blender 5.2.1 LTS + the **official** Blender Lab server (not a fork — forks are 2-star GPL projects with unverifiable maintenance), accept the GUI requirement, and keep it strictly out of CI.

**BRIEF CORRECTION**: the brief says "Blender 5.1+" is required by the official server. Confirmed. But note the brief also implies the human must install *Blender 5.1*; **5.2.1 LTS is the current stable and the better choice** (LTS = two years of fixes, no API churn) — provided the add-on's declared minimum of 5.1 is satisfied, which it is. **[V]** blender.org/download

---

## Q3. Architecture — and how it would actually look

### 3.1 Stack: React Three Fiber, not vanilla Three.js

**Recommendation: React 19 + TypeScript + Vite + three + `@react-three/fiber` v9 + `@react-three/drei` v10.**

Evidence — I verified the exact stack in the prior art rather than trusting the brief. `cclank/cell-architecture-studio` `package.json` **[V]** github.com/cclank/cell-architecture-studio/blob/main/package.json:

```
"dependencies": {
  "@react-three/drei": "^10.7.7", "@react-three/fiber": "^9.4.0",
  "lucide-react": "^0.552.0", "meshoptimizer": "^1.1.1",
  "react": "^19.2.0", "react-dom": "^19.2.0", "three": "^0.181.2"
},
"devDependencies": { "playwright-core": "^1.59.1", "pngjs": "^7.0.0", "vitest": "^4.1.7", "vite": "^7.2.2", ... },
"scripts": { "verify": "node scripts/verify.mjs", "test": "vitest run && node --test scripts/*.test.mjs" }
```

That is React 19.2 + three r181 + R3F v9 + drei v10, **with `meshoptimizer` already a runtime dependency** and **Playwright Core + `pngjs` for pixel-metric checks** — a working, MIT-licensed reference for this exact product shape.

**Honesty about that prior art — it is not what it appears to be.** **[V]** + **[R]**
- The brief cites `cloudnewbie/cell-architecture-studio` and `echoxiangzhou/cell-architecture-studio`. **I could not verify either exists.** Searching `cloudnewbie cell-architecture-studio` returns `cclank`'s repo; `echoxiangzhou`'s public repos are `entephoto` and `codegraph`, unrelated. **BRIEF CORRECTION: those two owner/repo pairs are unverified, and likely wrong.**
- What does exist is a **derivative cluster of near-identical repos**: `cclank` (1.7k ★, MIT, created 2026-05-10, 41 commits — the most-forked one), `yuryuri`, `rutforcode`, `codeslord`, `jigneshhn`, `limin112/cell`. `limin112` states outright: "2026-05-11 由 Helio AI 团队四小时做出的 demo" — *a demo made by the Helio AI team in four hours*. `yuryuri`'s README describes an "AI Tutor panel" that asks "the host **brain** (via the `llm.complete` bridge intent)", i.e. it is written to run **inside an AI agent runtime**, not as a standalone product.
- **Conclusion**: the *code* is real, MIT, and engineer-readable; the *1.7k stars on a four-hour AI-generated demo* is not product-market validation and should not be treated as evidence of demand. Use it as a **reference implementation of the pattern**, not as prior art that proves the concept.

**Why R3F over vanilla Three.js here** **[R]**:
- This app is a stateful UI over one canvas: hover/click selection, a spec panel, a quiz mode, a palette selector, a speed control, three view states. In vanilla Three.js you hand-manage a scene graph, your own selection state, and your own teardown/rebuild on every state change. R3F makes the scene a function of state, which is exactly the shape of this problem.
- **Drei removes weeks of work**: `OrbitControls`, `Html` (3D→DOM labels — this is the "hover = highlight + label" requirement), `Environment` (HDRI), `ContactShadows`, `useGLTF` (+ `.preload`), `Bounds`, `Center`, `Float`, `AdaptiveDpr`.
- **Not a lock-in**: R3F is a renderer over three.js. Anything that needs raw control drops to `useFrame` with direct `Object3D` mutation and stays inside R3F. That escape hatch matters for the per-frame animation work in 3.3.
- **Cost of being wrong**: R3F + drei add roughly 40–60 kB gz over raw three **[U — combined figure not measured by me]** and one more abstraction to learn. If the human is already fluent in imperative Three.js and not in React, vanilla Three.js is a legitimate choice and the rest of this analysis is unchanged — but the prior-art reference (which is R3F) would be less directly reusable.

**Stack note**: `three` r181/r184 is current in the prior art; R3F v9 pairs with React 19 (its migration guide documents React 19 alongside `three/webgpu`). **[V]** r3f.docs.pmnd.rs/tutorials/v9-migration-guide

### 3.2 The visual target: what actually produces the Hasselblad / Apple look

Cost-tiered, because the difference between "looks premium" and "runs at 20 fps on a school laptop" is entirely in which of these you enable:

**Cheap — do all of these** **[R]**, with `MeshPhysicalMaterial` documented as the cost base **[V]** threejs.org/docs/pages/MeshPhysicalMaterial.html:
- Flat dark background (`scene.background` = near-black) or a subtle radial gradient plane behind the model. The dark canvas is doing most of the "premium" work and costs nothing.
- **One HDRI** for image-based lighting — a 1–2k studio/avenue HDRI via `<Environment>`. This is *the* single highest-value visual upgrade: `MeshPhysicalMaterial`'s own docs say "For best results, always specify an environment map." Downsample to 1024 (or 256 on mobile) and convert to KTX2.
- **`ACESFilmicToneMapping`** + `toneMappingExposure ≈ 1.0` + `outputColorSpace = SRGBColorSpace`. See the decision point below — this is not a free choice.
- **`MeshPhysicalMaterial.clearcoat` ≈ 0.1–0.4** with low `clearcoatRoughness` on the membrane and organelle shells. This is literally how three.js describes the effect: "car paints, carbon fiber, and wet surfaces… a clear, reflective layer on top" — i.e. the product-shot sheen. Note the doc's caveat: "Most effects are disabled by default, and add cost as they are enabled."
- Two or three lights: a soft key, a cool rim/back light for silhouette separation on the dark background, and a low fill. Real HDRIs make lights optional; a rim light is still worth having.
- `<ContactShadows>` — one render target, cheap, and it is what anchors the object so it reads as *photographed* rather than *floating*.
- A restrained HTML/CSS overlay: technical spaced typography, hairline rules, small caps, tabular numerals for the spec sheet. Zero GPU cost.

**Expensive — enable deliberately, one at a time, and measure** **[R]**:
- **`transmission > 0`** (physically-based transparency for the membrane/cytoplasm). This forces a transmission render pass plus a back-face pass. The docs frame it as the correct model for "thin, transparent surfaces like glass" — which is exactly the temptation for a cell membrane — but it is the single biggest fill-rate cost available. Start with `opacity`/`transparent` and only upgrade if the look demands it.
- Postprocessing: SSAO, bloom, SSR, DOF. Each is a full-screen pass plus an extra dependency (`@react-three/postprocessing` + `postprocessing`, both present in the `3DCellForge` reference **[V]**). Bloom and a *small* vignette are the highest-value pair; SSAO on a dark scene often just dirties the image.
- Soft shadow maps at high resolution, per-organelle normal/roughness maps at 2k.
- `clearcoatNormalMap`, `iridescence`, `anisotropy` — real features, real per-pixel cost, tiny visual return at cell scale.

**Decision point — the tone mapper is a product decision, not a technical one.** **[V]** discourse.threejs.org/t/tone-mapping-overview/75204:
- ACES "changes your colors, not just the intensities" — it "boosts contrast and tends to darken your image" and shifts hues (yellows/cyans/pinks dominate). That is the cinematic look, and it is *incompatible* with a palette selector whose UI swatches must match what the 3D model renders.
- **Khronos PBR Neutral** is described as the right choice "if you are making a visualiser for a product where accurate color reproduction is important, or you are planning to embed your 3d into a 2d page" — **which is exactly this app**, given the per-layer color palette selector and the high-contrast accessibility mode.
- **Recommendation**: decide explicitly. Either (a) accept ACES hue shift and derive the palette swatch colors *from the rendered result*, or (b) use Khronos PBR Neutral and keep swatch colors authoritative. Do not do both by accident — this is a classic "the blue in the picker isn't the blue on the model" accessibility bug, and it would break the high-contrast mode, which is a stated requirement. **[R]**

**Prior art worth citing for the interaction model**: the Gurdon Institute's **The Cell Explorer** (Cambridge, SCoPE programme, free, A-level/GCSE) is a direct educational competitor that already does organelles-in-colour, label and colour manipulation, zoom, and **mitosis and meiosis animations**, plus scale/magnification teaching. **[V]** gurdon.cam.ac.uk/programmes/the-cell-explorer, scopegurdoninstitute.co.uk. Also **Allen Cell Explorer — Visual Guide to Human Cells**: real data-derived 3D cells, per-mitosis-phase models, structure/function panels, free, with published educator lesson materials. **[V]** allencell.org. Differentiation must therefore come from the *processes in motion* and the comparison/cytokinesis-contrast teaching moment — not from "an interactive 3D cell," which already exists twice, for free, from credible institutions.

### 3.3 Animating the three processes — approach comparison

| Approach | Runtime control | Bundle cost | Perf risk | Where it wins here |
| --- | --- | --- | --- | --- |
| **Pre-baked clips inside the `.glb`** (Blender-authored, played via `AnimationMixer`) | Low — fixed clips; play/seek/`timeScale` only | 0 extra deps (`AnimationMixer` is three core) | Mid — skinned/morph meshes cost GPU and compress worse | A single scripted hero cinematic. **Not** the parameter-driven processes. |
| **Runtime shader / GPU particles** | High, resolution-independent | ~0 (one `ShaderMaterial`) | Mid-High — transparent overdraw, fill rate | Cyclosis streaming, photosynthesis molecule flow, anything driven continuously by the light-intensity slider |
| **Keyframed transforms in code** (`useFrame` + lerp/damping) | High, fully inspectable | 0 | Low | Cilia/flagella beat, pseudopod extrusion, isotope/highlight transitions, isolate-on-click camera moves |
| **GSAP timeline** (`gsap.timeline({paused:true})`, `.seek()`, `.progress()`, `.timeScale()`, labels, nesting) | **Highest** | ~23–30 kB gz core **[U — figure not measured]** | Low (JS-side; no GPU cost) | The **mitosis sequence** and the **shared comparison clock** |
| **`@react-spring/three`** | Medium, declarative spring physics | Small | Low | Hover/selection micro-interactions only; poor fit for a 30-second scripted sequence |

**Recommendation — hybrid, split by the *nature* of the motion** **[R]**:
1. **Scripted, phase-based, must be scrubable and reversible → GSAP timeline.** Mitosis is a labelled sequence (`prophase`, `metaphase`, `anaphase`, `telophase`, `cytokinesis`). GSAP gives you all five product requirements for free: `.seek('anaphase')` (phase buttons), `.progress()` (the scrub bar), `.timeScale()` (**the animation speed control: pause / slow-motion / real-time**), `.reverse()`, and nested timelines (so the comparison timeline is a parent of two child timelines). This is a direct hit on requirements that would otherwise be bespoke.
   **License check, since this matters**: GSAP is now **free for everyone, commercial use included, including the former member-only plugins** — "Can I really use GSAP in commercial projects without paying anything? Yes, really!" **[V]** gsap.com/community/standard-license (effective 2025-04-30). The only prohibited use is building a visual animation-builder that competes with Webflow. This project is nowhere near that.
2. **Continuous / parameter-driven → `useFrame` with a delta accumulator and material uniforms.** Cilia beat, cyclosis particles, and the light-intensity slider all read one normalized clock `t`. No tween library needed, no React re-render per frame. `meshoptimizer` is already in the reference stack for anything that does get compressed. **[V]**
3. **Do not pre-bake the processes into the GLB.** A baked clip cannot respond to the light-intensity slider (a stated requirement), cannot be scrubbed to an arbitrary phase for comparison mode, and morph-target meshes compress worse and cost more. Reserve baked clips only if the human wants one cinematic opening shot.
4. **Pick one animation paradigm.** GSAP for scripted + raw `useFrame` for continuous is two mechanisms with clearly different jobs. Adding `@react-spring/three` as a third is bundle and cognitive cost for micro-interactions you can do with 5 lines of `useFrame`. Use GSAP (or nothing) — not both.

### 3.4 State management

State to model: `activeView: 'animal' | 'plant' | 'comparison'`, `selectedOrganelleId: string | null`, `colorPalette`, `animationSpeed`, `quizMode: { active, targetId, revealed }`, `activeProcess: 'nutrition' | 'movement' | 'reproduction' | null`, `lightIntensity`.

Plain `useState` + context is adequate for the single-cell views. **It breaks specifically and predictably in comparison mode**, for two reasons **[R]**:
1. **Two cells need one clock.** A GSAP timeline is mutable state outside React. Duplicating it per cell desynchronizes on the first pause; driving it through React context does not share it.
2. **The per-frame path must not touch React.** Selection, highlight, and process progress are read inside `useFrame`. If any of that lives in React state and updates per frame, you get 30–60 React re-renders per second across the whole tree — the classic R3F performance trap, and it will stutter visibly in comparison mode where the tree is largest.

**Recommendation: Zustand — but for the transient/reactive split, not for the size of the state.** **[R]** (Zustand is the pmndrs-recommended companion to R3F and is already referenced by the ecosystem.)
- **Reactive** (Zustand store, re-render on change): `activeView`, `selectedOrganelleId`, `colorPalette`, `animationSpeed`, `quizMode`, `activeProcess`, and the *discrete* phase label.
- **Transient** (plain mutable object / `useRef`, read by `useFrame`, never triggers a render): the animation clock, the GSAP timeline instance, interpolated positions, particle buffers.
- Zustand's `subscribe`/`getState` outside React is what makes this split ergonomic; that is the actual reason to pick it. A reducer gives you the same reactive half without the transient half.
- **Cost of being wrong**: if the human overrides this and keeps per-frame values in React state, the failure is not a crash — it is a slow, hard-to-attribute frame-rate cliff that appears only in comparison mode, after the architecture is set. This is worth getting right up front.

**Comparison mode — the complexity trap. Sequence it late, as its own milestone, not as a task inside the animation milestone.**

What it actually demands **[R]**:
1. A **shared timeline** across two cells (one GSAP parent timeline, two subscribers).
2. A **camera policy decision** — independent orbit per cell, or one locked camera? Independent is friendlier, but then "comparison" is no longer a controlled visual contrast.
3. **Two Cells of scene + doubled DOM overlay** for labels and spec panels.
4. **Roughly doubled draw calls** → the per-frame budget is halved.
5. A **responsive layout decision** (side-by-side on desktop; stacked or tabbed on mobile — and side-by-side on a phone is arguably worse than useless).
6. The requirement "split-screen is on-demand only, never default" is naturally satisfied by **mounting the second `<group>` lazily**, but that adds a mount/unmount lifecycle whose teardown must not leak timelines or GPU resources.

**Recommendation**: one `<Canvas>`, two `<group>` subtrees, one camera, one timeline. **Not two `<Canvas>` elements** — that means two WebGL contexts, doubled GPU memory, and no clean way to share a camera or a clock. **[R]** Build the single-cell processes to completion and prove the timeline/scaling model on one cell before comparison exists.

### 3.5 Performance strategy and an asset-size budget

**Compression — verified numbers** **[V]** (Khronos "3D on the Web 2026" texture presentation; three.js-community best-practices rules; `gltf-transform` docs):

| Technique | Reduction | Use when |
| --- | --- | --- |
| Draco (geometry) | 70–90% | Static meshes only |
| Meshopt (geometry) | 60–80% | **Animated / morph-target meshes** — Draco does neither |
| KTX2 / Basis (textures) | 75–85% | Many assets, or GPU memory pressure → **UASTC** for quality-critical, **ETC1S** for secondary |
| WebP (textures) | 25–35% | Single model / maximum compatibility |

Operational notes **[V]**:
- Decoders must be reachable: `dracoLoader.setDecoderPath(...)`. A pinned CDN or self-hosted copy — never a bare relative path.
- **KTX2 has a mandatory ordering requirement**: `setKTX2Loader` must be called before loading KTX2 textures, and `KTX2Loader.detectSupport(renderer)` must run first. The most common failure is the literal error `THREE.GLTFLoader: setKTX2Loader must be called before loading KTX2 textures` (multiple forum threads). In R3F the safe pattern is a single configured loader via drei's `useGLTF`/`extend` setup rather than ad-hoc loaders.

**Proposed budget — these are proposals to be ratified in design, not measurements** **[R]**:

| Dimension | Target | Rationale |
| --- | --- | --- |
| Single organelle GLB | ≤ 150 KB compressed, ≤ 25 k tris | Organelles render small on screen |
| Full cell scene GLB | ≤ 1.5 MB compressed, ≤ 150 k tris visible | 2 cells ≤ 3 MB total |
| Texture size | 512–1024 px, KTX2 | 2k is invisible at this scale |
| App shell JS | ≤ 350 KB gz, renders before 3D loads | The landing UI must be instant |
| 3D bundle (three + R3F + drei) | lazy-loaded, ≈ 180–220 KB gz **[U — not measured]** | Behind the first `<Canvas>` mount |
| First meaningful 3D paint (mid-tier laptop, 4G) | ≤ 3 s | |
| Steady state | 60 fps desktop, ≥ 30 fps mid-tier mobile | |
| Draw calls | ≤ 150 per cell, ≤ 300 in comparison | |
| Total initial payload before first render | ≤ 2.5 MB; organelles streamed on demand | |

**Techniques** **[R]**:
- **`InstancedMesh` for anything repeated.** Ribosomes, vesicles, and cilia will each number in the hundreds. As individual meshes they alone exceed the draw-call budget; as one `InstancedMesh` each they cost one call. This is the highest-leverage optimization in the whole app.
- **LOD**: skip it. With the tris budget above, LOD is complexity without payoff. Add only if a single model exceeds ~200k tris.
- **Lazy-loading**: `React.lazy` + dynamic `import()` around the entire 3D module, so the shell and the spec-sheet typography paint immediately. Abort in-flight GLB fetches on view switch.
- **Mobile fallback**: cap `devicePixelRatio` at 1.5–2, drop contact shadows, reduce the HDRI to 256, skip postprocessing, and expose a quality tier. Detect via `renderer.capabilities` + `hardwareConcurrency`.
- **WebGL-disabled fallback is a real requirement, not a nicety.** A school machine with software rendering off must still teach something. Ship a static per-organelle image + the full spec sheet. The Allen Cell Explorer and Gurdon tools are desktop-oriented and several Allen pages are explicitly "optimized for desktop use" **[V]** allencell.org/faqs — that is a gap worth filling, not a gap worth copying.

**Review budget note** (per the session's 800-line budget and `ask-on-risk` strategy): an R3F app with two cells, ~10 organelle components, three process animations, quiz mode, palette selector, a spec-sheet data model, asset pipeline, and Playwright visual checks **will not fit in 800 changed lines and will not fit in one PR.** **[R]** Forecast: **chained PRs, several slices.** `sdd-tasks` must produce the exact guard lines; flagging it now so the human can set expectations before the proposal phase.

---

## Q4. Deployment — where is it most optimal?

### 4.1 Can it be fully static? Yes — and it should be

Once assets are pre-generated, **no server is needed**. The app is a static bundle + static binaries + client-side WebGL. **[R]**

A backend is required **only** if the human adopts **runtime cloud AI generation** (generate an organelle from a user prompt in the browser). The reference `3DCellForge` does exactly this and I verified it: `huangserva/3DCellForge` `package.json` **[V]** github.com/huangserva/3DCellForge/blob/main/package.json contains `"@fal-ai/client": "^1.10.1"`, `"undici": "^8.2.0"` (the proxy client), a `"dev:api": "node server.mjs"` script, and `"test:visual": "playwright test"` — i.e. a Node backend proxying an AI provider to hide the API key, plus Playwright visual tests.
**BRIEF CORRECTION**: the brief attributes `3DCellForge` to `aabonahar`; the repo that resolves is **`huangserva/3DCellForge`** (vite ^8.0.10, react 19.2.5, three 0.184.0, R3F ^9.6.1, drei ^10.7.7 + `@react-three/postprocessing` + `framer-motion`).

**My position: do not add a backend.** It converts the product into a metered, rate-limited, key-managed service with a recurring cost per page view, and per Q1 the AI output is unsuitable for the teaching core anyway. If it ever becomes necessary, put it behind a Cloudflare Worker with strict rate limits — never ship a key to the client.

### 4.2 Asset distribution — the `.glb` + textures question

**They must not go through the app bundle.** Git-storing multi-MB binaries inflates every clone and every CI checkout, and the host's per-asset limits will bite. Verified constraints:

| Host | Per-asset limit | Bandwidth (free) | Commercial allowed on free? | Notes |
| --- | --- | --- | --- | --- |
| **Cloudflare Pages** | **25 MiB max per file**; 20,000 files free (100,000 paid, `PAGES_WRANGLER_MAJOR_VERSION=4`) | unlimited static requests/bandwidth **[V]** | yes | Docs explicitly say: "To serve larger files, consider uploading them to **R2 and utilizing the public bucket feature**." **[V]** developers.cloudflare.com/pages/platform/limits/ |
| **Cloudflare R2** | no per-file cap relevant here | **10 GB storage, 1M Class A + 10M Class B ops/mo free, zero egress fees** **[V]** | yes | public-bucket + custom domain supported |
| **Vercel (Hobby)** | CLI source upload ≤ 100 MB **[V]** | **up to 100 GB/mo** fast data transfer **[V]** | **No — Hobby is "restricted to non-commercial personal use only"** **[V]** | A single 8 MB model at ~12.5k views exhausts 100 GB. If the app is ever monetized, Hobby is a ToS violation → **Pro required**. |
| **Netlify** | no hard site limit per their support forum; large-file upload friction via CLI above ~40 MB **[V — forum, informal]** | 100 GB/mo free **[U — not confirmed for 2026]** | yes | |
| **bunny.net** | n/a (storage + CDN) | storage **$0.01/GB** single-region, free traffic to bunny CDN, $1/mo minimum **[V]** | yes | Excellent, but a second vendor |
| **GitHub Pages** | **published site ≤ 1 GB**, source repo recommended ≤ 1 GB | **soft** 100 GB/mo **[V]** | **No — "not intended for or allowed to be used… to run your online business"** **[V]** | 1 GB cap + binaries in git is a foot-gun |

**Recommendation: Cloudflare Pages (app) + Cloudflare R2 on a custom subdomain (assets), with R2's public bucket.** **[R]**
- The 25 MiB per-asset Pages limit makes R2 not merely an optimization but the documented escape hatch. This is a hard architectural reason, not a preference.
- R2's free tier (10 GB, free egress) makes the entire asset tier **free indefinitely** with no bandwidth anxiety — there is no realistic asset volume for this project that costs anything.
- Single vendor for app + assets → one dashboard, one set of credentials, `wrangler` for both, and no cross-vendor CORS debugging.
- Assumption behind the recommendation: **assets will be public and cacheable, not access-controlled.** If the human wants the models to be license-gated or paid, that changes the design (signed URLs / a Worker) and R2's public bucket is wrong. **[R]**
- Alternative if the human wants zero new accounts: Pages alone works, **but only if every asset stays under 25 MiB** — tight for a scanned or high-poly cell model, comfortable for procedural geometry and compressed GLBs under the Stage-1 plan.
- **BRIEF CORRECTION / caution**: if the project is commercial, **Vercel Hobby and GitHub Pages are both off the table** on ToS grounds regardless of technical merit.

> **REVISION 2 UPDATE — the recommendation is UNCHANGED, but its justification shifts, and one earlier exclusion is lifted.**
> - **The project is non-commercial (C4)**, so the ToS bars above no longer exclude Vercel Hobby or GitHub Pages. They are now *permitted*. They are still **not recommended**, for a different reason: their 100 GB/month transfer cap is the wrong shape for an asset-heavy 3D app, whereas Cloudflare's is unlimited. **The recommendation survived the change of premise; the reasoning behind it did not.** See **Section A**.
> - **The "assets will be public and cacheable, not access-controlled" assumption now holds unconditionally** — the human has ruled out paid or gated access, so R2's public bucket is unambiguously the right choice and the signed-URL/Worker alternative is moot.
> - **A new operational cost is now named**: the free Cloudflare plan's **500 builds/month and 1 concurrent build**. Revision 1 did not weigh this. See **A.6** for the mitigations — it is a *waiting* cost, not a money cost, so it respects C1.

### 4.3 CORS, caching, versioning

**[R]** unless marked:
- **Serve assets from a subdomain** (`assets.example.com`), not the app origin. Keeps the app origin's cookies/headers clean and lets you change asset hosting without touching the app.
- **CORS**: allow only the app origin. Three.js loaders do not require permissive CORS if assets are same-origin; from a subdomain they do. Do not use `*`.
- **Cache**: content-addressed filenames with `Cache-Control: public, max-age=31536000, immutable`. E.g. `assets.example.com/organelles/mitochondrion.4f2a1c.glb` — the hash *is* the version, so you never invalidate anything.
- **Version by path, not query string** — CDNs key and cache on path far more reliably.
- **The manifest is the mutable thing.** Which asset version, which palette values, which spec text, which label offsets. Store it as a hashed JSON imported by the bundle (so it is atomic with the code) or serve it with a short TTL (`max-age=300`). Do not cache the manifest immutably.
- **`index.html` must NOT be long-cached** — `no-cache` or a short TTL, or users get stale bundles.
- **Preconnect + preload**: `<link rel="preconnect" href="https://assets.example.com" crossorigin>` in `index.html`, and `<link rel="preload" as="fetch" crossorigin>` the first (hero) GLB.

### 4.4 CI

**[R]**, modeled on the verified prior-art pattern:

```
PR:   npm ci → tsc --noEmit → vitest run → vite build → vite preview → playwright test (pixel metrics)
main: (all of the above) → wrangler pages deploy dist --project-name cell-anatomy-explorer
      → assets: wrangler r2 object put / rclone sync  (only when assets/:changed)
```

**Visual/pixel-metric testing is the correct primary verification tool for this app, and the prior art proves the approach** **[V]**: `cclank/cell-architecture-studio` ships `scripts/verify.mjs` with Playwright Core, captures desktop/compact/mobile screenshots, and asserts **PNG pixel metrics "to catch blank renders or major layout regressions"** — with documented checks like "Plant Cell GLB render check", "Bacteria mesh interaction check", "Comparison modal check". Its `package.json` depends on `playwright-core` + `pngjs`. That is a directly reusable, MIT-licensed pattern, and it answers a question unit tests cannot: *did the cell actually render, or is it a black rectangle?*

Determinism requirements for those tests (otherwise they flake, and a flaky visual suite gets disabled, which is worse than not having one) **[R]**:
- Pin the browser build in CI.
- Fix `devicePixelRatio` and viewport.
- Freeze the animation clock (drive a fixed `t`; disable autoplay) — GSAP's `timeline.pause().progress(0.5)` is ideal for this.
- Disable/avoid bloom and any nondeterministic particle seeding, or seed them.
- Compare with a tolerance, not byte equality.

**Caveat on the 800-line review budget**: the CI/asset pipeline is real work and part of the same chained-PR forecast above. **[R]**

---

# Part II — Revision 2 Additions

---

## Section A — Free hosting analysis (answering constraint C1 + C2 + C3)

### A.1 The reframe, stated boldly

> **The host is NOT the performance bottleneck. Asset weight is.**
>
> **No free host will make your 3D slow, and no paid host will make a heavy `.glb` fast.** The host decides *when you run out of quota* — it does not decide *how smoothly the app runs*.

This matters because constraint C3 ("que se trave mucho") reads like a hosting requirement and is not one. If the finished app stutters, it will be caused by one of exactly three things, none of which is the host:

1. **Asset weight** — a 30 MB `.glb` has to be downloaded and parsed before it can be drawn. This is a network-and-parse cost, identical on every host.
2. **Per-frame CPU cost in the render loop** — per-frame React state (the cliff in §3.4), excessive draw calls, missing `InstancedMesh`. This is client-side and host-independent.
3. **GPU fill rate** — `transmission`, postprocessing chains, oversized shadow maps, uncapped `devicePixelRatio` (§3.2). Also client-side.

A free host with 300+ PoPs (Cloudflare) can only ever make the *download* portion faster; it cannot fix #2 or #3, and it cannot rescue a fat asset beyond making the fetch quicker. **Choose the host on quota shape and operational simplicity (C1, C2), and solve "stutter" in the performance budget (§3.5).** If the human takes one thing from Section A, it should be this decoupling. **[R]**

### A.2 Free-host comparison (April–August 2026)

| Dimension | Cloudflare Pages (Free) | Vercel (Hobby) | Netlify (Free) |
| --- | --- | --- | --- |
| **Monthly bandwidth** | **Unlimited** | 100 GB | 100 GB |
| **Overage behavior** | Builds queue, **no charge** | Site paused / charges | Paused at hard cap |
| **Builds** | 500 builds/month | 6,000 build min/month | 300 credits/month (credit system since Sept 2025) |
| **Per-file limit** | **25 MB per built output file** | — | — |
| **Files per deploy** | 20,000 | — | — |
| **Commercial use on free tier** | Allowed | **Not allowed** — *irrelevant here (C4: non-commercial)* | **Sources disagree — see A.5** |
| **Edge PoPs** | **300+** | ~40 | Multi-provider CDN |
| **Static asset TTFB (reported)** | ~10–45 ms | ~20–65 ms | ~20–80 ms |
| **Cost** | **$0** | $0 | $0 |

**Sources and reliability.** Secondary comparison sites: hostfleet.net (2026-04-21), toolfreebie.com (2026-04-18), dev.to deep comparison (2026-04-14), hostdir.net (2026-06-07), toolchase.com (2026-05-08), hosting-ranked.com (2026-03-28). These are **third-party comparison articles, not vendor documentation** — treat the bandwidth/credit/PoP/TTFB figures as **[U/secondary]**.

**Independent cross-check, and the result.** I independently verified most of the Cloudflare column against **primary Cloudflare documentation** in Revision 1 **[V]** developers.cloudflare.com/pages/platform/limits/: 25 MiB maximum single Pages asset, 20,000 files on Free (100,000 paid via `PAGES_WRANGLER_MAJOR_VERSION=4`), 500 builds/month, 1 concurrent build on Free, unlimited static requests and bandwidth. **These agree with the table above. I found no contradiction between my primary-source verification and the secondary comparison table.** The TTFB and PoP figures remain third-party and unverified. Cloudflare R2 was likewise verified directly: **10 GB storage + 1M Class A + 10M Class B ops/month free, zero egress fees** **[V]** developers.cloudflare.com/r2/pricing.

**One figure in the table that is under-specified and worth flagging**: Cloudflare's Free plan allows **1 concurrent build**. The table's "500 builds/month" is a volume quota; the concurrency of 1 is a *latency* quota and is the more likely day-to-day annoyance. See A.6.

### A.3 The quota arithmetic — so the human can stop worrying about it

The two hosts with a bandwidth cap give **100 GB/month**. What that actually buys depends entirely on payload weight, which is why the numbers belong next to the asset budget and not next to the host choice:

| Optimized payload per visit | Visits/month at 100 GB | Visits/day |
| --- | --- | --- |
| **~5 MB** (recommended budget: lazy-loaded 3D bundle + one hero organelle + KTX2 textures) | **≈ 20,000** | **≈ 660** |
| ~30 MB (an uncompressed / oversized asset set) | **≈ 3,300** | **≈ 110** |

Both figures are **ample for an educational project**, and both are conservative: they assume every visit is a cold cache that re-downloads the full payload. Real visits have warm caches (repeat visitors cost ~0 bandwidth) and the recommended design streams organelles on demand rather than downloading everything up front (§3.5), so actual consumption is lower still. **[R]**

**Conclusion for the human: the quota question is not the risk. The asset-weight question is.** A 5 MB payload gives ~20,000 visits/month on the *worst* of the three hosts; Cloudflare has no cap at all. Stop optimizing for quota and start enforcing the §3.5 asset budget.

### A.4 Recommendation: **Cloudflare Pages (Free), as a fully static Vite SPA**

**(a) Unlimited bandwidth is the correct shape for an asset-heavy 3D app.** The binding constraint on Vercel/Netlify is monthly transfer; a 3D product is definitionally a transfer-heavy product. On Cloudflare that constraint does not exist, so the design does not need to be contorted around it. **[R]**

**(b) The standard "Cloudflare DX is rougher" criticism does not apply here.** That criticism is about **Pages Functions, SSR, and Workers configuration** — the parts of the platform that require bindings, runtime config, and edge-environment debugging. A **purely static Vite SPA has none of that**: `npm run build` produces `dist/`, and the deploy is `wrangler pages deploy dist`. There is no server-side runtime, no binding, no function, no cold start. For constraint C2 (*"que no haya tanto lío"*), a static Vite SPA is the simplest deployable unit that exists — the DX objection is about a feature this project does not use. **[R]**

**(c) The 25 MB/file cap is a free forcing function, not a limitation.** It turns "this asset is too heavy for the web" into a **build-time failure instead of a runtime surprise** — which is exactly the discipline that keeps constraint C3 (no stutter) satisfied. The cap and the performance goal are aligned rather than in tension.

**(d) It never bills.** Overage behavior is "builds queue, no charge". There is no failure mode in which Cloudflare sends an invoice for a hobby 3D site — which is constraint C1's actual requirement, stated as a guarantee rather than a hope.

**Cloudflare R2 as the documented escape hatch.** For any asset that legitimately exceeds 25 MB, Cloudflare's own Pages documentation directs you to **R2 with a public bucket** **[V]**, and R2's free tier (10 GB + zero egress) covers any plausible volume for this project. It is the same vendor, so it does not violate C2 ("no lío") — but see A.6, because it *is* a second moving part.

**Cloudflare Workers is not needed.** The free tier is 100k requests/day, but a fully static SPA makes zero Worker requests. Adding edge logic would introduce a runtime dependency for no benefit, and would weaken the zero-cost guarantee in A.5. Do not add it. **[R]**

### A.5 The zero-cost guarantee, and exactly what would break it

> **As long as the app stays fully static and non-commercial, the cost is $0 indefinitely.**

The guarantee is **conditional**, and the conditions are worth naming precisely so the human knows what to avoid:

| Condition that breaks it | Why | Likelihood |
| --- | --- | --- |
| **Adding a runtime backend** (Pages Functions, Workers, or a Node proxy for AI generation per §4.1) | Introduces request-count quotas (Workers free = 100k requests/day) and a runtime to operate. Breaks C1 *and* C2. | Controllable — this is a design decision, already rejected in §4.1 |
| **Exceeding 500 builds/month** | Deploys stop; you wait for the month to roll over. Not a charge, but an outage of the deploy pipeline. | Controllable — see A.6 |
| **Commercializing** (ads, paid access, institutional resale) | Breaks C4, and with it both the host assumption *and* the entire CC-BY-NC asset strategy in Section C. | The human has explicitly ruled this out |
| Migrating to a paid object store or exceeding R2's 10 GB free tier | Would only happen at an asset volume far beyond this project | Very unlikely |
| Moving to Vercel Pro / Netlify paid for headroom | Only if the app stops being static or exceeds 100 GB | Very unlikely given A.3 |

Note that **three of the five breaking conditions are design decisions, not accidents.** That is the point: the $0 guarantee is a property of the architecture, and the architecture is under our control. **[R]**

### A.6 The one real operational risk of Cloudflare Pages Free: build quotas

This is the honest cost of choosing Cloudflare's free tier, and it is a **waiting** cost rather than a money cost — so it respects C1 while being a genuine annoyance under C2:

- **500 builds/month** is ≈ 16 builds/day average.
- **1 concurrent build** on Free means builds run strictly one at a time; a burst of deploys queues serially and the last one feels slow.
- **Preview deploys count as builds.** If CI fires a Pages deploy on every PR commit, a single active PR with 10 pushes consumes 10 builds before lunch.

**Mitigations, in order of value [R]:**
1. **Deploy Pages only on merge to `main`.** Build verification (typecheck, unit tests, Playwright) runs in GitHub Actions, which is a *separate* quota from Cloudflare's — so PR iteration costs zero Pages builds.
2. **Disable or ration preview deploys.** They are a convenience, not a requirement, for a solo educational project.
3. **Batch pushes.** Trivial, but it is the difference between 5 builds/day and 40.
4. If a burst is unavoidable, accept the queue. It costs minutes, not dollars.

**Cost of being wrong on the hosting recommendation**: if the human's PR workflow were fundamentally "deploy on every commit and share a preview URL", the 1-concurrent-build / 500-per-month structure would be felt immediately, and Netlify or Vercel would feel nicer — at the cost of a 100 GB cap and, on Vercel, a ToS bar that would have mattered under a commercial assumption. Given the mitigations above, this is a manageable trade, not a hidden trap. **[R]**

### A.7 Reported disagreement: does Netlify allow commercial use on free?

**Reported honestly rather than resolved by picking a side.** The sources disagree on whether Netlify permits commercial use on its free tier following the September 2025 credit-system change. Some of the comparison sources listed in A.2 state that it does; others state or imply that it does not.

**Why the disagreement is moot for this project, and why the disclosure still matters:** constraint **C4** makes the project non-commercial, so Netlify's commercial-use policy does not bind here either way. It matters only as a **warning about the reliability of the source set** — if the free-host comparison articles cannot agree on a binary policy question that both vendors publish explicit documentation for, the rest of their figures (TTFB, credit behaviour) deserve the same skepticism. They are **[U/secondary]** for that reason, and the primary-source cross-check in A.2 is the reason the Cloudflare column can be trusted while the rest is treated as indicative.

**One substantive Netlify observation that survives the disagreement [R]:** Netlify's free tier is now measured in **300 credits/month** — a *consumption* model rather than a flat-allowance model. A 3D asset app consumes credits through bandwidth, so its practical headroom is **less predictable** than "100 GB" implies, and exhaustion **pauses the site**. For an unfamiliar reader, "100 GB" reads as a limit you can reason about; "300 credits" is a limit you have to look up. That unpredictability is a C2 (simplicity) cost independent of whether Netlify allows commercial use.

---

## Section B — Asset authoring pipeline (answering the Three.js question)

### B.0 The question, and the short answer

> **Human's question**: *"can the `.glb` file be made with Three.js?"*

**Short answer: no — not by sculpting, and that is the wrong question to ask of Three.js.** Three.js can *generate geometry procedurally* and it can *render* an existing `.glb`, but it is not a modeling tool and has no sculpting or organic-modelling workflow. Making a good mitochondrion or chloroplast is **Blender's** job, and Blender is free and open source.

**The most important clarification: rejecting the Blender MCP does NOT mean rejecting Blender.** Revision 1 recommended against wiring up the MCP server (§2.6). That recommendation is about a *tooling integration*, not about the authoring application. **Blender is the correct authoring tool for organic organelles and it costs $0** — which also serves constraint C1. See B.2.

### B.1 The three-way distinction, stated plainly

These are three different concerns and Three.js only owns two of them:

| Concern | What it means | Correct tool | Three.js? |
| --- | --- | --- | --- |
| **Authoring** | Sculpting / modelling an organic `.glb` — a mitochondrion with cristae, a chloroplast with grana. Hand-driven topology, UVs, materials. | **Blender** (free, open source) | ❌ **No.** Three.js is not a DCC / modeling tool. No sculpting workflow, no retopology, no UV unwrapping UI, no organic-modelling pipeline. |
| **Generating** | Producing geometry *procedurally in code at runtime* — primitives, `LatheGeometry`, `ExtrudeGeometry`, `TubeGeometry`, noise-based deformation, custom `BufferGeometry`. | **Three.js** ✅ | ✅ **Yes.** This is a core strength and it is Stage 1 of the plan. |
| **Rendering** | Displaying an existing `.glb` in the browser — loading, lighting, materials, orbit, raycast picking, animation. | **Three.js** ✅ | ✅ **Yes.** This is literally what Three.js is. |

**Two accurate technical footnotes so this is not overstated [R]:**
- Three.js is a real-time **renderer**, not a DCC tool. It has no sculpting or organic-modelling workflow, and it is not intended to have one.
- Three.js **does** ship `GLTFExporter` (`three/examples/jsm/exporters/GLTFExporter.js`), so a procedurally built scene *can* be serialized to glTF. Stated honestly: **this is a generation-to-file path, not an authoring path.** It is useful if you want to build a shape procedurally in TypeScript and then write it out as a `.glb` (for example, to bake procedural organelles into static assets, or to hand a procedural result to a 3D artist as a starting blockout). It does **not** give you sculpting, and it is **not** a practical route to authoring organic biology. Nobody sculpts cristae by serializing Three.js primitives.
- **The conceptually correct framing**: Three.js can *emit* a `.glb`; Blender can *author* one. If the human's mental model was "write some Three.js and get a `mitochondrion.glb` out the other side" — that is technically possible for a crude ellipsoid and is precisely what Stage 1 does **at runtime, in the browser, with no file at all**. The `.glb` only becomes worth having when a human or an artist has modelled something Three.js cannot generate from a formula.

### B.2 The corrected recommendation

**Stage 1 — procedural geometry in Three.js (MVP).** Zero assets, zero download, zero latency, zero license surface. Directly serves C1 ($0), C3 (nothing to download → nothing to stutter on) and C4 (no license to audit). This is unchanged from Revision 1 §1.4 and is now the plan of record rather than a conditional.

**Stage 2 — Blender-authored `.glb` for the 4 hero organelles**, authored via **headless deterministic scripting**: `blender --background --python script.py`. No MCP. Same 4 organelles as Revision 1: mitochondrion (cristae), chloroplast (grana), nucleus, Golgi.

**Three things worth noting in one place:**
- **Blender is free and open source** — the authoring path costs $0 in tooling, consistent with C1. The only cost is human time.
- **Asset optimization happens with `gltf-transform` and needs no Blender at all.** Draco (70–90% geometry), Meshopt (60–80%, incl. animation/morph), KTX2/Basis (75–85% textures), WebP (25–35%) — all via the Node CLI **[V]** (Khronos "3D on the Web 2026"; `gltf-transform` docs). So even a human who never opens Blender can still optimize assets.
- **Middle path worth naming [R]:** because Blender is scriptable, you can build geometry *procedurally inside Blender* via `bpy`/`bmesh` and export a `.glb` — the same parametric approach as Stage 1, but authored in Python and baked to a file. This means **Blender scripting is useful even to someone who cannot sculpt.** It is the answer for "I want a real asset file but I don't want to hand-model."

### B.3 Why not the Blender MCP (re-readable rationale)

Revision 1 reached this verdict in §2.6. Restated compactly so the rationale survives independently of that section:

1. **The MCP adds no capability — only an interface.** Everything it can do is `bpy`, and `bpy` is fully driveable headless and deterministically. **An AI can author the Blender Python scripts directly.** You do not need a conversational layer to get automated `.glb` export, material setup, decimation, or LOD generation; you need a script.
2. **The MCP requires a live GUI session.** It proxies to a *running* Blender over a local socket with an add-on enabled **[V]**. So it cannot run in CI, on a build server, or in any unattended workflow.
3. **It is not reproducible or diff-reviewable.** A conversation is not an artifact. The script is.
4. **It carries the Blender Foundation's own security warning**: the official server "will execute LLM generated code in Blender **without any guards in place**… it is recommended to use a virtual machine" **[V]**. An unnecessary attack surface for an asset pipeline.
5. **It adds setup and platform risk** for no functional gain: `uv`/`uvx`, add-on installation, MCP client config, Windows Firewall on the local socket, `spawn uvx ENOENT` from GUI-launched clients, and add-on API breakage across Blender 4.x → 5.2 **[V]**.

**What you get instead:** `blender --background --factory-startup --python tools/build_assets.py` — reproducible, CI-able, free, diff-reviewable, and it needs no human present. **[V]** `--background`, `--python-expr`, and `--factory-startup` confirmed in the official Blender 5.2 manual.

**The single honest exception** (unchanged from Revision 1): if the human is a non-programmer 3D artist who wants conversational control while modelling, an MCP server is a legitimate *personal authoring tool* in Stage 2. It should never enter `package.json`, CI, or the build path.

### B.4 Target asset budget, tied to the 25 MB Pages limit

Connecting the §3.5 budget to the hosting constraint makes the numbers concrete and self-enforcing:

| Level | Target | Why |
| --- | --- | --- |
| **Procedural (Stage 1)** | **0 bytes** | Generated in code. Nothing to download, nothing to compress, nothing to license. |
| **Hero organelle `.glb` (Stage 2)** | **~1–5 MB** after **Meshopt/Draco + KTX2** | This is the realistic landing zone for a well-built organelle: a hand-modelled sculpt might start at 20–60 MB raw, and Meshopt/Draco (60–80%) plus KTX2 (75–85%) brings it into the low single-digit MB range. |
| **Full cell scene** | ≤ 1.5 MB compressed, organelles streamed on demand | Per §3.5. |
| **Hard ceiling** | **25 MB** | Cloudflare Pages' per-file limit **[V]**. |

> **The 25 MB line is a useful definition, not just a limit: if a hero organelle `.glb` exceeds 25 MB after compression, it is definitionally too heavy for the web.** A single organelle is a small object on screen; the geometry and texture detail that justifies 25 MB cannot be perceived at the scale this app renders it. When an asset trips that ceiling, the correct response is to simplify the asset, not to reach for R2.

### B.5 Worked example — authoring a mitochondrion headless

Illustrative, not a tutorial. The point is to make "`blender --background --python`" concrete enough to be believable. **All operator keyword arguments below are illustrative [R] — exact kwarg names drift between Blender versions and must be checked against the installed version's Python API.**

**Invocation:**
```
blender --background --factory-startup --python tools/build_mitochondrion.py
```

**Inside `tools/build_mitochondrion.py`:**

1. **Outer body** — create a UV sphere, scale it non-uniformly to an ellipsoid (e.g. `(2.0, 0.9, 0.9)`) to get the classic bean/rod silhouette, apply the transform.
2. **Organic irregularity** — real mitochondria are not perfect ellipsoids. Add a `Displace` modifier driven by a low-strength procedural noise texture so the silhouette is subtly lumpy. Cheap, and it does most of the work of *not* looking like a CAD primitive.
3. **The teaching object: cristae.** This is the part that no AI generator and no procedural one-liner can produce, and it is the reason Blender is in the plan. A workable construction:
   - Create a single crista as a **thin folded sheet** — an elongated narrow profile, `Solidify`'d to give it thickness. A crista is a membrane, not a solid.
   - **`Array`** that sheet along the organelle's long axis to build the stack (roughly 8–14 instances), with per-instance random rotation and scale so the stack looks biological rather than machined.
   - Optionally **`Simple Deform` (Bend)** the stack so the cristae curve the way real cristae do.
   - **`Boolean (Intersect)`** the stack against the inner membrane volume so no sheet pokes through the outer surface. This is the step that keeps the model sectionable and isolatable.
4. **Materials as slots — this is what makes the interaction work.** Assign the outer membrane and the cristae stack to **separate materials**. The exported `.glb` then carries distinct material slots, which is exactly what Three.js needs to highlight and isolate them independently for the hover/click requirement. **Getting this wrong is the most common way a good-looking model becomes useless to the app** — if the whole organelle is one material, the app cannot highlight part of it. **[R]**
5. **Export.**
   ```python
   bpy.ops.export_scene.gltf(
       filepath="assets/mitochondrion.glb",
       export_format="GLB",
       export_apply=True,      # bake modifiers into the mesh
       export_yup=True,        # glTF is Y-up; avoids a rotated model in-browser
       export_materials="EXPORT",
   )
   ```
6. **Optimize — outside Blender, no Blender required:**
   ```
   npx @gltf-transform/cli optimize assets/mitochondrion.glb assets/mitochondrion.min.glb \
     --compress meshopt --texture-compress ktx2 --texture-size 1024
   ```
   Target: land in the ~1–5 MB band from B.4.
7. **Verify in CI** — the Playwright pixel-metric check from §4.4 asserts the organelle renders non-blank and in roughly the expected position, catching a broken export before a human looks at it.

**Why this is the right shape of workflow [R]:**
- **The script is the artifact.** It is diff-reviewable, re-runnable, and version-controlled — unlike a conversational MCP session.
- **It is fully automated end to end**: model → export → optimize → verify, runnable from an npm script.
- **It costs $0** (Blender is free; `gltf-transform` is free) — constraint C1.
- **An AI can author the script.** This is the direct answer to "we rejected the MCP — so how does the AI help with Blender?" It helps by writing the deterministic script, which is the more useful contribution anyway.

---

## Section C — Revised asset sourcing under non-commercial

### C.1 What changed, stated explicitly

**Revision 1's conclusion is superseded.** It said: *"the only commercially clean scientific route is deriving meshes yourself from CC0 data… Do not ship 3DMSL assets (CC BY-NC) or NIH 3D's `3DPX-015797` Animal Cell (CC-BY-NC-SA) in a commercial product."*

**All of that was correct for a commercial project. This project is non-commercial (constraint C4), so the constraint it encoded no longer applies.** The corrected position:

| Asset | License | Commercially usable? | **Usable here?** |
| --- | --- | --- | --- |
| **3DMSL** — >27k EM-derived mitochondria (mesh / point cloud / implicit), doi:10.18710/JX6JXF | **CC BY-NC 4.0** **[V]** — verified directly on the DataverseNO dataset page | ❌ No | ✅ **YES** — attribution + citation required; no ShareAlike |
| **NIH 3D `3DPX-015797`** "Animal Cell" | **CC-BY-NC-SA** **[V]** — verified on the entry page | ❌ No | ⚠️ **YES, with a ShareAlike risk — assess before adopting** |
| **EMDB / EMPIAR / PDB** (wwPDB core archives) | **CC0 1.0** **[V]** — "no charge and with no limitation on usage" | ✅ Yes | ✅ **YES** — cleanest option; no attribution obligation, no SA, and it does not depend on the non-commercial status at all |
| **Sketchfab free downloads** | Varies per upload: CC-BY / CC-BY-NC / CC-BY-ND / CC-BY-SA **[V]** | Mixed | ⚠️ **Case by case.** CC-BY-NC uploads are now in scope; **CC-BY-ND and "display-only" uploads stay unusable regardless of commercial status** (no derivatives means no decimation, re-material, or mesh splitting — which this app requires) |
| **Free-engine AI output** (Tripo free tier etc.) | Non-commercial tiers **[V]** | ❌ No | ⛔ Technically unusable anyway — rejected in §1.3 on the no-internal-geometry grounds, not on licensing |

**Three things to notice about this table [R]:**
1. **The non-commercial status unlocks two real, high-quality, scientifically-derived asset sources that were previously excluded.** That is a genuine gain, not a technicality.
2. **CC0 remains preferable** even though it is no longer *required*. CC0 imposes no attribution, no ShareAlike, and — critically — **no dependency on the project's commercial status ever remaining what it is today.** See C.4.
3. **The one license that still gates a decision is ShareAlike**, and it applies to exactly one candidate asset. That is a narrow, tractable question — C.3 answers it.

### C.2 The non-commercial obligations that DO still apply

Non-commercial status removes the *commercial-use* bar. It does not remove **attribution**. For CC BY-NC 4.0 (3DMSL) and CC BY-NC-SA 4.0 (`3DPX-015797`), you must still:

- **Attribution (BY)** — credit the creator, name any others designated, and link to the license.
- **Indicate changes (BY)** — state whether you modified the material. If you decimated, re-materialed, or split a mesh, say so. This obligation applies to CC BY in both licenses.
- **Link to the license** — a visible link, not just a text name.
- **NonCommercial (NC)** — must stay non-commercial. See C.4 for why this is a live risk rather than a formality.

**Practical implementation [R]:** a per-asset license manifest (a small JSON or TS record co-located with the assets, rendered by an in-app "Credits / Licenses" panel). This is cheap, it satisfies every obligation above in one place, and the prior-art repo's own roadmap even lists the same idea as a desired feature — *"Add asset license metadata directly into the UI"* **[V]**. It also makes the audit survivable: when someone later asks "where did this mitochondrion come from?", the answer is one file.

**Important distinction [R]:** the NC/SA conditions attach to **the assets**, not to **your code**. The project's own source code can still carry a permissive license such as MIT. What you cannot do is relicense the CC-BY-NC asset itself as MIT, or imply that it is. Keep the asset directory and its license manifest visibly separate from the code LICENSE — this is exactly the delineation that also makes the ShareAlike question in C.3 tractable.

### C.3 CC-BY-NC-SA ShareAlike — an honest risk assessment

This concerns **NIH 3D `3DPX-015797`** and any other CC-BY-NC-**SA** asset. It is the one license term that can reach beyond the asset itself.

**What ShareAlike says, structurally:** if you create and share an **"Adapted Material"** — material derived from, or incorporating, the licensed work — you must license that Adapted Material under the same or a compatible license, and you may not add restrictions beyond the license's own terms.

**The mechanism that decides everything: Adapted Material vs. Collection.** Creative Commons licenses distinguish adapting a work from *collecting* it. A **Collection** — where the work is not modified and is assembled alongside other independent contributions — does **not** trigger ShareAlike. So the scope of SA turns on a factual question about what you did to the mesh. **[R]**

**Applied to this project, honestly:**

**The low-risk reading.** If you ship the animal-cell model *unmodified* as one asset within the app, the app is plausibly a **Collection**: your own code plus an unmodified CC-BY-NC-SA work plus other works. Under that reading, ShareAlike does **not** force the whole application under CC-BY-NC-SA, and the obligations reduce to BY (attribution) + NC. This is the reading many practitioners would adopt.

**Why I do not think this project gets to rely on it [R]:**
1. **You will almost certainly modify the model, and modification is the trigger.** The product requires per-organelle hover, click, and isolation. That means **splitting the whole-cell model into per-organelle meshes**, re-naming and re-organising material slots, decimating, re-UVing, and re-compressing to Meshopt/KTX2. Every one of those creates an **Adapted Material**. The "unmodified Collection" reading survives only if you change nothing — and the app's core interaction requires changing things. **This is the decisive point.** The very features that make the asset useful are the ones that engage ShareAlike.
2. **"No additional restrictions" is easy to violate by accident.** Once the adapted mesh is inside the app, the surrounding packaging matters. Shipping the adapted asset inside a bundle whose license is incompatible with CC-BY-NC-SA, or applying DRM/technical restrictions to it, is the kind of thing the "no additional restrictions" clause exists to prevent. **[R]**
3. **ShareAlike scope is legally contested, and I am not a lawyer — and neither is this artifact.** That is not a hedge; it is the substantive point. The Adapted-vs-Collection distinction is debated precisely at the seam this project sits on (is a modified GLB loaded by an app part of the app, or a separate asset?), and the human has no legal budget (C1: $0). **A license question that cannot be resolved without counsel should be avoided rather than optimistically assumed.**

**Concrete conclusion, and it is a useful one [R]:**

> **The ShareAlike problem is real and it concentrates on the one asset that is also the worst candidate for it.** `3DPX-015797` is a *whole-cell* model — exactly the asset you would need to dismember most aggressively for per-organelle interaction, and therefore exactly the asset where SA obligations attach most surely.
>
> **Meanwhile the better-specified opportunity has no ShareAlike at all: 3DMSL is CC BY-NC 4.0.** For mitochondria — the single most important organelle in the teaching plan — you can have real EM-derived scientific data with attribution and no viral clause.

**Recommendation:** **prefer 3DMSL (CC BY-NC 4.0) or CC0 sources; treat CC-BY-NC-SA assets as a last resort.** If `3DPX-015797` is genuinely irreplaceable, then:
1. Keep it in a clearly delineated directory with its own license manifest naming CC-BY-NC-SA, the changes made, and a license link.
2. Do not represent that asset or its derivatives as MIT or as fully owned by the project.
3. Expect that the safest posture may be to license the *adapted asset* under CC-BY-NC-SA while leaving the surrounding code independent.
4. Validate the posture with someone qualified before publishing if the asset is load-bearing for the product.

**Cost of being wrong here [R]:** the failure mode is not a lawsuit from a hobby project that earns nothing. It is (a) a **takedown request** that removes an organelle the design depends on, (b) a **re-attribution or relicensing scramble** late in the project, or (c) **the asset becoming unusable** if the project's status ever changes (C.4). The cheap insurance is to prefer CC0 and CC-BY-NC, and to keep the SA asset optional rather than load-bearing.

### C.4 The condition that makes all of this fragile: non-commercial status is a dependency

**NC licenses are conditional on use staying NonCommercial. Constraint C4 says it will. That makes C4 a *license-compliance* dependency, not just a product preference.** **[R]**

CC's NonCommercial means *not primarily intended for or directed toward commercial advantage or monetary compensation*. That is satisfied by C4 today. But every CC-BY-NC asset in the project becomes **unusable the moment that changes** — if ads ever appear, if access is ever sold, if an institution ever pays for it. The human's constraint explicitly forbids "institutional resale", which is good, but it is worth stating the consequence plainly:

> **Choosing CC-BY-NC assets is a bet that the project never monetizes. Choosing CC0 assets is a bet you do not have to make.**

This is the strongest argument for the CC0-first ordering even under non-commercial status:

| Approach | Cost today | Risk if status ever changes |
| --- | --- | --- |
| **CC0-first (EMDB/EMPIAR/PDB), CC-BY-NC only where CC0 cannot deliver** | Higher derivation effort (segmentation → marching cubes → retopo, per §1.2 row F) | **None.** The assets remain usable regardless. |
| **CC-BY-NC-first (3DMSL, `3DPX-015797`)** | Much lower effort; real scientific data available now | **Assets must be replaced or removed** if the project ever monetizes. |

**Recommendation [R]:** take the CC-BY-NC assets **now** — the effort saving is real and the project needs them — but **structure the asset layer so an asset can be swapped out without touching the app.** That means: assets addressed through the manifest (§C.2), never hard-coded paths scattered through components; the procedural Stage-1 geometry retained permanently as the fallback for every organelle; and a recorded note in the manifest of each asset's license and swap-difficulty. Then a status change costs an afternoon of substitution instead of a rewrite. **This is the concrete mitigation that makes the non-commercial bet safe to take.**

---

## Recommendation Summary

| Question | Recommendation | Confidence | Cost of being wrong |
| --- | --- | --- | --- |
| **Q1** Assets *(revised in R2)* | **Procedural geometry for MVP** (own it, $0, no license surface, fully parameterized); **Blender-authored GLBs for the 4 hero organelles in Stage 2**; CC0-derived outer shapes preferred for scientific provenance, **CC-BY-NC assets (3DMSL) now available** and acceptable for non-commercial use; **avoid CC-BY-NC-SA** unless irreplaceable (§C.3). **Zero budget for AI generation** — rejected on technical grounds, not licensing. | High | If the human wants a photoreal showcase rather than a teaching tool, Stage 1 is wasted work — confirm intent. If the project ever monetizes, every CC-BY-NC asset must be replaced (§C.4) |
| **Authoring tool** *(new in R2)* | **Blender for authoring** (free, open source), **Three.js for procedural generation and rendering**. Three.js cannot sculpt organic geometry — that is not a limitation to work around, it is the wrong tool for that job. Author via **headless `blender --background --python`**. | High | If the human expects to author `.glb` files in Three.js, the plan needs re-explaining before work starts — see Section B |
| **Q2** Blender MCP | **Do not wire it up.** Drive `bpy` with `blender --background --python` (headless, deterministic, CI-able); do `.glb` optimization with `gltf-transform` (needs no Blender). Revisit MCP only as a *personal authoring tool* in Stage 2, and only if the human is a non-coder — **and note this is a rejection of the MCP integration, NOT of Blender.** | High | If the human will not write scripts, MCP is the only automation route — then install the **official** add-on on Blender 5.2.1 LTS and keep it out of CI |
| **Q3** Architecture | R3F + drei on React 19/TS/Vite; GSAP timeline for scripted sequences + `useFrame` for continuous motion; **Zustand** for the reactive/transient split; **one `<Canvas>`, two groups, one shared timeline** for comparison. Comparison mode is its own late milestone. | High (stack) / Medium (Zustand) | Comparison mode built early or with two `<Canvas>`es = a rewrite of the scene and state layer; per-frame React state = an inexplicable frame-rate cliff |
| **Q4** Deployment *(revised in R2)* | **Cloudflare Pages (Free), fully static Vite SPA**, + R2 public bucket on a subdomain if any asset exceeds 25 MB. No backend. **Unlimited bandwidth is the deciding factor**; the "rougher DX" objection does not apply to a purely static SPA (§A.4). | High | If the PR workflow needs a preview URL per commit, the 500-build / 1-concurrent-build limits will be felt, and Vercel/Netlify would feel nicer — at the cost of a 100 GB cap (§A.6) |
| **Constraints** *(new in R2)* | **C1** $0 indefinitely · **C2** simple to operate · **C3** no stutter · **C4** non-commercial. **C3 is a rendering requirement, not a hosting one** — it is solved by the §3.5 budget, never by host choice. | High | Misreading C3 as a hosting requirement leads to host-shopping as a fix for an asset-weight problem, which will not work (§A.1) |

---

## Decision Points for the Human

These are the forks where **your** answer changes the design. They are ordered by leverage. **Revision 2 status is marked on each.**

1. ✅ **RESOLVED in Revision 2 — Commercial or non-commercial?** → **Non-commercial / educational** (constraint C4). Consequence: the free-asset tier is **open**. NIH 3D's Animal Cell (`3DPX-015797`, CC-BY-NC-SA) and 3DMSL (CC BY-NC 4.0) are now usable; Vercel Hobby and GitHub Pages are no longer ToS-blocked (though still not recommended — see Section A). **The earlier statement that only CC0 is clean is superseded** — see the Revision History note and Section C. Attach the risk in §C.4: CC-BY-NC assets are usable *only while the project stays non-commercial*.
2. **Is hand-modelling in Blender acceptable, or must assets be sourced?** This determines the schedule more than any other factor. Procedural MVP needs no artists. Stage 2 needs 8–24 h per hero organelle of someone's time **[U]**. **Note: this decides *who* authors, not *whether* Blender is used** — Blender is free, so the only cost is time.
3. **Tone mapper: cinematic or color-accurate?** ACESFilmic gives the Hasselblad look but shifts hues, which conflicts with the palette selector and the high-contrast accessibility mode. Khronos PBR Neutral preserves the swatch colors you show in the UI. Pick one deliberately.
4. **Is comparison mode in the MVP, or explicitly deferred?** Recommend deferring. It is the single source of most of the architectural complexity (shared clock, doubled budget, layout, teardown) and the least pedagogically urgent — the cytokinesis contrast can be taught with a phase toggle in the single-cell view first.
5. **Is a WebGL-disabled fallback a requirement?** This is an educational product aimed at classrooms. Default recommendation: **yes**, a static image + full spec sheet.
6. 🆕 **Is the CC-BY-NC-SA animal cell (`3DPX-015797`) load-bearing, or optional?** If optional, prefer **3DMSL (CC BY-NC 4.0, no ShareAlike)** for mitochondria and CC0 sources elsewhere, and skip the ShareAlike question entirely. If load-bearing, read §C.3 before committing. **Recommended default: use 3DMSL, treat SA assets as replaceable.**
7. 🆕 **Is the project willing to enforce the §3.5 asset budget as a build-time gate?** Constraint C3 depends on it, and the 25 MB Pages limit makes it enforceable for free. Recommended default: **yes** — fail the build on an oversized asset rather than discovering it at runtime.

---

## Risks

**Risks that would invalidate this recommendation:**

- ✅ **RESOLVED in Revision 2 — commercial intent.** The human confirmed **non-commercial / educational** (C4). This *strengthens* nothing and *weakens* nothing in the architecture; it widens the asset tier (Section C) and relaxes host ToS constraints (Section A).
- 🆕 **The project's non-commercial status changes later.** This is the new version of the old risk, and it is now a **license-compliance** risk rather than a licensing-scope one: every CC-BY-NC asset in the project becomes unusable the moment ads, paid access, or institutional resale appear. Mitigation is structural — see §C.4 (asset manifest + procedural fallback retained + swap-difficulty recorded per asset). **This is the single most important residual risk introduced by Revision 2.**
- 🆕 **ShareAlike obligations triggered by modifying a CC-BY-NC-SA asset.** Assessed in §C.3. The decisive point is that the app's core interaction (per-organelle isolation) *requires* modifying a whole-cell mesh, which is exactly what engages ShareAlike. **Recommended posture: prefer CC0 and CC-BY-NC; treat SA assets as replaceable.** Not legal advice, and no legal budget exists (C1).
- **The human wants a photoreal showcase, not a teaching tool.** Then "procedural geometry in code" is the wrong Stage 1 and the whole asset strategy inverts toward commissioned Blender work. I judged intent from the concept doc's pedagogical framing ("teach cell structure AND vital processes in motion, not static text") — if that framing is aspirational rather than actual, this recommendation is misaimed.
- **Blender is installed and the human is willing to model.** That moves Stage 2 earlier and shrinks Stage 1 to a placeholder — the plan is staged precisely so this is a scheduling change, not a redesign.
- **The prior-art cluster is weaker evidence than it looks.** I verified the stack and the file contents, but the repos are a derivative cluster of a self-described four-hour AI demo, and the two repos named in the brief could not be verified at all. If the human was planning to lean on them as a proven starting point, the honesty here matters: it is a pattern reference, not a product reference.
- **`gltf-transform`, `playwright`, and the R2/Pages integration are all new dependencies I have not executed on this machine.** Every version claim is from documentation and source, not from a build I ran.

**Risks that would invalidate the *hosting* recommendation specifically** (requested explicitly):

- **A runtime backend is added later.** Pages Functions / Workers introduce request quotas (Workers free = 100k requests/day **[V]**) and a runtime to operate — breaking both C1 ($0 guarantee) and C2 (simplicity), and making the host choice wrong. **This is the most likely way the recommendation fails, because it is a design decision someone could make for an unrelated reason** (§4.1 rejects the AI-generation backend, but a future feature could reintroduce one).
- **The PR workflow genuinely requires a preview deploy per commit.** Cloudflare's free tier is **1 concurrent build / 500 builds per month**; a preview-per-commit habit inside the GitHub Actions quota is fine, but inside the *Pages* quota is not. If the human's workflow depends on per-commit preview URLs, Netlify or Vercel would feel materially better and this recommendation should be revisited. Mitigation in §A.6 (deploy only on merge to `main`).
- **The asset budget is not enforced and payloads drift upward.** Not a host failure, but it converts a comfortable quota into a tight one on any capped host, and it directly violates C3. On Cloudflare specifically the 25 MB/file limit turns this into a build failure, which is why the cap is framed as a feature (§A.4c).
- **Bandwidth or TTFB figures in §A.2 prove wrong.** The bandwidth/credit/PoP/TTFB numbers in the comparison table come from **third-party comparison articles, not vendor documentation [U/secondary]**. The Cloudflare column was cross-checked against primary Cloudflare docs and **no contradiction was found**; the Vercel and Netlify figures were not independently verified. Note also **the sources disagree with each other** on whether Netlify permits commercial use on its free tier (§A.7) — which lowers confidence in the whole secondary source set, even though that particular disagreement is moot under C4.
- **`wrangler`-based deployment proves awkward on Windows.** **[U]** I did not verify the Windows DX of `wrangler pages deploy` or of R2 uploads. Revision 1 noted Windows PATH/`ENOENT` friction in a comparable Python toolchain; `wrangler` is Node-based and likely fine, but this is unverified and would directly affect C2 ("no lío").
- **The human expects hosting to fix stutter (C3).** If the asset-weight reframe in §A.1 is not accepted, effort goes into host-shopping instead of the performance budget, and C3 remains unmet on every host.

**Risks inherent to the recommendation:**

- R3F adds an abstraction layer and ~40–60 kB gz **[U]** over raw three.js. If the human is fluent in imperative Three.js and not in React, the stack choice costs more than it saves.
- Zustand's transient/reactive split is easy to state and easy to violate. A future contributor putting an animation clock in the store reintroduces the frame-rate cliff.
- Procedural geometry is real 3D programming, not a shortcut. "Cheap" here means *financially* free and license-clean, **not** low-effort.
- The estimated 8–24 h per hero organelle and the commissioning range $150–800 are **[U]** — no artist quote was obtained. The schedule risk in Stage 2 is carried entirely by that unverified estimate.
- GSAP license terms are current as of the 2025-04-30 Webflow license, verified today. Vendor licenses change; the prohibition on animation-builder competitors does not touch this project, but it is a single-vendor dependency.

**Explicitly unverified (marked [U] above, gathered here):**

- `cloudnewbie/cell-architecture-studio` and `echoxiangzhou/cell-architecture-studio` — could not confirm either exists. Likely incorrect in the brief.
- `aabonahar/3DCellForge` — the repo that resolves is **`huangserva/3DCellForge`**. Corrected.
- `RFingAdam/mcp-blender` (218 tools), `glonorce/Blender_mcp` (69 tools), `mackson/blender-mcp` v2, `PatrykIti/blender-ai-mcp` — not independently verified.
- R3F + drei added bundle size over raw three.js (40–60 kB gz).
- GSAP core bundle size (23–30 kB gz).
- Blender artist effort estimates (8–24 h/organelle) and commissioning cost ($150–800).
- **Revision 2 additions:**
  - **All Vercel and Netlify figures in §A.2** — 100 GB/month bandwidth, 6,000 build min/month (Vercel), 300 credits/month and the September 2025 credit system, PoP counts, and every TTFB figure. These come from **third-party comparison articles [U/secondary]**, not vendor documentation, and the articles disagree with each other on Netlify's commercial-use policy (§A.7). The **Cloudflare column was cross-checked against primary Cloudflare docs with no contradiction found**; the rest was not.
  - **Cloudflare Pages TTFB (~10–45 ms) and PoP count (300+)** — secondary sources only; not verified against Cloudflare documentation.
  - **Whether modifying a CC-BY-NC-SA asset for per-organelle isolation constitutes an "Adapted Material" for ShareAlike purposes** — §C.3 gives the reasoning and the risk, but **this is a legal question, not a technical one, and it is unresolved.** Not legal advice.
  - **The exact `bpy.ops.export_scene.gltf` keyword arguments in §B.5** — illustrative; kwarg names drift between Blender versions and were not checked against a running Blender.
  - **Windows DX of `wrangler pages deploy` and R2 uploads** — unverified, and directly relevant to constraint C2.
  - **The `3D Cell Explorer` at `cell-model-46kw.vercel.app`** (animal/plant/macrophage/eosinophil/virus, pause, speed control, toggle organelles) — appears to be a live implementation of very close to this product on Vercel, but I could not verify its source, license, or quality.
  - **All performance numbers in §3.5 and §B.4 are proposed targets, not measurements.** Nothing has been built or profiled.

---

## Ready for Proposal

**Yes — unblocked.** Revision 1 was conditional on a single unresolved input. **That input is now resolved** (non-commercial / educational, constraint C4), the two hard constraints are recorded (C1–C3), and the two new sections (A: free hosting, B: authoring pipeline) close the remaining gaps.

**What is now settled and can be written into the proposal:**
- **Deployment**: Cloudflare Pages (Free), fully static Vite SPA, $0 indefinitely under the stated conditions (Section A). R2 only if an asset exceeds 25 MB.
- **Assets**: procedural geometry for the MVP; Blender-authored `.glb` for 4 hero organelles in Stage 2; CC0 preferred, **CC-BY-NC (3DMSL) available**, CC-BY-NC-SA treated as replaceable (Section C).
- **Authoring**: Blender for authoring, Three.js for generation and rendering; headless `blender --background --python`; no MCP (Section B).
- **Architecture**: R3F + drei + GSAP + Zustand; comparison mode as its own late milestone (Q3, unchanged from Revision 1).

**What still needs a human answer, and where it can be answered:**
- **Decision 2** (who authors: human, artist, or procedural-only) is a **schedule** input. It does not block the proposal but it should appear in the proposal as a dependency with a named owner, because Stage 2's effort estimate is still unverified **[U]**.
- **Decisions 3, 4, 5** (tone mapper, comparison-mode timing, WebGL fallback) remain **`sdd-design`** decisions — ratify them there. Record them in the proposal's risks.
- **Decisions 6 and 7** (is the SA asset load-bearing; is the asset budget a build gate) have **recommended defaults** stated above and can be ratified in `sdd-design` unless the human objects.

**Two things the proposal must carry forward explicitly:**
1. **Constraint C3 is a rendering requirement, not a hosting one** (§A.1). If this framing is lost, the project will try to fix stutter by changing hosts and will fail.
2. **The CC-BY-NC assets are usable only while the project stays non-commercial** (§C.4). This is a dependency, not a formality, and the mitigation (asset manifest + retained procedural fallback) should be an accepted part of the design rather than an afterthought.

**Next phase**: `sdd-propose` for `cell-anatomy-explorer`. No outstanding blocker.
