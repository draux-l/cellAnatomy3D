/**
 * The transient process transport (task 6.3).
 *
 * The scrub bar and the phase buttons live in the **app shell**; the timeline they have to move lives
 * in the **3D chunk**, inside an instance the driver owns. Neither may reach the other directly: a
 * static import of the timeline into a panel would pull three.js and GSAP out of the lazy chunk and
 * break the payload gate, and threading the timeline through React state would re-render the tree on
 * every pointer move — the classic R3F trap the project's Hard Rule forbids.
 *
 * So the two halves meet here, the same way the light slider meets its shader: a small transient
 * module with **no three.js and no React**. The UI writes a *request*; the driver consumes it once,
 * applies it to the running scripted timeline, and publishes back the playhead it actually has.
 *
 * Three properties matter and each is deliberate:
 *
 * 1. **A request is consumed exactly once.** A pending seek that stayed pending would re-apply the
 *    same time every frame and the timeline could never be played again.
 * 2. **The published value is the timeline's own.** The readout is a measurement of the animation, not
 *    of the control, so a paused process reports the phase it is actually holding.
 * 3. **Nothing here is per-frame state.** `scrubbing` is set on pointerdown/up, the requests are set
 *    on `input`/click, and the published pair is written once per frame by a plain property write.
 */

export interface TransportRequest {
  /** A progress target in `[0, 1]`, or null when this request is a label seek. */
  readonly progress: number | null;
  /** A timeline label to seek to, or null when this request is a progress scrub. */
  readonly label: string | null;
}

export interface ProcessTransport {
  /** The playhead the driver last published, in `[0, 1]`. */
  readonly progress: number;
  /** The label the running scripted timeline last reported, or null. */
  readonly label: string | null;
  /** True while a pointer is down on the scrub control, so the readout must not fight the drag. */
  readonly scrubbing: boolean;
  /** Requests a jump to a named phase. */
  seek(label: string): void;
  /** Requests a jump to a progress value in `[0, 1]`. */
  scrub(progress: number): void;
  setScrubbing(scrubbing: boolean): void;
  /** Takes the pending request, clearing it. Returns null when there is nothing to apply. */
  consume(): TransportRequest | null;
  /** Publishes the running timeline's own playhead and label. Called once per frame by the driver. */
  publish(progress: number, label: string | null): void;
  reset(): void;
}

export function createProcessTransport(): ProcessTransport {
  let pending: TransportRequest | null = null;
  let progress = 0;
  let label: string | null = null;
  let scrubbing = false;

  return {
    get progress() {
      return progress;
    },
    get label() {
      return label;
    },
    get scrubbing() {
      return scrubbing;
    },

    seek(nextLabel) {
      pending = { progress: null, label: nextLabel };
    },

    scrub(nextProgress) {
      const clamped = Number.isFinite(nextProgress) ? Math.min(1, Math.max(0, nextProgress)) : 0;

      pending = { progress: clamped, label: null };
    },

    setScrubbing(next) {
      scrubbing = next;
    },

    consume() {
      const request = pending;

      pending = null;

      return request;
    },

    publish(nextProgress, nextLabel) {
      progress = Number.isFinite(nextProgress) ? Math.min(1, Math.max(0, nextProgress)) : 0;
      label = nextLabel;
    },

    reset() {
      pending = null;
      progress = 0;
      label = null;
      scrubbing = false;
    },
  };
}

/** The one transport the app uses. Never React state, never in the store. */
export const processTransport = createProcessTransport();
