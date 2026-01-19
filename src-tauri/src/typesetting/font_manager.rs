use std::{
    collections::HashMap,
    path::{Path, PathBuf},
    sync::Arc,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct FontMetrics {
    pub units_per_em: u16,
    pub ascent: i16,
    pub descent: i16,
    pub line_gap: i16,
}

#[derive(Clone, Debug)]
pub struct FontData {
    bytes: Arc<Vec<u8>>,
    metrics: FontMetrics,
}

impl FontData {
    pub fn bytes(&self) -> &[u8] {
        self.bytes.as_slice()
    }

    pub fn bytes_handle(&self) -> Arc<Vec<u8>> {
        Arc::clone(&self.bytes)
    }

    pub fn metrics(&self) -> &FontMetrics {
        &self.metrics
    }
}

#[derive(Debug, thiserror::Error)]
pub enum FontError {
    #[error("font file io error: {0}")]
    Io(#[from] std::io::Error),
    #[error("font parse error: {0}")]
    Parse(#[from] ttf_parser::FaceParsingError),
}

pub struct FontManager {
    cache: HashMap<PathBuf, FontData>,
}

impl FontManager {
    pub fn new() -> Self {
        Self {
            cache: HashMap::new(),
        }
    }

    pub fn load_from_path<P: AsRef<Path>>(&mut self, path: P) -> Result<FontData, FontError> {
        let path = path.as_ref();
        if let Some(cached) = self.cache.get(path) {
            return Ok(cached.clone());
        }

        let bytes = std::fs::read(path)?;
        let face = ttf_parser::Face::from_slice(&bytes, 0)?;
        let metrics = FontMetrics {
            units_per_em: face.units_per_em(),
            ascent: face.ascender(),
            descent: face.descender(),
            line_gap: face.line_gap(),
        };
        let data = FontData {
            bytes: Arc::new(bytes),
            metrics,
        };
        self.cache.insert(path.to_path_buf(), data.clone());
        Ok(data)
    }

    pub fn cached(&self, path: &Path) -> Option<&FontData> {
        self.cache.get(path)
    }

    pub fn cache_len(&self) -> usize {
        self.cache.len()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    fn fixture_font_path() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests")
            .join("fixtures")
            .join("katex-main-regular.ttf")
    }

    #[test]
    fn load_from_path_caches_bytes_and_metrics() {
        let mut manager = FontManager::new();
        let path = fixture_font_path();

        let first = manager
            .load_from_path(&path)
            .expect("expected valid font load");
        let second = manager
            .load_from_path(&path)
            .expect("expected cached font load");

        assert_eq!(manager.cache_len(), 1);
        assert!(Arc::ptr_eq(&first.bytes_handle(), &second.bytes_handle()));
        assert_eq!(first.metrics(), second.metrics());
        assert!(manager.cached(&path).is_some());
    }

    #[test]
    fn load_from_path_errors_on_missing_file() {
        let mut manager = FontManager::new();
        let missing_path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests")
            .join("fixtures")
            .join("missing-font.ttf");

        let err = manager
            .load_from_path(&missing_path)
            .expect_err("expected missing file error");

        assert!(matches!(err, FontError::Io(_)));
    }

    #[test]
    fn load_from_path_errors_on_invalid_font_data() {
        let mut manager = FontManager::new();
        let mut temp = NamedTempFile::new().expect("temp file");
        temp.write_all(b"not-a-font").expect("write temp");

        let err = manager
            .load_from_path(temp.path())
            .expect_err("expected parse error");

        assert!(matches!(err, FontError::Parse(_)));
    }
}
