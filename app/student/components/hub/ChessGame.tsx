'use client'

import { useState, useEffect } from 'react'

type PT = 'K' | 'Q' | 'R' | 'B' | 'N' | 'P'
type PC = 'w' | 'b'
type Piece = { t: PT; c: PC }
type Board = (Piece | null)[][]
type Sq = [number, number]

const GLYPHS: Record<string, string> = {
  wK: '♔', wQ: '♕', wR: '♖', wB: '♗', wN: '♘', wP: '♙',
  bK: '♚', bQ: '♛', bR: '♜', bB: '♝', bN: '♞', bP: '♟',
}

const INIT_CODES = [
  'bR','bN','bB','bQ','bK','bB','bN','bR',
  'bP','bP','bP','bP','bP','bP','bP','bP',
  '','','','','','','','',  '','','','','','','','',
  '','','','','','','','',  '','','','','','','','',
  'wP','wP','wP','wP','wP','wP','wP','wP',
  'wR','wN','wB','wQ','wK','wB','wN','wR',
]

function initBoard(): Board {
  const b: Board = []
  for (let r = 0; r < 8; r++) {
    b.push([])
    for (let c = 0; c < 8; c++) {
      const code = INIT_CODES[r * 8 + c]
      b[r].push(code ? { t: code[1] as PT, c: code[0] as PC } : null)
    }
  }
  return b
}

function cloneBoard(b: Board): Board { return b.map(row => row.map(p => p ? { ...p } : null)) }
function inBounds(r: number, c: number) { return r >= 0 && r < 8 && c >= 0 && c < 8 }

function getPseudoMoves(board: Board, r: number, c: number): Sq[] {
  const piece = board[r][c]
  if (!piece) return []
  const { t, c: color } = piece
  const opp = color === 'w' ? 'b' : 'w'
  const moves: Sq[] = []

  const addRay = (dr: number, dc: number) => {
    for (let i = 1; i < 8; i++) {
      const nr = r + dr * i, nc = c + dc * i
      if (!inBounds(nr, nc)) break
      const target = board[nr][nc]
      if (target?.c === color) break
      moves.push([nr, nc])
      if (target) break
    }
  }

  if (t === 'P') {
    const dir = color === 'w' ? -1 : 1
    const startRow = color === 'w' ? 6 : 1
    if (inBounds(r + dir, c) && !board[r + dir][c]) {
      moves.push([r + dir, c])
      if (r === startRow && !board[r + 2 * dir][c]) moves.push([r + 2 * dir, c])
    }
    for (const dc of [-1, 1]) {
      if (inBounds(r + dir, c + dc) && board[r + dir][c + dc]?.c === opp)
        moves.push([r + dir, c + dc])
    }
  }
  if (t === 'N') {
    for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
      const nr = r + dr, nc = c + dc
      if (inBounds(nr, nc) && board[nr][nc]?.c !== color) moves.push([nr, nc])
    }
  }
  if (t === 'R' || t === 'Q') { addRay(-1,0); addRay(1,0); addRay(0,-1); addRay(0,1) }
  if (t === 'B' || t === 'Q') { addRay(-1,-1); addRay(-1,1); addRay(1,-1); addRay(1,1) }
  if (t === 'K') {
    for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
      const nr = r + dr, nc = c + dc
      if (inBounds(nr, nc) && board[nr][nc]?.c !== color) moves.push([nr, nc])
    }
  }
  return moves
}

function isPawnAttacking(board: Board, r: number, c: number, byColor: PC): boolean {
  const dir = byColor === 'w' ? 1 : -1
  for (const dc of [-1, 1]) {
    const pr = r + dir, pc = c + dc
    if (inBounds(pr, pc) && board[pr][pc]?.t === 'P' && board[pr][pc]?.c === byColor) return true
  }
  return false
}

function isAttacked(board: Board, r: number, c: number, byColor: PC): boolean {
  if (isPawnAttacking(board, r, c, byColor)) return true
  for (let row = 0; row < 8; row++)
    for (let col = 0; col < 8; col++)
      if (board[row][col]?.c === byColor && board[row][col]?.t !== 'P')
        if (getPseudoMoves(board, row, col).some(([mr, mc]) => mr === r && mc === c)) return true
  return false
}

