import test from "node:test";
import assert from "node:assert/strict";
import { ensureCoreLoginUsers, hashPassword, normalizeAccountPasswords, verifyPassword } from "./accountAdmin.js";

test("ensureCoreLoginUsers adds missing default login users without overwriting existing accounts", () => {
  const accountAdmin = {
    users: [
      { id: 7, username: "admin", password: "custom", fullName: "Custom Admin", role: "admin", status: "active" },
      { id: 8, username: "export", password: "custom-export", fullName: "Export Team", role: "dispatcher", status: "active" },
    ],
    permissions: { viewTrips: { admin: true } },
  };

  const result = ensureCoreLoginUsers(accountAdmin);
  const byUsername = Object.fromEntries(result.users.map((user) => [user.username, user]));

  assert.equal(byUsername.admin.password, "custom");
  assert.equal(byUsername.export.password, "custom-export");
  assert.equal(byUsername.export.orderType, "export");
  assert.ok(byUsername.import.password.length > 0, "import user has a default password");
  assert.ok(byUsername.domestic.password.length > 0, "domestic user has a default password");
  assert.equal(byUsername.domestic.orderType, "domestic");
  assert.equal(result.permissions.viewTrips.admin, true);
});

test("verifyPassword accepts bcrypt hashes and legacy plain text passwords", async () => {
  const hashed = await hashPassword("Secret@2026!");

  assert.equal(await verifyPassword("Secret@2026!", hashed), true);
  assert.equal(await verifyPassword("wrong", hashed), false);
  assert.equal(await verifyPassword("legacy", "legacy"), true);
  assert.equal(await verifyPassword("wrong", "legacy"), false);
});

test("normalizeAccountPasswords hashes plain text account passwords", async () => {
  const accountAdmin = await normalizeAccountPasswords({
    users: [{ id: 1, username: "admin", password: "Admin@2026!", role: "admin", status: "active" }],
  });

  assert.notEqual(accountAdmin.users[0].password, "Admin@2026!");
  assert.equal(await verifyPassword("Admin@2026!", accountAdmin.users[0].password), true);
});
