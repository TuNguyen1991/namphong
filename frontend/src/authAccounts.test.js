import test from "node:test";
import assert from "node:assert/strict";
import { loginUserFromAccounts, normalizeAuthenticatedUser } from "./authAccounts.js";

const users = [
  { username: "admin", password: "admin", fullName: "Admin", role: "admin", status: "active" },
  { username: "export", password: "export", fullName: "Export", role: "dispatcher", status: "active" },
  { username: "import", password: "import", fullName: "Import", role: "dispatcher", status: "active" },
  { username: "domestic", password: "domestic", fullName: "Domestic", role: "dispatcher", status: "active" },
  { username: "dp1", password: "123456", fullName: "Điều phối 1", role: "dispatcher", status: "active", scopeTripsByUser: true },
  { username: "locked", password: "123456", fullName: "Locked", role: "driver", status: "locked" },
];

test("loginUserFromAccounts authenticates accounts loaded from database", () => {
  assert.deepEqual(loginUserFromAccounts(users, "admin", "admin"), {
    username: "admin",
    label: "Admin",
    role: "admin",
    orderType: "",
    scopeTripsByUser: false,
  });
  assert.equal(loginUserFromAccounts(users, "export", "export").orderType, "export");
  assert.equal(loginUserFromAccounts(users, "import", "import").orderType, "import");
  assert.equal(loginUserFromAccounts(users, "domestic", "domestic").orderType, "domestic");
  assert.equal(loginUserFromAccounts(users, "dp1", "123456").scopeTripsByUser, true);
});

test("loginUserFromAccounts rejects wrong password and locked users", () => {
  assert.equal(loginUserFromAccounts(users, "admin", "wrong"), null);
  assert.equal(loginUserFromAccounts(users, "locked", "123456"), null);
});

test("normalizeAuthenticatedUser maps API auth payloads to UI user shape", () => {
  assert.deepEqual(
    normalizeAuthenticatedUser({ username: "admin", fullName: "Admin Nam Phong", role: "admin", orderType: "" }),
    {
      username: "admin",
      label: "Admin Nam Phong",
      role: "admin",
      orderType: "",
      scopeTripsByUser: false,
    },
  );
  assert.equal(normalizeAuthenticatedUser(null), null);
});
