use super::{paginate_flow, PositionedLine};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PreviewLine {
    pub line_index: usize,
    pub y_offset: i32,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PreviewPage {
    pub page_index: usize,
    pub start: usize,
    pub end: usize,
    pub used_height: i32,
    pub lines: Vec<PreviewLine>,
}

pub fn build_preview_pages(
    lines: &[PositionedLine],
    line_height: i32,
    page_height: i32,
) -> Vec<PreviewPage> {
    if lines.is_empty() {
        return Vec::new();
    }

    let line_heights = line_heights_for_preview(lines, line_height);
    let slices = paginate_flow(&line_heights, page_height);
    let mut pages = Vec::with_capacity(slices.len());

    for (page_index, slice) in slices.iter().enumerate() {
        let base_y = lines
            .get(slice.start)
            .map(|line| line.y_offset)
            .unwrap_or(0);
        let mut page_lines = Vec::with_capacity(slice.end.saturating_sub(slice.start));

        for line_index in slice.start..slice.end {
            let y_offset = lines[line_index].y_offset.saturating_sub(base_y);
            page_lines.push(PreviewLine { line_index, y_offset });
        }

        pages.push(PreviewPage {
            page_index,
            start: slice.start,
            end: slice.end,
            used_height: slice.used_height,
            lines: page_lines,
        });
    }

    pages
}

fn line_heights_for_preview(lines: &[PositionedLine], line_height: i32) -> Vec<i32> {
    let line_height = line_height.max(0);
    let mut heights = Vec::with_capacity(lines.len());

    for (index, line) in lines.iter().enumerate() {
        let mut height = line_height;
        if index == 0 {
            height = height.saturating_add(line.space_before.max(0));
        }
        if index + 1 == lines.len() {
            height = height.saturating_add(line.space_after.max(0));
        }
        heights.push(height);
    }

    heights
}

#[cfg(test)]
mod tests {
    use super::*;

    fn line(
        start: usize,
        end: usize,
        y_offset: i32,
        space_before: i32,
        space_after: i32,
    ) -> PositionedLine {
        PositionedLine {
            start,
            end,
            width: 10,
            x_offset: 0,
            y_offset,
            justify_gap: 0,
            justify_remainder: 0,
            space_before,
            space_after,
        }
    }

    #[test]
    fn returns_empty_pages_for_no_lines() {
        let pages = build_preview_pages(&[], 10, 100);
        assert!(pages.is_empty());
    }

    #[test]
    fn paginates_lines_and_offsets_within_page() {
        let lines = vec![
            line(0, 1, 8, 8, 0),
            line(1, 2, 18, 0, 0),
            line(2, 3, 28, 0, 0),
            line(3, 4, 38, 0, 6),
        ];

        let pages = build_preview_pages(&lines, 10, 30);

        assert_eq!(pages.len(), 2);
        assert_eq!(pages[0].start, 0);
        assert_eq!(pages[0].end, 2);
        assert_eq!(pages[0].used_height, 28);

        assert_eq!(pages[1].start, 2);
        assert_eq!(pages[1].end, 4);
        assert_eq!(pages[1].used_height, 26);
        assert_eq!(pages[1].lines[0].y_offset, 0);
        assert_eq!(pages[1].lines[1].y_offset, 10);
    }
}
