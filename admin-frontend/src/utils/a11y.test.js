import { describe, expect, it, vi } from "vitest";
import { activateOnKey } from "./a11y";

function keyEvent(key, same = true) {
  const target = {};
  return { key, target, currentTarget: same ? target : {}, preventDefault: vi.fn() };
}

describe("activateOnKey", () => {
  it("runs the action on Enter and Space", () => {
    const action = vi.fn();
    const handler = activateOnKey(action);
    const enter = keyEvent("Enter");
    handler(enter);
    handler(keyEvent(" "));
    expect(action).toHaveBeenCalledTimes(2);
    expect(enter.preventDefault).toHaveBeenCalled();
  });

  it("ignores other keys and events from child elements", () => {
    const action = vi.fn();
    const handler = activateOnKey(action);
    handler(keyEvent("a"));
    handler(keyEvent("Enter", false));
    expect(action).not.toHaveBeenCalled();
  });
});
