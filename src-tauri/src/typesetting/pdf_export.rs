use super::PageStyle;
use thiserror::Error;

#[derive(Debug, Error, PartialEq)]
pub enum PdfExportError {
    #[error("invalid page size")]
    InvalidPageSize,
}

pub fn write_empty_pdf(page_style: PageStyle) -> Result<Vec<u8>, PdfExportError> {
    let page_box = page_style.page_box();
    let width_pt = mm_to_pt(page_box.width_mm);
    let height_pt = mm_to_pt(page_box.height_mm);

    if width_pt <= 0.0 || height_pt <= 0.0 {
        return Err(PdfExportError::InvalidPageSize);
    }

    let mut output = String::new();
    output.push_str("%PDF-1.7\n");

    let mut offsets = vec![0usize; 5];

    offsets[1] =
        write_object(&mut output, 1, "<< /Type /Catalog /Pages 2 0 R >>");
    offsets[2] = write_object(
        &mut output,
        2,
        "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    );

    let page_body = format!(
        "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {:.2} {:.2}] /Contents 4 0 R >>",
        width_pt, height_pt
    );
    offsets[3] = write_object(&mut output, 3, &page_body);

    let contents = "<< /Length 0 >>\nstream\n\nendstream";
    offsets[4] = write_object(&mut output, 4, contents);

    let xref_offset = output.len();
    output.push_str("xref\n");
    output.push_str(&format!("0 {}\n", offsets.len()));
    output.push_str("0000000000 65535 f \n");
    for offset in offsets.iter().skip(1) {
        output.push_str(&format!("{:010} 00000 n \n", offset));
    }
    output.push_str("trailer\n");
    output.push_str(&format!(
        "<< /Size {} /Root 1 0 R >>\n",
        offsets.len()
    ));
    output.push_str("startxref\n");
    output.push_str(&format!("{}\n", xref_offset));
    output.push_str("%%EOF\n");

    Ok(output.into_bytes())
}

fn write_object(output: &mut String, id: usize, body: &str) -> usize {
    let offset = output.len();
    output.push_str(&format!("{} 0 obj\n", id));
    output.push_str(body);
    output.push_str("\nendobj\n");
    offset
}

const POINTS_PER_INCH: f32 = 72.0;
const MM_PER_INCH: f32 = 25.4;

fn mm_to_pt(mm: f32) -> f32 {
    let mm = mm.max(0.0);
    let pt = mm * POINTS_PER_INCH / MM_PER_INCH;
    if pt.is_finite() {
        pt
    } else {
        0.0
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::typesetting::{PageMargins, PageSize};

    fn sample_style(size: PageSize) -> PageStyle {
        PageStyle {
            size,
            margins: PageMargins {
                top_mm: 10.0,
                right_mm: 10.0,
                bottom_mm: 10.0,
                left_mm: 10.0,
            },
            header_height_mm: 8.0,
            footer_height_mm: 6.0,
        }
    }

    #[test]
    fn empty_pdf_contains_header_xref_and_eof() {
        let pdf = write_empty_pdf(sample_style(PageSize::A4)).unwrap();
        let text = String::from_utf8(pdf).unwrap();

        assert!(text.starts_with("%PDF-1.7\n"));
        assert!(text.contains("\nxref\n"));
        assert!(text.ends_with("%%EOF\n"));
    }

    #[test]
    fn media_box_matches_page_size() {
        let style = sample_style(PageSize::Letter);
        let page_box = style.page_box();
        let expected = format!(
            "/MediaBox [0 0 {:.2} {:.2}]",
            mm_to_pt(page_box.width_mm),
            mm_to_pt(page_box.height_mm)
        );

        let pdf = write_empty_pdf(style).unwrap();
        let text = String::from_utf8(pdf).unwrap();

        assert!(text.contains(&expected));
    }

    #[test]
    fn invalid_page_size_errors() {
        let style = sample_style(PageSize::Custom {
            width_mm: 0.0,
            height_mm: 120.0,
        });

        assert_eq!(
            write_empty_pdf(style).unwrap_err(),
            PdfExportError::InvalidPageSize
        );
    }
}
