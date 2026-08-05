import test from "node:test";
import assert from "node:assert/strict";
import app from "./app.js";

test("trusts exactly one reverse-proxy hop for production rate limiting", () => {
  assert.equal(app.get("trust proxy"), 1);
});
