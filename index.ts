/**
 * codetour — a pi extension that guides you through a codebase.
 *
 * The agent calls the `code_tour` tool with a list of stops (file + line +
 * explanation). The extension splits the terminal, opens an editor (nvim) in
 * the new pane, and shows you an interactive list; moving the cursor drives the
 * editor to the matching spot. `/codetour` re-opens the most recent tour.
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Key } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { EditorPane } from "./src/session.js";
import { runTourUI } from "./src/tour-ui.js";
import type { Tour, TourStop } from "./src/types.js";

/** Toggle between the tour list and the chat (Ctrl+Alt+T). */
const TOGGLE_KEY = Key.ctrlAlt("t");

const StopSchema = Type.Object({
  file: Type.String({ description: "File path, absolute or relative to the codebase root." }),
  line: Type.Number({ description: "1-based line the editor should land on." }),
  endLine: Type.Optional(
    Type.Number({ description: "Last line of a range to highlight, when relevant." }),
  ),
  label: Type.String({
    description: "Very short label for the list, e.g. 'entry point' or 'the reducer'.",
  }),
  detail: Type.String({
    description:
      "One short paragraph explaining what to look at here and why it matters to the question.",
  }),
});

const TourParams = Type.Object({
  title: Type.String({ description: "What question this tour answers, as a short title." }),
  overview: Type.Optional(
    Type.String({ description: "Optional one-paragraph overview shown above the list." }),
  ),
  stops: Type.Array(StopSchema, {
    minItems: 1,
    description: "Ordered stops that walk the user through the relevant code.",
  }),
});

/** The context note injected into each turn while a tour is active. */
function viewingContext(tour: Tour, index: number): string {
  const stop = tour.stops[index];
  if (!stop) return "";
  const range = stop.endLine ? `${stop.line}-${stop.endLine}` : String(stop.line);
  return [
    "[codetour] The user is viewing this code in the codetour editor pane and wants to",
    "discuss it. Answer their questions in the context of this exact location; read the",
    "file if you need more than the excerpt below.",
    "",
    `File: ${stop.file}:${range}`,
    `Tour: "${tour.title}" — stop ${index + 1}/${tour.stops.length}: ${stop.label}`,
    `About this stop: ${stop.detail}`,
    "",
    "They can press Ctrl+Alt+T to step back into the tour list.",
  ].join("\n");
}

function tourToText(tour: Tour): string {
  const lines = [`Code tour: ${tour.title}`];
  if (tour.overview) lines.push("", tour.overview);
  lines.push("");
  tour.stops.forEach((s, i) => {
    lines.push(`${i + 1}. ${s.label} — ${s.file}:${s.line}`);
    lines.push(`   ${s.detail}`);
  });
  return lines.join("\n");
}

