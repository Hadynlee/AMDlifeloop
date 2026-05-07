from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
  database_url: str = "postgresql://lifeloop:lifeloop@localhost:5432/lifeloop"
  grid_size_meters: int = 350
  app_env: str = "local"
  google_places_api_key: str = ""

  model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


settings = Settings()
