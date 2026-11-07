import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  hexForColorName,
  jewelleryColorNames,
  normalizeHex,
  normalizeJewelleryColors,
  shapeJewelleryColor,
} from "./jewellery-colors.js";

describe("jewellery-colors", () => {
  it("normalizes hex", () => {
    assert.equal(normalizeHex("c4a882"), "#C4A882");
    assert.equal(normalizeHex("#abc"), "#AABBCC");
    assert.equal(normalizeHex("nope"), "");
  });

  it("shapes preset and custom colours", () => {
    assert.deepEqual(shapeJewelleryColor("Yellow Gold"), {
      name: "Yellow Gold",
      hex: "#C5A028",
    });
    assert.equal(shapeJewelleryColor({ name: "Champagne", hex: "#E8D5A3" })?.hex, "#E8D5A3");
  });

  it("dedupes colour lists and exposes names", () => {
    const colors = normalizeJewelleryColors([
      "Yellow Gold",
      { name: "Yellow Gold", hex: "#C5A028" },
      { name: "Ruby", hex: "#9B111E" },
    ]);
    assert.equal(colors.length, 2);
    assert.deepEqual(jewelleryColorNames(colors), ["Yellow Gold", "Ruby"]);
    assert.equal(hexForColorName(colors, "ruby"), "#9B111E");
  });
});
