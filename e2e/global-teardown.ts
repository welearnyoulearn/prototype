import { execSync } from 'child_process'
import { readdirSync, statSync } from 'fs'
import path from 'path'

function findFiles(dir: string, pattern: string): string[] {
  const results: string[] = []
  try {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry)
      try {
        if (statSync(full).isDirectory()) {
          results.push(...findFiles(full, pattern))
        } else if (entry === pattern) {
          results.push(full)
        }
      } catch { /* skip inaccessible */ }
    }
  } catch { /* skip missing dir */ }
  return results
}

export default function globalTeardown() {
  const testResultsDir = path.resolve(__dirname, '..', 'test-results')
  const webmFiles = findFiles(testResultsDir, 'video.webm')

  for (const file of webmFiles) {
    const webmPath = file
    const mp4Path = webmPath.replace(/\.webm$/, '.mp4')
    try {
      execSync(
        `ffmpeg -i "${webmPath}" -c:v libx264 -preset ultrafast -crf 23 -c:a aac -movflags +faststart -y "${mp4Path}"`,
        { stdio: 'ignore' }
      )
    } catch {
      // skip files that fail to convert
    }
  }
}
