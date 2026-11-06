// Errores pensados para que un agente (o una persona) sepa exactamente qué corregir.
export class ApiError extends Error {
  constructor(code, message, { hint = null, field = null, status = 400, details = null } = {}) {
    super(message);
    this.code = code;
    this.hint = hint;
    this.field = field;
    this.status = status;
    this.details = details;
  }
  toJSON() {
    return {
      ok: false,
      error: {
        code: this.code,
        message: this.message,
        ...(this.field ? { field: this.field } : {}),
        ...(this.hint ? { how_to_fix: this.hint } : {}),
        ...(this.details ? { details: this.details } : {}),
      },
    };
  }
}