function findKing(board: Board, color: PC): Sq | null {
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++)
      if (board[r][c]?.t === 'K' && board[r][c]?.c === color) return [r, c]
  return null
}

function isInCheck(board: Board, color: PC): boolean {
  const king = findKing(board, color)
  if (!king) return true
  return isAttacked(board, king[0], king[1], color === 'w' ? 'b' : 'w')
}

function applyMove(board: Board, from: Sq, to: Sq): Board {
  const nb = cloneBoard(board)
  const piece = nb[from[0]][from[1]]!
  nb[to[0]][to[1]] = piece
  nb[from[0]][from[1]] = null
  if (piece.t === 'P' && (to[0] === 0 || to[0] === 7)) nb[to[0]][to[1]] = { t: 'Q', c: piece.c }
  return nb
}

function getLegalMoves(board: Board, r: number, c: number): Sq[] {
  const piece = board[r][c]
  if (!piece) return []
  return getPseudoMoves(board, r, c).filter(([tr, tc]) => !isInCheck(applyMove(board, [r, c], [tr, tc]), piece.c))
}

function getAllLegal(board: Board, color: PC): { from: Sq; to: Sq }[] {
  const moves: { from: Sq; to: Sq }[] = []
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++)
      if (board[r][c]?.c === color)
        for (const to of getLegalMoves(board, r, c))
          moves.push({ from: [r, c], to })
  return moves
}

function aiMove(board: Board): { from: Sq; to: Sq } | null {
  const moves = getAllLegal(board, 'b')
  if (!moves.length) return null
  const captures = moves.filter(m => board[m.to[0]][m.to[1]] !== null)
  const pool = captures.length ? captures : moves
  return pool[Math.floor(Math.random() * pool.length)]
}

function gameStatus(board: Board, colorToMove: PC): 'playing' | 'checkmate' | 'stalemate' {
  if (!getAllLegal(board, colorToMove).length)
    return isInCheck(board, colorToMove) ? 'checkmate' : 'stalemate'
  return 'playing'
}

