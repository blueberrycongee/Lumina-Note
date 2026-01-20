use crate::typesetting::{
    break_glyph_run, layout_paragraph, shape_mixed_text, FontData, Glyph,
    ParagraphAlign, PositionedLine, ShapingError,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct TextLayoutOptions {
    pub max_width: i32,
    pub line_height: i32,
    pub align: ParagraphAlign,
    pub first_line_indent: i32,
    pub space_before: i32,
    pub space_after: i32,
}

pub fn layout_text_paragraph(
    font: &FontData,
    text: &str,
    options: TextLayoutOptions,
) -> Result<Vec<PositionedLine>, ShapingError> {
    let glyph_run = shape_mixed_text(font, text)?;
    if glyph_run.glyphs.is_empty() {
        return Ok(Vec::new());
    }

    let break_after = break_after_for_text(text, &glyph_run.glyphs);
    let lines =
        break_glyph_run(&glyph_run.glyphs, options.max_width, &break_after);

    Ok(layout_paragraph(
        &lines,
        options.max_width,
        options.line_height,
        options.align,
        &break_after,
        options.first_line_indent,
        options.space_before,
        options.space_after,
    ))
}

fn break_after_for_text(text: &str, glyphs: &[Glyph]) -> Vec<bool> {
    if glyphs.is_empty() {
        return Vec::new();
    }

    let mut break_after = Vec::with_capacity(glyphs.len());
    for glyph in glyphs {
        let index = glyph.cluster as usize;
        let mut can_break = false;
        if index < text.len() && text.is_char_boundary(index) {
            if let Some(ch) = text[index..].chars().next() {
                can_break = ch.is_whitespace();
            }
        }
        break_after.push(can_break);
    }

    break_after
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::typesetting::{shape_mixed_text, FontManager};
    use std::path::PathBuf;

    fn fixture_font_path() -> PathBuf {
        PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("tests")
            .join("fixtures")
            .join("katex-main-regular.ttf")
    }

    fn glyph_with_cluster(cluster: u32) -> Glyph {
        Glyph {
            id: cluster,
            cluster,
            x_advance: 0,
            y_advance: 0,
            x_offset: 0,
            y_offset: 0,
        }
    }

    #[test]
    fn break_after_marks_whitespace_clusters() {
        let text = "a b\tc";
        let glyphs = vec![
            glyph_with_cluster(0),
            glyph_with_cluster(1),
            glyph_with_cluster(2),
            glyph_with_cluster(3),
            glyph_with_cluster(4),
        ];

        let breaks = break_after_for_text(text, &glyphs);

        assert_eq!(breaks, vec![false, true, false, true, false]);
    }

    #[test]
    fn layout_text_paragraph_returns_empty_for_empty_text() {
        let mut manager = FontManager::new();
        let font = manager
            .load_from_path(fixture_font_path())
            .expect("expected valid font load");

        let options = TextLayoutOptions {
            max_width: 1000,
            line_height: 1200,
            align: ParagraphAlign::Left,
            first_line_indent: 0,
            space_before: 0,
            space_after: 0,
        };

        let lines =
            layout_text_paragraph(&font, "", options).expect("layout should work");

        assert!(lines.is_empty());
    }

    #[test]
    fn layout_text_paragraph_builds_single_line_for_large_width() {
        let mut manager = FontManager::new();
        let font = manager
            .load_from_path(fixture_font_path())
            .expect("expected valid font load");
        let text = "Hello world";

        let options = TextLayoutOptions {
            max_width: 100_000,
            line_height: 1200,
            align: ParagraphAlign::Left,
            first_line_indent: 0,
            space_before: 0,
            space_after: 0,
        };

        let lines =
            layout_text_paragraph(&font, text, options).expect("layout should work");
        let glyph_run =
            shape_mixed_text(&font, text).expect("expected shaping to succeed");

        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0].start, 0);
        assert_eq!(lines[0].end, glyph_run.glyphs.len());
    }
}
