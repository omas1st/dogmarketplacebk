const jwt = require("jsonwebtoken");

const protect = (req, res, next) => {
  const header = req.headers.authorization || "";

  if (!header.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Not authorized, missing token" });
  }

  const token = header.slice(7).trim();

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Not authorized, invalid token" });
  }
};

const optionalAuth = (req, res, next) => {
  const header = req.headers.authorization || "";

  if (!header.startsWith("Bearer ")) return next();

  const token = header.slice(7).trim();

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    req.user = null;
  }

  next();
};

module.exports = { protect, optionalAuth };