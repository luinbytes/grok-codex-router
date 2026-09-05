import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const MAX_SYSTEM_SKILLS_ENTRIES = 128;
const MAX_SYSTEM_SKILL_FILE_BYTES = 512 * 1024;
const MAX_SYSTEM_SKILLS_BYTES = 16 * 1024 * 1024;
const SYSTEM_SKILLS_DIRECTORY_MODE = 0o755;
const SYSTEM_SKILLS_FILE_MODE = 0o644;
const SYSTEM_SKILLS_MARKER = ".codex-system-skills.marker";

export const CODEX_SYSTEM_SKILLS_DIRECTORIES = Object.freeze([
  "imagegen",
  "imagegen/agents",
  "imagegen/assets",
  "imagegen/references",
  "imagegen/scripts",
  "openai-docs",
  "openai-docs/agents",
  "openai-docs/assets",
  "openai-docs/references",
  "openai-docs/scripts",
  "plugin-creator",
  "plugin-creator/agents",
  "plugin-creator/assets",
  "plugin-creator/references",
  "plugin-creator/scripts",
  "review-agent",
  "review-agent/agents",
  "skill-creator",
  "skill-creator/agents",
  "skill-creator/assets",
  "skill-creator/references",
  "skill-creator/scripts",
  "skill-installer",
  "skill-installer/agents",
  "skill-installer/assets",
  "skill-installer/scripts"
]);

export const CODEX_SYSTEM_SKILLS_FILES = [
  SYSTEM_SKILLS_MARKER,
  "imagegen/LICENSE.txt",
  "imagegen/SKILL.md",
  "imagegen/agents/openai.yaml",
  "imagegen/assets/imagegen-small.svg",
  "imagegen/assets/imagegen.png",
  "imagegen/references/cli.md",
  "imagegen/references/codex-network.md",
  "imagegen/references/image-api.md",
  "imagegen/references/prompting.md",
  "imagegen/references/sample-prompts.md",
  "imagegen/scripts/image_gen.py",
  "imagegen/scripts/remove_chroma_key.py",
  "openai-docs/LICENSE.txt",
  "openai-docs/SKILL.md",
  "openai-docs/agents/openai.yaml",
  "openai-docs/assets/openai-small.svg",
  "openai-docs/assets/openai.png",
  "openai-docs/references/codex-self-knowledge.md",
  "openai-docs/references/latest-model.md",
  "openai-docs/references/mcp-diagnostics.md",
  "openai-docs/references/model-migration.md",
  "openai-docs/references/model-selection.md",
  "openai-docs/references/official-docs.md",
  "openai-docs/references/prompting-guide.md",
  "openai-docs/references/upgrade-guide.md",
  "openai-docs/references/upgrading-to-gpt-5p6-sol.md",
  "openai-docs/scripts/fetch-codex-manual.mjs",
  "openai-docs/scripts/resolve-latest-model-info",
  "openai-docs/scripts/resolve-latest-model-info.cjs",
  "plugin-creator/SKILL.md",
  "plugin-creator/agents/openai.yaml",
  "plugin-creator/assets/plugin-creator-small.svg",
  "plugin-creator/assets/plugin-creator.png",
  "plugin-creator/references/installing-and-updating.md",
  "plugin-creator/references/plugin-json-spec.md",
  "plugin-creator/scripts/create_basic_plugin.py",
  "plugin-creator/scripts/identifier_validation.py",
  "plugin-creator/scripts/read_marketplace_name.py",
  "plugin-creator/scripts/update_plugin_cachebuster.py",
  "plugin-creator/scripts/validate_plugin.py",
  "review-agent/SKILL.md",
  "review-agent/agents/openai.yaml",
  "skill-creator/SKILL.md",
  "skill-creator/agents/openai.yaml",
  "skill-creator/assets/skill-creator-small.svg",
  "skill-creator/assets/skill-creator.png",
  "skill-creator/license.txt",
  "skill-creator/references/openai_yaml.md",
  "skill-creator/scripts/generate_openai_yaml.py",
  "skill-creator/scripts/init_skill.py",
  "skill-creator/scripts/quick_validate.py",
  "skill-installer/LICENSE.txt",
  "skill-installer/SKILL.md",
  "skill-installer/agents/openai.yaml",
  "skill-installer/assets/skill-installer-small.svg",
  "skill-installer/assets/skill-installer.png",
  "skill-installer/scripts/github_utils.py",
  "skill-installer/scripts/install-skill-from-github.py",
  "skill-installer/scripts/list-skills.py"
] as const;

