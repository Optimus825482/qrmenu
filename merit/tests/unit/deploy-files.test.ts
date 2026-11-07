import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const MERIT = path.resolve(__dirname, "../..");
const ROOT = path.resolve(MERIT, "..");
const DEPLOY = path.join(ROOT, "deploy");

const read = (p: string): string => readFileSync(path.join(DEPLOY, p), "utf8");
const scripts = readdirSync(path.join(DEPLOY, "scripts")).filter((f) => f.endsWith(".sh"));
const units = readdirSync(path.join(DEPLOY, "systemd"));

function envNames(text: string): Set<string> {
  const names = new Set<string>();
  for (const line of text.split("\n")) {
    const m = /^#?\s*([A-Z][A-Z0-9_]+)=/.exec(line);
    if (m) names.add(m[1]);
  }
  return names;
}

describe("deploy/nginx/merit.conf", () => {
  const conf = read("nginx/merit.conf");

  it("terminates HTTPS with HTTP/2 and redirects port 80", () => {
    expect(conf).toMatch(/listen 443 ssl http2;/);
    expect(conf).toMatch(/return 301 https:\/\//);
  });

  it("has an SSE location covering /api/sse and the guest events stream", () => {
    const m = /location ~ \^\/api\/\(sse\|q\/\[\^\/\]\+\/events\)\$ \{([^}]*)\}/.exec(conf);
    expect(m).not.toBeNull();
    const block = m![1];
    expect(block).toContain("proxy_buffering off;");
    expect(block).toMatch(/proxy_read_timeout 1h;/);
    expect(block).toContain("X-Accel-Buffering no");
  });

  it("overwrites X-Forwarded-For and sets X-Forwarded-Proto", () => {
    expect(conf).toContain("proxy_set_header X-Forwarded-For $remote_addr;");
    expect(conf).not.toContain("$proxy_add_x_forwarded_for;");
    expect(conf).toContain("proxy_set_header X-Forwarded-Proto $scheme;");
  });

  it("allows >= 3m uploads, caches static assets and sets security headers", () => {
    const sizes = [...conf.matchAll(/client_max_body_size (\d+)m;/g)].map((m) => Number(m[1]));
    expect(sizes.length).toBeGreaterThan(0);
    for (const s of sizes) expect(s).toBeGreaterThanOrEqual(3);
    expect(conf).toMatch(/location \/_next\/static\/ \{[^}]*immutable/);
    for (const h of ["Strict-Transport-Security", "X-Content-Type-Options", "X-Frame-Options", "Referrer-Policy"]) {
      expect(conf).toContain(h);
    }
  });
});

describe("deploy env files", () => {
  const prod = envNames(read("env.production.example"));

  it("env.production.example covers every variable of merit/.env.example", () => {
    const source = envNames(readFileSync(path.join(MERIT, ".env.example"), "utf8"));
    expect(source.size).toBeGreaterThan(10);
    const missing = [...source].filter((n) => !prod.has(n));
    expect(missing).toEqual([]);
  });

  it("mentions the optional demo/label variables", () => {
    for (const n of ["DEMO_PASSWORD", "ENV_LABEL", "SETTINGS_SECRET_KEY", "VAPID_PUBLIC_KEY", "PUSH_ENDPOINT_ALLOWLIST"]) {
      expect(prod.has(n)).toBe(true);
    }
  });

  it("holds placeholders only, no real-looking secrets", () => {
    const text = read("env.production.example") + read("gateway.env.example");
    for (const line of text.split("\n")) {
      const m = /^(?:SESSION_SECRET|QR_HMAC_SECRET|PRINT_GATEWAY_KEY|SEED_ADMIN_PASSWORD|GATEWAY_KEY)=(.*)$/.exec(line);
      if (m) expect(m[1]).toMatch(/^CHANGE_ME_/);
    }
    expect(read("env.production.example")).not.toMatch(/[A-Za-z0-9+/]{40,}={0,2}/);
  });

  it("gateway.env.example covers the print gateway variables", () => {
    const gw = envNames(read("gateway.env.example"));
    const src = envNames(readFileSync(path.join(MERIT, "tools/print-gateway/.env.example"), "utf8"));
    expect([...src].filter((n) => !gw.has(n))).toEqual([]);
  });
});

