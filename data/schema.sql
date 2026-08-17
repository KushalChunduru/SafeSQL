-- SafeSQL sample domain: e-commerce analytics
-- Dialect-neutral DDL (works on DuckDB and PostgreSQL)

CREATE TABLE customers (
    customer_id   INTEGER PRIMARY KEY,
    first_name    VARCHAR NOT NULL,
    last_name     VARCHAR NOT NULL,
    email         VARCHAR NOT NULL,
    country       VARCHAR NOT NULL,
    signup_date   DATE NOT NULL
);

CREATE TABLE categories (
    category_id   INTEGER PRIMARY KEY,
    category_name VARCHAR NOT NULL
);

CREATE TABLE products (
    product_id    INTEGER PRIMARY KEY,
    product_name  VARCHAR NOT NULL,
    category_id   INTEGER NOT NULL REFERENCES categories(category_id),
    unit_price    DECIMAL(10, 2) NOT NULL,
    cost          DECIMAL(10, 2) NOT NULL
);

CREATE TABLE orders (
    order_id       INTEGER PRIMARY KEY,
    customer_id    INTEGER NOT NULL REFERENCES customers(customer_id),
    order_date     DATE NOT NULL,
    status         VARCHAR NOT NULL,   -- placed | shipped | delivered | cancelled | refunded
    shipping_cost  DECIMAL(10, 2) NOT NULL
);

CREATE TABLE order_items (
    order_item_id  INTEGER PRIMARY KEY,
    order_id       INTEGER NOT NULL REFERENCES orders(order_id),
    product_id     INTEGER NOT NULL REFERENCES products(product_id),
    quantity       INTEGER NOT NULL,
    unit_price     DECIMAL(10, 2) NOT NULL,  -- price at time of sale
    discount       DECIMAL(10, 2) NOT NULL DEFAULT 0  -- absolute discount applied to this line
);

CREATE TABLE reviews (
    review_id    INTEGER PRIMARY KEY,
    product_id   INTEGER NOT NULL REFERENCES products(product_id),
    customer_id  INTEGER NOT NULL REFERENCES customers(customer_id),
    rating       INTEGER NOT NULL,  -- 1-5
    review_date  DATE NOT NULL,
    comment      VARCHAR
);
