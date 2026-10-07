const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const bcrypt = require('bcryptjs');
const { generateAccessToken, generateRefreshToken } = require('../utils/tokenUtils');

const User = sequelize.define(
  'User',
  {
    id: {
      type: sequelize.options.dialect === 'sqlite'
        ? DataTypes.STRING
        : DataTypes.UUID,
      defaultValue: sequelize.options.dialect === 'sqlite'
        ? () => require('crypto').randomUUID()
        : DataTypes.UUIDV4,
      primaryKey: true,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      lowercase: true,
      validate: {
        isEmail: { msg: 'Invalid email format' },
      },
    },
    passwordHash: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    firstName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    lastName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    phone: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    role: {
      type: sequelize.options.dialect === 'sqlite' 
        ? DataTypes.STRING 
        : DataTypes.ENUM('customer', 'restaurant_admin', 'system_admin', 'delivery_partner'),
      defaultValue: 'customer',
      allowNull: false,
      validate: {
        isIn: {
          args: [['customer', 'restaurant_admin', 'system_admin', 'delivery_partner']],
          msg: 'Role must be one of: customer, restaurant_admin, system_admin, delivery_partner'
        }
      }
    },
    // Delivery partners only: an admin approves a rider before they can take orders
    riderStatus: {
      type: sequelize.options.dialect === 'sqlite'
        ? DataTypes.STRING
        : DataTypes.ENUM('pending', 'approved', 'suspended'),
      allowNull: true,
      validate: {
        isIn: {
          args: [['pending', 'approved', 'suspended']],
          msg: 'Rider status must be one of: pending, approved, suspended'
        }
      }
    },
    // Delivery partners only: where MealDirect pays tips and salary. See lib/payout.js.
    bankAccountName: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    bankAccountNumber: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    bankIFSC: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    upiId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    // Delivery partners only: how many active deliveries their auto-accept rules may give
    // them; null means the default. See autoAcceptController.
    autoAcceptLimit: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    isVerified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    verificationToken: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    verificationTokenExpiry: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    // Email verification: the 6-digit code is hashed into verificationToken; when it
    // was sent and how many wrong tries it has had. See emailVerificationController.
    verificationSentAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    verificationAttempts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    lastLoginAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    // When the password last changed. Tokens issued before it no longer work, so a reset
    // signs the account out everywhere else. See middleware/auth.js.
    passwordChangedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    // Forgot password: the emailed 6-digit code (hashed), when it expires, when it was
    // sent and how many wrong tries it has had. See passwordResetController.
    passwordResetHash: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    passwordResetExpiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    passwordResetSentAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    passwordResetAttempts: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updatedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    deletedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    // When the profile picture last changed; null without one. Versions the avatar URL so
    // apps and caches pick up a new picture.
    avatarUpdatedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    // Where to fetch the profile picture, relative to the API's address, or null.
    // List it in an include's attributes to send it with orders.
    avatarUrl: {
      type: DataTypes.VIRTUAL(DataTypes.STRING, ['id', 'avatarUpdatedAt']),
      get() {
        const updated = this.getDataValue('avatarUpdatedAt');
        return updated ? `/api/avatars/${this.getDataValue('id')}?v=${new Date(updated).getTime()}` : null;
      },
    },
    // Who deleted the account: the user themselves or a MealDirect admin. See accountController.
    deletedById: {
      type: sequelize.options.dialect === 'sqlite' ? DataTypes.STRING : DataTypes.UUID,
      allowNull: true,
    },
  },
  {
    tableName: 'users',
    timestamps: true,
    paranoid: true,
    // Skip indexes for SQLite during tests
    ...(sequelize.options.dialect !== 'sqlite' && {
      indexes: [
        { fields: ['email'] },
        { fields: ['role'] },
        { fields: ['is_active'] },
      ],
    }),
  }
);

// Instance Methods

/**
 * Compare plaintext password with hashed password
 * @param {string} plainPassword - Plaintext password to compare
 * @returns {Promise<boolean>} True if password matches
 */
User.prototype.comparePassword = async function (plainPassword) {
  return bcrypt.compare(plainPassword, this.passwordHash);
};

/**
 * Generate access and refresh tokens for user
 * @returns {Object} { accessToken, refreshToken }
 */
User.prototype.generateTokens = function () {
  const accessToken = generateAccessToken({
    id: this.id,
    email: this.email,
    role: this.role,
  });

  const refreshToken = generateRefreshToken({
    id: this.id,
  });

  return { accessToken, refreshToken };
};

/**
 * Get user data for API response (exclude sensitive fields)
 * @returns {Object} Safe user data
 */
User.prototype.toJSON = function () {
  const user = {
    id: this.id,
    email: this.email,
    firstName: this.firstName,
    lastName: this.lastName,
    phone: this.phone,
    role: this.role,
    ...(this.role === 'delivery_partner' && { riderStatus: this.riderStatus }),
    avatarUrl: this.avatarUrl,
    isActive: this.isActive,
    isVerified: this.isVerified,
    createdAt: this.createdAt,
  };
  return user;
};

// Static Methods

/**
 * Hash password before saving
 * @param {string} plainPassword - Plaintext password
 * @returns {Promise<string>} Hashed password
 */
User.hashPassword = async function (plainPassword) {
  return bcrypt.hash(plainPassword, 12);
};

// Hooks

/**
 * Before create - hash password
 */
User.beforeCreate(async (user) => {
  if (user.passwordHash) {
    user.passwordHash = await User.hashPassword(user.passwordHash);
  }
});

/**
 * Before update - hash password if changed
 */
User.beforeUpdate(async (user) => {
  if (user.changed('passwordHash')) {
    user.passwordHash = await User.hashPassword(user.passwordHash);
    user.passwordChangedAt = new Date();
  }
});

module.exports = User;
