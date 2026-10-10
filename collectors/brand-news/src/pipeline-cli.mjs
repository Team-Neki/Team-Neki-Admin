import { parseArgs } from "node:util";
import { runPipeline } from "./pipeline.mjs";

try {
  const { values } = parseArgs({ options: {
    state: { type: "string", default: "data/state.json" },
    artifacts: { type: "string", default: "data/artifacts" },
    offline: { type: "boolean", default: false },
    force: { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  } });
  if (values.help) process.stdout.write("npm run pipeline -- [--state path] [--artifacts directory] [--offline | --force]\n");
  else {
    if (values.offline && values.force) throw new Error("--offline and --force cannot be used together");
    const result = await runPipeline({ stateFile: values.state, outputDir: values.artifacts, offline: values.offline, force: values.force });
    process.stdout.write(`${JSON.stringify({ directory: result.directory, passed: result.passed, counts: result.quality.counts, checks: result.quality.checks, mode: result.run.mode, requestedSources: result.run.requestedSources, failures: result.run.failures }, null, 2)}\n`);
    if (!result.passed) process.exitCode = 1;
  }
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
