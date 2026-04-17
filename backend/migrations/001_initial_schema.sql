-- ============================================================================
-- Mess Delivery App - Initial Database Schema
-- ============================================================================
-- This schema creates the core tables for the mess delivery application
-- Tables: Users, Restaurants, Menus, Dishes, Orders, Reviews

-- ============================================================================
-- Users Table (with role-based access control)
-- ============================================================================
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  first_name VARCHAR(100),
  last_name VARCHAR(100),
  phone_number VARCHAR(20),
  role VARCHAR(50) NOT NULL DEFAULT 'customer',
  
  -- Role-specific fields
  -- For restaurant_admin: link to restaurant
  restaurant_id INTEGER,
  
  -- Account status
  is_active BOOLEAN DEFAULT true,
  is_verified BOOLEAN DEFAULT false,
  verification_token VARCHAR(255),
  verified_at TIMESTAMP,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  
  -- Constraints
  CONSTRAINT check_role CHECK (role IN ('customer', 'restaurant_admin', 'system_admin')),
  CONSTRAINT check_email_format CHECK (email ~ '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}$')
);

-- ============================================================================
-- Restaurants Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS restaurants (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  phone_number VARCHAR(20),
  email VARCHAR(255),
  
  -- Location
  address TEXT,
  city VARCHAR(100),
  state VARCHAR(100),
  postal_code VARCHAR(20),
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  
  -- Images
  logo_url VARCHAR(500),
  cover_image_url VARCHAR(500),
  
  -- Rating
  average_rating DECIMAL(3, 2) DEFAULT 0,
  rating_count INTEGER DEFAULT 0,
  
  -- Business details
  owner_id INTEGER NOT NULL,
  bank_account VARCHAR(255),
  bank_ifsc VARCHAR(20),
  bank_holder_name VARCHAR(255),
  
  -- Settings
  delivery_enabled BOOLEAN DEFAULT true,
  pickup_enabled BOOLEAN DEFAULT true,
  default_delivery_fee DECIMAL(10, 2) DEFAULT 0,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  is_approved BOOLEAN DEFAULT false,
  approval_status VARCHAR(50) DEFAULT 'pending',
  rejection_reason TEXT,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  
  -- Constraints
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT check_approval_status CHECK (approval_status IN ('pending', 'approved', 'rejected', 'suspended'))
);

-- ============================================================================
-- Menus Table (Daily menus)
-- ============================================================================
CREATE TABLE IF NOT EXISTS menus (
  id SERIAL PRIMARY KEY,
  restaurant_id INTEGER NOT NULL,
  menu_date DATE NOT NULL,
  
  -- Ordering constraints
  ordering_start_time TIME NOT NULL,
  ordering_end_time TIME NOT NULL,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  is_published BOOLEAN DEFAULT false,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  
  -- Constraints
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE,
  UNIQUE(restaurant_id, menu_date),
  CONSTRAINT check_time_order CHECK (ordering_start_time < ordering_end_time)
);

-- ============================================================================
-- Dishes Table (Menu items)
-- ============================================================================
CREATE TABLE IF NOT EXISTS dishes (
  id SERIAL PRIMARY KEY,
  restaurant_id INTEGER NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  price DECIMAL(10, 2) NOT NULL,
  image_url VARCHAR(500),
  
  -- Availability
  is_available BOOLEAN DEFAULT true,
  is_vegetarian BOOLEAN DEFAULT false,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  
  -- Constraints
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE,
  CONSTRAINT check_price CHECK (price >= 0)
);

-- ============================================================================
-- Menu Items Junction Table (Dishes in specific menus)
-- ============================================================================
CREATE TABLE IF NOT EXISTS menu_items (
  id SERIAL PRIMARY KEY,
  menu_id INTEGER NOT NULL,
  dish_id INTEGER NOT NULL,
  quantity_available INTEGER DEFAULT -1,
  quantity_sold INTEGER DEFAULT 0,
  
  FOREIGN KEY (menu_id) REFERENCES menus(id) ON DELETE CASCADE,
  FOREIGN KEY (dish_id) REFERENCES dishes(id) ON DELETE CASCADE,
  UNIQUE(menu_id, dish_id)
);

-- ============================================================================
-- Delivery Slots Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS delivery_slots (
  id SERIAL PRIMARY KEY,
  menu_id INTEGER NOT NULL,
  delivery_time TIME NOT NULL,
  max_orders INTEGER NOT NULL DEFAULT 100,
  current_orders INTEGER DEFAULT 0,
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  FOREIGN KEY (menu_id) REFERENCES menus(id) ON DELETE CASCADE,
  UNIQUE(menu_id, delivery_time),
  CONSTRAINT check_max_orders CHECK (max_orders > 0)
);

