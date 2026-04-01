import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:fs/promises", () => ({
  readdir: vi.fn(),
  readFile: vi.fn()
}));

const { readdir, readFile } = await import("node:fs/promises");
const { loadAvailableSkills } = await import("../src/skills/skill-loader.js");

describe("skill-loader type discrimination", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skills without frontmatter default to type 'technical'", async () => {
    readdir.mockImplementation(async (dir) => {
      if (dir === "/project/.agent/skills") {
        return [{ name: "react", isDirectory: () => true }];
      }
      throw new Error("ENOENT");
    });
    readFile.mockResolvedValue("React best practices content");

    const result = await loadAvailableSkills("/project");

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("technical");
    expect(result[0].content).toBe("React best practices content");
  });

  it("skills with type: domain in frontmatter are classified as domain", async () => {
    readdir.mockImplementation(async (dir) => {
      if (dir === "/project/.agent/skills") {
        return [{ name: "dental", isDirectory: () => true }];
      }
      throw new Error("ENOENT");
    });
    readFile.mockResolvedValue(`---
type: domain
---

Dental domain knowledge here.
`);

    const result = await loadAvailableSkills("/project");

    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("domain");
    expect(result[0].content).toBe("Dental domain knowledge here.");
  });

  it("filters by type: 'domain' returns only domain skills", async () => {
    readdir.mockImplementation(async (dir) => {
      if (dir === "/project/.agent/skills") {
        return [
          { name: "react", isDirectory: () => true },
          { name: "dental", isDirectory: () => true }
        ];
      }
      throw new Error("ENOENT");
    });
    readFile.mockImplementation(async (path) => {
      if (path.includes("react")) return "React content";
      if (path.includes("dental")) return `---
type: domain
---

Dental content.
`;
      throw new Error("ENOENT");
    });

    const result = await loadAvailableSkills("/project", { type: "domain" });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("dental");
    expect(result[0].type).toBe("domain");
  });

  it("filters by type: 'technical' returns only technical skills", async () => {
    readdir.mockImplementation(async (dir) => {
      if (dir === "/project/.agent/skills") {
        return [
          { name: "react", isDirectory: () => true },
          { name: "dental", isDirectory: () => true }
        ];
      }
      throw new Error("ENOENT");
    });
    readFile.mockImplementation(async (path) => {
      if (path.includes("react")) return "React content";
      if (path.includes("dental")) return `---
type: domain
---

Dental content.
`;
      throw new Error("ENOENT");
    });

    const result = await loadAvailableSkills("/project", { type: "technical" });

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("react");
    expect(result[0].type).toBe("technical");
  });

  it("no type filter returns all skills", async () => {
    readdir.mockImplementation(async (dir) => {
      if (dir === "/project/.agent/skills") {
        return [
          { name: "react", isDirectory: () => true },
          { name: "dental", isDirectory: () => true }
        ];
      }
      throw new Error("ENOENT");
    });
    readFile.mockImplementation(async (path) => {
      if (path.includes("react")) return "React content";
      if (path.includes("dental")) return `---
type: domain
---

Dental content.
`;
      throw new Error("ENOENT");
    });

    const result = await loadAvailableSkills("/project");

    expect(result).toHaveLength(2);
  });

  it("existing callers without options get same behavior", async () => {
    readdir.mockImplementation(async (dir) => {
      if (dir === "/project/.agent/skills") {
        return [{ name: "react", isDirectory: () => true }];
      }
      throw new Error("ENOENT");
    });
    readFile.mockResolvedValue("React best practices");

    // Call without second arg (existing caller pattern)
    const result = await loadAvailableSkills("/project");

    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({ name: "react", content: "React best practices", type: "technical" });
  });
});
