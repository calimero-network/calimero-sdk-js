/**
 * Tests for the typed error system
 */

import {
  CalimeroError,
  SerializationError,
  StorageError,
  ValidationError,
  DispatcherError,
  AbiError,
  ErrorCode,
  isCalimeroError,
  hasErrorCode,
} from '../errors';

describe('CalimeroError', () => {
  it('should create an error with code and message', () => {
    const error = new CalimeroError(ErrorCode.VALIDATION_TYPE_ERROR, 'Test message');

    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(CalimeroError);
    expect(error.code).toBe(ErrorCode.VALIDATION_TYPE_ERROR);
    expect(error.message).toBe('Test message');
    expect(error.name).toBe('CalimeroError');
  });

  it('should support context data', () => {
    const error = new CalimeroError(ErrorCode.VALIDATION_TYPE_ERROR, 'Test message', {
      context: { field: 'username', expectedType: 'string' },
    });

    expect(error.context).toEqual({ field: 'username', expectedType: 'string' });
  });

  it('should support cause chaining', () => {
    const cause = new Error('Original error');
    const error = new CalimeroError(ErrorCode.SERIALIZATION_FAILED, 'Wrapped error', {
      cause,
    });

    expect(error.cause).toBe(cause);
  });

  it('should serialize to JSON', () => {
    const error = new CalimeroError(ErrorCode.STORAGE_READ_FAILED, 'Read failed', {
      context: { key: 'test-key' },
    });

    const json = error.toJSON();

    expect(json.name).toBe('CalimeroError');
    expect(json.code).toBe(ErrorCode.STORAGE_READ_FAILED);
    expect(json.message).toBe('Read failed');
    expect(json.context).toEqual({ key: 'test-key' });
  });
});

describe('SerializationError', () => {
  it('should create via constructor', () => {
    const error = new SerializationError(
      ErrorCode.SERIALIZATION_TYPE_MISMATCH,
      'Type mismatch',
      { expectedType: 'number', actualType: 'string' }
    );

    expect(error).toBeInstanceOf(CalimeroError);
    expect(error).toBeInstanceOf(SerializationError);
    expect(error.name).toBe('SerializationError');
  });

  it('should create type mismatch error via factory', () => {
    const error = SerializationError.typeMismatch('boolean', 'string', 'isActive');

    expect(error.code).toBe(ErrorCode.SERIALIZATION_TYPE_MISMATCH);
    expect(error.message).toBe("Expected boolean for field 'isActive', got string");
    expect(error.context).toEqual({
      expectedType: 'boolean',
      actualType: 'string',
      field: 'isActive',
    });
  });

  it('should create invalid format error via factory', () => {
    const error = SerializationError.invalidFormat('JSON', 'unexpected token');

    expect(error.code).toBe(ErrorCode.SERIALIZATION_INVALID_FORMAT);
    expect(error.message).toBe('Invalid JSON format: unexpected token');
  });

  it('should create buffer underflow error via factory', () => {
    const error = SerializationError.bufferUnderflow(32, 10);

    expect(error.code).toBe(ErrorCode.DESERIALIZATION_BUFFER_UNDERFLOW);
    expect(error.message).toBe('Buffer underflow: expected 32 bytes, but only 10 available');
    expect(error.context).toEqual({ expectedBytes: 32, availableBytes: 10 });
  });
});

describe('StorageError', () => {
  it('should create via constructor', () => {
    const error = new StorageError(ErrorCode.STORAGE_READ_FAILED, 'Failed to read');

    expect(error).toBeInstanceOf(CalimeroError);
    expect(error).toBeInstanceOf(StorageError);
    expect(error.name).toBe('StorageError');
  });

  it('should create invalid ID error via factory', () => {
    const error = StorageError.invalidId('Vector', 'id must be 32 bytes', {
      actualLength: 16,
      expectedLength: 32,
    });

    expect(error.code).toBe(ErrorCode.STORAGE_INVALID_ID);
    expect(error.message).toBe('Vector: id must be 32 bytes');
    expect(error.context).toEqual({
      collectionType: 'Vector',
      actualLength: 16,
      expectedLength: 32,
    });
  });

  it('should create operation forbidden error via factory', () => {
    const error = StorageError.operationForbidden('FrozenStorage.remove', 'data is immutable');

    expect(error.code).toBe(ErrorCode.STORAGE_OPERATION_FORBIDDEN);
    expect(error.message).toBe('FrozenStorage.remove is forbidden: data is immutable');
  });

  it('should create host error via factory', () => {
    const cause = new Error('Internal error');
    const error = StorageError.hostError('read_root_state', 'function unavailable', cause);

    expect(error.code).toBe(ErrorCode.STORAGE_HOST_ERROR);
    expect(error.message).toBe("Host function 'read_root_state' failed: function unavailable");
    expect(error.cause).toBe(cause);
  });
});

