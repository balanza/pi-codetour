# pi-ext-codetour

A [pi](https://github.com/earendil-works/pi) extension that turns the agent into
a **guided code tour**: when you ask how something works, pi can open an editor
in a terminal split and point it at the exact file/line it is talking about,
while you browse an interactive list of the relevant spots.

## How it works

```
you ask a question
      │
      ▼
pi calls the `code_tour` tool with a list of "stops"
      │
      ▼
extension splits the terminal (wezterm → tmux) and launches an editor (nvim)
      │
      ▼
you get an interactive list of stops; moving the cursor drives the editor
```

- **Split**: the bigger dimension of the pi pane is split, so a wide terminal
  splits side-by-side and a tall terminal splits top/bottom.
- **Multiplexer**: WezTerm if available, otherwise tmux.
- **Editor**: Neovim (LazyVim), driven over a `--listen` socket and opened
  **read-only** (`-R` + `:view`) since this is a navigation pane. The editor
  layer is abstracted so more editors can be added later.
- **Lifecycle**: the editor pane is created on the first tour and **closed when
  you quit the tour**; the next tour reopens a fresh one.

## Usage

Load it directly during development:

```bash
pi --extension ~/pi-ext-codetour/index.ts
```

Then just ask the agent to explain part of the codebase. When it wants to show
you code it will open the tour. Navigate with `↑`/`↓` (the editor follows),
`enter` to focus the editor pane, `esc`/`q` to return to the chat (which also
closes the editor pane).

Re-open the most recent tour any time with `/codetour`.
