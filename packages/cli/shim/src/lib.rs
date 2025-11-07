//! Rust shim layer between QuickJS C code and Calimero runtime
//! 
//! This shim translates simple (ptr, len) pairs from C into proper
//! sys::Buffer descriptors that the Calimero runtime expects.

use calimero_sdk::env;
use calimero_sys::{self as sys, Bool, Buffer, Event, PtrSizedInt, RegisterId, Ref};

// Helper to convert Bool to u32
#[inline]
fn bool_to_u32(b: Bool) -> u32 {
    match b.try_into() {
        Ok(true) => 1,
        Ok(false) => 0,
        Err(x) => x,
    }
}

/// Helper to create a Buffer from raw pointer and length
#[inline]
unsafe fn buffer_from_raw(ptr: u64, len: u64) -> Buffer<'static> {
    Buffer::from(core::slice::from_raw_parts(ptr as *const u8, len as usize))
}

/// Helper to create a mutable Buffer from raw pointer and length  
#[inline]
unsafe fn buffer_mut_from_raw(ptr: u64, len: u64) -> Buffer<'static> {
    Buffer::from(core::slice::from_raw_parts_mut(ptr as *mut u8, len as usize))
}

// ===========================
// Logging
// ===========================

#[no_mangle]
pub extern "C" fn shim_log_utf8(ptr: u64, len: u64) {
    let message = unsafe {
        core::str::from_utf8_unchecked(core::slice::from_raw_parts(ptr as *const u8, len as usize))
    };
    env::log(message);
}

// ===========================
// Storage
// ===========================

#[no_mangle]
pub extern "C" fn shim_storage_read(key_ptr: u64, key_len: u64, register_id: u64) -> u32 {
    let key = unsafe { core::slice::from_raw_parts(key_ptr as *const u8, key_len as usize) };
    let reg_id = RegisterId::new(register_id as usize);
    let result = unsafe {
        sys::storage_read(Ref::new(&Buffer::from(key)), reg_id)
    };
    bool_to_u32(result)
}

#[no_mangle]
pub extern "C" fn shim_storage_write(
    key_ptr: u64,
    key_len: u64,
    value_ptr: u64,
    value_len: u64,
    register_id: u64,
) -> u32 {
    let key = unsafe { core::slice::from_raw_parts(key_ptr as *const u8, key_len as usize) };
    let value = unsafe { core::slice::from_raw_parts(value_ptr as *const u8, value_len as usize) };
    let reg_id = RegisterId::new(register_id as usize);
    
    let result = unsafe {
        sys::storage_write(
            Ref::new(&Buffer::from(key)),
            Ref::new(&Buffer::from(value)),
            reg_id,
        )
    };
    bool_to_u32(result)
}

#[no_mangle]
pub extern "C" fn shim_storage_remove(key_ptr: u64, key_len: u64, register_id: u64) -> u32 {
    let key = unsafe { core::slice::from_raw_parts(key_ptr as *const u8, key_len as usize) };
    let reg_id = RegisterId::new(register_id as usize);
    
    let result = unsafe {
        sys::storage_remove(Ref::new(&Buffer::from(key)), reg_id)
    };
    bool_to_u32(result)
}

// ===========================
// Context
// ===========================

#[no_mangle]
pub extern "C" fn shim_context_id(register_id: u64) {
    let reg_id = RegisterId::new(register_id as usize);
    unsafe { sys::context_id(reg_id) }
}

#[no_mangle]
pub extern "C" fn shim_executor_id(register_id: u64) {
    let reg_id = RegisterId::new(register_id as usize);
    unsafe { sys::executor_id(reg_id) }
}

// ===========================
// Registers
// ===========================

#[no_mangle]
pub extern "C" fn shim_register_len(register_id: u64) -> u64 {
    let reg_id = RegisterId::new(register_id as usize);
    let result: PtrSizedInt = unsafe { sys::register_len(reg_id) };
    result.as_usize() as u64
}

#[no_mangle]
pub extern "C" fn shim_read_register(register_id: u64, buf_ptr: u64, buf_len: u64) -> u32 {
    let reg_id = RegisterId::new(register_id as usize);
    let buffer = unsafe { buffer_mut_from_raw(buf_ptr, buf_len) };
    let result = unsafe { sys::read_register(reg_id, Ref::new(&buffer)) };
    bool_to_u32(result)
}

// ===========================
// Events
// ===========================

