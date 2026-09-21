import type { DbPurpose } from "./env-guard";

// Prisma commands that never open a database connection.
const OFFLINE_COMMANDS: ReadonlySet<string> = new Set([
  "generate",
  "validate",
  "format",
  "version",
  "help",
  "init",
  "debug",
]);

// Options that take a separate value, so the value is not mistaken for a command.
const VALUE_OPTIONS: ReadonlySet<string> = new Set(["--config", "--schema"]);

// Maps a Prisma CLI argv to the guard purpose it needs, or null when the
// command never touches a database. Anything not known to be offline or a
// plain `migrate deploy` is treated as destructive, so a new or unusual
// command is refused on prod instead of slipping through.
export function classifyPrismaCommand(argv: readonly string[]): DbPurpose | null {
  const args = argv.slice(2);
  if (args.some((arg) => arg === "--help" || arg === "-h")) return null;

  const positionals: string[] = [];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? "";
    if (VALUE_OPTIONS.has(arg)) {
      i++;
    } else if (!arg.startsWith("-")) {
      positionals.push(arg);
    } else if (arg === "--version" || arg === "-v") {
      return null;
    }
  }

  const [command, subcommand] = positionals;
  if (command === undefined || OFFLINE_COMMANDS.has(command)) return null;
  if (command === "migrate" && subcommand === "deploy") return "deploy";
  return "destructive";
}
