/** A problem the person can be told about, with the HTTP status it maps to. */
export class ChatError extends Error {
  status: number
  constructor(message: string, status: number = 400) {
    super(message)
    this.status = status
  }
}
