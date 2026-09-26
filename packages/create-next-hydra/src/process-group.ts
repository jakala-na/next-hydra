import { Effect } from "effect";
import type { ChildProcessSpawner } from "effect/unstable/process";

// The Node process service creates a POSIX process group. Leader exit alone
// does not prove that lifecycle descendants have stopped writing.
export const groupExists = (pid: number) =>
  Effect.try(() => {
    try {
      process.kill(-pid, 0);
      return true;
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ESRCH") {
        return false;
      }
      throw error;
    }
  });

export const confirmStopped = (
  handle: ChildProcessSpawner.ChildProcessHandle
) =>
  Effect.gen(function* () {
    if (yield* groupExists(handle.pid)) {
      yield* handle.kill({ forceKillAfter: "100 millis" });
      while (yield* groupExists(handle.pid)) {
        yield* Effect.sleep("10 millis");
      }
    }
  }).pipe(Effect.interruptible, Effect.timeout("2 seconds"));
