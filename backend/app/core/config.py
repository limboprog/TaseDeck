from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg://aideck:aideck@localhost:5432/aideck"
    registry_base_url: str = "https://registry.modelcontextprotocol.io"
    sync_interval_hours: int = 6
    api_prefix: str = "/api/v1"
    cors_origins: str = "http://localhost:1420,tauri://localhost,http://tauri.localhost"


settings = Settings()
