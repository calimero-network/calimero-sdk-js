/**
 * Typed Error System for Calimero SDK
 *
 * Provides a structured error hierarchy with error codes for programmatic
 * error handling. All SDK errors extend CalimeroError for consistent
 * instanceof checks and error identification.
 */

/**
 * Error codes for programmatic error handling.
 * Organized by error category prefix:
 * - SERIALIZATION_* : Serialization/deserialization errors
 * - STORAGE_*       : Storage operation errors
 * - VALIDATION_*    : Input validation errors
 * - DISPATCHER_*    : Method dispatch errors
 * - ABI_*           : ABI-related errors
 */
export enum ErrorCode {
  // Serialization errors (1xxx)
  SERIALIZATION_FAILED = 'SERIALIZATION_FAILED',
  SERIALIZATION_TYPE_MISMATCH = 'SERIALIZATION_TYPE_MISMATCH',
  SERIALIZATION_INVALID_FORMAT = 'SERIALIZATION_INVALID_FORMAT',
  SERIALIZATION_CIRCULAR_REFERENCE = 'SERIALIZATION_CIRCULAR_REFERENCE',
  DESERIALIZATION_FAILED = 'DESERIALIZATION_FAILED',
  DESERIALIZATION_BUFFER_UNDERFLOW = 'DESERIALIZATION_BUFFER_UNDERFLOW',

  // Storage errors (2xxx)
  STORAGE_READ_FAILED = 'STORAGE_READ_FAILED',
  STORAGE_WRITE_FAILED = 'STORAGE_WRITE_FAILED',
  STORAGE_KEY_NOT_FOUND = 'STORAGE_KEY_NOT_FOUND',
  STORAGE_INVALID_ID = 'STORAGE_INVALID_ID',
  STORAGE_OPERATION_FORBIDDEN = 'STORAGE_OPERATION_FORBIDDEN',
  STORAGE_HOST_ERROR = 'STORAGE_HOST_ERROR',

  // Validation errors (3xxx)
  VALIDATION_TYPE_ERROR = 'VALIDATION_TYPE_ERROR',
  VALIDATION_RANGE_ERROR = 'VALIDATION_RANGE_ERROR',
  VALIDATION_REQUIRED_FIELD = 'VALIDATION_REQUIRED_FIELD',
  VALIDATION_INVALID_FORMAT = 'VALIDATION_INVALID_FORMAT',
  VALIDATION_CONSTRAINT_VIOLATION = 'VALIDATION_CONSTRAINT_VIOLATION',

  // Dispatcher errors (4xxx)
  DISPATCHER_METHOD_NOT_FOUND = 'DISPATCHER_METHOD_NOT_FOUND',
  DISPATCHER_INVALID_PARAMS = 'DISPATCHER_INVALID_PARAMS',
  DISPATCHER_STATE_ERROR = 'DISPATCHER_STATE_ERROR',
  DISPATCHER_EXECUTION_FAILED = 'DISPATCHER_EXECUTION_FAILED',
  DISPATCHER_JSON_PARSE_ERROR = 'DISPATCHER_JSON_PARSE_ERROR',

  // ABI errors (5xxx)
  ABI_NOT_AVAILABLE = 'ABI_NOT_AVAILABLE',
  ABI_TYPE_NOT_FOUND = 'ABI_TYPE_NOT_FOUND',
  ABI_INVALID_TYPE_REF = 'ABI_INVALID_TYPE_REF',
  ABI_UNSUPPORTED_TYPE = 'ABI_UNSUPPORTED_TYPE',
  ABI_VARIANT_MISMATCH = 'ABI_VARIANT_MISMATCH',
}

