// Errores pensados para que un agente (o una persona) sepa exactamente qué corregir.
// Casos que no se pueden contratar online. La web ofrece una persona en estos casos;
// el agente recibe la misma oferta en el propio error, para no depender de que encuentre la herramienta.
export const NOT_INSURABLE_ONLINE = ['age_not_insurable', 'destination_excluded', 'trip_too_long', 'residence_not_supported'];
const HUMAN_HELP = {
  tool: 'request_human_callback',
  reason: 'no_asegurable',
  say: 'Explica el motivo y ofrece que le llame una persona del equipo para buscar una alternativa. Si acepta, pide nombre y teléfono y llama a request_human_callback con user_agreed: true.',
};

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
        ...(NOT_INSURABLE_ONLINE.includes(this.code) ? { human_help: HUMAN_HELP } : {}),
      },
    };
  }
}
