from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_env: str = "development"
    app_name: str = "Organella"
    debug: bool = True
    port: int = 8000
    secret_key: str = "organella_insecure_development_secret_key_change_in_production"
    allowed_origins: str = "http://localhost:3000,http://localhost:5001"

    # Database
    database_url: str = (
        "postgresql+asyncpg://organella:organella_secret_change_me@localhost:5432/organella_core"
    )

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # FHIR
    fhir_base_url: str = "http://localhost:8000/fhir/r4"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
