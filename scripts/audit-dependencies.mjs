import { spawnSync } from "node:child_process";

const workspaces = [
  { name: "root", cwd: process.cwd() },
  { name: "frontend", cwd: new URL("../frontend/", import.meta.url) },
];

let auditErrors = 0;
for (const workspace of workspaces) {
  const cwd = workspace.cwd instanceof URL ? workspace.cwd.pathname : workspace.cwd;
  const result = spawnSync("npm", ["audit", "--json"], {
    cwd,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
    timeout: 120_000,
    env: process.env,
  });

  let report;
  try {
    report = JSON.parse(result.stdout || "");
  } catch {
    auditErrors += 1;
    console.log(JSON.stringify({
      workspace: workspace.name,
      status: "AUDIT_UNAVAILABLE",
      exitCode: result.status,
      error: result.error?.message || "npm audit did not return valid JSON",
      stderr: (result.stderr || "").slice(-1500),
    }));
    continue;
  }

  const vulnerabilities = Object.entries(report.vulnerabilities || {}).map(([name, item]) => ({
    package: name,
    severity: item.severity,
    direct: item.isDirect,
    range: item.range,
    fixAvailable: item.fixAvailable,
    advisories: (item.via || [])
      .filter((entry) => typeof entry === "object" && entry !== null)
      .map((entry) => ({
        title: entry.title,
        url: entry.url,
        range: entry.range,
      })),
  }));

  console.log(JSON.stringify({
    workspace: workspace.name,
    status: "AUDIT_COMPLETE",
    exitCode: result.status,
    counts: report.metadata?.vulnerabilities || null,
    packages: vulnerabilities,
  }, null, 2));
}

if (auditErrors > 0) {
  console.log(`Dependency audit warning: ${auditErrors} workspace audit(s) did not complete. Build checks continue; investigate before Production release.`);
}
