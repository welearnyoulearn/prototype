# Python Backend Conventions

## Framework: FastAPI

### Project Structure

```
project/
├── app/
│   ├── main.py
│   ├── config.py
│   ├── database.py
│   ├── models/
│   ├── schemas/
│   ├── routes/
│   ├── services/
│   ├── middleware/
│   └── utils/
├── tests/
├── alembic/
├── requirements.txt
├── Dockerfile
└── .env
```

### Naming: snake_case for files/functions, PascalCase for classes

### Route Pattern

```python
from fastapi import APIRouter, Depends, HTTPException, Query

router = APIRouter(prefix="/api/v1/users", tags=["users"])

@router.get("/")
async def list_users(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user = Depends(get_current_user),
):
    users, total = await service.list_users(page=page, limit=limit)
    return {
        "success": True,
        "data": users,
        "pagination": { "page": page, "limit": limit, "total": total, "total_pages": (total + limit - 1) // limit },
    }
```

### JWT Middleware

```python
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt

security = HTTPBearer()

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        payload = jwt.decode(credentials.credentials, settings.JWT_SECRET, algorithms=["HS256"])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
```

### Dependencies

```
fastapi uvicorn pydantic python-jose passlib[bcrypt] sqlalchemy alembic asyncpg python-dotenv httpx pytest
```
