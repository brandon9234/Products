import { access, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

type SummaryMap = Record<string, string>;

interface FileEntry {
  path: string;
  label: string;
  summary: string;
}

interface SkillEntry {
  folder: string;
  name: string;
  description: string;
  hasOpenAiYaml: boolean;
  referenceFiles: string[];
}

interface RepositoryMapResult {
  markdown: string;
  missingSummaries: string[];
  skillIssues: string[];
}

const OUTPUT_PATH = path.join("docs", "agents", "repository-map.md");

const AGENT_FILE_SUMMARIES: SummaryMap = {
  "AGENTS.md": "Top-level operating instructions for agents working in this repository.",
  "docs/agents/README.md": "Agent-specific onboarding, flow overview, and maintenance rules.",
  "docs/agents/chat-handoff.md":
    "Generated handoff note with current validation status and changed-file inventory.",
  "docs/agents/repository-map.md":
    "Generated inventory of the repo's high-signal files, commands, and repo-local skills.",
  "app/layout.tsx": "Shared HTML shell and metadata for the Next.js app.",
  "app/globals.css": "Global visual system for the TAM viewer pages.",
  "app/tam/tam-table.tsx":
    "Client-side TAM table with sorting, pagination, inline editing, and row-image controls."
};

const PAGE_SUMMARIES: SummaryMap = {
  "app/page.tsx": "Home page that links into the TAM snapshot viewer.",
  "app/tam/page.tsx":
    "Server route that loads the workbook snapshot, groups tabs, and renders the selected sheet."
};

const API_SUMMARIES: SummaryMap = {
  "app/api/tam/datasets/[dataset]/images/route.ts":
    "Upload and delete endpoints for manual row images stored alongside the dataset snapshot.",
  "app/api/tam/datasets/[dataset]/sheet/route.ts":
    "Mutation endpoint for inline cell edits and dynamic column creation."
};

const LIB_SUMMARIES: SummaryMap = {
  "src/lib/tam/datasetStore.ts":
    "Snapshot and asset path helpers used by the mutation routes.",
  "src/lib/tam/importer.ts":
    "Workbook import pipeline that normalizes sheets and extracts embedded images.",
  "src/lib/tam/loadSnapshot.ts":
    "Snapshot loader and schema validator with support for the legacy single-sheet shape.",
  "src/lib/tam/machineOptions.ts":
    "Shared machine option taxonomy plus parse/serialize helpers for machine-based categorization.",
  "src/lib/tam/productSheets.ts":
    "Derives product-category tables, machine-grouped product views, and stable query keys from material-sheet rows.",
  "src/lib/tam/types.ts":
    "Shared TAM snapshot types used by the app, API routes, and tests."
};

const SCRIPT_SUMMARIES: SummaryMap = {
  "scripts/agent-docs.ts":
    "Generates and validates the agent-facing repository map and skill metadata.",
  "scripts/import-tam.ts":
    "CLI entry point for rebuilding the committed TAM snapshot from workbook exports.",
  "scripts/prepare-chat-handoff.ts":
    "Refreshes agent artifacts, runs validation, and writes the chat handoff note.",
  "scripts/run-next.cmd":
    "Windows wrapper for Next.js commands with a clear recovery message when node_modules is incomplete.",
  "scripts/run-node.cmd":
    "Windows wrapper that resolves node.exe for repo maintenance scripts.",
  "scripts/run-npm.cmd":
    "Windows wrapper that resolves npm for nested repo scripts and validation chains.",
  "scripts/run-tsx.cmd":
    "Windows wrapper for tsx-backed scripts with a synced-folder recovery message.",
  "scripts/run-test.cmd":
    "Windows wrapper that runs agent validation before the Vitest suite and preserves failures.",
  "scripts/run-vitest.cmd":
    "Windows wrapper for Vitest with a clear failure mode when dependencies are incomplete."
};

const TEST_SUMMARIES: SummaryMap = {
  "tests/importer.test.ts":
    "Covers workbook parsing, sheet fallback behavior, and deterministic snapshot output.",
  "tests/loadSnapshot.test.ts":
    "Covers missing, malformed, and valid snapshot loading states.",
  "tests/productSheets.test.ts":
    "Covers product-category table derivation, image remapping, and query-key uniqueness.",
  "tests/tam-table.test.tsx":
    "Covers table rendering, local edits, sorting, pagination, and image controls."
};

const SKILL_NAME_PATTERN = /^[a-z0-9-]+$/;

export async function buildRepositoryMap(
  rootDir = process.cwd()
): Promise<RepositoryMapResult> {
  const packageJsonPath = path.join(rootDir, "package.json");
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
    name: string;
    scripts?: Record<string, string>;
    dependencies?: Record<string, string>;
  };

  const missingSummaries: string[] = [];
  const skillIssues: string[] = [];

  const agentFiles = await collectFixedEntries(rootDir, AGENT_FILE_SUMMARIES);
  const pageEntries = await collectRouteEntries(rootDir, "app", /\/page\.tsx?$/, PAGE_SUMMARIES, {
    labelFromPath: routeLabelFromPage
  });
  const apiEntries = await collectRouteEntries(
    rootDir,
    path.join("app", "api"),
    /\/route\.tsx?$/,
    API_SUMMARIES,
    { labelFromPath: routeLabelFromApiRoute }
  );
  const libEntries = await collectDirectoryEntries(
    rootDir,
    path.join("src", "lib", "tam"),
    /\.tsx?$/,
    LIB_SUMMARIES
  );
  const scriptEntries = await collectDirectoryEntries(
    rootDir,
    "scripts",
    /\.(?:tsx?|cmd)$/,
    SCRIPT_SUMMARIES
  );
  const testEntries = await collectDirectoryEntries(
    rootDir,
    "tests",
    /\.test\.tsx?$/,
    TEST_SUMMARIES
  );
  const skillEntries = await collectSkillEntries(rootDir, skillIssues);

  addMissingSummaries(missingSummaries, agentFiles);
  addMissingSummaries(missingSummaries, pageEntries);
  addMissingSummaries(missingSummaries, apiEntries);
  addMissingSummaries(missingSummaries, libEntries);
  addMissingSummaries(missingSummaries, scriptEntries);
  addMissingSummaries(missingSummaries, testEntries);

  const markdown = renderRepositoryMap({
    packageName: packageJson.name,
    scripts: packageJson.scripts ?? {},
    dependencies: packageJson.dependencies ?? {},
    agentFiles,
    pageEntries,
    apiEntries,
    libEntries,
    scriptEntries,
    testEntries,
    skillEntries
  });

  return {
    markdown,
    missingSummaries,
    skillIssues
  };
}

