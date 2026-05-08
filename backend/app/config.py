from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
  database_url: str = "postgresql://lifeloop:lifeloop@localhost:5432/lifeloop"
  grid_size_meters: int = 350
  app_env: str = "local"
  social_agent_api_key: str = ""
  openai_api_key: str = ""
  social_agent_base_url: str = "https://api.openai.com/v1"
  social_agent_model: str = "gpt-4.1-mini"
  social_agent_timeout_seconds: float = 20.0
  google_places_api_key: str = ""
  google_maps_api_key: str = ""
  google_places_search_radius_meters: int = 1500

  model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")


settings = Settings()
