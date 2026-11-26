// Student Search (#538): the cards shown above Google's results for a sum, a unit conversion, a word meaning, and
// the student's textbooks.
import type { Answer } from '@/lib/studentSearch/calculator'
import type { Meaning, WordLanguage } from '@/lib/studentSearch/dictionary'
import type { ChapterMatch } from '@/lib/studentSearch/textbooks'

export type Word = { word: string; language: WordLanguage; meanings: Meaning[] }

export function AnswerCard({ answer }: { answer: Answer }) {
  return (
    <section className="rounded-2xl border bg-white p-5" aria-label={answer.kind === 'maths' ? 'Maths answer' : 'Unit conversion'} role="status" data-testid="student-search-answer">
      <span className="rounded-full bg-gray-100 px-3 py-1 text-xs">{answer.kind === 'maths' ? 'Maths answer' : 'Unit conversion'}</span>
      <p className="mt-2 break-words text-sm text-gray-600">{answer.question}</p>
      <p className="mt-1 break-words text-3xl font-bold" data-testid="student-search-answer-value">{answer.answer}</p>
    </section>
  )
}

const NCERT_BOOKS = 'https://ncert.nic.in/textbook.php'

/** The student's own chapters that match, and always a way to NCERT's official free textbooks. */
export function TextbookCard({ chapters }: { chapters: ChapterMatch[] }) {
  return (
    <section className="rounded-2xl border bg-white p-5" aria-label="Textbooks" data-testid="student-search-textbooks">
      <span className="rounded-full bg-gray-100 px-3 py-1 text-xs">Textbooks</span>
      {chapters.length > 0 && (
        <>
          <h2 className="mt-2 text-lg font-bold">In your school books</h2>
          <ul className="mt-2 space-y-3">
            {chapters.map((match, index) => (
              <li key={`${match.subject}-${match.chapter}-${index}`} className="text-sm leading-6" data-testid="student-search-chapter">
                <p className="font-bold">{match.chapter}</p>
                <p className="text-gray-600">{[match.subject, match.board?.replace(/_/g, ' '), match.topic && `Topic: ${match.topic}`].filter(Boolean).join(' · ')}</p>
                {match.books.map(book => (
                  <a key={book.url} href={book.url} target="_blank" rel="noopener noreferrer" className="mr-4 inline-block min-h-8 underline" data-testid="student-search-book-link">Open {book.title}</a>
                ))}
              </li>
            ))}
          </ul>
        </>
      )}
      <h2 className="mt-3 text-lg font-bold">NCERT textbooks</h2>
      <p className="mt-1 text-sm">Free official textbooks. Choose your class, subject and book on the NCERT website.</p>
      <a href={NCERT_BOOKS} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-11 items-center rounded-full border px-4 text-sm font-bold" data-testid="student-search-ncert-link">Open NCERT textbooks</a>
    </section>
  )
}

export function WordCard({ word }: { word: Word }) {
  return (
    <section className="rounded-2xl border bg-white p-5" aria-label="Word meaning" data-testid="student-search-meaning">
      <span className="rounded-full bg-gray-100 px-3 py-1 text-xs">Word meaning</span>
      <h2 lang={word.language} className="mt-2 text-lg font-bold">{word.word}</h2>
      {word.meanings.map((meaning, index) => (
        <div key={`${meaning.partOfSpeech}-${index}`} lang="en" className="mt-3">
          <h3 className="text-sm font-bold text-gray-600">{meaning.partOfSpeech}</h3>
          <ol className="mt-1 list-decimal space-y-1 pl-5 text-sm leading-6">
            {meaning.definitions.map((definition, i) => (
              <li key={i}>
                {definition.text}
                {definition.example && <span className="block text-gray-600">Example: {definition.example}</span>}
              </li>
            ))}
          </ol>
        </div>
      ))}
      <p className="mt-3 text-xs text-gray-600">
        Text from Wiktionary (CC BY-SA 4.0).{' '}
        <a href={`https://en.wiktionary.org/wiki/${encodeURIComponent(word.word.replace(/ /g, '_'))}`} target="_blank" rel="noopener noreferrer" className="underline" data-testid="student-search-meaning-link">Read on Wiktionary</a>
      </p>
    </section>
  )
}
