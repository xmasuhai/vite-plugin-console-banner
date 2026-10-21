import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { build } from "vite";
import type { HtmlTagDescriptor, IndexHtmlTransformResult, Plugin } from "vite";
import { describe, expect, it } from "vitest";
import { consoleBanner, type ConsoleBannerOptions } from "./index";

async function render(options?: ConsoleBannerOptions): Promise<string> {
  const plugin = consoleBanner(options) as Plugin & {
    buildStart: () => void | Promise<void>;
    transformIndexHtml: () => IndexHtmlTransformResult | Promise<IndexHtmlTransformResult>;
  };
  await plugin.buildStart();
  const result = await plugin.transformIndexHtml();
  const tag = (result as HtmlTagDescriptor[])[0];
  if (!tag || typeof tag.children !== "string") {
    throw new Error("missing injected script");
  }
  return tag.children;
}

function captureLogs(script: string): unknown[][] {
  const logs: unknown[][] = [];
  runInNewContext(script, {
    console: {
      log: (...args: unknown[]) => {
        logs.push(args);
      },
    },
  });
  return logs;
}

describe("consoleBanner", () => {
  it("loads figlet fonts case-insensitively and keeps the ANSI Shadow default", async () => {
    const defaults = captureLogs(await render());
    const shadow = captureLogs(await render({ font: "ANSI Shadow" }));
    const shadowLower = captureLogs(await render({ font: "ansi shadow" }));
    const big = captureLogs(await render({ font: "big" }));
    const bigCanonical = captureLogs(await render({ font: "Big" }));

    expect(defaults[0]?.[0]).toBe(shadow[0]?.[0]);
    expect(shadowLower[0]?.[0]).toBe(shadow[0]?.[0]);
    expect(big[0]?.[0]).toBe(bigCanonical[0]?.[0]);
    expect(big[0]?.[0]).not.toBe(shadow[0]?.[0]);
    expect(String(defaults[0]?.[0])).toContain("%c");
    expect(String(defaults[0]?.[1])).toContain("color: #476EE3");
    expect(defaults).toHaveLength(1);
  });

  it("throws for an unknown font instead of falling back", async () => {
    await expect(render({ font: "not-a-font" })).rejects.toThrow(
      '[vite-plugin-console-banner] 未知的 figlet 字体 "not-a-font"',
    );
  });

  it("prints badges, replaces ${year}, and keeps quotes executable", async () => {
    const year = String(new Date().getFullYear());
    const logs = captureLogs(
      await render({
        text: "Hi",
        color: "#ff00aa",
        badges: [
          {
            label: "徐帅${year}简历",
            url: "https://xmasuhai.xyz/it's",
            labelBg: "#111",
            urlBg: "#222",
          },
        ],
      }),
    );

    expect(String(logs[0]?.[1])).toContain("color: #ff00aa");
    expect(String(logs[1]?.[0])).toContain(`徐帅${year}简历`);
    expect(String(logs[1]?.[0])).toContain("https://xmasuhai.xyz/it's");
    expect(String(logs[1]?.[1])).toContain("background: #111");
    expect(String(logs[1]?.[2])).toContain("background: #222");
  });

  it("does not let badge text close the injected script tag", async () => {
    const script = await render({
      badges: [{ label: "</script><script>alert(1)", url: "https://example.com?a=1&b=2" }],
    });

    expect(script).not.toContain("</script>");
    const logs = captureLogs(script);
    expect(String(logs[1]?.[0])).toContain("</script><script>alert(1)");
  });

  it("injects the Big font banner into the built index.html", async () => {
    const root = await mkdtemp(join(tmpdir(), "vite-plugin-console-banner-"));
    try {
      await writeFile(
        join(root, "index.html"),
        "<!doctype html><html lang=\"zh-CN\"><head><title>t</title></head><body></body></html>",
      );
      await build({
        root,
        configFile: false,
        logLevel: "error",
        plugins: [
          consoleBanner({
            text: "xmasuhai",
            font: "big",
            badges: [{ label: "徐帅${year}简历", url: "https://xmasuhai.xyz/my-latest-resume/" }],
          }),
        ],
      });

      const html = await readFile(join(root, "dist", "index.html"), "utf8");
      const year = String(new Date().getFullYear());
      expect(html).toContain(`徐帅${year}简历`);
      expect(html).not.toContain("${year}");

      const script = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)]
        .map((match) => match[1] ?? "")
        .find((content) => content.includes("console.log"));
      expect(script).toBeTruthy();

      const built = captureLogs(script ?? "");
      const direct = captureLogs(await render({ text: "xmasuhai", font: "Big" }));
      expect(built[0]?.[0]).toBe(direct[0]?.[0]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
