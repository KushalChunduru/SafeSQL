from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=str(BASE_DIR / ".env"), extra="ignore")

    # LLM
    llm_provider: str = "mock"  # mock | openai | anthropic | gemini
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-5"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.0-flash"  # free tier (AI Studio) eligible

    # DB
    db_backend: str = "duckdb"  # duckdb | postgres
    duckdb_path: str = "data/safesql.duckdb"

    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_db: str = "safesql"
    postgres_user: str = "safesql_app"
    postgres_password: str = "safesql_app_pw"
    postgres_readonly_user: str = "safesql_reader"
    postgres_readonly_password: str = "safesql_reader_pw"

    # Guardrails
    max_row_limit: int = 1000
    max_subquery_depth: int = 3
    max_explain_row_estimate: int = 500_000
    enable_explain_guardrail: bool = True

    # Hallucination detection
    back_translation_min_alignment: float = 0.55
    enable_multi_query_validation: bool = True

    @property
    def duckdb_abs_path(self) -> str:
        p = Path(self.duckdb_path)
        if not p.is_absolute():
            p = BASE_DIR / p
        return str(p)


@lru_cache
def get_settings() -> Settings:
    return Settings()
