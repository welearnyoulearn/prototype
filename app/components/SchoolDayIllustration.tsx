/** A shared, decorative campus illustration. It contains no account or demo data. */
export default function SchoolDayIllustration({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 480 280" fill="none" aria-hidden="true" focusable="false" className={className}>
      <path d="M28 234C16 182 38 88 107 54C166 25 217 55 265 43C349 22 433 72 451 143C473 230 390 262 286 259C170 256 52 278 28 234Z" fill="#e8eee3" />
      <circle cx="383" cy="65" r="25" fill="#e5b86d" />
      <path d="M51 225H433M76 238H402" stroke="#bacbb7" strokeWidth="2" strokeLinecap="round" />
      <path d="M232 211L189 259H312L272 211" fill="#f8f9f6" />
      {/* The two classroom wings and the central entrance. */}
      <path d="M102 124H211V218H102Z" fill="#f5f1e6" />
      <path d="M279 124H384V218H279Z" fill="#f5f1e6" />
      <path d="M95 124L104 112H210V128H95ZM279 112H382L391 128H279Z" fill="#7a9479" />
      <path d="M197 98L244 65L291 98V219H197Z" fill="#fffdf7" />
      <path d="M191 101L244 62L297 101" stroke="#235b46" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M105 217H382" stroke="#9cad95" strokeWidth="4" />
      {[118, 158, 300, 340].map(x => (
        <g key={x}>
          <path d={`M${x} 143h23v25h-23zM${x} 181h23v25h-23z`} fill="#b3cbbf" />
          <path d={`M${x + 11.5} 143v25m0 13v25M${x} 156h23m-23 38h23`} stroke="#f5f1e6" strokeWidth="2" />
        </g>
      ))}
      <circle cx="244" cy="112" r="15" fill="#edf2e9" stroke="#b0c3ac" strokeWidth="2" />
      <path d="M244 103V112L250 116" stroke="#235b46" strokeWidth="2" strokeLinecap="round" />
      <path d="M221 217V180C221 149 267 149 267 180V217" fill="#235b46" />
      <path d="M244 168V216" stroke="#779787" strokeWidth="2" />
      <path d="M238 190V196M251 190V196" stroke="#f1d49a" strokeWidth="2" strokeLinecap="round" />
      <path d="M213 221H275M207 226H281" stroke="#c3cdb9" strokeWidth="4" />
      {/* Garden trees give the architectural drawing a softer, human scale. */}
      <path d="M67 217V150M412 219V155" stroke="#7a7960" strokeWidth="5" strokeLinecap="round" />
      <path d="M64 107C42 114 34 147 42 165C53 187 82 185 91 161C99 140 86 101 64 107Z" fill="#86a17c" />
      <path d="M411 117C390 119 379 153 389 171C400 190 428 184 435 165C442 144 432 115 411 117Z" fill="#557e60" />
      <path d="M66 147V191M412 153V197" stroke="#f0f3e7" strokeWidth="2" strokeLinecap="round" />
      <path d="M67 163L56 153M412 167L421 157" stroke="#f0f3e7" strokeWidth="2" strokeLinecap="round" />
      <path d="M83 220C82 209 92 200 99 207C103 190 121 196 119 211C129 205 140 212 136 220" fill="#92aa84" />
      <path d="M344 220C342 204 356 199 361 209C365 196 383 199 382 213C391 207 399 213 398 220" fill="#92aa84" />
      {/* A teacher and pupils arriving: illustration, not a live status display. */}
      <circle cx="172" cy="197" r="6" fill="#ae7856" />
      <path d="M166 209Q172 202 178 209L181 226H163Z" fill="#bf7958" />
      <path d="M168 226L166 240M176 226L179 240" stroke="#405747" strokeWidth="4" strokeLinecap="round" />
      <circle cx="194" cy="211" r="5" fill="#c99872" />
      <path d="M189 220Q194 214 199 220L201 232H187Z" fill="#235b46" />
      <path d="M190 232V242M197 232L199 242" stroke="#405747" strokeWidth="3" strokeLinecap="round" />
      <path d="M179 215L187 224" stroke="#ae7856" strokeWidth="3" strokeLinecap="round" />
      <circle cx="312" cy="211" r="5" fill="#8d624a" />
      <path d="M307 220Q312 214 317 220L319 232H305Z" fill="#d2a152" />
      <path d="M308 232L306 242M315 232V242" stroke="#405747" strokeWidth="3" strokeLinecap="round" />
      <path d="M318 221L323 227" stroke="#8d624a" strokeWidth="3" strokeLinecap="round" />
      <path d="M116 76Q122 69 128 76M135 65Q141 58 147 65" stroke="#789075" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}
