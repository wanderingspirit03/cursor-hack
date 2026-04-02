import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export const KNOWN_ROLES = [
  "frontend",
  "backend",
  "testing",
  "devops",
  "database",
  "orchestrator",
] as const;

export type KnownRole = (typeof KNOWN_ROLES)[number];

export function isKnownRole(role: string): role is KnownRole {
  return KNOWN_ROLES.includes(role as KnownRole);
}

function getRoleMemoryPath(cwd: string, role: KnownRole): string {
  return resolve(cwd, ".cursor-hack", "memory", `${role}.md`);
}

export async function loadRoleMemory(cwd: string, role: KnownRole): Promise<string> {
  const path = getRoleMemoryPath(cwd, role);

  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

export async function updateRoleMemory(
  cwd: string,
  role: KnownRole,
  newTruths: string[],
): Promise<string> {
  const truths = newTruths.map((truth) => truth.trim()).filter(Boolean);
  const path = getRoleMemoryPath(cwd, role);
  const existing = await loadRoleMemory(cwd, role);

  if (truths.length === 0) {
    return existing;
  }

  await mkdir(dirname(path), { recursive: true });

  const header = existing.trim().length > 0 ? "" : `# ${role} role memory\n\n`;
  const separator = existing.trim().length > 0 ? "\n\n" : "";
  const timestamp = new Date().toISOString();
  const appendedSection = `## ${timestamp}\n${truths.map((truth) => `- ${truth}`).join("\n")}\n`;
  const next = `${existing}${header}${separator}${appendedSection}`;

  await writeFile(path, next, "utf8");
  return next;
}
