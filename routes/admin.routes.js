const express = require("express");

const User = require("../models/User");
const Order = require("../models/Order");
const { protect } = require("../middleware/auth");
const { adminOnly } = require("../middleware/admin");

const router = express.Router();

/* GET /api/admin/users */
router.get("/users", protect, adminOnly, async (req, res) => {
  try {
    const users = await User.find()
      .select("-password")
      .populate("orders")
      .sort({ createdAt: -1 });

    /* Guest orders — placed without an account (user: null) */
    const guestOrders = await Order.find({ user: null }).sort({
      createdAt: -1,
    });

    return res.json({ users, guestOrders });
  } catch (error) {
    console.error("List users error:", error);
    return res.status(500).json({ message: "Could not load users." });
  }
});

module.exports = router;