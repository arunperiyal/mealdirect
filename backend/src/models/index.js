// Import all models
const User = require('./User');
const Restaurant = require('./Restaurant');
const Menu = require('./Menu');
const DeliverySlot = require('./DeliverySlot');
const Order = require('./Order');
const Payment = require('./Payment');
const Settlement = require('./Settlement');

// Define associations
User.hasMany(Restaurant, { foreignKey: 'ownerId', as: 'restaurants' });
Restaurant.belongsTo(User, { foreignKey: 'ownerId', as: 'owner' });

User.hasMany(Order, { foreignKey: 'customerId', as: 'orders' });
Order.belongsTo(User, { foreignKey: 'customerId', as: 'customer' });

User.hasMany(Order, { foreignKey: 'riderId', as: 'deliveries' });
Order.belongsTo(User, { foreignKey: 'riderId', as: 'rider' });

Order.belongsTo(User, { foreignKey: 'collectedById', as: 'collectedBy' });

User.hasMany(Settlement, { foreignKey: 'riderId', as: 'settlements' });
Settlement.belongsTo(User, { foreignKey: 'riderId', as: 'rider' });
Settlement.belongsTo(User, { foreignKey: 'recordedById', as: 'recordedBy' });

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

Order.hasMany(Payment, { foreignKey: 'orderId', as: 'payments' });
Payment.belongsTo(Order, { foreignKey: 'orderId', as: 'order' });

User.hasMany(Payment, { foreignKey: 'customerId', as: 'payments' });
Payment.belongsTo(User, { foreignKey: 'customerId', as: 'customer' });

// Export models
module.exports = {
  User,
  Restaurant,
  Menu,
  DeliverySlot,
  Order,
  Payment,
  Settlement,
};
