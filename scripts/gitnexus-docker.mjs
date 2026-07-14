import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import path from "node:path";

const image = "ecotraceit-gitnexus:1.6.3";
const registryVolume = "ecotraceit-gitnexus-registry";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const requested = process.argv.slice(2);

function run(command, args, stdio = "inherit") {
  return spawnSync(command, args, {cwd: repoRoot, stdio, shell: false});
}

if (run("docker", ["image", "inspect", image], "ignore").status !== 0) {
  const build = run("docker", ["build", "-f", "docker/gitnexus.Dockerfile", "-t", image, "."]);
  if (build.status !== 0) process.exit(build.status || 1);
}

const dockerArgs = [
  "run", "--rm",
  ...(requested[0] === "mcp" ? ["-i"] : []),
  "-e", "GIT_CONFIG_COUNT=2",
  "-e", "GIT_CONFIG_KEY_0=safe.directory",
  "-e", "GIT_CONFIG_VALUE_0=/workspace",
  "-e", "GIT_CONFIG_KEY_1=core.autocrlf",
  "-e", "GIT_CONFIG_VALUE_1=true",
  "-v", `${registryVolume}:/root/.gitnexus`,
  "-v", `${repoRoot}:/workspace`,
  image,
];

const result = run("docker", [...dockerArgs, ...requested]);
if (result.status !== 0) process.exit(result.status || 1);

// Analyze writes the graph in the repository; index registers its stable
// /workspace path in the named volume used by subsequent MCP sessions.
if (requested[0] === "analyze") {
  const register = run("docker", [...dockerArgs, "index", "/workspace"]);
  if (register.status !== 0) process.exit(register.status || 1);
}
