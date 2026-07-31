import { describe, expect, it, vi } from "vitest";
import { createProgram } from "./program";

describe("workspace CLI program", () => {
  it("declares package commands without eagerly validating their environment", () => {
    const environment = vi.fn(() => {
      throw new Error(
        "environment should be resolved by commands that need it"
      );
    });

    const program = createProgram(environment);

    expect(program.commands.map((command) => command.name())).toEqual([
      "commerce",
    ]);

    const commerce = program.commands[0];
    expect(commerce?.commands.map((command) => command.name())).toEqual([
      "migrate",
      "schema",
      "types",
    ]);
    expect(
      commerce?.commands
        .find((command) => command.name() === "types")
        ?.commands.map((command) => command.name())
    ).toEqual(["generate"]);
    expect(environment).not.toHaveBeenCalled();
  });
});
