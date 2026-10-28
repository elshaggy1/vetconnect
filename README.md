# VetConnect Maule · Sistema de agendamiento, ficha clínica y notificaciones

Plataforma web para clínicas veterinarias basada en **FastAPI + PostgreSQL 15** (Backend) y **Angular 17+ con Tailwind CSS** (Frontend).

Las colisiones de horario se impiden directamente en la **base de datos** mediante una restricción `EXCLUDE USING gist` sobre `tsrange(start_time, end_time)`: si dos reservas llegan exactamente al mismo tiempo, PostgreSQL acepta una y rechaza la otra, respondiendo la API con un estado `409 Conflict`.

---

## 🛠️ Requisitos del sistema

- **Python:** 3.11+
- **Node.js:** 18.13+ o 20+
- **Angular CLI:** 17+ (`npm i -g @angular/cli`)
- **Base de Datos:** Docker (recomendado) o instancia local de PostgreSQL 15+ con extensión `btree_gist`.

---

## 🚀 Inicio rápido

### 1. Base de datos

```bash
docker compose up -d          # Levanta PostgreSQL 15 en localhost:5432 (db: vetconnect)
```

> _Sin Docker:_ Crea la base de datos `vetconnect` manualmente y configura `DATABASE_URL` en `backend/.env`. La extensión `btree_gist` y las tablas se crean automáticamente al iniciar la API.

### 2. Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate    # En Windows: .venv\Scripts\activate

pip install -r requirements.txt
export DATABASE_URL=postgresql+asyncpg://postgres:postgres@localhost:5432/vetconnect
export SECRET_KEY=una-clave-larga-y-aleatoria

python seed.py               # Crea usuarios y médicos de prueba
uvicorn main:app --reload --port 8000
```

📍 **Documentación interactiva Swagger:** [http://localhost:8000/docs](http://localhost:8000/docs)

#### 👥 Usuarios de prueba (Seed Data)

| Usuario                   | Contraseña  | Rol           | Descripción                       |
| ------------------------- | ----------- | ------------- | --------------------------------- |
| `admin@vetconnect.cl`     | `Admin123!` | ADMIN         | Administrador general del sistema |
| `tutor@vetconnect.cl`     | `Tutor123!` | TUTOR         | Cliente / Tutor de mascotas       |
| `vet@vetconnect.cl`       | `Vet123!`   | VETERINARIO   | Médico veterinario principal      |
| `vet2@vetconnect.cl`      | `Vet123!`   | VETERINARIO   | Segundo médico en selección       |
| `recepcion@vetconnect.cl` | `Recep123!` | RECEPCIONISTA | Gestión de recepción y agenda     |

### 3. Frontend

```bash
# Desde la raíz del repositorio
cd vetconnect-web
npm install
ng serve                                            # Disponible en http://localhost:4200
```

---

## 📦 Funcionalidades e Incrementos

### 📅 Agendamiento y Recepción (VET-11, VET-12)

- **Gestión por Tutor:** Consulta de citas propias (`GET /appointments/my`), cancelación (`PATCH /{id}/cancel`) y reprogramación (`PATCH /{id}/reschedule`).
- **Panel de Recepción:** Visualización de agenda diaria global (`GET /appointments/agenda`) y actualización de estados (`ARRIVED`, `COMPLETED`, `CANCELLED`).

### 🩺 Ficha Clínica y Recetas PDF (VET-13, VET-14)

- **Ficha Médica:** Registro y consulta de peso, antecedentes, vacunas, diagnóstico y tratamiento (`GET/PUT /medical-records/{appointment_id}`).
- **Receta en PDF:** Generación dinámica con `fpdf2` (`GET /medical-records/{appointment_id}/pdf`) que incluye datos del paciente, médico, tutor y prescripción médica formal.

### ✉️ Servicio de Notificaciones (VET-15)

- **Confirmación inmediata:** Envío automático de correos en segundo plano (`BackgroundTasks`) al realizar una reserva.
- **Recordatorio 24h:** Programación de correos previos a la cita usando la zona horaria oficial de la clínica (`America/Santiago`).
- **Modo Demo / Producción:** Funciona sin servidor SMTP (imprimiendo en consola) o con SMTP real según las variables de entorno.

---

## 🧪 Pruebas y Calidad

### Suite de Pruebas Automáticas (`pytest`)

La suite de pruebas utiliza una base de datos PostgreSQL real (debido al soporte de `btree_gist`).

```bash
cd backend
pytest -v
```

> **Nota:** Las pruebas crearán/usarán la base `vetconnect_test`. La variable `TEST_DATABASE_URL` debe terminar siempre en `_test` ya que la suite limpia los datos al ejecutarse.

#### Cobertura de Tests (`backend/tests/`):

- `test_medical_records.py`: Creación/actualización de fichas, cambio de estado a `COMPLETED` y control de acceso por roles.
- `test_prescription_pdf.py`: Validación de la estructura y encabezados del PDF generado.
- `test_notifications.py`: Envío de correos de confirmación, flujos SMTP y recordatorios de 24h.

### Prueba de Concurrencia Manual

Para verificar la protección contra reservas dobles a nivel de base de datos:

```bash
cd backend
python test_concurrency.py --n 5
```

> Ejecuta 5 peticiones simultáneas sobre el mismo bloque de horario. Resultado esperado: exactamente **1 respuesta 201 Created** y **4 respuestas 409 Conflict**.

---

## 💡 Notas de Arquitectura

- **Prevención de carreras (Race conditions):** Se evita el patrón "SELECT y luego INSERT". La reserva se inserta directamente dejando que la base de datos fuerce la restricción `EXCLUDE` y capturando la excepción `IntegrityError` (SQLSTATE `23P01`).
- **Manejo de rangos contiguos:** Los rangos `tsrange` usan intervalos semiabiertos `[)`, permitiendo que bloques contiguos (ej. 09:00–09:30 y 09:30–10:00) coexistan sin colisión.
- **Liberación de cupos:** Las citas con estado `CANCELLED` quedan fuera de la restricción `EXCLUDE`, dejando el bloque libre automáticamente para nuevas reservas.
- **Zona Horaria:** Todas las fechas y horas se procesan y almacenan considerando la zona horaria de la clínica (`America/Santiago`).
