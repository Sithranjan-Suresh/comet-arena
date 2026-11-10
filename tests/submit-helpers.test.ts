import { describe, expect, it } from "vitest";
import { captionFromPage, parsePage, visibleText } from "@/lib/submit/page";
import { sniffImage } from "@/lib/submit/sniff";

const bytes = (...b: number[]) => new Uint8Array([...b, ...new Array(16).fill(0)]);
const ascii = (s: string) => [...s].map((c) => c.charCodeAt(0));

describe("sniffImage", () => {
  it("identifies JPEG, PNG and HEIC/HEIF by their bytes", () => {
    expect(sniffImage(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("jpeg");
    expect(sniffImage(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("png");
    for (const brand of ["heic", "heix", "mif1", "heif"]) {
      expect(
        sniffImage(new Uint8Array([0, 0, 0, 24, ...ascii("ftyp"), ...ascii(brand), 0, 0, 0, 0])),
      ).toBe("heic");
    }
  });

  it("rejects everything else, whatever its filename or claimed type", () => {
    expect(sniffImage(new Uint8Array([...ascii("<html><script>")]))).toBeNull();
    expect(sniffImage(new Uint8Array([...ascii("GIF89a"), 0, 0, 0, 0, 0, 0]))).toBeNull();
    expect(
      sniffImage(new Uint8Array([0, 0, 0, 24, ...ascii("ftyp"), ...ascii("mp42"), 0, 0, 0, 0])),
    ).toBeNull(); // an MP4
    expect(sniffImage(new Uint8Array())).toBeNull();
    expect(sniffImage(bytes(0xff, 0xd8))).toBeNull(); // too short to be sure
  });
});

describe("parsePage", () => {
  const html = `<!doctype html><html><head>
    <title>Fallback &amp; Title</title>
    <meta property="og:title" content="AIS Fall Case Competition">
    <meta content="Teams of 3-4 &quot;solve&quot; a case. Register by Nov 20." property="og:description">
    <meta property="og:image" content="/img/flyer.png">
    <script>var secret = "do not read me";</script><style>.x{color:red}</style>
    </head><body><h1>Case Comp</h1><p>Finals Dec 5 at JSOM</p><!-- hidden --></body></html>`;

  it("reads Open Graph tags in either attribute order and resolves relative image URLs", () => {
    const p = parsePage(html, "https://example.com/events/1");
    expect(p.title).toBe("AIS Fall Case Competition");
    expect(p.description).toBe('Teams of 3-4 "solve" a case. Register by Nov 20.');
    expect(p.imageUrl).toBe("https://example.com/img/flyer.png");
  });

  it("falls back to <title> and meta description, and tolerates missing tags", () => {
    const p = parsePage(
      "<title>Just a Title</title><meta name='description' content='Plain desc'>",
      "https://x.example/",
    );
    expect(p).toMatchObject({ title: "Just a Title", description: "Plain desc", imageUrl: null });
    expect(parsePage("<p>nothing</p>", "https://x.example/")).toMatchObject({
      title: null,
      description: null,
      imageUrl: null,
    });
  });

  it("ignores an unparseable image URL", () => {
    expect(
      parsePage('<meta property="og:image" content="http://[bad">', "https://x.example/").imageUrl,
    ).toBeNull();
  });
});

describe("visibleText", () => {
  it("drops scripts, styles, comments and tags, decodes entities and collapses whitespace", () => {
    const t = visibleText(
      "<style>a{}</style><script>evil()</script><p>Hello &amp;   <b>world</b></p><!-- c -->",
    );
    expect(t).toBe("Hello & world");
  });
  it("caps very long pages", () => {
    expect(visibleText(`<p>${"word ".repeat(5000)}</p>`).length).toBeLessThanOrEqual(4000);
  });
});

describe("captionFromPage", () => {
  it("uses title + description, or title + body text when there is no description", () => {
    expect(captionFromPage({ title: "T", description: "D", imageUrl: null, text: "body" })).toBe(
      "T\nD",
    );
    expect(
      captionFromPage({ title: "T", description: null, imageUrl: null, text: "body text" }),
    ).toBe("T\nbody text");
    expect(captionFromPage({ title: null, description: null, imageUrl: null, text: "" })).toBe("");
  });
});
