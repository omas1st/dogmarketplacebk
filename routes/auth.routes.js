const express = require("express");
const jwt = require("jsonwebtoken");

const User = require("../models/User");
const { isStrongPassword } = require("../utils/password");
const { protect } = require("../middleware/auth");

const router = express.Router();

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\+?[\d\s()-]{7,20}$/;

const signToken = (payload) =>
  jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: "7d" });

/* POST /api/auth/register */
router.post("/register", async (req, res) => {
  try {
    const { firstName, lastName, email, password, confirmPassword, mobilePhone } =
      req.body || {};

    if (!firstName || !lastName || !email || !password || !mobilePhone) {
      return res
        .status(400)
        .json({ message: "Please fill in all required fields." });
    }

    if (!EMAIL_REGEX.test(String(email).trim())) {
      return res.status(400).json({ message: "Invalid email address." });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({
        message:
          "Password is not strong enough. Use 8+ characters with upper, lower, number and symbol.",
      });
    }

    if (confirmPassword !== undefined && password !== confirmPassword) {
      return res.status(400).json({ message: "Passwords do not match." });
    }

    if (!PHONE_REGEX.test(String(mobilePhone).trim())) {
      return res.status(400).json({ message: "Invalid mobile phone number." });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    if (
      process.env.ADMIN_EMAIL &&
      normalizedEmail === process.env.ADMIN_EMAIL.toLowerCase()
    ) {
      return res
        .status(400)
        .json({ message: "That email address is not available." });
    }

    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res
        .status(400)
        .json({ message: "An account with that email already exists." });
    }

    const user = await User.create({
      firstName: String(firstName).trim(),
      lastName: String(lastName).trim(),
      email: normalizedEmail,
      password,
      mobilePhone: String(mobilePhone).trim(),
    });

    const token = signToken({
      id: user._id.toString(),
      email: user.email,
      role: "user",
    });

    return res.status(201).json({
      token,
      user: user.toSafeJSON(),
    });
  } catch (error) {
    console.error("Register error:", error);
    return res.status(500).json({ message: "Could not create account." });
  }
});

/* POST /api/auth/signin */
router.post("/signin", async (req, res) => {
  try {
    const { email, password } = req.body || {};

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Please enter your email and password." });
    }

    const normalizedEmail = String(email).trim().toLowerCase();

    // Admin sign in
    if (
      process.env.ADMIN_EMAIL &&
      normalizedEmail === process.env.ADMIN_EMAIL.toLowerCase()
    ) {
      if (password !== process.env.ADMIN_PASSWORD) {
        return res.status(401).json({ message: "Invalid email or password." });
      }

      const token = signToken({
        id: "admin",
        email: process.env.ADMIN_EMAIL,
        role: "admin",
      });

      return res.json({
        token,
        user: {
          _id: "admin",
          firstName: "Admin",
          lastName: "",
          email: process.env.ADMIN_EMAIL,
          role: "admin",
        },
      });
    }

    // User sign in
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const match = await user.comparePassword(password);
    if (!match) {
      return res.status(401).json({ message: "Invalid email or password." });
    }

    const token = signToken({
      id: user._id.toString(),
      email: user.email,
      role: "user",
    });

    return res.json({
      token,
      user: user.toSafeJSON(),
    });
  } catch (error) {
    console.error("Signin error:", error);
    return res.status(500).json({ message: "Could not sign in." });
  }
});

/* GET /api/auth/me */
router.get("/me", protect, async (req, res) => {
  if (req.user.role === "admin") {
    return res.json({
      user: {
        _id: "admin",
        firstName: "Admin",
        lastName: "",
        email: process.env.ADMIN_EMAIL,
        role: "admin",
      },
    });
  }

  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ message: "User not found." });
    }
    return res.json({ user: user.toSafeJSON() });
  } catch (error) {
    return res.status(500).json({ message: "Could not load profile." });
  }
});

/* PUT /api/auth/cart — sync cart for admin visibility */
router.put("/cart", protect, async (req, res) => {
  if (req.user.role === "admin") {
    return res.status(400).json({ message: "Admin does not have a cart." });
  }

  try {
    const items = Array.isArray(req.body?.items) ? req.body.items : [];

    const cleanItems = items.map((item) => ({
      productId: String(item.productId || ""),
      title: String(item.title || "").slice(0, 200),
      image: String(item.image || ""),
      price: Number(item.price) || 0,
      size: String(item.size || "One Size"),
      qty: Math.max(1, Number(item.qty) || 1),
    }));

    await User.findByIdAndUpdate(req.user.id, { cart: cleanItems });

    return res.json({ ok: true, items: cleanItems });
  } catch (error) {
    console.error("Cart sync error:", error);
    return res.status(500).json({ message: "Could not sync cart." });
  }
});

module.exports = router;