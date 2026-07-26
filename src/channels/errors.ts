// ============================================================
// Channel boundary — domain errors
// ------------------------------------------------------------
// Follows the same structural convention as AssistantError (isOperational,
// statusCode, code) so forwardError.ts/error.middleware.ts handle it without
// any special-casing. Kept separate from AssistantError: these are
// transport/identity errors, not Assistant-domain errors.
// ============================================================

export class ChannelError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly isOperational = true;

  private constructor(message: string, statusCode: number, code: string) {
    super(message);
    this.name = 'ChannelError';
    this.statusCode = statusCode;
    this.code = code;
    Object.setPrototypeOf(this, ChannelError.prototype);
  }

  static webhookAuthFailed(): ChannelError {
    return new ChannelError('Webhook authentication failed', 401, 'CHANNEL_WEBHOOK_AUTH_FAILED');
  }

  static unsupportedUpdate(): ChannelError {
    return new ChannelError('Unsupported channel update', 422, 'CHANNEL_UNSUPPORTED_UPDATE');
  }

  static unlinkedIdentity(): ChannelError {
    return new ChannelError('Channel identity is not linked to a Pocket Mint account', 403, 'CHANNEL_UNLINKED_IDENTITY');
  }

  static linkInvalidOrExpired(): ChannelError {
    return new ChannelError('Linking code is invalid, expired, or already used', 400, 'CHANNEL_LINK_INVALID');
  }

  static linkIdentityConflict(): ChannelError {
    return new ChannelError('This channel identity is already linked to a different account', 409, 'CHANNEL_LINK_IDENTITY_CONFLICT');
  }

  static connectionRevoked(): ChannelError {
    return new ChannelError('Channel connection has been revoked', 403, 'CHANNEL_CONNECTION_REVOKED');
  }

  static providerUnavailable(): ChannelError {
    return new ChannelError('Channel provider is unavailable', 503, 'CHANNEL_PROVIDER_UNAVAILABLE');
  }
}
