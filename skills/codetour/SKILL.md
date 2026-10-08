---
name: codetour
description: Compose an effective guided code tour with the `code_tour` tool — an ordered set of stops (file + line + explanation) rendered beside the chat in an editor pane. Use when the user asks for an onboarding walkthrough, a PR review narration, a trace of a workflow or call chain, a bug investigation, a blast-radius/impact analysis, or "where does X live / how does X work" in a codebase.
version: 0.1.0
alwaysApply: false
---

# Composing a code tour

The `code_tour` tool shows the user an ordered list of **stops** next to the
chat and drives an editor to each `file:line` as they move through it. The user
can already see the code. Your job is the narrative they can't see: why this
spot matters to *their* question, and why the stops are in this order.

A tour is not a file listing with prose attached. It is a **path through the
code that answers one question** — that question is the `title`.

## The backbone (applies to every tour)

1. **Nail the question first.** Derive the one question the tour answers from the
   user's request and make it the `title`. If the request is genuinely
   ambiguous (which subsystem? which workflow? forward or reverse?), ask before
   building.
2. **Gather context before choosing stops.** Trace the *real* code — grep for
   callers, read the handlers, follow where the data actually goes. Don't infer
   structure from folder names. Pull the *why* from outside the repo when it
   matters and the tools exist (see below).
3. **Verify every anchor.** Open each file and land `line` on the spot that
   actually shows the thing — prefer a signature, a decision, or a call site
   over an arbitrary body line. Stale `file:line` is the main way a tour fails.
4. **Order as a narrative, not as file order.** The sequence should read like an
   explanation, each stop following from the last.
5. **Make each `detail` earn its place.** Tie the location back to the question —
   "why this matters here" — rather than restating what the code literally does.
6. **Right-size and stay flexible.** A focused answer is usually a handful of
   stops; a broad one is more. There is no required count, shape, or ordering —
   these recipes are starting points to blend, not rules to obey. The initial
   request wins.

## Use the tools and skills around you

Compose the tour with whatever helps you understand the code and its intent:

- **Local investigation** — grep / find-references / reading files to trace the
  actual call edges, callers, and data flow.
- **History and intent, if available** — `git log` / `git blame`, GitHub
  (PRs, linked issues), Notion / Linear (design docs, tickets) via their MCP
  tools. The code says *what*; these say *why*. Use them when they're present;
  skip gracefully when they're not.
- **Project skills, if present** — if the repository ships its own skills (e.g.
  architecture guides, domain glossaries, review checklists), read and follow
  them. They encode local conventions a generic tour would miss.

## Recipes

These are seeds to mix and match. Most real requests blend two or three. Pick
the flavor that fits the question, then adapt.

### Overview / onboarding — "help me get oriented"
Map the whole, breadth-first. Start at the real entry points (bin/`main`,
routes, the public surface in `index`, build config), then the core domain
model, then one representative end-to-end path, then the extension points.
Aim for a working mental model; resist diving deep on any single branch. A good
place to lean on a README or architecture doc.

### PR review — "explain how these changes serve the intent"
Seed from the diff. **Order stops by intent, not by file**: open on the stop
that states the goal, then the load-bearing change, then the supporting changes,
then tests as evidence. Each `detail` answers "how does this hunk serve the
stated intent?" Pull the PR description and linked issue so you can name that
intent — and call out any change that *doesn't* obviously map to it.

### Workflow — "trace this from one end to the other"
Seed from an entry point and the end state. Follow the forward call chain across
module boundaries; each stop is one hop — a call site or its handler — and the
`detail` says what gets transformed here and what's passed on. Confirm each next
hop by reading the code, not by guessing from names.

### Bug — "walk the chain, but focus on what breaks"
Same spine as a workflow, but every stop earns its place by its relation to the
fault: where bad input enters, where an assumption is made, where it actually
breaks, and where a fix would go. Seed from a symptom, a repro, or a stack
trace. The `detail` emphasizes invariants and where they're violated.

### Blast radius — "what else does changing X affect"
The reverse direction. Seed from the symbol or signature that would change, then
walk its dependents: callers, shared types, serialization or API boundaries,
config and feature flags, and the tests that pin current behavior. Each `detail`
says what breaks here if X changes, and how. This leans hardest on
find-references / grep.

### Concept — "where does X live / how does X work"
A cross-cutting concern (auth, caching, logging, a specific feature) rather than
a whole system. Blend breadth and depth: locate where the concept is defined,
then the few places it's wired in or enforced, then one path that exercises it.
The `detail` connects each scattered location back to the single concept.
