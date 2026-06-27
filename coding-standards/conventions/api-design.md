# API Design Conventions

## URL Patterns

```
GET    /api/v1/users          # List
GET    /api/v1/users/:id      # Get one
POST   /api/v1/users          # Create
PUT    /api/v1/users/:id      # Update (full)
PATCH  /api/v1/users/:id      # Update (partial)
DELETE /api/v1/users/:id      # Delete
POST   /api/v1/users/:id/activate   # Actions
```

## Standard Response Format

```json
// Success
{ "success": true, "data": { ... } }

// Success (list)
{ "success": true, "data": [...], "pagination": { "page": 1, "limit": 20, "total": 145, "totalPages": 8 } }

// Error
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "Email is required" } }
```

## HTTP Status Codes

| Code | When |
|------|------|
| 200 | Success (GET, PUT, PATCH) |
| 201 | Created (POST) |
| 204 | No content (DELETE) |
| 400 | Validation error |
| 401 | Not authenticated |
| 403 | Not authorized |
| 404 | Not found |
| 409 | Conflict (duplicate) |
| 429 | Rate limited |
| 500 | Server error |

## Next.js API Route Pattern

```typescript
// app/api/v1/users/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from 'next-auth';

const CreateUserSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json(
      { success: false, error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    );
  }

  const body = await req.json();
  const parsed = CreateUserSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: parsed.error.issues } },
      { status: 400 }
    );
  }

  const { data, error } = await supabase.from('users').insert(parsed.data).select().single();
  return NextResponse.json({ success: true, data }, { status: 201 });
}
```
