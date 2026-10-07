const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const isSqlite = sequelize.options.dialect === 'sqlite';
const id = isSqlite ? DataTypes.STRING : DataTypes.UUID;

const stars = (allowNull) => ({
  type: DataTypes.INTEGER,
  allowNull,
  validate: { min: { args: [1], msg: 'Ratings go from 1 to 5' }, max: { args: [5], msg: 'Ratings go from 1 to 5' } },
});

// A customer's rating of one delivered order: the food (the restaurant) and, when a
// rider delivered it, the delivery (the rider). See controllers/ratingController.js.
const Rating = sequelize.define(
  'Rating',
  {
    id: {
      type: id,
      defaultValue: isSqlite ? () => require('crypto').randomUUID() : DataTypes.UUIDV4,
      primaryKey: true,
    },
    orderId: {
      type: id,
      allowNull: false,
      unique: true,
      references: { model: 'Orders', key: 'id' },
      onDelete: 'CASCADE',
    },
    customerId: { type: id, allowNull: false, references: { model: 'users', key: 'id' } },
    restaurantId: { type: id, allowNull: false, references: { model: 'Restaurants', key: 'id' } },
    riderId: { type: id, allowNull: true, references: { model: 'users', key: 'id' } },
    foodRating: stars(false),
    foodComment: { type: DataTypes.TEXT, allowNull: true },
    deliveryRating: stars(true),
    deliveryComment: { type: DataTypes.TEXT, allowNull: true },
  },
  {
    tableName: 'Ratings',
    timestamps: true,
    indexes: isSqlite ? [] : [{ fields: ['restaurant_id', 'created_at'] }, { fields: ['rider_id', 'created_at'] }],
  }
);

module.exports = Rating;