/**
 * Base error class for all Calimero SDK errors.
 *
 * Provides structured error information including:
 * - Error code for programmatic handling
 * - Descriptive message
 * - Optional context data
 * - Optional original cause
 *
 * @example
 * ```typescript
 * try {
 *   // SDK operation
 * } catch (error) {
 *   if (error instanceof CalimeroError) {
 *     switch (error.code) {
 *       case ErrorCode.VALIDATION_TYPE_ERROR:
 *         // Handle type error
 *         break;
 *       case ErrorCode.STORAGE_READ_FAILED:
 *         // Handle storage error
 *         break;
 *     }
 *   }
 * }
 * ```
 */
export class CalimeroError extends Error {
  /**
   * Error code for programmatic error identification
   */
  readonly code: ErrorCode;

  /**
   * Additional context data related to the error
   */
  readonly context?: Record<string, unknown>;

  /**
   * Original error that caused this error
   */
  readonly cause?: Error;

  constructor(
    code: ErrorCode,
    message: string,
    options?: { context?: Record<string, unknown>; cause?: Error }
  ) {
    super(message);
    this.name = 'CalimeroError';
    this.code = code;
    this.context = options?.context;
    this.cause = options?.cause;

    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, new.target.prototype);
  }

  /**
   * Returns a JSON-serializable representation of the error
   */
  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      context: this.context,
      cause: this.cause?.message,
      stack: this.stack,
    };
  }
}

/**
 * Error thrown during serialization or deserialization operations.
 *
 * Covers errors in:
 * - Borsh encoding/decoding
 * - JSON serialization/parsing
 * - ABI-based type conversion
 *
 * @example
 * ```typescript
 * throw new SerializationError(
 *   ErrorCode.SERIALIZATION_TYPE_MISMATCH,
 *   'Expected boolean, got string',
 *   { expectedType: 'boolean', actualType: 'string' }
 * );
 * ```
 */
export class SerializationError extends CalimeroError {
  constructor(
    code: ErrorCode,
    message: string,
    context?: Record<string, unknown>,
    cause?: Error
  ) {
    super(code, message, { context, cause });
    this.name = 'SerializationError';
  }

  /**
   * Creates an error for type mismatch during serialization
   */
  static typeMismatch(expected: string, actual: string, field?: string): SerializationError {
    const fieldInfo = field ? ` for field '${field}'` : '';
    return new SerializationError(
      ErrorCode.SERIALIZATION_TYPE_MISMATCH,
      `Expected ${expected}${fieldInfo}, got ${actual}`,
      { expectedType: expected, actualType: actual, field }
    );
  }

  /**
   * Creates an error for invalid format during deserialization
   */
  static invalidFormat(format: string, details?: string): SerializationError {
    const detailsInfo = details ? `: ${details}` : '';
    return new SerializationError(
      ErrorCode.SERIALIZATION_INVALID_FORMAT,
      `Invalid ${format} format${detailsInfo}`,
      { format, details }
    );
  }

  /**
   * Creates an error for buffer underflow during deserialization
   */
  static bufferUnderflow(expected: number, available: number): SerializationError {
    return new SerializationError(
      ErrorCode.DESERIALIZATION_BUFFER_UNDERFLOW,
      `Buffer underflow: expected ${expected} bytes, but only ${available} available`,
      { expectedBytes: expected, availableBytes: available }
    );
  }
}

/**
 * Error thrown during storage operations.
 *
 * Covers errors in:
 * - Collection operations (Vector, UnorderedMap, etc.)
 * - Host storage interface calls
 * - Storage ID validation
 *
 * @example
 * ```typescript
 * throw new StorageError(
 *   ErrorCode.STORAGE_INVALID_ID,
 *   'Map id must be 32 bytes',
 *   { actualLength: 16, expectedLength: 32 }
 * );
 * ```
 */
export class StorageError extends CalimeroError {
  constructor(
    code: ErrorCode,
    message: string,
    context?: Record<string, unknown>,
    cause?: Error
  ) {
    super(code, message, { context, cause });
    this.name = 'StorageError';
  }

