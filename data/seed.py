"""Build and seed the SafeSQL sample database (DuckDB by default).

Usage:
    python data/seed.py [--rows-scale 1.0]

Deterministic (fixed Faker seed) so eval golden results stay stable across runs.
"""
import argparse
import random
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from faker import Faker
from sqlalchemy import text

from app.config import get_settings
from app.db import get_app_engine, reset_engine_cache

SEED = 42
CATEGORIES = [
    "Electronics", "Home & Kitchen", "Sports & Outdoors", "Books",
    "Beauty", "Toys & Games", "Office Supplies", "Pet Supplies",
]
STATUSES = ["placed", "shipped", "delivered", "cancelled", "refunded"]
STATUS_WEIGHTS = [0.10, 0.15, 0.60, 0.08, 0.07]

START_DATE = date(2023, 1, 1)
END_DATE = date(2026, 8, 16)


def rand_date(rng: random.Random, start: date, end: date) -> date:
    delta = (end - start).days
    return start + timedelta(days=rng.randint(0, delta))


def build_schema(conn):
    ddl_path = Path(__file__).resolve().parent / "schema.sql"
    ddl = ddl_path.read_text()
    for stmt in ddl.split(";"):
        stmt = stmt.strip()
        if stmt:
            conn.execute(text(stmt))


def seed(rows_scale: float = 1.0):
    settings = get_settings()
    if settings.db_backend == "duckdb":
        db_path = Path(settings.duckdb_abs_path)
        db_path.parent.mkdir(parents=True, exist_ok=True)
        if db_path.exists():
            db_path.unlink()

    reset_engine_cache()
    engine = get_app_engine()
    fake = Faker()
    Faker.seed(SEED)
    rng = random.Random(SEED)

    n_customers = int(500 * rows_scale)
    n_products = int(200 * rows_scale)
    n_orders = int(2000 * rows_scale)
    n_reviews = int(1500 * rows_scale)

    with engine.begin() as conn:
        build_schema(conn)

        # categories
        for i, name in enumerate(CATEGORIES, start=1):
            conn.execute(
                text("INSERT INTO categories (category_id, category_name) VALUES (:id, :name)"),
                {"id": i, "name": name},
            )

        # customers
        countries = ["US", "US", "US", "CA", "UK", "DE", "FR", "IN", "AU", "BR"]
        customers = []
        for i in range(1, n_customers + 1):
            customers.append({
                "id": i,
                "first_name": fake.first_name(),
                "last_name": fake.last_name(),
                "email": fake.unique.email(),
                "country": rng.choice(countries),
                "signup_date": rand_date(rng, START_DATE, END_DATE - timedelta(days=1)),
            })
        conn.execute(
            text("""INSERT INTO customers (customer_id, first_name, last_name, email, country, signup_date)
                     VALUES (:id, :first_name, :last_name, :email, :country, :signup_date)"""),
            customers,
        )

        # products
        products = []
        for i in range(1, n_products + 1):
            cost = round(rng.uniform(3, 300), 2)
            markup = rng.uniform(1.3, 3.0)
            products.append({
                "id": i,
                "name": f"{fake.word().capitalize()} {fake.word().capitalize()} {rng.choice(['Pro', 'Plus', 'Mini', 'Max', ''])}".strip(),
                "category_id": rng.randint(1, len(CATEGORIES)),
                "unit_price": round(cost * markup, 2),
                "cost": cost,
            })
        conn.execute(
            text("""INSERT INTO products (product_id, product_name, category_id, unit_price, cost)
                     VALUES (:id, :name, :category_id, :unit_price, :cost)"""),
            products,
        )

        # orders + order_items
        orders = []
        order_items = []
        item_id = 1
        for order_id in range(1, n_orders + 1):
            cust = rng.randint(1, n_customers)
            odate = rand_date(rng, START_DATE, END_DATE)
            status = rng.choices(STATUSES, weights=STATUS_WEIGHTS, k=1)[0]
            orders.append({
                "id": order_id,
                "customer_id": cust,
                "order_date": odate,
                "status": status,
                "shipping_cost": round(rng.uniform(0, 25), 2),
            })
            for _ in range(rng.randint(1, 5)):
                prod = products[rng.randint(0, n_products - 1)]
                qty = rng.randint(1, 4)
                discount = round(float(prod["unit_price"]) * qty * rng.choice([0, 0, 0, 0.05, 0.1, 0.2]), 2)
                order_items.append({
                    "id": item_id,
                    "order_id": order_id,
                    "product_id": prod["id"],
                    "quantity": qty,
                    "unit_price": prod["unit_price"],
                    "discount": discount,
                })
                item_id += 1

        conn.execute(
            text("""INSERT INTO orders (order_id, customer_id, order_date, status, shipping_cost)
                     VALUES (:id, :customer_id, :order_date, :status, :shipping_cost)"""),
            orders,
        )
        conn.execute(
            text("""INSERT INTO order_items (order_item_id, order_id, product_id, quantity, unit_price, discount)
                     VALUES (:id, :order_id, :product_id, :quantity, :unit_price, :discount)"""),
            order_items,
        )

        # reviews
        reviews = []
        for i in range(1, n_reviews + 1):
            reviews.append({
                "id": i,
                "product_id": rng.randint(1, n_products),
                "customer_id": rng.randint(1, n_customers),
                "rating": rng.choices([1, 2, 3, 4, 5], weights=[0.05, 0.07, 0.13, 0.35, 0.40], k=1)[0],
                "review_date": rand_date(rng, START_DATE, END_DATE),
                "comment": fake.sentence(nb_words=12),
            })
        conn.execute(
            text("""INSERT INTO reviews (review_id, product_id, customer_id, rating, review_date, comment)
                     VALUES (:id, :product_id, :customer_id, :rating, :review_date, :comment)"""),
            reviews,
        )

    print("Seed complete:")
    with engine.connect() as conn:
        for tbl in ["customers", "categories", "products", "orders", "order_items", "reviews"]:
            count = conn.execute(text(f"SELECT COUNT(*) FROM {tbl}")).scalar()
            print(f"  {tbl:15s} {count:>6} rows")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--rows-scale", type=float, default=1.0)
    args = parser.parse_args()
    seed(rows_scale=args.rows_scale)
