import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { Vector3, type Camera, type Raycaster } from 'three';
import { cellDebug, type AnnotationMirrorEntry } from '../../app/debug';
import { useAppStore, type Locale } from '../../app/store';
import { rosterFor } from '../../catalog/cells';
import type { CellId } from '../../catalog/types';
import { anchorWorldPosition } from '../../scene/anchors';
import { PICK_LAYER, occluderObjects } from '../../scene/interaction/pickingModel';
import {
  DEFAULT_ANNOTATION_BOX,
  OCCLUDED_INK_OPACITY,
  createColumnAssignments,
  solveAnnotationLayout,
  type AnnotationLayout,
  type AnnotationProjection,
  type ColumnAssignments,
} from './solver';
import { annotationInkStyleForId } from './ink';

/**
 * The annotation overlay (tasks 4.15–4.17, design D14).
 *
 * Two halves, deliberately separated by the canvas boundary:
 *
 * - **`AnnotationOverlay`** is plain react-dom, mounted beside the canvas. It renders one
 *   absolutely-positioned subtree: an `<svg>` of leader paths and anchor markers, plus one label
 *   block per roster organelle carrying **both language lines from the record's own `name`**.
 *   React re-renders it on discrete changes only — the roster, the locale, the hover, the quiz
 *   guard — never per frame.
 * - **`AnnotationDriver`** lives inside the `<Canvas>` because it needs `useFrame`, and renders
 *   nothing. Its single frame callback projects each anchor through the organelle root's
 *   **current, displaced** `matrixWorld`, runs occlusion, solves the layout and writes
 *   `transform`, the SVG `d` and opacity straight into the overlay's DOM nodes — only when a value
 *   changed.
 *
 * Why not a portal from inside the canvas: React Three Fiber's reconciler owns that subtree, so
 * DOM JSX there is interpreted as three.js objects (`R3F: Rect is not part of the THREE
 * namespace`). drei's `<Html>` escapes that by mounting a second `createRoot`; the target-ref
 * pattern used here is the one this codebase already uses for the HUD readout, and it keeps a
 * single React root.
 *
 * The cost model is the design's point, so it is worth stating exactly: the layer adds **zero draw
 * calls** and **zero React frames**, and the anchor follows its organelle during orbit *and*
 * disassembly with no special case, because it is read from the same `Object3D` the disassembly
 * loop moves.
 */

/** How far short of the anchor an occlusion ray stops, in scene units. */
const OCCLUSION_RAY_MARGIN = 0.02;

/** The anchor marker's edge length, in CSS pixels. The hover emphasis scales it 1.3×. */
const ANCHOR_MARKER_SIZE = 7;

interface LastWrite {
  x: number;
  y: number;
  leader: string;
  inkOpacity: number;
  anchorX: number;
  anchorY: number;
}

/**
 * The mutable bridge between the two halves: DOM nodes the overlay owns, and the transient layout
 * memory the driver owns. A ref object, not React state — the same mechanism the disassembly HUD
 * uses for its text nodes.
 */
export interface AnnotationLayerTarget {
  labels: (HTMLDivElement | null)[];
  leaderGroups: (SVGGElement | null)[];
  leaderPaths: (SVGPathElement | null)[];
  anchorRects: (SVGRectElement | null)[];
  sizes: ({ width: number; height: number } | undefined)[];
  /** Per-node visibility, so a part that leaves the frame hides its annotation and comes back. */
  hidden: boolean[];
  columns: ColumnAssignments;
  lastWrite: Map<string, LastWrite>;
}

export function createAnnotationLayerTarget(): AnnotationLayerTarget {
  return {
    labels: [],
    leaderGroups: [],
    leaderPaths: [],
    anchorRects: [],
    sizes: [],
    hidden: [],
    columns: createColumnAssignments(),
    lastWrite: new Map(),
  };
}

export interface AnnotationOverlayProps {
  cell: CellId;
  target: AnnotationLayerTarget;
}

