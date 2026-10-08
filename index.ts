/**
 * codetour — a pi extension that guides you through a codebase.
 *
 * The agent calls the `code_tour` tool with a list of stops (file + line +
 * explanation). The extension splits the terminal, opens an editor (nvim) in
 * the new pane, and shows you an interactive list; moving the cursor drives the
 * editor to the matching spot. `/codetour` re-opens the most recent tour.
 */
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { EditorPane } from "./src/session.js";
import { runTourUI } from "./src/tour-ui.js";
import type { Tour } from "./src/types.js";

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

  pi.on("session_shutdown", () => {
    pane?.dispose();
    pane = null;
  });

  const getPane = (ctx: ExtensionContext): EditorPane => {
    if (!pane) pane = new EditorPane({ dir: ctx.cwd });
    return pane;
  };

  async function present(ctx: ExtensionContext, tour: Tour): Promise<string> {
    lastTour = tour;

    if (ctx.mode !== "tui" || !ctx.hasUI) {
      return `Guided tour is only interactive in the terminal UI. Stops:\n\n${tourToText(tour)}`;
    }
    if (!EditorPane.supported()) {
      ctx.ui.notify("codetour: no wezterm/tmux detected — showing stops inline.", "warning");
      return `No terminal multiplexer (wezterm/tmux) available to split, so no editor pane was opened. Present these stops to the user yourself:\n\n${tourToText(tour)}`;
    }

    const ready = await getPane(ctx).ensure();
    if (!ready) {
      ctx.ui.notify("codetour: could not open the editor pane.", "error");
      return `Failed to open the editor pane. Present these stops to the user yourself:\n\n${tourToText(tour)}`;
    }

    const result = await runTourUI(ctx, getPane(ctx), tour);

    // Quitting the tour tears the editor pane down too; the next tour reopens it.
    pane?.dispose();
    pane = null;

    const ended = result.lastIndex >= 0 ? tour.stops[result.lastIndex] : undefined;
    return [
      `The user browsed the "${tour.title}" tour (${tour.stops.length} stops) in the editor pane.`,
      ended
        ? `They ended on stop ${result.lastIndex + 1}: ${ended.label} (${ended.file}:${ended.line}).`
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
}
