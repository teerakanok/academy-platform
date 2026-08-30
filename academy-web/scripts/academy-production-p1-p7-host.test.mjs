import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { main } from "./academy-production-p1-p7-host.mjs";

test("host helper rejects foreign paths before protected reads or database calls", () => {
  assert.throws(() => main(["enroll", "/tmp/foreign"]), /REJECTED/);
  assert.throws(
    () => main(["consume-otp", "/tmp/foreign", "/tmp/output"]),
    /REJECTED/,
  );
});

test("host helper uses stable no-follow reads and argv/stdin database execution", async () => {
  const source = await readFile(
    new URL("./academy-production-p1-p7-host.mjs", import.meta.url),
    "utf8",
  );
  assert.match(source, /O_NOFOLLOW/);
  assert.match(source, /before\.dev !== after\.dev/);
  assert.match(source, /"\/usr\/bin\/docker"/);
  assert.match(source, /input: sql/);
  assert.doesNotMatch(source, /execSync|shell\s*:/);
  assert.doesNotMatch(source, /console\./);
});
