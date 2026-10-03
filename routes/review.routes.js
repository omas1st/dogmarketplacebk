const express = require("express");
const Review = require("../models/Review");
const Product = require("../models/Product");
const auth = require("../middleware/auth");

const router = express.Router();

async function refreshRating(productId) {
  const stats = await Review.aggregate([
    { $match: { product: productId } },
    {
      $group: {
        _id: "$product",
        averageRating: { $avg: "$rating" },
        reviewCount: { $sum: 1 }
      }
    }
  ]);

  await Product.findByIdAndUpdate(productId, stats[0] || {
    averageRating: 0,
    reviewCount: 0
  });
}

router.get("/:productId", async (req, res, next) => {
  try {
    const reviews = await Review.find({ product: req.params.productId })
      .populate("user", "name avatar")
      .sort({ createdAt: -1 });

    res.json(reviews);
  } catch (error) {
    next(error);
  }
});

router.post("/:productId", auth, async (req, res, next) => {
  try {
    const { rating, comment } = req.body;

    const review = await Review.findOneAndUpdate(
      { product: req.params.productId, user: req.user._id },
      { rating, comment },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );

    await refreshRating(review.product);
    res.status(201).json(review);
  } catch (error) {
    next(error);
  }
});

module.exports = router;