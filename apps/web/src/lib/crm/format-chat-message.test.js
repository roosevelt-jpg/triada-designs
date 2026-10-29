/**
 * Run: node --test src/lib/crm/format-chat-message.test.js
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatChatMessageBody } from "./format-chat-message.js";

describe("formatChatMessageBody", () => {
  it("adds spaces after commas and sentence punctuation", () => {
    assert.equal(
      formatChatMessageBody("Hi,I'm Maya.Thanks!Please reply."),
      "Hi, I'm Maya. Thanks! Please reply.",
    );
  });

  it("collapses stuck spaces and trims", () => {
    assert.equal(
      formatChatMessageBody("  Hello   world  "),
      "Hello world",
    );
  });

  it("preserves paragraph breaks and collapses excess blanks", () => {
    assert.equal(
      formatChatMessageBody("Line one.\n\n\n\nLine two."),
      "Line one.\n\nLine two.",
    );
  });

  it("is idempotent", () => {
    const once = formatChatMessageBody("Hi,world.Thanks!");
    assert.equal(formatChatMessageBody(once), once);
  });

  it("does not break URLs or emails", () => {
    const raw =
      "See https://triada-designs.com/shop and write info@triada-designs.com please.";
    assert.equal(formatChatMessageBody(raw), raw);
  });

  it("paragraphizes long single-line multi-sentence blobs", () => {
    const raw =
      "Warm greetings from Triada Designs. We received your note about the gold ring sizing and we are happy to help you choose the right fit for your piece today. Please share your preferred size and we will confirm availability.";
    const out = formatChatMessageBody(raw);
    assert.match(out, /\n\n/);
    assert.match(out, /Warm greetings from Triada Designs\./);
  });

  it("returns empty string for empty input", () => {
    assert.equal(formatChatMessageBody(""), "");
    assert.equal(formatChatMessageBody(null), "");
  });
});
