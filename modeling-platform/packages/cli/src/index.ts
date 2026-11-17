import { run } from "./program";

/** modeling-cli — se `modeling-cli --help`. */
process.exitCode = await run(process.argv.slice(2));
