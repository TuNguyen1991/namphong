import bcrypt from "bcryptjs";

function generateSecurePassword() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const length = 12;
  let result = "";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

const DEFAULT_PASSWORDS = {
  admin: process.env.DEFAULT_ADMIN_PASSWORD || "Admin@2024!",
  export: process.env.DEFAULT_EXPORT_PASSWORD || "Export@2024!",
  import: process.env.DEFAULT_IMPORT_PASSWORD || "Import@2024!",
  domestic: process.env.DEFAULT_DOMESTIC_PASSWORD || "Domestic@2024!",
};

const BCRYPT_PREFIXES = ["$2a$", "$2b$", "$2y$"];

export function isPasswordHash(value = "") {
  return BCRYPT_PREFIXES.some((prefix) => String(value || "").startsWith(prefix));
}

export async function hashPassword(password = "") {
  return bcrypt.hash(String(password || ""), 12);
}

export async function verifyPassword(password = "", storedPassword = "") {
  const stored = String(storedPassword || "");
  if (!stored) return false;
  if (!isPasswordHash(stored)) return String(password || "") === stored;
  return bcrypt.compare(String(password || ""), stored);
}

export async function normalizeAccountPasswords(accountAdmin = {}) {
  const users = Array.isArray(accountAdmin.users) ? accountAdmin.users : [];
  const normalizedUsers = await Promise.all(
    users.map(async (user) => {
      const password = String(user?.password || "");
      if (!password || isPasswordHash(password)) return user;
      return { ...user, password: await hashPassword(password) };
    }),
  );
  return { ...accountAdmin, users: normalizedUsers };
}

export const CORE_LOGIN_USERS = [
  { username: "admin", password: DEFAULT_PASSWORDS.admin, fullName: "Admin", role: "admin", orderType: "", status: "active" },
  { username: "export", password: DEFAULT_PASSWORDS.export, fullName: "Export", role: "dispatcher", orderType: "export", status: "active" },
  { username: "import", password: DEFAULT_PASSWORDS.import, fullName: "Import", role: "dispatcher", orderType: "import", status: "active" },
  { username: "domestic", password: DEFAULT_PASSWORDS.domestic, fullName: "Domestic", role: "dispatcher", orderType: "domestic", status: "active" },
];

export function ensureCoreLoginUsers(accountAdmin = {}) {
  const users = Array.isArray(accountAdmin.users) ? accountAdmin.users : [];
  const coreByUsername = Object.fromEntries(CORE_LOGIN_USERS.map((user) => [user.username, user]));
  const normalizedUsers = users.map((user) => {
    const username = String(user?.username || "").trim().toLowerCase();
    const core = coreByUsername[username];
    if (!core) return user;
    return {
      ...user,
      fullName: user.fullName || core.fullName,
      role: user.role || core.role,
      orderType: user.orderType ? user.orderType : core.orderType,
      status: user.status || core.status,
    };
  });
  const existing = new Set(normalizedUsers.map((user) => String(user?.username || "").trim().toLowerCase()).filter(Boolean));
  const maxId = normalizedUsers.reduce((max, user) => Math.max(max, Number(user?.id) || 0), 0);
  let nextId = Math.max(maxId + 1, 1000);
  const missing = CORE_LOGIN_USERS
    .filter((user) => !existing.has(user.username))
    .map((user) => ({ id: nextId++, phone: "", ...user }));

  return {
    ...accountAdmin,
    users: [...normalizedUsers, ...missing],
  };
}
