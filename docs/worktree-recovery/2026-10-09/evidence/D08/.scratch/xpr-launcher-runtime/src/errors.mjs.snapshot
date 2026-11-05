export class AprError extends Error {
  constructor(code, message, { recovery, details = {}, exitCode = 1 } = {}) {
    super(message);
    if (!/^APR_[A-Z0-9_]+$/.test(code) || typeof recovery !== 'string' || !recovery.trim()) {
      throw new TypeError('invalid APR error');
    }
    this.name = 'AprError';
    this.code = code;
    this.recovery = recovery;
    this.details = Object.freeze({ ...details });
    this.exitCode = exitCode;
  }

  toJSON() {
    return {
      schema: 'ai-peer-review.error/v1',
      code: this.code,
      message: this.message,
      recovery: this.recovery,
      details: this.details,
    };
  }
}
