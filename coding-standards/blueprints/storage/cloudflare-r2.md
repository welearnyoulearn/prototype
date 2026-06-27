# Cloudflare R2 Storage

## Why: S3-compatible, zero egress fees, $0.015/GB/month

## Install

```bash
pnpm add @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

## R2 Client

```typescript
// lib/storage.ts
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: process.env.R2_ACCESS_KEY_ID!, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY! },
});

export async function uploadFile(file: Buffer, originalName: string, folder: string, contentType: string) {
  const ext = originalName.split('.').pop();
  const key = `${folder}/${crypto.randomUUID()}.${ext}`;
  await r2.send(new PutObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: key, Body: file, ContentType: contentType }));
  return { key, url: `${process.env.R2_PUBLIC_URL}/${key}` };
}

export async function deleteFile(key: string) {
  await r2.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET_NAME!, Key: key }));
}
```

## Upload API Route

```typescript
// app/api/upload/route.ts
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED' } }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get('file') as File;
  const folder = (formData.get('folder') as string) ?? 'uploads';

  if (!file) return NextResponse.json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'No file' } }, { status: 400 });
  if (file.size > MAX_FILE_SIZE) return NextResponse.json({ success: false, error: { message: 'File too large (max 10MB)' } }, { status: 400 });
  if (!ALLOWED_TYPES.includes(file.type)) return NextResponse.json({ success: false, error: { message: 'Type not allowed' } }, { status: 400 });

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await uploadFile(buffer, file.name, folder, file.type);
  return NextResponse.json({ success: true, data: result }, { status: 201 });
}
```

## Upload Component

```tsx
export function FileUpload({ folder, onUpload }: { folder: string; onUpload: (url: string) => void }) {
  const [isUploading, setIsUploading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);
    formData.append('folder', folder);
    const res = await fetch('/api/upload', { method: 'POST', body: formData });
    const data = await res.json();
    if (data.success) onUpload(data.data.url);
    setIsUploading(false);
  }

  return (
    <div data-testid="file-upload-container">
      <input ref={inputRef} data-testid="file-upload-input" type="file" onChange={handleUpload} className="hidden" />
      <Button data-testid="file-upload-btn" variant="outline" onClick={() => inputRef.current?.click()} disabled={isUploading}>
        {isUploading ? 'Uploading...' : 'Upload File'}
      </Button>
    </div>
  );
}
```
