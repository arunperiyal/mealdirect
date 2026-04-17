// Import all models
const User = require('./User');
const Restaurant = require('./Restaurant');
const Menu = require('./Menu');
const DeliverySlot = require('./DeliverySlot');
const Order = require('./Order');

// Define associations
User.hasMany(Restaurant, { foreignKey: 'ownerId', as: 'restaurants' });
Restaurant.belongsTo(User, { foreignKey: 'ownerId', as: 'owner' });

User.hasMany(Order, { foreignKey: 'customerId', as: 'orders' });
Order.belongsTo(User, { foreignKey: 'customerId', as: 'customer' });

Restaurant.hasMany(Menu, { foreignKey: 'restaurantId', as: 'menus' });
Menu.belongsTo(Restaurant, { foreignKey: 'restaurantId', as: 'restaurant' });

Menu.hasMany(DeliverySlot, { foreignKey: 'menuId', as: 'deliverySlots' });
DeliverySlot.belongsTo(Menu, { foreignKey: 'menuId', as: 'menu' });

Restaurant.hasMany(DeliverySlot, { foreignKey: 'restaurantId', as: 'slots' });
DeliverySlot.belongsTo(Restaurant, { foreignKey: 'restaurantId', as: 'restaurant' });

Restaurant.hasMany(Order, { foreignKey: 'restaurantId', as: 'orders' });
Order.belongsTo(Restaurant, { foreignKey: 'restaurantId', as: 'restaurant' });

Menu.hasMany(Order, { foreignKey: 'menuId', as: 'orders' });
Order.belongsTo(Menu, { foreignKey: 'menuId', as: 'menu' });

DeliverySlot.hasMany(Order, { foreignKey: 'deliverySlotId', as: 'orders' });
Order.belongsTo(DeliverySlot, { foreignKey: 'deliverySlotId', as: 'deliverySlot' });

// Export models
module.exports = {
  User,
  Restaurant,
  Menu,
  DeliverySlot,
  Order,
};
