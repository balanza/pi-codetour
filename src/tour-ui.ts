/**
 * The interactive tour list shown inside pi. It renders the stops as a
 * selectable list; moving the cursor drives the editor pane to the matching
 * file/line. Enter focuses the editor pane, esc/q returns to the chat (and
 * closes the tour), and the toggle key steps back to the chat while keeping the
 * tour alive so you can ask about the code you are viewing.
 */
import { DynamicBorder, type ExtensionContext } from "@earendil-works/pi-coding-agent";
import {
  Container,
  type KeyId,
  type SelectItem,
  SelectList,
  Text,
  matchesKey,
  wrapTextWithAnsi,
} from "@earendil-works/pi-tui";
import type { EditorPane } from "./session.js";
import type { Tour, TourStop } from "./types.js";

/** Result of running the tour UI. */
export interface TourUIResult {
  /** Index the user last looked at, or -1 if none. */
  lastIndex: number;
  /**
   * How the user left the tour:
   * - "closed": they quit (esc/q) — the caller tears the tour down.
   * - "chat": they toggled back to the chat — the caller keeps the tour alive.
   */
  reason: "closed" | "chat" | "no-editor";
}

/** Options controlling how the tour UI opens and how to leave it. */
export interface TourUIOptions {
  /** Stop to land on when the list opens. Defaults to 0. */
  startIndex?: number;
  /** Key that toggles back to the chat without closing the tour. */
  toggleKey?: KeyId;
}

function stopItem(stop: TourStop, index: number): SelectItem {
  const loc = `${stop.file}:${stop.line}`;
  return {
    value: String(index),
    label: `${index + 1}. ${stop.label}`,
    description: loc,
  };
}

/**
 * Show the tour list and block until the user leaves it. Each cursor move
 * sends the corresponding stop to `pane`.
 */
export async function runTourUI(
  ctx: ExtensionContext,
  pane: EditorPane,
  tour: Tour,
  options: TourUIOptions = {},
): Promise<TourUIResult> {
  const items = tour.stops.map(stopItem);
  const startIndex = Math.min(Math.max(0, options.startIndex ?? 0), tour.stops.length - 1);
  const toggleKey = options.toggleKey;
  let lastIndex = startIndex;

  const drive = (index: number) => {
    const stop = tour.stops[index];
    if (!stop) return;
    lastIndex = index;
    pane.goto(stop.file, stop.line, stop.endLine);
  };

  const result = await ctx.ui.custom<TourUIResult>((tui, theme, _kb, done) => {
    const container = new Container();
    container.addChild(new DynamicBorder((s) => theme.fg("accent", s)));
    container.addChild(new Text(theme.fg("accent", theme.bold(` Code tour — ${tour.title}`))));

    // Overview paragraph (wrapped), when provided.
    const overview = new Text("");
    container.addChild(overview);

    const list = new SelectList(items, Math.min(items.length, 12), {
      selectedPrefix: (t) => theme.fg("accent", t),
      selectedText: (t) => theme.fg("accent", t),
      description: (t) => theme.fg("muted", t),
      scrollInfo: (t) => theme.fg("dim", t),
      noMatch: (t) => theme.fg("warning", t),
    });

    // Per-stop detail shown below the list, kept in sync with the cursor.
    const detail = new Text("");
    const renderDetail = (index: number, width: number) => {
      const stop = tour.stops[index];
      if (!stop) {
        detail.setText("");
        return;
      }
      const head = theme.fg("accent", `${stop.file}:${stop.line}`);
      const body = wrapTextWithAnsi(stop.detail, Math.max(10, width - 2))
        .map((l) => theme.fg("text", l))
        .join("\n");
      detail.setText(`${head}\n${body}`);
    };

    list.onSelectionChange = (item) => {
      const index = Number(item.value);
      drive(index);
      renderDetail(index, lastWidth);
      container.invalidate();
      tui.requestRender();
    };
    // Enter: jump there and hand keyboard focus to the editor.
    list.onSelect = (item) => {
      drive(Number(item.value));
      pane.focusEditor();
      tui.requestRender();
    };
    list.onCancel = () => done({ lastIndex, reason: "closed" });

    container.addChild(list);
    container.addChild(detail);
    const toggleHint = toggleKey ? " · ctrl+alt+t chat" : "";
    container.addChild(
      new Text(theme.fg("dim", ` ↑↓ browse · enter focus editor${toggleHint} · esc/q close tour`)),
    );
    container.addChild(new DynamicBorder((s) => theme.fg("accent", s)));

    // Resume on the requested stop (first stop by default).
    list.setSelectedIndex(startIndex);
    drive(startIndex);

    let lastWidth = 80;
    renderDetail(startIndex, lastWidth);

    return {
      render(width: number) {
        lastWidth = width;
        if (tour.overview) {
          overview.setText(
            wrapTextWithAnsi(tour.overview, Math.max(10, width - 2))
              .map((l) => theme.fg("muted", l))
              .join("\n"),
          );
        } else {
          overview.setText("");
        }
        return container.render(width);
      },
      invalidate() {
        container.invalidate();
      },
      handleInput(data: string) {
        if (toggleKey && matchesKey(data, toggleKey)) {
          done({ lastIndex, reason: "chat" });
          return;
        }
        if (matchesKey(data, "q")) {
          done({ lastIndex, reason: "closed" });
          return;
        }
        list.handleInput(data);
        tui.requestRender();
      },
    };
  });

  // Keep the cursor back in the chat after the tour closes.
  pane.focusSelf();
  return result;
}
