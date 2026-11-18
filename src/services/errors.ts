/** An error to show the person. `field` names the form field it belongs to, so the form can show it under that field. */
export class ApiError extends Error { constructor(msg: string, public field?: string) { super(msg); } }
