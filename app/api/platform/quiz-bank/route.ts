import { NextRequest, NextResponse } from 'next/server'
import { requirePlatformAdmin } from '@/lib/auth'
import { bankErrorResponse, listSubjects } from '@/lib/quizBank'

// GET /api/platform/quiz-bank?board=CBSE&grade=7 — every academic subject of that board and grade with its
// question-bank progress (topics, topics at the minimum, questions, preparation status, published).
export async function GET(req: NextRequest) {
  if (!await requirePlatformAdmin()) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const board = req.nextUrl.searchParams.get('board')?.trim()
  const grade = req.nextUrl.searchParams.get('grade')?.trim()
  if (!board || !grade || board.length > 50 || grade.length > 20) return NextResponse.json({ error: 'board and grade are required' }, { status: 400 })
  try {
    return NextResponse.json({ subjects: await listSubjects(board, grade) })
  } catch (err) { return bankErrorResponse(err, 'list subjects') }
}
