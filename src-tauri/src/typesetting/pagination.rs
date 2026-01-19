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
}
