export class ApiError extends Error {
  field?: string;
  constructor(message: string, field?: string) {
    super(message);
    this.name = 'ApiError';
    this.field = field;
  }
}
