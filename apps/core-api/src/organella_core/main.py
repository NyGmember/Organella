from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from organella_core.api.v1.auth import router as auth_router
from organella_core.api.v1.doctor_opd import router as doctor_opd_router
from organella_core.api.v1.fhir import router as fhir_router
from organella_core.api.v1.master_data import router as master_data_router
from organella_core.api.v1.modules import router as modules_router
from organella_core.api.v1.patients import router as patients_router
from organella_core.config import settings

app = FastAPI(
    title=settings.app_name,
    description="Generic Health Engine & Healthcare Micro-Frontend Backend Shell",
    version="0.1.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS Middleware
origins = [origin.strip() for origin in settings.allowed_origins.split(",") if origin.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Core API Routers
app.include_router(auth_router, prefix="/api/v1")
app.include_router(patients_router, prefix="/api/v1")
app.include_router(modules_router, prefix="/api/v1")
app.include_router(master_data_router, prefix="/api/v1")
app.include_router(doctor_opd_router, prefix="/api/v1")
app.include_router(fhir_router)


@app.get("/health", tags=["System"])
async def health_check():
    """Health check endpoint to verify system status"""
    return {
        "status": "healthy",
        "app": settings.app_name,
        "env": settings.app_env,
        "version": "0.1.0",
    }


@app.get("/api/v1/system/info", tags=["System"])
async def system_info():
    """Platform system metadata and supported standards"""
    return {
        "name": "Organella Platform",
        "standards": ["HL7 FHIR R4", "ICD-10", "LOINC", "SNOMED CT"],
        "license": "AGPL-3.0",
        "architecture": "Generic Health Engine + Micro-Frontend Slots",
    }
