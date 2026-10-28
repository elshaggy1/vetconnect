# Pruebas del backend

Cubren los incrementos del Sprint 2: **ficha clínica**, **PDF de la receta** y **notificaciones por correo**.

```bash
cd backend
pip install -r requirements-dev.txt
docker compose up -d            # PostgreSQL 15 (desde la raíz del repo)
pytest -v                       # crea la base vetconnect_test si no existe
```

* `TEST_DATABASE_URL` (opcional) cambia la base; **debe terminar en `_test`**: la suite borra datos.
* Usa PostgreSQL real porque la regla anti-solapamiento (`EXCLUDE` + `btree_gist`) no existe en SQLite.
* No se envían correos reales: sin `SMTP_*` la app corre en modo demo, y las pruebas de SMTP usan un doble de `smtplib`.

| Archivo | Qué verifica |
|---|---|
| `tests/test_medical_records.py` | Crear/actualizar (upsert) la ficha, paso de la cita a `COMPLETED`, permisos por rol, validación 422/404 |
| `tests/test_prescription_pdf.py` | PDF válido, cabeceras, contenido (paciente, médico, tutor, receta), caracteres fuera de latin-1, textos largos, permisos |
| `tests/test_notifications.py` | Correo de confirmación, flujo SMTP (STARTTLS → login → envío), errores SMTP, recordatorio 24 h, y que `/reserve` dispare (o no) los correos |

## Pruebas `xfail(strict=True)`
Documentan defectos detectados. Fallan hoy a propósito; cuando se corrija el defecto, el test pasa,
`strict` lo marca como error y basta quitar el decorador.

1. Un TUTOR puede leer la ficha clínica de otro tutor (falta validar propiedad de la cita).
2. Un servidor SMTP caído (`ConnectionRefusedError`) no se captura en `_send_smtp_email`.
3. El recordatorio de 24 h compara hora local de la clínica con `utcnow()` (desfase de 3-4 h).

> `test_basic_functionality.py` y `test_implementation.py` (raíz) son scripts manuales que no
> forman parte de la suite de `pytest`.
