use crate::typesetting::LineBreak;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ParagraphAlign {
    Left,
    Right,
    Center,
    Justify,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PositionedLine {
    pub start: usize,
    pub end: usize,
    pub width: i32,
    pub x_offset: i32,
    pub y_offset: i32,
    pub justify_gap: i32,
    pub justify_remainder: i32,
    pub space_before: i32,
    pub space_after: i32,
}

pub fn layout_paragraph(
    lines: &[LineBreak],
    max_width: i32,
    line_height: i32,
    align: ParagraphAlign,
    break_after: &[bool],
    first_line_indent: i32,
    space_before: i32,
    space_after: i32,
) -> Vec<PositionedLine> {
    if lines.is_empty() {
        return Vec::new();
    }

    let max_width = max_width.max(0);
    let line_height = line_height.max(0);
    let space_before = space_before.max(0);
    let space_after = space_after.max(0);
    let mut positioned = Vec::with_capacity(lines.len());

    for (index, line) in lines.iter().enumerate() {
        let is_first_line = index == 0;
        let is_last_line = index + 1 == lines.len();
        let indent = if is_first_line { first_line_indent } else { 0 };
        let available_width = (max_width - indent).max(0);
        let (x_offset, justify_gap, justify_remainder) = match align {
            ParagraphAlign::Left => (indent, 0, 0),
            ParagraphAlign::Right => (indent + (available_width - line.width).max(0), 0, 0),
            ParagraphAlign::Center => (indent + ((available_width - line.width) / 2).max(0), 0, 0),
            ParagraphAlign::Justify => {
                if is_last_line || line.width >= available_width {
                    (indent, 0, 0)
                } else {
                    let gap_count = count_justify_gaps(line, break_after);
                    if gap_count <= 0 {
                        (indent, 0, 0)
                    } else {
                        let extra = available_width - line.width;
                        let gap = extra / gap_count;
                        let remainder = extra % gap_count;
                        (indent, gap, remainder)
                    }
                }
            }
        };

        let y_offset = space_before.saturating_add((index as i32).saturating_mul(line_height));
        positioned.push(PositionedLine {
            start: line.start,
            end: line.end,
            width: line.width,
            x_offset,
            y_offset,
            justify_gap,
            justify_remainder,
            space_before: if is_first_line { space_before } else { 0 },
            space_after: if is_last_line { space_after } else { 0 },
        });
    }

    positioned
}

fn count_justify_gaps(line: &LineBreak, break_after: &[bool]) -> i32 {
    let mut count = 0i32;
    for index in line.start..line.end {
        if *break_after.get(index).unwrap_or(&false) {
            count += 1;
        }
    }
    count
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::typesetting::{BreakKind, LineBreak};

    fn line(start: usize, end: usize, width: i32) -> LineBreak {
        LineBreak {
            start,
            end,
            width,
            kind: BreakKind::Hard,
        }
    }

    #[test]
    fn returns_empty_for_no_lines() {
        let placed = layout_paragraph(&[], 400, 20, ParagraphAlign::Left, &[], 0, 0, 0);
        assert!(placed.is_empty());
    }

    #[test]
    fn clamps_offsets_for_overflowing_lines_and_negative_heights() {
        let lines = vec![line(0, 1, 120), line(1, 2, 80)];

        let placed = layout_paragraph(&lines, 100, -10, ParagraphAlign::Right, &[], 0, 0, 0);

        assert_eq!(placed[0].x_offset, 0);
        assert_eq!(placed[1].y_offset, 0);
    }

    #[test]
    fn centers_and_right_aligns_lines() {
        let lines = vec![line(0, 2, 80), line(2, 4, 60)];

        let centered = layout_paragraph(&lines, 100, 20, ParagraphAlign::Center, &[], 0, 0, 0);

        assert_eq!(centered[0].x_offset, 10);
        assert_eq!(centered[1].x_offset, 20);
        assert_eq!(centered[1].y_offset, 20);

        let right = layout_paragraph(&lines, 100, 20, ParagraphAlign::Right, &[], 0, 0, 0);

        assert_eq!(right[0].x_offset, 20);
        assert_eq!(right[1].x_offset, 40);
    }

    #[test]
    fn justifies_non_last_lines_with_gaps() {
        let lines = vec![line(0, 4, 80), line(4, 6, 40)];
        let break_after = vec![false, true, false, true, false, false];

        let placed = layout_paragraph(
            &lines,
            100,
            10,
            ParagraphAlign::Justify,
            &break_after,
            0,
            0,
            0,
        );

        assert_eq!(placed[0].justify_gap, 10);
        assert_eq!(placed[0].justify_remainder, 0);
        assert_eq!(placed[1].justify_gap, 0);
    }

    #[test]
    fn justifies_with_remainder_when_extra_is_not_even() {
        let lines = vec![line(0, 3, 95), line(3, 4, 10)];
        let break_after = vec![true, true, false, false];

        let placed = layout_paragraph(
            &lines,
            100,
            12,
            ParagraphAlign::Justify,
            &break_after,
            0,
            0,
            0,
        );

        assert_eq!(placed[0].justify_gap, 2);
        assert_eq!(placed[0].justify_remainder, 1);
    }

    #[test]
    fn applies_first_line_indent_and_space_before() {
        let lines = vec![line(0, 2, 80), line(2, 4, 60)];

        let placed = layout_paragraph(&lines, 100, 20, ParagraphAlign::Left, &[], 12, 8, 0);

        assert_eq!(placed[0].x_offset, 12);
        assert_eq!(placed[1].x_offset, 0);
        assert_eq!(placed[0].y_offset, 8);
        assert_eq!(placed[1].y_offset, 28);
        assert_eq!(placed[0].space_before, 8);
        assert_eq!(placed[1].space_before, 0);
    }

    #[test]
    fn assigns_space_after_to_last_line() {
        let lines = vec![line(0, 1, 50), line(1, 2, 50)];

        let placed = layout_paragraph(&lines, 100, 10, ParagraphAlign::Left, &[], 0, 0, 16);

        assert_eq!(placed[0].space_after, 0);
        assert_eq!(placed[1].space_after, 16);
    }
}
