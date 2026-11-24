// Runs the browser QA suites one after another against a running app (default: the dev
// server on :5199). The offline suite needs a production build — see README.md.
import { spawnSync } from "node:child_process";
import { mkdirSync } from "node:fs";

const SUITES = [
  "receipt",
  "expenses",
  "events",
  "accounts",
  "settings",
  "roles",
  "club-creation",
  "qa-sweep",
  "lane-filter",
  "approvals",
  "audit",
];
const only = process.argv.slice(2);
const out = process.env.QA_OUT ?? ".qa-out";
mkdirSync(out, { recursive: true });

let failed = 0;
for (const name of only.length ? only : SUITES) {
  const r = spawnSync(process.execPath, [new URL(`./${name}.mjs`, import.meta.url).pathname, out], {
    encoding: "utf8",
    env: process.env,
  });
  const summary = (r.stdout.match(/\d+ passed, \d+ failed|distinct issues: \d+/g) ?? []).pop();
  const ok = r.status === 0 && !/distinct issues: [1-9]/.test(r.stdout);
  if (!ok) failed++;
  console.log(`${ok ? "✔" : "✘"} ${name.padEnd(14)} ${summary ?? r.stderr.split("\n")[0]}`);
  if (!ok)
    console.log(
      r.stdout
        .split("\n")
        .filter((l) => l.startsWith("✘"))
        .join("\n") || r.stderr,
    );
}
process.exit(failed ? 1 : 0);
