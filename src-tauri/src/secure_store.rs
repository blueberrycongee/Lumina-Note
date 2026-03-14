use tauri::command;

const SERVICE_NAME: &str = "lumina-note";

#[command]
pub fn secure_store_get(key: String) -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(SERVICE_NAME, &key)
        .map_err(|e| format!("Failed to create keyring entry: {}", e))?;
    match entry.get_password() {
        Ok(value) => Ok(Some(value)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("Failed to read from keyring: {}", e)),
    }
}

#[command]
pub fn secure_store_set(key: String, value: String) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE_NAME, &key)
        .map_err(|e| format!("Failed to create keyring entry: {}", e))?;
    entry
        .set_password(&value)
        .map_err(|e| format!("Failed to write to keyring: {}", e))
}

#[command]
pub fn secure_store_delete(key: String) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE_NAME, &key)
        .map_err(|e| format!("Failed to create keyring entry: {}", e))?;
    match entry.delete_credential() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(format!("Failed to delete from keyring: {}", e)),
    }
}
