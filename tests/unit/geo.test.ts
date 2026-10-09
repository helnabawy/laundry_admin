import { describe, expect, it } from "vitest";
import { parseLatLng } from "@/domain/geo";

describe("parseLatLng", () => {
  it("reads plain coordinates", () => {
    expect(parseLatLng("25.0772, 55.1393")).toEqual({ latitude: 25.0772, longitude: 55.1393 });
    expect(parseLatLng(" 25.0772 55.1393 ")).toEqual({ latitude: 25.0772, longitude: 55.1393 });
    expect(parseLatLng("-33.86,151.2")).toEqual({ latitude: -33.86, longitude: 151.2 });
  });

  it("reads Google Maps links, preferring the place pin over the viewport", () => {
    expect(
      parseLatLng("https://www.google.com/maps/place/X/@25.1,55.1,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d25.0772!4d55.1393"),
    ).toEqual({ latitude: 25.0772, longitude: 55.1393 });
    expect(parseLatLng("https://www.google.com/maps/@25.2048,55.2708,15z")).toEqual({ latitude: 25.2048, longitude: 55.2708 });
    expect(parseLatLng("https://maps.google.com/?q=25.2048,55.2708")).toEqual({ latitude: 25.2048, longitude: 55.2708 });
    expect(parseLatLng("https://www.google.com/maps/search/?api=1&query=25.2048%2C55.2708")).toEqual({
      latitude: 25.2048,
      longitude: 55.2708,
    });
  });

  it("rejects text without usable coordinates", () => {
    expect(parseLatLng("")).toBeNull();
    expect(parseLatLng("https://maps.app.goo.gl/abc123")).toBeNull();
    expect(parseLatLng("Dubai Marina")).toBeNull();
    expect(parseLatLng("95, 55")).toBeNull();
  });
});
