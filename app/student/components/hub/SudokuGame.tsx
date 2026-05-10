'use client'

import { useState, useMemo } from 'react'

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function isValid(board: number[][], r: number, c: number, n: number): boolean {
  for (let i = 0; i < 9; i++) {
    if (board[r][i] === n) return false
    if (board[i][c] === n) return false
    const br = Math.floor(r / 3) * 3 + Math.floor(i / 3)
    const bc = Math.floor(c / 3) * 3 + (i % 3)
    if (board[br][bc] === n) return false
  }
  return true
}

function solve(board: number[][]): boolean {
  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      if (board[r][c] === 0) {
        for (const n of shuffle([1,2,3,4,5,6,7,8,9])) {
          if (isValid(board, r, c, n)) {
            board[r][c] = n
            if (solve(board)) return true
            board[r][c] = 0
          }
        }
        return false
      }
    }
  }
  return true
}

function generatePuzzle(): { solution: number[][]; puzzle: number[][] } {
  const solution = Array.from({ length: 9 }, () => Array(9).fill(0))
  solve(solution)
  const puzzle = solution.map(row => [...row])
  const positions = shuffle(Array.from({ length: 81 }, (_, i) => i))
  for (let i = 0; i < 40; i++) {
    puzzle[Math.floor(positions[i] / 9)][positions[i] % 9] = 0
  }
  return { solution, puzzle }
}

export default function SudokuGame({ onComplete }: { onComplete: (pts: number) => void }) {
  const { solution, puzzle } = useMemo(generatePuzzle, [])
  const fixed = useMemo(() => puzzle.map(row => row.map(n => n !== 0)), [puzzle])
  const [grid, setGrid]         = useState<number[][]>(() => puzzle.map(row => [...row]))
  const [selected, setSelected] = useState<[number, number] | null>(null)
  const [errors, setErrors]     = useState<boolean[][]>(Array.from({ length: 9 }, () => Array(9).fill(false)))
  const [submitted, setSubmitted] = useState(false)
  const [correct, setCorrect]   = useState(false)

  function setCell(n: number) {
    if (!selected) return
    const [r, c] = selected
    if (fixed[r][c] || correct) return
    setGrid(prev => { const g = prev.map(row => [...row]); g[r][c] = n; return g })
    setErrors(Array.from({ length: 9 }, () => Array(9).fill(false)))
    setSubmitted(false)
  }

  function check() {
    const errs = Array.from({ length: 9 }, () => Array(9).fill(false))
    let allCorrect = true
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++)
        if (grid[r][c] !== solution[r][c]) { errs[r][c] = true; allCorrect = false }
    setErrors(errs); setSubmitted(true); setCorrect(allCorrect)
    onComplete(allCorrect ? 5 : 0)
  }

  const [selR, selC] = selected ?? [-1, -1]
  const selVal = selected ? grid[selR][selC] : 0
  const allFilled = grid.every((row, ri) => row.every((val, ci) => fixed[ri][ci] || val !== 0))

  return (
    <div className="max-w-xs mx-auto select-none">
      {correct && (
        <div className="text-center mb-4">
          <p className="text-3xl mb-1">🎉</p>
          <p className="font-bold text-gray-900">Solved! +5 pts earned!</p>
        </div>
      )}

      {/* Board */}
      <div className="border-2 border-gray-700 rounded-lg overflow-hidden mb-3">
        {grid.map((row, ri) => (
          <div key={ri} className={`flex ${ri % 3 === 2 && ri < 8 ? 'border-b-2 border-b-gray-700' : ri < 8 ? 'border-b border-b-gray-300' : ''}`}>
            {row.map((val, ci) => {
              const isSel   = ri === selR && ci === selC
              const sameRow = ri === selR
              const sameCol = ci === selC
              const sameBox = Math.floor(ri / 3) === Math.floor(selR / 3) && Math.floor(ci / 3) === Math.floor(selC / 3)
              const sameVal = selVal > 0 && val === selVal && val !== 0
              const hasErr  = errors[ri][ci]

              let bg = 'bg-white'
              if (isSel)       bg = 'bg-blue-300'
              else if (hasErr) bg = 'bg-red-100'
              else if (sameVal) bg = 'bg-blue-100'
              else if (sameRow || sameCol || sameBox) bg = 'bg-gray-100'

              return (
                <div key={ci}
                  onClick={() => { if (!correct) setSelected([ri, ci]) }}
                  className={`relative flex items-center justify-center cursor-pointer ${bg} ${ci % 3 === 2 && ci < 8 ? 'border-r-2 border-r-gray-700' : ci < 8 ? 'border-r border-r-gray-300' : ''} transition-colors`}
                  style={{ flex: '1 1 0', aspectRatio: '1' }}>
                  {val > 0 && (
                    <span className={`text-sm font-bold leading-none ${fixed[ri][ci] ? 'text-gray-800' : hasErr ? 'text-red-600' : 'text-blue-700'}`}>
                      {val}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* Number pad */}
      {!correct && (
        <div className="grid grid-cols-5 gap-1.5 mb-3">
          {[1,2,3,4,5,6,7,8,9].map(n => (
            <button key={n} onClick={() => setCell(n)}
              className="py-2 border border-gray-200 rounded-lg text-base font-bold text-gray-700 hover:bg-blue-50 hover:border-blue-300 transition-colors">
              {n}
            </button>
          ))}
          <button onClick={() => setCell(0)}
            className="py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-400 hover:bg-red-50 hover:border-red-200 transition-colors">
            ✕
          </button>
        </div>
      )}

      {submitted && !correct && (
        <p className="text-sm text-red-600 font-medium text-center mb-3">Some cells are incorrect — red cells need correction.</p>
      )}

      {!correct && (
        <button onClick={check} disabled={!allFilled}
          className="w-full bg-violet-600 hover:bg-violet-700 disabled:opacity-40 text-white font-semibold py-3 rounded-xl text-sm">
          Check Solution
        </button>
      )}
    </div>
  )
}
