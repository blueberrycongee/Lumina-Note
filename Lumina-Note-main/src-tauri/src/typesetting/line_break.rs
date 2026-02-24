use crate::typesetting::Glyph;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum BreakKind {
    Soft,
    Hard,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct LineBreak {
    pub start: usize,
    pub end: usize,
    pub width: i32,
    pub kind: BreakKind,
}

pub fn break_glyph_run(glyphs: &[Glyph], max_width: i32, break_after: &[bool]) -> Vec<LineBreak> {
    if glyphs.is_empty() {
        return Vec::new();
    }

    let max_width = max_width.max(0);
    let mut lines = Vec::new();
    let mut start = 0usize;
    let mut width = 0i32;
    let mut last_soft_break: Option<(usize, i32)> = None;

    for (i, glyph) in glyphs.iter().enumerate() {
        width = width.saturating_add(glyph.x_advance);
        let can_soft_break = *break_after.get(i).unwrap_or(&false);

        if can_soft_break && width <= max_width {
            last_soft_break = Some((i, width));
        }

        if width > max_width && start < i {
            if let Some((break_index, break_width)) = last_soft_break {
                lines.push(LineBreak {
                    start,
                    end: break_index + 1,
                    width: break_width,
                    kind: BreakKind::Soft,
                });
                start = break_index + 1;
                width -= break_width;
            } else {
                let line_width = width - glyph.x_advance;
                lines.push(LineBreak {
                    start,
                    end: i,
                    width: line_width,
                    kind: BreakKind::Hard,
                });
                start = i;
                width = glyph.x_advance;
            }
            last_soft_break = None;
        }

        if can_soft_break && width <= max_width {
            last_soft_break = Some((i, width));
        }
    }

    if start < glyphs.len() {
        lines.push(LineBreak {
            start,
            end: glyphs.len(),
            width,
            kind: BreakKind::Hard,
        });
    }

    lines
}

#[cfg(test)]
mod tests {
    use super::*;

    fn glyph(id: u32, advance: i32) -> Glyph {
        Glyph {
            id,
            cluster: id,
            x_advance: advance,
            y_advance: 0,
            x_offset: 0,
            y_offset: 0,
        }
    }

    #[test]
    fn breaks_empty_input_into_no_lines() {
        let lines = break_glyph_run(&[], 400, &[]);
        assert!(lines.is_empty());
    }

    #[test]
    fn breaks_oversized_glyphs_one_per_line() {
        let glyphs = vec![glyph(1, 600), glyph(2, 400)];
        let break_after = vec![false, false];

        let lines = break_glyph_run(&glyphs, 500, &break_after);

        assert_eq!(lines.len(), 2);
        assert_eq!(
            lines[0],
            LineBreak {
                start: 0,
                end: 1,
                width: 600,
                kind: BreakKind::Hard,
            }
        );
        assert_eq!(
            lines[1],
            LineBreak {
                start: 1,
                end: 2,
                width: 400,
                kind: BreakKind::Hard,
            }
        );
    }

    #[test]
    fn prefers_soft_breaks_that_fit_within_width() {
        let glyphs = vec![glyph(1, 200), glyph(2, 200), glyph(3, 200), glyph(4, 200)];
        let break_after = vec![false, true, false, true];

        let lines = break_glyph_run(&glyphs, 450, &break_after);

        assert_eq!(lines.len(), 2);
        assert_eq!(
            lines[0],
            LineBreak {
                start: 0,
                end: 2,
                width: 400,
                kind: BreakKind::Soft,
            }
        );
        assert_eq!(
            lines[1],
            LineBreak {
                start: 2,
                end: 4,
                width: 400,
                kind: BreakKind::Hard,
            }
        );
    }

    #[test]
    fn breaks_when_no_soft_opportunity_before_overflow() {
        let glyphs = vec![glyph(1, 200), glyph(2, 200), glyph(3, 200)];
        let break_after = vec![false, false, false];

        let lines = break_glyph_run(&glyphs, 350, &break_after);

        assert_eq!(lines.len(), 3);
        assert_eq!(
            lines[0],
            LineBreak {
                start: 0,
                end: 1,
                width: 200,
                kind: BreakKind::Hard,
            }
        );
        assert_eq!(
            lines[1],
            LineBreak {
                start: 1,
                end: 2,
                width: 200,
                kind: BreakKind::Hard,
            }
        );
        assert_eq!(
            lines[2],
            LineBreak {
                start: 2,
                end: 3,
                width: 200,
                kind: BreakKind::Hard,
            }
        );
    }

    #[test]
    fn keeps_soft_breaks_that_exactly_fit_width() {
        let glyphs = vec![glyph(1, 250), glyph(2, 250), glyph(3, 250)];
        let break_after = vec![false, true, false];

        let lines = break_glyph_run(&glyphs, 500, &break_after);

        assert_eq!(lines.len(), 2);
        assert_eq!(
            lines[0],
            LineBreak {
                start: 0,
                end: 2,
                width: 500,
                kind: BreakKind::Soft,
            }
        );
        assert_eq!(
            lines[1],
            LineBreak {
                start: 2,
                end: 3,
                width: 250,
                kind: BreakKind::Hard,
            }
        );
    }
}