describe('ValidationError', () => {
  it('should create via constructor', () => {
    const error = new ValidationError(ErrorCode.VALIDATION_TYPE_ERROR, 'Invalid type');

    expect(error).toBeInstanceOf(CalimeroError);
    expect(error).toBeInstanceOf(ValidationError);
    expect(error.name).toBe('ValidationError');
  });

  it('should create invalid type error via factory', () => {
    const error = ValidationError.invalidType('publicKey', 'Uint8Array', 'string');

    expect(error.code).toBe(ErrorCode.VALIDATION_TYPE_ERROR);
    expect(error.message).toBe('publicKey must be Uint8Array, got string');
    expect(error.context).toEqual({
      paramName: 'publicKey',
      expectedType: 'Uint8Array',
      actualType: 'string',
    });
  });

  it('should create out of range error via factory', () => {
    const error = ValidationError.outOfRange('amount', 'must be non-negative', -5);

    expect(error.code).toBe(ErrorCode.VALIDATION_RANGE_ERROR);
    expect(error.message).toBe('amount must be non-negative');
    expect(error.context).toEqual({
      paramName: 'amount',
      constraint: 'must be non-negative',
      actual: -5,
    });
  });

  it('should create required field error via factory', () => {
    const error = ValidationError.requiredField('username', 'string');

    expect(error.code).toBe(ErrorCode.VALIDATION_REQUIRED_FIELD);
    expect(error.message).toBe("Missing required field 'username' of type string");
  });

  it('should create invalid format error via factory', () => {
    const error = ValidationError.invalidFormat('hexId', '64 hex characters', 'got 32');

    expect(error.code).toBe(ErrorCode.VALIDATION_INVALID_FORMAT);
    expect(error.message).toBe('hexId has invalid format - expected 64 hex characters: got 32');
  });
});

describe('DispatcherError', () => {
  it('should create via constructor', () => {
    const error = new DispatcherError(ErrorCode.DISPATCHER_METHOD_NOT_FOUND, 'Method not found');

    expect(error).toBeInstanceOf(CalimeroError);
    expect(error).toBeInstanceOf(DispatcherError);
    expect(error.name).toBe('DispatcherError');
  });

  it('should create method not found error via factory', () => {
    const error = DispatcherError.methodNotFound('getUserById');

    expect(error.code).toBe(ErrorCode.DISPATCHER_METHOD_NOT_FOUND);
    expect(error.message).toBe("Method 'getUserById' not found in ABI");
  });

  it('should create invalid params error via factory', () => {
    const error = DispatcherError.invalidParams('createUser', 'missing required fields', {
      missingFields: ['name', 'email'],
    });

    expect(error.code).toBe(ErrorCode.DISPATCHER_INVALID_PARAMS);
    expect(error.message).toBe(
      "Invalid parameters for method 'createUser': missing required fields"
    );
    expect(error.context?.missingFields).toEqual(['name', 'email']);
  });

  it('should create state error via factory', () => {
    const error = DispatcherError.stateError('Contract already initialized');

    expect(error.code).toBe(ErrorCode.DISPATCHER_STATE_ERROR);
    expect(error.message).toBe('Contract already initialized');
  });

  it('should create JSON parse error via factory', () => {
    const cause = new SyntaxError('Unexpected token');
    const error = DispatcherError.jsonParseError('updateUser', 'invalid JSON', cause);

    expect(error.code).toBe(ErrorCode.DISPATCHER_JSON_PARSE_ERROR);
    expect(error.message).toBe("Failed to parse JSON parameters for method 'updateUser': invalid JSON");
    expect(error.cause).toBe(cause);
  });
});