  /**
   * Creates an error for invalid collection ID
   */
  static invalidId(collectionType: string, reason: string, details?: Record<string, unknown>): StorageError {
    return new StorageError(
      ErrorCode.STORAGE_INVALID_ID,
      `${collectionType}: ${reason}`,
      { collectionType, ...details }
    );
  }

  /**
   * Creates an error for forbidden storage operations
   */
  static operationForbidden(operation: string, reason: string): StorageError {
    return new StorageError(
      ErrorCode.STORAGE_OPERATION_FORBIDDEN,
      `${operation} is forbidden: ${reason}`,
      { operation, reason }
    );
  }

  /**
   * Creates an error for host function failures
   */
  static hostError(operation: string, details?: string, cause?: Error): StorageError {
    const detailsInfo = details ? `: ${details}` : '';
    return new StorageError(
      ErrorCode.STORAGE_HOST_ERROR,
      `Host function '${operation}' failed${detailsInfo}`,
      { operation, details },
      cause
    );
  }
}

/**
 * Error thrown during input validation.
 *
 * Covers errors in:
 * - Type checking
 * - Range validation
 * - Required field validation
 * - Format validation (hex strings, byte arrays, etc.)
 *
 * @example
 * ```typescript
 * throw new ValidationError(
 *   ErrorCode.VALIDATION_RANGE_ERROR,
 *   'publicKey must be exactly 32 bytes',
 *   { actualLength: 16, expectedLength: 32 }
 * );
 * ```
 */
export class ValidationError extends CalimeroError {
  constructor(
    code: ErrorCode,
    message: string,
    context?: Record<string, unknown>,
    cause?: Error
  ) {
    super(code, message, { context, cause });
    this.name = 'ValidationError';
  }

  /**
   * Creates an error for type validation failure
   */
  static invalidType(paramName: string, expected: string, actual: string): ValidationError {
    return new ValidationError(
      ErrorCode.VALIDATION_TYPE_ERROR,
      `${paramName} must be ${expected}, got ${actual}`,
      { paramName, expectedType: expected, actualType: actual }
    );
  }

  /**
   * Creates an error for range validation failure
   */
  static outOfRange(paramName: string, constraint: string, actual?: unknown): ValidationError {
    return new ValidationError(
      ErrorCode.VALIDATION_RANGE_ERROR,
      `${paramName} ${constraint}`,
      { paramName, constraint, actual }
    );
  }

  /**
   * Creates an error for missing required field
   */
  static requiredField(fieldName: string, typeName?: string): ValidationError {
    const typeInfo = typeName ? ` of type ${typeName}` : '';
    return new ValidationError(
      ErrorCode.VALIDATION_REQUIRED_FIELD,
      `Missing required field '${fieldName}'${typeInfo}`,
      { fieldName, typeName }
    );
  }

  /**
   * Creates an error for invalid format
   */
  static invalidFormat(paramName: string, expectedFormat: string, details?: string): ValidationError {
    const detailsInfo = details ? `: ${details}` : '';
    return new ValidationError(
      ErrorCode.VALIDATION_INVALID_FORMAT,
      `${paramName} has invalid format - expected ${expectedFormat}${detailsInfo}`,
      { paramName, expectedFormat, details }
    );
  }
}

/**
 * Error thrown during method dispatch.
 *
 * Covers errors in:
 * - Method lookup
 * - Parameter normalization
 * - State management
 * - JSON parameter parsing
 *
 * @example
 * ```typescript
 * throw new DispatcherError(
 *   ErrorCode.DISPATCHER_METHOD_NOT_FOUND,
 *   'Method "foo" not found in ABI',
 *   { methodName: 'foo' }
 * );
 * ```
 */
export class DispatcherError extends CalimeroError {
  constructor(
    code: ErrorCode,
    message: string,
    context?: Record<string, unknown>,
    cause?: Error
  ) {
    super(code, message, { context, cause });
    this.name = 'DispatcherError';
  }

