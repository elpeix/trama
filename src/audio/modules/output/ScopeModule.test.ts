import { describe, expect, it } from "vitest";
import { FakeAudioContext } from "../../../test/fakeAudioContext";
import { ScopeModule } from "./ScopeModule";

describe("ScopeModule", () => {
  it("opens a separate stereo analyser with a long buffer for each connection", () => {
    const context = new FakeAudioContext();
    const scope = new ScopeModule(context.asAudioContext());

    const first = scope.openInput("audio", "a");
    const second = scope.openInput("control", "b");

    expect([first, second]).toEqual([context.gains[0], context.gains[1]]);
    expect(context.analysers).toHaveLength(4);
    expect(context.analysers.every((analyser) => analyser.fftSize === 32768)).toBe(true);
    expect(scope.getProbe("a")).toEqual({ left: context.analysers[0], right: context.analysers[1] });
    expect(scope.getProbe("b")).toEqual({ left: context.analysers[2], right: context.analysers[3] });
    expect(scope.getAudioInput()).toBeUndefined();
    expect(scope.getAudioOutput()).toBeUndefined();
  });

  it("forgets a closed connection", () => {
    const scope = new ScopeModule(new FakeAudioContext().asAudioContext());
    scope.openInput("audio", "a");

    scope.closeInput("a");

    expect(scope.getProbe("a")).toBeUndefined();
  });

  it("only opens its own ports", () => {
    const scope = new ScopeModule(new FakeAudioContext().asAudioContext());

    expect(scope.openInput("gain", "a")).toBeUndefined();
  });

  it("accepts its display params and rejects others", () => {
    const scope = new ScopeModule(new FakeAudioContext().asAudioContext());

    expect(() => scope.setParameter("time")).not.toThrow();
    expect(() => scope.setParameter("range")).not.toThrow();
    expect(() => scope.setParameter("gain")).toThrow(/Scope/);
  });
});
