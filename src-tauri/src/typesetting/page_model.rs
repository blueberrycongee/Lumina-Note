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
            PageSize::Custom { width_mm, height_mm } => (width_mm, height_mm),
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
}