describe('AbiError', () => {
  it('should create via constructor', () => {
    const error = new AbiError(ErrorCode.ABI_NOT_AVAILABLE, 'ABI not available');

    expect(error).toBeInstanceOf(CalimeroError);
    expect(error).toBeInstanceOf(AbiError);
    expect(error.name).toBe('AbiError');
  });

  it('should create not available error via factory', () => {
    const error = AbiError.notAvailable();

    expect(error.code).toBe(ErrorCode.ABI_NOT_AVAILABLE);
    expect(error.message).toBe('ABI manifest is required but not available');
  });

  it('should create type not found error via factory', () => {
    const error = AbiError.typeNotFound('UserProfile');

    expect(error.code).toBe(ErrorCode.ABI_TYPE_NOT_FOUND);
    expect(error.message).toBe("Type 'UserProfile' not found in ABI");
  });

  it('should create invalid type ref error via factory', () => {
    const error = AbiError.invalidTypeRef('missing inner type', { kind: 'option' });

    expect(error.code).toBe(ErrorCode.ABI_INVALID_TYPE_REF);
    expect(error.message).toBe('Invalid type reference: missing inner type');
    expect(error.context?.typeRef).toEqual({ kind: 'option' });
  });

  it('should create unsupported type error via factory', () => {
    const error = AbiError.unsupportedType('tuple', 'serialization');

    expect(error.code).toBe(ErrorCode.ABI_UNSUPPORTED_TYPE);
    expect(error.message).toBe("Unsupported type 'tuple' for serialization");
  });

  it('should create variant mismatch error via factory', () => {
    const error = AbiError.variantMismatch('Status', 'invalid', ['Active', 'Inactive', 'Pending']);

    expect(error.code).toBe(ErrorCode.ABI_VARIANT_MISMATCH);
    expect(error.message).toBe(
      'Invalid variant value "invalid" for type \'Status\'. Valid variants: Active, Inactive, Pending'
    );
    expect(error.context).toEqual({
      typeName: 'Status',
      value: 'invalid',
      validVariants: ['Active', 'Inactive', 'Pending'],
    });
  });
});

describe('isCalimeroError', () => {
  it('should return true for CalimeroError instances', () => {
    expect(isCalimeroError(new CalimeroError(ErrorCode.VALIDATION_TYPE_ERROR, 'test'))).toBe(true);
    expect(isCalimeroError(new SerializationError(ErrorCode.SERIALIZATION_FAILED, 'test'))).toBe(
      true
    );
    expect(isCalimeroError(new StorageError(ErrorCode.STORAGE_READ_FAILED, 'test'))).toBe(true);
    expect(isCalimeroError(new ValidationError(ErrorCode.VALIDATION_TYPE_ERROR, 'test'))).toBe(
      true
    );
    expect(isCalimeroError(new DispatcherError(ErrorCode.DISPATCHER_METHOD_NOT_FOUND, 'test'))).toBe(
      true
    );
    expect(isCalimeroError(new AbiError(ErrorCode.ABI_NOT_AVAILABLE, 'test'))).toBe(true);
  });

  it('should return false for non-CalimeroError instances', () => {
    expect(isCalimeroError(new Error('test'))).toBe(false);
    expect(isCalimeroError(new TypeError('test'))).toBe(false);
    expect(isCalimeroError('string error')).toBe(false);
    expect(isCalimeroError(null)).toBe(false);
    expect(isCalimeroError(undefined)).toBe(false);
    expect(isCalimeroError({})).toBe(false);
  });
});

describe('hasErrorCode', () => {
  it('should return true when error has matching code', () => {
    const error = new ValidationError(ErrorCode.VALIDATION_TYPE_ERROR, 'test');
    expect(hasErrorCode(error, ErrorCode.VALIDATION_TYPE_ERROR)).toBe(true);
  });

  it('should return false when error has different code', () => {
    const error = new ValidationError(ErrorCode.VALIDATION_TYPE_ERROR, 'test');
    expect(hasErrorCode(error, ErrorCode.VALIDATION_RANGE_ERROR)).toBe(false);
  });

  it('should return false for non-CalimeroError instances', () => {
    expect(hasErrorCode(new Error('test'), ErrorCode.VALIDATION_TYPE_ERROR)).toBe(false);
    expect(hasErrorCode('string', ErrorCode.VALIDATION_TYPE_ERROR)).toBe(false);
  });
});

describe('instanceof checks across error hierarchy', () => {
  it('should correctly identify SerializationError inheritance', () => {
    const error = new SerializationError(ErrorCode.SERIALIZATION_FAILED, 'test');
    expect(error instanceof Error).toBe(true);
    expect(error instanceof CalimeroError).toBe(true);
    expect(error instanceof SerializationError).toBe(true);
    expect(error instanceof StorageError).toBe(false);
  });

  it('should correctly identify StorageError inheritance', () => {
    const error = new StorageError(ErrorCode.STORAGE_READ_FAILED, 'test');
    expect(error instanceof Error).toBe(true);
    expect(error instanceof CalimeroError).toBe(true);
    expect(error instanceof StorageError).toBe(true);
    expect(error instanceof SerializationError).toBe(false);
  });

  it('should correctly identify ValidationError inheritance', () => {
    const error = new ValidationError(ErrorCode.VALIDATION_TYPE_ERROR, 'test');
    expect(error instanceof Error).toBe(true);
    expect(error instanceof CalimeroError).toBe(true);
    expect(error instanceof ValidationError).toBe(true);
    expect(error instanceof DispatcherError).toBe(false);
  });
});
