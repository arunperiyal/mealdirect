const { Op } = require('sequelize');
const sequelize = require('../config/database');
const { ChangeRequest, Restaurant, User } = require('../models');
const { PAYOUT_FIELDS } = require('../lib/payout');

/**
 * Changes to payout and personal details.
 *
 * Before an admin has approved a restaurant or rider, their details apply at once:
 * the admin reviews everything when approving. After that, a change waits as a
 * ChangeRequest until an admin approves it, and the current details stay in use.
 */

const throwError = (code, message, statusCode = 400) => {
  throw { code, message, statusCode };
};

const wrap = (fn) => async (...args) => {
  try {
    return await fn(...args);
  } catch (error) {
    if (error.code) throw error;
    throw { code: 'DB_ERROR', message: error.message, statusCode: 500 };
  }
};

const PERSONAL_FIELDS = ['firstName', 'lastName', 'phone'];
const FIELDS = { payout: PAYOUT_FIELDS, personal: PERSONAL_FIELDS };

const pick = (source, fields) => Object.fromEntries(fields.map((f) => [f, source[f] ?? null]));

// Only the fields that differ from what's saved
const diff = (subject, changes) =>
  Object.fromEntries(Object.entries(changes).filter(([f, v]) => (subject[f] ?? null) !== (v ?? null)));

const requestJson = (r) => ({
  id: r.id,
  kind: r.kind,
  status: r.status,
  changes: r.changes,
  reviewNote: r.reviewNote,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
  reviewedAt: r.reviewedAt,
});

/**
 * Apply now, or file (or update) the pending request for this subject and kind.
 * Returns { applied, changeRequest }.
 */
const submit = async ({ subject, subjectType, kind, changes, userId, reviewNeeded }) => {
  const changed = diff(subject, changes);
  const pending = await ChangeRequest.findOne({
    where: { subjectType, subjectId: subject.id, kind, status: 'pending' },
  });

  if (!reviewNeeded) {
    if (!Object.keys(changed).length) throwError('NO_CHANGES', 'Nothing has changed', 400);
    Object.assign(subject, changed);
    await subject.save();
    return { applied: true, changeRequest: null };
  }

  // Back to what's saved: drop the pending request instead of asking an admin to approve nothing
  if (!Object.keys(changed).length) {
    if (!pending) throwError('NO_CHANGES', 'Nothing has changed', 400);
    await pending.destroy();
    return { applied: false, changeRequest: null };
  }

  if (pending) {
    pending.changes = changed;
    pending.requestedById = userId;
    await pending.save();
    return { applied: false, changeRequest: requestJson(pending) };
  }
  const created = await ChangeRequest.create({
    subjectType,
    subjectId: subject.id,
    kind,
    changes: changed,
    requestedById: userId,
  });
  return { applied: false, changeRequest: requestJson(created) };
};

// The latest request of each kind that the owner should see: waiting, or turned down
const openRequests = async (subjectType, subjectIds) => {
  if (!subjectIds.length) return new Map();
  const rows = await ChangeRequest.findAll({
    where: { subjectType, subjectId: { [Op.in]: subjectIds } },
    order: [['updatedAt', 'DESC']],
  });
  const bySubject = new Map();
  for (const r of rows) {
    const seen = bySubject.get(r.subjectId) ?? {};
    // Only the newest request per kind counts; an approved one closes the matter
    if (!(r.kind in seen)) seen[r.kind] = r.status === 'approved' ? null : requestJson(r);
    bySubject.set(r.subjectId, seen);
  }
  return bySubject;
};

// ===== Restaurants =====

const findOwnedRestaurant = async (restaurantId, userId) => {
  const restaurant = await Restaurant.findByPk(restaurantId);
  if (!restaurant) throwError('NOT_FOUND', 'Restaurant not found', 404);
  if (restaurant.ownerId !== userId) throwError('FORBIDDEN', 'You do not own this restaurant', 403);
  return restaurant;
};

const submitRestaurantPayout = wrap(async (restaurantId, userId, details) => {
  const restaurant = await findOwnedRestaurant(restaurantId, userId);
  const result = await submit({
    subject: restaurant,
    subjectType: 'restaurant',
    kind: 'payout',
    changes: pick(details, PAYOUT_FIELDS),
    userId,
    reviewNeeded: restaurant.isApproved,
  });
  return { ...result, restaurant };
});

