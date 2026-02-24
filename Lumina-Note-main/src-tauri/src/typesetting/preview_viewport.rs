#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PreviewPageSize {
    pub width_px: i32,
    pub height_px: i32,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PreviewViewport {
    pub zoom: f32,
    pub page_gap_px: i32,
}

impl PreviewViewport {
    pub fn scaled_page_size(self, page_size: PreviewPageSize) -> PreviewPageSize {
        let zoom = normalize_zoom(self.zoom);
        let width_px = scale_px(page_size.width_px, zoom);
        let height_px = scale_px(page_size.height_px, zoom);

        PreviewPageSize {
            width_px,
            height_px,
        }
    }

    pub fn page_span_px(self, page_size: PreviewPageSize) -> i32 {
        let scaled = self.scaled_page_size(page_size);
        let gap = normalize_gap(self.page_gap_px);
        scaled.height_px.saturating_add(gap)
    }

    pub fn page_top_y(self, page_index: usize, page_size: PreviewPageSize) -> i32 {
        let span = self.page_span_px(page_size);
        if span <= 0 {
            return 0;
        }
        let offset = (page_index as i64).saturating_mul(span as i64);
        clamp_i64_to_i32(offset)
    }

    pub fn total_height(self, page_size: PreviewPageSize, page_count: usize) -> i32 {
        if page_count == 0 {
            return 0;
        }
        let scaled = self.scaled_page_size(page_size);
        let gap = normalize_gap(self.page_gap_px) as i64;
        let height = scaled.height_px.max(0) as i64;
        let pages = page_count as i64;
        let total = pages
            .saturating_mul(height)
            .saturating_add(pages.saturating_sub(1).saturating_mul(gap));
        clamp_i64_to_i32(total)
    }

    pub fn page_index_at_scroll(
        self,
        scroll_y: i32,
        page_size: PreviewPageSize,
        page_count: usize,
    ) -> usize {
        if page_count == 0 {
            return 0;
        }
        let span = self.page_span_px(page_size);
        if span <= 0 {
            return 0;
        }
        let scroll = scroll_y.max(0);
        let index = (scroll / span) as usize;
        index.min(page_count.saturating_sub(1))
    }

    pub fn visible_page_range(
        self,
        scroll_y: i32,
        viewport_height: i32,
        page_size: PreviewPageSize,
        page_count: usize,
    ) -> (usize, usize) {
        if page_count == 0 {
            return (0, 0);
        }
        let start = self.page_index_at_scroll(scroll_y, page_size, page_count);
        let end_scroll = scroll_y.max(0).saturating_add(viewport_height.max(0));
        let end_index = self.page_index_at_scroll(end_scroll, page_size, page_count);
        let mut end = end_index.saturating_add(1);
        if end > page_count {
            end = page_count;
        }
        (start.min(end), end)
    }
}

fn normalize_zoom(zoom: f32) -> f32 {
    if zoom.is_finite() {
        zoom.max(0.1)
    } else {
        1.0
    }
}

fn normalize_gap(gap_px: i32) -> i32 {
    gap_px.max(0)
}

fn scale_px(value_px: i32, zoom: f32) -> i32 {
    let base = value_px.max(0) as f32;
    let scaled = base * zoom;
    if !scaled.is_finite() {
        return 0;
    }
    let rounded = scaled.round();
    let clamped = rounded.clamp(0.0, i32::MAX as f32);
    clamped as i32
}

fn clamp_i64_to_i32(value: i64) -> i32 {
    if value > i32::MAX as i64 {
        i32::MAX
    } else if value < i32::MIN as i64 {
        i32::MIN
    } else {
        value as i32
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn scaled_page_size_applies_zoom_and_clamps_gap() {
        let viewport = PreviewViewport {
            zoom: 1.5,
            page_gap_px: -12,
        };
        let size = PreviewPageSize {
            width_px: 200,
            height_px: 300,
        };

        let scaled = viewport.scaled_page_size(size);

        assert_eq!(scaled.width_px, 300);
        assert_eq!(scaled.height_px, 450);
        assert_eq!(viewport.page_span_px(size), 450);
    }

    #[test]
    fn page_top_y_accounts_for_gap() {
        let viewport = PreviewViewport {
            zoom: 1.0,
            page_gap_px: 10,
        };
        let size = PreviewPageSize {
            width_px: 100,
            height_px: 200,
        };

        assert_eq!(viewport.page_top_y(2, size), 420);
    }

    #[test]
    fn total_height_counts_gaps_between_pages() {
        let viewport = PreviewViewport {
            zoom: 1.0,
            page_gap_px: 10,
        };
        let size = PreviewPageSize {
            width_px: 100,
            height_px: 200,
        };

        assert_eq!(viewport.total_height(size, 0), 0);
        assert_eq!(viewport.total_height(size, 3), 620);
    }

    #[test]
    fn page_index_at_scroll_clamps_to_bounds() {
        let viewport = PreviewViewport {
            zoom: 1.0,
            page_gap_px: 10,
        };
        let size = PreviewPageSize {
            width_px: 100,
            height_px: 200,
        };

        assert_eq!(viewport.page_index_at_scroll(-50, size, 3), 0);
        assert_eq!(viewport.page_index_at_scroll(0, size, 3), 0);
        assert_eq!(viewport.page_index_at_scroll(210, size, 3), 1);
        assert_eq!(viewport.page_index_at_scroll(1000, size, 3), 2);
    }

    #[test]
    fn visible_page_range_spans_visible_pages() {
        let viewport = PreviewViewport {
            zoom: 1.0,
            page_gap_px: 10,
        };
        let size = PreviewPageSize {
            width_px: 100,
            height_px: 200,
        };

        assert_eq!(viewport.visible_page_range(0, 250, size, 3), (0, 2));
        assert_eq!(viewport.visible_page_range(420, 200, size, 3), (2, 3));
        assert_eq!(viewport.visible_page_range(0, 250, size, 1), (0, 1));
    }
}
