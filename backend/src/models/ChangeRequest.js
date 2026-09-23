const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const isSqlite = sequelize.options.dialect === 'sqlite';
const id = () => (isSqlite ? DataTypes.STRING : DataTypes.UUID);

// A change to an approved restaurant's or rider's details that waits for an admin.
// The current details stay in use until it's approved.
const ChangeRequest = sequelize.define(
  'ChangeRequest',
  {
    id: {
      type: id(),
      defaultValue: isSqlite ? () => require('crypto').randomUUID() : DataTypes.UUIDV4,
      primaryKey: true,
    },
    // What is being changed: a restaurant (by its id) or a rider (by their user id)
    subjectType: {
      type: isSqlite ? DataTypes.STRING : DataTypes.ENUM('restaurant', 'rider'),
      allowNull: false,
      validate: { isIn: { args: [['restaurant', 'rider']], msg: 'Invalid subject type' } },
    },
    subjectId: {
      type: id(),
      allowNull: false,
    },
    kind: {
      type: isSqlite ? DataTypes.STRING : DataTypes.ENUM('payout', 'personal'),
      allowNull: false,
      validate: { isIn: { args: [['payout', 'personal']], msg: 'Invalid change kind' } },
    },
    // The new values, e.g. { upiId, bankAccountNumber, ... } or { firstName, phone }
    changes: {
      type: DataTypes.JSON,
      allowNull: false,
    },
    status: {
      type: isSqlite ? DataTypes.STRING : DataTypes.ENUM('pending', 'approved', 'rejected'),
      allowNull: false,
      defaultValue: 'pending',
      validate: { isIn: { args: [['pending', 'approved', 'rejected']], msg: 'Invalid status' } },
    },
    requestedById: {
      type: id(),
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'RESTRICT',
    },
    reviewedById: {
      type: id(),
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'SET NULL',
    },
    reviewedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    // Shown to the restaurant or rider, required when rejecting
    reviewNote: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
  },
  {
    timestamps: true,
    tableName: 'ChangeRequests',
    indexes: isSqlite ? [] : [{ fields: ['subject_type', 'subject_id', 'kind'] }, { fields: ['status'] }],
  }
);

module.exports = ChangeRequest;
