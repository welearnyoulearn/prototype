# TypeScript Conventions

## tsconfig.json - Strict Mode

```json
{
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
```

## Naming Conventions

| Thing | Convention | Example |
|-------|-----------|---------|
| Variables / Functions | camelCase | `getUserById`, `isActive` |
| Types / Interfaces | PascalCase | `UserProfile`, `ApiResponse` |
| Constants | UPPER_SNAKE_CASE | `MAX_RETRIES`, `API_BASE_URL` |
| Files (components) | PascalCase | `UserCard.tsx`, `LoginForm.tsx` |
| Files (utils/hooks) | camelCase | `useAuth.ts`, `formatDate.ts` |
| Folders | kebab-case | `user-profile/`, `auth-utils/` |
| Enums | PascalCase (members too) | `enum Role { Admin, User }` |
| Boolean vars | is/has/can prefix | `isLoading`, `hasPermission`, `canEdit` |

## Type Rules

```typescript
// NEVER use `any` - use `unknown` if type is truly unknown
// BAD
const data: any = fetchData();

// GOOD
const data: unknown = fetchData();
if (isUserResponse(data)) {
  // now typed
}

// Always type function params and return types
function getUser(id: string): Promise<User | null> { ... }

// Prefer `interface` for object shapes, `type` for unions/intersections
interface User {
  id: string;
  email: string;
  role: Role;
}

type ApiResult<T> = { data: T; error: null } | { data: null; error: string };

// Use `as const` for literal types
const ROLES = ['admin', 'user', 'viewer'] as const;
type Role = (typeof ROLES)[number];
```

## Import Order

```typescript
// 1. Node/built-in modules
import path from 'path';

// 2. External packages
import { useState } from 'react';
import { z } from 'zod';

// 3. Internal aliases (@/)
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';

// 4. Relative imports
import { validateEmail } from './utils';
import type { FormProps } from './types';
```

## Error Handling

```typescript
interface AppError {
  code: string;
  message: string;
  statusCode: number;
}

class ApiError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type Result<T, E = AppError> =
  | { success: true; data: T }
  | { success: false; error: E };
```

## Zod for Validation

```typescript
import { z } from 'zod';

const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2).max(100),
  role: z.enum(['admin', 'user', 'viewer']),
});

type CreateUserInput = z.infer<typeof CreateUserSchema>;
```