/**
 * The DOM half: both language lines per organelle, and the SVG ink.
 *
 * Bilingual order is the `i18n-content` contract — the active locale is the primary line
 * (uppercase via CSS) and the other locale follows at a smaller size. A locale swap changes which
 * `name` value each span shows **in place**: the nodes, their refs and the per-frame anchors are
 * untouched, which is why the swap cannot move an annotation.
 */
export function AnnotationOverlay({ cell, target }: AnnotationOverlayProps) {
  const locale = useAppStore((state) => state.locale);
  const hoveredId = useAppStore((state) => state.hoveredId);
  const quizActive = useAppStore((state) => state.quizActive);
  const paletteId = useAppStore((state) => state.paletteId);
  const roster = useMemo(() => rosterFor(cell), [cell]);
  const otherLocale: Locale = locale === 'es' ? 'en' : 'es';

  /**
   * The ink, resolved once per palette change (task 4.21).
   *
   * It is a render-time assignment of the palette's `label` role to one custom property, which is
   * why a palette swap restyles leaders, anchors and both language lines with no catalog edit and
   * no per-frame cost: the frame loop still writes only `transform`, `d` and `opacity`.
   */
  const inkStyle = useMemo(() => annotationInkStyleForId(paletteId), [paletteId]);

  // The hysteresis memory describes one roster's layout problem. A cell change is a new problem.
  useEffect(() => {
    target.columns.clear();
    target.lastWrite.clear();
  }, [cell, target]);

  /**
   * The label sizes, measured once per React render.
   *
   * Text is the only thing that changes a block's height, and text changes on a locale swap, so
   * measuring here and reading the cached numbers in the frame loop keeps layout reads out of the
   * per-frame path entirely.
   */
  useLayoutEffect(() => {
    target.sizes = roster.map((_record, index) => {
      const node = target.labels[index];

      if (!node) {
        return undefined;
      }

      return { width: node.offsetWidth, height: node.offsetHeight };
    });
  }, [roster, locale, target]);

  const assignLabel = useCallback(
    (index: number) => (element: HTMLDivElement | null) => {
      target.labels[index] = element;
    },
    [target],
  );
  const assignGroup = useCallback(
    (index: number) => (element: SVGGElement | null) => {
      target.leaderGroups[index] = element;
    },
    [target],
  );
  const assignPath = useCallback(
    (index: number) => (element: SVGPathElement | null) => {
      target.leaderPaths[index] = element;
    },
    [target],
  );
  const assignRect = useCallback(
    (index: number) => (element: SVGRectElement | null) => {
      target.anchorRects[index] = element;
    },
    [target],
  );

  // The blind condition suppresses the whole layer, not just its text: under a quiz prompt no
  // annotation is shown and none is emphasized (spec: Blind quiz condition still suppresses).
  if (quizActive) {
    return <div className="annotation-layer" data-annotations="suppressed" style={inkStyle} />;
  }

  return (
    <div
      className="annotation-layer"
      data-annotations="visible"
      data-annotation-ink-role="label"
      style={inkStyle}
    >
      <svg className="annotation-layer__leaders" aria-hidden="true">
        {roster.map((record, index) => (
          <g
            key={record.id}
            className="annotation-leader-group"
            data-annotation-ink={record.id}
            data-hovered={hoveredId === record.id}
            ref={assignGroup(index)}
          >
            <path className="annotation-leader" ref={assignPath(index)} />
            <rect
              className="annotation-anchor"
              data-annotation-anchor={record.id}
              width={ANCHOR_MARKER_SIZE}
              height={ANCHOR_MARKER_SIZE}
              ref={assignRect(index)}
            />
          </g>
        ))}
      </svg>

      <div className="annotation-layer__labels">
        {roster.map((record, index) => (
          <div
            key={record.id}
            className={hoveredId === record.id ? 'annotation annotation--hovered' : 'annotation'}
            data-annotation={record.id}
            ref={assignLabel(index)}
          >
            <span className="annotation__primary" data-annotation-line="primary">
              {record.name[locale]}
            </span>
            <span
              className="annotation__secondary"
              data-annotation-line="secondary"
              lang={otherLocale}
            >
              {record.name[otherLocale]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export interface AnnotationDriverProps {
  cell: CellId;
  target: AnnotationLayerTarget;
}

/**
 * The frame half: one `useFrame`, no rendering.
 *
 * Mounted **after** `DisassemblyDriver`, so within a frame the organelle positions have already
 * been written when the anchors are read (subscribers run in subscription order).
 */
export function AnnotationDriver({ cell, target }: AnnotationDriverProps) {
  const camera = useThree((state) => state.camera);
  const raycaster = useThree((state) => state.raycaster);
  const size = useThree((state) => state.size);
  const roster = useMemo(() => rosterFor(cell), [cell]);
  const scratch = useRef({
    world: new Vector3(),
    projected: new Vector3(),
    direction: new Vector3(),
  }).current;

  useEffect(() => {
    if (!useAppStore.getState().quizActive) {
      return;
    }

    // A suppressed layer must not leave a stale mirror behind for the harness to read.
    cellDebug.setAnnotations([]);
    target.lastWrite.clear();
  }, [target]);

  useFrame(() => {
    const store = useAppStore.getState();

    if (store.quizActive) {
      if (cellDebug.annotations.length > 0) {
        cellDebug.setAnnotations([]);
      }

      return;
    }

    const projections: AnnotationProjection[] = [];
    const occluded = new Map<string, boolean>();

    for (let index = 0; index < roster.length; index += 1) {
      const record = roster[index]!;
      const node = target.labels[index];

      if (!node) {
        continue;
      }

      const world = anchorWorldPosition(record.id, scratch.world);

      if (!world) {
        continue;
      }

      scratch.projected.copy(world).project(camera);

      // `z > 1` is behind the camera or past the far plane. An orbiting camera never produces it
      // (the camera distance exceeds the cell radius), and skipping keeps the layout from being
      // solved for a point that is not on screen if it ever happens.
      if (scratch.projected.z > 1) {
        continue;
      }

      const boxSize = target.sizes[index] ?? DEFAULT_ANNOTATION_BOX;

      projections.push({
        id: record.id,
        x: ((scratch.projected.x + 1) / 2) * size.width,
        y: ((1 - scratch.projected.y) / 2) * size.height,
        width: boxSize.width,
        height: boxSize.height,
      });
      occluded.set(record.id, isAnchorOccluded(camera, raycaster, record.id, world, scratch));
    }

    const solution = solveAnnotationLayout(
      projections,
      { width: size.width, height: size.height },
      target.columns,
    );
    const mirror: AnnotationMirrorEntry[] = [];
    let dirty = false;

    // A part that has left the frame has no attachment point: its annotation is hidden rather than
    // drawn to nowhere. Hiding keeps the node, so the hover contract ("no node is created or
    // removed") is unaffected and the refs stay stable.
    const laidOut = new Set(solution.layouts.map((layout) => layout.id));

    for (let index = 0; index < roster.length; index += 1) {
      const hidden = !laidOut.has(roster[index]!.id);
      const label = target.labels[index];
      const group = target.leaderGroups[index];

      if (label && group && target.hidden[index] !== hidden) {
        label.style.visibility = hidden ? 'hidden' : 'visible';
        group.style.visibility = hidden ? 'hidden' : 'visible';
        target.hidden[index] = hidden;
        dirty = true;
      }
    }

    for (let index = 0; index < solution.layouts.length; index += 1) {
      const layout = solution.layouts[index]!;
      const nodeIndex = roster.findIndex((record) => record.id === layout.id);

      if (nodeIndex < 0) {
        continue;
      }

      const isOccluded = occluded.get(layout.id) ?? false;
      // Occlusion and isolate de-emphasis make the same visual statement — "this is not the
      // annotation you are looking at" — so they share one ink opacity, floored at the ratified 50%.
      const inkOpacity =
        isOccluded || (store.selectedId !== null && store.selectedId !== layout.id)
          ? OCCLUDED_INK_OPACITY
          : 1;

      dirty = writeLayout(target, nodeIndex, layout, inkOpacity) || dirty;

      mirror.push({
        id: layout.id,
        column: layout.column,
        box: { ...layout.box },
        leader: layout.leader.map((point) => [point[0], point[1]]),
        anchor: [layout.anchor[0], layout.anchor[1]],
        opacity: inkOpacity,
        occluded: isOccluded,
        hovered: store.hoveredId === layout.id,
      });
    }

    // The harness reads the solver output from the debug bridge. It is rewritten only when the
    // render changed, so a settled fixture costs one mirror write rather than one per frame.
    if (dirty || cellDebug.annotations.length !== mirror.length) {
      cellDebug.setAnnotations(mirror);
    }
  });

  return null;
}

/**
 * Writes one layout to the DOM, skipping every value that has not changed.
 *
 * Returns true when anything was written, which is what gates the debug mirror.
 */
function writeLayout(
  target: AnnotationLayerTarget,
  index: number,
  layout: AnnotationLayout,
  inkOpacity: number,
): boolean {
  const label = target.labels[index];
  const group = target.leaderGroups[index];
  const path = target.leaderPaths[index];
  const anchorRect = target.anchorRects[index];

  if (!label || !group || !path || !anchorRect) {
    return false;
  }

  const leader = `M ${layout.leader.map((point) => `${round(point[0])} ${round(point[1])}`).join(' L ')}`;
  const anchorX = round(layout.anchor[0] - ANCHOR_MARKER_SIZE / 2);
  const anchorY = round(layout.anchor[1] - ANCHOR_MARKER_SIZE / 2);
  const previous = target.lastWrite.get(layout.id);

  if (previous === undefined) {
    label.style.transform = `translate3d(${round(layout.box.x)}px, ${round(layout.box.y)}px, 0)`;
    path.setAttribute('d', leader);
    anchorRect.setAttribute('x', String(anchorX));
    anchorRect.setAttribute('y', String(anchorY));
    group.style.opacity = String(inkOpacity);
    target.lastWrite.set(layout.id, {
      x: layout.box.x,
      y: layout.box.y,
      leader,
      inkOpacity,
      anchorX,
      anchorY,
    });

    return true;
  }

  let written = false;

  if (previous.x !== layout.box.x || previous.y !== layout.box.y) {
    label.style.transform = `translate3d(${round(layout.box.x)}px, ${round(layout.box.y)}px, 0)`;
    previous.x = layout.box.x;
    previous.y = layout.box.y;
    written = true;
  }

  if (previous.leader !== leader) {
    path.setAttribute('d', leader);
    previous.leader = leader;
    written = true;
  }

  if (previous.anchorX !== anchorX || previous.anchorY !== anchorY) {
    anchorRect.setAttribute('x', String(anchorX));
    anchorRect.setAttribute('y', String(anchorY));
    previous.anchorX = anchorX;
    previous.anchorY = anchorY;
    written = true;
  }

  if (previous.inkOpacity !== inkOpacity) {
    group.style.opacity = String(inkOpacity);
    previous.inkOpacity = inkOpacity;
    written = true;
  }

  return written;
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * One occlusion ray per anchor against the inner hit volumes (≤10 boxes, design D7's cost).
 *
 * The shared raycaster is borrowed and returned exactly as it was found: the pick controller owns
 * its `layers` and its `far`, and leaving either changed would silently truncate the next pick.
 */
function isAnchorOccluded(
  camera: Camera,
  raycaster: Raycaster,
  organelleId: string,
  world: Vector3,
  scratch: { direction: Vector3 },
): boolean {
  const distance = camera.position.distanceTo(world);

  if (!Number.isFinite(distance) || distance <= OCCLUSION_RAY_MARGIN) {
    return false;
  }

  const previousFar = raycaster.far;
  const previousMask = raycaster.layers.mask;

  scratch.direction.copy(world).sub(camera.position).divideScalar(distance);
  raycaster.far = distance - OCCLUSION_RAY_MARGIN;
  raycaster.layers.set(PICK_LAYER);
  raycaster.set(camera.position, scratch.direction);

  const hits = raycaster.intersectObjects(occluderObjects(organelleId), false);

  raycaster.far = previousFar;
  raycaster.layers.mask = previousMask;

  return hits.length > 0;
}
