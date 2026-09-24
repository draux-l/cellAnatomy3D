import { DoubleSide, FrontSide, MeshStandardMaterial, type Material } from 'three';
import { MATERIAL_KEY_NAMES, type MaterialKeyName } from '../catalog/types';

/**
 * Materials for the M1b organelle set.
 *
 * Design D4 makes the palette the colour source of truth (`catalog/palettes.ts`, task 8.1)
 * and the record never carries a colour. That module does not exist yet, so the placeholder
 * values are pinned here and the viewer reads them through this factory; when 8.1 lands it
 * replaces this module and nothing else changes.
 *
 * `M0_COLORS` keeps its name on purpose: those two values are the M0 mitochondrion's identity and
 * have not moved. The rest of the table is new, grouped by the palette role each surface stands
 * in for — `membrane` role for the boundary shells, `nucleus` role for the nuclear layers,
 * `organelles` role for the bodies inside the cytosol.
 *
 * Two banned-technique guards live here and are unit-tested: no `transmission` (the single
 * biggest fill-rate cost available) and no ACES tone mapping anywhere in `src/`.
 */

export const M0_COLORS = {
  background: '#07090c',
  /** Outer (smooth) mitochondrial membrane. Translucent so the cristae stay legible. */
  outerMembrane: '#b4694a',
  /** Inner membrane folds — the teaching object for respiration. */
  innerMembrane: '#e9b783',
  /** Cool rim light keeps the silhouette readable against the dark background. */
  rimLight: '#9ec6ff',

  /** `membrane` palette role: the cell's own thin boundary. */
  membrane: '#7fa8cc',
  /**
   * `cytoplasm` palette role: the cytosol the organelles sit in.
   *
   * The first and only consumer of the `cytoplasm` role. Both user references label the cytoplasm
   * explicitly, and in the animal cell the blue interior fill *is* the cytoplasm — so the colour is
   * a blue related to the membrane's but deeper, because it is read through the membrane rather
   * than as a boundary.
   */
  cytoplasm: '#4f7ea8',
  /** `nucleus` palette role, outer layer. Translucent so the nucleolus reads through it. */
  nuclearEnvelope: '#9b7fc4',
  /** `nucleus` palette role, the dense body. Opaque and dark: it must be unmistakable. */
  nucleolus: '#5b3f8c',
  /** `nucleus` palette role, pore rings and other envelope detail. */
  nuclearPore: '#cbb6ea',
  /** `organelles` palette role, small granules (ribosomes). */
  granule: '#d8c27a',
  /** `organelles` palette role, the digestive vesicle. */
  lysosome: '#cf7f5c',
  /** `organelles` palette role, the folded membrane network. */
  er: '#8fae85',
  /** `organelles` palette role, the stacked cisternae. */
  golgi: '#c9a05a',
  /** `organelles` palette role, the budding transport vesicles. */
  vesicle: '#e0c489',
  /** `membrane` palette role, the chloroplast's outer envelope. */
  chloroplast: '#6f9e5a',
  /** `organelles` palette role, the stacked thylakoid discs — the photosynthesis teaching object. */
  grana: '#3f7a45',
  /** `membrane` palette role, the rigid cellulose wall around the plant cell. */
  cellWall: '#c9b98f',
  /** `organelles` palette role, the large fluid body that fills the plant cell. */
  vacuole: '#7fb3a6',

  /*
   * Mesh-path keys (task 12.4). The mesh identification map addresses these surfaces where the
   * procedural builders had no equivalent layer — the nucleus body behind its envelope, the
   * chromatin inside it, and the model's own cytoskeleton-like network — plus the two plant
   * structures that render unlabelled. All five are bodies; every boundary surface on the mesh
   * path reuses an existing shell key, which is what keeps the ≥17 fps floor in reach (a shell is
   * `FrontSide` + `depthWrite:false`, never `transmission`).
   */
  /** `nucleus` palette role, the nuclear body the envelope wraps. */
  nucleus: '#6f4fa8',
  /** `nucleus` palette role, the chromatin strands inside the nuclear body. */
  chromatin: '#b98fd6',
  /** `organelles` palette role, the cell-spanning filament network (rendered unlabelled). */
  cytoskeleton: '#9aa7bd',
  /** `organelles` palette role, the plant peroxisome (rendered unlabelled, no roster record). */
  peroxisome: '#a9c06b',
  /** `membrane` palette role, the wall channels between plant cells (rendered unlabelled). */
  plasmodesma: '#b9a878',
} as const satisfies Record<string, string>;

export type OrganelleMaterials = Record<MaterialKeyName, Material> & {
  dispose: () => void;
};

