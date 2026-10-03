require("dotenv").config();

const express = require("express");
const cors = require("cors");

const connectDB = require("./config/db");

const authRoutes = require("./routes/auth.routes");
const productRoutes = require("./routes/product.routes");
const orderRoutes = require("./routes/order.routes");
const adminRoutes = require("./routes/admin.routes");
const uploadRoutes = require("./routes/upload.routes");

const app = express();

/* ------------------------------------------------------------------ *
 *  Connect to MongoDB (idempotent — safe to call on every cold start) *
 * ------------------------------------------------------------------ */
connectDB();

/* ------------------------------------------------------------------ *
 *  CORS — explicit allowlist so preflight + credentials both work     *
 * ------------------------------------------------------------------ */

const DEFAULT_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "https://dogmarketplace.online",
  "https://dogmarketplace.vercel.app",
];

const ENV_ORIGINS = (process.env.CLIENT_URL || "")
  .split(",")
  .map((url) => url.trim().replace(/\/+$/, ""))
  .filter(Boolean);

const ALLOWED_ORIGINS = Array.from(
  new Set([...DEFAULT_ORIGINS, ...ENV_ORIGINS])
);

const corsOptions = {
  origin(origin, callback) {
    if (!origin) return callback(null, true);

    const normalized = origin.replace(/\/+$/, "");

    if (ALLOWED_ORIGINS.includes(normalized)) {
      return callback(null, true);
    }

    if (/^https:\/\/dogmarketplace[a-z0-9-]*\.vercel\.app$/i.test(normalized)) {
      return callback(null, true);
    }

    if (/^https:\/\/dogmarketplacebk[a-z0-9-]*\.vercel\.app$/i.test(normalized)) {
      return callback(null, true);
    }

    console.warn("CORS blocked origin:", normalized);
    return callback(new Error(`Origin ${normalized} not allowed by CORS`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Origin",
    "X-Requested-With",
    "Content-Type",
    "Accept",
    "Authorization",
  ],
  exposedHeaders: ["Content-Length", "Content-Type"],
  maxAge: 86400,
};

app.use(cors(corsOptions));



/* ------------------------------------------------------------------ *
 *  Body parsers                                                       *
 * ------------------------------------------------------------------ */
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

/* ------------------------------------------------------------------ *
 *  Friendly landing responses for root + /api                         *
 * ------------------------------------------------------------------ */

/* Small helper so both endpoints return the same shape */
const apiIndex = (req, res) => {
  res.json({
    ok: true,
    name: "Dog Marketplace API",
    version: "1.0.0",
    message: "Dog Marketplace API is running",
    env: process.env.NODE_ENV || "development",
    time: new Date().toISOString(),
    endpoints: {
      health: "/api/health",
      auth: {
        register: "POST /api/auth/register",
        signin: "POST /api/auth/signin",
        me: "GET /api/auth/me",
        cartSync: "PUT /api/auth/cart",
      },
      products: {
        list: "GET /api/products",
        single: "GET /api/products/:id",
        create: "POST /api/products (admin)",
        update: "PUT /api/products/:id (admin)",
        remove: "DELETE /api/products/:id (admin)",
        addReview: "POST /api/products/:id/reviews",
        removeReview: "DELETE /api/products/:id/reviews/:reviewId (admin)",
      },
      orders: {
        create: "POST /api/orders",
        mine: "GET /api/orders/mine",
      },
      admin: {
        users: "GET /api/admin/users (admin)",
      },
      upload: {
        image: "POST /api/upload (admin, multipart field 'image')",
      },
    },
  });
};

app.get("/", apiIndex);
app.get("/api", apiIndex);

/* Health check */
app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    message: "Dog Marketplace API is running",
    env: process.env.NODE_ENV || "development",
    allowedOrigins: ALLOWED_ORIGINS,
  });
});

/* ------------------------------------------------------------------ *
 *  Routes                                                             *
 * ------------------------------------------------------------------ */
app.use("/api/auth", authRoutes);
app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/upload", uploadRoutes);

/* ------------------------------------------------------------------ *
 *  404 + error handlers                                               *
 * ------------------------------------------------------------------ */
app.use((req, res) => {
  res.status(404).json({
    message: "Route not found",
    path: req.originalUrl,
    hint: "See GET / or GET /api for the list of available endpoints.",
  });
});

/* eslint-disable no-unused-vars */
app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);

  if (err && err.message && err.message.includes("not allowed by CORS")) {
    return res.status(403).json({ message: "Origin not allowed by CORS" });
  }

  res.status(err?.status || 500).json({
    message: err?.message || "Server error",
  });
});

/* ------------------------------------------------------------------ *
 *  Local listener — only start when running `node server.js` directly *
 * ------------------------------------------------------------------ */
const PORT = process.env.PORT || 5000;

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Dog Marketplace API running on port ${PORT}`);
    console.log("Allowed CORS origins:", ALLOWED_ORIGINS.join(", "));
    console.log("Try: http://localhost:" + PORT + "/ or /api/health");
  });
}

module.exports = app;