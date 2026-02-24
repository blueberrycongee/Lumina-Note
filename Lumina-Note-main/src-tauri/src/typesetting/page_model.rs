#[derive(Clone, Copy, Debug, PartialEq)]
pub enum PageSize {
    A4,
    Letter,
    Custom { width_mm: f32, height_mm: f32 },
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PageMargins {
    pub top_mm: f32,
    pub right_mm: f32,
    pub bottom_mm: f32,
    pub left_mm: f32,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PageBox {
    pub x_mm: f32,
    pub y_mm: f32,
    pub width_mm: f32,
    pub height_mm: f32,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct PageStyle {
    pub size: PageSize,
    pub margins: PageMargins,
    pub header_height_mm: f32,
    pub footer_height_mm: f32,
}

impl PageSize {
    pub fn dimensions_mm(self) -> PageBox {
        let (width_mm, height_mm) = match self {
            PageSize::A4 => (210.0, 297.0),
            PageSize::Letter => (215.9, 279.4),
            PageSize::Custom {
                width_mm,
                height_mm,
            } => (width_mm, height_mm),
        };

        PageBox {
            x_mm: 0.0,
            y_mm: 0.0,
            width_mm: width_mm.max(0.0),
            height_mm: height_mm.max(0.0),
        }
    }
}

impl PageStyle {
    pub fn page_box(self) -> PageBox {
        self.size.dimensions_mm()
    }

    pub fn body_box(self) -> PageBox {
        let page = self.page_box();
        let left = self.margins.left_mm.max(0.0);
        let right = self.margins.right_mm.max(0.0);
        let top = self.margins.top_mm.max(0.0);
        let bottom = self.margins.bottom_mm.max(0.0);
        let header = self.header_height_mm.max(0.0);
        let footer = self.footer_height_mm.max(0.0);

        let width = (page.width_mm - left - right).max(0.0);
        let height = (page.height_mm - top - bottom - header - footer).max(0.0);

        PageBox {
            x_mm: left,
            y_mm: top + header,
            width_mm: width,
            height_mm: height,
        }
    }

    pub fn header_box(self) -> PageBox {
        let page = self.page_box();
        let left = self.margins.left_mm.max(0.0);
        let right = self.margins.right_mm.max(0.0);
        let top = self.margins.top_mm.max(0.0);
        let header = self.header_height_mm.max(0.0);

        let width = (page.width_mm - left - right).max(0.0);
        let height = header.min((page.height_mm - top).max(0.0));

        PageBox {
            x_mm: left,
            y_mm: top,
            width_mm: width,
            height_mm: height,
        }
    }

    pub fn footer_box(self) -> PageBox {
        let page = self.page_box();
        let left = self.margins.left_mm.max(0.0);
        let right = self.margins.right_mm.max(0.0);
        let bottom = self.margins.bottom_mm.max(0.0);
        let footer = self.footer_height_mm.max(0.0);

        let width = (page.width_mm - left - right).max(0.0);
        let height = footer.min((page.height_mm - bottom).max(0.0));
        let y = (page.height_mm - bottom - height).max(0.0);

        PageBox {
            x_mm: left,
            y_mm: y,
            width_mm: width,
            height_mm: height,
        }
    }

    pub fn header_content_box(self, content_height_mm: f32) -> PageBox {
        let header = self.header_box();
        let content_height = content_height_mm.max(0.0).min(header.height_mm);

        PageBox {
            x_mm: header.x_mm,
            y_mm: header.y_mm,
            width_mm: header.width_mm,
            height_mm: content_height,
        }
    }

    pub fn footer_content_box(self, content_height_mm: f32) -> PageBox {
        let footer = self.footer_box();
        let content_height = content_height_mm.max(0.0).min(footer.height_mm);
        let y = footer.y_mm + (footer.height_mm - content_height);

        PageBox {
            x_mm: footer.x_mm,
            y_mm: y,
            width_mm: footer.width_mm,
            height_mm: content_height,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn approx_eq(value: f32, expected: f32) {
        assert!((value - expected).abs() < 0.01);
    }

    #[test]
    fn a4_dimensions_are_standard_mm() {
        let page = PageSize::A4.dimensions_mm();
        approx_eq(page.width_mm, 210.0);
        approx_eq(page.height_mm, 297.0);
    }

    #[test]
    fn letter_dimensions_are_standard_mm() {
        let page = PageSize::Letter.dimensions_mm();
        approx_eq(page.width_mm, 215.9);
        approx_eq(page.height_mm, 279.4);
    }

    #[test]
    fn body_box_accounts_for_margins_and_header_footer() {
        let style = PageStyle {
            size: PageSize::A4,
            margins: PageMargins {
                top_mm: 10.0,
                right_mm: 12.0,
                bottom_mm: 14.0,
                left_mm: 16.0,
            },
            header_height_mm: 8.0,
            footer_height_mm: 6.0,
        };

        let body = style.body_box();
        approx_eq(body.x_mm, 16.0);
        approx_eq(body.y_mm, 18.0);
        approx_eq(body.width_mm, 182.0);
        approx_eq(body.height_mm, 259.0);
    }

    #[test]
    fn header_content_box_clamps_and_top_aligns() {
        let style = PageStyle {
            size: PageSize::A4,
            margins: PageMargins {
                top_mm: 12.0,
                right_mm: 10.0,
                bottom_mm: 10.0,
                left_mm: 8.0,
            },
            header_height_mm: 6.0,
            footer_height_mm: 4.0,
        };

        let header = style.header_content_box(10.0);
        approx_eq(header.x_mm, 8.0);
        approx_eq(header.y_mm, 12.0);
        approx_eq(header.width_mm, 192.0);
        approx_eq(header.height_mm, 6.0);

        let empty = style.header_content_box(-2.0);
        approx_eq(empty.height_mm, 0.0);
        approx_eq(empty.y_mm, 12.0);
    }

    #[test]
    fn footer_content_box_bottom_aligns_and_clamps() {
        let style = PageStyle {
            size: PageSize::A4,
            margins: PageMargins {
                top_mm: 10.0,
                right_mm: 10.0,
                bottom_mm: 20.0,
                left_mm: 10.0,
            },
            header_height_mm: 6.0,
            footer_height_mm: 12.0,
        };

        let footer = style.footer_content_box(4.0);
        approx_eq(footer.x_mm, 10.0);
        approx_eq(footer.width_mm, 190.0);
        approx_eq(footer.height_mm, 4.0);
        approx_eq(footer.y_mm, 297.0 - 20.0 - 4.0);

        let clamped = style.footer_content_box(30.0);
        approx_eq(clamped.height_mm, 12.0);
        approx_eq(clamped.y_mm, 297.0 - 20.0 - 12.0);
    }
}
