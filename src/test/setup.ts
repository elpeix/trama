import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import { FakeAudioWorkletNode } from "./fakeAudioContext";

globalThis.AudioWorkletNode ??= FakeAudioWorkletNode as unknown as typeof AudioWorkletNode;

afterEach(cleanup);
