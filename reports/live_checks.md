# Live checks

- Target: `http://localhost:8080/api/v1`
- Run id: 435, started 2026-10-04 01:54:46 IST
- Script: temp folder outside repo (`%TEMP%\ccms_live\live_checks.py`), httpx async

| check | result | status codes | key value |
|---|---|---|---|
| 1. 20 concurrent bookings, same slot | PASS | 201x1, 409x19 | court 1 @ 2026-10-05T00:30:00Z; 409 codes={'SLOT_TAKEN': 19}; booking_id=[497] |
| 1b. DB: court_slots rows for winning booking | PASS | psql exit 0 | rows by booking_id=2, rows in court/hour window=2 |
| 2. Booking at 12:15 start | PASS | 422 | start_at=2026-10-05T12:15:00+05:30; error=INVALID_SLOT |
| 3. Member 3rd booking same IST day | PASS | [201, 201, 409]; cancels [200, 200] | day 2026-10-06; 3rd error=DAILY_LIMIT_REACHED; created+cancelled ids=[517, 518] |
| 4. Two concurrent orders, stock 1 | PASS | product 201; orders [201, 409]; GET product 200 | product 170 (TMP-435-59116); 409 error=['OUT_OF_STOCK']; stock api=0, db=0 |
| 5. member2 reads another member | PASS | me 200; member 404; history 404 | own member_id=2, requested=1; error=NOT_FOUND |
| 6. desk calls POST /products | PASS | 403 | error=FORBIDDEN |

**Totals:** PASS 7, FAIL 0, BLOCKED 0

## Log

```
run 435 started 2026-10-04T01:54:46.934830+05:30
login desk@club.test: 200
login member2@club.test: 200
login manager@club.test: 200
check1 slot: court 1 start 2026-10-05T00:30:00Z
[PASS] 1. 20 concurrent bookings, same slot | 201x1, 409x19 | court 1 @ 2026-10-05T00:30:00Z; 409 codes={'SLOT_TAKEN': 19}; booking_id=[497]
[PASS] 1b. DB: court_slots rows for winning booking | psql exit 0 | rows by booking_id=2, rows in court/hour window=2
[PASS] 2. Booking at 12:15 start | 422 | start_at=2026-10-05T12:15:00+05:30; error=INVALID_SLOT
check3 day 2026-10-06 court 1 slots ['2026-10-06T00:30:00Z', '2026-10-06T01:30:00Z', '2026-10-06T02:30:00Z']
[PASS] 3. Member 3rd booking same IST day | [201, 201, 409]; cancels [200, 200] | day 2026-10-06; 3rd error=DAILY_LIMIT_REACHED; created+cancelled ids=[517, 518]
[PASS] 4. Two concurrent orders, stock 1 | product 201; orders [201, 409]; GET product 200 | product 170 (TMP-435-59116); 409 error=['OUT_OF_STOCK']; stock api=0, db=0
[PASS] 5. member2 reads another member | me 200; member 404; history 404 | own member_id=2, requested=1; error=NOT_FOUND
[PASS] 6. desk calls POST /products | 403 | error=FORBIDDEN
```
