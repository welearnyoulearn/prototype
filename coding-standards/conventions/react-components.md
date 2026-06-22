# React Component Conventions

## data-testid Rule (NON-NEGOTIABLE)

Every interactive or testable UI element MUST have a `data-testid` attribute.

### Naming Pattern

```
[page/section]-[element-purpose]-[element-type]
```

### Element Type Suffixes

| Element | Suffix | Example |
|---------|--------|---------|
| Button | `-btn` | `login-submit-btn` |
| Input | `-input` | `login-email-input` |
| Form | `-form` | `login-form` |
| Link | `-link` | `header-home-link` |
| Modal | `-modal` | `delete-confirm-modal` |
| Table | `-table` | `users-list-table` |
| Row | `-row` | `user-item-row` |
| Dropdown | `-dropdown` | `role-select-dropdown` |
| Checkbox | `-checkbox` | `terms-agree-checkbox` |
| Text/Label | `-text` | `welcome-message-text` |
| Image | `-img` | `profile-avatar-img` |
| Container | `-container` | `sidebar-nav-container` |

### Examples

```tsx
<form data-testid="login-form">
  <input data-testid="login-email-input" type="email" />
  <input data-testid="login-password-input" type="password" />
  <button data-testid="login-submit-btn">Login</button>
  <a data-testid="login-forgot-password-link" href="/forgot-password">Forgot?</a>
</form>

// Dynamic IDs for lists
{orders.map((order) => (
  <tr key={order.id} data-testid={`order-${order.id}-row`}>
    <td data-testid={`order-${order.id}-status-text`}>{order.status}</td>
    <button data-testid={`order-${order.id}-view-btn`}>View</button>
  </tr>
))}
```

## Component Structure

```
src/
├── components/
│   ├── ui/              # shadcn/ui (auto-generated)
│   ├── common/          # Shared custom components
│   └── features/        # Feature-specific components
├── hooks/               # Custom hooks
├── stores/              # Zustand stores
├── lib/                 # Utilities and configs
└── types/               # Shared types
```

## Component Rules

1. **Named exports only** - no `export default`
2. **One component per file** - file name matches component name
3. **Props interface** - named `{ComponentName}Props`
4. **No inline styles** - use Tailwind classes
5. **Event handlers** - prefix with `handle`
6. **Always handle** - loading, error, and empty states

## Component Template

```tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface UserCardProps {
  user: User;
  onEdit: (id: string) => void;
}

export function UserCard({ user, onEdit }: UserCardProps) {
  return (
    <div data-testid={`user-${user.id}-card`} className="rounded-lg border p-4">
      <h3 data-testid={`user-${user.id}-name-text`}>{user.name}</h3>
      <Button data-testid={`user-${user.id}-edit-btn`} onClick={() => onEdit(user.id)}>
        Edit
      </Button>
    </div>
  );
}
```

## Zustand Store Pattern

```typescript
import { create } from 'zustand';

interface AuthState {
  user: User | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  setUser: (user) => set({ user, isLoading: false }),
  logout: () => set({ user: null, isLoading: false }),
}));
```
