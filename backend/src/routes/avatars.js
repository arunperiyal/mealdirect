const express = require('express');
const { param, validationResult } = require('express-validator');
const router = express.Router();
const avatarController = require('../controllers/avatarController');

/**
 * GET /api/avatars/:userId?v=
 * A profile picture. Public, so <Image> can load it without a token (web apps can't send
 * one). The URL changes with each new picture (v), so it can be cached for good.
 */
router.get('/:userId', [param('userId').isUUID()], async (req, res) => {
  if (!validationResult(req).isEmpty()) {
    return res.status(404).json({ success: false, code: 'NOT_FOUND', message: 'No profile picture' });
  }
  try {
    const avatar = await avatarController.getAvatar(req.params.userId);
    res.set({
      'Content-Type': avatar.mimeType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      // The web apps load it from another origin; helmet's default would block that
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    res.send(avatar.data);
  } catch (error) {
    res.status(error.statusCode || 500).json({
      success: false,
      code: error.code || 'INTERNAL_ERROR',
      message: error.message,
    });
  }
});

module.exports = router;
