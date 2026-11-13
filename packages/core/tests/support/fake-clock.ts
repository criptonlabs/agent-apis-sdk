import type { Clock } from "../../src/application/ports.js";

/** Settable clock; starts at the recording time of the fixture challenges (2026-11-12T18:14:23Z). */
export class FakeClock implements Clock {
  #nowMs: number;

  constructor(startMs: number = Date.parse("2026-11-12T18:14:23Z")) {
    this.#nowMs = startMs;
  }

  nowMs(): number {
    return this.#nowMs;
  }

  set(nowMs: number): void {
    this.#nowMs = nowMs;
  }

  advance(deltaMs: number): void {
    this.#nowMs += deltaMs;
  }
}
