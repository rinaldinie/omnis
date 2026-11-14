import { describe, expect, it } from "vitest";
import { isSquareArt } from "./GameCardCover";

describe("isSquareArt", () => {
  it("treats square and near-square artwork as square", () => {
    expect(isSquareArt(256, 256)).toBe(true); // Nintendo Switch icon
    expect(isSquareArt(460, 430)).toBe(true);
  });

  it("keeps portrait covers and landscape banners on the default crop", () => {
    expect(isSquareArt(600, 900)).toBe(false); // Steam library capsule
    expect(isSquareArt(860, 1148)).toBe(false); // Epic Storefront_Portrait
    expect(isSquareArt(1280, 1440)).toBe(false); // Epic DieselGameBoxTall (8:9 portrait)
    expect(isSquareArt(460, 215)).toBe(false); // Steam header
    expect(isSquareArt(1920, 620)).toBe(false); // hero banner
  });

  it("ignores images without dimensions", () => {
    expect(isSquareArt(0, 0)).toBe(false);
    expect(isSquareArt(256, 0)).toBe(false);
  });
});
