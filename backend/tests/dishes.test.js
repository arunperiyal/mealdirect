const request = require('supertest');
const {
  registerAndLogin,
  getAuthHeaders,
  createRestaurant,
  approveRestaurant,
  createMenu,
  cleanupAllData,
} = require('./helpers');

let app, sequelize, models;
let ownerHeaders, otherOwnerHeaders, customerHeaders;
let restaurant, otherRestaurant;

// A restaurant's own dish list, and building menus from it
describe('My dishes', () => {
  beforeAll(async () => {
    app = require('../src/app');
    sequelize = require('../src/config/database');
    models = require('../src/models');
    await sequelize.sync({ force: true });

    const adminHeaders = getAuthHeaders((await registerAndLogin(app, 'dish-admin@test.com', 'system_admin')).tokens);
    const owner = await registerAndLogin(app, 'dish-owner@test.com', 'restaurant_admin');
    ownerHeaders = getAuthHeaders(owner.tokens);
    const other = await registerAndLogin(app, 'dish-other@test.com', 'restaurant_admin');
    otherOwnerHeaders = getAuthHeaders(other.tokens);
    customerHeaders = getAuthHeaders((await registerAndLogin(app, 'dish-cust@test.com', 'customer')).tokens);

    restaurant = await approveRestaurant(app, (await createRestaurant(app, owner.user.id, ownerHeaders)).id, adminHeaders);
    otherRestaurant = await approveRestaurant(app, (await createRestaurant(app, other.user.id, otherOwnerHeaders)).id, adminHeaders);
  });

  afterAll(async () => {
    await cleanupAllData(models);
    await sequelize.close();
  });

  const addDish = (body, headers = ownerHeaders) =>
    request(app).post('/api/dishes').set(headers).send({ restaurantId: restaurant.id, ...body });
  const list = async (query = '') =>
    (await request(app).get(`/api/dishes?restaurantId=${restaurant.id}${query}`).set(ownerHeaders)).body.data;
  const newMenu = async (date) => (await request(app).post('/api/menus').set(ownerHeaders).send({ restaurantId: restaurant.id, date })).body.data;
  const addToMenu = (menuId, items) => request(app).post(`/api/menus/${menuId}/items`).set(ownerHeaders).send({ items });

  test('owners add dishes, listed by name; names are unique ignoring case', async () => {
    const meals = await addDish({ name: 'South Indian Meals', price: 120, description: 'Rice, sambar, rasam' });
    expect(meals.status).toBe(201);
    expect(meals.body.data).toMatchObject({ name: 'South Indian Meals', description: 'Rice, sambar, rasam', archived: false });
    await addDish({ name: 'Biryani', price: 200, maxPerOrder: 2, maxPerDay: 3 });

    expect((await list()).map((d) => d.name)).toEqual(['Biryani', 'South Indian Meals']);

    const dup = await addDish({ name: '  south indian MEALS ', price: 100 });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('DISH_EXISTS');

    expect((await addDish({ name: 'Bad', price: -1 })).status).toBe(400);
    expect((await addDish({ name: 'Bad', price: 10, maxPerOrder: 5, maxPerDay: 2 })).body.code).toBe('INVALID_LIMITS');
  });

  test('only the owner sees or changes the list', async () => {
    const [dish] = await list();
    expect((await request(app).get(`/api/dishes?restaurantId=${restaurant.id}`).set(otherOwnerHeaders)).status).toBe(403);
    expect((await request(app).put(`/api/dishes/${dish.id}`).set(otherOwnerHeaders).send({ price: 1 })).status).toBe(403);
    expect((await addDish({ name: 'Sneaky', price: 1 }, otherOwnerHeaders)).status).toBe(403);
    expect((await request(app).get(`/api/dishes?restaurantId=${restaurant.id}`).set(customerHeaders)).status).toBe(403);
  });

  test('a menu is built from the list, keeping its own copy of each dish', async () => {
    const dishes = await list();
    const biryani = dishes.find((d) => d.name === 'Biryani');
    const meals = dishes.find((d) => d.name === 'South Indian Meals');
    const menu = await newMenu(new Date().toISOString().slice(0, 10));

    const res = await addToMenu(menu.id, [{ dishId: biryani.id }, { dishId: meals.id, price: 110 }]);
    expect(res.status).toBe(200);
    expect(res.body.data.items).toEqual([
      expect.objectContaining({ dishId: biryani.id, name: 'Biryani', price: 200, maxPerOrder: 2, maxPerDay: 3, available: true }),
      // A different price on this menu only
      expect.objectContaining({ dishId: meals.id, name: 'South Indian Meals', price: 110, description: 'Rice, sambar, rasam' }),
    ]);

    // Editing the dish afterwards doesn't change the menu
    await request(app).put(`/api/dishes/${biryani.id}`).set(ownerHeaders).send({ price: 250, name: 'Chicken Biryani' });
    const saved = (await request(app).get(`/api/menus/${menu.id}`)).body.data;
    expect(saved.items.find((i) => i.dishId === biryani.id)).toMatchObject({ name: 'Biryani', price: 200 });

    // ...but the next menu gets the new price
    const next = await newMenu('2099-01-01');
    const added = await addToMenu(next.id, [{ dishId: biryani.id }]);
    expect(added.body.data.items[0]).toMatchObject({ name: 'Chicken Biryani', price: 250 });

    const twice = await addToMenu(menu.id, [{ dishId: biryani.id }]);
    expect(twice.status).toBe(409);
    expect(twice.body.code).toBe('DISH_ALREADY_ON_MENU');
  });

  test("another restaurant's dish, or a removed one, can't go on a menu", async () => {
    const foreign = (await request(app).post('/api/dishes').set(otherOwnerHeaders).send({ restaurantId: otherRestaurant.id, name: 'Theirs', price: 5 })).body.data;
    const menu = await newMenu('2099-02-01');
    expect((await addToMenu(menu.id, [{ dishId: foreign.id }])).body.code).toBe('DISH_NOT_FOUND');

    const temp = (await addDish({ name: 'Seasonal', price: 60 })).body.data;
    await request(app).delete(`/api/dishes/${temp.id}`).set(ownerHeaders);
    expect((await addToMenu(menu.id, [{ dishId: temp.id }])).body.code).toBe('DISH_NOT_FOUND');
    expect((await addToMenu(menu.id, [{ price: 10 }])).status).toBe(400);
  });

  test('removed dishes are hidden, listed separately, and can come back', async () => {
    const dish = (await addDish({ name: 'Kesari', price: 30 })).body.data;
    const removed = await request(app).delete(`/api/dishes/${dish.id}`).set(ownerHeaders);
    expect(removed.body.data.archived).toBe(true);
    expect((await list()).map((d) => d.name)).not.toContain('Kesari');
    expect((await list('&archived=true')).map((d) => d.name)).toContain('Kesari');

    // Its name is free again, until it's restored
    const again = (await addDish({ name: 'Kesari', price: 35 })).body.data;
    expect((await request(app).post(`/api/dishes/${dish.id}/restore`).set(ownerHeaders)).body.code).toBe('DISH_EXISTS');
    await request(app).delete(`/api/dishes/${again.id}`).set(ownerHeaders);
    expect((await request(app).post(`/api/dishes/${dish.id}/restore`).set(ownerHeaders)).body.data.archived).toBe(false);
  });

  test('import fills the list from existing menus, newest version first, skipping names it has', async () => {
    const adminHeaders = getAuthHeaders((await registerAndLogin(app, 'imp-admin@test.com', 'system_admin')).tokens);
    const owner = await registerAndLogin(app, 'imp-owner@test.com', 'restaurant_admin');
    const headers = getAuthHeaders(owner.tokens);
    const r = await approveRestaurant(app, (await createRestaurant(app, owner.user.id, headers)).id, adminHeaders);
    await createMenu(app, r.id, headers, { date: '2026-09-01', items: [{ name: 'Dosa', price: 40 }, { name: 'Idli', price: 30 }] });
    await createMenu(app, r.id, headers, { date: '2026-09-10', items: [{ name: 'dosa', price: 45, maxPerDay: 4 }, { name: 'Vada', price: 20 }] });
    await request(app).post('/api/dishes').set(headers).send({ restaurantId: r.id, name: 'Vada', price: 25 });

    const res = await request(app).post('/api/dishes/import').set(headers).send({ restaurantId: r.id });
    expect(res.body.data.imported).toBe(2);
    expect(res.body.data.dishes.map((d) => [d.name, Number(d.price), d.maxPerDay])).toEqual([
      ['dosa', 45, 4],
      ['Idli', 30, null],
      ['Vada', 25, null],
    ]);

    // Running it again adds nothing
    expect((await request(app).post('/api/dishes/import').set(headers).send({ restaurantId: r.id })).body.data.imported).toBe(0);
  });
});
