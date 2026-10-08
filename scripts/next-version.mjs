#!/usr/bin/env node
/**
 * Compute the next semver from the last git tag and the conventional commits
 * made since it:
 *
 *   - any commit with a breaking change (`type!:` or a `BREAKING CHANGE:`
 *     footer)        -> major bump
 *   - otherwise, any `feat` commit    -> minor bump
 *   - otherwise                        -> patch bump
 *
 * Prints the bare next version (e.g. `0.2.0`) to stdout. Pass `--apply` to run
 * `npm version <next>` (which creates the version commit and tag).
 *
 * Usage:
 *   node scripts/next-version.mjs          # print next version
 *   node scripts/next-version.mjs --apply  # bump + tag via npm version
 *
 * Note: this bumps breaking changes to a full major even before 1.0.0. Adjust
 * if you prefer the "0.x: breaking bumps minor" convention.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RECORD_SEP = "\x1e";

function git(args) {
  // Ignore stderr so expected failures (e.g. no tags yet) stay quiet.
  return execFileSync("git", args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }).trim();
}

/** Most recent `v*` tag reachable from HEAD, or null if there are none. */
function lastTag() {
  try {
    return git(["describe", "--tags", "--abbrev=0", "--match", "v*"]) || null;
  } catch {
    return null;
  }
}

/** Raw commit messages (subject + body) since `range`, newest first. */
function commitsSince(tag) {
  const range = tag ? `${tag}..HEAD` : "HEAD";
  const out = git(["log", range, `--format=%B${RECORD_SEP}`]);
  return out
    .split(RECORD_SEP)
    .map((m) => m.trim())
    .filter(Boolean);
}

/** Classify a conventional-commit message. */
function classify(message) {
  const subject = message.split("\n", 1)[0];
  const header = /^(\w+)(\([^)]*\))?(!)?:/.exec(subject);
  const type = header?.[1]?.toLowerCase();
  const bang = Boolean(header?.[3]);
  const breakingFooter = /^BREAKING[ -]CHANGE:/m.test(message);
  return { type, breaking: bang || breakingFooter };
}

function decideBump(commits) {
  let bump = "patch";
  for (const message of commits) {
    const { type, breaking } = classify(message);
    if (breaking) return "major";
    if (type === "feat") bump = "minor";
  }
  return bump;
}

function parseVersion(v) {
  const m = /^v?(\d+)\.(\d+)\.(\d+)/.exec(v);
  if (!m) throw new Error(`Cannot parse version: ${v}`);
  return { major: +m[1], minor: +m[2], patch: +m[3] };
}

function applyBump({ major, minor, patch }, bump) {
  if (bump === "major") return `${major + 1}.0.0`;
  if (bump === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function pkgVersion() {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  return JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
}

function main() {
  const apply = process.argv.includes("--apply");
  const tag = lastTag();
  // Base the bump on the tag when present, else on package.json.
  const base = tag ? tag : pkgVersion();
  const commits = commitsSince(tag);

  if (commits.length === 0) {
    console.error(`No commits since ${tag ?? "the start"}; nothing to release.`);
    process.stdout.write(
      `${parseVersion(base).major}.${parseVersion(base).minor}.${parseVersion(base).patch}\n`,
    );
    process.exit(0);
  }

  const bump = decideBump(commits);
  const next = applyBump(parseVersion(base), bump);

  console.error(
    `Last version: ${base} (${tag ? "tag" : "package.json"}) · ` +
      `${commits.length} commit(s) · ${bump} bump -> ${next}`,
  );

  if (apply) {
    // npm version creates the commit + tag using this exact version.
    execFileSync("npm", ["version", next, "-m", "chore(release): v%s"], { stdio: "inherit" });
  } else {
    process.stdout.write(`${next}\n`);
  }
}

main();
