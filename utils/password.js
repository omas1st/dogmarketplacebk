const passwordChecks = (password = "") => ({
  length: password.length >= 8,
  lower: /[a-z]/.test(password),
  upper: /[A-Z]/.test(password),
  number: /\d/.test(password),
  symbol: /[^A-Za-z0-9]/.test(password),
});

const isStrongPassword = (password = "") => {
  const checks = passwordChecks(password);
  return (
    checks.length &&
    checks.lower &&
    checks.upper &&
    checks.number &&
    checks.symbol
  );
};

module.exports = { isStrongPassword, passwordChecks };