  /**
   * Creates an error for method not found
   */
  static methodNotFound(methodName: string): DispatcherError {
    return new DispatcherError(
      ErrorCode.DISPATCHER_METHOD_NOT_FOUND,
      `Method '${methodName}' not found in ABI`,
      { methodName }
    );
  }

  /**
   * Creates an error for invalid parameters
   */
  static invalidParams(methodName: string, reason: string, details?: Record<string, unknown>): DispatcherError {
    return new DispatcherError(
      ErrorCode.DISPATCHER_INVALID_PARAMS,
      `Invalid parameters for method '${methodName}': ${reason}`,
      { methodName, reason, ...details }
    );
  }

  /**
   * Creates an error for state-related issues
   */
  static stateError(reason: string): DispatcherError {
    return new DispatcherError(
      ErrorCode.DISPATCHER_STATE_ERROR,
      reason,
      {}
    );
  }

  /**
   * Creates an error for JSON parsing failures
   */
  static jsonParseError(methodName: string, details: string, cause?: Error): DispatcherError {
    return new DispatcherError(
      ErrorCode.DISPATCHER_JSON_PARSE_ERROR,
      `Failed to parse JSON parameters for method '${methodName}': ${details}`,
      { methodName, details },
      cause
    );
  }
}

/**
 * Error thrown during ABI operations.
 *
 * Covers errors in:
 * - ABI manifest access
 * - Type resolution
 * - Type reference handling
 *
 * @example
 * ```typescript
 * throw new AbiError(
 *   ErrorCode.ABI_TYPE_NOT_FOUND,
 *   'Type "MyStruct" not found in ABI',
 *   { typeName: 'MyStruct' }
 * );
 * ```
 */
export class AbiError extends CalimeroError {
  constructor(
    code: ErrorCode,
    message: string,
    context?: Record<string, unknown>,
    cause?: Error
  ) {
    super(code, message, { context, cause });
    this.name = 'AbiError';
  }

  /**
   * Creates an error for missing ABI manifest
   */
  static notAvailable(): AbiError {
    return new AbiError(
      ErrorCode.ABI_NOT_AVAILABLE,
      'ABI manifest is required but not available',
      {}
    );
  }

  /**
   * Creates an error for type not found in ABI
   */
  static typeNotFound(typeName: string): AbiError {
    return new AbiError(
      ErrorCode.ABI_TYPE_NOT_FOUND,
      `Type '${typeName}' not found in ABI`,
      { typeName }
    );
  }

  /**
   * Creates an error for invalid type reference
   */
  static invalidTypeRef(reason: string, typeRef?: unknown): AbiError {
    return new AbiError(
      ErrorCode.ABI_INVALID_TYPE_REF,
      `Invalid type reference: ${reason}`,
      { reason, typeRef }
    );
  }

  /**
   * Creates an error for unsupported type
   */
  static unsupportedType(typeKind: string, operation?: string): AbiError {
    const operationInfo = operation ? ` for ${operation}` : '';
    return new AbiError(
      ErrorCode.ABI_UNSUPPORTED_TYPE,
      `Unsupported type '${typeKind}'${operationInfo}`,
      { typeKind, operation }
    );
  }

  /**
   * Creates an error for variant type mismatches
   */
  static variantMismatch(typeName: string, value: unknown, validVariants: string[]): AbiError {
    return new AbiError(
      ErrorCode.ABI_VARIANT_MISMATCH,
      `Invalid variant value "${value}" for type '${typeName}'. Valid variants: ${validVariants.join(', ')}`,
      { typeName, value, validVariants }
    );
  }
}

/**
 * Utility function to check if an error is a Calimero SDK error
 */
export function isCalimeroError(error: unknown): error is CalimeroError {
  return error instanceof CalimeroError;
}

/**
 * Utility function to check if an error matches a specific error code
 */
export function hasErrorCode(error: unknown, code: ErrorCode): boolean {
  return isCalimeroError(error) && error.code === code;
}
