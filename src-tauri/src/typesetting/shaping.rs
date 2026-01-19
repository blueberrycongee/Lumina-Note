use crate::typesetting::{FontData, ScriptKind};
use rustybuzz::{Direction, Face, Language, Script, UnicodeBuffer};
use std::str::FromStr;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Glyph {
    pub id: u32,
    pub cluster: u32,
    pub x_advance: i32,
    pub y_advance: i32,
    pub x_offset: i32,
    pub y_offset: i32,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct GlyphRun {
    pub glyphs: Vec<Glyph>,
    pub units_per_em: u16,
}

#[derive(Debug, thiserror::Error)]
pub enum ShapingError {
    #[error("unable to parse font for shaping")]
    InvalidFont,
}

pub fn shape_text(
    font: &FontData,
    text: &str,
    script: ScriptKind,
) -> Result<GlyphRun, ShapingError> {
    if text.is_empty() {
        return Ok(GlyphRun {
            glyphs: Vec::new(),
            units_per_em: font.metrics().units_per_em,
        });
    }

    let face = Face::from_slice(font.bytes(), 0).ok_or(ShapingError::InvalidFont)?;
    let mut buffer = UnicodeBuffer::new();
    buffer.push_str(text);
    buffer.set_direction(Direction::LeftToRight);
    buffer.set_script(match script {
        ScriptKind::Zh => Script::Han,
        ScriptKind::En => Script::Latin,
    });

    let language_tag = match script {
        ScriptKind::Zh => "zh",
        ScriptKind::En => "en",
    };
    if let Some(language) = Language::from_str(language_tag) {
        buffer.set_language(language);
    }

    let output = rustybuzz::shape(&face, &[], buffer);
    let glyphs = output
        .glyph_infos()
        .iter()
        .zip(output.glyph_positions().iter())
        .map(|(info, position)| Glyph {
            id: info.glyph_id,
            cluster: info.cluster,
            x_advance: position.x_advance,
            y_advance: position.y_advance,
            x_offset: position.x_offset,
            y_offset: position.y_offset,
        })
        .collect();

    Ok(GlyphRun {
        glyphs,
        units_per_em: font.metrics().units_per_em,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::typesetting::FontManager;
    use std::path::PathBuf;

    fn fixture_font_path() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests")
            .join("fixtures")
            .join("katex-main-regular.ttf")
    }

    #[test]
    fn shape_text_returns_glyphs_for_basic_latin() {
        let mut manager = FontManager::new();
        let font = manager
            .load_from_path(fixture_font_path())
            .expect("expected valid font load");

        let run = shape_text(&font, "Hello", ScriptKind::En)
            .expect("expected shaping to succeed");

        assert!(!run.glyphs.is_empty());
        assert!(run.glyphs.iter().all(|glyph| glyph.id != 0));
        assert_eq!(run.units_per_em, font.metrics().units_per_em);
    }

    #[test]
    fn shape_text_handles_empty_string() {
        let mut manager = FontManager::new();
        let font = manager
            .load_from_path(fixture_font_path())
            .expect("expected valid font load");

        let run =
            shape_text(&font, "", ScriptKind::En).expect("expected shaping to succeed");

        assert!(run.glyphs.is_empty());
    }
}