/**
 * A translucent shell: the boundary surfaces — the cell membrane, the nuclear envelope, the
 * mitochondrial and chloroplast outer membranes, the vacuole and the plant cell wall.
 *
 * **The shells are single-sided, and that is a measured performance decision, not a stylistic one.**
 *
 * Every shell is a *geometrically closed* surface. Measured by keying edges on quantised vertex
 * position rather than on vertex index — so a UV seam is not mistaken for a hole — the membrane,
 * the nuclear envelope, both outer membranes, the vacuole and the wall each report **zero** boundary
 * edges. A closed surface's back faces can never contribute to the silhouette, so `DoubleSide` was
 * buying nothing and costing a great deal: with `transparent: true` and `depthWrite: false` the
 * renderer shades every covered pixel **twice**, once per face.
 *
 * Measured on the composed cells at 1280x800 with `verify/perf-probe.mjs` (three independent page
 * loads per reading, numbers are the median): flipping the shells to `FrontSide` moved the animal
 * cell from 44.1 to 59.5 fps p50 and the plant cell from 27.4 to 36.6. The shells are essentially
 * the entire cost of the frame — hiding the *opaque* organelles changes nothing (26.0 against a
 * 27.4 control) while hiding the *shells* reaches the vsync cap (59.9).
 *
 * **They are `MeshStandardMaterial`, not `MeshPhysicalMaterial`.** A shell uses no physical feature:
 * `transmission` is banned here (it is the single biggest fill-rate cost available), and clearcoat is
 * a second specular lobe laid over a surface that is only 22–45% opaque. Keeping the physical shader
 * path with `clearcoat: 0` still cost about 11% over standard once the side was already fixed (plant
 * 43.5 to 48.1), and the clearcoat term itself a further ~7%.
 *
 * This is a deliberate departure from the skill's materials guidance, which prescribes a
 * `clearcoat ≈ 0.1–0.4` sheen on the membrane and shells. That sheen is not worth a frame rate that
 * misses its own target on the reference hardware: the shells keep the environment map, the
 * roughness and the rim light, which carry most of the look, and the change is one line to reverse.
 */
function createShell(color: string, opacity: number): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color,
    roughness: 0.42,
    metalness: 0.06,
    transparent: true,
    opacity,
    side: FrontSide,
    // Layers inside the shell must not be depth-culled by the shell itself.
    depthWrite: false,
  });
}

/** Opaque body settings: the default for anything the shell is protecting. */
function createBody(color: string, flatShading = false): MeshStandardMaterial {
  return new MeshStandardMaterial({
    color,
    roughness: 0.62,
    metalness: 0,
    flatShading,
  });
}

export function createOrganelleMaterials(): OrganelleMaterials {
  const materials: Record<MaterialKeyName, Material> = {
    outerMembrane: createShell(M0_COLORS.outerMembrane, 0.46),
    innerMembrane: new MeshStandardMaterial({
      color: M0_COLORS.innerMembrane,
      roughness: 0.62,
      metalness: 0,
      // The folds are thin sheets: without DoubleSide their backfaces vanish.
      side: DoubleSide,
    }),
    membrane: createShell(M0_COLORS.membrane, 0.22),
    // The cytosol fill. The lowest opacity of the boundary surfaces on purpose: it covers the whole
    // cell, and every organelle is *inside* it, so the shell's near hemisphere tints them. Higher
    // than this and the cell reads as a solid blue ball with shapes lost in it.
    cytoplasm: createShell(M0_COLORS.cytoplasm, 0.17),
    nuclearEnvelope: createShell(M0_COLORS.nuclearEnvelope, 0.3),
    nucleolus: createBody(M0_COLORS.nucleolus),
    nuclearPore: createBody(M0_COLORS.nuclearPore),
    // A 20-triangle granule gets its legibility from facets, not from vertex count.
    granule: createBody(M0_COLORS.granule, true),
    lysosome: createBody(M0_COLORS.lysosome),
    er: createBody(M0_COLORS.er),
    golgi: createBody(M0_COLORS.golgi),
    vesicle: createBody(M0_COLORS.vesicle),
    // The envelope is as translucent as the mitochondrion's: the grana are the teaching object
    // and must stay legible straight through the stroma.
    chloroplast: createShell(M0_COLORS.chloroplast, 0.4),
    grana: createBody(M0_COLORS.grana),
    // The wall is the more opaque of the two plant boundaries: it is the cell's rigid outer layer,
    // and the band has to stay readable where its own front, back and inner faces overlap.
    cellWall: createShell(M0_COLORS.cellWall, 0.45),
    // The vacuole is the largest surface in the cell, so it is the lower opacity of the two:
    // overdraw, not `transmission`, is the cost that matters here.
    vacuole: createShell(M0_COLORS.vacuole, 0.26),
    // Mesh-path bodies (task 12.4): every one is an opaque body, on the same `createBody` recipe
    // the procedural organelles use. The nucleus body is opaque because the model's chromatin sits
    // inside it and must read through; the unlabelled plant/skeleton structures are plain bodies.
    nucleus: createBody(M0_COLORS.nucleus),
    chromatin: createBody(M0_COLORS.chromatin),
    cytoskeleton: createBody(M0_COLORS.cytoskeleton),
    peroxisome: createBody(M0_COLORS.peroxisome),
    plasmodesma: createBody(M0_COLORS.plasmodesma),
  };

  return {
    ...materials,
    dispose: () => {
      for (const key of MATERIAL_KEY_NAMES) {
        materials[key].dispose();
      }
    },
  };
}
