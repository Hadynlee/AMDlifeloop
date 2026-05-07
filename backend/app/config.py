from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
  database_url: str = "postgresql://lifeloop:lifeloop@localhost:5432/lifeloop"
  grid_size_meters: int = 350
  app_env: str = "local"
  social_agent_api_key: str = ""
  google_places_api_key: str = ""
  google_maps_api_key: str = ""
  google_places_search_radius_meters: int = 1500

  model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


settings = Settings()
