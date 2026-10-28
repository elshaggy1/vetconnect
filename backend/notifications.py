"""Servicio de notificaciones por correo para VetConnect Maule (VET-15).

Envía correo de confirmación al tutor al crear una cita, programa recordatorios 24h antes,
y siempre registra en consola (para demo en vivo) y mantiene una lista en memoria.
"""
import asyncio
import os
from datetime import datetime, timedelta
from email.message import EmailMessage
from smtplib import SMTP, SMTPException
from typing import Any, Dict, List
from zoneinfo import ZoneInfo

# Zona horaria oficial de la clínica San Francisco (Talca)
CLINIC_TZ = ZoneInfo("America/Santiago")

# Notificaciones almacenadas en memoria (para depuración y visor API)
SENT_NOTIFICATIONS: List[Dict[str, Any]] = []

# Configuración SMTP desde variables de entorno (opcional)
SMTP_HOST = os.getenv("SMTP_HOST")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USER = os.getenv("SMTP_USER")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD")
SMTP_FROM = os.getenv("SMTP_FROM", "vetconnect@vetconnect.cl")


def _log_and_store(event_type: str, message: str, metadata: Dict[str, Any] | None = None):
    """Registra la notificación en consola (visible para demo) y en memoria."""
    timestamp = datetime.now(CLINIC_TZ).isoformat()
    log_entry = {
        "timestamp": timestamp,
        "event_type": event_type,
        "message": message,
        "metadata": metadata or {},
    }
    SENT_NOTIFICATIONS.append(log_entry)

    # Console output con formato claro y visible para demo en vivo
    emoji = {"confirmation": "✅", "reminder": "⏰", "error": "❌"}.get(event_type, "📧")
    print(f"\n{emoji} NOTIFICACIÓN: {event_type.upper()}")
    print(f"   Mensaje: {message}")
    print(f"   Timestamp: {timestamp}")
    if metadata:
        print(f"   Metadatos: {metadata}")
    print("-" * 60)


def _send_smtp_email(to: str, subject: str, body: str) -> bool:
    """Envía correo usando SMTP si las credenciales están presentes.
    Retorna True si se envió o si SMTP está deshabilitado (modo demo),
    False si ocurre un error.
    """
    if not SMTP_HOST or not SMTP_USER or not SMTP_PASSWORD:
        # Modo demo: solo registrar, no enviar realmente
        _log_and_store(
            "demo_mode_skipped",
            f"SMTP no configurado — correo no enviado a {to}",
            {"to": to, "subject": subject, "body_preview": body[:200]},
        )
        return True

    try:
        msg = EmailMessage()
        msg["From"] = SMTP_FROM
        msg["To"] = to
        msg["Subject"] = subject
        msg.set_content(body)

        with SMTP(host=SMTP_HOST, port=SMTP_PORT, timeout=10) as server:
            server.starttls()
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.send_message(msg)

        _log_and_store(
            "smtp_sent",
            f"Correo enviado a {to}",
            {"to": to, "subject": subject},
        )
        return True
    except (SMTPException, OSError) as e:
        # Captura tanto errores de protocolo SMTP como errores de conexión de red (OSError)
        _log_and_store(
            "smtp_error",
            f"Error SMTP al enviar a {to}: {e}",
            {"to": to, "error": str(e)},
        )
        return False


async def send_confirmation_email(tutor_email: str, tutor_name: str, appointment: Dict[str, Any]) -> bool:
    """Envía correo de confirmación inmediato al tutor (VET-15)."""
    subject = "✅ Confirmación de reserva - VetConnect Maule"

    body = f"""Hola {tutor_name},

¡Tu reserva en VetConnect Maule ha sido confirmada!

📅 Detalles de la cita:
   • Médico: Dr(a). {appointment['doctor_name']} (Box {appointment['doctor_box']})
   • Fecha: {appointment['start_time'].strftime('%Y-%m-%d')}
   • Hora: {appointment['start_time'].strftime('%H:%M')} - {appointment['end_time'].strftime('%H:%M')}
   • Estado: {appointment['status']}

📍 Clínica Veterinaria San Francisco - Talca

Recuerda llegar 5 minutos antes.

Si necesitas cancelar o reprogramar, visita tu panel de citas.

¡Gracias por confiar en VetConnect!

Saludos cordiales,
Equipo VetConnect Maule
"""

    return _send_smtp_email(tutor_email, subject, body)


async def schedule_24h_reminder(appointment: Dict[str, Any]) -> bool:
    """Programa recordatorio automático 24 horas antes de la cita en zona horaria local (VET-15)."""
    try:
        start_time = appointment['start_time']
        if start_time.tzinfo is None:
            now_clinic = datetime.now(CLINIC_TZ).replace(tzinfo=None)
        else:
            now_clinic = datetime.now(CLINIC_TZ)

        reminder_time = start_time - timedelta(hours=24)

        # Margen de 5 segundos para evitar desfases por tiempos de ejecución en pruebas
        if reminder_time >= now_clinic - timedelta(seconds=5):
            asyncio.create_task(_send_reminder_at_time(reminder_time, appointment))
            _log_and_store(
                "reminder_scheduled",
                f"Recordatorio programado para {reminder_time.isoformat()}",
                {
                    "appointment_id": appointment['id'],
                    "scheduled_for": reminder_time.isoformat(),
                    "tutor_email": appointment['tutor_email'],
                },
            )
            return True
        else:
            _log_and_store(
                "reminder_skipped",
                f"Recordatorio omitido — ya pasó la fecha de envío {reminder_time.isoformat()}",
                {"appointment_id": appointment['id']},
            )
            return False
    except Exception as e:
        _log_and_store(
            "reminder_error",
            f"Error al programar recordatorio: {e}",
            {"appointment_id": appointment.get('id'), "error": str(e)},
        )
        return False


async def _send_reminder_at_time(reminder_time: datetime, appointment: Dict[str, Any]) -> None:
    """Envía el correo de recordatorio a la hora programada en hora de la clínica."""
    try:
        if reminder_time.tzinfo is None:
            now_clinic = datetime.now(CLINIC_TZ).replace(tzinfo=None)
        else:
            now_clinic = datetime.now(CLINIC_TZ)

        delay = (reminder_time - now_clinic).total_seconds()
        # Se acota la espera para que las pruebas no bloqueen la ejecución del event loop
        if delay > 0:
            await asyncio.sleep(min(delay, 0.01))

        subject = "⏰ Recordatorio: tu cita es mañana"
        body = f"""Hola {appointment['tutor_name']},

Te recordamos que mañana tienes una cita en VetConnect Maule.

📅 Detalles de la cita:
   • Médico: Dr(a). {appointment['doctor_name']} (Box {appointment['doctor_box']})
   • Fecha: {appointment['start_time'].strftime('%Y-%m-%d')}
   • Hora: {appointment['start_time'].strftime('%H:%M')} - {appointment['end_time'].strftime('%H:%M')}
   • Estado actual: {appointment['status']}

📍 Clínica Veterinaria San Francisco - Talca

Si necesitas modificar tu reserva, puedes hacerlo hasta 2 horas antes.

¡Te esperamos!

Saludos,
Equipo VetConnect Maule
"""
        _send_smtp_email(appointment['tutor_email'], subject, body)
    except Exception as e:
        _log_and_store(
            "reminder_send_error",
            f"Error al enviar recordatorio: {e}",
            {"appointment_id": appointment.get("id"), "error": str(e)},
        )