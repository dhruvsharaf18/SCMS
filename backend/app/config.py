from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Runtime configuration, read from the environment (see .env.example, SRS 11.3)."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    database_url: str
    session_hours: int = 12
    cookie_secure: bool = False
    allowed_origins: str = "http://localhost:5173,http://localhost:8080"
    seed: bool = False
    seed_password: str = "Club@12345"

    # JWT access-token settings (Part B)
    jwt_secret: str = "change_me_use_a_strong_random_32_char_string"
    access_token_expire_minutes: int = 60

    # Encrypted login (feat/encrypted-login).  Set to false in production so that
    # a network observer can never see plaintext credentials even by downgrading.
    login_allow_plaintext: bool = True

    # Tax-inclusive rates in percent (SRS 4.6).
    tax_court: int = 18
    tax_shop: int = 18
    tax_bar: int = 5
    tax_membership: int = 18

    @property
    def allowed_origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


settings = Settings()

# SRS 1.4: stored time is UTC; "day" for limits and reports is the IST calendar day.
# Never hard-code +05:30 (SRS 8).
CLUB_TZ = ZoneInfo("Asia/Kolkata")


def local_date(moment: datetime) -> date:
    """The club-local calendar date a UTC instant falls on."""
    return moment.astimezone(CLUB_TZ).date()


def day_bounds_utc(day: date) -> tuple[datetime, datetime]:
    """[start, end) UTC bounds of one IST calendar day."""
    start = datetime.combine(day, time.min, tzinfo=CLUB_TZ)
    return start.astimezone(timezone.utc), (start + timedelta(days=1)).astimezone(timezone.utc)
