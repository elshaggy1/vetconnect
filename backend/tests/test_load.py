"""Carga (VET-18 · RNF-01 · CA-03): 10 sesiones concurrentes abren la ficha clínica en <= 3 s.

Versión en proceso (sin uvicorn) del script `load_test.py`, para que corra en la suite.
"""
import asyncio
import time

import pytest

from tests.conftest import VALID_RECORD

pytestmark = pytest.mark.integration

VET = "vet@vetconnect.cl"
SESSIONS = 10
LIMIT_SECONDS = 3.0


async def test_ten_concurrent_sessions_open_record_within_3s(client, login, make_appointment):
    appt = await make_appointment()
    headers = await login(VET)
    assert (await client.put(f"/api/v1/medical-records/{appt}", json=VALID_RECORD, headers=headers)).status_code == 200

    async def open_record():
        t0 = time.perf_counter()
        agenda = await client.get("/api/v1/appointments/agenda", headers=headers)
        record = await client.get(f"/api/v1/medical-records/{appt}", headers=headers)
        return agenda.status_code, record.status_code, time.perf_counter() - t0

    results = await asyncio.gather(*(open_record() for _ in range(SESSIONS)))

    assert all(a == 200 and r == 200 for a, r, _ in results)
    assert max(t for *_, t in results) <= LIMIT_SECONDS