async function collectFixedEntries(
  rootDir: string,
  summaryMap: SummaryMap
): Promise<FileEntry[]> {
  const entries: FileEntry[] = [];

  for (const filePath of Object.keys(summaryMap).sort()) {
    if (!(await pathExists(path.join(rootDir, filePath)))) {
      continue;
    }

    entries.push({
      path: filePath,
      label: filePath,
      summary: summaryMap[filePath]
    });
  }

  return entries;
}

async function collectDirectoryEntries(
  rootDir: string,
  relativeDir: string,
  matcher: RegExp,
  summaryMap: SummaryMap
): Promise<FileEntry[]> {
  const absoluteDir = path.join(rootDir, relativeDir);
  if (!(await pathExists(absoluteDir))) {
    return [];
  }

  const files = await walkFiles(absoluteDir);
  return files
    .map((absolutePath) => normalizePath(path.relative(rootDir, absolutePath)))
    .filter((relativePath) => matcher.test(relativePath))
    .sort()
    .map((filePath) => ({
      path: filePath,
      label: filePath,
      summary: summaryMap[filePath] ?? ""
    }));
}

async function collectRouteEntries(
  rootDir: string,
  relativeDir: string,
  matcher: RegExp,
  summaryMap: SummaryMap,
  options: { labelFromPath: (filePath: string) => string }
): Promise<FileEntry[]> {
  const entries = await collectDirectoryEntries(rootDir, relativeDir, matcher, summaryMap);
  return entries.map((entry) => ({
    ...entry,
    label: options.labelFromPath(entry.path)
  }));
}

