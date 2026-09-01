import { spawn } from "node:child_process";

const PORT_PLACEHOLDER = "{port}";
const MIN_PORT = 1;
const MAX_PORT = 65_535;
const SIGNALS = ["SIGINT", "SIGTERM"] as const;

const [fallbackPort, executable, ...rawArguments] = process.argv.slice(2);
const port = process.env.PORT ?? fallbackPort;

if (!(fallbackPort && executable && port)) {
  throw new Error(
    "Usage: run-with-port.ts <fallback-port> <executable> [...arguments with {port}]"
  );
}

const parsedPort = Number(port);
if (
  !Number.isInteger(parsedPort) ||
  parsedPort < MIN_PORT ||
  parsedPort > MAX_PORT
) {
  throw new Error(`Invalid development server port: ${port}`);
}

if (!rawArguments.includes(PORT_PLACEHOLDER)) {
  throw new Error(`Arguments must include the ${PORT_PLACEHOLDER} placeholder`);
}

const argumentsWithPort = rawArguments.map((argument) =>
  argument === PORT_PLACEHOLDER ? String(parsedPort) : argument
);
const packageManager = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
const child = spawn(
  packageManager,
  ["exec", executable, ...argumentsWithPort],
  {
    env: process.env,
    stdio: "inherit",
  }
);

for (const signal of SIGNALS) {
  process.on(signal, () => {
    child.kill(signal);
  });
}

child.on("error", (error) => {
  throw error;
});

child.on("exit", (code, signal) => {
  let signalExitCode = 1;

  if (signal === "SIGINT") {
    signalExitCode = 130;
  } else if (signal === "SIGTERM") {
    signalExitCode = 143;
  }

  process.exitCode = code ?? signalExitCode;
});
