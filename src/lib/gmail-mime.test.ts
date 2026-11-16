import { describe, expect, it } from "vitest";
import { attachmentsOf, bodyText, splitQuoted, buildMime, emailOf, emailsOf, encodeHeader, fromBase64Url, nameOf, newPart, toBase64Url } from "./gmail-mime";

const enc = (s: string) => Buffer.from(s).toString("base64").replace(/\+/g, "-").replace(/\//g, "_");

describe("gmail mime", () => {
  it("builds a multipart email with headers, both bodies and attachments", () => {
    const raw = buildMime({ from: '"Bbang Roofing" <jobs@bbang.com.au>', to: "ahmed@example.com", subject: "Your quote — 14 Banksia St", html: "<p>Hi Ahmed</p>", replyTo: "office@bbang.com.au", inReplyTo: "<abc@mail.gmail.com>", attachments: [{ filename: "Quote 1005.pdf", content: "JVBERi0=" }] }, "x");
    expect(raw).toContain("From: Bbang Roofing <jobs@bbang.com.au>");
    expect(raw).toContain("To: ahmed@example.com");
    expect(raw).toContain("Reply-To: office@bbang.com.au");
    expect(raw).toContain(`Subject: =?UTF-8?B?${Buffer.from("Your quote — 14 Banksia St").toString("base64")}?=`);
    expect(raw).toContain("In-Reply-To: <abc@mail.gmail.com>");
    expect(raw).toContain('Content-Type: application/pdf; name="Quote 1005.pdf"');
    expect(raw).toContain(Buffer.from("Hi Ahmed").toString("base64"));
    expect(raw.endsWith("--mixed_x--\r\n")).toBe(true);
    expect(fromBase64Url(toBase64Url(raw))).toBe(raw);
  });

  it("keeps plain headers plain and strips line breaks from them", () => {
    expect(encodeHeader("Quote ready")).toBe("Quote ready");
    expect(buildMime({ from: "a@b.c", to: "x@y.z\r\nBcc: evil@z.z", subject: "Hi\r\nBcc: evil@z.z", html: "" }, "y")).not.toMatch(/\r\nBcc:/);
  });

  it("reads addresses and names", () => {
    expect(emailOf('"Ahmed Khan" <Ahmed@Example.com>')).toBe("ahmed@example.com");
    expect(emailOf("ahmed@example.com")).toBe("ahmed@example.com");
    expect(emailsOf('"Khan, Ahmed" <a@x.com>, b@y.com')).toEqual(["a@x.com", "b@y.com"]);
    expect(nameOf('"Ahmed Khan" <a@x.com>')).toBe("Ahmed Khan");
  });

  it("prefers the plain text body and falls back to the html", () => {
    expect(bodyText({ mimeType: "multipart/alternative", parts: [{ mimeType: "text/plain", body: { data: enc("Hello there") } }, { mimeType: "text/html", body: { data: enc("<p>Hello</p>") } }] })).toBe("Hello there");
    expect(bodyText({ mimeType: "text/html", body: { data: enc("<p>Hi</p><p>Thanks &amp; bye</p>") } })).toBe("Hi\n Thanks & bye");
  });

  it("keeps only the new part of a reply", () => {
    expect(newPart("Yes Tuesday works.\n\nOn Mon, 10 Nov 2026 at 9:02 am, Bbang Roofing <jobs@bbang.com.au> wrote:\n> Does Tuesday suit?\n")).toBe("Yes Tuesday works.");
    expect(newPart("Sounds good\n\nFrom: Bbang Roofing\nSent: Monday\nSubject: Quote")).toBe("Sounds good");
    expect(newPart("> only quoted")).toBe("> only quoted");
  });

  it("splits what they wrote from the quoted email, and lists attachments with their ids", () => {
    const q = splitQuoted("Yes Tuesday works.\n\nCheers\n\nOn Mon, 10 Nov 2026 at 9:02 am, Bbang <jobs@b.com> wrote:\n> Does Tuesday suit?");
    expect(q.main).toBe("Yes Tuesday works.\n\nCheers");
    expect(q.quoted).toBe("On Mon, 10 Nov 2026 at 9:02 am, Bbang <jobs@b.com> wrote:\n> Does Tuesday suit?");
    expect(splitQuoted("Plain note").quoted).toBe("");
    expect(attachmentsOf({ mimeType: "multipart/mixed", parts: [{ mimeType: "text/plain", body: { data: "" } }, { mimeType: "image/jpeg", filename: "IMG_1.jpg", body: { attachmentId: "A1", size: 2100 } } as never] })).toEqual([{ name: "IMG_1.jpg", size: 2100, mime: "image/jpeg", id: "A1" }]);
  });
});
