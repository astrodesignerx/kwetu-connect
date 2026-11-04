import { describe, expect, it } from "vitest";
import { checkFile, checkLength, checkLight, checkShape, checkSound, lightOf, mp4HasSound } from "./advert-checks";

describe("advert checks", () => {
  it("file type and size", () => {
    expect(checkFile({ type: "video/mp4", size: 5 * 1024 * 1024 }).state).toBe("pass");
    expect(checkFile({ type: "image/gif", size: 1000 }).state).toBe("fail");
    expect(checkFile({ type: "video/mp4", size: 51 * 1024 * 1024 }).state).toBe("fail");
  });
  it("shape and resolution", () => {
    expect(checkShape(1920, 1080).state).toBe("pass");
    expect(checkShape(768, 432).state).toBe("pass");
    expect(checkShape(1080, 1080).state).toBe("fail");
    expect(checkShape(640, 360).state).toBe("warn");
    expect(checkShape(7680, 4320).state).toBe("warn");
  });
  it("length matches the booked play length within half a second", () => {
    expect(checkLength("video", 10.3, 10).state).toBe("pass");
    expect(checkLength("video", 12, 10).state).toBe("fail");
    expect(checkLength("image", null, 15).state).toBe("pass");
  });
  it("brightness, contrast and sound", () => {
    expect(checkLight(0.05, 0.3).state).toBe("warn");
    expect(checkLight(0.5, 0.05).state).toBe("warn");
    expect(checkLight(0.45, 0.25).state).toBe("pass");
    expect(checkSound("video", true).state).toBe("warn");
    expect(checkSound("image", null).state).toBe("pass");
  });
  it("measures light from pixels", () => {
    const black = { data: new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255]) } as ImageData;
    const light = lightOf([black])!;
    expect(light.brightness).toBeCloseTo(0.5);
    expect(light.contrast).toBeCloseTo(0.5);
  });
  it("finds a sound track in an MP4 header", () => {
    const box = (handler: string) => new Uint8Array([0, 0, 0, 33, ...new TextEncoder().encode("hdlr"), 0, 0, 0, 0, 0, 0, 0, 0, ...new TextEncoder().encode(handler), 0, 0, 0, 0]);
    expect(mp4HasSound(box("soun"))).toBe(true);
    expect(mp4HasSound(box("vide"))).toBe(false);
  });
});
