from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .db import run_migrations
from .routers.location import router as location_router
from .routers.matching import router as matching_router
from .routers.processing import router as processing_router
from .routers.recommendations import router as recommendations_router
from .routers.runtime import router as runtime_router
from .routers.users import router as users_router

app = FastAPI(
  title="LifeLoop API",
  version="0.1.0",
  description="Privacy-first routine matching MVP backend",
)

app.add_middleware(
  CORSMiddleware,
  allow_origins=["*"],
  allow_credentials=True,
  allow_methods=["*"],
  allow_headers=["*"],
)


@app.on_event("startup")
def startup() -> None:
  run_migrations()


@app.get("/")
def root() -> dict[str, str]:
  return {"message": "LifeLoop API is running"}


@app.get("/health")
def health() -> dict[str, str]:
  return {"status": "ok"}


app.include_router(users_router)
app.include_router(location_router)
app.include_router(processing_router)
app.include_router(matching_router)
app.include_router(recommendations_router)
app.include_router(runtime_router)