#[no_mangle]
pub extern "C" fn shim_emit(
    kind_ptr: u64,
    kind_len: u64,
    data_ptr: u64,
    data_len: u64,
) {
    let kind_bytes = unsafe { core::slice::from_raw_parts(kind_ptr as *const u8, kind_len as usize) };
    let kind_str = unsafe { core::str::from_utf8_unchecked(kind_bytes) };
    let data = unsafe { core::slice::from_raw_parts(data_ptr as *const u8, data_len as usize) };
    
    let data_buffer = Buffer::from(data);
    let event = Event::new(kind_str, &data_buffer);
    
    unsafe {
        sys::emit(Ref::new(&event));
    }
}

#[no_mangle]
pub extern "C" fn shim_emit_with_handler(
    kind_ptr: u64,
    kind_len: u64,
    data_ptr: u64,
    data_len: u64,
    handler_ptr: u64,
    handler_len: u64,
) {
    let kind_bytes = unsafe { core::slice::from_raw_parts(kind_ptr as *const u8, kind_len as usize) };
    let kind_str = unsafe { core::str::from_utf8_unchecked(kind_bytes) };
    let data = unsafe { core::slice::from_raw_parts(data_ptr as *const u8, data_len as usize) };
    let handler = unsafe { core::slice::from_raw_parts(handler_ptr as *const u8, handler_len as usize) };
    
    let data_buffer = Buffer::from(data);
    let handler_buffer = Buffer::from(handler);
    let event = Event::new(kind_str, &data_buffer);
    
    unsafe {
        sys::emit_with_handler(Ref::new(&event), Ref::new(&handler_buffer));
    }
}

// ===========================
// Delta/Commit
// ===========================

#[no_mangle]
pub extern "C" fn shim_commit(
    root_ptr: u64,
    root_len: u64,
    artifact_ptr: u64,
    artifact_len: u64,
) {
    let root = unsafe { core::slice::from_raw_parts(root_ptr as *const u8, root_len as usize) };
    let artifact = unsafe { core::slice::from_raw_parts(artifact_ptr as *const u8, artifact_len as usize) };
    
    unsafe {
        sys::commit(Ref::new(&Buffer::from(root)), Ref::new(&Buffer::from(artifact)));
    }
}

// ===========================
// Time
// ===========================

#[no_mangle]
pub extern "C" fn shim_time_now(buf_ptr: u64, buf_len: u64) {
    let buffer = unsafe { buffer_mut_from_raw(buf_ptr, buf_len) };
    unsafe { sys::time_now(Ref::new(&buffer)) }
}

// ===========================
// Blobs
// ===========================

#[no_mangle]
pub extern "C" fn shim_blob_create() -> u64 {
    let result: PtrSizedInt = unsafe { sys::blob_create() };
    result.as_usize() as u64
}

#[no_mangle]
pub extern "C" fn shim_blob_open(blob_id_ptr: u64, blob_id_len: u64) -> u64 {
    let blob_id = unsafe { core::slice::from_raw_parts(blob_id_ptr as *const u8, blob_id_len as usize) };
    let result: PtrSizedInt = unsafe { sys::blob_open(Ref::new(&Buffer::from(blob_id))) };
    result.as_usize() as u64
}

#[no_mangle]
pub extern "C" fn shim_blob_read(fd: u64, buf_ptr: u64, buf_len: u64) -> u64 {
    let buffer = unsafe { buffer_mut_from_raw(buf_ptr, buf_len) };
    let fd_sized: PtrSizedInt = PtrSizedInt::new(fd as usize);
    let result: PtrSizedInt = unsafe { sys::blob_read(fd_sized, Ref::new(&buffer)) };
    result.as_usize() as u64
}

#[no_mangle]
pub extern "C" fn shim_blob_write(fd: u64, data_ptr: u64, data_len: u64) -> u64 {
    let data = unsafe { core::slice::from_raw_parts(data_ptr as *const u8, data_len as usize) };
    let fd_sized: PtrSizedInt = PtrSizedInt::new(fd as usize);
    let result: PtrSizedInt = unsafe { sys::blob_write(fd_sized, Ref::new(&Buffer::from(data))) };
    result.as_usize() as u64
}

#[no_mangle]
pub extern "C" fn shim_blob_close(fd: u64, blob_id_buf_ptr: u64, blob_id_buf_len: u64) -> u32 {
    let buffer = unsafe { buffer_mut_from_raw(blob_id_buf_ptr, blob_id_buf_len) };
    let fd_sized: PtrSizedInt = PtrSizedInt::new(fd as usize);
    let result = unsafe { sys::blob_close(fd_sized, Ref::new(&buffer)) };
    bool_to_u32(result)
}