async function collectSkillEntries(
  rootDir: string,
  issues: string[]
): Promise<SkillEntry[]> {
  const skillsDir = path.join(rootDir, "skills");
  if (!(await pathExists(skillsDir))) {
    return [];
  }

  const directoryEntries = await readdir(skillsDir, { withFileTypes: true });
  const folders = directoryEntries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  const skills: SkillEntry[] = [];

  for (const folder of folders) {
    const skillRoot = path.join(skillsDir, folder);
    const skillPath = path.join(skillRoot, "SKILL.md");
    if (!(await pathExists(skillPath))) {
      continue;
    }

    const content = await readFile(skillPath, "utf8");
    const frontmatter = parseFrontmatter(content);
    const name = frontmatter.name;
    const description = frontmatter.description;
    const openAiYamlPath = path.join(skillRoot, "agents", "openai.yaml");
    const referenceFiles = (await collectDirectoryEntries(rootDir, path.join("skills", folder, "references"), /\.md$/, {}))
      .map((entry) => entry.path);

    if (!name) {
      issues.push(`skills/${folder}/SKILL.md is missing a frontmatter name.`);
    } else if (name !== folder) {
      issues.push(`skills/${folder}/SKILL.md frontmatter name must match the folder name.`);
    }

    if (!name || !SKILL_NAME_PATTERN.test(name)) {
      issues.push(`skills/${folder}/SKILL.md must use a hyphen-case skill name.`);
    }

    if (!description) {
      issues.push(`skills/${folder}/SKILL.md is missing a frontmatter description.`);
    }

    if (!(await pathExists(openAiYamlPath))) {
      issues.push(`skills/${folder}/agents/openai.yaml is required.`);
    }

    skills.push({
      folder,
      name: name || folder,
      description: description || "Description missing.",
      hasOpenAiYaml: await pathExists(openAiYamlPath),
      referenceFiles
    });
  }

  return skills;
}

function addMissingSummaries(target: string[], entries: FileEntry[]): void {
  for (const entry of entries) {
    if (!entry.summary) {
      target.push(entry.path);
    }
  }
}

function renderRepositoryMap(input: {
  packageName: string;
  scripts: Record<string, string>;
  dependencies: Record<string, string>;
  agentFiles: FileEntry[];
  pageEntries: FileEntry[];
  apiEntries: FileEntry[];
  libEntries: FileEntry[];
  scriptEntries: FileEntry[];
  testEntries: FileEntry[];
  skillEntries: SkillEntry[];
}): string {
  const lines: string[] = [
    "# Repository Map",
    "",
    "> Generated by `npm run agent:refresh`. Do not hand-edit this file.",
    "",
    "## Snapshot",
    "",
    `- Package: \`${input.packageName}\``,
    `- Runtime: \`next@${input.dependencies.next ?? "unknown"}\`, \`react@${input.dependencies.react ?? "unknown"}\`, \`xlsx@${input.dependencies.xlsx ?? "unknown"}\``,
    "- Scope: local/internal TAM workbook import, viewing, editing, and image attachment flow",
    "",
    "## npm Scripts",
    ""
  ];

  for (const [name, command] of Object.entries(input.scripts).sort(([left], [right]) =>
    left.localeCompare(right)
  )) {
    lines.push(`- \`${name}\`: \`${command}\``);
  }

  lines.push("");
  lines.push(...renderFileSection("Agent Artifacts", input.agentFiles));
  lines.push(...renderFileSection("App Routes", input.pageEntries));
  lines.push(...renderFileSection("API Routes", input.apiEntries));
  lines.push(...renderFileSection("TAM Library", input.libEntries));
  lines.push(...renderFileSection("Project Scripts", input.scriptEntries));
  lines.push(...renderFileSection("Tests", input.testEntries));
  lines.push(...renderSkillSection(input.skillEntries));

  return `${lines.join("\n")}\n`;
}

function renderFileSection(title: string, entries: FileEntry[]): string[] {
  const lines = [`## ${title}`, ""];

  if (entries.length === 0) {
    lines.push("- None", "");
    return lines;
  }

  for (const entry of entries) {
    lines.push(`- \`${entry.label}\` -> \`${entry.path}\`: ${entry.summary || "Summary missing."}`);
  }

  lines.push("");
  return lines;
}