export default function ChessGame({ onComplete }: { onComplete: () => void }) {
  const [board, setBoard]         = useState<Board>(initBoard)
  const [selected, setSelected]   = useState<Sq | null>(null)
  const [legalMoves, setLegalMoves] = useState<Sq[]>([])
  const [turn, setTurn]           = useState<PC>('w')
  const [status, setStatus]       = useState<'playing' | 'checkmate' | 'stalemate'>('playing')
  const [winner, setWinner]       = useState<PC | null>(null)
  const [aiThinking, setAiThinking] = useState(false)
  const [lastMove, setLastMove]   = useState<[Sq, Sq] | null>(null)
  const [completed, setCompleted] = useState(false)

  function endGame(b: Board, colorToMove: PC) {
    const s = gameStatus(b, colorToMove)
    if (s !== 'playing') {
      setStatus(s)
      setWinner(s === 'checkmate' ? (colorToMove === 'w' ? 'b' : 'w') : null)
      if (!completed) { onComplete(); setCompleted(true) }
      return true
    }
    return false
  }

  function handleClick(r: number, c: number) {
    if (turn !== 'w' || status !== 'playing' || aiThinking) return
    const piece = board[r][c]
    if (selected) {
      const isLegal = legalMoves.some(([mr, mc]) => mr === r && mc === c)
      if (isLegal) {
        const nb = applyMove(board, selected, [r, c])
        setBoard(nb); setSelected(null); setLegalMoves([]); setLastMove([selected, [r, c]])
        if (!endGame(nb, 'b')) setTurn('b')
        return
      }
    }
    if (piece?.c === 'w') {
      setSelected([r, c]); setLegalMoves(getLegalMoves(board, r, c))
    } else {
      setSelected(null); setLegalMoves([])
    }
  }

  useEffect(() => {
    if (turn !== 'b' || status !== 'playing') return
    setAiThinking(true)
    const t = setTimeout(() => {
      const move = aiMove(board)
      if (move) {
        const nb = applyMove(board, move.from, move.to)
        setBoard(nb); setLastMove([move.from, move.to])
        if (!endGame(nb, 'w')) setTurn('w')
      } else {
        endGame(board, 'b')
      }
      setAiThinking(false)
    }, 400 + Math.random() * 250)
    return () => clearTimeout(t)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [turn, status])

  function reset() {
    setBoard(initBoard()); setSelected(null); setLegalMoves([]); setTurn('w')
    setStatus('playing'); setWinner(null); setAiThinking(false); setLastMove(null)
  }

  const inCheck = status === 'playing' && isInCheck(board, turn)
  const whiteKingPos = findKing(board, 'w')
  const blackKingPos = findKing(board, 'b')

  const statusLabel = status !== 'playing'
    ? (status === 'checkmate' ? (winner === 'w' ? '🎉 You win! Checkmate!' : '🤖 AI wins!') : '🤝 Stalemate!')
    : aiThinking ? '🤖 AI thinking...'
    : inCheck ? '⚠️ Your king is in check!'
    : '♟ Your turn'

  return (
    <div className="max-w-sm mx-auto select-none">
      <div className="flex items-center justify-between mb-3">
        <span className={`text-sm font-semibold px-3 py-1.5 rounded-lg ${
          status !== 'playing' ? (winner === 'w' ? 'bg-green-100 text-green-700' : winner === 'b' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700')
          : inCheck ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
          {statusLabel}
        </span>
        <button onClick={reset} className="text-xs text-gray-500 border border-gray-200 px-3 py-1.5 rounded-lg hover:bg-gray-50">New Game</button>
      </div>

      <div className="border-2 border-gray-700 rounded-lg overflow-hidden">
        {board.map((row, ri) => (
          <div key={ri} className="flex">
            {row.map((piece, ci) => {
              const isSel = selected?.[0] === ri && selected?.[1] === ci
              const isLeg = legalMoves.some(([mr, mc]) => mr === ri && mc === ci)
              const isLight = (ri + ci) % 2 === 0
              const isLastF = lastMove?.[0][0] === ri && lastMove?.[0][1] === ci
              const isLastT = lastMove?.[1][0] === ri && lastMove?.[1][1] === ci
              const isWKCheck = piece?.t === 'K' && piece?.c === 'w' && inCheck && whiteKingPos?.[0] === ri && whiteKingPos?.[1] === ci
              const isBKCheck = piece?.t === 'K' && piece?.c === 'b' && isInCheck(board, 'b') && blackKingPos?.[0] === ri && blackKingPos?.[1] === ci

              let bg = isLight ? 'bg-amber-100' : 'bg-amber-700'
              if (isSel) bg = 'bg-blue-400'
              else if (isWKCheck || isBKCheck) bg = 'bg-red-400'
              else if (isLastF || isLastT) bg = isLight ? 'bg-yellow-200' : 'bg-yellow-500'

              return (
                <div key={ci} onClick={() => handleClick(ri, ci)}
                  className={`relative flex items-center justify-center cursor-pointer transition-all ${bg}`}
                  style={{ flex: '1 1 0', aspectRatio: '1' }}>
                  {isLeg && (
                    piece
                      ? <div className="absolute inset-0 border-4 border-green-400 opacity-70 pointer-events-none" />
                      : <div className="w-1/3 h-1/3 bg-green-500 rounded-full opacity-50 pointer-events-none" />
                  )}
                  {piece && (
                    <span className="text-2xl leading-none"
                      style={{ textShadow: piece.c === 'w' ? '0 1px 3px rgba(0,0,0,0.5)' : '0 1px 2px rgba(255,255,255,0.2)' }}>
                      {GLYPHS[piece.c + piece.t]}
                    </span>
                  )}
                  {ci === 0 && <span className="absolute top-0.5 left-0.5 text-[8px] font-bold opacity-30 leading-none">{8 - ri}</span>}
                  {ri === 7 && <span className="absolute bottom-0.5 right-0.5 text-[8px] font-bold opacity-30 leading-none">{'abcdefgh'[ci]}</span>}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      <p className="text-xs text-gray-400 text-center mt-2">Click a piece then click a highlighted square to move</p>

      {status !== 'playing' && (
        <div className="mt-3 text-center">
          <button onClick={reset} className="bg-gray-800 hover:bg-gray-900 text-white font-semibold px-6 py-2 rounded-xl text-sm">Play Again</button>
        </div>
      )}
    </div>
  )
}
