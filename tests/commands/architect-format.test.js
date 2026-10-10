// KJC-BUG-0313 (#2061): the architect agent may answer with plain strings where the text
// renderer expected objects; it printed "undefined" and dropped the data model.
import { describe, expect, it } from "vitest";

import { formatArchitect } from "../../src/commands/architect.js";

describe("kj architect text output", () => {
  it("renders string items as they come, never undefined, with data model and dependencies", () => {
    const text = formatArchitect({
      verdict: "ready",
      architecture: {
        type: "layered",
        layers: ["api", "domain"],
        patterns: ["repository"],
        dataModel: { entities: ["Competitor", "Threat"] },
        apiContracts: ["GET /competitors", "POST /threats"],
        dependencies: ["firebase-admin"],
        tradeoffs: ["ADR-1: Firestore over SQL for the MVP"],
      },
    });
    expect(text).not.toMatch(/undefined/);
    expect(text).toMatch(/### Tradeoffs\n- ADR-1: Firestore over SQL for the MVP/);
    expect(text).toMatch(/### API Contracts\n- `GET \/competitors`\n- `POST \/threats`/);
    expect(text).toMatch(/### Data Model\n- Competitor\n- Threat/);
    expect(text).toMatch(/### Dependencies\n- firebase-admin/);
  });

  it("renders object items with their fields, accepting path for endpoint and fields for entities", () => {
    const text = formatArchitect({
      architecture: {
        dataModel: { entities: [{ name: "Threat", fields: ["source", "date"] }] },
        apiContracts: [{ method: "POST", path: "/threats" }, { endpoint: "/health" }],
        tradeoffs: [{ decision: "Firestore", rationale: "speed", alternatives: ["Postgres"] }],
        patterns: [{ name: "CQRS" }],
      },
    });
    expect(text).not.toMatch(/undefined/);
    expect(text).toMatch(/- \*\*Threat\*\*: source, date/);
    expect(text).toMatch(/- `POST \/threats`\n- `GET \/health`/);
    expect(text).toMatch(/- \*\*Firestore\*\*: speed\n {2}Alternatives: Postgres/);
    expect(text).toMatch(/### Patterns\n- CQRS/);
  });
});
