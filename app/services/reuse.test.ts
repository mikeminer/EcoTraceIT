import {describe, expect, it} from "vitest";
import {nextReuseStatus} from "./reuse.server";

describe("reuse state machine", () => {
  it("traccia il ciclo completo", () => {
    expect(nextReuseStatus("AVAILABLE", "SHIP")).toBe("IN_CIRCULATION");
    expect(nextReuseStatus("IN_CIRCULATION", "REQUEST_RETURN")).toBe("RETURN_REQUESTED");
    expect(nextReuseStatus("RETURN_REQUESTED", "RECEIVE")).toBe("RETURNED");
    expect(nextReuseStatus("RETURNED", "INSPECT_PASS")).toBe("AVAILABLE");
  });
  it("blocca transizioni non valide", () => expect(() => nextReuseStatus("AVAILABLE", "RECEIVE")).toThrow());
});
