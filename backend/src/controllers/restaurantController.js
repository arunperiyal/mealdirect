const { Restaurant, User } = require('../models');

// Helper: throw standardized errors
const throwError = (code, message, statusCode = 400) => {
  throw { code, message, statusCode };
};

// Helper: verify restaurant ownership
const verifyOwnership = async (restaurantId, userId) => {
  const restaurant = await Restaurant.findByPk(restaurantId);
  if (!restaurant) throwError('NOT_FOUND', 'Restaurant not found', 404);
  if (restaurant.ownerId !== userId) {
    throwError('FORBIDDEN', 'You do not own this restaurant', 403);
  }
  return restaurant;
};

// 1. Create new restaurant (pending approval)
const createRestaurant = async (userId, data) => {
  try {
    const { name, email, phone, description, address, city, zipCode } = data;

    const existingEmail = await Restaurant.findOne({ where: { email } });
    if (existingEmail) {
      throwError('EMAIL_EXISTS', 'Restaurant email already registered', 409);
    }

    const restaurant = await Restaurant.create({
      name,
      email,
      phone,
      description,
      address,
      city,
      zipCode,
      ownerId: userId,
      verificationStatus: 'pending',
      isApproved: false,
    });

    return restaurant;
  } catch (error) {
    if (error.code) throw error;
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

// 2. Get restaurant by ID (public view - no sensitive data)
const getRestaurant = async (restaurantId) => {
  try {
    const restaurant = await Restaurant.findByPk(restaurantId, {
      attributes: {
        exclude: ['bankAccountNumber', 'bankIFSC', 'upiId', 'verificationNotes'],
      },
      include: [
        { model: User, as: 'owner', attributes: ['id', 'email', 'firstName', 'lastName'] },
      ],
    });

    if (!restaurant) throwError('NOT_FOUND', 'Restaurant not found', 404);
    return restaurant;
  } catch (error) {
    if (error.code) throw error;
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

// 3. Update restaurant details (owner/admin only)
const updateRestaurant = async (restaurantId, userId, data) => {
  try {
    const restaurant = await verifyOwnership(restaurantId, userId);

    const { name, phone, description, address, city, zipCode, latitude, longitude } = data;

    if (name) restaurant.name = name;
    if (phone) restaurant.phone = phone;
    if (description) restaurant.description = description;
    if (address) restaurant.address = address;
    if (city) restaurant.city = city;
    if (zipCode) restaurant.zipCode = zipCode;
    if (latitude !== undefined) restaurant.latitude = latitude;
    if (longitude !== undefined) restaurant.longitude = longitude;

    await restaurant.save();
    return restaurant;
  } catch (error) {
    if (error.code) throw error;
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

// 4. List restaurants with filters
const listRestaurants = async (filters = {}) => {
  try {
    const { city, isApproved, search, limit = 20, offset = 0 } = filters;
    const where = {};

    if (city) where.city = city;
    if (isApproved !== undefined) where.isApproved = isApproved;
    if (search) {
      const { Op } = require('sequelize');
      where[Op.or] = [
        { name: { [Op.iLike]: `%${search}%` } },
        { description: { [Op.iLike]: `%${search}%` } },
      ];
    }

    const { count, rows } = await Restaurant.findAndCountAll({
      where,
      limit: Math.min(limit, 100),
      offset,
      attributes: {
        exclude: ['bankAccountNumber', 'bankIFSC', 'upiId'],
      },
      order: [['createdAt', 'DESC']],
    });

    return { count, rows };
  } catch (error) {
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

// 5. Get restaurants by owner
const getRestaurantsByOwner = async (userId, limit = 20, offset = 0) => {
  try {
    const { count, rows } = await Restaurant.findAndCountAll({
      where: { ownerId: userId },
      limit: Math.min(limit, 100),
      offset,
      order: [['createdAt', 'DESC']],
    });

    return { count, rows };
  } catch (error) {
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

// 6. Approve restaurant (system_admin only)
const approveRestaurant = async (restaurantId, adminId, notes = '') => {
  try {
    const restaurant = await Restaurant.findByPk(restaurantId);
    if (!restaurant) throwError('NOT_FOUND', 'Restaurant not found', 404);

    if (restaurant.isApproved) {
      throwError('ALREADY_APPROVED', 'Restaurant is already approved', 409);
    }

    restaurant.isApproved = true;
    restaurant.verificationStatus = 'verified';
    restaurant.verificationNotes = notes || '';
    restaurant.approvedAt = new Date();
    restaurant.approvedBy = adminId;

    await restaurant.save();
    return restaurant;
  } catch (error) {
    if (error.code) throw error;
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

// 7. Reject restaurant (system_admin only)
const rejectRestaurant = async (restaurantId, adminId, notes = '') => {
  try {
    const restaurant = await Restaurant.findByPk(restaurantId);
    if (!restaurant) throwError('NOT_FOUND', 'Restaurant not found', 404);

    if (restaurant.verificationStatus === 'rejected') {
      throwError('ALREADY_REJECTED', 'Restaurant is already rejected', 409);
    }

    restaurant.verificationStatus = 'rejected';
    restaurant.verificationNotes = notes || '';
    restaurant.approvedBy = adminId;

    await restaurant.save();
    return restaurant;
  } catch (error) {
    if (error.code) throw error;
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

// 8. Update operating hours
const updateOperatingHours = async (restaurantId, userId, hours) => {
  try {
    const restaurant = await verifyOwnership(restaurantId, userId);

    if (hours && typeof hours === 'object') {
      restaurant.operatingHours = hours;
      await restaurant.save();
    }

    return restaurant;
  } catch (error) {
    if (error.code) throw error;
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

// 9. Update delivery settings
const updateDeliverySettings = async (restaurantId, userId, settings) => {
  try {
    const restaurant = await verifyOwnership(restaurantId, userId);

    const {
      deliveryEnabled,
      pickupEnabled,
      defaultDeliveryFee,
      minOrderForDelivery,
    } = settings;

    if (deliveryEnabled !== undefined) restaurant.deliveryEnabled = deliveryEnabled;
    if (pickupEnabled !== undefined) restaurant.pickupEnabled = pickupEnabled;
    if (defaultDeliveryFee !== undefined) restaurant.defaultDeliveryFee = defaultDeliveryFee;
    if (minOrderForDelivery !== undefined) restaurant.minOrderForDelivery = minOrderForDelivery;

    await restaurant.save();
    return restaurant;
  } catch (error) {
    if (error.code) throw error;
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

// 10. Update bank details
const updateBankDetails = async (restaurantId, userId, details) => {
  try {
    const restaurant = await verifyOwnership(restaurantId, userId);

    const { bankAccountName, bankAccountNumber, bankIFSC, upiId } = details;

    if (bankAccountName) restaurant.bankAccountName = bankAccountName;
    if (bankAccountNumber) restaurant.bankAccountNumber = bankAccountNumber;
    if (bankIFSC) restaurant.bankIFSC = bankIFSC;
    if (upiId) restaurant.upiId = upiId;

    await restaurant.save();
    return restaurant;
  } catch (error) {
    if (error.code) throw error;
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

module.exports = {
  createRestaurant,
  getRestaurant,
  updateRestaurant,
  listRestaurants,
  getRestaurantsByOwner,
  approveRestaurant,
  rejectRestaurant,
  updateOperatingHours,
  updateDeliverySettings,
  updateBankDetails,
};