-- ============================================================================
-- Addresses Table (Customer delivery addresses)
-- ============================================================================
CREATE TABLE IF NOT EXISTS addresses (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  address_line1 VARCHAR(255) NOT NULL,
  address_line2 VARCHAR(255),
  city VARCHAR(100) NOT NULL,
  state VARCHAR(100),
  postal_code VARCHAR(20),
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  address_type VARCHAR(50) DEFAULT 'home',
  is_default BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- ============================================================================
-- Orders Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  menu_id INTEGER NOT NULL,
  restaurant_id INTEGER NOT NULL,
  customer_id INTEGER NOT NULL,
  
  -- Delivery information
  delivery_type VARCHAR(50) NOT NULL,
  delivery_slot_id INTEGER,
  delivery_address_id INTEGER,
  
  -- Pricing
  subtotal DECIMAL(10, 2) NOT NULL,
  delivery_fee DECIMAL(10, 2) DEFAULT 0,
  discount DECIMAL(10, 2) DEFAULT 0,
  total DECIMAL(10, 2) NOT NULL,
  
  -- Payment
  payment_method VARCHAR(50) NOT NULL,
  payment_status VARCHAR(50) DEFAULT 'pending',
  transaction_id VARCHAR(255),
  
  -- Order status
  status VARCHAR(50) DEFAULT 'pending',
  
  -- Additional info
  special_instructions TEXT,
  estimated_delivery_time TIMESTAMP,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  
  -- Constraints
  FOREIGN KEY (menu_id) REFERENCES menus(id) ON DELETE RESTRICT,
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE RESTRICT,
  FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE RESTRICT,
  FOREIGN KEY (delivery_slot_id) REFERENCES delivery_slots(id) ON DELETE SET NULL,
  FOREIGN KEY (delivery_address_id) REFERENCES addresses(id) ON DELETE SET NULL,
  CONSTRAINT check_delivery_type CHECK (delivery_type IN ('delivery', 'pickup')),
  CONSTRAINT check_payment_method CHECK (payment_method IN ('card', 'cod')),
  CONSTRAINT check_payment_status CHECK (payment_status IN ('pending', 'completed', 'failed', 'refunded')),
  CONSTRAINT check_order_status CHECK (status IN ('pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'picked_up', 'cancelled'))
);

-- ============================================================================
-- Order Items Table (Items in orders)
-- ============================================================================
CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL,
  dish_id INTEGER NOT NULL,
  quantity INTEGER NOT NULL,
  price DECIMAL(10, 2) NOT NULL,
  special_instructions TEXT,
  
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (dish_id) REFERENCES dishes(id) ON DELETE RESTRICT,
  CONSTRAINT check_quantity CHECK (quantity > 0)
);

-- ============================================================================
-- Reviews Table
-- ============================================================================
CREATE TABLE IF NOT EXISTS reviews (
  id SERIAL PRIMARY KEY,
  restaurant_id INTEGER,
  dish_id INTEGER,
  customer_id INTEGER NOT NULL,
  order_id INTEGER,
  
  rating INTEGER NOT NULL,
  comment TEXT,
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (restaurant_id) REFERENCES restaurants(id) ON DELETE CASCADE,
  FOREIGN KEY (dish_id) REFERENCES dishes(id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL,
  CONSTRAINT check_rating CHECK (rating >= 1 AND rating <= 5),
  CONSTRAINT check_review_type CHECK (
    (restaurant_id IS NOT NULL AND dish_id IS NULL) OR
    (restaurant_id IS NULL AND dish_id IS NOT NULL)
  )
);

-- ============================================================================
-- Payments Table (Payment transaction history)
-- ============================================================================
CREATE TABLE IF NOT EXISTS payments (
  id SERIAL PRIMARY KEY,
  order_id INTEGER NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  payment_method VARCHAR(50) NOT NULL,
  transaction_id VARCHAR(255),
  status VARCHAR(50) DEFAULT 'pending',
  
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE RESTRICT,
  CONSTRAINT check_payment_status CHECK (status IN ('pending', 'completed', 'failed', 'refunded'))
);

-- ============================================================================
-- Indexes (for performance)
-- ============================================================================
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_restaurants_owner_id ON restaurants(owner_id);
CREATE INDEX idx_restaurants_is_approved ON restaurants(is_approved);
CREATE INDEX idx_menus_restaurant_id ON menus(restaurant_id);
CREATE INDEX idx_menus_menu_date ON menus(menu_date);
CREATE INDEX idx_dishes_restaurant_id ON dishes(restaurant_id);
CREATE INDEX idx_menu_items_menu_id ON menu_items(menu_id);
CREATE INDEX idx_delivery_slots_menu_id ON delivery_slots(menu_id);
CREATE INDEX idx_addresses_user_id ON addresses(user_id);
CREATE INDEX idx_orders_customer_id ON orders(customer_id);
CREATE INDEX idx_orders_restaurant_id ON orders(restaurant_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_created_at ON orders(created_at);
CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_reviews_restaurant_id ON reviews(restaurant_id);
CREATE INDEX idx_reviews_customer_id ON reviews(customer_id);
CREATE INDEX idx_payments_order_id ON payments(order_id);

-- ============================================================================
-- Schema created successfully
-- ============================================================================
