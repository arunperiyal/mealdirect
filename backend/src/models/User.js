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
        : DataTypes.ENUM('customer', 'restaurant_admin', 'system_admin'),
      defaultValue: 'customer',
      allowNull: false,
      validate: {
        isIn: {
          args: [['customer', 'restaurant_admin', 'system_admin']],
          msg: 'Role must be one of: customer, restaurant_admin, system_admin'
        }
      }
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
    lastLoginAt: {
      type: DataTypes.DATE,
      allowNull: true,
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
        { fields: ['isActive'] },
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
  }
});

module.exports = User;
