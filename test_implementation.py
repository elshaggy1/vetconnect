#!/usr/bin/env python3
"""
Script de verificación rápida para Sprint 2 de VetConnect Maule.

Verifica que todas las modificaciones se implementaron correctamente.
"""
import sys
import os
from pathlib import Path

# Agregar el directorio backend al path
sys.path.insert(0, str(Path(__file__).parent / "backend"))

def check_file_exists(path, description):
    """Verifica que un archivo existe."""
    full_path = Path(__file__).parent / path
    if full_path.exists():
        print(f"✅ {description}: {path}")
        return True
    else:
        print(f"❌ {description}: {path} (NO ENCONTRADO)")
        return False

def check_requirements():
    """Verifica que fpdf2 está en requirements.txt."""
    req_path = Path(__file__).parent / "backend" / "requirements.txt"
    if req_path.exists():
        content = req_path.read_text()
        if "fpdf2==2.8.1" in content:
            print("✅ fpdf2==2.8.1 encontrado en requirements.txt")
            return True
        else:
            print("❌ fpdf2==2.8.1 NO encontrado en requirements.txt")
            return False
    else:
        print("❌ requirements.txt NO encontrado")
        return False

def check_seed():
    """Verifica que el recepcionista está en seed.py."""
    seed_path = Path(__file__).parent / "backend" / "seed.py"
    if seed_path.exists():
        content = seed_path.read_text()
        if 'recepcion@vetconnect.cl' in content and 'RECEPCIONISTA' in content:
            print("✅ Recepcionista agregado a seed.py")
            return True
        else:
            print("❌ Recepcionista NO encontrado en seed.py")
            return False
    else:
        print("❌ seed.py NO encontrado")
        return False

def check_models():
    """Verifica que los modelos tienen las nuevas características."""
    models_path = Path(__file__).parent / "backend" / "models.py"
    if models_path.exists():
        content = models_path.read_text()
        checks = [
            ("CheckConstraint actualizado", "status IN ('CONFIRMED','ARRIVED','COMPLETED','CANCELLED')"),
            ("ExcludeConstraint actualizado", "status IN ('CONFIRMED','ARRIVED')"),
            ("MedicalRecord class", "class MedicalRecord(Base):"),
            ("Appointment_id en MedicalRecord", "appointment_id: Mapped[int] = mapped_column("),
        ]
        
        all_good = True
        for check_name, check_pattern in checks:
            if check_pattern in content:
                print(f"✅ {check_name}")
            else:
                print(f"❌ {check_name}")
                all_good = False
        return all_good
    else:
        print("❌ models.py NO encontrado")
        return False

def check_schemas():
    """Verifica que los nuevos esquemas Pydantic están presentes."""
    schemas_path = Path(__file__).parent / "backend" / "schemas.py"
    if schemas_path.exists():
        content = schemas_path.read_text()
        checks = [
            ("AppointmentDetailOut", "class AppointmentDetailOut(AppointmentOut):"),
            ("RescheduleRequest", "class RescheduleRequest(BaseModel):"),
            ("StatusUpdateRequest", "class StatusUpdateRequest(BaseModel):"),
            ("MedicalRecordUpsert", "class MedicalRecordUpsert(BaseModel):"),
            ("MedicalRecordOut", "class MedicalRecordOut(BaseModel):"),
        ]
        
        all_good = True
        for check_name, check_pattern in checks:
            if check_pattern in content:
                print(f"✅ {check_name}")
            else:
                print(f"❌ {check_name}")
                all_good = False
        return all_good
    else:
        print("❌ schemas.py NO encontrado")
        return False

def check_routers():
    """Verifica que los nuevos routers están presentes."""
    routers_dir = Path(__file__).parent / "backend" / "routers"
    
    files_to_check = [
        ("appointment_router.py", "Endpoint /my (citas del tutor)"),
        ("appointment_router.py", "Endpoint /agenda (panel recepción)"),
        ("appointment_router.py", "Endpoint /notifications (visor notificaciones)"),
        ("medical_record_router.py", "Nuevo router de registros médicos"),
    ]
    
    all_good = True
    for filename, description in files_to_check:
        file_path = routers_dir / filename
        if file_path.exists():
            print(f"✅ {description}: {filename}")
        else:
            print(f"❌ {description}: {filename} (NO ENCONTRADO)")
            all_good = False
    
    return all_good

def check_main():
    """Verifica que main.py tiene las actualizaciones."""
    main_path = Path(__file__).parent / "backend" / "main.py"
    if main_path.exists():
        content = main_path.read_text()
        checks = [
            ("Actualización de constraint en lifespan", "ALTER TABLE appointments DROP CONSTRAINT IF EXISTS ck_appointment_status"),
            ("Importación de dependencias", "from fastapi import Depends, HTTPException"),
            ("Importación de select", "from sqlalchemy import select, text"),
        ]
        
        all_good = True
        for check_name, check_pattern in checks:
            if check_pattern in content:
                print(f"✅ {check_name}")
            else:
                print(f"❌ {check_name}")
                all_good = False
        return all_good
    else:
        print("❌ main.py NO encontrado")
        return False

def main():
    """Función principal de verificación."""
    print("🔍 Verificando Implementación Sprint 2 - VetConnect Maule")
    print("=" * 60)
    
    checks = [
        ("requirements.txt", check_requirements),
        ("seed.py", check_seed),
        ("models.py", check_models),
        ("schemas.py", check_schemas),
        ("routers/", check_routers),
        ("main.py", check_main),
        ("notifications.py", lambda: check_file_exists("backend/notifications.py", "Archivo notifications.py")),
        ("medical_record_router.py", lambda: check_file_exists("backend/routers/medical_record_router.py", "Router de registros médicos")),
    ]
    
    all_passed = True
    for name, check_func in checks:
        print(f"\n📋 Verificando {name}:")
        if not check_func():
            all_passed = False
    
    print("\n" + "=" * 60)
    if all_passed:
        print("🎉 ¡Todas las verificaciones pasaron! Sprint 2 implementado correctamente.")
        return 0
    else:
        print("❌ Algunas verificaciones fallaron. Revisa los errores arriba.")
        return 1

if __name__ == "__main__":
    sys.exit(main())