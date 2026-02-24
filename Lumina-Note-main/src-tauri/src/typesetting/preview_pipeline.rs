use super::{paginate_flow, PageStyle, PositionedLine, PreviewPageSize};

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

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PreviewPageMetrics {
    pub page_size_px: PreviewPageSize,
    pub body_height_px: i32,
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
            page_lines.push(PreviewLine {
                line_index,
                y_offset,
            });
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

pub fn preview_page_metrics(page_style: PageStyle, dpi: f32) -> PreviewPageMetrics {
    let dpi = normalize_dpi(dpi);
    let page_box = page_style.page_box();
    let body_box = page_style.body_box();
    let page_size_px = PreviewPageSize {
        width_px: mm_to_px(page_box.width_mm, dpi),
        height_px: mm_to_px(page_box.height_mm, dpi),
    };
    let body_height_px = mm_to_px(body_box.height_mm, dpi);

    PreviewPageMetrics {
        page_size_px,
        body_height_px,
    }
}

pub fn build_preview_pages_for_style(
    lines: &[PositionedLine],
    line_height: i32,
    page_style: PageStyle,
    dpi: f32,
) -> (PreviewPageMetrics, Vec<PreviewPage>) {
    let metrics = preview_page_metrics(page_style, dpi);
    let pages = build_preview_pages(lines, line_height, metrics.body_height_px);
    (metrics, pages)
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

const DEFAULT_DPI: f32 = 96.0;

fn normalize_dpi(dpi: f32) -> f32 {
    if dpi.is_finite() && dpi > 0.0 {
        dpi
    } else {
        DEFAULT_DPI
    }
}

fn mm_to_px(value_mm: f32, dpi: f32) -> i32 {
    let mm = value_mm.max(0.0);
    let px = mm * dpi / 25.4;
    if !px.is_finite() {
        return 0;
    }
    let rounded = px.round();
    let clamped = rounded.clamp(0.0, i32::MAX as f32);
    clamped as i32
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::typesetting::{PageMargins, PageSize};

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

    #[test]
    fn metrics_convert_page_and_body_boxes_to_px() {
        let style = PageStyle {
            size: PageSize::A4,
            margins: PageMargins {
                top_mm: 10.0,
                right_mm: 10.0,
                bottom_mm: 10.0,
                left_mm: 10.0,
            },
            header_height_mm: 6.0,
            footer_height_mm: 4.0,
        };

        let page_box = style.page_box();
        let body_box = style.body_box();
        let metrics = preview_page_metrics(style, 96.0);

        assert_eq!(
            metrics.page_size_px.width_px,
            mm_to_px(page_box.width_mm, 96.0)
        );
        assert_eq!(
            metrics.page_size_px.height_px,
            mm_to_px(page_box.height_mm, 96.0)
        );
        assert_eq!(metrics.body_height_px, mm_to_px(body_box.height_mm, 96.0));
    }

    #[test]
    fn metrics_default_dpi_when_invalid() {
        let style = PageStyle {
            size: PageSize::Letter,
            margins: PageMargins {
                top_mm: 0.0,
                right_mm: 0.0,
                bottom_mm: 0.0,
                left_mm: 0.0,
            },
            header_height_mm: 0.0,
            footer_height_mm: 0.0,
        };

        let metrics = preview_page_metrics(style, f32::NAN);
        let page_box = style.page_box();

        assert_eq!(
            metrics.page_size_px.width_px,
            mm_to_px(page_box.width_mm, DEFAULT_DPI)
        );
    }

    #[test]
    fn build_preview_pages_for_style_uses_body_height() {
        let style = PageStyle {
            size: PageSize::Custom {
                width_mm: 50.0,
                height_mm: 50.0,
            },
            margins: PageMargins {
                top_mm: 10.0,
                right_mm: 5.0,
                bottom_mm: 10.0,
                left_mm: 5.0,
            },
            header_height_mm: 10.0,
            footer_height_mm: 10.0,
        };

        let lines = vec![line(0, 1, 0, 0, 0), line(1, 2, 20, 0, 0)];

        let (_metrics, pages) = build_preview_pages_for_style(&lines, 20, style, 96.0);

        assert_eq!(pages.len(), 2);
        assert_eq!(pages[0].start, 0);
        assert_eq!(pages[1].start, 1);
    }
}
