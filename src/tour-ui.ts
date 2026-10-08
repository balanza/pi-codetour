/**
 * The interactive tour list shown inside pi. It renders the stops as a
 * selectable list; moving the cursor drives the editor pane to the matching
 * file/line. Enter focuses the editor pane, esc/q returns to the chat.
 */
import { type ExtensionContext, DynamicBorder } from "@earendil-works/pi-coding-agent";
import {
  Container,
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
  /** How the user left the tour. */
  reason: "closed" | "no-editor";
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
): Promise<TourUIResult> {
  const items = tour.stops.map(stopItem);
  let lastIndex = -1;

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
    container.addChild(
      new Text(theme.fg("dim", " ↑↓ browse · enter focus editor · esc/q back to chat")),
    );
    container.addChild(new DynamicBorder((s) => theme.fg("accent", s)));

    // Drive the first stop immediately.
    drive(0);

    let lastWidth = 80;
    renderDetail(0, lastWidth);

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
