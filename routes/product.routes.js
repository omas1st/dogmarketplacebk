const express = require("express");
const mongoose = require("mongoose");

const Product = require("../models/Product");
const { protect } = require("../middleware/auth");
const { adminOnly } = require("../middleware/admin");

const router = express.Router();

/* GET /api/products */
router.get("/", async (req, res) => {
  try {
    const {
      itemType,
      search,
      shape,
      type,
      minPrice,
      maxPrice,
      all,
    } = req.query;

    const filter = {};

    if (itemType) filter.itemType = itemType;

    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }

    // Shape is not stored directly — treat it as a soft match on title/description
    if (shape && shape !== "all") {
      const shapeRegex = { $regex: shape, $options: "i" };
      filter.$and = filter.$and || [];
      filter.$and.push({
        $or: [{ title: shapeRegex }, { description: shapeRegex }],
      });
    }

    // Type is a soft match on title/description
    if (type && type !== "all") {
      const typeRegex = { $regex: type, $options: "i" };
      filter.$and = filter.$and || [];
      filter.$and.push({
        $or: [{ title: typeRegex }, { description: typeRegex }],
      });
    }

    if (minPrice !== undefined || maxPrice !== undefined) {
      filter.sellingPrice = {};
      if (minPrice !== undefined && minPrice !== "") {
        const min = Number(minPrice);
        if (!Number.isNaN(min)) filter.sellingPrice.$gte = min;
      }
      if (maxPrice !== undefined && maxPrice !== "") {
        const max = Number(maxPrice);
        if (!Number.isNaN(max)) filter.sellingPrice.$lte = max;
      }
      if (Object.keys(filter.sellingPrice).length === 0) {
        delete filter.sellingPrice;
      }
    }

    // "all" is only honored for admin listing — otherwise it is ignored
    if (all !== "true" && !itemType) {
      // default to supplies when nothing is passed
      filter.itemType = "dog_supply";
    }

    const products = await Product.find(filter).sort({ createdAt: -1 });

    return res.json({ products });
  } catch (error) {
    console.error("List products error:", error);
    return res.status(500).json({ message: "Could not load products." });
  }
});

/* GET /api/products/:id */
router.get("/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid product id." });
    }

    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: "Product not found." });
    }

    const reviews = [...product.reviews].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
    );

    return res.json({ product: { ...product.toObject(), reviews }, reviews });
  } catch (error) {
    console.error("Get product error:", error);
    return res.status(500).json({ message: "Could not load product." });
  }
});

/* POST /api/products — admin only */
router.post("/", protect, adminOnly, async (req, res) => {
  try {
    const {
      itemType,
      title,
      description,
      originalPrice,
      discountPercent,
      category,
      stockStatus,
      image,
      sizes,
    } = req.body || {};

    if (!title || !description || !image || originalPrice === undefined) {
      return res
        .status(400)
        .json({ message: "Missing required product fields." });
    }

    const product = await Product.create({
      itemType: itemType || "dog_supply",
      title: String(title).trim(),
      description: String(description).trim(),
      originalPrice: Number(originalPrice),
      discountPercent:
        discountPercent === undefined ? 20 : Number(discountPercent),
      category: category || "dog_clothing_accessories",
      stockStatus: stockStatus || "in_stock",
      image: String(image).trim(),
      sizes: Array.isArray(sizes) ? sizes.map((s) => String(s).trim()).filter(Boolean) : [],
    });

    return res.status(201).json({ product });
  } catch (error) {
    console.error("Create product error:", error);
    return res.status(500).json({ message: "Could not create product." });
  }
});

/* PUT /api/products/:id — admin only */
router.put("/:id", protect, adminOnly, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid product id." });
    }

    const {
      itemType,
      title,
      description,
      originalPrice,
      discountPercent,
      category,
      stockStatus,
      image,
      sizes,
    } = req.body || {};

    const update = {};

    if (itemType !== undefined) update.itemType = itemType;
    if (title !== undefined) update.title = String(title).trim();
    if (description !== undefined) update.description = String(description).trim();
    if (originalPrice !== undefined) update.originalPrice = Number(originalPrice);
    if (discountPercent !== undefined) update.discountPercent = Number(discountPercent);
    if (category !== undefined) update.category = category;
    if (stockStatus !== undefined) update.stockStatus = stockStatus;
    if (image !== undefined) update.image = String(image).trim();
    if (sizes !== undefined) {
      update.sizes = Array.isArray(sizes)
        ? sizes.map((s) => String(s).trim()).filter(Boolean)
        : [];
    }

    // Recompute selling price against existing values if only one changed
    const existing = await Product.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ message: "Product not found." });
    }

    const finalOriginal =
      update.originalPrice !== undefined
        ? update.originalPrice
        : existing.originalPrice;
    const finalDiscount =
      update.discountPercent !== undefined
        ? update.discountPercent
        : existing.discountPercent;

    const selling = finalOriginal - (finalOriginal * finalDiscount) / 100;
    update.sellingPrice = Number(selling.toFixed(2));

    const product = await Product.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true,
    });

    return res.json({ product });
  } catch (error) {
    console.error("Update product error:", error);
    return res.status(500).json({ message: "Could not update product." });
  }
});

/* DELETE /api/products/:id — admin only */
router.delete("/:id", protect, adminOnly, async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid product id." });
    }

    const deleted = await Product.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ message: "Product not found." });
    }

    return res.json({ ok: true });
  } catch (error) {
    console.error("Delete product error:", error);
    return res.status(500).json({ message: "Could not delete product." });
  }
});

/* POST /api/products/:id/reviews — public */
router.post("/:id/reviews", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({ message: "Invalid product id." });
    }

    const { name, rating, comment } = req.body || {};

    if (!name || !comment || rating === undefined) {
      return res
        .status(400)
        .json({ message: "Name, rating and comment are required." });
    }

    const safeRating = Number(rating);
    if (Number.isNaN(safeRating) || safeRating < 1 || safeRating > 5) {
      return res.status(400).json({ message: "Rating must be between 1 and 5." });
    }

    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: "Product not found." });
    }

    product.reviews.push({
      name: String(name).trim(),
      rating: safeRating,
      comment: String(comment).trim(),
    });

    await product.save();

    const review = product.reviews[product.reviews.length - 1];

    return res.status(201).json({ review });
  } catch (error) {
    console.error("Create review error:", error);
    return res.status(500).json({ message: "Could not save review." });
  }
});

/* DELETE /api/products/:id/reviews/:reviewId — admin only */
router.delete("/:id/reviews/:reviewId", protect, adminOnly, async (req, res) => {
  try {
    if (
      !mongoose.isValidObjectId(req.params.id) ||
      !mongoose.isValidObjectId(req.params.reviewId)
    ) {
      return res.status(400).json({ message: "Invalid id." });
    }

    const product = await Product.findById(req.params.id);
    if (!product) {
      return res.status(404).json({ message: "Product not found." });
    }

    const before = product.reviews.length;
    product.reviews = product.reviews.filter(
      (review) => review._id.toString() !== req.params.reviewId
    );

    if (product.reviews.length === before) {
      return res.status(404).json({ message: "Review not found." });
    }

    await product.save();

    return res.json({ ok: true });
  } catch (error) {
    console.error("Delete review error:", error);
    return res.status(500).json({ message: "Could not delete review." });
  }
});

module.exports = router;