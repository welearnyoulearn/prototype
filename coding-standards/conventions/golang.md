# Golang Backend Conventions

## Framework: Gin

### Project Structure

```
project/
├── cmd/server/main.go
├── internal/
│   ├── config/
│   ├── database/
│   ├── models/
│   ├── handlers/
│   ├── services/
│   ├── middleware/
│   ├── repository/
│   └── utils/
├── migrations/
├── Dockerfile
├── go.mod
└── .env
```

### Naming: PascalCase exported, camelCase unexported, snake_case files

### Handler Pattern

```go
type UserHandler struct {
    service *services.UserService
}

func (h *UserHandler) ListUsers(c *gin.Context) {
    page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
    limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))

    users, total, err := h.service.ListUsers(c.Request.Context(), page, limit)
    if err != nil {
        utils.ErrorResponse(c, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error())
        return
    }

    c.JSON(http.StatusOK, utils.PaginatedResponse{
        Success: true, Data: users,
        Pagination: utils.Pagination{Page: page, Limit: limit, Total: total, TotalPages: (total + limit - 1) / limit},
    })
}
```

### JWT Middleware

```go
func AuthMiddleware(secret string) gin.HandlerFunc {
    return func(c *gin.Context) {
        tokenString := strings.TrimPrefix(c.GetHeader("Authorization"), "Bearer ")
        token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
            return []byte(secret), nil
        })
        if err != nil || !token.Valid {
            utils.ErrorResponse(c, http.StatusUnauthorized, "UNAUTHORIZED", "Invalid token")
            c.Abort()
            return
        }
        claims := token.Claims.(jwt.MapClaims)
        c.Set("userId", claims["sub"])
        c.Next()
    }
}
```

### Dependencies

```
gin-gonic/gin, golang-jwt/jwt/v5, jmoiron/sqlx, lib/pq, joho/godotenv
```
