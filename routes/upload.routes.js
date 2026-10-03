const express = require("express");
const { Readable } = require("stream");

const cloudinary = require("../config/cloudinary");
const upload = require("../middleware/upload");
const { protect } = require("../middleware/auth");
const { adminOnly } = require("../middleware/admin");

const router = express.Router();

/* POST /api/upload — admin only, field name "image" */
router.post(
  "/",
  protect,
  adminOnly,
  upload.single("image"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No image file provided." });
      }

      const result = await new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
          { folder: "dog-marketplace", resource_type: "image" },
          (error, uploaded) => (error ? reject(error) : resolve(uploaded))
        );

        Readable.from(req.file.buffer).pipe(stream);
      });

      return res.status(201).json({
        url: result.secure_url,
        publicId: result.public_id,
        width: result.width,
        height: result.height,
      });
    } catch (error) {
      console.error("Upload error:", error);
      return res.status(500).json({ message: "Image upload failed." });
    }
  }
);

module.exports = router;