// Adds `changeRequests: { payout?, personal? }` to each of an owner's restaurants
const withRestaurantRequests = wrap(async (restaurants) => {
  const open = await openRequests('restaurant', restaurants.map((r) => r.id));
  return restaurants.map((r) => ({ ...r.toJSON(), changeRequests: open.get(r.id) ?? {} }));
});

// ===== Riders =====

const findRider = async (userId) => {
  const rider = await User.findByPk(userId);
  if (!rider || rider.role !== 'delivery_partner') throwError('FORBIDDEN', 'Not a delivery partner', 403);
  return rider;
};

const riderProfileJson = (rider, requests = {}) => ({
  ...pick(rider, ['id', 'email', 'riderStatus', ...PERSONAL_FIELDS, ...PAYOUT_FIELDS]),
  changeRequests: requests,
});

const getRiderProfile = wrap(async (userId) => {
  const rider = await findRider(userId);
  const open = await openRequests('rider', [rider.id]);
  return riderProfileJson(rider, open.get(rider.id));
});

const submitRiderChange = wrap(async (userId, kind, details) => {
  const rider = await findRider(userId);
  const result = await submit({
    subject: rider,
    subjectType: 'rider',
    kind,
    changes: pick(details, FIELDS[kind]),
    userId,
    // Pending riders are reviewed as a whole when approved. Suspended ones still need review.
    reviewNeeded: rider.riderStatus !== 'pending',
  });
  const open = await openRequests('rider', [rider.id]);
  return { ...result, profile: riderProfileJson(rider, open.get(rider.id)) };
});

// ===== Admin review =====

const loadSubject = async (request, options = {}) =>
  request.subjectType === 'restaurant'
    ? Restaurant.findByPk(request.subjectId, options)
    : User.findByPk(request.subjectId, options);

const subjectSummary = (request, subject) => {
  if (!subject) return null;
  return request.subjectType === 'restaurant'
    ? { id: subject.id, name: subject.name, city: subject.city, phone: subject.phone }
    : {
        id: subject.id,
        name: [subject.firstName, subject.lastName].filter(Boolean).join(' '),
        email: subject.email,
        phone: subject.phone,
      };
};

const adminJson = async (request) => {
  const subject = await loadSubject(request);
  return {
    ...requestJson(request),
    subjectType: request.subjectType,
    subject: subjectSummary(request, subject),
    // What's saved now, for comparing with `changes`
    current: subject ? pick(subject, Object.keys(request.changes)) : null,
    requestedBy: request.requestedBy
      ? { id: request.requestedBy.id, firstName: request.requestedBy.firstName, lastName: request.requestedBy.lastName }
      : null,
  };
};

const listRequests = wrap(async ({ status = 'pending' } = {}) => {
  const rows = await ChangeRequest.findAll({
    where: status === 'all' ? {} : { status },
    include: [{ model: User, as: 'requestedBy', attributes: ['id', 'firstName', 'lastName'] }],
    order: [['updatedAt', status === 'pending' ? 'ASC' : 'DESC']],
    limit: 100,
  });
  return Promise.all(rows.map(adminJson));
});

const findPending = async (id, transaction) => {
  const request = await ChangeRequest.findByPk(id, { transaction, lock: transaction?.LOCK?.UPDATE });
  if (!request) throwError('NOT_FOUND', 'Change request not found', 404);
  if (request.status !== 'pending') throwError('ALREADY_REVIEWED', `This change was already ${request.status}`, 409);
  return request;
};

const approveRequest = wrap(async (id, adminId, note) => {
  const request = await sequelize.transaction(async (transaction) => {
    const found = await findPending(id, transaction);
    const subject = await loadSubject(found, { transaction });
    if (!subject) throwError('NOT_FOUND', 'The restaurant or rider no longer exists', 404);
    Object.assign(subject, found.changes);
    await subject.save({ transaction });
    Object.assign(found, { status: 'approved', reviewedById: adminId, reviewedAt: new Date(), reviewNote: note || null });
    await found.save({ transaction });
    return found;
  });
  return adminJson(request);
});

const rejectRequest = wrap(async (id, adminId, note) => {
  const request = await findPending(id);
  Object.assign(request, { status: 'rejected', reviewedById: adminId, reviewedAt: new Date(), reviewNote: note });
  await request.save();
  return adminJson(request);
});

const countPending = wrap(async () => ChangeRequest.count({ where: { status: 'pending' } }));

module.exports = {
  PERSONAL_FIELDS,
  submitRestaurantPayout,
  withRestaurantRequests,
  getRiderProfile,
  submitRiderChange,
  listRequests,
  approveRequest,
  rejectRequest,
  countPending,
  openRequests,
};
