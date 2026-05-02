import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { addVaultSource, buildSourceVault, linkClaimToSources, writeSourceVault } from "../extensions/book-genesis/source-vault.js";
import { makeRun, withWorkspace, writeBasicManuscript } from "./helpers.js";

test("source vault records sources and claim links", async () => {
  await withWorkspace((workspace) => {
    const run = makeRun(workspace, { bookMode: "narrative-nonfiction" });
    writeBasicManuscript(run);

    const source = addVaultSource(run, {
      title: "Memory Research Review",
      url: "https://example.com/memory-review",
      summary: "Research context for memory indexing claims.",
      confidence: "high",
    });
    const claim = linkClaimToSources(run, {
      claim: "Research showed memory indexing was commercially viable.",
      sourceIds: [source.id],
      confidence: "high",
      location: "manuscript/full-manuscript.md",
    });

    assert.match(source.id, /^src_/);
    assert.match(claim.claimId, /^claim_/);
    const vault = buildSourceVault(run);
    assert.equal(vault.sources.length, 1);
    assert.equal(vault.claimLinks.length, 1);
  });
});

test("source vault writes durable artifacts", async () => {
  await withWorkspace((workspace) => {
    const run = makeRun(workspace);
    const output = writeSourceVault(run);
    assert.equal(existsSync(output.jsonPath), true);
    assert.equal(existsSync(output.markdownPath), true);
    assert.match(readFileSync(path.join(run.rootDir, "research", "source-vault.md"), "utf8"), /# Source Vault/);
  });
});
