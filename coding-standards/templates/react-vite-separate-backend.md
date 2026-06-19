# React (Vite) + Separate Backend

```
frontend/
├── src/
│   ├── components/{ui, common, layout, features}
│   ├── pages/{auth, dashboard}
│   ├── hooks/
│   ├── stores/
│   ├── lib/api.ts       # fetch wrapper with Bearer token
│   ├── router.tsx       # React Router
│   └── types/
├── tests/
└── .env.local           # VITE_API_URL=http://localhost:8000/api/v1
```

## API Client

```typescript
const API_BASE = import.meta.env.VITE_API_URL;

export async function api<T>(endpoint: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = localStorage.getItem('access_token');
  const res = await fetch(`${API_BASE}${endpoint}`, {
    method: options.method ?? 'GET',
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }) },
    ...(options.body && { body: JSON.stringify(options.body) }),
  });
  if (res.status === 401) { localStorage.removeItem('access_token'); window.location.href = '/login'; }
  return res.json();
}
```
