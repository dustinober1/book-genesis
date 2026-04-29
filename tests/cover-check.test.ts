import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

import { checkCoverAsset, writeCoverCheck } from "../extensions/book-genesis/cover-check.js";
import { makeRun, withWorkspace, writeBasicManuscript } from "./helpers.js";

function png(width: number, height: number) {
  const buffer = Buffer.alloc(24);
  buffer.writeUInt8(0x89, 0);
  buffer.write("PNG", 1, "ascii");
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

test("cover check reports missing and undersized ebook covers", async () => {
  await withWorkspace((workspace) => {
    const run = makeRun(workspace);
    assert.equal(checkCoverAsset(run, "missing.png").issues[0].code, "cover_missing");
    const cover = path.join(run.rootDir, "cover.png");
    writeFileSync(cover, png(300, 400));
    assert.equal(checkCoverAsset(run, "cover.png").issues.some((issue) => issue.code === "ebook_cover_undersized"), true);
  });
});

test("cover check accepts correctly sized ebook and warns on paperback spine", async () => {
  await withWorkspace((workspace) => {
    const run = makeRun(workspace);
    writeBasicManuscript(run);
    const cover = path.join(run.rootDir, "cover.png");
    writeFileSync(cover, png(1600, 2560));
    assert.equal(checkCoverAsset(run, "cover.png").issues.some((issue) => issue.code === "ebook_cover_size_ok"), true);
    mkdirSync(path.join(run.rootDir, "delivery"), { recursive: true });
    writeFileSync(path.join(run.rootDir, "cover.pdf"), "%PDF-1.4\n", "utf8");
    assert.equal(writeCoverCheck(run, "cover.pdf", "paperback").report.issues.some((issue) => issue.code === "paperback_spine_eligibility"), true);
  });
});