const SYSTEM_SKILLS_DIRECTORIES = new Set<string>(CODEX_SYSTEM_SKILLS_DIRECTORIES);
const SYSTEM_SKILLS_FILES = CODEX_SYSTEM_SKILLS_FILES;
const SYSTEM_SKILLS_FILE_SET = new Set<string>(SYSTEM_SKILLS_FILES);
const SYSTEM_SKILLS_ENTRY_SET = new Set<string>([
  ...SYSTEM_SKILLS_DIRECTORIES,
  ...SYSTEM_SKILLS_FILES
]);

export type CodexSystemSkillsDigest = string | null;

export function readCodexSystemSkillsDigest(codexHome: string): CodexSystemSkillsDigest {
  const skills = path.join(codexHome, "skills");
  let skillsStat: fs.Stats;
  try {
    skillsStat = fs.lstatSync(skills);
  } catch (error: unknown) {
    if (isNotFound(error)) return null;
    throw homeLayoutError();
  }
  if (!skillsStat.isDirectory() || skillsStat.isSymbolicLink()) throw homeLayoutError();
  validateDirectory(skillsStat, 0o755);
  const skillsEntries = fs.readdirSync(skills);
  if (skillsEntries.length !== 1 || skillsEntries[0] !== ".system") throw homeLayoutError();
  const system = path.join(skills, ".system");
  const systemStat = fs.lstatSync(system);
  if (!systemStat.isDirectory() || systemStat.isSymbolicLink()) throw homeLayoutError();
  validateDirectory(systemStat, SYSTEM_SKILLS_DIRECTORY_MODE);
  const entries = collectEntries(system);
  if (entries.length > MAX_SYSTEM_SKILLS_ENTRIES || !sameEntrySet(entries)) throw homeLayoutError();

  const hash = crypto.createHash("sha256");
  hash.update("gcr-codex-system-skills-v1\0", "utf8");
  let totalBytes = 0;
  for (const relative of entries) {
    const target = path.join(system, relative);
    const stat = fs.lstatSync(target);
    const isDirectory = SYSTEM_SKILLS_DIRECTORIES.has(relative);
    if (isDirectory) {
      validateDirectory(stat, SYSTEM_SKILLS_DIRECTORY_MODE);
      hash.update(`d\0${relative}\0${stat.mode & 0o777}\0`, "utf8");
      continue;
    }
    if (!SYSTEM_SKILLS_FILE_SET.has(relative)) throw homeLayoutError();
    validateFile(stat, SYSTEM_SKILLS_FILE_MODE, MAX_SYSTEM_SKILL_FILE_BYTES);
    const bytes = fs.readFileSync(target);
    if (bytes.length !== stat.size) throw homeLayoutError();
    totalBytes += bytes.length;
    if (totalBytes > MAX_SYSTEM_SKILLS_BYTES) throw homeLayoutError();
    hash.update(`f\0${relative}\0${stat.mode & 0o777}\0${bytes.length}\0`, "utf8");
    hash.update(bytes);
  }
  return hash.digest("hex");
}

function collectEntries(system: string): string[] {
  const entries: string[] = [];
  const visit = (directory: string, prefix: string): void => {
    const names = fs.readdirSync(directory).sort();
    for (const name of names) {
      if (name.length === 0 || name.includes("\0") || name === "." || name === "..") throw homeLayoutError();
      const relative = prefix.length === 0 ? name : `${prefix}/${name}`;
      entries.push(relative);
      if (entries.length > MAX_SYSTEM_SKILLS_ENTRIES) throw homeLayoutError();
      const stat = fs.lstatSync(path.join(system, relative));
      if (stat.isDirectory()) visit(path.join(system, relative), relative);
      else if (stat.isSymbolicLink()) throw homeLayoutError();
    }
  };
  visit(system, "");
  return entries.sort();
}

function sameEntrySet(entries: readonly string[]): boolean {
  return entries.length === SYSTEM_SKILLS_ENTRY_SET.size
    && entries.every((entry) => SYSTEM_SKILLS_ENTRY_SET.has(entry));
}

function validateDirectory(stat: fs.Stats, expectedMode: number): void {
  if (!stat.isDirectory() || stat.isSymbolicLink() || stat.nlink < 1 || !isCurrentOwner(stat)) throw homeLayoutError();
  if (process.platform !== "win32" && (stat.mode & 0o777) !== expectedMode) throw homeLayoutError();
}

function validateFile(stat: fs.Stats, expectedMode: number, maxBytes: number): void {
  if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1 || !isCurrentOwner(stat)
    || stat.size <= 0 || stat.size > maxBytes) throw homeLayoutError();
  if (process.platform !== "win32" && (stat.mode & 0o777) !== expectedMode) throw homeLayoutError();
}

function isCurrentOwner(stat: fs.Stats): boolean {
  return process.getuid === undefined || stat.uid === process.getuid();
}

function isNotFound(error: unknown): boolean {
  return error !== null && typeof error === "object" && "code" in error && error.code === "ENOENT";
}

function homeLayoutError(): Error {
  return new Error("codex home layout failure");
}