export default function codetour(pi: ExtensionAPI) {
  // Session-scoped editor pane and the last tour shown, for /codetour.
  let pane: EditorPane | null = null;
  let lastTour: Tour | null = null;
  // The tour the user is currently browsing/chatting about, or null when none is
  // active. While set, each turn is told which stop they are viewing, and
  // Ctrl+Alt+T re-opens the list on `currentIndex`.
  let activeTour: Tour | null = null;
  let currentIndex = 0;
  // True while the tour list overlay owns the keyboard. The overlay handles its
  // own toggle key, so the global shortcut is a no-op then.
  let overlayOpen = false;

  pi.on("session_shutdown", () => {
    pane?.dispose();
    pane = null;
    activeTour = null;
  });

  const getPane = (ctx: ExtensionContext): EditorPane => {
    if (!pane) pane = new EditorPane({ dir: ctx.cwd });
    return pane;
  };

  /** Reflect the currently-viewed stop in the footer, or clear it. */
  const updateStatus = (ctx: ExtensionContext): void => {
    const stop: TourStop | undefined = activeTour?.stops[currentIndex];
    ctx.ui.setStatus("codetour", stop ? `\u{1F4CD} ${stop.file}:${stop.line}` : undefined);
  };

  /** Close the editor pane and forget the active tour. */
  const endTour = (ctx: ExtensionContext): void => {
    pane?.dispose();
    pane = null;
    activeTour = null;
    updateStatus(ctx);
  };

  /**
   * Open (or resume) the tour list overlay on `currentIndex`. Returns how the
   * user left it. Assumes `activeTour` is set.
   */
  async function openOverlay(ctx: ExtensionContext): Promise<"closed" | "chat" | "no-editor"> {
    const tour = activeTour;
    if (!tour) return "closed";
    const ready = await getPane(ctx).ensure();
    if (!ready) {
      ctx.ui.notify("codetour: could not open the editor pane.", "error");
      return "no-editor";
    }

    overlayOpen = true;
    const result = await runTourUI(ctx, getPane(ctx), tour, {
      startIndex: currentIndex,
      toggleKey: TOGGLE_KEY,
    });
    overlayOpen = false;
    if (result.lastIndex >= 0) currentIndex = result.lastIndex;
    updateStatus(ctx);
    return result.reason;
  }

  async function present(ctx: ExtensionContext, tour: Tour): Promise<string> {
    lastTour = tour;

    if (ctx.mode !== "tui" || !ctx.hasUI) {
      return `Guided tour is only interactive in the terminal UI. Stops:\n\n${tourToText(tour)}`;
    }
    if (!EditorPane.supported()) {
      ctx.ui.notify("codetour: no wezterm/tmux detected — showing stops inline.", "warning");
      return `No terminal multiplexer (wezterm/tmux) available to split, so no editor pane was opened. Present these stops to the user yourself:\n\n${tourToText(tour)}`;
    }

    activeTour = tour;
    currentIndex = 0;
    updateStatus(ctx);

    const reason = await openOverlay(ctx);
    if (reason === "no-editor") {
      endTour(ctx);
      return `Failed to open the editor pane. Present these stops to the user yourself:\n\n${tourToText(tour)}`;
    }

    if (reason === "chat") {
      // Tour stays alive; the user stepped into the chat to ask about a stop.
      const stop = tour.stops[currentIndex];
      return [
        `The user is browsing the "${tour.title}" tour and switched to the chat to ask about`,
        stop
          ? `stop ${currentIndex + 1}: ${stop.label} (${stop.file}:${stop.line}).`
          : "the code they are viewing.",
        "The editor pane stays open on that stop. Briefly acknowledge and invite their",
        "question about this code — do not re-explain it unprompted. Every message they send",
        "now carries the stop they are viewing as context. They can press Ctrl+Alt+T to",
        "return to the tour list.",
      ].join(" ");
    }

    // reason === "closed": they quit the tour; the pane is torn down.
    const ended = tour.stops[currentIndex];
    endTour(ctx);
    return [
      `The user browsed the "${tour.title}" tour (${tour.stops.length} stops) in the editor pane.`,
      ended
        ? `They ended on stop ${currentIndex + 1}: ${ended.label} (${ended.file}:${ended.line}).`
        : "",
      "Continue the conversation; ask if they want more detail on any stop.",
    ]
      .filter(Boolean)
      .join(" ");
  }

  pi.registerTool({
    name: "code_tour",
    label: "Code tour",
    description:
      "Guide the user through the codebase. Opens an editor beside the chat and shows an " +
      "interactive, selectable list of 'stops' (file + line + explanation); as the user moves " +
      "through the list the editor jumps to each spot. Use this instead of pasting long code " +
      "excerpts when explaining how something works. Provide a focused, ordered set of stops; " +
      "each `detail` should be one short paragraph tying that location to the user's question.",
    parameters: TourParams,
    annotations: { readOnlyHint: true, openWorldHint: false },
    execute: async (_toolCallId, params, _signal, _onUpdate, ctx) => {
      const tour = params as Tour;
      const text = await present(ctx, tour);
      return {
        content: [{ type: "text", text }],
        details: { title: tour.title, stops: tour.stops.length },
      };
    },
  });

  pi.registerCommand("codetour", {
    description: "Re-open the most recent code tour",
    handler: async (_args, ctx) => {
      if (!lastTour) {
        ctx.ui.notify("codetour: no tour yet — ask the agent to explain some code first.", "info");
        return;
      }
      await present(ctx, lastTour);
    },
  });

  // Ctrl+Alt+T toggles the tour list back on from the chat. (The overlay
  // handles the same key itself to toggle the other way, so this is a no-op
  // while the overlay is focused.)
  pi.registerShortcut(TOGGLE_KEY, {
    description: "codetour: toggle the tour list on/off",
    handler: async (ctx) => {
      if (overlayOpen) return;
      if (!activeTour) {
        ctx.ui.notify("codetour: no active tour. Ask the agent for a code tour first.", "info");
        return;
      }
      const reason = await openOverlay(ctx);
      if (reason === "closed" || reason === "no-editor") endTour(ctx);
    },
  });

  // While a tour is active, tell each turn which stop the user is viewing so the
  // agent can answer contextually. Invisible in the transcript (display: false).
  pi.on("before_agent_start", () => {
    if (!activeTour) return;
    const content = viewingContext(activeTour, currentIndex);
    if (!content) return;
    return { message: { customType: "codetour-context", content, display: false } };
  });
}
