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
    #[error("text offset exceeds u32 for cluster mapping")]
    ClusterOverflow,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
struct ScriptRun {
    script: ScriptKind,
    start: usize,
    end: usize,
}

fn is_cjk_char(ch: char) -> bool {
    matches!(
        ch as u32,
        0x3400..=0x4DBF
            | 0x4E00..=0x9FFF
            | 0xF900..=0xFAFF
            | 0x20000..=0x2A6DF
            | 0x2A700..=0x2B73F
            | 0x2B740..=0x2B81F
            | 0x2B820..=0x2CEAF
            | 0x2CEB0..=0x2EBEF
            | 0x30000..=0x3134F
            | 0x3000..=0x303F
    )
}

fn script_kind_for_char(ch: char) -> ScriptKind {
    if is_cjk_char(ch) {
        ScriptKind::Zh
    } else {
        ScriptKind::En
    }
}

fn split_by_script(text: &str) -> Vec<ScriptRun> {
    let mut runs = Vec::new();
    let mut current_script = None;
    let mut start = 0;

    for (index, ch) in text.char_indices() {
        let script = script_kind_for_char(ch);
        match current_script {
            None => {
                current_script = Some(script);
                start = index;
            }
            Some(current) if current != script => {
                runs.push(ScriptRun {
                    script: current,
                    start,
                    end: index,
                });
                current_script = Some(script);
                start = index;
            }
            _ => {}
        }
    }

    if let Some(script) = current_script {
        runs.push(ScriptRun {
            script,
            start,
            end: text.len(),
        });
    }

    runs
}

fn merge_glyph_runs(
    units_per_em: u16,
    runs: Vec<(usize, GlyphRun)>,
) -> Result<GlyphRun, ShapingError> {
    let mut merged = Vec::new();
    for (start, run) in runs {
        let offset = u32::try_from(start).map_err(|_| ShapingError::ClusterOverflow)?;
        for glyph in run.glyphs {
            let cluster = glyph
                .cluster
                .checked_add(offset)
                .ok_or(ShapingError::ClusterOverflow)?;
            merged.push(Glyph { cluster, ..glyph });
        }
    }

    Ok(GlyphRun {
        glyphs: merged,
        units_per_em,
    })
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

pub fn shape_mixed_text(font: &FontData, text: &str) -> Result<GlyphRun, ShapingError> {
    if text.is_empty() {
        return Ok(GlyphRun {
            glyphs: Vec::new(),
            units_per_em: font.metrics().units_per_em,
        });
    }

    let runs = split_by_script(text);
    if runs.is_empty() {
        return Ok(GlyphRun {
            glyphs: Vec::new(),
            units_per_em: font.metrics().units_per_em,
        });
    }

    let mut shaped_runs = Vec::with_capacity(runs.len());
    for run in runs {
        let slice = &text[run.start..run.end];
        let shaped = shape_text(font, slice, run.script)?;
        shaped_runs.push((run.start, shaped));
    }

    merge_glyph_runs(font.metrics().units_per_em, shaped_runs)
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

    fn glyph_with_cluster(id: u32, cluster: u32) -> Glyph {
        Glyph {
            id,
            cluster,
            x_advance: 0,
            y_advance: 0,
            x_offset: 0,
            y_offset: 0,
        }
    }

    #[test]
    fn split_text_by_script_handles_empty_input() {
        let runs = split_by_script("");
        assert!(runs.is_empty());
    }

    #[test]
    fn split_text_by_script_groups_cjk_and_latin() {
        let text = "Hello\u{4e16}\u{754c}World";
        let runs = split_by_script(text);

        assert_eq!(runs.len(), 3);
        assert_eq!(runs[0].script, ScriptKind::En);
        assert_eq!(&text[runs[0].start..runs[0].end], "Hello");
        assert_eq!(runs[1].script, ScriptKind::Zh);
        assert_eq!(&text[runs[1].start..runs[1].end], "\u{4e16}\u{754c}");
        assert_eq!(runs[2].script, ScriptKind::En);
        assert_eq!(&text[runs[2].start..runs[2].end], "World");
    }

    #[test]
    fn merge_glyph_runs_offsets_clusters() {
        let run_a = GlyphRun {
            glyphs: vec![glyph_with_cluster(1, 0), glyph_with_cluster(2, 2)],
            units_per_em: 1000,
        };
        let run_b = GlyphRun {
            glyphs: vec![glyph_with_cluster(3, 0), glyph_with_cluster(4, 4)],
            units_per_em: 1000,
        };

        let merged = merge_glyph_runs(1000, vec![(0, run_a), (5, run_b)])
            .expect("expected merge to succeed");

        assert_eq!(merged.glyphs.len(), 4);
        assert_eq!(merged.glyphs[2].cluster, 5);
        assert_eq!(merged.glyphs[3].cluster, 9);
        assert_eq!(merged.units_per_em, 1000);
    }

    #[test]
    fn shape_mixed_text_matches_shape_text_for_latin() {
        let mut manager = FontManager::new();
        let font = manager
            .load_from_path(fixture_font_path())
            .expect("expected valid font load");

        let mixed = shape_mixed_text(&font, "Hello")
            .expect("expected shaping to succeed");
        let baseline = shape_text(&font, "Hello", ScriptKind::En)
            .expect("expected shaping to succeed");

        assert_eq!(mixed, baseline);
    }
}
