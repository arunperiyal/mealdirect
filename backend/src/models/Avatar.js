const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const isSqlite = sequelize.options.dialect === 'sqlite';

// A user's profile picture, kept in its own table so loading a user never loads the image.
// The apps resize it to a small JPEG before uploading. See routes/avatars.js.
const Avatar = sequelize.define(
  'Avatar',
  {
    userId: {
      type: isSqlite ? DataTypes.STRING : DataTypes.UUID,
      primaryKey: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
    },
    data: {
      type: DataTypes.BLOB,
      allowNull: false,
    },
    mimeType: {
      type: DataTypes.STRING,
      allowNull: false,
    },
  },
  {
    tableName: 'avatars',
    timestamps: true,
  }
);

module.exports = Avatar;
