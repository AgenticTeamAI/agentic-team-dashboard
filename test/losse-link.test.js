/* Dashboard v2 op een losse link: dashboard.agentic-team.ai/v2/.
 *
 * Zelfde origin als de huidige release (de instanties geven CORS aan precies
 * één origin); alleen de OAuth-terugkeer-URL verschilt. build.py --basis zet
 * die als meta, oauth-client.js leest hem. Zonder vlag verandert er niets. */
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { JSDOM } from "jsdom";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OAUTH = readFileSync(join(ROOT, "src/oauth-client.js"), "utf8");

function terugkeer(meta) {
  const dom = new JSDOM(`<!doctype html><head>${meta}</head><body><script>${OAUTH}</script></body>`, { runScripts: "dangerously", url: "https://dashboard.agentic-team.ai/v2/" });
  return dom.window.eval("OAUTH_REDIRECT_URI");
}

describe("losse link — de terugkeer-URL van de login", () => {
  it("zonder meta: precies zoals het was", () => {
    expect(terugkeer("")).toBe("https://dashboard.agentic-team.ai/");
  });

  it("met --basis /v2/: terug naar /v2/", () => {
    expect(terugkeer('<meta name="at-basis" content="/v2/">')).toBe("https://dashboard.agentic-team.ai/v2/");
  });

  it("een rare waarde wordt nooit een terugkeer-URL", () => {
    for (const w of ["/../", "//evil.example/", "/v2", "v2/", "/V2/"]) {
      expect(terugkeer(`<meta name="at-basis" content="${w}">`)).toBe("https://dashboard.agentic-team.ai/");
    }
  });

  it("de gewone build draagt geen basis-meta", () => {
    const html = readFileSync(join(ROOT, "dashboard.html"), "utf8");
    expect(html).not.toContain('<meta name="at-basis"');
  });

  it("build.py weigert een basis die geen /naam/ is", () => {
    expect(() => execFileSync("python3", ["scripts/build.py", "--basis", "/v2"], { cwd: ROOT, stdio: "pipe" })).toThrow(/--basis moet de vorm/);
  });
});
