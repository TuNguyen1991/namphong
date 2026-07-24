export function loginUserFromAccounts(users = [], username = "", password = "") {
  const loginName = String(username || "").trim().toLowerCase();
  const account = users.find((user) => String(user?.username || "").trim().toLowerCase() === loginName);
  if (!account || account.status === "locked" || String(account.password || "") !== String(password || "")) {
    return null;
  }

  const orderType = account.orderType || orderTypeFromUsername(account.username);
  return {
    username: String(account.username || "").trim(),
    label: account.fullName || account.username,
    role: account.role || "",
    orderType,
    scopeTripsByUser: Boolean(account.scopeTripsByUser),
  };
}

export function orderTypeFromUsername(username = "") {
  const value = String(username || "").trim().toLowerCase();
  if (value === "export") return "export";
  if (value === "import") return "import";
  if (value === "domestic" || value === "domestics") return "domestic";
  return "";
}

export function normalizeAuthenticatedUser(user) {
  if (!user) return null;
  const username = String(user.username || "").trim();
  if (!username) return null;
  return {
    username,
    label: user.label || user.fullName || user.name || username,
    role: user.role || "",
    orderType: user.orderType || orderTypeFromUsername(username),
    scopeTripsByUser: Boolean(user.scopeTripsByUser),
  };
}
