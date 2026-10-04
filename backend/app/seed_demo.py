"""Proxy runner for seed_demo when called as `python -m app.seed_demo`."""
import sys
import os

# Ensure backend root is on sys.path
backend_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_root not in sys.path:
    sys.path.insert(0, backend_root)

from seed_demo import run_demo_seed

if __name__ == "__main__":
    from app.db import SessionLocal
    from app.models import Member, Booking, CourtSlot, Payment, Lead, Employee, Shift, Payroll
    from sqlalchemy import select, func

    with SessionLocal() as s:
        run_demo_seed(s)
        print("--- Demo Seed Table Counts (via app.seed_demo) ---")
        for model in (Member, Booking, CourtSlot, Payment, Lead, Employee, Shift, Payroll):
            c = s.execute(select(func.count(model.id))).scalar_one()
            print(f"{model.__name__}: {c}")
    print("Demo seed completed successfully.")