describe("deploy/scripts", () => {
  it("ships the expected scripts", () => {
    expect(scripts.sort()).toEqual(["backup.sh", "health.sh", "restore.sh", "update.sh"]);
  });

  it.each(scripts)("%s has a shebang, LF endings and strict mode", (name) => {
    const text = read(`scripts/${name}`);
    expect(text.startsWith("#!/usr/bin/env bash\n")).toBe(true);
    expect(text).not.toContain("\r");
    expect(text).toContain("set -euo pipefail");
  });

  it.each(scripts)("%s passes bash -n", (name) => {
    try {
      const scriptRel = path.relative(process.cwd(), path.join(DEPLOY, "scripts", name)).replace(/\\/g, "/");
      execFileSync("bash", ["-n", scriptRel], { stdio: "pipe" });
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") return; // no bash on this machine
      throw e;
    }
  }, 15000);

  it("backup.sh dumps custom format, archives uploads, prunes and keeps passwords off the command line", () => {
    const t = read("scripts/backup.sh");
    expect(t).toContain("pg_dump -Fc");
    expect(t).toMatch(/-mtime/);
    expect(t).toContain("merit-uploads-");
    // Parola komut satirina degil ortam degiskenine gider (argv /proc ile okunabilir, ortam okunamaz).
    expect(t).toContain("export PGPASSWORD=");
    expect(t).toMatch(/DB_URL="\$\{_scheme\}:\/\/\$\{_userinfo\}@/);
  });

  it("restore.sh refuses the production database without --force", () => {
    const t = read("scripts/restore.sh");
    expect(t).toContain("--force");
    expect(t).toContain("REDDEDILDI");
  });

  it("update.sh runs backup, pull, ci, migrate, build, restart, health in order", () => {
    const t = read("scripts/update.sh");
    const order = ["backup.sh", "git pull", "npm ci", "prisma migrate deploy", "npm run build", "systemctl restart", "health.sh"];
    let last = -1;
    for (const token of order) {
      const i = t.indexOf(token, last + 1);
      expect(i, token).toBeGreaterThan(last);
      last = i;
    }
    expect(t).toContain("git checkout $PREV");
  });
});

describe("deploy/systemd", () => {
  const get = (n: string): string => read(`systemd/${n}`);

  it("ships the expected units", () => {
    expect(units.sort()).toEqual([
      "merit-backup.service",
      "merit-backup.timer",
      "merit-egitim.service",
      "merit-gateway.service",
      "merit.service",
    ]);
  });

  it.each(["merit.service", "merit-egitim.service", "merit-gateway.service"])("%s restarts always as merit with an env file", (n) => {
    const t = get(n);
    expect(t).toContain("Restart=always");
    expect(t).toContain("User=merit");
    expect(t).toMatch(/^EnvironmentFile=\/etc\/merit\//m);
  });

  it("merit.service listens on 127.0.0.1:3000 and raises LimitNOFILE", () => {
    const t = get("merit.service");
    expect(t).toContain("-H 127.0.0.1");
    expect(t).toContain("PORT=3000");
    expect(t).toMatch(/LimitNOFILE=\d{5,}/);
    expect(t).toContain("TZ=Europe/Nicosia");
  });

  it("merit-egitim.service uses its own env file, port 3100 and label", () => {
    const t = get("merit-egitim.service");
    expect(t).toContain("EnvironmentFile=/etc/merit/merit-egitim.env");
    expect(t).toContain("PORT=3100");
    expect(t).toContain("ENV_LABEL=EĞİTİM");
    expect(t).toContain("-H 127.0.0.1");
  });

  it("nginx upstream ports match the units", () => {
    const conf = read("nginx/merit.conf");
    expect(conf).toContain("server 127.0.0.1:3000;");
    expect(conf).toContain("server 127.0.0.1:3100;");
  });

  it("gateway unit points at the existing print-gateway directory", () => {
    const t = get("merit-gateway.service");
    const wd = /^WorkingDirectory=\/opt\/merit\/(.+)$/m.exec(t)![1];
    expect(existsSync(path.join(ROOT, wd, "package.json"))).toBe(true);
    expect(t).toContain("EnvironmentFile=/etc/merit/gateway.env");
  });

  it("app units point at the merit app directory", () => {
    for (const n of ["merit.service", "merit-egitim.service"]) {
      const wd = /^WorkingDirectory=\/opt\/merit\/(.+)$/m.exec(get(n))![1];
      expect(existsSync(path.join(ROOT, wd, "package.json"))).toBe(true);
    }
  });

  it("backup timer is daily, persistent and triggers an existing script", () => {
    const timer = get("merit-backup.timer");
    expect(timer).toContain("OnCalendar=*-*-* 03:15");
    expect(timer).toContain("Persistent=true");
    expect(timer).toContain("Unit=merit-backup.service");
    const svc = get("merit-backup.service");
    const script = /^ExecStart=\/opt\/merit\/(.+)$/m.exec(svc)![1];
    expect(existsSync(path.join(ROOT, script))).toBe(true);
  });

  it("health endpoint used by scripts exists", () => {
    expect(read("scripts/health.sh")).toContain("/api/health");
    expect(existsSync(path.join(MERIT, "src/app/api/health/route.ts"))).toBe(true);
  });
});
