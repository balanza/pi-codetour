/**
 * Ties the multiplexer and editor together into a single reusable "editor pane"
 * for the lifetime of a pi session. The pane is created lazily on the first
 * tour and reused afterwards; it is torn down on session shutdown.
 */
import {
  type Mux,
  closePane,
  detectMux,
  focusPane,
  isLandscape,
  openSplit,
  paneAlive,
  paneSize,
} from "./terminal.js";
import { type EditorDriver, createEditorDriver } from "./editor.js";

export interface EditorPaneOptions {
  /** Codebase root; the editor opens here. */
  dir: string;
  /** Editor name (currently only "nvim"). */
  editor?: string;
  /** Share of space the editor pane takes when first created (0..1). */
  fraction?: number;
  /** Open files read-only when the editor supports it. Default true. */
  readonly?: boolean;
}

export class EditorPane {
  private mux: Mux | null = null;
  private selfPaneId: string | null = null;
  private editorPaneId: string | null = null;
  private driver: EditorDriver | null = null;
  private readonly dir: string;
  private readonly editorName: string;
  private readonly fraction: number;
  private readonly readonly: boolean;

  constructor(opts: EditorPaneOptions) {
    this.dir = opts.dir;
    this.editorName = opts.editor ?? "nvim";
    this.fraction = opts.fraction ?? 0.5;
    this.readonly = opts.readonly ?? true;
  }

  /** True if the host terminal supports splitting at all. */
  static supported(): boolean {
    return detectMux() !== null;
  }

  get muxName(): Mux | null {
    return this.mux;
  }

  /**
   * Ensure a live editor pane exists, creating it if needed. Returns true if an
   * editor pane is ready to receive goto commands.
   */
  async ensure(): Promise<boolean> {
    if (this.editorPaneId && this.mux && paneAlive(this.mux, this.editorPaneId) && this.driver) {
      return true;
    }
    // Stale pane (user closed it) — reset before recreating.
    this.resetPane();

    const host = detectMux();
    if (!host) return false;
    this.mux = host.mux;
    this.selfPaneId = host.paneId;

    // Orient the split along the bigger physical dimension of the pi pane.
    const size = paneSize(host.mux, host.paneId);
    const sideBySide = size ? isLandscape(size) : true;

    this.driver = createEditorDriver(this.editorName, { readonly: this.readonly });
    const split = openSplit({
      mux: host.mux,
      fromPaneId: host.paneId,
      dir: this.dir,
      command: this.driver.launchCommand({ dir: this.dir }),
      sideBySide,
      fraction: this.fraction,
    });
    this.editorPaneId = split.paneId;

    const ready = await this.driver.waitReady(10_000);
    if (!ready) {
      this.dispose();
      return false;
    }
    // Keep keyboard focus on the pi pane so the user stays in the list.
    if (this.selfPaneId) focusPane(host.mux, this.selfPaneId);
    return true;
  }

  /** Point the editor at a file/line. No-op if the pane is not ready. */
  goto(file: string, line: number, endLine?: number): void {
    this.driver?.goto(file, line, endLine);
  }

  /** Move keyboard focus into the editor pane. */
  focusEditor(): void {
    if (this.mux && this.editorPaneId) focusPane(this.mux, this.editorPaneId);
  }

  /** Move keyboard focus back to the pi pane. */
  focusSelf(): void {
    if (this.mux && this.selfPaneId) focusPane(this.mux, this.selfPaneId);
  }

  private resetPane(): void {
    if (this.mux && this.editorPaneId && paneAlive(this.mux, this.editorPaneId)) {
      closePane(this.mux, this.editorPaneId);
    }
    this.driver?.dispose();
    this.driver = null;
    this.editorPaneId = null;
  }

  /** Close the pane and release resources. Idempotent. */
  dispose(): void {
    this.resetPane();
    this.mux = null;
    this.selfPaneId = null;
  }
}
