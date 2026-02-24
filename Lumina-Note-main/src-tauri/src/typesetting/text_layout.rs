use crate::typesetting::{
    break_glyph_run, layout_paragraph, shape_mixed_text, FontData, Glyph, GlyphRun, ParagraphAlign,
    PositionedLine, ShapingError,
};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct TextLayoutOptions {
    pub max_width: i32,
    pub line_height: i32,
    pub font_size: Option<i32>,
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

    let glyphs = scale_glyphs_for_font_size(&glyph_run, options.font_size);
    let break_after = break_after_for_text(text, &glyphs);
    let lines = break_glyph_run(&glyphs, options.max_width, &break_after);

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

fn scale_glyphs_for_font_size(glyph_run: &GlyphRun, font_size: Option<i32>) -> Vec<Glyph> {
    let mut glyphs = glyph_run.glyphs.clone();
    let Some(font_size) = font_size else {
        return glyphs;
    };
    if font_size <= 0 {
        return glyphs;
    }
    if glyph_run.units_per_em == 0 {
        return glyphs;
    }
    let scale = font_size as f32 / glyph_run.units_per_em as f32;
    if !scale.is_finite() {
        return glyphs;
    }
    for glyph in &mut glyphs {
        glyph.x_advance = scale_metric(glyph.x_advance, scale);
        glyph.y_advance = scale_metric(glyph.y_advance, scale);
        glyph.x_offset = scale_metric(glyph.x_offset, scale);
        glyph.y_offset = scale_metric(glyph.y_offset, scale);
    }
    glyphs
}

fn scale_metric(value: i32, scale: f32) -> i32 {
    if !scale.is_finite() {
        return value;
    }
    (value as f32 * scale).round() as i32
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
            font_size: None,
            align: ParagraphAlign::Left,
            first_line_indent: 0,
            space_before: 0,
            space_after: 0,
        };

        let lines = layout_text_paragraph(&font, "", options).expect("layout should work");

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
            font_size: None,
            align: ParagraphAlign::Left,
            first_line_indent: 0,
            space_before: 0,
            space_after: 0,
        };

        let lines = layout_text_paragraph(&font, text, options).expect("layout should work");
        let glyph_run = shape_mixed_text(&font, text).expect("expected shaping to succeed");

        assert_eq!(lines.len(), 1);
        assert_eq!(lines[0].start, 0);
        assert_eq!(lines[0].end, glyph_run.glyphs.len());
    }

    #[test]
    fn layout_text_paragraph_scales_width_with_font_size() {
        let mut manager = FontManager::new();
        let font = manager
            .load_from_path(fixture_font_path())
            .expect("expected valid font load");
        let text = "Scaling test";

        let small = layout_text_paragraph(
            &font,
            text,
            TextLayoutOptions {
                max_width: 200_000,
                line_height: 20,
                font_size: Some(16),
                align: ParagraphAlign::Left,
                first_line_indent: 0,
                space_before: 0,
                space_after: 0,
            },
        )
        .expect("layout should work");

        let large = layout_text_paragraph(
            &font,
            text,
            TextLayoutOptions {
                max_width: 200_000,
                line_height: 40,
                font_size: Some(32),
                align: ParagraphAlign::Left,
                first_line_indent: 0,
                space_before: 0,
                space_after: 0,
            },
        )
        .expect("layout should work");

        assert!(!small.is_empty());
        assert!(!large.is_empty());
        let ratio = large[0].width as f32 / small[0].width as f32;
        assert!((ratio - 2.0).abs() < 0.2);
    }
}