function renderSkillSection(skills: SkillEntry[]): string[] {
  const lines = ["## Skills", ""];

  if (skills.length === 0) {
    lines.push("- None", "");
    return lines;
  }

  for (const skill of skills) {
    const references =
      skill.referenceFiles.length > 0
        ? ` References: ${skill.referenceFiles.map((filePath) => `\`${filePath}\``).join(", ")}.`
        : "";
    const metadata = skill.hasOpenAiYaml ? "UI metadata present." : "UI metadata missing.";
    lines.push(
      `- \`${skill.name}\` -> \`skills/${skill.folder}/SKILL.md\`: ${skill.description} ${metadata}${references}`.trim()
    );
  }

  lines.push("");
  return lines;
}

function routeLabelFromPage(filePath: string): string {
  const relative = filePath.replace(/^app\//, "").replace(/\/page\.tsx?$/, "");
  if (!relative || relative === "page.tsx" || relative === "page.ts") {
    return "/";
  }

  return `/${relative}`;
}

function routeLabelFromApiRoute(filePath: string): string {
  const relative = filePath
    .replace(/^app\/api\//, "")
    .replace(/\/route\.tsx?$/, "");
  return `/api/${relative}`;
}

function parseFrontmatter(content: string): { name: string; description: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  if (!match) {
    return { name: "", description: "" };
  }

  const frontmatter = match[1];
  return {
    name: readFrontmatterField(frontmatter, "name"),
    description: readFrontmatterField(frontmatter, "description")
  };
}

function readFrontmatterField(frontmatter: string, field: string): string {
  const match = new RegExp(`^${field}:\\s*(.+)$`, "m").exec(frontmatter);
  return match?.[1]?.trim().replace(/^['"]|['"]$/g, "") ?? "";
}

async function walkFiles(directory: string): Promise<string[]> {
  const children = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const child of children.sort((left, right) => left.name.localeCompare(right.name))) {
    const childPath = path.join(directory, child.name);
    if (child.isDirectory()) {
      files.push(...(await walkFiles(childPath)));
    } else {
      files.push(childPath);
    }
  }

  return files;
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await access(targetPath);
    return true;
  } catch {
    return false;
  }
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

async function writeRepositoryMap(rootDir: string, markdown: string): Promise<void> {
  const outputFilePath = path.join(rootDir, OUTPUT_PATH);
  await mkdir(path.dirname(outputFilePath), { recursive: true });
  await writeFile(outputFilePath, markdown, "utf8");
}

async function verifyRepositoryMap(rootDir: string, markdown: string): Promise<void> {
  const outputFilePath = path.join(rootDir, OUTPUT_PATH);
  const existing = await readFile(outputFilePath, "utf8").catch(() => "");
  if (existing !== markdown) {
    throw new Error(
      `Generated repository map is stale. Run "npm run agent:refresh" and commit ${OUTPUT_PATH}.`
    );
  }
}

export async function run(mode: "write" | "check", rootDir = process.cwd()): Promise<void> {
  const result = await buildRepositoryMap(rootDir);

  if (result.missingSummaries.length > 0) {
    throw new Error(
      [
        "Repository map summaries are missing for:",
        ...result.missingSummaries.map((filePath) => `- ${filePath}`)
      ].join("\n")
    );
  }

  if (result.skillIssues.length > 0) {
    throw new Error(["Skill validation failed:", ...result.skillIssues.map((issue) => `- ${issue}`)].join("\n"));
  }

  if (mode === "write") {
    await writeRepositoryMap(rootDir, result.markdown);
    return;
  }

  await verifyRepositoryMap(rootDir, result.markdown);
}

async function main(): Promise<void> {
  const rawMode = process.argv[2] ?? "write";
  if (rawMode !== "write" && rawMode !== "check") {
    throw new Error(`Unsupported mode: ${rawMode}`);
  }

  await run(rawMode);
}

const currentFilePath = fileURLToPath(import.meta.url);
const invokedFilePath = process.argv[1] ? path.resolve(process.argv[1]) : "";

if (currentFilePath === invokedFilePath) {
  main().catch((error) => {
    console.error((error as Error).message);
    process.exit(1);
  });
}
