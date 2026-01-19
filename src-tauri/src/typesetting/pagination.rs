#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct PageSlice {
    pub start: usize,
    pub end: usize,
    pub used_height: i32,
}

pub fn paginate_flow(items: &[i32], page_height: i32) -> Vec<PageSlice> {
    if items.is_empty() {
        return Vec::new();
    }

    let page_height = page_height.max(0);
    let mut pages = Vec::new();
    let mut start = 0usize;
    let mut used = 0i32;

    for (index, raw_height) in items.iter().enumerate() {
        let height = (*raw_height).max(0);
        let next_used = used.saturating_add(height);
        let should_break = height > 0 && used > 0 && next_used > page_height;

        if should_break {
            pages.push(PageSlice {
                start,
                end: index,
                used_height: used,
            });
            start = index;
            used = height;
        } else {
            used = next_used;
        }
    }

    pages.push(PageSlice {
        start,
        end: items.len(),
        used_height: used,
    });

    pages
}

pub fn paginate_lines_with_widows_orphans(
    line_heights: &[i32],
    page_height: i32,
    paragraph_end: &[bool],
    orphans: usize,
    widows: usize,
) -> Vec<PageSlice> {
    let mut pages = paginate_flow(line_heights, page_height);
    if pages.len() < 2 || (orphans == 0 && widows == 0) {
        return pages;
    }

    let page_height = page_height.max(0);
    let prefix = build_prefix_heights(line_heights);
    let line_count = line_heights.len();

    for page_index in 0..pages.len().saturating_sub(1) {
        let page_start = pages[page_index].start;
        let break_index = pages[page_index].end;
        if break_index == 0 || break_index >= line_count {
            continue;
        }

        let (para_start, para_end) =
            find_paragraph_bounds(break_index, line_count, paragraph_end);
        if break_index == para_start || break_index == para_end + 1 {
            continue;
        }

        let lines_before = break_index.saturating_sub(para_start);
        let lines_after = para_end.saturating_add(1).saturating_sub(break_index);
        let needs_adjust = (orphans > 0 && lines_before < orphans)
            || (widows > 0 && lines_after < widows);
        if !needs_adjust {
            continue;
        }

        let candidate = para_start;
        if candidate <= page_start {
            continue;
        }

        let next_end = pages[page_index + 1].end;
        if candidate >= next_end {
            continue;
        }

        let prev_height = height_between(&prefix, page_start, candidate);
        let next_height = height_between(&prefix, candidate, next_end);
        if prev_height > page_height || next_height > page_height {
            continue;
        }

        pages[page_index].end = candidate;
        pages[page_index].used_height = prev_height;
        pages[page_index + 1].start = candidate;
        pages[page_index + 1].used_height = next_height;
    }

    pages
}

fn build_prefix_heights(items: &[i32]) -> Vec<i32> {
    let mut prefix = Vec::with_capacity(items.len() + 1);
    prefix.push(0);
    let mut total = 0i32;
    for height in items.iter().copied() {
        total = total.saturating_add(height.max(0));
        prefix.push(total);
    }
    prefix
}

fn height_between(prefix: &[i32], start: usize, end: usize) -> i32 {
    if start >= end || end >= prefix.len() {
        return 0;
    }
    prefix[end].saturating_sub(prefix[start])
}

fn find_paragraph_bounds(
    break_index: usize,
    line_count: usize,
    paragraph_end: &[bool],
) -> (usize, usize) {
    let mut start = 0usize;
    if break_index > 0 {
        let mut index = break_index - 1;
        loop {
            if *paragraph_end.get(index).unwrap_or(&false) {
                start = index + 1;
                break;
            }
            if index == 0 {
                break;
            }
            index = index.saturating_sub(1);
        }
    }

    let mut end = line_count.saturating_sub(1);
    let mut index = break_index;
    while index < line_count {
        if *paragraph_end.get(index).unwrap_or(&false) {
            end = index;
            break;
        }
        index += 1;
    }

    (start, end)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn returns_empty_for_no_items() {
        let pages = paginate_flow(&[], 120);
        assert!(pages.is_empty());
    }

    #[test]
    fn splits_when_items_overflow_page_height() {
        let pages = paginate_flow(&[10, 10, 10], 25);

        assert_eq!(
            pages,
            vec![
                PageSlice {
                    start: 0,
                    end: 2,
                    used_height: 20
                },
                PageSlice {
                    start: 2,
                    end: 3,
                    used_height: 10
                }
            ]
        );
    }

    #[test]
    fn starts_new_page_after_exact_fit() {
        let pages = paginate_flow(&[10, 15, 5], 25);

        assert_eq!(
            pages,
            vec![
                PageSlice {
                    start: 0,
                    end: 2,
                    used_height: 25
                },
                PageSlice {
                    start: 2,
                    end: 3,
                    used_height: 5
                }
            ]
        );
    }

    #[test]
    fn oversized_item_forms_a_page() {
        let pages = paginate_flow(&[30, 5], 20);

        assert_eq!(
            pages,
            vec![
                PageSlice {
                    start: 0,
                    end: 1,
                    used_height: 30
                },
                PageSlice {
                    start: 1,
                    end: 2,
                    used_height: 5
                }
            ]
        );
    }

    #[test]
    fn ignores_negative_heights_and_keeps_zero_height_with_content() {
        let pages = paginate_flow(&[-5, 0, 6, 0, 6], 10);

        assert_eq!(
            pages,
            vec![
                PageSlice {
                    start: 0,
                    end: 4,
                    used_height: 6
                },
                PageSlice {
                    start: 4,
                    end: 5,
                    used_height: 6
                }
            ]
        );
    }

    #[test]
    fn moves_break_to_paragraph_start_when_widow_would_occur() {
        let line_heights = vec![10, 10, 10, 10];
        let paragraph_end = vec![true, false, false, true];

        let pages = paginate_lines_with_widows_orphans(
            &line_heights,
            30,
            &paragraph_end,
            2,
            2,
        );

        assert_eq!(
            pages,
            vec![
                PageSlice {
                    start: 0,
                    end: 1,
                    used_height: 10
                },
                PageSlice {
                    start: 1,
                    end: 4,
                    used_height: 30
                }
            ]
        );
    }

    #[test]
    fn keeps_break_when_adjustment_overflows_next_page() {
        let line_heights = vec![10, 10, 10, 10, 10, 10, 10];
        let paragraph_end = vec![true, false, false, true, false, false, true];

        let pages = paginate_lines_with_widows_orphans(
            &line_heights,
            30,
            &paragraph_end,
            2,
            2,
        );

        assert_eq!(
            pages,
            vec![
                PageSlice {
                    start: 0,
                    end: 3,
                    used_height: 30
                },
                PageSlice {
                    start: 3,
                    end: 6,
                    used_height: 30
                },
                PageSlice {
                    start: 6,
                    end: 7,
                    used_height: 10
                }
            ]
        );
    }
}
