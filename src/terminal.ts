/**
 * Terminal multiplexer layer.
 *
 * Creates a split pane in the active multiplexer and runs a command there, and
 * reports pane geometry so a caller can orient the split along the bigger
 * dimension. WezTerm is preferred; tmux is the fallback.
 *
 * Adapted from ~/pr-reviewer/src/terminal.ts.
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";

export type Mux = "wezterm" | "tmux";

export interface SplitResult {
  /** Which multiplexer created the pane. */
  mux: Mux;
  /** Pane id, used to address the pane later (resize, close, drive editor). */
  paneId: string;
}

export interface PaneSize {
  cols: number;
  rows: number;
  /** True pixel dimensions, when the multiplexer reports them. */
  pixelWidth?: number;
  pixelHeight?: number;
}

function weztermBin(): string {
  const app = "/Applications/WezTerm.app/Contents/MacOS/wezterm";
  return fs.existsSync(app) ? app : "wezterm";
}

/** The multiplexer the pi TUI is currently running inside, or null. */
export function detectMux(): { mux: Mux; paneId: string } | null {
  // Prefer WezTerm (richer split API) when we are inside it.
  if (process.env.WEZTERM_PANE) {
    return { mux: "wezterm", paneId: process.env.WEZTERM_PANE };
  }
  if (process.env.TMUX) {
    try {
      const id = execFileSync("tmux", ["display-message", "-p", "#{pane_id}"], {
        encoding: "utf8",
      }).trim();
      if (id) return { mux: "tmux", paneId: id };
    } catch {
      /* fall through */
    }
  }
  return null;
}

/**
 * Open a split pane next to `fromPaneId` and run `command` there.
 *
 * `sideBySide` true splits the width (panes left/right); false stacks them
 * (panes top/bottom). `fraction` is the share of space the NEW pane takes.
 */
export function openSplit(opts: {
  mux: Mux;
  fromPaneId: string;
  dir: string;
  command: string;
  sideBySide: boolean;
  fraction?: number;
}): SplitResult {
  const { mux, fromPaneId, dir, command, sideBySide } = opts;
  const percent = Math.round((opts.fraction ?? 0.5) * 100);

  if (mux === "wezterm") {
    const out = execFileSync(
      weztermBin(),
      [
        "cli",
        "split-pane",
        sideBySide ? "--right" : "--bottom",
        "--pane-id",
        fromPaneId,
        "--percent",
        String(percent),
        "--cwd",
        dir,
        "--",
        "/bin/sh",
        "-c",
        command,
      ],
      { encoding: "utf8" },
    );
    return { mux, paneId: out.trim() };
  }

  // tmux: -h = side-by-side, -v = stacked.
  const out = execFileSync(
    "tmux",
    [
      "split-window",
      sideBySide ? "-h" : "-v",
      "-t",
      fromPaneId,
      "-p",
      String(percent),
      "-P",
      "-F",
      "#{pane_id}",
      "-c",
      dir,
      command,
    ],
    { encoding: "utf8" },
  );
  return { mux, paneId: out.trim() };
}

/** Pane size in character cells (plus pixels for WezTerm), or null. */
export function paneSize(mux: Mux, paneId: string): PaneSize | null {
  try {
    if (mux === "tmux") {
      const out = execFileSync(
        "tmux",
        ["display-message", "-p", "-t", paneId, "#{pane_width} #{pane_height}"],
        { encoding: "utf8" },
      );
      const [c, r] = out.trim().split(/\s+/).map(Number);
      if (Number.isFinite(c) && Number.isFinite(r)) return { cols: c, rows: r };
      return null;
    }
    const out = execFileSync(weztermBin(), ["cli", "list", "--format", "json"], {
      encoding: "utf8",
    });
    const panes = JSON.parse(out) as Array<{
      pane_id: number;
      size?: { cols: number; rows: number; pixel_width?: number; pixel_height?: number };
    }>;
    const p = panes.find((x) => x.pane_id === Number(paneId));
    if (p?.size && Number.isFinite(p.size.cols) && Number.isFinite(p.size.rows)) {
      return {
        cols: p.size.cols,
        rows: p.size.rows,
        pixelWidth: Number.isFinite(p.size.pixel_width) ? p.size.pixel_width : undefined,
        pixelHeight: Number.isFinite(p.size.pixel_height) ? p.size.pixel_height : undefined,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/** True if the pane's physical width is larger than its physical height. */
export function isLandscape(size: PaneSize): boolean {
  if (size.pixelWidth && size.pixelHeight) {
    return size.pixelWidth >= size.pixelHeight;
  }
  // A text cell is roughly twice as tall as it is wide, so approximate the
  // physical aspect ratio from cells.
  return size.cols >= size.rows * 2;
}

/** Give a pane keyboard focus (best-effort). */
export function focusPane(mux: Mux, paneId: string): void {
  try {
    if (mux === "wezterm") {
      execFileSync(weztermBin(), ["cli", "activate-pane", "--pane-id", paneId], {
        stdio: "ignore",
      });
    } else {
      execFileSync("tmux", ["select-pane", "-t", paneId], { stdio: "ignore" });
    }
  } catch {
    /* best-effort */
  }
}

/** True if the pane still exists. */
export function paneAlive(mux: Mux, paneId: string): boolean {
  return paneSize(mux, paneId) !== null;
}

/** Close a pane by id (best-effort, never throws). */
export function closePane(mux: Mux, paneId: string): void {
  try {
    if (mux === "wezterm") {
      execFileSync(weztermBin(), ["cli", "kill-pane", "--pane-id", paneId], { stdio: "ignore" });
    } else {
      execFileSync("tmux", ["kill-pane", "-t", paneId], { stdio: "ignore" });
    }
  } catch {
    /* already gone */
  }
}
