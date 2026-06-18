import { execSync } from 'child_process'
import { globSync } from 'fs'
import path from 'path'

export default function globalTeardown() {
  const testResultsDir = path.resolve(__dirname, '..', 'test-results')
  const webmFiles = globSync('**/video.webm', { cwd: testResultsDir })

  for (const file of webmFiles) {
    const webmPath = path.join(testResultsDir, file)
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
