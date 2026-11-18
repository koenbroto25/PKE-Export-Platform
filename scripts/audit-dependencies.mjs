import { spawnSync } from "node:child_process";

const workspaces = [
  { name: "root", cwd: process.cwd() },
  { name: "frontend", cwd: new URL("../frontend/", import.meta.url).pathname },
];

for (const workspace of workspaces) {
  const result = spawnSync("npm", ["audit", "--json"], {
    cwd: workspace.cwd,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    timeout: 120_000,
    env: process.env,
  });

  let report;
  try {
    report = JSON.parse(result.stdout || "");
  } catch {
    console.log(JSON.stringify({
      type: "AUDIT_UNAVAILABLE",
      workspace: workspace.name,
      exitCode: result.status,
      error: result.error?.message || "npm audit did not return valid JSON",
      stderr: (result.stderr || "").slice(-1200),
    }));
    continue;
  }

  console.log(JSON.stringify({
    type: "AUDIT_SUMMARY",
    workspace: workspace.name,
    exitCode: result.status,
    counts: report.metadata?.vulnerabilities || null,
  }));

  for (const [name, item] of Object.entries(report.vulnerabilities || {})) {
    const advisories = (item.via || [])
      .filter((entry) => typeof entry === "object" && entry !== null)
      .map((entry) => ({
        title: entry.title,
        url: entry.url,
        range: entry.range,
      }));

    console.log(JSON.stringify({
      type: "AUDIT_PACKAGE",
      workspace: workspace.name,
      package: name,
      severity: item.severity,
      direct: item.isDirect,
      range: item.range,
      fixAvailable: item.fixAvailable,
      advisories,
    }));
  }
}
