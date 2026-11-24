"""
Prueba de carga (VET-18 · RNF-01 · CA-03): N sesiones activas a la vez (por defecto 10)
abren la agenda y la ficha clínica de una cita. Criterio: cada apertura de ficha <= 3 s y 0 errores.

Requisitos: API levantada y `python seed.py` ejecutado.
Uso:  python load_test.py [--base-url http://localhost:8000] [--sessions 10] [--rounds 3]
"""
import argparse
import asyncio
import statistics
import sys
import time
from datetime import date, timedelta

import httpx

LIMIT_SECONDS = 3.0
TUTOR = ("tutor@vetconnect.cl", "Tutor123!")
VET = ("vet@vetconnect.cl", "Vet123!")
RECORD = {
    "pet_name": "Carga", "species": "Canino", "weight_kg": 10, "antecedents": "Prueba de carga",
    "vaccines": "Al día", "diagnosis": "Control", "treatment": "Ninguno", "prescription": "Ninguna",
}


async def login(client: httpx.AsyncClient, email: str, password: str) -> dict:
    r = await client.post("/api/v1/auth/login", json={"email": email, "password": password})
    r.raise_for_status()
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


async def prepare_appointment(client: httpx.AsyncClient) -> int:
    """Reserva un bloque libre del primer médico y le guarda una ficha, para tener qué abrir."""
    tutor = await login(client, *TUTOR)
    vet = await login(client, *VET)
    doctor_id = (await client.get("/api/v1/doctors")).json()[0]["id"]
    day = date.today()
    for _ in range(30):
        day += timedelta(days=1)
        if day.weekday() >= 5:
            continue
        slots = (await client.get("/api/v1/appointments/available-slots",
                                  params={"doctor_id": doctor_id, "date": day.isoformat()})).json()
        if slots:
            r = await client.post("/api/v1/appointments/reserve", headers=tutor,
                                  json={"doctor_id": doctor_id, **slots[-1]})
            r.raise_for_status()
            appt_id = r.json()["id"]
            (await client.put(f"/api/v1/medical-records/{appt_id}", json=RECORD, headers=vet)).raise_for_status()
            return appt_id
    sys.exit("No hay bloques libres en los próximos 30 días.")


async def session(base_url: str, appt_id: int, rounds: int) -> list[tuple[str, int, float]]:
    """Una sesión = un navegador: inicia sesión y repite (agenda -> ficha) `rounds` veces."""
    out = []
    async with httpx.AsyncClient(base_url=base_url, timeout=15) as client:
        headers = await login(client, *VET)
        for _ in range(rounds):
            for name, url in (("agenda", "/api/v1/appointments/agenda"),
                              ("ficha", f"/api/v1/medical-records/{appt_id}")):
                t0 = time.perf_counter()
                r = await client.get(url, headers=headers)
                out.append((name, r.status_code, time.perf_counter() - t0))
    return out


async def main(base_url: str, sessions: int, rounds: int) -> int:
    async with httpx.AsyncClient(base_url=base_url, timeout=15) as client:
        appt_id = await prepare_appointment(client)
        print(f"Cita de prueba #{appt_id}. Lanzando {sessions} sesiones x {rounds} rondas...\n")

    start = time.perf_counter()
    results = [x for batch in await asyncio.gather(*(session(base_url, appt_id, rounds) for _ in range(sessions)))
               for x in batch]
    total = time.perf_counter() - start

    errors = [r for r in results if r[1] != 200]
    ok = not errors
    for name in ("agenda", "ficha"):
        times = sorted(t for n, _, t in results if n == name)
        p95 = times[max(0, int(len(times) * 0.95) - 1)]
        print(f"{name:7s} n={len(times):3d}  media={statistics.mean(times) * 1000:6.0f} ms  "
              f"p95={p95 * 1000:6.0f} ms  máx={times[-1] * 1000:6.0f} ms")
        ok = ok and times[-1] <= LIMIT_SECONDS
    print(f"\nTiempo total: {total:.2f} s · errores HTTP: {len(errors)} · límite por petición {LIMIT_SECONDS} s")
    print("RESULTADO: OK ✔" if ok else "RESULTADO: FALLÓ ✘")
    return 0 if ok else 1


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url", default="http://localhost:8000")
    ap.add_argument("--sessions", type=int, default=10)
    ap.add_argument("--rounds", type=int, default=3)
    args = ap.parse_args()
    sys.exit(asyncio.run(main(args.base_url, max(1, args.sessions), max(1, args.rounds))))
