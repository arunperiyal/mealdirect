const sequelize = require('../config/database');
const { Avatar, User } = require('../models');

const throwError = (code, message, statusCode = 400) => {
  throw { code, message, statusCode };
};

// The apps send a ~512px JPEG of a few dozen KB; this leaves room for a PNG
const MAX_BYTES = 1024 * 1024;

// Trust the file's first bytes, not what the client says it is
const SIGNATURES = [
  { mimeType: 'image/jpeg', test: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mimeType: 'image/png', test: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mimeType: 'image/webp', test: (b) => b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP' },
];

const wrap = (fn) => async (...args) => {
  try {
    return await fn(...args);
  } catch (error) {
    if (error.code) throw error;
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

/** Save a new profile picture from base64 (with or without a data: URL prefix); returns the user */
const setAvatar = wrap(async (userId, image) => {
  const base64 = String(image).replace(/^data:[^;]+;base64,/, '');
  const data = Buffer.from(base64, 'base64');
  if (!data.length) throwError('INVALID_IMAGE', 'Choose a photo', 400);
  if (data.length > MAX_BYTES) throwError('IMAGE_TOO_LARGE', 'That photo is too large. Choose one under 1 MB.', 413);
  const kind = SIGNATURES.find((s) => s.test(data));
  if (!kind) throwError('INVALID_IMAGE', 'Choose a JPEG, PNG or WebP photo', 400);

  const user = await User.findByPk(userId);
  if (!user) throwError('NOT_FOUND', 'Account not found', 404);
  await sequelize.transaction(async (transaction) => {
    await Avatar.upsert({ userId, data, mimeType: kind.mimeType }, { transaction });
    user.avatarUpdatedAt = new Date();
    await user.save({ transaction });
  });
  return user;
});

const removeAvatar = wrap(async (userId) => {
  const user = await User.findByPk(userId);
  if (!user) throwError('NOT_FOUND', 'Account not found', 404);
  await sequelize.transaction(async (transaction) => {
    await Avatar.destroy({ where: { userId }, transaction });
    user.avatarUpdatedAt = null;
    await user.save({ transaction });
  });
  return user;
});

/** The picture itself; none for deleted accounts */
const getAvatar = wrap(async (userId) => {
  const user = await User.findByPk(userId, { attributes: ['id'] });
  const avatar = user && (await Avatar.findByPk(userId));
  if (!avatar) throwError('NOT_FOUND', 'No profile picture', 404);
  return avatar;
});

module.exports = { setAvatar, removeAvatar, getAvatar, MAX_BYTES };
