/**
 * Editor abstraction.
 *
 * An EditorDriver knows how to (1) produce the shell command that launches the
 * editor inside the split pane in a remotely-controllable way, (2) wait until
 * that editor is ready, and (3) jump to a file/line on demand. Only Neovim is
 * implemented today, but the interface keeps room for more editors.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export interface EditorDriver {
  /** Human-readable editor name. */
  readonly name: string;
  /** Shell command to launch the editor inside the split pane. */
  launchCommand(opts: { dir: string }): string;
  /** Resolve true once the editor accepts remote commands, or false on timeout. */
  waitReady(timeoutMs: number): Promise<boolean>;
  /** Jump to `file` at `line` (1-based); select through `endLine` when given. */
  goto(file: string, line: number, endLine?: number): void;
  /** Release any resources (sockets, temp files). Never throws. */
  dispose(): void;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Drives Neovim over a `--listen` socket. Works with any distro (LazyVim
 * included) because it talks to the running server rather than sending keys
 * through the multiplexer, so it is independent of the editor's current mode.
 */
export interface EditorDriverOptions {
  /** Open files read-only (this is a navigation pane, not an editing one). */
  readonly?: boolean;
}

export class NvimDriver implements EditorDriver {
  readonly name = "nvim";
  private readonly sock: string;
  private readonly readonly: boolean;

  constructor(opts: EditorDriverOptions = {}) {
    this.readonly = opts.readonly ?? true;
    this.sock = path.join(os.tmpdir(), `codetour-nvim-${process.pid}-${Date.now()}.sock`);
  }

  launchCommand(_opts: { dir: string }): string {
    // `-R` starts nvim in read-only mode; the socket is how goto reaches it.
    return `nvim ${this.readonly ? "-R " : ""}--listen ${this.sock}`;
  }

  async waitReady(timeoutMs: number): Promise<boolean> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (fs.existsSync(this.sock)) {
        // Socket file exists; give nvim a beat to start serving on it.
        try {
          this.expr("1");
          return true;
        } catch {
          /* not accepting yet */
        }
      }
      await sleep(100);
    }
    return false;
  }

  goto(file: string, line: number, endLine?: number): void {
    const abs = path.resolve(file);
    const safe = abs.replace(/ /g, "\\ ");
    // `:view` opens read-only; `:edit` otherwise. <C-\><C-n> forces normal mode
    // first so the Ex command always lands regardless of nvim's current mode.
    const open = this.readonly ? "view" : "edit";
    let keys = `<C-\\><C-n>:${open} +${Math.max(1, line)} ${safe}<CR>zz`;
    if (endLine && endLine > line) {
      // Visually select the range [line, endLine] then recenter on its start.
      const span = endLine - line;
      keys += `V${span}j${line}G<C-\\><C-n>zz`;
    }
    this.remoteSend(keys);
  }

  dispose(): void {
    try {
      fs.rmSync(this.sock, { force: true });
    } catch {
      /* best-effort */
    }
  }

  private remoteSend(keys: string): void {
    execFileSync("nvim", ["--server", this.sock, "--remote-send", keys], { stdio: "ignore" });
  }

  private expr(expr: string): string {
    return execFileSync("nvim", ["--server", this.sock, "--remote-expr", expr], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    });
  }
}

/** Resolve an editor driver by name. Defaults to nvim. */
export function createEditorDriver(name = "nvim", opts: EditorDriverOptions = {}): EditorDriver {
  switch (name) {
    case "nvim":
      return new NvimDriver(opts);
    default:
      throw new Error(`Unsupported editor: ${name}`);
  }
}
